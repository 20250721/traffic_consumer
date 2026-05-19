#!/usr/bin/env python
# -*- coding: utf-8 -*-

import threading
import time
import datetime
import os
import json
import re
import sys
from pathlib import Path
from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit
from croniter import croniter
from colorama import Fore

from app.config import STATS_FILE
from app.consumer import TrafficConsumer

def _bundle_root() -> Path:
    """返回运行时资源根目录；打包版优先使用 PyInstaller 解包目录。"""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)
    return Path(__file__).resolve().parent


BASE_DIR = _bundle_root()

# 初始化 Flask 和 SocketIO
app = Flask(
    __name__,
    template_folder=str(BASE_DIR / "templates"),
    static_folder=str(BASE_DIR / "static"),
)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app, async_mode='threading')

# 全局变量
consumer_instance = None
consumer_thread = None
status_thread = None
status_thread_stop = threading.Event()
consumer_lock = threading.RLock()
log_enabled = False
ANSI_ESCAPE_RE = re.compile(r"\x1B\[[0-9;]*m")
COLOR_TO_CSS = {
    Fore.RED: "#dc3545",
    Fore.YELLOW: "#ffc107",
    Fore.GREEN: "#198754",
    Fore.CYAN: "#0dcaf0",
    Fore.BLUE: "#0d6efd",
    Fore.MAGENTA: "#d63384",
    Fore.WHITE: "#f8f9fa",
}


def strip_ansi(text: str) -> str:
    """移除ANSI颜色码，避免Web端出现控制字符。"""
    if not text:
        return ""
    return ANSI_ESCAPE_RE.sub("", text)

def load_history_from_stats():
    """从stats.json加载历史运行记录"""
    if not os.path.exists(STATS_FILE):
        return []

    try:
        with open(STATS_FILE, 'r', encoding='utf-8') as f:
            stats_data = json.load(f)

        # 创建一个临时实例用于格式化字节数
        temp_consumer = TrafficConsumer()

        # 将stats.json中的每次运行转换为历史记录格式
        history = []
        for run_id, stats in sorted(stats_data.items(), key=lambda x: x[0], reverse=True):
            record = {
                "timestamp": stats.get('end_time') or stats.get('start_time'),
                "result": "成功",  # 保存到stats的都是完成的任务
                "bytes_consumed": temp_consumer.format_bytes(stats.get('total_bytes', 0)),
                "download_count": stats.get('download_count', 0)
            }
            history.append(record)

        # 限制历史记录数量
        return history[:50]
    except Exception as e:
        print(f"加载历史记录失败: {e}")
        return []


def build_consumer_kwargs(config_name, config_data, **callbacks):
    """把前端配置转换为 TrafficConsumer 参数，避免启动和保存两套字段越写越散。"""
    config_data = config_data or {}
    return {
        "urls": config_data.get('urls'),
        "url_strategy": config_data.get('url_strategy'),
        "threads": config_data.get('threads'),
        "limit_speed": config_data.get('limit_speed'),
        "duration": config_data.get('duration'),
        "count": config_data.get('count'),
        "traffic_limit": config_data.get('traffic_limit'),
        "cron_expr": config_data.get('cron_expr'),
        "interval": config_data.get('interval'),
        "config_name": config_name or config_data.get('config_name'),
        "auto_remove_failed_url": config_data.get('auto_remove_failed_url', False),
        "user_agent": config_data.get('user_agent'),
        "request_headers": config_data.get('request_headers'),
        "url_switch_interval": config_data.get('url_switch_interval'),
        "thread_start_delay": config_data.get('thread_start_delay'),
        **callbacks,
    }


def stop_current_consumer(wait_thread=False):
    """停止当前下载与调度器；返回是否确实停止过任务。"""
    global consumer_instance, consumer_thread
    stopped = False

    with consumer_lock:
        if consumer_instance:
            if consumer_instance.active:
                consumer_instance.active = False
                stopped = True
            if consumer_instance.stop_scheduler(wait=False):
                stopped = True

        thread = consumer_thread

    if wait_thread and thread and thread.is_alive():
        thread.join(timeout=3)

    with consumer_lock:
        if consumer_thread and not consumer_thread.is_alive():
            consumer_thread = None

    return stopped

