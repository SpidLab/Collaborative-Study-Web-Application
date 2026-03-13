#!/usr/bin/env python3
"""
QC Worker - Processes QC requests in isolated containers
Supports two modes:
1. Direct mode: Process request from environment variables and exit
2. Warm pod mode: Run HTTP server, accept requests via POST, process and return to waiting
"""
import os
import json
import sys
import requests
import traceback
from pymongo import MongoClient
from bson import ObjectId
from urllib.parse import quote_plus
import pandas as pd
import io
from flask import Flask, request, jsonify
from datetime import datetime

# Import actual QC classes (same as qc_controller.py)
from minor_allele_freq import MAFQualityControl
from hardy_weinberg_qc import HardyWeinbergQC
from missing_data_qc import MissingDataQC
from pca_handler import PCAHandler
from privacy_transform import PrivacyTransform
from gwas_summary import raw_to_gwas_stat, build_stats_dict

# MongoDB Configuration
# CollaboratorDB - for rawdata, qcdata (user-specific data)
MONGO_USERNAME = os.environ.get('MONGO_USERNAME', 'CollaboratorDB')
MONGO_PASSWORD = os.environ.get('MONGO_PASSWORD', 'CollaboratorDB@123')
MONGO_CLUSTER = os.environ.get('MONGO_CLUSTER', 'collaboratordb.68hkp69.mongodb.net')
encoded_password = quote_plus(MONGO_PASSWORD)
MONGO_URI = f"mongodb+srv://{MONGO_USERNAME}:{encoded_password}@{MONGO_CLUSTER}/?retryWrites=true&w=majority"

# Collaborative Study - for collaborations (app.py uses this cluster, NOT CollaboratorDB)
# Set COLLABORATIVE_STUDY_MONGO_URI to the same connection string app.py uses (MONGO_URI)
COLLABORATIVE_STUDY_MONGO_URI = os.environ.get('COLLABORATIVE_STUDY_MONGO_URI', '')
COLLABORATIVE_STUDY_DB = os.environ.get('COLLABORATIVE_STUDY_DB', 'test')

# Flask app for warm pod HTTP server
app = Flask(__name__)

# Initialize PCA handler (for PCA method)
PCA_MODEL_PATH = os.environ.get('PCA_MODEL_PATH', '/app/models')
pca_handler = PCAHandler(models_dir=PCA_MODEL_PATH)

def _run_maf_qc(df, phenotype, params):
    """Run MAF Quality Control (same as qc_controller.py)"""
    threshold = params.get('threshold', 0.05)
    method = params.get('method', 'combined')
    
    temp_file = f"/tmp/maf_input_{datetime.now().timestamp()}.csv"
    df.to_csv(temp_file, index=False)
    
    try:
        maf_qc = MAFQualityControl(
            threshold=threshold,
            method=method,
            verbose=True
        )
        result_df = maf_qc.process_file(input_file=temp_file, output_file=None)
        output_filename = f"{phenotype}_maf_output.csv"
        return result_df, output_filename
    finally:
        if os.path.exists(temp_file):
            os.remove(temp_file)

def _run_hwe_qc(df, phenotype, params):
    """Run Hardy-Weinberg Equilibrium QC"""
    threshold = params.get('threshold', 1e-6)
    population = params.get('population', 'combined')
    method = params.get('method', 'chi2')
    
    temp_file = f"/tmp/hwe_input_{datetime.now().timestamp()}.csv"
    df.to_csv(temp_file, index=False)
    
    try:
        hwe_qc = HardyWeinbergQC(
            threshold=threshold,
            population=population,
            method=method,
            verbose=True
        )
        result_df = hwe_qc.process_file(input_file=temp_file, output_file=None)
        output_filename = f"{phenotype}_hwe_output.csv"
        return result_df, output_filename
    finally:
        if os.path.exists(temp_file):
            os.remove(temp_file)

