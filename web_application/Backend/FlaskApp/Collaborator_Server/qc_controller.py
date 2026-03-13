#!/usr/bin/env python3
"""
QC Controller - Unified API for Quality Control Methods
Manages MongoDB operations and orchestrates all QC methods
"""

import os
import sys
import io
import logging
import pandas as pd
import numpy as np
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, OperationFailure
from urllib.parse import quote_plus
import traceback

# Import QC modules
from minor_allele_freq import MAFQualityControl
from hardy_weinberg_qc import HardyWeinbergQC
from missing_data_qc import MissingDataQC
from pca_handler import PCAHandler
from privacy_transform import PrivacyTransform

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

# MongoDB Configuration
MONGO_USERNAME = os.environ.get('MONGO_USERNAME', 'CollaboratorDB')
MONGO_PASSWORD = os.environ.get('MONGO_PASSWORD', 'CollaboratorDB@123')
MONGO_CLUSTER = os.environ.get('MONGO_CLUSTER', 'collaboratordb.68hkp69.mongodb.net')

# URL encode the password (@ becomes %40)
encoded_password = quote_plus(MONGO_PASSWORD)
# Add SSL/TLS settings for Docker compatibility
MONGO_URI = f"mongodb+srv://{MONGO_USERNAME}:{encoded_password}@{MONGO_CLUSTER}/?retryWrites=true&w=majority&ssl=true&tlsAllowInvalidCertificates=false"

# Default data file path
DEFAULT_DATA_FILE = os.environ.get('DEFAULT_DATA_FILE', '/app/data/data_party_a_small.csv')

# PCA model path
PCA_MODEL_PATH = os.environ.get('PCA_MODEL_PATH', 'models')


