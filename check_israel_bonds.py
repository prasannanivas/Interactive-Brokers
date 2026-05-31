from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
from pprint import pprint

try:
    # Connect to MongoDB with a shorter timeout
    print('Attempting to connect to MongoDB...')
    client = MongoClient('mongodb://localhost:27017', serverSelectionTimeoutMS=5000)
    
    # Test the connection
    client.admin.command('ismaster')
    print('Successfully connected to MongoDB')
    
    db = client['trading_monitor']
    collection = db['bond_yields']
    
    # Query for Israel bond data
    israel_bonds = list(collection.find({'country': 'Israel'}))
    
    # Display results
    print(f'\nFound {len(israel_bonds)} documents for Israel')
    print('=' * 60)
    
    if israel_bonds:
        for i, bond in enumerate(israel_bonds, 1):
            print(f'\nDocument {i}:')
            pprint(bond)
            print('-' * 60)
    else:
        print('No Israel bond data found in the collection.')
    
    # Close connection
    client.close()
    
except (ConnectionFailure, ServerSelectionTimeoutError) as e:
    print(f'ERROR: Could not connect to MongoDB at mongodb://localhost:27017')
    print(f'Please make sure MongoDB is running.')
    print(f'Error details: {e}')
except Exception as e:
    print(f'ERROR: {e}')
