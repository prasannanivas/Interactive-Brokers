from pymongo import MongoClient

uri = 'mongodb+srv://Prasanna:3H41Al0q5Uvz976s@db-mongodb-sfo2-83953-82c5177a.mongo.ondigitalocean.com/admin?replicaSet=db-mongodb-sfo2-83953&tls=true&authSource=admin'
client = MongoClient(uri, serverSelectionTimeoutMS=10000)
db = client['trading_monitor']
col = db['daily_signal_snapshots']

total = col.count_documents({})
with_cadusd = col.count_documents({'signals.symbol': 'C:CADUSD'})
print(f'Total snapshots: {total}')
print(f'Snapshots with C:CADUSD data: {with_cadusd}')

latest_with = col.find_one({'signals.symbol': 'C:CADUSD'}, sort=[('snapshot_date', -1)], projection={'snapshot_date': 1})
oldest_with = col.find_one({'signals.symbol': 'C:CADUSD'}, sort=[('snapshot_date', 1)], projection={'snapshot_date': 1})
print('Latest CADUSD snapshot:', latest_with['snapshot_date'] if latest_with else None)
print('Oldest CADUSD snapshot:', oldest_with['snapshot_date'] if oldest_with else None)

# Check a recent snapshot to see if CADUSD is in signals array
recent = col.find_one(sort=[('snapshot_date', -1)])
if recent:
    print('\nMost recent snapshot date:', recent['snapshot_date'])
    symbols = [s['symbol'] for s in recent.get('signals', [])]
    print('Total symbols in latest snapshot:', len(symbols))
    has_cad = 'C:CADUSD' in symbols
    print('C:CADUSD in latest snapshot:', has_cad)
    if not has_cad:
        cad_like = [s for s in symbols if 'CAD' in s]
        print('CAD-related symbols found:', cad_like[:10])
