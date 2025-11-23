#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""流量消耗器全局配置与默认常量。"""

import os

# 默认URL列表
DEFAULT_URLS = [
    "https://img.mcloud.139.com/material_prod/material_media/20221128/1669626861087.png",
    # "https://yun.mcloud.139.com/mCloudPc/v832/mCloud_Setup-001.exe",
    "https://wxhls.mcloud.139.com/hls/M068756c0040acdfc2749d3e70b04f183d/single/video/0/1080/ts/000000.ts",
]

# 配置文件路径
CONFIG_DIR = os.path.join(os.path.expanduser("~"), ".traffic_consumer")
CONFIG_FILE = os.path.join(CONFIG_DIR, "config.json")
STATS_FILE = os.path.join(CONFIG_DIR, "stats.json")

# 默认分块大小
DEFAULT_CHUNK_SIZE = 256 * 1024  # 256KB

