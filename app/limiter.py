#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""基于令牌桶的线程安全限速器。"""

import threading
import time


class RateLimiter:
    """简单的线程安全令牌桶限速器"""

    def __init__(self, rate_bytes_per_sec):
        self.rate = max(0, rate_bytes_per_sec)
        self.tokens = float(self.rate)
        self.last_refill = time.perf_counter()
        self.lock = threading.Lock()

    def acquire(self, num_bytes):
        if self.rate <= 0:
            return

        request_bytes = min(num_bytes, self.rate)

        while True:
            with self.lock:
                self._refill_tokens()

                if self.tokens >= request_bytes:
                    self.tokens -= request_bytes
                    return

                deficit = request_bytes - self.tokens

            sleep_time = deficit / self.rate
            time.sleep(min(sleep_time, 0.5))

    def _refill_tokens(self):
        now = time.perf_counter()
        elapsed = now - self.last_refill
        if elapsed <= 0:
            return

        refill = elapsed * self.rate
        self.tokens = min(self.rate, self.tokens + refill)
        self.last_refill = now

