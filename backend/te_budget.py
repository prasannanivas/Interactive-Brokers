"""
Trading Economics monthly request budget, shared by every live fetcher.

The plan allows TE_MONTHLY_LIMIT requests per calendar month. Every request is counted in
MongoDB (te_usage, one document per month) before it is sent, and lower-priority uses stop
early so the important ones always have room:

    calendar, rate decisions, interest rates  -> up to the full budget
    daily bond yields                         -> up to 90%
    intraday                                  -> up to 60%

TE_RESERVE requests are always kept back for manual use. Once Trading Economics itself
answers "limit exceeded", everything stops until the next month.
"""

import os
import threading
from datetime import datetime

import requests
from pymongo import MongoClient, ReturnDocument

TE_MONTHLY_LIMIT = int(os.getenv('TE_MONTHLY_LIMIT', '500'))
TE_RESERVE = int(os.getenv('TE_RESERVE', '20'))
CEILING = {'calendar': 1.0, 'rate_decisions': 1.0, 'interest_rate': 1.0, 'bond': 0.9, 'intraday': 0.6}

_client = None
_lock = threading.Lock()


class BudgetExceeded(Exception):
    pass


def _coll():
    global _client
    with _lock:
        if _client is None:
            _client = MongoClient(os.getenv('MONGODB_URL', 'mongodb://localhost:27017'),
                                  serverSelectionTimeoutMS=10000)
    return _client[os.getenv('MONGODB_DB_NAME', 'trading_monitor')].te_usage


def _month() -> str:
    return datetime.utcnow().strftime('%Y-%m')


def budget_for(kind: str) -> int:
    return int((TE_MONTHLY_LIMIT - TE_RESERVE) * CEILING.get(kind, 0.9))


def _reserve(kind: str):
    coll, month = _coll(), _month()
    coll.update_one({'_id': month}, {'$setOnInsert': {'count': 0, 'kinds': {}}}, upsert=True)
    doc = coll.find_one_and_update(
        {'_id': month, 'count': {'$lt': budget_for(kind)}, 'quota_hit_at': {'$exists': False}},
        {'$inc': {'count': 1, f'kinds.{kind}': 1}, '$set': {'last_at': datetime.utcnow()}},
        return_document=ReturnDocument.AFTER)
    if doc is None:
        current = coll.find_one({'_id': month}) or {}
        if current.get('quota_hit_at'):
            raise BudgetExceeded('Trading Economics monthly quota reached - paused until next month')
        raise BudgetExceeded(f"Trading Economics budget for {kind} used up this month "
                             f"({current.get('count', 0)}/{TE_MONTHLY_LIMIT} requests)")


def _is_quota_message(resp: requests.Response) -> bool:
    text = resp.text[:300].lower()
    return resp.status_code in (403, 409, 429) and ('exceed' in text or 'limit' in text or 'quota' in text)


def te_get(kind: str, url: str, params: dict = None, timeout: int = 30) -> requests.Response:
    """requests.get for Trading Economics, counted against the monthly budget. Raises BudgetExceeded."""
    _reserve(kind)
    # The key goes in the Authorization header (documented alternative to ?c=), keeping URLs short
    # enough to batch many tickers / countries into one request
    params = dict(params or {})
    key = params.pop('c', None) or params.pop('client', None)
    resp = requests.get(url, params=params, headers={'Authorization': key} if key else None, timeout=timeout)
    if _is_quota_message(resp):
        _coll().update_one({'_id': _month()}, {'$set': {'quota_hit_at': datetime.utcnow(),
                                                        'quota_message': resp.text[:200]}})
    return resp


def usage() -> dict:
    """This month's usage for the dashboard."""
    doc = _coll().find_one({'_id': _month()}) or {}
    return {
        'month': _month(),
        'used': doc.get('count', 0),
        'limit': TE_MONTHLY_LIMIT,
        'reserve': TE_RESERVE,
        'by_kind': doc.get('kinds', {}),
        'budgets': {k: budget_for(k) for k in CEILING},
        'quota_hit': bool(doc.get('quota_hit_at')),
        'quota_message': doc.get('quota_message'),
        'last_at': doc.get('last_at').isoformat() + 'Z' if doc.get('last_at') else None,
    }
