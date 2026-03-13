#!/usr/bin/env python3
"""
Debug script to investigate missing datasets in collaborations
"""
from pymongo import MongoClient
from bson import ObjectId
import sys

# Main MongoDB connection
MAIN_MONGO_URI = "mongodb+srv://collaborativestudyapp:3amrcBv8RaPxFNP6@collaborativestudy.70fk9ca.mongodb.net/?retryWrites=true&w=majority"

print("=" * 80)
print("DEBUGGING MISSING DATASETS")
print("=" * 80)
print()

client = MongoClient(MAIN_MONGO_URI)
db = client['test']

# Specific collaboration from user's report
collab_uuid = "b75d2bc6-e34a-4d8f-9b23-6a6e994da1a9"
creator_dataset_id = "693677d8bf9209415a8ee9d7"
user_dataset_id = "69367769bf9209415a8ee9d6"

print(f"1. Checking collaboration: {collab_uuid}")
print("-" * 80)
collab = db['collaborations'].find_one({"uuid": collab_uuid})
if collab:
    print(f"   ✅ Found collaboration: {collab.get('name', 'N/A')}")
    print(f"   Creator ID: {collab.get('creator_id')}")
    print(f"   Creator Dataset ID: {collab.get('creator_dataset_id')}")
    print(f"   Invited Users: {len(collab.get('invited_users', []))}")
    for i, user in enumerate(collab.get('invited_users', [])):
        print(f"      User {i+1}: {user.get('user_id')} -> Dataset ID: {user.get('user_dataset_id')}")
else:
    print(f"   ❌ Collaboration not found!")
    sys.exit(1)

print()
print(f"2. Checking Creator Dataset: {creator_dataset_id}")
print("-" * 80)
try:
    creator_ds = db['datasets'].find_one({"_id": ObjectId(creator_dataset_id)})
    if creator_ds:
        print(f"   ✅ Dataset found!")
        print(f"      User ID: {creator_ds.get('user_id')}")
        print(f"      Phenotype: {creator_ds.get('phenotype')}")
        print(f"      Samples: {creator_ds.get('number_of_samples')}")
        print(f"      Is QC Data: {creator_ds.get('is_qc_data', False)}")
        print(f"      Has Data: {'data' in creator_ds and len(creator_ds.get('data', {})) > 0}")
        if 'data' in creator_ds:
            data_len = len(creator_ds.get('data', {}))
            print(f"      Data Size: {data_len} samples")
    else:
        print(f"   ❌ Dataset NOT FOUND in datasets collection!")
        print(f"   Checking if it exists in other collections...")
        
        # Check all collections
        collections = db.list_collection_names()
        found_in = []
        for coll_name in collections:
            try:
                # Try different query formats
                result = db[coll_name].find_one({"_id": ObjectId(creator_dataset_id)})
                if result:
                    found_in.append(coll_name)
            except:
                pass
        if found_in:
            print(f"      Found in: {', '.join(found_in)}")
        else:
            print(f"      ❌ Not found in any collection")
except Exception as e:
    print(f"   ⚠️  Error: {e}")

print()
print(f"3. Checking User Dataset: {user_dataset_id}")
print("-" * 80)
try:
    user_ds = db['datasets'].find_one({"_id": ObjectId(user_dataset_id)})
    if user_ds:
        print(f"   ✅ Dataset found!")
        print(f"      User ID: {user_ds.get('user_id')}")
        print(f"      Phenotype: {user_ds.get('phenotype')}")
        print(f"      Samples: {user_ds.get('number_of_samples')}")
        print(f"      Is QC Data: {user_ds.get('is_qc_data', False)}")
        print(f"      Has Data: {'data' in user_ds and len(user_ds.get('data', {})) > 0}")
        if 'data' in user_ds:
            data_len = len(user_ds.get('data', {}))
            print(f"      Data Size: {data_len} samples")
    else:
        print(f"   ❌ Dataset NOT FOUND in datasets collection!")
except Exception as e:
    print(f"   ⚠️  Error: {e}")

print()
print("4. Checking all datasets for these users")
print("-" * 80)
if collab:
    creator_user_id = str(collab.get('creator_id'))
    creator_datasets = list(db['datasets'].find({"user_id": creator_user_id}))
    print(f"   Creator ({creator_user_id}) has {len(creator_datasets)} datasets:")
    for ds in creator_datasets:
        print(f"      - ID: {ds['_id']}, Phenotype: {ds.get('phenotype')}, QC: {ds.get('is_qc_data', False)}")
    
    if collab.get('invited_users'):
        for user in collab.get('invited_users', []):
            user_id = str(user.get('user_id'))
            user_datasets = list(db['datasets'].find({"user_id": user_id}))
            print(f"   User ({user_id}) has {len(user_datasets)} datasets:")
            for ds in user_datasets:
                print(f"      - ID: {ds['_id']}, Phenotype: {ds.get('phenotype')}, QC: {ds.get('is_qc_data', False)}")

print()
print("5. Checking for datasets with empty or missing data")
print("-" * 80)
empty_datasets = list(db['datasets'].find({
    "$or": [
        {"data": {}},
        {"data": {"$exists": False}},
        {"number_of_samples": "0"}
    ]
}).limit(10))
print(f"   Found {len(empty_datasets)} datasets with empty/missing data (showing first 10):")
for ds in empty_datasets[:5]:
    print(f"      - ID: {ds['_id']}, User: {ds.get('user_id')}, Phenotype: {ds.get('phenotype')}")

print()
print("=" * 80)
print("SUMMARY")
print("=" * 80)
print("If datasets are missing, possible causes:")
print("1. Datasets were created with metadata but never populated with data")
print("2. Datasets were deleted but collaboration references weren't updated")
print("3. Datasets exist but with different IDs (ObjectId conversion issues)")
print("4. Database connection or collection name mismatch")
