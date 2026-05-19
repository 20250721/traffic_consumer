#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""针对 issue #22 的最小回归测试。"""

import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import web_ui


class ImmediateThread:
    """同步执行目标函数，避免测试里真的拉起后台线程。"""

    def __init__(self, target=None, args=None, kwargs=None, name=None):
        self.target = target
        self.args = args or ()
        self.kwargs = kwargs or {}
        self.name = name
        self.daemon = False

    def start(self):
        if self.target:
            self.target(*self.args, **self.kwargs)

    def is_alive(self):
        return False

    def join(self, timeout=None):
        return None


class Issue22WebUiTests(unittest.TestCase):
    """验证等待调度态与临时测试入口的关键语义。"""

    def setUp(self):
        self._reset_runtime()

    def tearDown(self):
        self._reset_runtime()

    @staticmethod
    def _reset_runtime():
        """清空全局运行态，避免测试之间互相污染。"""
        web_ui.consumer_instance = None
        web_ui.consumer_thread = None
        web_ui.auto_start_instances.clear()
        web_ui.temp_test_instances.clear()

    def test_build_temporary_test_consumer_kwargs_caps_and_strips_scheduler(self):
        """临时测试必须去掉调度字段，并把流量上限钳制到 100MB。"""
        kwargs = web_ui.build_temporary_test_consumer_kwargs(
            "demo",
            {
                "urls": ["https://example.com/file.bin"],
                "cron_expr": "*/5 * * * *",
                "interval": 15,
                "duration": 3600,
                "count": 99,
                "traffic_limit": 512,
                "auto_start": True,
                "auto_remove_failed_url": True,
            },
        )

        self.assertIsNone(kwargs["cron_expr"])
        self.assertIsNone(kwargs["interval"])
        self.assertIsNone(kwargs["duration"])
        self.assertIsNone(kwargs["count"])
        self.assertFalse(kwargs["auto_start"])
        self.assertFalse(kwargs["auto_remove_failed_url"])
        self.assertEqual(kwargs["traffic_limit"], 100)

    def test_handle_start_emits_scheduled_state_for_scheduler_config(self):
        """当配置带调度参数时，前端状态应明确显示为等待调度。"""
        emit_mock = MagicMock()

        with patch.object(web_ui, "emit", emit_mock), \
             patch.object(web_ui.threading, "Thread", ImmediateThread), \
             patch.object(web_ui.TrafficConsumer, "start", autospec=True, return_value=None):
            web_ui.handle_start(
                {
                    "config_name": "demo",
                    "name": "demo",
                    "urls": ["https://example.com/file.bin"],
                    "threads": 1,
                    "cron_expr": "*/5 * * * *",
                }
            )

        event_name, payload = emit_mock.call_args.args
        self.assertEqual(event_name, "status_update")
        self.assertTrue(payload["running"])
        self.assertEqual(payload["state"], "scheduled")
        self.assertEqual(payload["config"], "demo")

    def test_handle_start_temp_test_pauses_same_scheduler_and_runs_test(self):
        """当当前选中配置正处于等待调度时，允许先暂停计划再跑临时测试。"""
        emit_mock = MagicMock()
        scheduled_consumer = SimpleNamespace(
            config_name="demo",
            active=False,
            threads=1,
            scheduler=SimpleNamespace(running=True),
        )
        web_ui.consumer_instance = scheduled_consumer
        web_ui.consumer_thread = None

        with patch.object(web_ui, "emit", emit_mock), \
             patch.object(web_ui, "stop_runtime_config", return_value=True) as stop_mock, \
             patch.object(web_ui.TrafficConsumer, "load_config", return_value={
                 "urls": ["https://example.com/file.bin"],
                 "cron_expr": "*/5 * * * *",
                 "threads": 1,
             }), \
             patch.object(web_ui.threading, "Thread", ImmediateThread), \
             patch.object(web_ui.TrafficConsumer, "start", autospec=True, return_value=None):
            web_ui.handle_start_temp_test(
                {
                    "config_name": "demo",
                    "name": "demo",
                    "urls": ["https://example.com/file.bin"],
                    "threads": 1,
                    "cron_expr": "*/5 * * * *",
                }
            )

        stop_mock.assert_called_once_with("demo", wait_thread=True)
        event_name, payload = emit_mock.call_args.args
        self.assertEqual(event_name, "status_update")
        self.assertTrue(payload["running"])
        self.assertEqual(payload["state"], "running")
        self.assertIn("最多下载 100 MB", payload["message"])

    def test_auto_start_help_icon_exists_in_template(self):
        """启动自动运行旁边必须保留说明图标，避免再次误导用户。"""
        template = Path("templates/index.html").read_text(encoding="utf-8")
        self.assertIn('aria-label="查看启动自动运行说明"', template)
        self.assertIn('data-bs-toggle="tooltip"', template)
        self.assertIn('bi bi-exclamation-circle', template)
        self.assertIn('若未填写定时，则会立刻执行一次', template)

    def test_launch_auto_start_configs_runs_immediately_without_scheduler(self):
        """未填写定时但勾选自动运行时，程序启动后应立刻执行一次。"""
        emit_mock = MagicMock()

        with patch.object(web_ui, "socketio", SimpleNamespace(emit=emit_mock)), \
             patch.object(web_ui, "find_auto_start_configs", return_value=["demo"]), \
             patch.object(web_ui.TrafficConsumer, "load_config", return_value={
                 "urls": ["https://example.com/file.bin"],
                 "threads": 1,
                 "auto_start": True,
             }), \
             patch.object(web_ui.threading, "Thread", ImmediateThread), \
             patch.object(web_ui.TrafficConsumer, "start", autospec=True, return_value=None):
            started = web_ui.launch_auto_start_configs()

        self.assertTrue(started)
        event_name, payload = emit_mock.call_args.args
        self.assertEqual(event_name, "status_update")
        self.assertEqual(payload["state"], "running")
        self.assertIn("立即执行: demo", payload["message"])

    def test_launch_auto_start_configs_schedules_when_scheduler_exists(self):
        """填写了定时并勾选自动运行时，程序启动后应进入等待调度。"""
        emit_mock = MagicMock()

        with patch.object(web_ui, "socketio", SimpleNamespace(emit=emit_mock)), \
             patch.object(web_ui, "find_auto_start_configs", return_value=["demo"]), \
             patch.object(web_ui.TrafficConsumer, "load_config", return_value={
                 "urls": ["https://example.com/file.bin"],
                 "threads": 1,
                 "cron_expr": "*/5 * * * *",
                 "auto_start": True,
             }), \
             patch.object(web_ui.threading, "Thread", ImmediateThread), \
             patch.object(web_ui.TrafficConsumer, "start", autospec=True, return_value=None):
            started = web_ui.launch_auto_start_configs()

        self.assertTrue(started)
        event_name, payload = emit_mock.call_args.args
        self.assertEqual(event_name, "status_update")
        self.assertEqual(payload["state"], "scheduled")
        self.assertIn("等待调度: demo", payload["message"])


if __name__ == "__main__":
    unittest.main()