def _run_missing_qc(df, phenotype, params):
    """Run Missing Data QC"""
    threshold = params.get('threshold', 0.10)
    filter_individuals = params.get('filter_individuals', True)
    filter_snps = params.get('filter_snps', True)
    
    temp_file = f"/tmp/missing_input_{datetime.now().timestamp()}.csv"
    df.to_csv(temp_file, index=False)
    
    try:
        missing_qc = MissingDataQC(
            missing_threshold=threshold,
            filter_individuals=filter_individuals,
            filter_snps=filter_snps,
            verbose=True
        )
        result_df = missing_qc.process_file(input_file=temp_file, output_file=None)
        output_filename = f"{phenotype}_missing_output.csv"
        return result_df, output_filename
    finally:
        if os.path.exists(temp_file):
            os.remove(temp_file)

def _run_pca_qc(df, phenotype, params):
    """Run PCA transformation"""
    model_name = params.get('model_name', 'pca_model')
    add_noise = params.get('add_noise', False)
    epsilon = params.get('epsilon', 1.0)
    
    result = pca_handler.transform_data(
        model_name=model_name,
        data_df=df,
        add_noise=add_noise,
        epsilon=epsilon
    )
    
    if not result['success']:
        raise ValueError(result.get('error', 'PCA transformation failed'))
    
    transformed_data = result['transformed_data']
    
    # Create proper column names
    if df.shape[1] > 0:
        first_col_name = df.columns[0]
        pc_columns = [f"PC_{i+1}" for i in range(transformed_data.shape[1] - 1)]
        column_names = [first_col_name] + pc_columns
    else:
        column_names = [f"PC_{i+1}" for i in range(transformed_data.shape[1])]
    
    result_df = pd.DataFrame(transformed_data, columns=column_names)
    output_filename = f"{phenotype}_pca_output.csv"
    return result_df, output_filename

def _run_privacy_transform(df, phenotype, params):
    """Run Privacy Transform"""
    epsilon = params.get('epsilon', 5.0)
    seed = params.get('seed', 1234)
    num_synthetic = params.get('num_synthetic_samples', 0)
    num_combine = params.get('num_samples_to_combine', 3)
    shuffle = params.get('shuffle', True)
    
    temp_input = f"/tmp/privacy_input_{datetime.now().timestamp()}.csv"
    temp_output = f"/tmp/privacy_output_{datetime.now().timestamp()}.csv"
    
    df.to_csv(temp_input, index=False)
    
    try:
        transformer = PrivacyTransform(
            epsilon=epsilon,
            seed=seed,
            num_synthetic_samples=num_synthetic,
            num_samples_to_combine=num_combine,
            shuffle=shuffle,
            verbose=True
        )
        result_df = transformer.process_file(input_file=temp_input, output_file=temp_output)
        output_filename = f"{phenotype}_privacy_output.csv"
        return result_df, output_filename
    finally:
        if os.path.exists(temp_input):
            os.remove(temp_input)
        if os.path.exists(temp_output):
            os.remove(temp_output)

def send_completion_callback(callback_url, pod_name, user_id, status, results=None, error=None):
    """Send callback to orchestrator when work is complete"""
    if not callback_url:
        print("⚠️ No CALLBACK_URL set, cannot notify orchestrator")
        return
    
    payload = {
        'podName': pod_name,
        'userId': user_id,
        'status': status,
        'results': results or {},
        'error': error
    }
    
    try:
        print(f"📤 Sending completion callback to {callback_url}")
        response = requests.post(callback_url, json=payload, timeout=10)
        print(f"✅ Callback response: {response.status_code}")
    except Exception as e:
        print(f"❌ Failed to send callback: {e}")

