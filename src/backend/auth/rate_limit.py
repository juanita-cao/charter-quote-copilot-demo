"""
Login rate limiting (design_backend.md §9.4). Not a DEP node — supporting
infrastructure for the login route (T2.9).

LoginRateLimiter is a swappable interface, not a module-level dict, so a
future RedisLoginRateLimiter (if deployment ever moves to multiple instances)
is a drop-in swap with no change to login logic. Email and IP limiting are
two independent instances of the same class with different thresholds —
not two branches of special-cased logic.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Protocol


class LoginRateLimiter(Protocol):
    def is_blocked(self, key: str) -> bool: ...
    def record_failure(self, key: str) -> None: ...
    def reset(self, key: str) -> None: ...


class InMemoryLoginRateLimiter:
    """Single-FastAPI-instance implementation (design_backend.md §9.4,
    Round 7 resolution #4). `now_fn` is injectable for testing window/block
    expiry without real sleeps or a time-mocking dependency; defaults to the
    real clock in production."""

    def __init__(
        self,
        *,
        max_failures: int,
        window_minutes: int,
        block_minutes: int,
        now_fn=lambda: datetime.now(UTC),
    ) -> None:
        self._max_failures = max_failures
        self._window = timedelta(minutes=window_minutes)
        self._block_duration = timedelta(minutes=block_minutes)
        self._now = now_fn
        self._failures: dict[str, list[datetime]] = {}
        self._blocked_until: dict[str, datetime] = {}

    def is_blocked(self, key: str) -> bool:
        blocked_until = self._blocked_until.get(key)
        if blocked_until is None:
            return False
        if self._now() >= blocked_until:
            del self._blocked_until[key]  # block expired — clean up
            return False
        return True

    def record_failure(self, key: str) -> None:
        now = self._now()
        window_start = now - self._window
        timestamps = [t for t in self._failures.get(key, []) if t >= window_start]
        timestamps.append(now)
        self._failures[key] = timestamps
        if len(timestamps) >= self._max_failures:
            self._blocked_until[key] = now + self._block_duration

    def reset(self, key: str) -> None:
        self._failures.pop(key, None)
        self._blocked_until.pop(key, None)
