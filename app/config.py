#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""流量消耗器全局配置与默认常量。"""

import os
from pathlib import Path

# 默认URL列表
DEFAULT_URLS = [
    "https://img.mcloud.139.com/material_prod/material_media/20221128/1669626861087.png",
    # "https://yun.mcloud.139.com/mCloudPc/v832/mCloud_Setup-001.exe",
    "https://wxhls.mcloud.139.com/hls/M068756c0040acdfc2749d3e70b04f183d/single/video/0/1080/ts/000000.ts",
]

# 配置文件路径
# 允许通过环境变量显式指定配置目录，方便 Docker / NAS / 打包版把数据落到持久化位置。
_CUSTOM_CONFIG_DIR = os.environ.get("TRAFFIC_CONSUMER_CONFIG_DIR")
if _CUSTOM_CONFIG_DIR:
    CONFIG_DIR = os.path.abspath(os.path.expanduser(_CUSTOM_CONFIG_DIR))
else:
    CONFIG_DIR = os.path.join(str(Path.home()), ".traffic_consumer")

CONFIG_FILE = os.path.join(CONFIG_DIR, "config.json")
STATS_FILE = os.path.join(CONFIG_DIR, "stats.json")

# 默认分块大小
DEFAULT_CHUNK_SIZE = 256 * 1024  # 256KB