def process_qc_request(request_data):
    """
    Process QC request in this isolated container
    
    request_data format:
    {
        "username": "user_name",
        "user_id": "user_id",
        "phenotype": "phenotype_name",
        "method": "maf|hwe|missing|pca|privacy",
        "action": "initialize|create",
        "params": {}
    }
    """
    try:
        username = request_data.get('username')
        user_id = request_data.get('user_id')
        phenotype = request_data.get('phenotype')
        method = request_data.get('method')
        action = request_data.get('action')
        params = request_data.get('params', {})
        
        print(f"\n{'='*60}")
        print(f"QC Request:")
        print(f"  User: {username} (ID: {user_id})")
        print(f"  Phenotype: {phenotype}")
        print(f"  Method: {method}")
        print(f"  Action: {action}")
        print(f"{'='*60}\n")
        
        # Connect to MongoDB (this container's isolated connection)
        try:
            import certifi
            client = MongoClient(
                MONGO_URI,
                serverSelectionTimeoutMS=20000,
                tlsCAFile=certifi.where(),
                tls=True
            )
            client.admin.command('ping')
            print("✅ Connected to MongoDB Atlas")
        except Exception as mongo_err:
            raise Exception(f"MongoDB connection failed: {str(mongo_err)}")
        
        # Get user's database
        user_db = client[username]
        
        if action == 'initialize':
            # Initialize user database with raw data (same logic as qc_controller.py)
            print(f"📥 Initializing user {username} with phenotype {phenotype}")
            
            # Check if this specific phenotype already exists
            filename = f"{phenotype}.csv"
            existing_phenotype = user_db['rawdata'].find_one({"filename": filename})
            
            if existing_phenotype:
                print(f"Phenotype {phenotype} already exists for user {username}")
                result = {
                    "success": True,
                    "message": f"Phenotype {phenotype} already initialized for user {username}",
                    "existing": True,
                    "filename": filename
                }
            else:
                # Load default data - prioritize Docker path, then fallback
                # Priority 1: Docker path (for containerized deployment) - use smaller file for faster initialization
                docker_data_file = '/app/data/data_party_a_small.csv'
                
                # Priority 2: Fallback path
                fallback_data_file = '/app/data/data_party_a_small.csv'  # Same in Docker, but could be different
                
                # Try each path in order
                data_file = None
                if os.path.exists(docker_data_file):
                    data_file = docker_data_file
                    print(f"Using Docker data file: {docker_data_file}")
                elif os.path.exists(fallback_data_file):
                    data_file = fallback_data_file
                    print(f"Using fallback data file: {fallback_data_file}")
                else:
                    raise Exception(f"Default data file not found. Tried:\n1. {docker_data_file}\n2. {fallback_data_file}")
                
                # Read the CSV file
                df = pd.read_csv(data_file)
                csv_content = df.to_csv(index=False)
                
                # Create document for rawdata collection
                raw_doc = {
                    "filename": filename,
                    "phenotype": phenotype,
                    "data": csv_content,
                    "rows": len(df),
                    "columns": len(df.columns),
                    "column_names": df.columns.tolist(),
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow()
                }
                
                # Insert into rawdata collection (upsert based on filename)
                user_db['rawdata'].update_one(
                    {"filename": filename},
                    {"$set": raw_doc},
                    upsert=True
                )
                
                # Create qcdata metadata for this phenotype (upsert to avoid duplicates)
                user_db['qcdata'].update_one(
                    {"type": "metadata", "phenotype": phenotype},
                    {"$set": {
                        "type": "metadata",
                        "created_at": datetime.utcnow(),
                        "phenotype": phenotype
                    }},
                    upsert=True
                )
                
                print(f"Initialized user {username} with phenotype {phenotype}")
                
                result = {
                    "success": True,
                    "message": f"User {username} initialized successfully",
                    "database": username,
                    "rawdata_file": filename,
                    "rows": len(df),
                    "columns": len(df.columns)
                }
            
        elif action == 'create':
            # Create QC dataset using actual QC methods
            print(f"🔬 Running {method} QC for {username} on {phenotype}")
            
            # Get raw data
            raw_doc = user_db['rawdata'].find_one({"phenotype": phenotype})
            if not raw_doc:
                raw_doc = user_db['rawdata'].find_one({"filename": f"{phenotype}.csv"})
            
            if not raw_doc:
                raise Exception(f"No raw data found for phenotype {phenotype}")
            
            # Parse CSV
            df = pd.read_csv(io.StringIO(raw_doc['data']))
            print(f"📊 Input data: {df.shape[0]} samples × {df.shape[1]} columns")
            
            # Get params from request_data
            params = request_data.get('params', {})
            
            # Run the actual QC method (same logic as qc_controller.py)
            if method == 'maf':
                result_df, output_filename = _run_maf_qc(df, phenotype, params)
            elif method == 'hwe':
                result_df, output_filename = _run_hwe_qc(df, phenotype, params)
            elif method == 'missing':
                result_df, output_filename = _run_missing_qc(df, phenotype, params)
            elif method == 'pca':
                result_df, output_filename = _run_pca_qc(df, phenotype, params)
            elif method == 'privacy':
                result_df, output_filename = _run_privacy_transform(df, phenotype, params)
            else:
                raise Exception(f"Unknown QC method: {method}")
            
            # Store the result in qcdata collection
            csv_content = result_df.to_csv(index=True)
            qc_doc = {
                "filename": output_filename,
                "phenotype": phenotype,
                "method": method,
                "data": csv_content,
                "rows": len(result_df),
                "columns": len(result_df.columns),
                "column_names": result_df.columns.tolist(),
                "source_file": f"{phenotype}.csv",
                "params": params,
                "created_at": datetime.utcnow()
            }
            
            user_db['qcdata'].update_one(
                {"filename": output_filename},
                {"$set": qc_doc},
                upsert=True
            )
            
            # Don't send full CSV in callback (too large) - data is already in MongoDB
            # Flask will fetch from MongoDB when needed
            result = {
                "success": True,
                "method": method,
                "output_filename": output_filename,
                "input_shape": [df.shape[0], df.shape[1]],
                "output_shape": [result_df.shape[0], result_df.shape[1]],
                "data": csv_content  # Keep for backward compatibility, but may be truncated if too large
            }
            
            # If data is too large, don't include it in callback
            # Flask will fetch from MongoDB using output_filename
            if len(csv_content) > 10 * 1024 * 1024:  # > 10MB
                print(f"⚠️  Result data too large ({len(csv_content)} bytes), excluding from callback")
                result["data"] = ""  # Empty - Flask will fetch from MongoDB
                result["data_in_mongodb"] = True
                result["mongodb_filename"] = output_filename
        
        elif action == 'listing':
            # List all QC output files for a user
            print(f"📋 Listing QC files for {username}")
            
            # Get all documents from qcdata collection
            qc_docs = user_db['qcdata'].find({"type": {"$ne": "metadata"}}, {"filename": 1, "_id": 0})
            filenames = [doc['filename'] for doc in qc_docs if 'filename' in doc]
            
            result = {
                "success": True,
                "username": username,
                "files": filenames,
                "count": len(filenames)
            }
        
        elif action == 'create_gwas_summary':
            # Create GWAS stat summary from raw data using QC-filtered sample list
            print(f"📊 Creating GWAS summary for {username} on {phenotype}")
            sample_ids = params.get('sample_ids', [])
            collaboration_uuid = params.get('collaboration_uuid')
            if not sample_ids:
                raise Exception("sample_ids (QC-filtered sample list) is required for GWAS summary creation")
            if not collaboration_uuid:
                raise Exception("collaboration_uuid is required for GWAS summary creation")

            # Get raw data
            raw_doc = user_db['rawdata'].find_one({"phenotype": phenotype})
            if not raw_doc:
                raw_doc = user_db['rawdata'].find_one({"filename": f"{phenotype}.csv"})
            if not raw_doc:
                raise Exception(f"No raw data found for phenotype {phenotype}")

            df = pd.read_csv(io.StringIO(raw_doc['data']), index_col=0)
            df.index = df.index.astype(str)
            print(f"📊 Raw data: {df.shape[0]} samples × {df.shape[1]} columns, filtering to {len(sample_ids)} samples")

            # Convert to stat format - use case_ids.txt / control_ids.txt (O(1) set lookup)
            case_ids_path = params.get('case_ids_path') or os.path.join(os.path.dirname(__file__), 'case_ids.txt')
            control_ids_path = params.get('control_ids_path') or os.path.join(os.path.dirname(__file__), 'control_ids.txt')
            snp_ids_to_include = params.get('snp_ids_to_include')
            stat_df = raw_to_gwas_stat(
                df, sample_ids,
                case_ids_path=case_ids_path,
                control_ids_path=control_ids_path,
                snp_ids_to_include=snp_ids_to_include,
                phenotype_col=params.get('phenotype_col'),
                phenotype_sample_map=params.get('phenotype_sample_map'),
            )
            user_stats = build_stats_dict(stat_df)

            # Store in collaboration DB (Collaborative Study cluster - same as app.py, NOT CollaboratorDB)
            if not COLLABORATIVE_STUDY_MONGO_URI:
                raise Exception(
                    "COLLABORATIVE_STUDY_MONGO_URI must be set for GWAS dataset creation. "
                    "Use the same MongoDB URI as app.py (Collaborative Study cluster)."
                )
            try:
                import certifi
                collab_client = MongoClient(
                    COLLABORATIVE_STUDY_MONGO_URI,
                    serverSelectionTimeoutMS=20000,
                    tlsCAFile=certifi.where(),
                    tls=True
                )
                collab_client.admin.command('ping')
            except Exception as collab_err:
                raise Exception(f"Failed to connect to Collaborative Study DB: {collab_err}")
            coll = collab_client[COLLABORATIVE_STUDY_DB]['collaborations']
            user_id_str = str(user_id)
            update_result = coll.update_one(
                {"uuid": collaboration_uuid},
                {"$set": {f"stats.{user_id_str}": user_stats}},
                upsert=False
            )
            if update_result.matched_count == 0:
                raise Exception(f"Collaboration {collaboration_uuid} not found")

            # Also produce CSV for optional callback
            csv_content = stat_df.to_csv(index=False)
            result = {
                "success": True,
                "action": "create_gwas_summary",
                "user_id": user_id,
                "snp_count": len(user_stats),
                "sample_count": len(sample_ids),
                "data": csv_content if len(csv_content) < 10 * 1024 * 1024 else ""  # Skip if >10MB
            }
            print(f"✅ GWAS summary created: {len(user_stats)} SNPs stored for user {user_id}")

        elif action == 'create_chained':
            # Chain multiple QC methods sequentially on a single user's raw data
            methods = params.get('methods', [])  # [{method, params}, ...]
            collaboration_uuid = params.get('collaboration_uuid')
            dataset_id = params.get('dataset_id')
            if not methods:
                raise Exception("methods list is required for chained QC")
            if not collaboration_uuid:
                raise Exception("collaboration_uuid is required for chained QC")

            # Chaining order: Missing -> MAF -> HWE -> PCA
            METHOD_ORDER = {'missing': 0, 'maf': 1, 'hwe': 2, 'pca': 3}
            # Map display names to method IDs
            NAME_TO_ID = {
                'Missing Data QC': 'missing', 'missing': 'missing',
                'Minor Allele Frequency (MAF)': 'maf', 'MAF': 'maf', 'maf': 'maf',
                'Hardy-Weinberg Equilibrium (HWE)': 'hwe', 'HWE': 'hwe', 'hwe': 'hwe',
                'Population Stratification (PCA)': 'pca', 'PCA': 'pca', 'pca': 'pca',
            }
            # Sort methods by chaining order
            sorted_methods = sorted(methods, key=lambda m: METHOD_ORDER.get(NAME_TO_ID.get(m.get('method', ''), ''), 99))

            # Get raw data
            raw_doc = user_db['rawdata'].find_one({"phenotype": phenotype})
            if not raw_doc:
                raw_doc = user_db['rawdata'].find_one({"filename": f"{phenotype}.csv"})
            if not raw_doc:
                raise Exception(f"No raw data found for phenotype {phenotype}")

            df = pd.read_csv(io.StringIO(raw_doc['data']))
            print(f"📊 Chained QC: starting with {df.shape[0]} samples × {df.shape[1]} columns")
            print(f"📊 Methods to chain: {[m['method'] for m in sorted_methods]}")

            for step in sorted_methods:
                method_name = step.get('method', '')
                method_id = NAME_TO_ID.get(method_name, method_name.lower())
                method_params = step.get('params', {})
                print(f"  🔗 Running {method_name} (id={method_id})...")

                if method_id == 'missing':
                    result_df, _ = _run_missing_qc(df, phenotype, method_params)
                elif method_id == 'maf':
                    result_df, _ = _run_maf_qc(df, phenotype, method_params)
                elif method_id == 'hwe':
                    result_df, _ = _run_hwe_qc(df, phenotype, method_params)
                elif method_id == 'pca':
                    result_df, _ = _run_pca_qc(df, phenotype, method_params)
                else:
                    print(f"  ⚠️ Unknown filter method {method_name}, skipping")
                    continue

                df = result_df
                print(f"  ✅ After {method_name}: {df.shape[0]} samples × {df.shape[1]} columns")

            # Extract surviving samples and SNPs from the final filtered DataFrame
            # First column is typically ID/index, rest are SNPs
            if df.columns[0].lower() in ('', 'unnamed: 0', 'sample_id', 'individual_id'):
                surviving_samples = [str(x) for x in df.iloc[:, 0].tolist()]
                surviving_snps = [str(c) for c in df.columns[1:]]
            else:
                surviving_samples = [str(x) for x in df.index.tolist()]
                surviving_snps = [str(c) for c in df.columns.tolist()]

            # Store filtered data in qcdata collection
            csv_content = df.to_csv(index=False)
            output_filename = f"{phenotype}_chained_qc_output.csv"
            qc_doc = {
                "filename": output_filename,
                "phenotype": phenotype,
                "method": "chained",
                "data": csv_content,
                "rows": len(df),
                "columns": len(df.columns),
                "column_names": df.columns.tolist(),
                "created_at": datetime.utcnow()
            }
            user_db['qcdata'].update_one(
                {"filename": output_filename},
                {"$set": qc_doc},
                upsert=True
            )

            # Store surviving lists (and optionally cleaned dataset) in Collaborative Study DB
            if COLLABORATIVE_STUDY_MONGO_URI:
                try:
                    import certifi
                    collab_client = MongoClient(
                        COLLABORATIVE_STUDY_MONGO_URI,
                        serverSelectionTimeoutMS=20000,
                        tlsCAFile=certifi.where(),
                        tls=True
                    )
                    collab_client.admin.command('ping')
                    coll = collab_client[COLLABORATIVE_STUDY_DB]['collaborations']
                    datasets_coll = collab_client[COLLABORATIVE_STUDY_DB]['datasets']
                    user_id_str = str(user_id)
                    coll.update_one(
                        {"uuid": collaboration_uuid},
                        {"$set": {
                            f"surviving_snps.{user_id_str}": surviving_snps,
                            f"surviving_samples.{user_id_str}": surviving_samples,
                        }},
                        upsert=False
                    )
                    print(f"✅ Stored surviving lists: {len(surviving_snps)} SNPs, {len(surviving_samples)} samples")

                    # Also update the user's dataset in the Collaborative Study DB with cleaned data,
                    # so downstream pairwise QC uses the filtered dataset (important for auto-QC flow).
                    if dataset_id:
                        try:
                            cleaned_df = df.copy()
                            first_col = str(cleaned_df.columns[0]).lower()
                            if first_col in ('', 'unnamed: 0', 'sample_id', 'individual_id'):
                                cleaned_df = cleaned_df.set_index(cleaned_df.columns[0])
                            cleaned_df.index = cleaned_df.index.astype(str)
                            data_dict = {str(sample_id): row.to_dict() for sample_id, row in cleaned_df.iterrows()}
                            datasets_coll.update_one(
                                {"_id": ObjectId(str(dataset_id))},
                                {"$set": {"data": data_dict}},
                                upsert=False
                            )
                            print(f"✅ Updated dataset {dataset_id} with cleaned data ({len(data_dict)} samples)")
                        except Exception as ds_err:
                            print(f"⚠️ Failed to update cleaned dataset {dataset_id}: {ds_err}")
                except Exception as collab_err:
                    print(f"⚠️ Failed to store surviving lists in Collaborative Study DB: {collab_err}")

            result = {
                "success": True,
                "action": "create_chained",
                "surviving_snps": surviving_snps,
                "surviving_samples": surviving_samples,
                "snp_count": len(surviving_snps),
                "sample_count": len(surviving_samples),
                "data": csv_content if len(csv_content) < 10 * 1024 * 1024 else ""
            }
            print(f"✅ Chained QC complete: {len(surviving_snps)} SNPs, {len(surviving_samples)} samples survive")

        elif action == 'get':
            # Get specific file data from qcdata or rawdata collection
            filename = params.get('filename')
            if not filename:
                raise Exception("params.filename is required for get action")
            
            print(f"📥 Getting file {filename} for {username}")
            
            # Try qcdata first
            doc = user_db['qcdata'].find_one({"filename": filename})
            if not doc:
                # Try rawdata collection
                doc = user_db['rawdata'].find_one({"filename": filename})
            
            if not doc:
                raise Exception(f"File {filename} not found")
            
            result = {
                "success": True,
                "filename": filename,
                "data": doc['data'],
                "rows": doc.get('rows'),
                "columns": doc.get('columns'),
                "created_at": str(doc.get('created_at', ''))
            }
        
        else:
            raise Exception(f"Unknown action: {action}")
        
        print(f"✅ QC processing complete")
        return result
        
    except Exception as e:
        print(f"❌ Error processing QC request: {str(e)}")
        traceback.print_exc()
        raise