class QCController:
    """Main controller for QC operations and MongoDB management"""
    
    def __init__(self):
        self.client = None
        self.pca_handler = PCAHandler(models_dir=PCA_MODEL_PATH)
        self._connect_to_mongodb()
    
    def _connect_to_mongodb(self):
        """Establish connection to MongoDB with Docker-compatible SSL settings"""
        try:
            import certifi
            
            # MongoDB connection with TLS/SSL for Docker and MongoDB Atlas
            # Using certifi for proper CA certificate validation
            self.client = MongoClient(
                MONGO_URI, 
                serverSelectionTimeoutMS=20000,
                connectTimeoutMS=20000,
                socketTimeoutMS=20000,
                tls=True,  # Enable TLS explicitly
                tlsAllowInvalidCertificates=False,  # Require valid certificates
                tlsCAFile=certifi.where()  # Use certifi's CA bundle for Docker SSL
            )
            # Test connection
            self.client.admin.command('ping')
            logger.info("✅ Successfully connected to MongoDB Atlas")
            logger.info(f"✅ MongoDB version: {self.client.server_info()['version']}")
        except ConnectionFailure as e:
            logger.error(f"❌ Failed to connect to MongoDB: {str(e)}")
            self.client = None
        except Exception as e:
            logger.error(f"❌ MongoDB connection error: {str(e)}")
            logger.error(f"Traceback: {traceback.format_exc()}")
            self.client = None
    
    def _get_user_db(self, username):
        """Get or create database for a specific user"""
        if not self.client:
            self._connect_to_mongodb()
        if not self.client:
            raise ConnectionError("Cannot connect to MongoDB")
        return self.client[username]
    
    def _dataframe_to_csv_string(self, df):
        """Convert DataFrame to CSV string"""
        return df.to_csv(index=False)
    
    def _csv_string_to_dataframe(self, csv_string):
        """Convert CSV string back to DataFrame"""
        return pd.read_csv(io.StringIO(csv_string))
    
    def initialize_user(self, username, phenotype):
        """
        Initialize a new user database with raw data
        Creates: {username} database with 'rawdata' and 'qcdata' collections
        If user already exists, adds new phenotype file to rawdata collection
        """
        try:
            db = self._get_user_db(username)
            
            # Check if this specific phenotype already exists
            filename = f"{phenotype}.csv"
            existing_phenotype = db['rawdata'].find_one({"filename": filename})
            
            if existing_phenotype:
                logger.info(f"Phenotype {phenotype} already exists for user {username}")
                return {
                    "success": True,
                    "message": f"Phenotype {phenotype} already initialized for user {username}",
                    "existing": True,
                    "filename": filename
                }
            
            # Load default data - prioritize local data folder, then Docker path, then fallback
            # Priority 1: Local data folder (for local development)
            local_data_file = os.path.join(os.path.dirname(__file__), 'data/data_party_a_small.csv')
            
            # Priority 2: Docker path (for containerized deployment)
            docker_data_file = DEFAULT_DATA_FILE
            
            # Priority 3: Old fallback path
            fallback_data_file = os.path.join(os.path.dirname(__file__), 
                '../../../../datasets/eye_color/data_party_a.csv')
            
            # Try each path in order
            data_file = None
            if os.path.exists(local_data_file):
                data_file = local_data_file
                logger.info(f"Using local data file: {local_data_file}")
            elif os.path.exists(docker_data_file):
                data_file = docker_data_file
                logger.info(f"Using Docker data file: {docker_data_file}")
            elif os.path.exists(fallback_data_file):
                data_file = fallback_data_file
                logger.warning(f"Using fallback data file: {fallback_data_file}")
            else:
                return {
                    "success": False,
                    "error": f"Default data file not found. Tried:\n1. {local_data_file}\n2. {docker_data_file}\n3. {fallback_data_file}"
                }
            
            # Read the CSV file
            df = pd.read_csv(data_file)
            csv_content = self._dataframe_to_csv_string(df)
            
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
            db['rawdata'].update_one(
                {"filename": filename},
                {"$set": raw_doc},
                upsert=True
            )
            
            # Create qcdata metadata for this phenotype (upsert to avoid duplicates)
            db['qcdata'].update_one(
                {"type": "metadata", "phenotype": phenotype},
                {"$set": {
                    "type": "metadata",
                    "created_at": datetime.utcnow(),
                    "phenotype": phenotype
                }},
                upsert=True
            )
            
            logger.info(f"Initialized user {username} with phenotype {phenotype}")
            
            return {
                "success": True,
                "message": f"User {username} initialized successfully",
                "database": username,
                "rawdata_file": filename,
                "rows": len(df),
                "columns": len(df.columns)
            }
            
        except Exception as e:
            logger.error(f"Error initializing user {username}: {str(e)}")
            logger.error(traceback.format_exc())
            return {
                "success": False,
                "error": str(e)
            }
    
    def list_qc_files(self, username):
        """List all QC output files for a user"""
        try:
            db = self._get_user_db(username)
            
            # Get all documents from qcdata collection
            qc_docs = db['qcdata'].find({"type": {"$ne": "metadata"}}, {"filename": 1, "_id": 0})
            
            filenames = [doc['filename'] for doc in qc_docs if 'filename' in doc]
            
            return {
                "success": True,
                "username": username,
                "files": filenames,
                "count": len(filenames)
            }
            
        except Exception as e:
            logger.error(f"Error listing files for {username}: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def _get_raw_data(self, username, phenotype):
        """Get raw data for a user from rawdata collection
        
        Always fetches data specific to the given phenotype to ensure
        QC methods operate on the correct dataset.
        """
        db = self._get_user_db(username)
        
        # Try to find by phenotype first (most specific)
        raw_doc = db['rawdata'].find_one({"phenotype": phenotype})
        
        # If not found by phenotype, try by filename (phenotype.csv)
        if not raw_doc:
            filename = f"{phenotype}.csv"
            raw_doc = db['rawdata'].find_one({"filename": filename})
        
        # If still not found, do NOT fall back to any random file
        # This ensures QC methods only run on phenotype-specific data
        if not raw_doc:
            all_raw_files = list(db['rawdata'].find({"filename": {"$exists": True}}, {"filename": 1, "phenotype": 1}))
            available_phenotypes = [f.get('phenotype', f.get('filename', '')) for f in all_raw_files]
            return None, f"No raw data found for phenotype '{phenotype}'. Available phenotypes: {', '.join(set(available_phenotypes)) if available_phenotypes else 'None'}"
        
        logger.info(f"Loading raw data for user {username}, phenotype: {phenotype}, file: {raw_doc.get('filename', 'N/A')}")
        return self._csv_string_to_dataframe(raw_doc['data']), None
    
    def run_qc_method(self, username, phenotype, method, params=None):
        """
        Run a specific QC method on the user's data
        
        Methods:
        - maf: Minor Allele Frequency QC
        - hwe: Hardy-Weinberg Equilibrium QC
        - missing: Missing Data QC
        - pca: Principal Component Analysis
        - privacy: Privacy Transform
        """
        try:
            params = params or {}
            
            # Always fetch from rawdata collection (each QC method runs independently)
            df, error = self._get_raw_data(username, phenotype)
            if df is None:
                return {
                    "success": False,
                    "error": error
                }
            source = f"{phenotype}.csv"
            
            logger.info(f"Running {method} QC for user {username}, source: {source}")
            logger.info(f"Input data shape: {df.shape}")
            
            # Run the appropriate QC method
            if method == 'maf':
                result_df, output_filename = self._run_maf_qc(df, phenotype, params)
            elif method == 'hwe':
                result_df, output_filename = self._run_hwe_qc(df, phenotype, params)
            elif method == 'missing':
                result_df, output_filename = self._run_missing_qc(df, phenotype, params)
            elif method == 'pca':
                result_df, output_filename = self._run_pca_qc(df, phenotype, params)
            elif method == 'privacy':
                result_df, output_filename = self._run_privacy_transform(df, phenotype, params)
            else:
                return {
                    "success": False,
                    "error": f"Unknown QC method: {method}"
                }
            
            # Store the result in qcdata collection
            db = self._get_user_db(username)
            csv_content = self._dataframe_to_csv_string(result_df)
            
            # Create QC result document
            qc_doc = {
                "filename": output_filename,
                "phenotype": phenotype,
                "method": method,
                "data": csv_content,
                "rows": len(result_df),
                "columns": len(result_df.columns),
                "column_names": result_df.columns.tolist(),
                "source_file": source,
                "params": params,
                "created_at": datetime.utcnow()
            }
            
            # Check if file already exists and update or insert
            existing = db['qcdata'].find_one({"filename": output_filename})
            if existing:
                db['qcdata'].update_one(
                    {"filename": output_filename},
                    {"$set": qc_doc}
                )
            else:
                db['qcdata'].insert_one(qc_doc)
            
            logger.info(f"QC method {method} completed. Output: {output_filename}")
            
            return {
                "success": True,
                "method": method,
                "output_filename": output_filename,
                "input_shape": [df.shape[0], df.shape[1]],
                "output_shape": [result_df.shape[0], result_df.shape[1]],
                "data": csv_content
            }
            
        except Exception as e:
            logger.error(f"Error running {method} QC: {str(e)}")
            logger.error(traceback.format_exc())
            return {
                "success": False,
                "error": str(e)
            }
    
    def _run_maf_qc(self, df, phenotype, params):
        """Run MAF Quality Control"""
        threshold = params.get('threshold', 0.05)
        method = params.get('method', 'combined')
        
        # Save temp file for MAF processing
        temp_file = f"/tmp/maf_input_{datetime.now().timestamp()}.csv"
        df.to_csv(temp_file, index=False)
        
        try:
            maf_qc = MAFQualityControl(
                threshold=threshold,
                method=method,
                verbose=True
            )
            
            # Process the file
            result_df = maf_qc.process_file(
                input_file=temp_file,
                output_file=None
            )
            
            output_filename = f"{phenotype}_maf_output.csv"
            return result_df, output_filename
            
        finally:
            # Cleanup temp file
            if os.path.exists(temp_file):
                os.remove(temp_file)
    
    def _run_hwe_qc(self, df, phenotype, params):
        """Run Hardy-Weinberg Equilibrium QC"""
        threshold = params.get('threshold', 1e-6)
        population = params.get('population', 'combined')
        method = params.get('method', 'chi2')
        
        # Save temp file for HWE processing
        temp_file = f"/tmp/hwe_input_{datetime.now().timestamp()}.csv"
        df.to_csv(temp_file, index=False)
        
        try:
            hwe_qc = HardyWeinbergQC(
                threshold=threshold,
                population=population,
                method=method,
                verbose=True
            )
            
            result_df = hwe_qc.process_file(
                input_file=temp_file,
                output_file=None
            )
            
            output_filename = f"{phenotype}_hwe_output.csv"
            return result_df, output_filename
            
        finally:
            if os.path.exists(temp_file):
                os.remove(temp_file)
    
    def _run_missing_qc(self, df, phenotype, params):
        """Run Missing Data QC"""
        threshold = params.get('threshold', 0.10)
        filter_individuals = params.get('filter_individuals', True)
        filter_snps = params.get('filter_snps', True)
        
        # Save temp file for processing
        temp_file = f"/tmp/missing_input_{datetime.now().timestamp()}.csv"
        df.to_csv(temp_file, index=False)
        
        try:
            missing_qc = MissingDataQC(
                missing_threshold=threshold,
                filter_individuals=filter_individuals,
                filter_snps=filter_snps,
                verbose=True
            )
            
            result_df = missing_qc.process_file(
                input_file=temp_file,
                output_file=None
            )
            
            output_filename = f"{phenotype}_missing_output.csv"
            return result_df, output_filename
            
        finally:
            if os.path.exists(temp_file):
                os.remove(temp_file)
    
    def _run_pca_qc(self, df, phenotype, params):
        """Run PCA transformation"""
        model_name = params.get('model_name', 'pca_model')
        add_noise = params.get('add_noise', False)
        epsilon = params.get('epsilon', 1.0)
        
        result = self.pca_handler.transform_data(
            model_name=model_name,
            data_df=df,
            add_noise=add_noise,
            epsilon=epsilon
        )
        
        if not result['success']:
            raise ValueError(result.get('error', 'PCA transformation failed'))
        
        # Convert transformed data to DataFrame
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
    
    def _run_privacy_transform(self, df, phenotype, params):
        """Run Privacy Transform (noise addition, shuffling, synthetic samples)"""
        epsilon = params.get('epsilon', 5.0)
        seed = params.get('seed', 1234)
        num_synthetic = params.get('num_synthetic_samples', 0)
        num_combine = params.get('num_samples_to_combine', 3)
        shuffle = params.get('shuffle', True)
        
        # Save temp file for processing
        temp_file = f"/tmp/privacy_input_{datetime.now().timestamp()}.csv"
        df.to_csv(temp_file, index=False)
        
        try:
            transformer = PrivacyTransform(
                epsilon=epsilon,
                seed=seed,
                num_synthetic_samples=num_synthetic,
                num_samples_to_combine=num_combine,
                shuffle=shuffle,
                verbose=True
            )
            
            result_df = transformer.process_file(
                input_file=temp_file,
                output_file=None
            )
            
            output_filename = f"{phenotype}_privacy_output.csv"
            return result_df, output_filename
            
        finally:
            if os.path.exists(temp_file):
                os.remove(temp_file)
    
    def get_file_data(self, username, filename):
        """Get specific file data from qcdata collection"""
        try:
            db = self._get_user_db(username)
            
            doc = db['qcdata'].find_one({"filename": filename})
            if not doc:
                # Try rawdata collection
                doc = db['rawdata'].find_one({"filename": filename})
            
            if not doc:
                return {
                    "success": False,
                    "error": f"File {filename} not found"
                }
            
            return {
                "success": True,
                "filename": filename,
                "data": doc['data'],
                "rows": doc.get('rows'),
                "columns": doc.get('columns'),
                "created_at": str(doc.get('created_at', ''))
            }
            
        except Exception as e:
            logger.error(f"Error getting file {filename}: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }


# Create global controller instance
qc_controller = QCController()


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "mongodb_connected": qc_controller.client is not None
    })


