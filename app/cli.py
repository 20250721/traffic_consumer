#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""命令行参数解析与运行逻辑。"""

import argparse
import json

from app.config import DEFAULT_URLS
from app.consumer import TrafficConsumer


def parse_args():
    """解析命令行参数"""
    parser = argparse.ArgumentParser(description="流量消耗器 - 用于测试网络带宽和流量消耗")
    
    # 主要参数
    parser.add_argument("-u", "--urls", nargs='+', default=None,
                      help=f"要下载的URL列表，可以指定多个URL (默认: 使用内置的{len(DEFAULT_URLS)}个测试URL)")
    parser.add_argument("--url-strategy", choices=['random', 'round_robin'], default='random',
                      help="URL选择策略: random(随机选择) 或 round_robin(轮询选择) (默认: random)")
    parser.add_argument("-t", "--threads", type=int, default=8,
                      help="下载线程数 (默认: 8)")
    parser.add_argument("-l", "--limit", type=int, default=0,
                      help="下载速度限制，单位MB/s，0表示不限速 (默认: 0)")
    parser.add_argument("-d", "--duration", type=int, default=None,
                      help="持续时间，单位秒 (默认: 无限制)")
    parser.add_argument("-c", "--count", type=int, default=None,
                      help="下载次数 (默认: 无限制)")
    parser.add_argument("--cron", default=None,
                      help="Cron表达式，格式: '分 时 日 月 周'，例如: '0 * * * *' 表示每小时执行一次")
    parser.add_argument("--traffic-limit", type=int, default=None,
                      help="流量限制，单位MB (默认: 无限制)")
    parser.add_argument("--interval", type=int, default=None,
                      help="间隔执行时间，单位分钟，例如: 60 表示每60分钟执行一次 (默认: 无限制)")
    parser.add_argument("--auto-remove-failed-url", action="store_true",
                      help="下载失败超过重试次数后，自动从配置中移除对应URL (默认: 关闭)")
    parser.add_argument("--auto-start", action="store_true",
                      help="保存配置时标记为 Web 启动自启")
    parser.add_argument("--user-agent", default=None,
                      help="自定义下载请求的 User-Agent")
    parser.add_argument("--header", action="append", default=None,
                      help="自定义请求头，格式为 'Header-Name: value'，可重复指定")
    parser.add_argument("--headers-json", default=None,
                      help="以 JSON 对象形式传入自定义请求头，例如 '{\"Referer\":\"https://example.com\"}'")
    parser.add_argument("--url-switch-interval", type=float, default=None,
                      help="单条URL连续下载超过指定秒数后强制切换到下一条 (默认: 不切换)")
    parser.add_argument("--thread-start-delay", type=float, default=None,
                      help="多线程启动间隔，单位秒，用于顺序发起连接 (默认: 0)")
    
    # 配置管理
    parser.add_argument("--config", default="default",
                      help="配置名称 (默认: default)")
    parser.add_argument("--save-config", action="store_true",
                      help="保存当前配置")
    parser.add_argument("--load-config", action="store_true",
                      help="加载指定配置")
    parser.add_argument("--list-configs", action="store_true",
                      help="列出所有保存的配置")
    parser.add_argument("--delete-config", action="store_true",
                      help="删除指定配置")
    
    # 统计数据
    parser.add_argument("--show-stats", action="store_true",
                      help="显示历史统计数据")
    parser.add_argument("--stats-limit", type=int, default=5,
                      help="显示的历史统计数据条数 (默认: 5)")

    # UI
    parser.add_argument("--no-gui", action="store_true",
                      help="不启动Web UI，仅使用命令行")
    
    return parser.parse_args()


def run_cli(args):
    """根据参数执行命令行模式"""
    if args.list_configs:
        TrafficConsumer.list_configs()
        return
    
    if args.delete_config:
        TrafficConsumer.delete_config(args.config)
        return
    
    if args.show_stats:
        TrafficConsumer.show_stats(args.stats_limit)
        return
    
    # 加载配置
    config = TrafficConsumer.load_config(args.config) if args.load_config else None
    
    # 处理URLs参数
    urls = None
    if config:
        # 兼容旧配置格式
        if "urls" in config:
            urls = config["urls"]
        elif "url" in config:
            urls = [config["url"]]  # 将单个URL转换为列表

    if not urls:
        urls = args.urls if args.urls else DEFAULT_URLS

    request_headers = _merge_cli_headers(args.header, args.headers_json)

    # 创建流量消耗器实例
    auto_remove_flag = None
    if config and "auto_remove_failed_url" in config:
        auto_remove_flag = bool(config.get("auto_remove_failed_url"))
    else:
        auto_remove_flag = args.auto_remove_failed_url

    consumer = TrafficConsumer(
        urls=urls,
        url_strategy=config.get("url_strategy", args.url_strategy) if config else args.url_strategy,
        threads=config["threads"] if config and "threads" in config else args.threads,
        limit_speed=config["limit_speed"] if config and "limit_speed" in config else args.limit,
        duration=config["duration"] if config and "duration" in config else args.duration,
        count=config["count"] if config and "count" in config else args.count,
        cron_expr=config["cron_expr"] if config and "cron_expr" in config else args.cron,
        traffic_limit=config["traffic_limit"] if config and "traffic_limit" in config else args.traffic_limit,
        interval=config["interval"] if config and "interval" in config else args.interval,
        config_name=args.config,
        auto_remove_failed_url=auto_remove_flag,
        auto_start=config.get("auto_start", args.auto_start) if config else args.auto_start,
        user_agent=config.get("user_agent", args.user_agent) if config else args.user_agent,
        request_headers=config.get("request_headers", request_headers) if config else request_headers,
        url_switch_interval=config.get("url_switch_interval", args.url_switch_interval) if config else args.url_switch_interval,
        thread_start_delay=config.get("thread_start_delay", args.thread_start_delay) if config else args.thread_start_delay
    )
    
    # 如果只是保存配置
    if args.save_config:
        consumer.save_config()
        return
    
    consumer.start()


def _merge_cli_headers(header_lines, headers_json):
    """合并 CLI 请求头参数，非法行直接忽略，避免一次输错就把程序搞崩。"""
    headers = {}

    if headers_json:
        try:
            parsed = json.loads(headers_json)
            if isinstance(parsed, dict):
                headers.update(parsed)
        except json.JSONDecodeError as exc:
            raise SystemExit(f"--headers-json 不是合法 JSON: {exc}") from exc

    for line in header_lines or []:
        if ":" not in line:
            raise SystemExit(f"--header 必须使用 'Name: value' 格式: {line}")
        name, value = line.split(":", 1)
        headers[name.strip()] = value.strip()

    return headers