# HTTP endpoint for warm pods to receive requests
@app.route('/process', methods=['POST'])
def handle_request():
    """Handle QC request from orchestrator (warm pod mode)"""
    try:
        data = request.json
        if not data:
            return jsonify({"error": "No JSON data provided"}), 400
        
        pod_name = os.environ.get('POD_NAME', 'unknown')
        callback_url = os.environ.get('CALLBACK_URL')
        
        request_data = data.get('request_data')
        user_id = data.get('user_id')
        request_id = data.get('request_id')
        
        if not request_data or not user_id:
            return jsonify({"error": "Missing request_data or user_id"}), 400
        
        print(f"\n🔥 [Warm Pod] Received request {request_id} for user {user_id}")
        
        # Process in background (for async, but we'll do sync for now)
        try:
            results = process_qc_request(request_data)
            send_completion_callback(callback_url, pod_name, user_id, 'success', results=results)
            return jsonify({
                "success": True,
                "message": "Request processed successfully",
                "request_id": request_id
            }), 200
        except Exception as e:
            error_msg = str(e)
            print(f"❌ Processing failed: {error_msg}")
            send_completion_callback(callback_url, pod_name, user_id, 'failed', error=error_msg)
            return jsonify({
                "success": False,
                "error": error_msg,
                "request_id": request_id
            }), 500
            
    except Exception as e:
        print(f"❌ Error handling request: {str(e)}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({"status": "ready", "pod": os.environ.get('POD_NAME', 'unknown')}), 200

def run_warm_pod_server():
    """Run HTTP server for warm pod mode"""
    port = int(os.environ.get('WORKER_PORT', '8080'))
    pod_name = os.environ.get('POD_NAME', 'unknown')
    
    print("=" * 60)
    print("QC WORKER - WARM POD MODE")
    print("=" * 60)
    print(f"Pod Name: {pod_name}")
    print(f"Listening on port {port}")
    print("Ready to accept QC requests via HTTP POST /process")
    print("=" * 60)
    
    # Run Flask server (accessible from orchestrator)
    app.run(host='0.0.0.0', port=port, debug=False)

def run_direct_mode():
    """Run in direct mode (process request from env vars and exit)"""
    print("=" * 60)
    print("QC WORKER - DIRECT MODE")
    print("=" * 60)
    
    pod_name = os.environ.get('POD_NAME', 'unknown')
    user_id = os.environ.get('USER_ID')
    raw_data = os.environ.get('REQUEST_DATA')
    callback_url = os.environ.get('CALLBACK_URL')
    
    print(f"Pod Name: {pod_name}")
    print(f"User ID: {user_id}")
    
    if not raw_data:
        print("❌ No request data received")
        if user_id:
            send_completion_callback(callback_url, pod_name, user_id, 'failed', error="No request data")
        sys.exit(1)
    
    try:
        request_data = json.loads(raw_data)
        print(f"📦 Request Data: {json.dumps(request_data, indent=2)}")
    except json.JSONDecodeError as e:
        print(f"❌ Malformed JSON: {e}")
        send_completion_callback(callback_url, pod_name, user_id, 'failed', error="Invalid JSON")
        sys.exit(1)
    
    # Process QC request
    try:
        results = process_qc_request(request_data)
        print(f"\n✅ Processing completed successfully")
        send_completion_callback(callback_url, pod_name, user_id, 'success', results=results)
    except Exception as e:
        error_msg = str(e)
        print(f"\n❌ Processing failed: {error_msg}")
        send_completion_callback(callback_url, pod_name, user_id, 'failed', error=error_msg)
        sys.exit(1)
    
    print(f"\n{'='*60}")
    print("WORK COMPLETE - Waiting for container termination")
    print("=" * 60)

if __name__ == "__main__":
    is_warm_pod = os.environ.get('WARM_POD', 'false').lower() == 'true'
    
    if is_warm_pod:
        # Warm pod mode: Run HTTP server
        run_warm_pod_server()
    else:
        # Direct mode: Process from env vars and exit
        run_direct_mode()
