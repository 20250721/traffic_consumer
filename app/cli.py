#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""命令行参数解析与运行逻辑。"""

import argparse

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

    # 创建流量消耗器实例
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
        config_name=args.config
    )
    
    # 如果只是保存配置
    if args.save_config:
        consumer.save_config()
        return
    
    consumer.start()