def status_emitter():
    """定期向前端发送状态更新"""
    while not status_thread_stop.is_set():
        if consumer_instance and consumer_instance.active:
            with consumer_instance.lock:
                thread_urls = consumer_instance.url_manager.get_thread_snapshot(consumer_instance.threads)
                url_usage_snapshot = consumer_instance.url_manager.usage_snapshot()
                total_usage = sum(url_usage_snapshot.values())
                url_usage_stats = []
                if consumer_instance.urls:
                    for url in consumer_instance.urls:
                        count = url_usage_snapshot.get(url, 0)
                        percentage = round((count / total_usage) * 100, 1) if total_usage else 0.0
                        url_usage_stats.append({
                            'url': url,
                            'count': count,
                            'percentage': percentage
                        })
                else:
                    for url, count in url_usage_snapshot.items():
                        percentage = round((count / total_usage) * 100, 1) if total_usage else 0.0
                        url_usage_stats.append({
                            'url': url,
                            'count': count,
                            'percentage': percentage
                        })
            status = {
                'total_bytes': consumer_instance.format_bytes(consumer_instance.total_bytes),
                'speed': consumer_instance.format_bytes(consumer_instance.total_bytes / (time.time() - consumer_instance.start_time) if (time.time() - consumer_instance.start_time) > 0 else 0) + '/s',
                'download_count': consumer_instance.download_count,
                'running': True,
                'config': consumer_instance.config_name,
                'thread_count': consumer_instance.threads,
                'thread_status': thread_urls,
                'url_usage_stats': url_usage_stats
            }
            socketio.emit('status_update', status)
        else:
            socketio.emit('status_update', {
                'running': False,
                'thread_status': {},
                'thread_count': consumer_instance.threads if consumer_instance else 0,
                'config': consumer_instance.config_name if consumer_instance else None,
                'url_usage_stats': []
            })
        socketio.sleep(1)

def scheduler_status_emitter():
    """定期向前端发送调度器状态更新"""
    while not status_thread_stop.is_set():
        with consumer_lock:
            instance = consumer_instance

        if instance:
            next_run_time = None
            job_details = None
            if instance.scheduler and instance.scheduler.running:
                job = instance.scheduler.get_job('traffic_consumer_job')
                if job:
                    next_run_time = job.next_run_time.isoformat() if job.next_run_time else None
                    if instance.cron_expr:
                        job_details = f"Cron: {instance.cron_expr}"
                    elif instance.interval:
                        job_details = f"Interval: {instance.interval} minutes"

            # 合并当前实例的历史记录和stats.json中的历史记录
            current_history = instance.stats_manager.history if instance.stats_manager.history else []
            stored_history = load_history_from_stats()

            # 去重并合并（优先使用当前实例的记录）
            all_history = current_history + stored_history
            # 改进去重：将时间戳统一转换为秒级进行比较
            seen_timestamps = set()
            unique_history = []
            for record in all_history:
                ts = record.get('timestamp')
                # 将时间戳标准化到秒级（去掉毫秒和T）
                normalized_ts = ts.replace('T', ' ').split('.')[0] if ts else None
                if normalized_ts not in seen_timestamps:
                    seen_timestamps.add(normalized_ts)
                    unique_history.append(record)

            status = {
                'next_run_time': next_run_time,
                'job_details': job_details,
                'history': unique_history[:50]  # 限制50条
            }
            socketio.emit('scheduler_status_update', status)
        else:
            # 即使没有运行实例，也从stats.json加载历史记录
            stored_history = load_history_from_stats()
            socketio.emit('scheduler_status_update', {
                'next_run_time': None,
                'job_details': None,
                'history': stored_history
            })
        socketio.sleep(2) # 调度器状态不需要太频繁更新

@app.route('/')
def index():
    """渲染主页面"""
    return render_template('index.html')

@app.route('/api/preview_cron', methods=['POST'])
def preview_cron():
    """预览Cron表达式的下5次运行时间"""
    cron_expr = request.json.get('cron_expr')
    if not cron_expr or not croniter.is_valid(cron_expr):
        return jsonify({'error': '无效的Cron表达式'}), 400

    now = datetime.datetime.now()
    try:
        itr = croniter(cron_expr, now)
        next_runs = [itr.get_next(datetime.datetime).isoformat() for _ in range(5)]
        return jsonify(next_runs)
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@socketio.on('connect')
def handle_connect():
    """处理客户端连接"""
    global status_thread
    if status_thread is None or not status_thread.is_alive():
        status_thread_stop.clear()
        status_thread = socketio.start_background_task(target=status_emitter)
        # 启动调度器状态发送任务
        socketio.start_background_task(target=scheduler_status_emitter)
    emit('status_update', {
        'running': consumer_instance.active if consumer_instance else False,
        'thread_status': {},
        'thread_count': consumer_instance.threads if consumer_instance else 0,
        'url_usage_stats': []
    })

@socketio.on('toggle_logs')
def handle_toggle_logs(data):
    """切换日志发送状态"""
    global log_enabled
    log_enabled = data.get('enabled', False)

