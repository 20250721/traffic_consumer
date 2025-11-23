#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""JSON 配置与统计文件读写工具。"""

import json
import os
from typing import Any, Dict


def ensure_directory_for_file(path: str) -> None:
    """确保目标文件所在目录存在。"""
    directory = os.path.dirname(path)
    if directory:
        os.makedirs(directory, exist_ok=True)


def read_json(path: str) -> Dict[str, Any]:
    """从文件安全读取 JSON，出错时返回空 dict。"""
    if not os.path.exists(path):
        return {}

    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f) or {}
    except Exception:
        return {}


def write_json(path: str, data: Dict[str, Any]) -> None:
    """将字典写回 JSON 文件，保持缩进。"""
    ensure_directory_for_file(path)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
