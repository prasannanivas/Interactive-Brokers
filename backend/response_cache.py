"""
Small in-memory TTL cache for API responses.
Concurrent requests for the same key share one in-flight fetch, so several dashboard
sections asking for the same data at once only hit MongoDB / the market data API once.
"""

import asyncio
import time
from typing import Any, Awaitable, Callable, Dict, Hashable, Tuple

_store: Dict[Hashable, Tuple[float, Any]] = {}
_inflight: Dict[Hashable, asyncio.Future] = {}
MAX_ENTRIES = 500


async def cached(key: Hashable, ttl_seconds: float, fetch: Callable[[], Awaitable[Any]]) -> Any:
    """Return the cached value for key, or await fetch() once and cache it for ttl_seconds"""
    now = time.monotonic()
    hit = _store.get(key)
    if hit and hit[0] > now:
        return hit[1]

    if key in _inflight:
        return await asyncio.shield(_inflight[key])

    future = asyncio.get_running_loop().create_future()
    _inflight[key] = future
    try:
        value = await fetch()
        if len(_store) >= MAX_ENTRIES:
            # Drop expired entries first, then the oldest ones
            for k in [k for k, (exp, _) in _store.items() if exp <= now] or list(_store)[:MAX_ENTRIES // 10]:
                _store.pop(k, None)
        _store[key] = (time.monotonic() + ttl_seconds, value)
        future.set_result(value)
        return value
    except BaseException as e:
        future.set_exception(e)
        future.exception()  # mark retrieved so an unawaited future doesn't log a warning
        raise
    finally:
        _inflight.pop(key, None)


def invalidate(prefix: str = None):
    """Clear cached entries (all, or those whose key starts with prefix)"""
    if prefix is None:
        _store.clear()
        return
    for k in [k for k in _store if isinstance(k, tuple) and k and k[0] == prefix]:
        _store.pop(k, None)