@app.route('/api/qc', methods=['POST'])
def qc_endpoint():
    """
    Main QC API endpoint
    
    Request body:
    {
        "username": "user123",
        "phenotype": "eye_color",
        "method": "maf|hwe|missing|pca|privacy",
        "action": "initialize|create|listing|get",
        "params": {}
    }
    
    Actions:
    - initialize: Create user database and load raw data
    - create: Run QC method and store result
    - listing: List all QC output files
    - get: Get specific file data (requires "filename" in params)
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({
                "success": False,
                "error": "No JSON data provided"
            }), 400
        
        username = data.get('username')
        phenotype = data.get('phenotype')
        action = data.get('action')
        method = data.get('method')
        params = data.get('params', {})
        
        # Validate required fields
        if not username:
            return jsonify({
                "success": False,
                "error": "username is required"
            }), 400
        
        if not action:
            return jsonify({
                "success": False,
                "error": "action is required"
            }), 400
        
        # Handle actions
        if action == 'initialize':
            if not phenotype:
                return jsonify({
                    "success": False,
                    "error": "phenotype is required for initialize action"
                }), 400
            
            result = qc_controller.initialize_user(username, phenotype)
            
        elif action == 'listing':
            result = qc_controller.list_qc_files(username)
            
        elif action == 'create':
            if not method:
                return jsonify({
                    "success": False,
                    "error": "method is required for create action"
                }), 400
            
            if not phenotype:
                return jsonify({
                    "success": False,
                    "error": "phenotype is required for create action"
                }), 400
            
            valid_methods = ['maf', 'hwe', 'missing', 'pca', 'privacy']
            if method not in valid_methods:
                return jsonify({
                    "success": False,
                    "error": f"Invalid method. Must be one of: {', '.join(valid_methods)}"
                }), 400
            
            result = qc_controller.run_qc_method(username, phenotype, method, params)
            
        elif action == 'get':
            filename = params.get('filename')
            if not filename:
                return jsonify({
                    "success": False,
                    "error": "params.filename is required for get action"
                }), 400
            
            result = qc_controller.get_file_data(username, filename)
            
        else:
            return jsonify({
                "success": False,
                "error": f"Invalid action: {action}. Must be one of: initialize, create, listing, get"
            }), 400
        
        status_code = 200 if result.get('success', False) else 400
        return jsonify(result), status_code
        
    except Exception as e:
        logger.error(f"API error: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    debug = os.environ.get('DEBUG', 'false').lower() == 'true'
    
    logger.info(f"Starting QC Controller on port {port}")
    logger.info(f"MongoDB URI: {MONGO_URI[:50]}...")
    
    app.run(host='0.0.0.0', port=port, debug=debug)