@socketio.on('start_consumer')
def handle_start(data):
    """启动流量消耗器"""
    global consumer_instance, consumer_thread

    with consumer_lock:
        has_active_scheduler = (
            consumer_instance
            and consumer_instance.scheduler
            and consumer_instance.scheduler.running
        )
        has_active_download = bool(consumer_instance and consumer_instance.active)
        has_live_thread = bool(consumer_thread and consumer_thread.is_alive())

    if has_active_download or (has_live_thread and not has_active_scheduler):
        emit('error', {'message': '流量消耗器已在运行。'})
        return

    # Web 定时任务启动后承载线程会退出，但 BackgroundScheduler 仍在后台运行；
    # 再次启动新配置前必须显式停掉旧计划，否则就会出现用户反馈的“偷偷下载”。
    if has_active_scheduler:
        stop_current_consumer(wait_thread=True)

    def log_emitter(message, color=None):
        if isinstance(message, dict):
            color = message.get('color', color)
            message = message.get('message', '')
        plain_message = strip_ansi(message or '')
        color_value = COLOR_TO_CSS.get(color, color)
        if not log_enabled:
            return
        payload = {'message': plain_message}
        if color_value:
            payload['color'] = color_value
        socketio.emit('log_message', payload)

    def history_emitter(record):
        socketio.emit('history_update', record)

    def invalid_url_emitter(payload):
        socketio.emit('invalid_url', payload)

    config_name = data.get('config_name') or data.get('name')
    consumer_instance = TrafficConsumer(**build_consumer_kwargs(
        config_name,
        data,
        logger=log_emitter,
        history_callback=history_emitter,
        invalid_url_callback=invalid_url_emitter,
    ))

    consumer_thread = threading.Thread(target=consumer_instance.start)
    consumer_thread.daemon = True
    consumer_thread.start()
    emit('status_update', {'running': True, 'message': f'流量消耗器已使用配置启动: {config_name}'})

@socketio.on('stop_consumer')
def handle_stop():
    """停止流量消耗器"""
    global consumer_instance, consumer_thread
    if stop_current_consumer(wait_thread=True):
        emit('status_update', {'running': False, 'message': '流量消耗器已停止。'})
        socketio.emit('scheduler_status_update', {
            'next_run_time': None,
            'job_details': None,
            'history': load_history_from_stats()
        })
    else:
        emit('error', {'message': '流量消耗器未在运行。'})

@socketio.on('stop_scheduler')
def handle_stop_scheduler():
    """停止调度器"""
    global consumer_instance
    if stop_current_consumer(wait_thread=True):
        emit('status_update', {'running': False, 'message': '调度器已停止。'})
        socketio.emit('scheduler_status_update', {
            'next_run_time': None,
            'job_details': None,
            'history': load_history_from_stats()
        })
    else:
        emit('error', {'message': '调度器未在运行。'})

@socketio.on('get_configs')
def handle_get_configs():
    """获取所有配置"""
    configs = TrafficConsumer.load_config('_all_')
    if configs:
        emit('configs_list', {'configs': list(configs.keys())})
    else:
        emit('configs_list', {'configs': []})

@socketio.on('get_config_details')
def handle_get_config_details(data):
    """获取配置详情"""
    config_name = data.get('name')
    target = data.get('target')
    config = TrafficConsumer.load_config(config_name)
    if config:
        emit('config_details', {'name': config_name, 'config': config, 'target': target})

@socketio.on('save_config')
def handle_save_config(data):
    """保存配置"""
    global consumer_instance, consumer_thread
    config_name = data.get('name')
    config_data = data.get('data')

    if not config_name:
        emit('error', {'message': '配置名称不能为空。'})
        return

    # 若正在编辑当前计划，先停止旧 scheduler；仅保存配置不应保留后台旧计划继续运行。
    with consumer_lock:
        is_current_config = (
            consumer_instance
            and consumer_instance.config_name == config_name
            and consumer_instance.scheduler
            and consumer_instance.scheduler.running
        )
    if is_current_config:
        stop_current_consumer(wait_thread=True)

    consumer = TrafficConsumer(**build_consumer_kwargs(config_name, config_data))
    consumer.save_config()
    emit('status_update', {'message': f'配置 "{config_name}" 已保存。'})
    handle_get_configs() # Refresh the list


@socketio.on('delete_config')
def handle_delete_config(data):
    """删除配置，并同步停掉同名运行计划。"""
    config_name = (data or {}).get('name')
    if not config_name:
        emit('error', {'message': '请选择要删除的配置。'})
        return

    with consumer_lock:
        is_current_config = consumer_instance and consumer_instance.config_name == config_name
    if is_current_config:
        stop_current_consumer(wait_thread=True)

    deleted = TrafficConsumer.delete_config(config_name)
    if deleted:
        emit('status_update', {'running': False, 'message': f'配置 "{config_name}" 已删除。'})
        socketio.emit('scheduler_status_update', {
            'next_run_time': None,
            'job_details': None,
            'history': load_history_from_stats()
        })
    else:
        emit('error', {'message': f'配置 "{config_name}" 不存在。'})
    handle_get_configs()

# This file is now imported by traffic_consumer.py
# The main entry point is in traffic_consumer.py
