import traceback

from pandas import DataFrame
import numpy as np
from flask import Flask, request, jsonify, g
from flask_login import LoginManager, login_user, logout_user, UserMixin
from flask_cors import CORS
from importlib_metadata import metadata
from itsdangerous import Serializer, SignatureExpired, BadSignature
from werkzeug.security import generate_password_hash, check_password_hash
from pymongo import MongoClient
from bson.objectid import ObjectId
from bson.json_util import dumps
from dotenv import load_dotenv, find_dotenv
from werkzeug.utils import secure_filename
import os
import jwt
import datetime
from datetime import datetime
import time
from flask_httpauth import HTTPBasicAuth
import json
import pandas as pd
import logging
from calculate_coefficients import compute_coefficients_array
from fuzzywuzzy import process
import uuid
from stats import calc_chi_pvalue
# Removed duplicate - already imported above
from concurrent.futures import ThreadPoolExecutor
from multiprocessing import Pool
from concurrent.futures import ProcessPoolExecutor, as_completed
from sklearn.metrics import pairwise_distances
import requests as http_requests  # For proxying to QC Controller
import io

# Import orchestrator client
try:
    from orchestrator_client import OrchestratorClient
    ORCHESTRATOR_AVAILABLE = True
except ImportError:
    ORCHESTRATOR_AVAILABLE = False
    print("⚠️  Orchestrator client not available - will use direct QC Controller")

# Import FL pipeline (Federated Learning experiment type)
try:
    from fl import pipeline as fl_pipeline
    from fl.fl_config import (
        DEFAULT_BATCH_SIZE as FL_DEFAULT_BATCH_SIZE,
        DEFAULT_EMD_THRESHOLD as FL_DEFAULT_EMD_THRESHOLD,
        DEFAULT_EPSILON as FL_DEFAULT_EPSILON,
        DEFAULT_FL_ROUNDS as FL_DEFAULT_ROUNDS,
        DEFAULT_LEARNING_RATE as FL_DEFAULT_LR,
        DEFAULT_LOCAL_EPOCHS as FL_DEFAULT_LOCAL_EPOCHS,
        SUPER_POPULATIONS as FL_SUPER_POPULATIONS,
    )
    FL_AVAILABLE = True
except ImportError as _fl_exc:
    FL_AVAILABLE = False
    print(f"⚠️  FL pipeline not available: {_fl_exc}")

# Experiment type constants
EXPERIMENT_GWAS = "GWAS"
EXPERIMENT_FL = "Federated Learning"
ALLOWED_EXPERIMENT_TYPES = [EXPERIMENT_GWAS, EXPERIMENT_FL]

# FL's fixed QC scheme: PCA projection with local DP noise is the only
# preprocessing step shared with the server (per Sub Aim 1.3).
FL_QC_METHOD = "Public PCA + DP Projection"
FL_QC_SCHEME_DEFAULT = [{
    "method": FL_QC_METHOD,
    "params": {
        "epsilon": float(FL_DEFAULT_EPSILON) if FL_AVAILABLE else 3.0,
        "clip_norm": 5.0,
    },
}]

# from stats import calc_chi_pvalue

app = Flask(__name__)

# QC Controller and Orchestrator Configuration
QC_CONTROLLER_URL = os.getenv('QC_CONTROLLER_URL', 'http://localhost:5001')
ORCHESTRATOR_URL = os.getenv('ORCHESTRATOR_URL', 'http://localhost:3000')
USE_ORCHESTRATOR = os.getenv('USE_ORCHESTRATOR', 'false').lower() == 'true'

# Initialize orchestrator client if enabled
if USE_ORCHESTRATOR and ORCHESTRATOR_AVAILABLE:
    orchestrator = OrchestratorClient(ORCHESTRATOR_URL)
    print(f"✅ Orchestrator enabled at {ORCHESTRATOR_URL}")
else:
    orchestrator = None
    print(f"✅ Using direct QC Controller at {QC_CONTROLLER_URL}")

load_dotenv(find_dotenv())
auth = HTTPBasicAuth()

app.config["MONGO_URI"] = os.getenv("MONGO_URI")
app.config["PORT"] = os.getenv("PORT")
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')
CORS(app)  # Initialize CORS
logging.basicConfig(level=logging.INFO)

login_manager = LoginManager()
login_manager.init_app(app)

def get_database():
    uri = app.config["MONGO_URI"]
    client = MongoClient(uri)
    try:
        client.admin.command('ping')
        print("Pinged your deployment. You successfully connected to MongoDB!")
    except Exception as e:
        print(e)
    return client['test']

db = get_database()

blacklisted_tokens = []

class User(UserMixin):
    def __init__(self, user_json):
        self.user_json = user_json

    @property
    def id(self):
        return str(self.user_json["_id"])

    @property
    def email(self):
        return self.user_json["email"]

    def verify_password(self, password):
        return check_password_hash(self.password_hash, password, method='sha256')

    def generate_auth_token(self, expires_in=100000):
        return jwt.encode(
            {'id': self.id, 'exp': time.time() + expires_in},
            app.config['SECRET_KEY'], algorithm='HS256')

    @staticmethod
    def verify_auth_token(token):
        if token in blacklisted_tokens:
            return None

        try:
            data = jwt.decode(token, app.config['SECRET_KEY'],
                              algorithms=['HS256'])
        except:
            return
        user = db.users.find_one({"_id": ObjectId(data['id'])})
        if user:
            return User(user)
        return None

@login_manager.user_loader
def load_user(user_id):
    u = db.users.find_one({"_id": ObjectId(user_id)})
    if not u:
        return None
    return User(u)

def get_current_user():
    auth_header = request.headers.get('Authorization')
    if not auth_header:
        logging.error("Authorization header missing")
        return None, jsonify({"error": "Authorization header missing"}), 401

    try:
        token = auth_header.split()[1]
    except IndexError:
        logging.error("Invalid Authorization header format")
        return None, jsonify({"error": "Invalid Authorization header format"}), 401

    current_user = User.verify_auth_token(token)
    if not current_user:
        logging.error("Invalid or expired token")
        return None, jsonify({"error": "Invalid or expired token"}), 401

    return current_user, None


@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()
    name = data.get('name')
    email = data.get('email')
    password = data.get('password')

    if not name or not email or not password:
        logging.error("Missing required fields")
        return jsonify({'message': 'Name, email, and password are required'}), 400

    user = db.users.find_one({'email': email})

    if user:
        return jsonify({'message': 'Email already exists'}), 409

    hashed_password = generate_password_hash(password, method='sha256')
    db.users.insert_one({
        'name': name,
        'email': email,
        'password': hashed_password
    })

    return jsonify({'message': 'User created successfully'}), 201


@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data['email']
    password = data['password']
    user = db.users.find_one({'email': email})

    if user and check_password_hash(user['password'], password):
        user_obj = User(user)
        login_user(user_obj)
        g.user = user_obj  # Set g.user to the logged-in user
        token = g.user.generate_auth_token()
        return jsonify({'message': 'Login successful', 'token': token, 'redirect' : '/home'}), 200

    return jsonify({'message': 'Invalid email or password'}), 401

@app.route('/api/profile', methods=['GET'])
def get_profile():
    current_user, error_response = get_current_user()
    if error_response:
        return error_response
    user_id = current_user.get_id()
    user = db.users.find_one({"_id": ObjectId(user_id)}, {"email": 1, "name": 1})
    if not user:
        return jsonify({"message": "User not found"}), 404
    logging.info(f"User email: {user['email']}, User name: {user['name']}")
    return jsonify({"email": user['email'], "name": user['name']})

@app.route('/api/profile', methods=['PUT'])
def update_profile():
    current_user, error_response = get_current_user()
    if error_response:
        return error_response
    user_id = current_user.get_id()
    data = request.json
    name = data.get('name')
    current_password = data.get('currentPassword')
    new_password = data.get('newPassword')
    confirm_new_password = data.get('confirmNewPassword')

    if new_password and new_password != confirm_new_password:
        return jsonify({"message": "New passwords do not match"}), 400

    user = db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        return jsonify({"message": "User not found"}), 404

    if name and not current_password:
        return jsonify({"message": "Current password is required to update the name"}), 400

    # Check if current password is correct
    if current_password and not check_password_hash(user['password'], current_password):
        return jsonify({"message": "Current password is incorrect"}), 400

    # Update password if new password is provided
    if new_password:
        hashed_password = generate_password_hash(new_password, method='sha256')
        db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"password": hashed_password}})

    # Update name if provided
    if name:
        db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"name": name}})

    return jsonify({"message": "Profile updated successfully"})


@auth.verify_password
def verify_password(email_or_token, password):
    # first try to authenticate by token
    user = User.verify_auth_token(email_or_token)
    if not user:
        # try to authenticate with username/password
        user = db.users.find_one({'email': email_or_token})
        if not user or not user.verify_password(password):
            return False
    g.user = user
    return True

# @app.route('/api/logout', methods=['POST'])
# def logout():
#     auth_header = request.headers.get('Authorization')
#     if not auth_header:
#         logging.error("Authorization header missing")
#         return jsonify({"error": "Authorization header missing"}), 401
#     token = auth_header.split()[1]

#     # Add the token to the blacklist
#     blacklisted_tokens.append(token)

#     logout_user()
#     return jsonify({'message': 'Logout successful'})

@app.route('/api/logout', methods=['POST'])
def logout():
    auth_header = request.headers.get('Authorization')
    
    if not auth_header:
        logging.error("Authorization header missing")
        return jsonify({"error": "Authorization header missing"}), 401

    parts = auth_header.split()
    if len(parts) != 2 or parts[0] != 'Bearer':
        logging.error("Invalid Authorization header format")
        return jsonify({"error": "Invalid Authorization header format"}), 401

    token = parts[1]

    # Add the token to the blacklist
    blacklisted_tokens.append(token)

    logout_user()
    return jsonify({'message': 'Logout successful'})



@app.route('/api/resource')
@auth.login_required
def get_resource():
    return jsonify({'data': 'Hello, %s!' % g.user.email})

@app.route('/api/users', methods=['GET'])
def get_users():
    users = db.users.find({})
    users_list = [{"email": user["email"], "_id": str(user["_id"])} for user in users]
    # Convert the list to JSON, `dumps` from `bson.json_util` handles MongoDB ObjectId
    return dumps(users_list), 200

@app.route('/api/researchprojects', methods=['GET'])
def get_research_projects():
    data = request.get_json()
    user_id = data['user_id']
    projects = db.research_projects.find({'user_id': ObjectId(user_id)})
    user = db.users.find_one({'_id': ObjectId(user_id)})
    projects_list = [{"project_name": project["project_name"], "_id": str(project["_id"])} for project in projects]
    return jsonify({"username": user["username"], "projects": projects_list}), 200

@app.route('/api/researchprojects', methods=['POST'])
def create_research_project():
    data = request.get_json()
    user_id = data['user_id']
    project_name = data['project_name']

    research_project = {
        'user_id': ObjectId(user_id),
        'project_name': project_name
    }

    db.research_projects.insert_one(research_project)

    return jsonify({'message': 'Research project created successfully'}), 201

# @app.route('/api/invite/users', methods=['GET'])
# def get_users_for_invitation():
#     try:
#         current_user, error_response = get_current_user()
#         if error_response:
#             return error_response
#         query = request.args.get('phenotype', '')
#         min_samples = request.args.get('minSamples', '')
#         search_filter = {}
#         if min_samples:
#             search_filter['$expr'] = {"$gte": [{"$toInt": "$numberOfSamples"}, int(min_samples)]}
#         file_uploads = list(db.fileUploads.find(search_filter))
#         matched_documents = []
#         if query:
#             for doc in file_uploads:
#                 if 'phenotypes' in doc:
#                     # Check for exact matches first
#                     if query in doc['phenotypes']:
#                         matched_documents.append(doc)
#                     else:
#                         # Perform fuzzy matching if there's no exact match
#                         match_ratio = process.extractOne(query, [doc['phenotypes']])
#                         if match_ratio[1] >= 70:  # Adjusted threshold for better matching
#                             matched_documents.append(doc)
#         else:
#             matched_documents = file_uploads

#         if not query and min_samples:
#             matched_documents = file_uploads  

#         if query and min_samples:
#             matched_documents = [doc for doc in matched_documents if int(doc.get('numberOfSamples', 0)) >= int(min_samples)]
#         owner_ids = {ObjectId(file_upload['owner']) for file_upload in matched_documents if 'phenotypes' in file_upload}
#         matched_users = list(db.users.find({"_id": {"$in": list(owner_ids)}}))
#         matched_users = [user for user in matched_users if user["_id"] != ObjectId(current_user.get_id())]

#         users_list = [{
#             "_id": str(user["_id"]),
#             "name": user.get("name", "No Name Provided"),
#             "phenotype": next((doc['phenotypes'] for doc in matched_documents if doc['owner'] == str(user["_id"])), "No Phenotype"),
#             "numberOfSamples": next((doc['numberOfSamples'] for doc in matched_documents if doc['owner'] == str(user["_id"])), "No Samples")

#         } for user in matched_users]

#         return jsonify(users_list), 200

#     except Exception as e:
#         logging.error(f"Error: {e}")
#         return jsonify({"error": "Internal server error"}), 500

#     except Exception as e:
#         logging.error(f"Error: {str(e)}")
#         return jsonify({"error": str(e)}), 500

@app.route('/api/invite/users', methods=['GET'])
def get_users_for_invitation():
    try:
        # Retrieve the current user
        current_user, error_response = get_current_user()
        if error_response:
            return error_response

        # Get query parameters
        query = request.args.get('phenotype', '').strip()
        min_samples = request.args.get('minSamples', '').strip()

        # Build the search filter based on min_samples
        # IMPORTANT: Only search RAW datasets, NOT QC datasets or collaboration-specific datasets
        # QC datasets and collaboration-specific datasets should not appear in search results
        search_filter = {
            'is_qc_data': {'$ne': True},  # Exclude QC datasets from search
            'collaboration_specific': {'$ne': True}  # Exclude collaboration-specific datasets from search
        }
        if min_samples:
            try:
                min_samples_int = int(min_samples)
                search_filter['$expr'] = {"$gte": [{"$toInt": "$number_of_samples"}, min_samples_int]}
            except ValueError:
                return jsonify({"error": "minSamples must be an integer"}), 400

        # Fetch datasets from the database (only original raw datasets)
        datasets = list(db.datasets.find(search_filter))
        matched_datasets = []

        # Filter datasets based on the phenotype query
        if query:
            for doc in datasets:
                phenotype = doc.get('phenotype', '')
                if not phenotype:
                    continue  # Skip documents without a phenotype

                # Exact match
                if query == phenotype:
                    matched_datasets.append(doc)
                else:
                    # Fuzzy matching
                    match = process.extractOne(query, [phenotype])
                    if match and match[1] >= 70:  # Threshold can be adjusted
                        matched_datasets.append(doc)
        else:
            matched_datasets = datasets

        # If both query and min_samples are provided, ensure both conditions are met
        if query and min_samples:
            matched_datasets = [
                doc for doc in matched_datasets
                if int(doc.get('number_of_samples', 0)) >= int(min_samples)
            ]

        if not matched_datasets:
            return jsonify([]), 200  # Return empty list if no matches

        # Extract unique user_ids from the matched datasets, excluding the current user
        user_ids = {
            ObjectId(doc['user_id']) for doc in matched_datasets
            if 'user_id' in doc and str(doc['user_id']) != str(current_user.get_id())
        }

        # Fetch users from the database
        matched_users = list(db.users.find({"_id": {"$in": list(user_ids)}}))

        # Create a mapping from user_id to user document for quick access
        user_map = {str(user["_id"]): user for user in matched_users}

        # Deduplicate results by user_id + phenotype combination
        seen_combinations = set()

        # Prepare the response list
        users_list = []
        for doc in matched_datasets:
            user_id_str = str(doc.get('user_id', ''))
            if not user_id_str:
                continue  # Skip if user_id is missing

            # Exclude current user
            if user_id_str == str(current_user.get_id()):
                continue

            user = user_map.get(user_id_str)
            if not user:
                continue  # Skip if user not found
            
            phenotype = doc.get('phenotype', "No Phenotype")
            
            # Create unique key for deduplication (user_id + phenotype)
            unique_key = f"{user_id_str}_{phenotype}"
            if unique_key in seen_combinations:
                logging.debug(f"Skipping duplicate search result: user {user.get('name')}, phenotype {phenotype}")
                continue
            seen_combinations.add(unique_key)

            users_list.append({
                "dataset_id": str(doc["_id"]),
                "_id": user_id_str,
                "name": user.get("name", "No Name Provided"),
                "phenotype": phenotype,
                "number_of_samples": doc.get('number_of_samples', "No Samples")
            })

        return jsonify(users_list), 200

    except Exception as e:
        logging.error(f"Error: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500



# @app.route('/api/invitations', methods=['GET'])
# def get_user_invitations():
#     try:
#         current_user, error_response = get_current_user()
#         if error_response:
#             return error_response
        
#         user_id = current_user.get_id()
        
#         # Find collaborations where the user is either the creator (sender) or an invited user (receiver)
#         collaborations = db.collaborations.find({
#             '$or': [
#                 {'creator_id': ObjectId(user_id)},  # If the user is the sender (creator)
#                 {'invited_users.user_id': ObjectId(user_id)}  # If the user is an invited user (receiver)
#             ]
#         })
        

#         #invitations_list = []
        
#         response_list = []
#         processed_collab_uuids = set()
        
#         # Iterate over the collaborations
#         for collaboration in collaborations:
#             collaboration_uuid = collaboration.get("uuid", None)
#             collaboration_name = collaboration.get("name", "No name")
#             creator_id = collaboration.get("creator_id")

#             # Sender (initiator) info
#             sender_user = db.users.find_one({"_id": ObjectId(creator_id)})
#             sender_email = sender_user["email"] if sender_user else "Unknown"
#             sender_name = sender_user["name"] if sender_user else "Unknown"
#             is_current_user_the_initiator = (str(creator_id) == user_id)
            
#             participants_list_summary = []
#             current_user_specific_status_as_invitee = None
#             all_invitees_accepted = True if collaboration.get('invited_users') else False
#             any_invitee_pending = False
            
            
#             # Iterate over invited users
#             for invited_user in collaboration.get('invited_users', []):
#                 receiver_id = invited_user.get("user_id")
#                 receiver_user = db.users.find_one({"_id": ObjectId(receiver_id)})
#                 receiver_email = receiver_user["email"] if receiver_user else "Unknown"
#                 receiver_name = receiver_user["name"] if receiver_user else "Unknown"
#                 status_str = invited_user.get("status", "pending")
                
#                 participants_list_summary.append(
#                     {
#                         "user_id": str(receiver_id),
#                         "name": receiver_name,
#                         "email": receiver_email,
#                         "status": status_str
#                     }
#                 )
#                 if receiver_id == user_id:
#                     current_user_specific_status_as_invitee = status_str
#                 if status_str == 'pending': any_invitee_pending = True
#                 if status_str != 'accepted': all_invitees_accepted = False
                
#                 # # Only include invitations where the user is the sender or receiver
#                 # if str(invited_user["user_id"]) == user_id or str(collaboration["creator_id"]) == user_id:
#                 #     participants_list_summary.append({
#                 #         "_id": str(collaboration["_id"]),
#                 #         "uuid": str(collaboration_uuid),
#                 #         "collab_name": collaboration_name,
#                 #         "collab_uuid": str(collaboration_uuid),
#                 #         "receiver_id": str(invited_user["user_id"]),
#                 #         "sender_id": str(collaboration["creator_id"]),
#                 #         "receiver_email": receiver_email,
#                 #         "receiver_name": receiver_name,
#                 #         "sender_email": sender_email,
#                 #         "sender_name": sender_name,
#                 #         "status": invited_user["status"],
#                 #         "phenotype": invited_user.get("phenotype", "Not provided")
#                 #     })
#             base_representation = {
#                 "uuid": collaboration_uuid, "collab_name": collaboration_name,
#                 "creator_name": sender_name, "creator_email": sender_email, "creator_id": str(creator_id)
#             }
#             if is_current_user_the_initiator:
#                 base_representation["view_type"] = "initiator_summary"
#                 base_representation["all_invited_participants"] = participants_list_summary
#                 if not collaboration.get('invited_users'): base_representation["overall_status_for_initiator_tab"] = "setup"
#                 elif any_invitee_pending: base_representation["overall_status_for_initiator_tab"] = "pending_responses"
#                 elif all_invitees_accepted: base_representation["overall_status_for_initiator_tab"] = "active_all_accepted"
#                 else: base_representation["overall_status_for_initiator_tab"] = "active_mixed_responses"
#                 response_list.append(base_representation)
#                 processed_collab_uuids.add(collaboration_uuid)
#             elif current_user_specific_status_as_invitee:
#                 base_representation["view_type"] = "invitee_specific"
#                 base_representation["my_status_as_invitee"] = current_user_specific_status_as_invitee
#                 my_entry = next((iu for iu in collaboration.get('invited_users', []) if str(iu.get("user_id")) == user_id), None)
#                 if my_entry: base_representation["phenotype_context"] = my_entry.get("phenotype", "N/A")
#                 # For invitee view, sender/receiver is more direct for existing frontend
#                 base_representation["sender_id"] = str(creator_id)
#                 base_representation["sender_name"] = sender_name
#                 base_representation["receiver_id"] = user_id
#                 base_representation["receiver_name"] = current_user.user_json.get("name", "You")
#                 response_list.append(base_representation)
#                 processed_collab_uuids.add(collaboration_uuid)

#         return jsonify({"invitations": response_list, "current_user_id": user_id}), 200
#     except Exception as e:
#         logging.error(f"Error getting user invitations: {str(e)}")
#         return jsonify({"error": str(e)}), 500


@app.route('/api/invitations', methods=['GET'])
def get_user_invitations():
    try:
        current_user, error_response = get_current_user()
        if error_response:
            return error_response
        
        user_id = current_user.get_id()
        
        # Get pagination parameters
        page = int(request.args.get('page', 1))
        limit = int(request.args.get('limit', 50))  # Default to 50 items per page
        skip = (page - 1) * limit
        
        # Find collaborations where the user is either the creator (sender) or an invited user (receiver)
        # Only fetch the fields we actually need to reduce data transfer
        collaborations = list(db.collaborations.find({
            '$or': [
                {'creator_id': ObjectId(user_id)},  # If the user is the sender (creator)
                {'invited_users.user_id': ObjectId(user_id)}  # If the user is an invited user (receiver)
            ]
        }, {
            'uuid': 1,
            'name': 1,
            'creator_id': 1,
            'creator_dataset_id': 1,
            'invited_users': 1,
            'experiments': 1,
            'qc_scheme': 1
        }).sort('_id', -1).skip(skip).limit(limit))
        
        # Get total count for pagination info
        total_count = db.collaborations.count_documents({
            '$or': [
                {'creator_id': ObjectId(user_id)},
                {'invited_users.user_id': ObjectId(user_id)}
            ]
        })
        
        # Collect all unique user IDs to fetch in batch
        user_ids_to_fetch = set()
        for collaboration in collaborations:
            creator_id = collaboration.get("creator_id")
            if creator_id:
                user_ids_to_fetch.add(creator_id)
            
            for iu in collaboration.get('invited_users', []):
                if iu.get("user_id"):
                    user_ids_to_fetch.add(iu["user_id"])
        
        # Batch fetch all users - only fetch name and email fields we need
        users_docs = list(db.users.find(
            {"_id": {"$in": list(user_ids_to_fetch)}},
            {"name": 1, "email": 1}
        ))
        users_cache = {str(user["_id"]): user for user in users_docs}
        
        response_list = []
        processed_collab_uuids = set()
        
        # Iterate over the collaborations
        for collaboration in collaborations:
            collaboration_uuid = collaboration.get("uuid", None)
            collaboration_name = collaboration.get("name", "No name")
            creator_id = collaboration.get("creator_id")

            # Sender (initiator) info from cache
            sender_user = users_cache.get(str(creator_id), {})
            sender_email = sender_user.get("email", "Unknown")
            sender_name = sender_user.get("name", "Unknown")
            is_initiator = (str(creator_id) == user_id)
            raw_experiments = collaboration.get('experiments', [])
            # Normalize experiments to flat list of type strings for Quick View display
            experiments_display = []
            for exp in (raw_experiments or []):
                if isinstance(exp, str) and exp:
                    experiments_display.append(exp)
                elif isinstance(exp, dict):
                    for t in exp.get('experiment_types', []):
                        if isinstance(t, str) and t and t not in experiments_display:
                            experiments_display.append(t)
            if not experiments_display:
                experiments_display = ['GWAS']
            experiments = experiments_display
            qcSchemes = collaboration.get('qc_scheme', [])

            # Build all participants list once (avoid duplication)
            all_participants = []
            any_pending = False
            all_accepted = True if collaboration.get('invited_users') else False
            
            for iu in collaboration.get('invited_users', []):
                iu_user = users_cache.get(str(iu["user_id"]), {})
                status = iu.get("status", "pending")
                all_participants.append({
                    "user_id": str(iu["user_id"]), 
                    "name": iu_user.get("name", "Unknown"), 
                    "status": status
                })
                if status == 'pending': 
                    any_pending = True
                if status != 'accepted': 
                    all_accepted = False
                
            # Build my_dataset_info: phenotype and number_of_samples for the current user's dataset
            my_dataset_info = None
            if is_initiator:
                creator_dataset_id = collaboration.get('creator_dataset_id')
                if creator_dataset_id:
                    ds = db.datasets.find_one({"_id": ObjectId(str(creator_dataset_id))}, {"phenotype": 1, "number_of_samples": 1})
                    if ds:
                        my_dataset_info = {
                            "phenotype": str(ds.get("phenotype", "N/A")),
                            "number_of_samples": str(ds.get("number_of_samples", "0"))
                        }
            else:
                for iu in collaboration.get('invited_users', []):
                    if str(iu.get("user_id")) == user_id:
                        user_dataset_id = iu.get("user_dataset_id")
                        if user_dataset_id:
                            ds = db.datasets.find_one({"_id": ObjectId(str(user_dataset_id))}, {"phenotype": 1, "number_of_samples": 1})
                            if ds:
                                my_dataset_info = {
                                    "phenotype": str(ds.get("phenotype", "N/A")),
                                    "number_of_samples": str(ds.get("number_of_samples", "0"))
                                }
                        break

            if is_initiator:
                overall_status = "setup"
                if collaboration.get('invited_users'):
                    if any_pending: 
                        overall_status = "pending_responses"
                    elif all_accepted: 
                        overall_status = "active_all_accepted"
                    else: 
                        overall_status = "active_mixed_responses"

                response_list.append({
                    "uuid": collaboration_uuid, 
                    "collab_name": collaboration.get("name", "Untitled"),
                    "view_type": "initiator_summary", 
                    "creator_name": sender_name,
                    "all_participants": all_participants,
                    "overall_status_for_initiator_tab": overall_status,
                    'experiments': experiments,
                    'collabQcScheme': qcSchemes,
                    'my_dataset_info': my_dataset_info,
                })
                processed_collab_uuids.add(collaboration_uuid)

            # --- For Invitee's View ---
            else:
                for iu in collaboration.get('invited_users', []):
                    if str(iu.get("user_id")) == user_id:
                        invitee_user = users_cache.get(user_id, {})
                        response_list.append({
                            "uuid": collaboration_uuid, 
                            "collab_name": collaboration.get("name", "Untitled"),
                            "all_participants": all_participants,
                            "view_type": "invitee_specific",
                            "my_status_as_invitee": iu.get("status"),
                            "sender_id": str(collaboration["creator_id"]), 
                            "sender_name": sender_name,
                            "receiver_id": user_id, 
                            "receiver_name": invitee_user.get("name", "You"),
                            'experiments': experiments,
                            'collabQcScheme': qcSchemes,
                            'my_dataset_info': my_dataset_info,
                        })
                        processed_collab_uuids.add(collaboration_uuid)
                        break
            
        return jsonify({
            "invitations": response_list, 
            "current_user_id": user_id,
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total_count,
                "total_pages": (total_count + limit - 1) // limit
            }
        }), 200
    except Exception as e:
        logging.error(f"Error getting user invitations: {str(e)}")
        return jsonify({"error": str(e)}), 500



@app.route('/api/checkinvitationstatus', methods=['POST'])
def check_invitation_status():
    try:
        data = request.get_json()
        receiver_id = data['receiver_id']
        current_user, error_response = get_current_user()
        if error_response:
            return error_response
        sender_id = current_user.get_id()
        receiver_id = ObjectId(receiver_id)
        sender_id = ObjectId(sender_id)        
        existing_invitation = db.invitations.find_one({
            'receiver_id': receiver_id,
            'sender_id': sender_id,
            'status':{'$ne': 'withdrawn'}
        })
        
        if not existing_invitation:
            withdraw_invitation = db.invitations.find_one({
            'receiver_id': receiver_id,
            'sender_id': sender_id,
            'status': 'withdrawn'
            })
            if withdraw_invitation:
                return jsonify ({'status': 'withdrawn'}), 200
            else:
                return jsonify({'status': 'none'}), 200
            
        return jsonify({'status': existing_invitation['status']}), 200
    except Exception as e:
        return jsonify({"error": str(e)}),500


@app.route('/api/sendinvitation', methods=['POST'])
def send_invitation():
    try:
        current_user, error_response = get_current_user()
        if error_response:
            return error_response
        sender_id = current_user.id

        data = request.get_json()
        receiver_id = data.get('receiver_id')
        phenotype = data.get('phenotype')
        collaboration_id = data.get('collaboration_id')

        if not receiver_id:
            logging.error("Receiver ID missing in the request")
            return jsonify({"error": "Receiver ID missing in the request"}), 400

        if not collaboration_id:
            logging.error("Collaboration UUID missing in the request")
            return jsonify({"error": "Collaboration UUID missing in the request"}), 400

        logging.debug(f"Sender ID: {sender_id}, Receiver ID: {receiver_id}, Collaboration UUID: {collaboration_id}")

        # Check if the collaboration exists
        collaboration = db.collaborations.find_one({'uuid': collaboration_id})
        if not collaboration:
            logging.error(f"Collaboration with UUID {collaboration_id} not found")
            return jsonify({"error": "Collaboration not found"}), 404

        existing_invitation = db.invitations.find_one({
            'receiver_id': ObjectId(receiver_id),
            'sender_id': ObjectId(sender_id),
            'collaboration_id': collaboration_id,
            'status': {'$ne': 'withdrawn'}
        })

        if existing_invitation:
            logging.debug("Invitation already exists for this collaboration")
            return jsonify({'message': 'Invitation already sent for this collaboration'}), 200

        invitation = {
            'uuid': str(uuid.uuid4()),
            'receiver_id': ObjectId(receiver_id),
            'sender_id': ObjectId(sender_id),
            'status': 'pending',
            'phenotype': phenotype,
            'collaboration_id': collaboration_id,
        }

        db.invitations.insert_one(invitation)

        # db.collaborations.update_one(
        #     {'uuid': collaboration_id},
        #     {'$addToSet': {'invited_users': {
        #         'user_id': ObjectId(receiver_id),
        #         'status': 'pending',
        #         'phenotype': phenotype
        #     }}}
        # )

        return jsonify({'message': 'Invitation sent successfully'}), 200

    except Exception as e:
        logging.error(f"Error sending invitation: {str(e)}")
        return jsonify({"error": str(e)}), 500

# @app.route('/api/acceptinvitation', methods=['POST'])
# def accept_invitation():
#     data = request.get_json()
#     print(data)
#     if 'uuid' not in data:
#         return jsonify({'error': 'UUID is missing'}), 400

#     try:
#         uuid = str(data['uuid'])
#     except Exception as e:
#         return jsonify({'error': 'Invalid UUID format'}), 400

#     invitation = db.collaborations.find_one({'uuid': uuid})

#     if invitation:
#         db.collaborations.update_one(
#             {'_id': invitation['_id']},
#             {'$set': {'status': 'accepted'}}
#         )
#         collaboration_id = invitation.get('collaboration_id')
#         receiver_id = invitation.get('receiver_id')

#         if collaboration_id and receiver_id:
#             db.collaborations.update_one(
#                 {'uuid': collaboration_id, 'invited_users.user_id': receiver_id},
#                 {'$set': {'invited_users.$.status': 'accepted'}}
#             )

#         return jsonify({'message': 'Invitation and collaboration status updated successfully to withdrawn'}), 200
#     else:
#         return jsonify({'message': 'No matching invitation found'}), 404

@app.route('/api/acceptinvitation', methods=['POST'])
def accept_invitation():
    data = request.get_json()
    print(data)

    if 'uuid' not in data or 'receiver_id' not in data:
        return jsonify({'error': 'invitationId or receiver_id is missing'}), 400

    try:
        uuid = str(data['uuid'])
        user_id = str(data['receiver_id'])
    except Exception as e:
        return jsonify({'error': 'Invalid UUID or receiver_id format'}), 400

    # Find the collaboration document using the uuid
    collaboration = db.collaborations.find_one({'uuid': uuid})
    

    if collaboration:
        # Update the status of the specific invited user in the collaboration
        #comment if any issues arise
        if not any(str(iu['user_id']) == user_id for iu in collaboration.get('invited_users', [])):
            return jsonify({'message': f'User {user_id} not an invitee.'}), 404
        result = db.collaborations.update_one(
            {'uuid': uuid, 'invited_users.user_id': ObjectId(user_id)},
            {'$set': {'invited_users.$.status': 'accepted'}}   
        )

        if result.modified_count == 0:
            return jsonify({'message': 'No matching user found in invited_users'}), 404

        # If this was the last pending response, automatically kick off the
        # relevant per-experiment workflow for initiator + accepted collaborators.
        # GWAS → chained filter QC via orchestrator.
        # Federated Learning → PCA projection + EMD pipeline in-process.
        try:
            collab_doc = db.collaborations.find_one({"uuid": uuid}, {"experiments": 1})
            experiments_for_hook = (collab_doc or {}).get('experiments') or []
            if EXPERIMENT_FL in experiments_for_hook:
                _maybe_trigger_auto_fl(uuid)
            else:
                _maybe_trigger_auto_chained_qc(uuid)
        except Exception as e:
            logging.warning(f"Auto experiment trigger skipped/failed for {uuid}: {e}")

        return jsonify({'message': 'Invitation status updated successfully to accepted'}), 200
    else:
        return jsonify({'message': 'No matching collaboration found'}), 404



@app.route('/api/withdrawinvitation', methods=['POST'])
def withdraw_invitation():
    data = request.get_json()
    if 'uuid' not in data:
        return jsonify({'error': 'UUID is missing'}), 400

    try:
        uuid = str(data['uuid'])
        user_id = str(data['receiver_id'])

    except Exception as e:
        return jsonify({'error': 'Invalid UUID format'}), 400

    collaboration = db.collaborations.find_one({'uuid': uuid})

    if collaboration:
        result = db.collaborations.update_one(
            {'uuid': uuid, 'invited_users.user_id': ObjectId(user_id)},
            {'$set': {'invited_users.$.status': 'withdrawn'}}   
        )

        if result.modified_count == 0:
            return jsonify({'message': 'No matching user found in invited_users'}), 404

        return jsonify({'message': 'Invitation status updated successfully to withdrawn'}), 200
    else:
        return jsonify({'message': 'No matching collaboration found'}), 404
    
@app.route('/api/revoke_invitation', methods=['POST'])
def revoke_invitation():
    data = request.get_json()
    print(data)
    if 'uuid' not in data:
        return jsonify({'error': 'UUID is missing'}), 400

    try:
        uuid = str(data['uuid'])
        user_id = str(data['receiver_id'])

    except Exception as e:
        return jsonify({'error': 'Invalid UUID format'}), 400

    collaboration = db.collaborations.find_one({'uuid': uuid})

    if collaboration:
        result = db.collaborations.update_one(
            {'uuid': uuid, 'invited_users.user_id': ObjectId(user_id)},
            {'$set': {'invited_users.$.status': 'revoked'}}   
        )

        if result.modified_count == 0:
            return jsonify({'message': 'No matching user found in invited_users'}), 404

        return jsonify({'message': 'Invitation status updated successfully to withdrawn'}), 200
    else:
        return jsonify({'message': 'No matching collaboration found'}), 404


@app.route('/api/rejectinvitation', methods=['POST'])
def reject_invitation():
    data = request.get_json()
    if 'uuid' not in data or 'receiver_id' not in data:
        return jsonify({'error': 'uuid or receiver_id is missing'}), 400

    try:
        uuid = str(data['uuid'])
        user_id = str(data['receiver_id'])
    except Exception as e:
        return jsonify({'error': 'Invalid UUID or receiver_id format'}), 400

    # Find the collaboration document using the uuid
    collaboration = db.collaborations.find_one({'uuid': uuid})

    if collaboration:
        # Update the status of the specific invited user in the collaboration
        result = db.collaborations.update_one(
            {'uuid': uuid, 'invited_users.user_id': ObjectId(user_id)},
            {'$set': {'invited_users.$.status': 'rejected'}}   
        )

        if result.modified_count == 0:
            return jsonify({'message': 'No matching user found in invited_users'}), 404

        # If this was the last pending response, automatically kick off the
        # relevant per-experiment workflow for initiator + accepted collaborators.
        # GWAS → chained filter QC via orchestrator.
        # Federated Learning → PCA projection + EMD pipeline in-process.
        try:
            collab_doc = db.collaborations.find_one({"uuid": uuid}, {"experiments": 1})
            experiments_for_hook = (collab_doc or {}).get('experiments') or []
            if EXPERIMENT_FL in experiments_for_hook:
                _maybe_trigger_auto_fl(uuid)
            else:
                _maybe_trigger_auto_chained_qc(uuid)
        except Exception as e:
            logging.warning(f"Auto experiment trigger skipped/failed for {uuid}: {e}")

        return jsonify({'message': 'Invitation status updated successfully to accepted'}), 200
    else:
        return jsonify({'message': 'No matching collaboration found'}), 404


def _maybe_trigger_auto_fl(collaboration_uuid: str):
    """Kick off the FL pipeline (PCA projection → EMD) once all invitees have
    responded to an FL-typed collaboration. Idempotent — `fl_state.stage`
    advances past 'idle' exactly once.
    """
    if not collaboration_uuid or not FL_AVAILABLE:
        return
    collab = db['collaborations'].find_one({"uuid": str(collaboration_uuid)})
    if not collab:
        return
    experiments = collab.get('experiments') or []
    if EXPERIMENT_FL not in experiments:
        return  # not an FL collaboration
    invited = collab.get('invited_users', []) or []
    if not invited:
        return
    if any((iu.get('status', 'pending') == 'pending') for iu in invited):
        return  # still waiting on responses

    fl_state = collab.get('fl_state') or {}
    stage = fl_state.get('stage')
    if stage and stage not in (fl_pipeline.STAGE_IDLE, fl_pipeline.STAGE_FAILED):
        return  # already running or done

    accepted = [iu for iu in invited if iu.get('status') == 'accepted']
    if not accepted:
        # Nothing to federate — mark complete-ish so UI can surface a clean message.
        db['collaborations'].update_one(
            {"uuid": str(collaboration_uuid)},
            {"$set": {
                "fl_state.stage": fl_pipeline.STAGE_FAILED,
                "fl_state.error": "No accepted invitees — cannot run federated learning.",
            }}
        )
        return

    try:
        fl_pipeline.bootstrap_fl_state(db['collaborations'], str(collaboration_uuid))
        fl_pipeline.launch_projection_and_emd(db['collaborations'], str(collaboration_uuid))
        logging.info(f"✅ FL pipeline launched for {collaboration_uuid}")
    except Exception as exc:
        logging.exception("Failed to launch FL pipeline for %s", collaboration_uuid)
        db['collaborations'].update_one(
            {"uuid": str(collaboration_uuid)},
            {"$set": {
                "fl_state.stage": fl_pipeline.STAGE_FAILED,
                "fl_state.error": f"{type(exc).__name__}: {exc}",
            }}
        )


def _maybe_trigger_auto_chained_qc(collaboration_uuid: str):
    """
    When all invitees have responded (no 'pending'), automatically create QC datasets
    for initiator + accepted collaborators by running the chained filter QC methods
    via the orchestrator.

    Idempotent: will only trigger once per collaboration.
    """
    if not collaboration_uuid:
        return

    collaboration = db['collaborations'].find_one({"uuid": str(collaboration_uuid)})
    if not collaboration:
        return

    # Only trigger once
    if collaboration.get('auto_qc_triggered'):
        return

    invited = collaboration.get('invited_users', []) or []
    if not invited:
        # No invitees -> nothing to wait for; still don't auto-trigger here to avoid surprising behavior.
        return

    # "Collaboration starts" once everyone has responded (accepted/rejected/withdrawn/revoked)
    any_pending = any((iu.get('status', 'pending') == 'pending') for iu in invited)
    if any_pending:
        return

    if not USE_ORCHESTRATOR or not orchestrator:
        raise Exception("Orchestrator not enabled (USE_ORCHESTRATOR=true required) for auto QC creation.")

    # Filter to only per-user filtering methods (not pairwise ones)
    qc_scheme = collaboration.get('qc_scheme', []) or []
    FILTER_METHOD_NAMES = {
        'Missing Data QC', 'Minor Allele Frequency (MAF)', 'Hardy-Weinberg Equilibrium (HWE)',
        'MAF', 'HWE', 'missing', 'maf', 'hwe'
    }
    filter_methods = [m for m in qc_scheme if isinstance(m, dict) and m.get('method', '') in FILTER_METHOD_NAMES]
    if not filter_methods:
        # No filter methods => nothing to auto-create as a per-user QC dataset
        db['collaborations'].update_one({"uuid": str(collaboration_uuid)}, {"$set": {"auto_qc_triggered": True}})
        return

    # Build list of participants to run (initiator + accepted invitees)
    participants = []

    creator_id = str(collaboration.get('creator_id'))
    creator_dataset_id = collaboration.get('creator_dataset_id')
    if creator_id and creator_dataset_id:
        creator_ds = db['datasets'].find_one({"_id": ObjectId(creator_dataset_id)}, {"phenotype": 1})
        creator_pheno = (creator_ds or {}).get('phenotype')
        if creator_pheno:
            participants.append({"user_id": creator_id, "phenotype": creator_pheno, "dataset_id": str(creator_dataset_id)})

    for iu in invited:
        if iu.get('status') != 'accepted':
            continue
        uid = str(iu.get('user_id'))
        pheno = iu.get('phenotype')
        dsid = iu.get('user_dataset_id')
        if uid and pheno and dsid:
            participants.append({"user_id": uid, "phenotype": pheno, "dataset_id": str(dsid)})

    if not participants:
        db['collaborations'].update_one({"uuid": str(collaboration_uuid)}, {"$set": {"auto_qc_triggered": True}})
        return

    # Mark triggered first to prevent double submit in race conditions
    db['collaborations'].update_one(
        {"uuid": str(collaboration_uuid)},
        {"$set": {"auto_qc_triggered": True, "collaboration_started_at": datetime.utcnow()}}
    )

    auto_req_ids = {}
    auto_req_status = {}

    for p in participants:
        uid = p["user_id"]
        pheno = p["phenotype"]
        dsid = p.get("dataset_id")

        user_doc = db['users'].find_one({"_id": ObjectId(uid)}, {"name": 1, "email": 1}) or {}
        username = user_doc.get('name') or (user_doc.get('email') or '').split('@')[0] or f"user_{uid}"
        username = str(username).strip() or f"user_{uid}"

        result = orchestrator.submit_chained_qc_request(
            username=username,
            user_id=uid,
            phenotype=pheno,
            collaboration_uuid=str(collaboration_uuid),
            methods=filter_methods,
            dataset_id=dsid
        )
        if result.get('success') and result.get('request_id'):
            auto_req_ids[uid] = result.get('request_id')
            auto_req_status[uid] = 'processing'
        else:
            auto_req_status[uid] = 'failed'

    if auto_req_ids or auto_req_status:
        db['collaborations'].update_one(
            {"uuid": str(collaboration_uuid)},
            {"$set": {"auto_qc_request_ids": auto_req_ids, "auto_qc_status": auto_req_status}}
        )


# @app.route('/api/start_collaboration', methods=['POST'])
# def start_collaboration():
#     try:
#         current_user, error_response = get_current_user()
#         if error_response:
#             return error_response
#         creator_id = current_user.id

#         data = request.get_json()
#         collab_name = data.get('collabName')
#         experiments = data.get('experiments', [])
#         phenotype = data.get('phenoType')
#         samples = data.get('samples')
#         raw_data = data.get('rawData')
#         invited_users = data.get('invitedUsers', [])

#         if not collab_name:
#             logging.error("Collaboration name missing in the request")
#             return jsonify({"error": "Collaboration name is required"}), 400

#         collaboration = {
#             'uuid': str(uuid.uuid4()),
#             'name': collab_name,
#             'experiments': experiments,
#             'phenotype' :phenotype,
#             'samples' :samples,
#             'raw_data': raw_data, 
#             'initiator_id': ObjectId(creator_id),
#             'invited_users': [
#                 {
#                     'user_id': ObjectId(user['_id']),
#                     'status': 'pending',
#                     'phenotype': user.get('phenotype')
#                 } for user in invited_users
#             ],
#             # 'created_at': datetime.datetime()
#         }

#         result = db.collaborations.insert_one(collaboration)

#         return jsonify({
#             'message': 'Collaboration created successfully',
#             'collaboration_id': str(result.inserted_id),
#             'collaboration_id': collaboration['uuid']
#         }), 201

#     except Exception as e:
#         logging.error(f"Error creating collaboration: {str(e)}")
#         return jsonify({"error": str(e)}), 500
# This code needs to be optimised

'''
Creating collection to store the experiments list
'''
experiment_list_collection = db['experiments']

@app.route('/api/experiments', methods=['GET'])
def get_experiment_list():
    try:
        experiment = experiment_list_collection.find_one({})
        
        # Default QC schemes including the new methods (excluding Privacy Transform - it's part of Sample Relatedness)
        default_qc_schemes = [
            "Sample Relatedness",
            "Population Stratification", 
            "Minor Allele Frequency (MAF)",
            "Hardy-Weinberg Equilibrium (HWE)",
            "Missing Data QC"
        ]
        
        if experiment:
            experiment['_id'] = str(experiment['_id'])
            existing_schemes = experiment.get('quality_control_scheme', [])
            
            # Add any missing default QC schemes
            for scheme in default_qc_schemes:
                if scheme not in existing_schemes:
                    existing_schemes.append(scheme)
            
            # Update in DB if new schemes were added
            if len(existing_schemes) > len(experiment.get('quality_control_scheme', [])):
                experiment_list_collection.update_one(
                    {"_id": ObjectId(experiment['_id'])},
                    {"$set": {"quality_control_scheme": existing_schemes}}
                )
            
            # Surface GWAS + Federated Learning; drop legacy types (Chi-Square etc.)
            raw_types = experiment.get('experiment_types', [])
            experiment_types = [t for t in raw_types if t in ALLOWED_EXPERIMENT_TYPES]
            for default_type in ALLOWED_EXPERIMENT_TYPES:
                if default_type not in experiment_types:
                    experiment_types.append(default_type)
            return jsonify({
                "experiment_types": experiment_types,
                "quality_control_scheme": existing_schemes
            }), 200
        else:
            # Create default experiments entry if none exists
            default_data = {
                "experiment_types": list(ALLOWED_EXPERIMENT_TYPES),
                "quality_control_scheme": default_qc_schemes
            }
            experiment_list_collection.insert_one(default_data)
            return jsonify(default_data), 200
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/experiments', methods=['PUT'])
def update_experiment_list():
    data = request.get_json()

    # Get both experiment types and quality control scheme types
    experiment_types = data.get('experiment_types')
    quality_control_scheme = data.get('quality_control_scheme')

    if experiment_types is None and quality_control_scheme is None:
        return jsonify({"message": "Either experiment_types or quality_control_scheme is required."}), 400

    update_data = {}
    if experiment_types is not None:
        update_data['experiment_types'] = experiment_types
    if quality_control_scheme is not None:
        update_data['quality_control_scheme'] = quality_control_scheme

    try:
        experiment = experiment_list_collection.find_one_and_replace(
            {},  
            update_data,  
            upsert=True, 
            return_document=True  
        )
        
        # Convert ObjectId to string directly here
        if experiment:
            experiment['_id'] = str(experiment['_id'])
        return jsonify(experiment), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/experiments/remove', methods=['PUT'])
def remove_experiment():
    data = request.get_json()

    experiment_type = data.get('experiment_type')
    qc_scheme_type = data.get('qc_scheme_type')

    if not experiment_type and not qc_scheme_type:
        return jsonify({"message": "Either experiment_type or qc_scheme_type is required."}), 400

    update_data = {}
    if experiment_type:
        update_data["$pull"] = {"experiment_types": experiment_type}
    if qc_scheme_type:
        update_data["$pull"] = {"quality_control_scheme": qc_scheme_type}

    try:
        # Update document by removing experiment or quality control scheme
        experiment = experiment_list_collection.find_one_and_update(
            {},
            update_data,
            return_document=True
        )
        if experiment:
            experiment['_id'] = str(experiment['_id'])  
            return jsonify(experiment), 200
        return jsonify({"message": "Experiment type or QC scheme type not found."}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    

@app.route('/api/start_collaboration', methods=['GET', 'POST'])
def start_collaboration():
    if request.method == 'GET':
        return get_start_collaboration()
    elif request.method == 'POST':
        return post_start_collaboration()
    else:
        return jsonify({'error': 'Method not allowed'}), 405

def get_start_collaboration():
    try:
        # Authenticate the current user
        current_user, error_response = get_current_user()
        if error_response:
            return error_response

        user_id = str(current_user.id)  
        user_id_obj = ObjectId(current_user.id)  # Also get ObjectId format for type-safe querying

        experiments = list(db.experiments.find())
        raw_types = experiments[0].get('experiment_types', []) if experiments else []
        filtered_types = [t for t in raw_types if t in ALLOWED_EXPERIMENT_TYPES]
        for default_type in ALLOWED_EXPERIMENT_TYPES:
            if default_type not in filtered_types:
                filtered_types.append(default_type)
        experiments_list = [{'experiment_types': filtered_types}]
        
        # Get QC schemes with same logic as get_experiment_list to ensure all default schemes are present
        experiment = experiment_list_collection.find_one({})
        
        # Default QC schemes (excluding Privacy Transform - it's part of Sample Relatedness)
        default_qc_schemes = [
            "Sample Relatedness",
            "Population Stratification", 
            "Minor Allele Frequency (MAF)",
            "Hardy-Weinberg Equilibrium (HWE)",
            "Missing Data QC"
        ]
        
        if experiment:
            existing_schemes = experiment.get('quality_control_scheme', [])
            
            # Add any missing default QC schemes
            for scheme in default_qc_schemes:
                if scheme not in existing_schemes:
                    existing_schemes.append(scheme)
            
            # Update in DB if new schemes were added
            if len(existing_schemes) > len(experiment.get('quality_control_scheme', [])):
                experiment_list_collection.update_one(
                    {"_id": ObjectId(experiment['_id'])},
                    {"$set": {"quality_control_scheme": existing_schemes}}
                )
            
            qc_schemes_list = [{'quality_control_scheme': existing_schemes}]
        else:
            # Create default experiments entry if none exists
            default_data = {
                "experiment_types": ["GWAS"],
                "quality_control_scheme": default_qc_schemes
            }
            experiment_list_collection.insert_one(default_data)
            qc_schemes_list = [{'quality_control_scheme': default_qc_schemes}]
        
        # Get raw datasets (metadata entries without QC processing)
        # Query for both string and ObjectId formats to handle type inconsistencies
        # Also explicitly require user_id field to exist
        raw_datasets_cursor = db.datasets.find(
            {
                '$or': [
            {'user_id': user_id},
                    {'user_id': user_id_obj}
                ],
                'is_qc_data': {'$ne': True},
                # Per-collaboration empty placeholders — not valid "own" raw data for new collabs
                'collaboration_specific': {'$ne': True},
                'user_id': {'$exists': True}  # Explicitly require user_id field to exist
            },
            {'phenotype': 1, 'number_of_samples': 1, '_id': 1, 'user_id': 1}
        )
        datasets = []
        raw_entries = []
        for dataset in raw_datasets_cursor:
            # Double-check user_id matches (handle both string and ObjectId formats)
            dataset_user_id = dataset.get('user_id')
            if not dataset_user_id:
                logging.warning(f"Dataset {dataset.get('_id')} has no user_id field. Skipping.")
                continue
                
            # Normalize user_id for comparison (convert ObjectId to string)
            dataset_user_id_str = str(dataset_user_id) if dataset_user_id else None
            if dataset_user_id_str != user_id:
                logging.warning(f"Dataset {dataset.get('_id')} user_id mismatch: {dataset_user_id_str} != {user_id}. Skipping.")
                continue
            
            dataset_id = dataset.get('_id', 'N/A')
            phenotype = dataset.get('phenotype', 'N/A')
            number_of_samples = dataset.get('number_of_samples', '0')

            dataset_id = str(dataset_id) if not isinstance(dataset_id, str) else dataset_id
            phenotype = str(phenotype) if not isinstance(phenotype, str) else phenotype
            number_of_samples = str(number_of_samples) if not isinstance(number_of_samples, str) else number_of_samples

            raw_entries.append({
                'phenotype': phenotype,
                'number_of_samples': number_of_samples,
                'dataset_id': dataset_id,
                '_id': dataset.get('_id'),
            })
        # Deduplicate: same phenotype + sample count from repeated metadata submits — keep newest _id
        raw_entries.sort(key=lambda x: x['_id'], reverse=True)
        seen_raw = set()
        for e in raw_entries:
            key = (e['phenotype'], e['number_of_samples'])
            if key in seen_raw:
                continue
            seen_raw.add(key)
            datasets.append({
                'phenotype': e['phenotype'],
                'number_of_samples': e['number_of_samples'],
                'dataset_id': e['dataset_id'],
                'is_qc_data': False
            })
        
        # Get QC processed datasets
        # Query for both string and ObjectId formats to handle type inconsistencies
        # Also explicitly require user_id field to exist
        qc_datasets_cursor = db.datasets.find(
            {
                '$or': [
                    {'user_id': user_id},
                    {'user_id': user_id_obj}
                ],
                'is_qc_data': True,
                'user_id': {'$exists': True}  # Explicitly require user_id field to exist
            },
            {'phenotype': 1, 'number_of_samples': 1, '_id': 1, 'qc_method': 1, 'qc_output_name': 1, 'user_id': 1}
        )
        qc_datasets = []
        qc_rows = []
        for dataset in qc_datasets_cursor:
            # Double-check user_id matches (handle both string and ObjectId formats)
            dataset_user_id = dataset.get('user_id')
            if not dataset_user_id:
                logging.warning(f"QC dataset {dataset.get('_id')} has no user_id field. Skipping.")
                continue
                
            # Normalize user_id for comparison (convert ObjectId to string)
            dataset_user_id_str = str(dataset_user_id) if dataset_user_id else None
            if dataset_user_id_str != user_id:
                logging.warning(f"QC dataset {dataset.get('_id')} user_id mismatch: {dataset_user_id_str} != {user_id}. Skipping.")
                continue
            
            dataset_id = str(dataset.get('_id', ''))
            phenotype_raw = dataset.get('phenotype')
            
            # Validate phenotype - skip if None or empty
            if not phenotype_raw or (isinstance(phenotype_raw, str) and phenotype_raw.strip() == ''):
                logging.warning(f"QC dataset {dataset_id} has missing or invalid phenotype. Skipping.")
                continue
                
            phenotype = str(phenotype_raw).strip()
            number_of_samples = str(dataset.get('number_of_samples', '0'))
            qc_method = dataset.get('qc_method', 'unknown')
            output_name = dataset.get('qc_output_name', f"{phenotype}_{qc_method}")

            qc_rows.append({
                '_id': dataset.get('_id'),
                'phenotype': phenotype,
                'number_of_samples': number_of_samples,
                'dataset_id': dataset_id,
                'qc_method': qc_method,
                'output_name': output_name,
            })
        # Deduplicate QC rows: same phenotype + method — keep newest
        qc_rows.sort(key=lambda x: x['_id'], reverse=True)
        seen_qc = set()
        for row in qc_rows:
            key = (row['phenotype'], row['qc_method'])
            if key in seen_qc:
                continue
            seen_qc.add(key)
            qc_datasets.append({
                'phenotype': row['phenotype'],
                'number_of_samples': row['number_of_samples'],
                'dataset_id': row['dataset_id'],
                'qc_method': row['qc_method'],
                'output_name': row['output_name'],
                'is_qc_data': True
            })
            datasets.append({
                'phenotype': f"{row['phenotype']} ({row['qc_method']})",
                'number_of_samples': row['number_of_samples'],
                'dataset_id': row['dataset_id'],
                'is_qc_data': True,
                'qc_method': row['qc_method']
            })
        
        return jsonify({
            'experiments': experiments_list,
            'qc_schemes': qc_schemes_list,
            'datasets': datasets,
            'qc_datasets': qc_datasets
        }), 200

    except Exception as e:
        logging.error(f"Error fetching datasets: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

def post_start_collaboration():
    try:
        current_user, error_response = get_current_user()
        if error_response:
            return error_response
        creator_id = current_user.id

        data = request.get_json()
        collab_name = data.get('collabName')
        experiments = data.get('experiments', [])
        raw_qc_scheme = data.get('collabQcScheme', [])
        # Normalize: accept both old format (["MAF"]) and new format ([{"method":"MAF","params":{}}])
        collabQcScheme = []
        for item in raw_qc_scheme:
            if isinstance(item, str):
                collabQcScheme.append({"method": item, "params": {}})
            elif isinstance(item, dict) and "method" in item:
                collabQcScheme.append(item)
        # Federated Learning has a fixed preprocessing scheme (public-PCA + DP
        # projection only). If FL was selected, override whatever the UI sent so
        # the rest of the pipeline can rely on a canonical shape.
        if EXPERIMENT_FL in experiments:
            epsilon = FL_DEFAULT_EPSILON if FL_AVAILABLE else 3.0
            # Allow the UI to pass through a user-chosen epsilon.
            for item in raw_qc_scheme:
                if isinstance(item, dict) and item.get('method') == FL_QC_METHOD:
                    params = item.get('params') or {}
                    if 'epsilon' in params:
                        try:
                            epsilon = float(params['epsilon'])
                        except (TypeError, ValueError):
                            pass
            collabQcScheme = [{
                "method": FL_QC_METHOD,
                "params": {"epsilon": float(epsilon), "clip_norm": 5.0},
            }]
        invited_users = data.get('invitedUsers', [])
        creator_dataset_id = data.get('creatorDatasetId')
        logging.info(invited_users)

        if not collab_name:
            logging.error("Collaboration name missing in the request")
            return jsonify({"error": "Collaboration name is required"}), 400
            
        # Create NEW empty datasets for each invited user for THIS specific collaboration
        # This ensures each collaboration has its own independent dataset
        invited_users_with_new_datasets = []
        for user in invited_users:
            user_id = user['_id']
            original_dataset_id = user['dataset_id']
            phenotype = user.get('phenotype', 'N/A')
            
            # Get the original dataset to copy metadata (phenotype, number_of_samples)
            original_dataset = db['datasets'].find_one({'_id': ObjectId(original_dataset_id)})
            if not original_dataset:
                logging.warning(f"Original dataset {original_dataset_id} not found for user {user_id}. Creating empty dataset.")
                number_of_samples = '0'
            else:
                number_of_samples = original_dataset.get('number_of_samples', '0')
                # Use phenotype from original dataset if not provided
                if not phenotype or phenotype == 'N/A':
                    phenotype = original_dataset.get('phenotype', 'N/A')
            
            # Create a NEW empty dataset specifically for this collaboration
            new_dataset = {
                "user_id": str(user_id),
                "phenotype": phenotype,
                "number_of_samples": number_of_samples,
                "data": {},  # Empty - user will fill this when they select/create QC data
                "original_dataset_id": str(original_dataset_id),  # Reference to original for metadata
                "collaboration_specific": True  # Flag to identify collaboration-specific datasets
            }
            
            result = db['datasets'].insert_one(new_dataset)
            new_dataset_id = result.inserted_id
            
            logging.info(f"✅ Created NEW dataset {new_dataset_id} for user {user_id} (phenotype: {phenotype}) for collaboration {collab_name}")
            
            invited_users_with_new_datasets.append({
                'user_id': ObjectId(user_id),
                'user_dataset_id': new_dataset_id,  # Use the NEW dataset ID
                'status': 'pending',
                'phenotype': phenotype,
            })

        collaboration = {
            'uuid': str(uuid.uuid4()),
            'name': collab_name,
            'experiments': experiments,
            'qc_scheme' : collabQcScheme,
            'creator_id': ObjectId(creator_id),
            'creator_dataset_id': ObjectId(creator_dataset_id),
            'invited_users': invited_users_with_new_datasets,
            # 'created_at': datetime.datetime.utcnow()  # Optionally add timestamp
        }

        result = db.collaborations.insert_one(collaboration)
        logging.info(f"Inserted collaboration with id: {result.inserted_id}")

        # Bootstrap FL state so the pipeline has somewhere to write progress as
        # invitees respond. The auto-trigger (see _maybe_trigger_auto_fl) will
        # flip the stage from idle → projecting once the quorum is reached.
        if EXPERIMENT_FL in experiments and FL_AVAILABLE:
            try:
                fl_pipeline.bootstrap_fl_state(db['collaborations'], collaboration['uuid'])
            except Exception as fl_exc:
                logging.warning(f"FL state bootstrap failed for {collaboration['uuid']}: {fl_exc}")

        return jsonify({
            'message': 'Collaboration created successfully',
            'collaboration_id': collaboration['uuid']
        }), 201

    except Exception as e:
        logging.error(f"Error creating collaboration: {str(e)}")
        logging.error(traceback.format_exc())
        return jsonify({"error": "Internal server error"}), 500

# @app.route('/api/collaboration/<uuid>', methods=['GET', 'POST'])
# def collaboration_details(uuid):
#     try:
#         collaboration = db.collaborations.find_one({'uuid': uuid})
#         # print(f"Fetching collaboration for UUID: {uuid}")
#         # print(f"Collaboration fetched from DB: {collaboration}")

#         if not collaboration:
#             return jsonify({'error': 'Collaboration not found'}), 404

#         current_user, error_response = get_current_user()
#         if error_response:
#             return error_response

#         user_id = str(current_user.id) 
#         is_sender = collaboration['creator_id'] == ObjectId(user_id)
#         sender_user = db.users.find_one({"_id": ObjectId(collaboration["creator_id"])})
#         sender_name = sender_user["name"] if sender_user else "Unknown"

#         invited_users_details = []
#         is_receiver = any(user['user_id'] == ObjectId(user_id) for user in collaboration['invited_users'])
#         for invited_user in collaboration.get('invited_users', []):
#                 receiver_user = db.users.find_one({"_id": ObjectId(invited_user["user_id"])})
#                 receiver_name = receiver_user["name"] if receiver_user else "Unknown"
#                 phenotype = invited_user["phenotype"]
#                 status = invited_user["status"]

#                 invited_users_details.append({
#                     'user_id': str(invited_user["user_id"]),  
#                     'name': receiver_name,
#                     'phenotype': phenotype,
#                     'status':  status
#     })

#         if request.method == 'GET':
#             dataset = db.datasets.find_one(
#                 {'_id': ObjectId(collaboration["creator_dataset_id"])},
#                 {'phenotype': 1, 'number_of_samples': 1}
#             )

#             # Initialize default values in case fields are missing
#             phenotype = dataset.get('phenotype', 'N/A') if dataset else 'N/A'
#             number_of_samples = dataset.get('number_of_samples', '0') if dataset else '0'

#             # Ensure values are strings
#             if not isinstance(phenotype, str):
#                 phenotype = str(phenotype)
#             if not isinstance(number_of_samples, str):
#                 number_of_samples = str(number_of_samples)


#             creator_dataset  = {
#                 'phenotype': phenotype,
#                 'samples': number_of_samples
#             }

#             collaboration_details = {
#                 'uuid': collaboration['uuid'],
#                 'name': collaboration['name'],
#                 'experiments': collaboration.get('experiments', []),
#                 'phenotype': collaboration.get('phenotype', None),
#                 'samples': collaboration.get('samples', None),
#                 # 'raw_data': collaboration.get('raw_data', None),
#                 'sender_id': is_sender,
#                 'sender_name': sender_name,
#                 'invited_users': invited_users_details,
#                 'datasets': creator_dataset 
#             }
#             return jsonify(collaboration_details), 200

#         if request.method == 'POST':
#             data = request.get_json()
#             print(f"Data received from frontend: {data}")

#             if not data:  # Check if data is None or empty
#                 return jsonify({'error': 'No data provided'}), 400

#             if is_sender:
#                 if 'experiments' in data:
#                     db.collaborations.update_one(
#                         {'uuid': uuid},
#                         {'$set': {'experiments': data['experiments']}}
#                     )

#                 if 'add_people' in data:
#                     for person in data['add_people']:
#                         # Validate person format before adding
#                         if 'user_id' in person:
#                             db.collaborations.update_one(
#                                 {'uuid': uuid},
#                                 {'$addToSet': {'invited_users': person}}
#                             )
#                         else:
#                             return jsonify({'error': 'Invalid person format'}), 400

#                 if 'remove_people' in data:
#                     for person_id in data['remove_people']:
#                         # Validate person_id format
#                         if isinstance(person_id, str):
#                             db.collaborations.update_one(
#                                 {'uuid': uuid},
#                                 {'$pull': {'invited_users': {'user_id': person_id}}}
#                             )
#                         else:
#                             return jsonify({'error': 'Invalid person_id format'}), 400

#             elif is_receiver:
#                 if 'meta_data' in data:
#                     pass
#                 if 'raw_data' in data:
#                     pass
#                 if 'invitation_status' in data:
#                     db.invitations.update_one(
#                         {'collaboration_id': uuid, 'receiver_id': user_id},
#                         {'$set': {'status': data['invitation_status']}}
#                     )

#             return jsonify({'message': 'Collaboration updated successfully'}), 200

#     except Exception as e:
#         print(f"Error occurred: {str(e)}")
#         return jsonify({'error': str(e)}), 500

@app.route('/api/collaboration/<uuid>', methods=['GET'])
def get_collaboration_details(uuid):
    try:
        collaboration = db.collaborations.find_one({'uuid': uuid})
        if not collaboration:
            return jsonify({'error': 'Collaboration not found'}), 404

        current_user, error_response = get_current_user()
        if error_response:
            return error_response

        user_id = str(current_user.id)

        is_sender = collaboration['creator_id'] == ObjectId(user_id)
        sender_id = str(collaboration['creator_id'])  
        sender_user = db.users.find_one({"_id": ObjectId(collaboration["creator_id"])})
        sender_name = sender_user["name"] if sender_user else "Unknown"
         

        invited_users_details = []
        for invited_user in collaboration.get('invited_users', []):
            receiver_user = db.users.find_one({"_id": ObjectId(invited_user["user_id"])})
            receiver_name = receiver_user["name"] if receiver_user else "Unknown"
            status = invited_user["status"]
            user_dataset_id= str(invited_user["user_dataset_id"])

            invited_user_dataset = db.datasets.find_one({'_id': ObjectId(user_dataset_id)})
            #need to remove this if user has to upload their dataset for every collaboration
            invited_user_dataset_uploaded = True if invited_user_dataset and len(invited_user_dataset.get('data', [])) > 0 else False

            # Get phenotype with priority:
            # 1. From collaboration invited_users array (most authoritative source)
            # 2. From the dataset itself
            # 3. From any other dataset of the user
            phenotype = invited_user.get('phenotype')  # First try from collaboration document
            
            # If phenotype from collaboration is missing or invalid, try dataset
            if not phenotype or phenotype == 'N/A' or (isinstance(phenotype, str) and phenotype.strip() == ''):
                phenotype = invited_user_dataset.get('phenotype') if invited_user_dataset else None
            
            # If still missing or invalid, try to get it from any of the user's datasets
            if not phenotype or phenotype == 'N/A' or (isinstance(phenotype, str) and phenotype.strip() == ''):
                # Try to find any dataset from this user with a valid phenotype
                user_other_datasets = list(db['datasets'].find(
                    {
                        'user_id': {'$in': [str(invited_user["user_id"]), ObjectId(invited_user["user_id"])]},
                        'phenotype': {'$exists': True, '$ne': None, '$ne': '', '$ne': 'N/A'},
                        'is_qc_data': {'$ne': True}  # Only look at raw datasets
                    },
                    {'phenotype': 1}
                ).limit(1))
                
                if user_other_datasets and user_other_datasets[0].get('phenotype'):
                    phenotype = str(user_other_datasets[0]['phenotype']).strip()
                    logging.info(f"Retrieved phenotype '{phenotype}' from user's other dataset for collaboration {uuid}")
            
            number_of_samples = invited_user_dataset.get('number_of_samples') if invited_user_dataset else None

            invited_users_details.append({
                'user_id': str(invited_user["user_id"]),
                'name': receiver_name,
                'status': status,
                'user_dataset_id': user_dataset_id,
                'is_dataset_uploaded': invited_user_dataset_uploaded,
                'phenotype': phenotype,
                'number_of_samples': number_of_samples
            })


        stats = collaboration.get('stats', {})
        stat_uploaded_user_ids = set(stats.keys())
        
        obligated_user_ids = {sender_id} # Initiator is always obligated
        for invited_user in invited_users_details:
            if invited_user.get("status") == "accepted":
                obligated_user_ids.add(invited_user.get("user_id"))
                
        
        missing_stat_user_ids = list(obligated_user_ids - stat_uploaded_user_ids)
        all_stats_uploaded = not missing_stat_user_ids # True if the missing list is empty
        # To fetch the data of creator/initator
        dataset = db.datasets.find_one(
            {'_id': ObjectId(collaboration["creator_dataset_id"])},
            {'phenotype': 1, 'number_of_samples': 1}
        )
        

        
        # Making multiple queries can be optimised but using for time being
        creator_phenotype = dataset.get('phenotype', 'N/A') if dataset else 'N/A'
        creator_number_of_samples = dataset.get('number_of_samples', '0') if dataset else '0'
        creator_dataset = {
            'phenotype': creator_phenotype,
            'samples': creator_number_of_samples
        }

    

        # Normalize qc_scheme to object format for backward compat
        raw_qc = collaboration.get('qc_scheme', [])
        normalized_qc = []
        for item in raw_qc:
            if isinstance(item, str):
                normalized_qc.append({"method": item, "params": {}})
            elif isinstance(item, dict) and "method" in item:
                normalized_qc.append(item)

        collaboration_details = {
            'uuid': collaboration['uuid'],
            'name': collaboration['name'],
            'experiments': collaboration.get('experiments', []),
            'collabQcScheme': normalized_qc,
            'is_sender': is_sender,
            'sender_id': sender_id,
            'sender_name': sender_name,
            'invited_users': invited_users_details,
            'creator_datasets': creator_dataset,
            "missing_stat_user": missing_stat_user_ids,
            "stat_uploaded": all_stats_uploaded,
            'current_logged_in_user_id': user_id,
            'surviving_snps': collaboration.get('surviving_snps', {}),
            'surviving_samples': collaboration.get('surviving_samples', {}),
        }

        return jsonify(collaboration_details), 200

    except Exception as e:
        print(f"Error occurred: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/collaboration/<uuid>', methods=['PUT'])
def update_collaboration_details(uuid):
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        current_user, error_response = get_current_user()
        if error_response:
            return error_response

        user_id = str(current_user.id)

        collaboration = db.collaborations.find_one({'uuid': uuid})
        if not collaboration:
            return jsonify({'error': 'Collaboration not found'}), 404

        is_sender = collaboration['creator_id'] == ObjectId(user_id)
        is_receiver = any(user['user_id'] == ObjectId(user_id) for user in collaboration['invited_users'])

        if is_sender:
            if 'experiments' in data:
                db.collaborations.update_one(
                    {'uuid': uuid},
                    {'$set': {'experiments': data['experiments']}}
                )

            if 'add_people' in data:
                for person in data['add_people']:
                    if 'user_id' in person:
                        db.collaborations.update_one(
                            {'uuid': uuid},
                            {'$addToSet': {'invited_users': person}}
                        )
                    else:
                        return jsonify({'error': 'Invalid person format'}), 400

            if 'remove_people' in data:
                for person_id in data['remove_people']:
                    if isinstance(person_id, str):
                        db.collaborations.update_one(
                            {'uuid': uuid},
                            {'$pull': {'invited_users': {'user_id': ObjectId(person_id)}}}
                        )
                    else:
                        return jsonify({'error': 'Invalid person_id format'}), 400

        elif is_receiver:
            if 'meta_data' in data:
                db.collaborations.update_one(
                    {'uuid': uuid},
                    {'$set': {'meta_data': data['meta_data']}}
                )
            if 'invitation_status' in data:
                db.collaborations.update_one(
                    {'uuid': uuid},
                    {'$set': {'invitation_status': data['invitation_status']}}
                )

        return jsonify({'message': 'Collaboration updated successfully'}), 200

    except Exception as e:
        print(f"Error occurred: {str(e)}")
        return jsonify({'error': str(e)}), 500

# @app.route('/api/upload_csv_qc', methods=['POST'])
# def upload_csv_qc():
#     try:
#         auth_header = request.headers.get('Authorization')
#         if not auth_header:
#             logging.error("Authorization header missing")
#             return jsonify({"error": "Authorization header missing"}), 401

#         token = auth_header.split()[1]
#         current_user = User.verify_auth_token(token)

#         if not current_user:
#             logging.error("Invalid token or user not found")
#             return jsonify({"error": "Invalid token or user not found"}), 401

#         user_id = current_user.id

#         # Check if the post request has the file part
#         if 'file' not in request.files:
#             logging.error('No file part in the request')
#             return jsonify({'message': 'No file part in the request'}), 400

#         file = request.files['file']

#         # If the user does not select a file, the browser submits an empty file without a filename
#         if file.filename == '':
#             logging.error('No selected file')
#             return jsonify({'message': 'No selected file'}), 400

#         if file and file.filename.endswith('.csv'):
#             phenotype = request.form.get('field1')
#             number_of_samples = request.form.get('field2')

#             try:
#                 # Read the file directly into a DataFrame, setting the first column as sample_id
#                 df = pd.read_csv(file, index_col=0)
#                 df.index.name = 'sample_id'  # Set the index name

#                 # Check if DataFrame is not empty
#                 if not df.empty:
#                     data = {}

#                     # Store each row in the data dictionary using sample_id as the key
#                     for sample_id, row in df.iterrows():
#                         data[str(sample_id)] = row.to_dict()

#                     # Insert records into the datasets collection
#                     db['datasets'].insert_one({
#                         "user_id": str(user_id),
#                         "phenotype": str(phenotype),
#                         "number_of_samples": str(number_of_samples),
#                         "data": data
#                     })
#                 else:
#                     logging.error('CSV file is empty')
#                     return jsonify({'message': 'CSV file is empty'}), 400

#             except Exception as e:
#                 logging.error(f'Error reading CSV or inserting into DB: {str(e)}')
#                 logging.error(traceback.format_exc())
#                 return jsonify({'message': 'An error occurred while processing the file', 'error': str(e)}), 500

#             return jsonify({'message': 'CSV file processed successfully'}), 200
#         else:
#             logging.error('Unsupported file type')
#             return jsonify({'message': 'Unsupported file type'}), 400
#     except Exception as e:
#         logging.error(f'Unexpected error: {str(e)}')
#         logging.error(traceback.format_exc())
#         return jsonify({'message': 'An error occurred while processing the file', 'error': str(e)}), 500

@app.route('/api/upload_csv_qc', methods=['POST'])
def upload_csv_qc():
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            logging.error("Authorization header missing")
            return jsonify({"error": "Authorization header missing"}), 401

        token = auth_header.split()[1]
        current_user = User.verify_auth_token(token)

        if not current_user:
            logging.error("Invalid token or user not found")
            return jsonify({"error": "Invalid token or user not found"}), 401

        user_id = current_user.id

        # Get metadata fields from the form data
        phenotype = request.form.get('phenotype')
        number_of_samples = request.form.get('number_of_samples')

        if not phenotype or not number_of_samples:
            return jsonify({"error": "Missing required fields"}), 400

        # Create a new dataset record in the database (without data at this stage)
        dataset = {
            "user_id": str(user_id),
            "phenotype": phenotype,
            "number_of_samples": number_of_samples,
            "data": {}  # No data at the moment, will be updated later with CSV
        }

        # Insert into the database
        result = db['datasets'].insert_one(dataset)
        dataset_id = str(result.inserted_id)

        print('Data from frontend:', request.form)

        # Initialize QC Controller database for this user
        try:
            user_name = current_user.user_json.get('name', str(user_id))
            
            # Choose between Orchestrator or Direct QC Controller
            if USE_ORCHESTRATOR and orchestrator:
                # Use Kubernetes Orchestrator
                logging.info(f"🚀 Initializing via Orchestrator: {user_name}, {phenotype}")
                qc_init_result = orchestrator.submit_qc_request(
                    username=user_name,
                    user_id=user_id,
                    phenotype=phenotype,
                    action='initialize'
                )
                if qc_init_result.get('success'):
                    logging.info(f"✅ QC initialized via Orchestrator for {user_name}")
                else:
                    logging.warning(f"⚠️  QC initialization via Orchestrator failed: {qc_init_result.get('error')}")
            else:
                # Use Direct QC Controller
                logging.info(f"📡 Initializing via Direct QC Controller: {user_name}, {phenotype}")
                qc_init_response = http_requests.post(
                    f"{QC_CONTROLLER_URL}/api/qc",
                    json={
                        "username": user_name,
                        "phenotype": phenotype,
                        "action": "initialize"
                    },
                    timeout=30
                )
                if qc_init_response.status_code == 200:
                    logging.info(f"✅ QC Controller initialized for user {user_name}")
                else:
                    logging.warning(f"⚠️  QC Controller initialization failed: {qc_init_response.text}")
        except Exception as qc_error:
            logging.warning(f"⚠️  Could not initialize QC: {str(qc_error)}")

        return jsonify({"message": "Metadata uploaded successfully", "dataset_id": dataset_id}), 200

    except Exception as e:
        logging.error(f'Unexpected error: {str(e)}')
        return jsonify({'message': 'An error occurred while processing the metadata', 'error': str(e)}), 500


# ============== QC Controller Proxy Endpoints ==============

@app.route('/api/qc/listing', methods=['POST'])
def qc_listing():
    """Get list of QC datasets for a user"""
    try:
        current_user, error_response = get_current_user()
        if error_response:
            return error_response

        data = request.get_json() or {}
        phenotype = data.get('phenotype')
        
        if not phenotype:
            return jsonify({"error": "Phenotype is required"}), 400

        user_name = current_user.user_json.get('name', str(current_user.id))
        user_id = str(current_user.id)
        
        # Use orchestrator if enabled, otherwise direct QC Controller
        if USE_ORCHESTRATOR and orchestrator:
            logging.info(f"🚀 Using Orchestrator for listing: {user_name}, {phenotype}")
            request_data = {
                "username": user_name,
                "user_id": user_id,
                "phenotype": phenotype,
                "action": "listing",
                "params": {}
            }
            qc_result = orchestrator.submit_qc_request(
                user_id=user_id,
                username=user_name,
                request_data=request_data
            )
            
            if qc_result.get('success'):
                # For listing, we need to wait for result (it's quick)
                request_id = qc_result.get('request_id')
                if request_id:
                    # Poll for result (listing is fast, should complete quickly)
                    import time
                    max_wait = 10  # 10 seconds max
                    waited = 0
                    while waited < max_wait:
                        status_result = orchestrator.get_qc_status(request_id)
                        if status_result.get('status') == 'completed':
                            results = status_result.get('results', {})
                            return jsonify(results), 200
                        elif status_result.get('status') == 'failed':
                            return jsonify({"error": status_result.get('error', 'Listing failed')}), 500
                        time.sleep(0.5)
                        waited += 0.5
                    return jsonify({"error": "Listing request timed out"}), 500
                else:
                    return jsonify({"error": "No request ID returned"}), 500
            else:
                return jsonify({"error": qc_result.get('error', 'Orchestrator error')}), 500
        else:
            # Use Direct QC Controller
            logging.info(f"📡 Using Direct QC Controller for listing: {user_name}, {phenotype}")
            response = http_requests.post(
                f"{QC_CONTROLLER_URL}/api/qc",
                json={
                    "username": user_name,
                    "phenotype": phenotype,
                    "action": "listing"
                },
                timeout=30
            )
            return jsonify(response.json()), response.status_code

    except Exception as e:
        logging.error(f"Error in qc_listing: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/qc/create', methods=['POST'])
def qc_create():
    """Create a new QC dataset using specified method"""
    try:
        current_user, error_response = get_current_user()
        if error_response:
            return error_response

        data = request.get_json() or {}
        phenotype = data.get('phenotype')
        method = data.get('method')
        
        logging.info(f"🔍 QC Create Request - User: {current_user.user_json.get('name')}, Phenotype: '{phenotype}', Method: {method}")
        
        if not method:
            return jsonify({"error": "QC method is required"}), 400

        user_name = current_user.user_json.get('name', str(current_user.id))
        user_id = str(current_user.id)
        
        # Validate and fix phenotype if missing or invalid
        if not phenotype or phenotype == 'N/A' or (isinstance(phenotype, str) and phenotype.strip() == ''):
            logging.warning(f"⚠️  Phenotype is missing or invalid: '{phenotype}'. Attempting to retrieve from user's datasets...")
            
            # Try to get phenotype from user's datasets in main database
            user_datasets = list(db['datasets'].find(
                {'user_id': {'$in': [user_id, ObjectId(user_id)]}, 'is_qc_data': {'$ne': True}},
                {'phenotype': 1}
            ).limit(1))
            
            if user_datasets and user_datasets[0].get('phenotype'):
                phenotype = str(user_datasets[0]['phenotype']).strip()
                logging.info(f"Retrieved phenotype '{phenotype}' from user's datasets for QC creation")
            else:
                # Try to get from orchestrator/QC worker's rawdata collection
                try:
                    if USE_ORCHESTRATOR and orchestrator:
                        # Use orchestrator for listing
                        request_data = {
                            "username": user_name,
                            "user_id": user_id,
                            "action": "listing",
                            "params": {}
                        }
                        qc_result = orchestrator.submit_qc_request(
                            user_id=user_id,
                            username=user_name,
                            request_data=request_data
                        )
                        if qc_result.get('success'):
                            request_id = qc_result.get('request_id')
                            if request_id:
                                import time
                                max_wait = 10
                                waited = 0
                                while waited < max_wait:
                                    status_result = orchestrator.check_status(request_id)
                                    if status_result.get('status') == 'completed':
                                        qc_list_data = status_result.get('results', {})
                                        # Extract phenotype from files (format: phenotype.csv)
                                        files = qc_list_data.get('files', [])
                                        if files:
                                            first_file = files[0]
                                            if isinstance(first_file, str) and first_file.endswith('.csv'):
                                                phenotype = first_file[:-4]  # Remove .csv extension
                                                logging.info(f"Retrieved phenotype '{phenotype}' from orchestrator")
                                                break
                                    elif status_result.get('status') == 'failed':
                                        break
                                    time.sleep(0.5)
                                    waited += 0.5
                    else:
                        # Fallback to direct QC Controller
                        qc_list_response = http_requests.post(
                            f"{QC_CONTROLLER_URL}/api/qc",
                            json={
                                "username": user_name,
                                "action": "listing"
                            },
                            timeout=30
                        )
                        if qc_list_response.status_code == 200:
                            qc_list_data = qc_list_response.json()
                            # Extract phenotype from rawdata filenames (format: phenotype.csv)
                            if qc_list_data.get('success') and qc_list_data.get('rawdata_files'):
                                rawdata_files = qc_list_data.get('rawdata_files', [])
                                if rawdata_files:
                                    first_file = rawdata_files[0]
                                    if isinstance(first_file, dict):
                                        filename = first_file.get('filename', '')
                                    else:
                                        filename = str(first_file)
                                    if filename.endswith('.csv'):
                                        phenotype = filename[:-4]  # Remove .csv extension
                                        logging.info(f"Retrieved phenotype '{phenotype}' from QC Controller rawdata")
                except Exception as qc_fetch_error:
                    logging.warning(f"Could not fetch phenotype from QC service: {str(qc_fetch_error)}")
        
        # Final validation
        if not phenotype or phenotype == 'N/A' or (isinstance(phenotype, str) and phenotype.strip() == ''):
            return jsonify({
                "error": "Phenotype is required. Please ensure you have uploaded metadata or raw data with a valid phenotype name."
            }), 400
        
        phenotype = str(phenotype).strip()  # Ensure it's a clean string
        
        # Choose between Orchestrator (Kubernetes) or Direct QC Controller
        if USE_ORCHESTRATOR and orchestrator:
            # Use Kubernetes Orchestrator - SYNC MODE (wait for results)
            logging.info(f"🚀 Using Orchestrator for QC request (sync): {user_name}, {phenotype}, {method}")
            
            qc_result = orchestrator.submit_qc_request(
                username=user_name,
                user_id=user_id,
                phenotype=phenotype,
                method=method,
                action='create'
            )
            
            # Check for errors
            if not qc_result.get('success'):
                error_msg = qc_result.get('error', 'Unknown error')
                logging.error(f"❌ Orchestrator error: {error_msg}")
                return jsonify({"error": error_msg}), 500
            
            # Wait for results (synchronous mode for QC create)
            request_id = qc_result.get('request_id')
            import time
            max_wait = 180  # 3 minutes max
            waited = 0
            poll_interval = 2  # Poll every 2 seconds
            
            while waited < max_wait:
                status_result = orchestrator.check_status(request_id)
                status = status_result.get('status')
                
                if status == 'completed':
                    # Get results
                    results = status_result.get('results', {})
                    if results and results.get('success'):
                        qc_data_csv = results.get('data', '')
                        # If data not in callback (too large), fetch from MongoDB
                        if not qc_data_csv and results.get('data_in_mongodb'):
                            mongodb_filename = results.get('mongodb_filename')
                            if mongodb_filename:
                                # Fetch from orchestrator/QC worker's MongoDB
                                fetch_result = orchestrator.submit_qc_request(
                                    username=user_name,
                                    user_id=user_id,
                                    phenotype=phenotype,
                                    method=method,
                                    action='get',
                                    params={'filename': mongodb_filename}
                                )
                                if fetch_result.get('success'):
                                    fetch_request_id = fetch_result.get('request_id')
                                    # Wait for fetch to complete
                                    fetch_waited = 0
                                    while fetch_waited < 30:
                                        fetch_status = orchestrator.check_status(fetch_request_id)
                                        if fetch_status.get('status') == 'completed':
                                            fetch_results = fetch_status.get('results', {})
                                            qc_data_csv = fetch_results.get('data', '')
                                            if qc_data_csv:
                                                break
                                        elif fetch_status.get('status') == 'failed':
                                            break
                                        time.sleep(0.5)
                                        fetch_waited += 0.5
                        
                        if qc_data_csv:
                            # Process the results same as direct QC Controller
                            break
                        else:
                            return jsonify({"error": "No data returned from QC processing"}), 500
                    else:
                        error_msg = results.get('error', 'QC processing failed')
                        return jsonify({"error": error_msg}), 500
                elif status == 'failed':
                    error_msg = status_result.get('error', 'QC processing failed')
                    return jsonify({"error": error_msg}), 500
                elif status in ['queued', 'processing']:
                    # Still processing, wait and retry
                    time.sleep(poll_interval)
                    waited += poll_interval
                else:
                    # Unknown status, wait and retry
                    time.sleep(poll_interval)
                    waited += poll_interval
            
            if waited >= max_wait:
                return jsonify({"error": "QC processing timed out. Please try again."}), 504
            
            # Process qc_data_csv same as direct QC Controller flow
            if not qc_data_csv:
                return jsonify({"error": "No data returned from QC processing"}), 500
        else:
            # Use Direct QC Controller (original synchronous method)
            logging.info(f"📡 Using Direct QC Controller: {user_name}, {phenotype}, {method}")
            
            response = http_requests.post(
                f"{QC_CONTROLLER_URL}/api/qc",
                json={
                    "username": user_name,
                    "phenotype": phenotype,
                    "method": method,
                    "action": "create"
                },
                timeout=120  # QC can take time
            )
            
            if response.status_code != 200:
                return jsonify(response.json()), response.status_code
                
            qc_result = response.json()
        
        # Get QC data from QC Controller response
        if USE_ORCHESTRATOR and orchestrator:
            # qc_data_csv already set from orchestrator results above
            pass
        else:
            qc_data_csv = qc_result.get('data', '')
            if not qc_data_csv:
                return jsonify({"error": "No data returned from QC Controller"}), 500
        
        # Parse CSV data into the EXACT same format as regular uploaded datasets
        import io
        df = pd.read_csv(io.StringIO(qc_data_csv), index_col=0)
        df.index.name = 'sample_id'
        
        # Validate DataFrame is not empty
        if df.empty:
            return jsonify({"error": "QC Controller returned empty dataset"}), 500
        
        # Convert to the EXACT format used by regular datasets (same as update_qc_data file upload)
        data = {}
        for sample_id, row in df.iterrows():
            data[str(sample_id)] = row.to_dict()
        
        # Validate data was created
        if not data or len(data) == 0:
            return jsonify({"error": "Failed to convert QC data to required format"}), 500
        
        # Validate phenotype is not None or empty
        if not phenotype or (isinstance(phenotype, str) and phenotype.strip() == ''):
            return jsonify({"error": "Phenotype cannot be empty or None. Please provide a valid phenotype name."}), 400
        
        # Store in datasets collection in EXACT SAME FORMAT as regular datasets
        # Format: {user_id, phenotype, number_of_samples, data}
        # Only difference: add is_qc_data flag for filtering
        phenotype_clean = str(phenotype).strip()
        output_name = f"{phenotype_clean}_{method}"  # Create descriptive output name
        
        dataset = {
            "user_id": str(user_id),
            "phenotype": phenotype_clean,  # Ensure phenotype is a clean string (no leading/trailing spaces)
            "number_of_samples": str(len(df)),
            "data": data,  # Actual QC-processed data in same format as regular datasets
            "is_qc_data": True,  # Flag to identify QC datasets (for filtering)
            "qc_method": method,  # Store QC method for reference
            "qc_output_name": output_name  # Store output name for display
        }
        
        logging.info(f"📝 Creating QC dataset with phenotype: '{phenotype_clean}', method: {method}, output_name: '{output_name}'")
        
        # Estimate document size (approximate)
        import sys
        estimated_size = sys.getsizeof(str(dataset)) / (1024 * 1024)  # MB
        if estimated_size > 14:  # Leave 2MB buffer under 16MB limit
            logging.warning(f"⚠️  Large dataset detected: ~{estimated_size:.2f}MB. May exceed MongoDB 16MB limit.")
        
        # Insert into datasets collection in MAIN MongoDB (test database)
        # This is the SAME database and collection as regular uploaded datasets
        # Database: test (from collaborativestudy MongoDB Atlas cluster)
        try:
            result = db['datasets'].insert_one(dataset)
            qc_dataset_id = str(result.inserted_id)
        except Exception as insert_error:
            error_msg = str(insert_error)
            if "document too large" in error_msg.lower() or "16" in error_msg:
                logging.error(f"❌ Dataset too large for MongoDB (16MB limit): ~{estimated_size:.2f}MB")
                return jsonify({
                    "error": f"Dataset too large ({estimated_size:.2f}MB). MongoDB document limit is 16MB.",
                    "details": "Consider using a smaller dataset or different QC method."
                }), 413
            raise
        
        # Verify the dataset was inserted with data (catch silent failures)
        inserted_dataset = db['datasets'].find_one({"_id": result.inserted_id})
        if not inserted_dataset:
            return jsonify({"error": "Failed to verify dataset was stored"}), 500
        
        if 'data' not in inserted_dataset or not inserted_dataset.get('data') or len(inserted_dataset.get('data', {})) == 0:
            # Clean up the incomplete dataset
            db['datasets'].delete_one({"_id": result.inserted_id})
            logging.error(f"❌ Dataset inserted but 'data' field is missing or empty. Deleted incomplete record.")
            return jsonify({
                "error": "Dataset was created but data was not stored. Possible causes: data too large or MongoDB insertion issue.",
                "estimated_size_mb": round(estimated_size, 2)
            }), 500
        
        logging.info(f"✅ QC dataset stored in MAIN MongoDB 'test' database, 'datasets' collection")
        logging.info(f"   Dataset ID: {qc_dataset_id}, Samples: {len(df)}, Columns: {len(df.columns)}, Phenotype: {phenotype}, Method: {method}")
        logging.info(f"   Data samples in stored dataset: {len(inserted_dataset.get('data', {}))}")
        
        return jsonify({
            "success": True,
            "message": f"QC data created successfully using {method}",
            "dataset_id": qc_dataset_id,
            "phenotype": phenotype,
            "qc_method": method,
            "rows": len(df),
            "columns": len(df.columns)
        }), 200

    except Exception as e:
        logging.error(f"Error in qc_create: {str(e)}")
        logging.error(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


@app.route('/api/qc/datasets', methods=['GET'])
def get_qc_datasets():
    """Get all QC datasets for the current user"""
    try:
        current_user, error_response = get_current_user()
        if error_response:
            return error_response

        user_id = str(current_user.id)
        user_id_obj = ObjectId(current_user.id)  # Also get ObjectId format for type-safe querying
        phenotype = request.args.get('phenotype')
        
        # Build query for QC datasets - handle both string and ObjectId formats
        # Also explicitly require user_id field to exist
        query = {
            '$or': [
                {'user_id': user_id},
                {'user_id': user_id_obj}
            ],
            'is_qc_data': True,
            'user_id': {'$exists': True}  # Explicitly require user_id field to exist
        }
        if phenotype:
            query["phenotype"] = phenotype
        
        qc_datasets = list(db['datasets'].find(
            query,
            {'phenotype': 1, 'qc_method': 1, 'qc_output_name': 1, 'number_of_samples': 1, '_id': 1, 'user_id': 1}
        ))
        
        datasets_list = []
        seen_datasets = set()  # Track unique datasets to prevent duplicates
        
        for ds in qc_datasets:
            # Double-check user_id matches (handle both string and ObjectId formats)
            dataset_user_id = ds.get('user_id')
            if not dataset_user_id:
                logging.warning(f"QC dataset {ds.get('_id')} has no user_id field. Skipping.")
                continue
                
            # Normalize user_id for comparison (convert ObjectId to string)
            dataset_user_id_str = str(dataset_user_id) if dataset_user_id else None
            if dataset_user_id_str != user_id:
                logging.warning(f"QC dataset {ds.get('_id')} user_id mismatch: {dataset_user_id_str} != {user_id}. Skipping.")
                continue
            
            # Ensure phenotype is a valid string (handle None, empty string, etc.)
            phenotype_value = ds.get('phenotype')
            if not phenotype_value or phenotype_value == 'N/A' or (isinstance(phenotype_value, str) and phenotype_value.strip() == ''):
                # If phenotype is missing or invalid, skip
                logging.warning(f"QC dataset {ds['_id']} has missing or invalid phenotype: '{phenotype_value}'. Skipping.")
                continue  # Skip datasets without valid phenotype rather than showing 'N/A'
            
            dataset_id = str(ds['_id'])
            phenotype_clean = str(phenotype_value).strip()
            qc_method = ds.get('qc_method', 'unknown')
            
            # Create unique key for deduplication (phenotype + method)
            unique_key = f"{phenotype_clean}_{qc_method}"
            if unique_key in seen_datasets:
                logging.info(f"Duplicate QC dataset detected: {unique_key}. Using first occurrence.")
                continue
            seen_datasets.add(unique_key)
            
            # Use qc_output_name if available, otherwise construct from phenotype and method
            output_name = ds.get('qc_output_name')
            if not output_name or output_name == 'N/A':
                output_name = phenotype_clean  # Use phenotype as display name
            
            datasets_list.append({
                'dataset_id': dataset_id,
                'phenotype': phenotype_clean,  # Ensure it's a clean string
                'qc_method': qc_method,
                'output_name': output_name,
                'number_of_samples': ds.get('number_of_samples', '0')
            })
        
        return jsonify({"qc_datasets": datasets_list}), 200

    except Exception as e:
        logging.error(f"Error in get_qc_datasets: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/qc/methods', methods=['GET'])
def get_qc_methods():
    """Get available QC methods"""
    methods = [
        {"id": "maf", "name": "Minor Allele Frequency (MAF)", "type": "snp_filter", "has_threshold": False},
        {"id": "hwe", "name": "Hardy-Weinberg Equilibrium (HWE)", "type": "snp_filter", "has_threshold": False},
        {"id": "missing", "name": "Missing Data QC", "type": "snp_filter", "has_threshold": False},
        {"id": "privacy", "name": "Privacy Transform", "type": "transform", "has_threshold": False},
        {"id": "pca", "name": "Population Stratification (PCA)", "type": "transform", "has_threshold": False}
    ]
    return jsonify({"methods": methods}), 200


@app.route('/api/qc/create_chained', methods=['POST'])
def qc_create_chained():
    """Run chained QC (Missing -> MAF -> HWE) on a user's raw data via orchestrator."""
    try:
        current_user, error_response = get_current_user()
        if error_response:
            return error_response

        user_id = str(current_user.id)
        data = request.get_json() or {}
        collaboration_uuid = data.get('uuid')
        if not collaboration_uuid:
            return jsonify({"error": "Collaboration UUID is required"}), 400

        collaboration = db['collaborations'].find_one({"uuid": collaboration_uuid})
        if not collaboration:
            return jsonify({"error": "Collaboration not found"}), 404

        # Get qc_scheme from collaboration
        qc_scheme = collaboration.get('qc_scheme', [])
        # Filter to only per-user filtering methods (not pairwise ones)
        FILTER_METHOD_NAMES = {'Missing Data QC', 'Minor Allele Frequency (MAF)', 'Hardy-Weinberg Equilibrium (HWE)',
                               'MAF', 'HWE', 'missing', 'maf', 'hwe'}
        filter_methods = [m for m in qc_scheme if isinstance(m, dict) and m.get('method', '') in FILTER_METHOD_NAMES]
        
        if not filter_methods:
            return jsonify({"error": "No filter QC methods in this collaboration's scheme"}), 400

        # Get phenotype for this user
        if str(collaboration['creator_id']) == user_id:
            dataset = db['datasets'].find_one({"_id": ObjectId(collaboration['creator_dataset_id'])})
            phenotype = dataset.get('phenotype') if dataset else None
            dataset_id = str(collaboration.get('creator_dataset_id')) if collaboration.get('creator_dataset_id') else None
        else:
            phenotype = None
            dataset_id = None
            for iu in collaboration.get('invited_users', []):
                if str(iu.get('user_id')) == user_id:
                    phenotype = iu.get('phenotype')
                    dataset_id = str(iu.get('user_dataset_id')) if iu.get('user_dataset_id') else None
                    break

        if not phenotype:
            return jsonify({"error": "Phenotype not found for this user"}), 400

        user_doc = db['users'].find_one({"_id": ObjectId(user_id)}, {"name": 1, "email": 1}) or {}
        username = user_doc.get('name') or (user_doc.get('email') or '').split('@')[0] or f"user_{user_id}"
        username = str(username).strip() or f"user_{user_id}"

        if not USE_ORCHESTRATOR or not orchestrator:
            return jsonify({"error": "Chained QC requires orchestrator. Set USE_ORCHESTRATOR=true."}), 503

        result = orchestrator.submit_chained_qc_request(
            username=username,
            user_id=user_id,
            phenotype=phenotype,
            collaboration_uuid=collaboration_uuid,
            methods=filter_methods,
            dataset_id=dataset_id
        )
        if not result.get('success'):
            return jsonify({"error": result.get('error', 'Orchestrator request failed')}), 500

        request_id = result.get('request_id')
        if not request_id:
            return jsonify({"error": "No request ID returned"}), 500

        # Poll for completion
        max_wait = 180
        poll_interval = 2
        waited = 0
        while waited < max_wait:
            status_result = orchestrator.check_status(request_id)
            st = status_result.get('status')
            if st == 'completed':
                results = status_result.get('results', {})
                # Update user's collaboration dataset with filtered data
                # so pairwise QC (Sample Relatedness / Pop Strat) uses cleaned data
                csv_data = results.get('data', '')
                if csv_data:
                    try:
                        filtered_df = pd.read_csv(io.StringIO(csv_data), index_col=0)
                        filtered_df.index.name = 'sample_id'
                        data_dict = {}
                        for sample_id, row in filtered_df.iterrows():
                            data_dict[str(sample_id)] = row.to_dict()
                        
                        # Find this user's dataset ID in the collaboration
                        dataset_id = None
                        if str(collaboration['creator_id']) == user_id:
                            dataset_id = str(collaboration['creator_dataset_id'])
                        else:
                            for iu in collaboration.get('invited_users', []):
                                if str(iu.get('user_id')) == user_id:
                                    dataset_id = str(iu.get('user_dataset_id'))
                                    break
                        if dataset_id and data_dict:
                            db['datasets'].update_one(
                                {"_id": ObjectId(dataset_id)},
                                {"$set": {"data": data_dict}}
                            )
                            logging.info(f"Updated dataset {dataset_id} with filtered data ({len(data_dict)} samples)")
                    except Exception as update_err:
                        logging.warning(f"Could not update dataset with filtered data: {update_err}")

                return jsonify({
                    "message": "Chained QC completed",
                    "status": "complete",
                    "surviving_snps": results.get('surviving_snps', []),
                    "surviving_samples": results.get('surviving_samples', []),
                    "snp_count": results.get('snp_count', 0),
                    "sample_count": results.get('sample_count', 0),
                }), 200
            if st == 'failed':
                err = status_result.get('error', 'Chained QC failed')
                return jsonify({"error": err}), 500
            time.sleep(poll_interval)
            waited += poll_interval

        return jsonify({"error": "Chained QC timed out"}), 504

    except Exception as e:
        logging.error(f"qc_create_chained error: {str(e)}")
        logging.error(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


@app.route('/api/update_qc_data', methods=['POST'])
def update_qc_data():
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            logging.error("Authorization header missing")
            return jsonify({"error": "Authorization header missing"}), 401

        token = auth_header.split()[1]
        current_user = User.verify_auth_token(token)

        if not current_user:
            logging.error("Invalid token or user not found")
            return jsonify({"error": "Invalid token or user not found"}), 401

        user_id = current_user.id

        # Check if this is a JSON request (linking existing QC dataset)
        if request.is_json:
            data = request.get_json()
            dataset_id = data.get('dataset_id')
            qc_dataset_id = data.get('qc_dataset_id')
            
            if not dataset_id:
                return jsonify({"error": "Dataset ID is required"}), 400

            if qc_dataset_id:
                # Link existing QC dataset
                qc_dataset = db['datasets'].find_one({"_id": ObjectId(qc_dataset_id)})
                if not qc_dataset:
                    return jsonify({"error": "QC dataset not found"}), 404
                
                # QC datasets are now stored with actual data in datasets collection (same format as regular datasets)
                # Check if data exists in the QC dataset document
                if qc_dataset.get('data'):
                    # Data is stored directly in the QC dataset (new format)
                    db['datasets'].update_one(
                        {"_id": ObjectId(dataset_id)},
                        {"$set": {"data": qc_dataset.get('data', {})}}
                    )
                elif qc_dataset.get('qc_data_in_controller'):
                    # Legacy: Data stored in QC Controller/Worker (old format for backward compatibility)
                    try:
                        qc_username = qc_dataset.get('qc_controller_username')
                        qc_filename = qc_dataset.get('qc_controller_filename')
                        
                        # Use orchestrator if enabled, otherwise direct QC Controller
                        if USE_ORCHESTRATOR and orchestrator:
                            logging.info(f"🚀 Using Orchestrator for get action: {qc_username}, {qc_filename}")
                            qc_result = orchestrator.submit_qc_request(
                                username=qc_username,
                                user_id=user_id,
                                phenotype=qc_dataset.get('phenotype', ''),
                                method='',
                                action='get',
                                params={'filename': qc_filename}
                            )
                            
                            if qc_result.get('success'):
                                request_id = qc_result.get('request_id')
                                if request_id:
                                    import time
                                    max_wait = 30
                                    waited = 0
                                    while waited < max_wait:
                                        status_result = orchestrator.check_status(request_id)
                                        if status_result.get('status') == 'completed':
                                            results = status_result.get('results', {})
                                            qc_data_csv = results.get('data', '')
                                            if qc_data_csv:
                                                import io
                                                df = pd.read_csv(io.StringIO(qc_data_csv), index_col=0)
                                                df.index.name = 'sample_id'
                                                
                                                data_dict = {}
                                                for sample_id, row in df.iterrows():
                                                    data_dict[str(sample_id)] = row.to_dict()
                                                
                                                # Update collaboration dataset with fetched data
                                                db['datasets'].update_one(
                                                    {"_id": ObjectId(dataset_id)},
                                                    {"$set": {"data": data_dict}}
                                                )
                                                return jsonify({"message": "QC dataset linked successfully"}), 200
                                            break
                                        elif status_result.get('status') == 'failed':
                                            error_msg = status_result.get('error', 'Get action failed')
                                            logging.error(f"Failed to fetch QC data from orchestrator: {error_msg}")
                                            return jsonify({"error": f"Failed to fetch QC data: {error_msg}"}), 500
                                        time.sleep(0.5)
                                        waited += 0.5
                                    return jsonify({"error": "Get request timed out"}), 500
                                else:
                                    return jsonify({"error": "No request ID returned"}), 500
                            else:
                                return jsonify({"error": qc_result.get('error', 'Orchestrator error')}), 500
                        else:
                            # Use Direct QC Controller
                            logging.info(f"📡 Using Direct QC Controller for get action: {qc_username}, {qc_filename}")
                            response = http_requests.post(
                                f"{QC_CONTROLLER_URL}/api/qc",
                                json={
                                    "username": qc_username,
                                    "action": "get",
                                    "params": {"filename": qc_filename}
                                },
                                timeout=60
                            )
                            
                            if response.status_code == 200:
                                qc_data_csv = response.json().get('data', '')
                                if qc_data_csv:
                                    import io
                                    df = pd.read_csv(io.StringIO(qc_data_csv), index_col=0)
                                    df.index.name = 'sample_id'
                                    
                                    data_dict = {}
                                    for sample_id, row in df.iterrows():
                                        data_dict[str(sample_id)] = row.to_dict()
                                    
                                    # Update collaboration dataset with fetched data
                                    db['datasets'].update_one(
                                        {"_id": ObjectId(dataset_id)},
                                        {"$set": {"data": data_dict}}
                                    )
                                    return jsonify({"message": "QC dataset linked successfully"}), 200
                            else:
                                logging.error(f"Failed to fetch QC data from controller: {response.text}")
                                return jsonify({"error": "Failed to fetch QC data from controller"}), 500
                    except Exception as qc_error:
                        logging.error(f"Error fetching QC data: {str(qc_error)}")
                        return jsonify({"error": f"Error fetching QC data: {str(qc_error)}"}), 500
                else:
                    return jsonify({"error": "QC dataset has no data available"}), 400
                
                return jsonify({"message": "QC dataset linked successfully"}), 200
            else:
                return jsonify({"error": "QC dataset ID is required for JSON requests"}), 400
        
        # Handle form data (file upload)
        dataset_id = request.form.get('dataset_id')
        if not dataset_id:
            return jsonify({"error": "Dataset ID is required"}), 400

        file = request.files.get('file')

        if not file or file.filename == '':
            return jsonify({"error": "CSV file is required"}), 400

        if not file.filename.endswith('.csv'):
            return jsonify({"error": "Only CSV files are supported"}), 400

        df = pd.read_csv(file, index_col=0)
        df.index.name = 'sample_id'  # Set the index name

        if not df.empty:
            data = {}

            for sample_id, row in df.iterrows():
                data[str(sample_id)] = row.to_dict()

        dataset = db['datasets'].find_one({"_id": ObjectId(dataset_id)})
        if not dataset:
            return jsonify({"error": "Dataset not found"}), 404


        db['datasets'].update_one(
            {"_id": ObjectId(dataset_id)},
            {"$set": {"data": data}}
        )

        return jsonify({"message": "Dataset updated successfully"}), 200

    except Exception as e:
        logging.error(f'Error updating dataset with CSV data: {str(e)}')
        return jsonify({"error": "An error occurred while processing the data", "details": str(e)}), 500



@app.route('/api/create_gwas_dataset', methods=['POST'])
def create_gwas_dataset():
    """Create GWAS stat dataset from raw data using QC-filtered sample list via orchestrator."""
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            return jsonify({"error": "Authorization header missing"}), 401

        token = auth_header.split()[1]
        current_user = User.verify_auth_token(token)
        if not current_user:
            return jsonify({"error": "Invalid token or user not found"}), 401

        user_id = str(current_user.id)
        data = request.get_json() or {}
        collaboration_uuid = data.get('uuid')
        sample_ids = data.get('sample_ids', [])

        if not collaboration_uuid:
            return jsonify({"error": "Collaboration UUID is required"}), 400
        if not sample_ids or not isinstance(sample_ids, list):
            return jsonify({"error": "sample_ids (list from QC results) is required"}), 400

        collaboration = db['collaborations'].find_one({"uuid": collaboration_uuid})
        if not collaboration:
            return jsonify({"error": "Collaboration not found"}), 404

        # Get phenotype for this user (creator or invited)
        if str(collaboration['creator_id']) == user_id:
            dataset = db['datasets'].find_one({"_id": ObjectId(collaboration['creator_dataset_id'])})
            phenotype = dataset.get('phenotype') if dataset else None
        else:
            for iu in collaboration.get('invited_users', []):
                if str(iu.get('user_id')) == user_id:
                    phenotype = iu.get('phenotype')
                    break
            else:
                phenotype = None

        if not phenotype:
            return jsonify({"error": "Phenotype not found for this user in collaboration"}), 400

        user_doc = db['users'].find_one({"_id": ObjectId(user_id)}, {"name": 1, "email": 1}) or {}
        username = user_doc.get('name') or (user_doc.get('email') or '').split('@')[0] or f"user_{user_id}"
        username = str(username).strip() or f"user_{user_id}"

        # Get surviving SNPs for this user (from chained QC)
        surviving_snps = collaboration.get('surviving_snps', {}).get(user_id, [])

        if not USE_ORCHESTRATOR or not orchestrator:
            return jsonify({"error": "GWAS dataset creation requires orchestrator. Set USE_ORCHESTRATOR=true."}), 503

        result = orchestrator.submit_gwas_summary_request(
            username=username,
            user_id=user_id,
            phenotype=phenotype,
            collaboration_uuid=collaboration_uuid,
            sample_ids=sample_ids,
            snp_ids=surviving_snps if surviving_snps else None
        )
        if not result.get('success'):
            return jsonify({"error": result.get('error', 'Orchestrator request failed')}), 500

        request_id = result.get('request_id')
        if not request_id:
            return jsonify({"error": "No request ID returned"}), 500

        # Poll for completion (sync mode, same as QC create)
        max_wait = 120
        poll_interval = 2
        waited = 0
        while waited < max_wait:
            status_result = orchestrator.check_status(request_id)
            st = status_result.get('status')
            if st == 'completed':
                return jsonify({
                    "message": "GWAS dataset created successfully",
                    "status": "complete"
                }), 200
            if st == 'failed':
                err = status_result.get('error', 'GWAS creation failed')
                logging.error(f"GWAS creation failed: {err}")
                return jsonify({"error": err}), 500
            time.sleep(poll_interval)
            waited += poll_interval

        return jsonify({"error": "GWAS dataset creation timed out"}), 504

    except Exception as e:
        logging.error(f"create_gwas_dataset error: {str(e)}")
        logging.error(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


@app.route('/api/upload_csv_stats', methods=['POST'])
def upload_csv_stats():
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            logging.error("Authorization header missing")
            return jsonify({"error": "Authorization header missing"}), 401

        token = auth_header.split()[1]
        current_user = User.verify_auth_token(token)

        if not current_user:
            logging.error("Invalid token or user not found")
            return jsonify({"error": "Invalid token or user not found"}), 401

        user_id = str(current_user.id)  # Ensure user_id is a string for JSON serialization

        if 'file' not in request.files:
            logging.error('No file part in the request')
            return jsonify({'message': 'No file part in the request'}), 400

        file = request.files['file']

        if file.filename == '':
            logging.error('No selected file')
            return jsonify({'message': 'No selected file'}), 400

        if not file.filename.endswith('.csv'):
            logging.error('Unsupported file type')
            return jsonify({'message': 'Unsupported file type'}), 400

        collaboration_uuid = request.form.get('uuid')
        if not collaboration_uuid:
            logging.error("Collaboration UUID missing")
            return jsonify({"error": "Collaboration UUID missing"}), 400

        try:
            df = pd.read_csv(file)

            if df.columns[0].lower() != 'snp_id':
                logging.error('First column must be SNP_ID')
                return jsonify({'message': 'First column must be SNP_ID'}), 400

            user_stats = {}

            for _, row in df.iterrows():
                snp_id = row.iloc[0]
                cases = {}
                controls = {}

                for col in df.columns[1:]:
                    if col.lower().startswith('case_'):
                        case_key = col.split('_')[1]
                        cases[case_key] = row[col]
                    elif col.lower().startswith('control_'):
                        control_key = col.split('_')[1]
                        controls[control_key] = row[col]

                user_stats[snp_id] = {
                    "case": cases,
                    "control": controls,
                    "user_id": user_id  # Include the user_id with each SNP entry
                }

            # Update the collaborations entry to add or merge user-specific stats
            result = db['collaborations'].update_one(
                {"uuid": collaboration_uuid},
                {"$set": {f"stats.{user_id}": user_stats}},  # Store data under stats.{user_id}
                upsert=True
            )

            if result.matched_count == 0 and not result.upserted_id:
                logging.error("Collaboration entry not found or not updated")
                return jsonify({'message': 'Collaboration entry not found or not updated'}), 404

            return jsonify({'message': 'CSV file processed and stats updated successfully'}), 200

        except Exception as e:
            logging.error(f'Error processing CSV: {str(e)}')
            logging.error(traceback.format_exc())
            return jsonify({'message': 'An error occurred while processing the file', 'error': str(e)}), 500

    except Exception as e:
        logging.error(f'Unexpected error: {str(e)}')
        logging.error(traceback.format_exc())
        return jsonify({'message': 'An unexpected error occurred', 'error': str(e)}), 500




# @app.route('/api/upload_csv', methods=['POST'])
# def upload_csv():
#     try:
#         auth_header = request.headers.get('Authorization')
#         if not auth_header:
#             logging.error("Authorization header missing")
#             return jsonify({"error": "Authorization header missing"}), 401
#
#         token = auth_header.split()[1]
#         current_user = User.verify_auth_token(token)
#
#         if not current_user:
#             logging.error("Invalid token or user not found")
#             return jsonify({"error": "Invalid token or user not found"}), 401
#
#         owner = current_user.id
#
#         # Check if the post request has the file part
#         if 'file' not in request.files:
#             return jsonify({'message': 'No file part in the request'}), 400
#
#         # Get text fields from the request
#         field1 = request.form.get('field1')
#         field2 = request.form.get('field2')
#
#         file = request.files['file']
#         # If the user does not select a file, the browser submits an empty file w/o a filename
#         if file.filename == '':
#             return jsonify({'message': 'No selected file'}), 400
#         if file and file.filename.endswith('.csv'):
#             filename = secure_filename(file.filename)
#             filepath = os.path.join('./', filename)
#             file.save(filepath)
#
#             # Initialize an empty list to store records
#             record = {}  # Initialize record as a dictionary
#             try:
#                 df = pd.read_csv(filepath)
#                 # Check if DataFrame is not empty
#                 if not df.empty:
#                     # Iterate over DataFrame rows and construct records
#                     record['datasetID'] = str(ObjectId())
#                     record['phenotypes'] = str(field1)
#                     record['owner'] = str(owner)
#                     record['numberOfSamples'] = str(field2)
#                     record['columns'] = ','.join(df.columns.to_list())
#                     record['records'] = {}
#                     for i in range(df.shape[0]):
#                         record['records'][str(i)] = ','.join(str(item) for item in df.iloc[i].to_list())
#
#             except Exception as e:
#                 return jsonify({'message': 'An error occurred while processing the file', 'error': str(e)}), 500
#
#             # Insert records into MongoDB
#             if record:
#                 print(len(record.keys()))
#                 db.fileUploads.insert_one(record)
#
#             return jsonify({'message': 'CSV file processed successfully'}), 200
#         else:
#             return jsonify({'message': 'Unsupported file type'}), 400
#     except Exception as e:
#         print(e)
#         return jsonify({'message': 'An error occurred while processing the file', 'error': str(e)}), 500

# Route to retrieve list of collaborators for a session
# @app.route('/api/user/<user_id>/collaborations', methods=['GET'])
# def get_user_collaborations(user_id):
#     # Find all sessions where the user is either the owner or a collaborator
#     sessions = Session.objects.filter(__raw__={'$or': [{'userID': user_id}, {'collaborators': user_id}]})
    
#     # Prepare the list of sessions with session ID and collaborators
#     collaborations = [
#         {'sessionID': str(session.id), 'collaborators': session.collaborators} 
#         for session in sessions
#     ]
    
#     return jsonify(collaborations), 200


# Start session - need to fix the calculate_coefficient.py file
# @app.route('/api/start_session', methods=['POST'])
# def start_session():
#     data = request.json
#     user_ids = data.get('user_ids')  # Expecting a list of user IDs

#     try:
#         dataframes = []
#         for user_id in user_ids:
#             dataset = db.datasets.find_one({'userID': user_id})
#             if dataset:
#                 df = pd.read_csv(io.StringIO(dataset['csv_content']))
#                 dataframes.append(df)
#             else:
#                 return jsonify({'message': f"Dataset for user {user_id} not found"}), 404

#         merged_data = pd.concat(dataframes, axis=1, join='inner')
#         coeff_arr = compute_coefficients_array(merged_data)

#         results_table = pd.DataFrame(list(coeff_arr.items()), columns=['Pair', 'Coefficient'])

#         return results_table.to_json(orient='records'), 200

#     except Exception as e:
#         return jsonify({'message': 'An error occurred while starting session', 'error': str(e)}), 500
     
# @app.route('/api/calculations', methods=['GET'])
# def calculate_cofficients():
#     data = request.json
#     user1 = data['user1']
#     user2 = data['user2']

    

#     # Connect to MongoDB
#     client = MongoClient(os.getenv("MONGO_URI"))

#     try:
#         # Get datasets for both users
#         df_user1 = get_user_dataset(client, user1)
#         df_user2 = get_user_dataset(client, user2)

#         # Merge the datasets

#         merged_data = pd.concat([df_user1, df_user2], axis=1)
  
#         # Compute coefficients
#         coeff_arr = compute_coefficients_array(merged_data)

#         # Convert the results to a table format (DataFrame)
#         results_table = pd.DataFrame(list(coeff_arr.items()), columns=['Pair', 'Coefficient'])
        
#         # Return the table as a JSON response
#         return results_table.to_json(orient='records'), 200

#     except ValueError as ve:
#         return jsonify({'message': str(ve)}), 404
#     except Exception as e:
#         return jsonify({'message': 'An error occurred', 'error': str(e)}), 500

# fix issues with models first
#@app.route('/api/collaborations/<session_id>', methods=['GET'])
#def get_collaboration_details(session_id):
 #   try:
 #       session = Session.objects.get(sessionID=session_id)
   #     metadata = session.metadataID  
#
 #       # Response object
  #      collaboration_details = {
   #         "sessionID": session.sessionID,
    #        "status": session.status,
     #       "metadata": metadata,
      #      "results": session.results  # create a results section???
       # }

        #return jsonify(collaboration_details), 200

    #except DoesNotExist:
    #    return jsonify({'message': 'Collaboration not found'}), 404

def fetch_collaboration_data(uuid):
    try:
        collaboration_collection = db["collaborations"]
        collaboration_data = collaboration_collection.find_one({"uuid": uuid})

        if collaboration_data is None:
            return None

        return collaboration_data

    except Exception as e:
        raise


def fetch_datasets_by_ids(dataset_ids):
    dataset_collection = db["datasets"]

    def fetch_single_dataset(dataset_id):
        dataset = dataset_collection.find_one({"_id": ObjectId(dataset_id)})
        if dataset:
            # Validate dataset has data
            data_field = dataset.get('data')
            if not data_field or (isinstance(data_field, dict) and len(data_field) == 0):
                logging.error(f"⚠️  Dataset {dataset_id} exists but has no data field!")
                logging.error(f"   User: {dataset.get('user_id')}, Phenotype: {dataset.get('phenotype')}, QC: {dataset.get('is_qc_data', False)}")
                # Return None to exclude from results - this will cause an error downstream which is better than silent failure
                return None
            return dataset
        else:
            logging.error(f"⚠️  Dataset {dataset_id} not found in database!")
            return None

    with ThreadPoolExecutor() as executor:
        datasets = list(executor.map(fetch_single_dataset, dataset_ids))

    filtered_datasets = [dataset for dataset in datasets if dataset]
    return filtered_datasets


def combine_datasets(dataset_ids, fetch_dataset):
    combined_data = []

    for dataset_id in dataset_ids:
        dataset = fetch_dataset(dataset_id)  # Fetch dataset by ID

        if dataset and 'data' in dataset:
            sample_data = dataset['data']
            all_columns = set()
            samples = []

            for sample_id, sample in sample_data.items():
                sample['sample_id'] = sample_id
                all_columns.update(sample.keys())
                samples.append(sample)

            df = pd.DataFrame(samples)
            df['user_id'] = dataset.get('user_id')
            df.set_index(['sample_id', 'user_id'], inplace=True)

            combined_data.append(df)

    if combined_data:
        combined_df = pd.concat(combined_data)
        return combined_df
    else:
        raise ValueError("No valid datasets to combine.")


def combine_datasets_to_dataframe(datasets_data):
    if datasets_data:
        dfs = []
        all_columns = set()

        for dataset in datasets_data:
            if 'data' in dataset:
                user_id = dataset.get('user_id')
                sample_data = dataset['data']
                samples = []

                for sample_id, sample in sample_data.items():
                    sample['sample_id'] = sample_id
                    sample['user_id'] = user_id
                    samples.append(sample)
                    all_columns.update(sample.keys())

                df = pd.DataFrame(samples)
                df = df.reindex(columns=sorted(all_columns))
                df.set_index(['sample_id', 'user_id'], inplace=True)

                dfs.append(df)

        if dfs:
            combined_df = pd.concat(dfs)
            combined_df = combined_df[sorted(combined_df.columns)]
            return combined_df

    return pd.DataFrame()


def get_combined_datasets(collab_uuid):
    try:
        collaboration_data = fetch_collaboration_data(collab_uuid)
        if not collaboration_data:
            return jsonify({"error": "Collaboration not found for the provided UUID."}), 404

        threshold = collaboration_data.get("threshold", 1)
        invited_users = collaboration_data.get("invited_users", [])
        creator_dataset_id = collaboration_data.get("creator_dataset_id")

        all_dataset_ids = []

        for user in invited_users:
            if user["status"] == "accepted":
                all_dataset_ids.append(user["user_dataset_id"])
        
        if creator_dataset_id:
            all_dataset_ids.append(creator_dataset_id)

        datasets_data = fetch_datasets_by_ids(all_dataset_ids)
        if not datasets_data:
            return jsonify({"error": "No datasets found for the provided IDs."}), 404

        combined_df = combine_datasets_to_dataframe(datasets_data)

        return combined_df, threshold

    except Exception as e:
        return jsonify({"error": str(e)}), 500

def get_combined_datasets_for_pca(collab_uuid):
    try:
        collaboration_data = fetch_collaboration_data(collab_uuid)
        if not collaboration_data:
            return jsonify({"error": "Collaboration not found for the provided UUID."}), 404

        threshold = collaboration_data.get("threshold", 1)
        invited_users = collaboration_data.get("invited_users", [])
        creator_dataset_id = collaboration_data.get("creator_dataset_id")

        user_dataset_ids = []

        for user in invited_users:
            if user["status"] == "accepted":
                user_dataset_ids.append(user["user_dataset_id"])

        if creator_dataset_id:
            creator_dataset = fetch_datasets_by_ids([creator_dataset_id])
            creator_dataset_df = combine_datasets_to_dataframe(creator_dataset)
        datasets_data = fetch_datasets_by_ids(user_dataset_ids)
        if not datasets_data:
            return jsonify({"error": "No datasets found for the provided IDs."}), 404

        combined_df = combine_datasets_to_dataframe(datasets_data)

        return combined_df, threshold, creator_dataset_df

    except Exception as e:
        return jsonify({"error": str(e)}), 500


def store_qc_results_in_mongo(collab_uuid, results_array, key: str):
    print(f"[STORE] called: {collab_uuid}, {key}, {len(results_array) if isinstance(results_array, list) else 'N/A'} items", flush=True)
    try:
        collaboration_collection = db["collaborations"]
        collaboration_data = collaboration_collection.find_one({"uuid": collab_uuid})

        if collaboration_data is None:
            print(f"[STORE] ERROR: Collaboration {collab_uuid} not found!", flush=True)
            return None

        # Check if results are too large (> 50K entries) and need separate storage
        if isinstance(results_array, list) and len(results_array) > 50000:
            print(f"[STORE] Large results ({len(results_array)}) - storing separately", flush=True)
            qc_results_collection = db["qc_results"]
            
            # Delete any existing results for this collaboration/key
            qc_results_collection.delete_many({"collab_uuid": collab_uuid, "qc_type": key})
            
            # Store results in batches
            batch_size = 10000
            for i in range(0, len(results_array), batch_size):
                batch = results_array[i:i+batch_size]
                qc_results_collection.insert_one({
                    "collab_uuid": collab_uuid,
                    "qc_type": key,
                    "batch_index": i // batch_size,
                    "results": batch
                })
                print(f"[STORE] Inserted batch {i // batch_size}", flush=True)
            
            # Store reference in collaboration document
            collaboration_collection.update_one(
                {"uuid": collab_uuid},
                {"$set": {
                    key: {"stored_separately": True, "total_results": len(results_array)},
                    f"{key}_stored": True
                }}
            )
            print(f"[STORE] Reference stored in collaboration", flush=True)
        else:
            # Small result set - store directly
            collaboration_collection.update_one(
                {"uuid": collab_uuid},
                {"$set": {key: results_array}}
            )
            print(f"[STORE] Stored directly in collaboration", flush=True)

        print(f"[STORE] SUCCESS", flush=True)
        return True

    except Exception as e:
        print(f"[STORE] ERROR: {str(e)}", flush=True)
        import traceback
        traceback.print_exc()
        return None

# init qc
@app.route('/api/datasets/<collab_uuid>', methods=['POST'])
def initiate_qc(collab_uuid):
    try:
        request_data = request.get_json() or {}
        qc_methods = request_data.get('qc_scheme', ['Sample Relatedness'])  # Default to sample relatedness
        
        print(f"QC methods requested: {qc_methods}")
        
        all_results = {}
        
        # Handle Sample Relatedness QC
        if 'Sample Relatedness' in qc_methods:
            print("Processing Sample Relatedness QC...")
            df, threshold = get_combined_datasets(collab_uuid)

            if isinstance(df, dict):
                return df

            sample_results = compute_coefficients_array(df)

            if sample_results:
                store_qc_results_in_mongo(collab_uuid, sample_results, "full_qc")
                all_results['sample_relatedness'] = sample_results
                print("✅ Sample Relatedness QC completed")
            else:
                return jsonify({"error": "No results returned from compute_coefficients_array."}), 404
        
        # Handle Population Stratification QC
        if 'Population Stratification' in qc_methods:
            print("Processing Population Stratification QC...")
            try:
                # Get combined datasets for PCA
                df, threshold, creator_df = get_combined_datasets_for_pca(collab_uuid)
                
                if isinstance(df, dict):
                    return df
                
                # Calculate pairwise distances for population stratification
                pairwise_results = calculate_pairwise_distances_pca(df, creator_df)
                
               
                
                store_qc_results_in_mongo(collab_uuid, pairwise_results, "population_stratification")
                all_results['population_stratification'] = pairwise_results
                print("✅ Population Stratification QC completed")
                
            except Exception as e:
                print(f"Error in Population Stratification QC: {str(e)}")
                return jsonify({"error": f"Population Stratification QC failed: {str(e)}"}), 500
        
        # Return combined results
        if all_results:
            return jsonify(all_results), 200
        else:
            return jsonify({"error": "No QC methods were processed successfully."}), 404

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/datasets/<collab_uuid>/qc-results', methods=['GET'])
def get_initial_qc_matrix(collab_uuid):
    try:
        collaboration_data = fetch_collaboration_data(collab_uuid)
        if not collaboration_data:
            return jsonify({"error": "Collaboration not found."}), 404

        # Get QC method from query parameter (default to sample relatedness for backward compatibility)
        qc_method = request.args.get('qc_scheme', 'Sample Relatedness')
        print(f"QC method: {qc_method}")
        
        if qc_method == 'Sample Relatedness':
            full_qc_results = collaboration_data.get("full_qc", [])
            threshold_value = collaboration_data.get("threshold", None)

            if not full_qc_results:
                return jsonify({"message": "No Sample Relatedness QC results available for this collaboration."}), 201

            return jsonify(full_qc_results=full_qc_results, threshold=threshold_value), 200
            
        elif qc_method == 'Population Stratification':
            pop_strat_results = collaboration_data.get("population_stratification", {})
            threshold_value = collaboration_data.get("threshold", None)

            if not pop_strat_results:
                return jsonify({"message": "No Population Stratification QC results available for this collaboration."}), 201

            # Check if results are stored separately due to size
            if isinstance(pop_strat_results, dict) and pop_strat_results.get("stored_separately"):
                qc_results_collection = db["qc_results"]
                all_results = []
                for batch_doc in qc_results_collection.find({"collab_uuid": collab_uuid, "qc_type": "population_stratification"}).sort("batch_index", 1):
                    all_results.extend(batch_doc.get("results", []))
                
                if not all_results:
                    return jsonify({"message": "No Population Stratification QC results available."}), 201
                    
                return jsonify(population_stratification=all_results, threshold=threshold_value), 200

            return jsonify(population_stratification=pop_strat_results, threshold=threshold_value), 200
            
        else:
            return jsonify({"error": f"Unknown QC method: {qc_method}"}), 400

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/datasets/<collab_uuid>/qc-results', methods=['POST'])
def get_filtered_qc_results(collab_uuid):
    try:
        collaboration_data = fetch_collaboration_data(collab_uuid)
        if not collaboration_data:
            return jsonify({"error": "Collaboration not found."}), 404

        request_data = request.get_json() or {}
        threshold = request_data.get("threshold", collaboration_data.get("threshold", 0.08))
        qc_method = request_data.get("qc_scheme", "Sample Relatedness")  # Default to sample relatedness
        
        print(f"Threshold received: {threshold}, QC method: {qc_method}")

        collaboration_collection = db["collaborations"]

        existing_threshold = collaboration_data.get("threshold")

        if existing_threshold is not None:
            collaboration_collection.update_one(
                {"uuid": collab_uuid},
                {"$unset": {"stats": "", "chi_square_results": "", "ai_summary": ""}}
            )

        threshold_update_result = collaboration_collection.update_one(
            {"uuid": collab_uuid},
            {"$set": {"threshold": threshold}}
        )

        if threshold_update_result.matched_count == 0:
            return jsonify({"error": "Failed to update threshold."}), 500

        final_results = {}

        if qc_method == "Sample Relatedness":
            qc_results = collaboration_data.get("full_qc", [])
            value_key = "phi_value"
            # For Sample Relatedness: higher values = more related, so we keep samples with phi_value <= threshold
            keep_condition = lambda value: value <= threshold
            
        elif qc_method == "Population Stratification":
            qc_results = collaboration_data.get("population_stratification", [])
            value_key = "distance"
            # For Population Stratification: lower distances = more similar, so we keep samples with distance <= threshold
            keep_condition = lambda value: value <= threshold
            
        else:
            return jsonify({"error": f"Unknown QC method: {qc_method}"}), 400

        if not qc_results:
            return jsonify({"message": f"No {qc_method} QC results available for this collaboration."}), 201

        # Process results based on the QC method
        for result in qc_results:
            user1, sample1 = result["user1"], result["sample1"]
            user2, sample2 = result["user2"], result["sample2"]
            value = result[value_key]

            if user1 not in final_results:
                final_results[user1] = set()
            if user2 not in final_results:
                final_results[user2] = set()

            if keep_condition(value):
                final_results[user1].add(sample1)
                final_results[user2].add(sample2)
            else:
                # If condition fails, only remove user2's sample (keep user1's sample)
                final_results[user2].discard(sample2)

        # Convert sets to lists for JSON serialization
        for user_id in final_results:
            final_results[user_id] = list(final_results[user_id])

        # Store filtered results with method-specific key
        filtered_key = f"filtered_qc_{qc_method.lower().replace(' ', '_')}"
        filtered_qc_update_result = collaboration_collection.update_one(
            {"uuid": collab_uuid},
            {"$set": {filtered_key: final_results}}
        )

        if filtered_qc_update_result.matched_count == 0:
            return jsonify({"error": "Failed to update filtered QC results."}), 500

        return jsonify({
            "filtered_results": final_results,
            "qc_method": qc_method,
            "threshold": threshold
        }), 200

    except Exception as e:
        print(f"Error retrieving and filtering QC results: {str(e)}")
        return jsonify({"error": str(e)}), 500


def process_qc_result(result, threshold, final_results, qc_method="Sample Relatedness"):
    """
    Process a single QC result and update the final_results dictionary.
    
    Args:
        result: QC result dictionary containing user1, user2, sample1, sample2, and value
        threshold: Threshold value for filtering
        final_results: Dictionary to store filtered results
        qc_method: QC method type ("Sample Relatedness" or "Population Stratification")
    """
    user1, sample1 = result["user1"], result["sample1"]
    user2, sample2 = result["user2"], result["sample2"]
    
    # Determine value key and condition based on QC method
    if qc_method == "Sample Relatedness":
        value = result["phi_value"]
        # For Sample Relatedness: higher values = more related, so we keep samples with phi_value <= threshold
        keep_sample = value <= threshold
    elif qc_method == "Population Stratification":
        value = result["distance"]
        # For Population Stratification: lower distances = more similar, so we keep samples with distance <= threshold
        keep_sample = value <= threshold
    else:
        raise ValueError(f"Unknown QC method: {qc_method}")

    if user1 not in final_results:
        final_results[user1] = set()
    if user2 not in final_results:
        final_results[user2] = set()

    if keep_sample:
        final_results[user1].add(sample1)
        final_results[user2].add(sample2)
    else:
        # If condition fails, only remove user2's sample (keep user1's sample)
        final_results[user2].discard(sample2)

def handle_error(error_message, status_code):
    logging.error(error_message)
    return jsonify({"message": error_message}), status_code

def calculate_and_store_chi_square_results(collaboration_uuid):
    try:
        collaboration = db['collaborations'].find_one({"uuid": collaboration_uuid})

        if not collaboration:
            return {"error": "Collaboration not found"}, 404

        stats = collaboration.get('stats', {})
        if not stats:
            return {"error": "No SNP data found in the stats field"}, 400
        # Determine the list of valid participants (initiator + accepted users)
        obligated_user_ids = {str(collaboration['creator_id'])}
        for iu in collaboration.get('invited_users', []):
            if iu.get("status") == "accepted":
                obligated_user_ids.add(str(iu.get("user_id")))

        print(obligated_user_ids)

        chi_square_results = {}
        aggregated_snp_data = {}

        for user_id, user_stats in stats.items():
            if user_id in obligated_user_ids:
                user_snp_stats = {}

                for snp_id, snp_data in user_stats.items():
                    case_counts = [snp_data.get("case", {}).get(str(i), 0) for i in range(3)]
                    control_counts = [snp_data.get("control", {}).get(str(i), 0) for i in range(3)]

                    # Replace zero counts with 0.5 to avoid issues with zero expected frequencies
                    case_counts = [0.5 if count == 0 else count for count in case_counts]
                    control_counts = [0.5 if count == 0 else count for count in control_counts]

                    user_snp_stats[snp_id] = [case_counts, control_counts]

                    # Aggregate SNP data across users
                    if snp_id not in aggregated_snp_data:
                        aggregated_snp_data[snp_id] = {}
                    if user_id not in aggregated_snp_data[snp_id]:
                        aggregated_snp_data[snp_id][user_id] = np.zeros((2, 3))

                    aggregated_snp_data[snp_id][user_id][0] += np.array(case_counts)
                    aggregated_snp_data[snp_id][user_id][1] += np.array(control_counts)

                chi_square_results[user_id] = calc_chi_pvalue(user_snp_stats)

        # Compute chi-square results for the aggregated table - batch all SNPs in ONE call
        aggregated_snp_stats = {}
        for snp_id, user_tables in aggregated_snp_data.items():
            total_table = np.zeros((2, 3))
            for user_table in user_tables.values():
                total_table += user_table
            total_table = np.where(total_table == 0, 0.5, total_table)
            aggregated_snp_stats[snp_id] = total_table.tolist()
        aggregated_results = calc_chi_pvalue(aggregated_snp_stats)
        chi_square_results["aggregated"] = aggregated_results

        # Storing chi-square results in the database
        db['collaborations'].update_one(
            {"uuid": collaboration_uuid},
            {"$set": {"chi_square_results": chi_square_results}},
            upsert=False
        )

        return {"message": "Chi-square results calculated and stored successfully"}, 200

    except Exception as e:
        return {"error": f"Error calculating or storing chi-square results: {str(e)}"}, 500

@app.route('/api/calculate_chi_square', methods=['POST'])
def calculate_chi_square():
    try:
        data = request.get_json()
        collaboration_uuid = data.get('uuid')

        if not collaboration_uuid:
            return jsonify({"error": "UUID is required"}), 400

        result = calculate_and_store_chi_square_results(collaboration_uuid)

        if isinstance(result, tuple) and isinstance(result[0], dict) and isinstance(result[1], int):
            return jsonify(result[0]), result[1]

        return jsonify({"error": "Unexpected response format"}), 500

    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        return jsonify({"error": f"Unexpected error: {str(e)}"}), 500
    

@app.route('/api/calculate_chi_square_results/<collab_uuid>', methods=['GET'])
def get_chi_square_results(collab_uuid):
    try:
        collaboration = db['collaborations'].find_one({"uuid": collab_uuid})
        if not collaboration:
            return jsonify({"error": "Collaboration not found"}), 404
            
        chi_square_results = collaboration.get('chi_square_results', {})

        if not chi_square_results:
            # Return empty results with 200 status instead of 404
            # This indicates results haven't been calculated yet
            return jsonify({
                "chi_square_results": {},
                "status": "pending",
                "message": "Chi-square results not yet calculated"
            }), 200

        return jsonify({"chi_square_results": chi_square_results, "status": "complete"}), 200

    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        return jsonify({"error": f"Unexpected error: {str(e)}"}), 500


def _serialize_ai_summary(record):
    """Convert datetime fields so the AI summary record is JSON-safe."""
    if not record:
        return None
    out = dict(record)
    gen_at = out.get("generated_at")
    if isinstance(gen_at, datetime):
        out["generated_at"] = gen_at.isoformat() + "Z"
    return out


@app.route('/api/collaboration/<uuid>/gwas-summary', methods=['POST'])
def generate_gwas_summary(uuid):
    """
    Generate (or regenerate) a one-page privacy-preserving summary of the
    collaboration's GWAS chi-square results. Only the initiator can call this.
    Only aggregated statistics are sent to the LLM; no raw genotypes or sample IDs.
    """
    try:
        from gwas_summary_llm import build_digest, generate_summary
    except ImportError as e:
        logging.error(f"gwas_summary_llm import failed: {e}")
        return jsonify({"error": "AI summary module unavailable on the server"}), 500

    current_user, error_response = get_current_user()
    if error_response:
        return error_response

    collaboration = db['collaborations'].find_one({"uuid": uuid})
    if not collaboration:
        return jsonify({"error": "Collaboration not found"}), 404
    if str(collaboration.get("creator_id")) != str(current_user.id):
        return jsonify({"error": "Only the collaboration initiator can generate the summary"}), 403
    if not collaboration.get("chi_square_results"):
        return jsonify({"error": "GWAS results are not available yet"}), 409

    try:
        digest = build_digest(collaboration)
    except Exception as e:
        logging.error(f"build_digest failed: {e}")
        return jsonify({"error": f"Could not assemble GWAS digest: {str(e)}"}), 500

    try:
        summary = generate_summary(digest)
    except Exception as e:
        logging.error(f"generate_summary failed: {e}")
        return jsonify({"error": f"AI summary generation failed: {str(e)}"}), 502

    record = {
        "generated_at": datetime.utcnow(),
        "model": summary["model"],
        "schema_version": summary["schema_version"],
        "content": summary["content"],
        "site_label_map": summary["site_label_map"],
        "digest_meta": summary["digest_meta"],
    }
    db['collaborations'].update_one({"uuid": uuid}, {"$set": {"ai_summary": record}})
    return jsonify({"ai_summary": _serialize_ai_summary(record)}), 200


@app.route('/api/collaboration/<uuid>/gwas-summary', methods=['GET'])
def get_gwas_summary(uuid):
    """Return the cached one-page summary for this collaboration (initiator only)."""
    current_user, error_response = get_current_user()
    if error_response:
        return error_response

    collaboration = db['collaborations'].find_one({"uuid": uuid})
    if not collaboration:
        return jsonify({"error": "Collaboration not found"}), 404
    if str(collaboration.get("creator_id")) != str(current_user.id):
        return jsonify({"error": "Only the collaboration initiator can view the summary"}), 403

    summary = collaboration.get("ai_summary")
    return jsonify({"ai_summary": _serialize_ai_summary(summary)}), 200


def calculate_pairwise_distances_pca(df, creator_df=None):
    """
    Calculate pairwise distances for population stratification using PCA data.
    Args:
        df: Combined dataset for PCA analysis (MultiIndex: sample_id, user_id)
        creator_df: Creator dataset (MultiIndex: sample_id, user_id)
    Returns:
        list: Pairwise distance results in the same structure as compute_coefficients_array, but with 'distance'.
    """
    if df is None or creator_df is None or df.empty or creator_df.empty:
        return []

    # Remove any non-numeric columns if present
    df_numeric = df.select_dtypes(include=[float, int])
    creator_df_numeric = creator_df.select_dtypes(include=[float, int])

    # Get index info for mapping back
    df_index = list(df_numeric.index)
    creator_index = list(creator_df_numeric.index)

    # Compute pairwise distances (rows in creator_df vs rows in df)
    distances = pairwise_distances(creator_df_numeric.values, df_numeric.values, metric='euclidean')

    # Normalize distances to [0, 1]
    min_dist = distances.min()
    max_dist = distances.max()
    if max_dist > min_dist:
        norm_distances = (distances - min_dist) / (max_dist - min_dist)
    else:
        norm_distances = distances  # All distances are the same

    results = []
    for i, (sample1, user1) in enumerate(creator_index):
        for j, (sample2, user2) in enumerate(df_index):
            results.append({
                'sample1': sample1,
                'user1': user1,
                'sample2': sample2,
                'user2': user2,
                'distance': float(norm_distances[i, j])
            })
    return results

# ---------------------------------------------------------------------------
# Federated Learning — HTTP surface
# ---------------------------------------------------------------------------

def _fl_unavailable_response():
    return jsonify({
        "error": "FL pipeline is not available on this server.",
        "hint": "Install flwr, torch, scipy and ensure the fl/ module imports cleanly.",
    }), 503


def _fl_state_for_response(collab_doc):
    """Trim the fl_state for API consumers (strip big matrices when not needed)."""
    state = collab_doc.get('fl_state') or {}
    return state


@app.route('/api/fl/state/<collab_uuid>', methods=['GET'])
def fl_get_state(collab_uuid):
    if not FL_AVAILABLE:
        return _fl_unavailable_response()
    collab = db['collaborations'].find_one({"uuid": collab_uuid})
    if not collab:
        return jsonify({"error": "Collaboration not found"}), 404
    if EXPERIMENT_FL not in (collab.get('experiments') or []):
        return jsonify({"error": "Not a Federated Learning collaboration"}), 400
    return jsonify({
        "uuid": collab_uuid,
        "experiment": EXPERIMENT_FL,
        "fl_state": _fl_state_for_response(collab),
        "creator_id": str(collab.get('creator_id')),
        "super_populations": FL_SUPER_POPULATIONS,
    }), 200


@app.route('/api/fl/kickoff/<collab_uuid>', methods=['POST'])
def fl_kickoff(collab_uuid):
    """Manual trigger for stage 1+2 (use when the auto-trigger missed / to retry)."""
    if not FL_AVAILABLE:
        return _fl_unavailable_response()
    current_user, error_response = get_current_user()
    if error_response:
        return error_response
    collab = db['collaborations'].find_one({"uuid": collab_uuid})
    if not collab:
        return jsonify({"error": "Collaboration not found"}), 404
    if str(collab.get('creator_id')) != str(current_user.id):
        return jsonify({"error": "Only the initiator can kick off FL"}), 403
    if EXPERIMENT_FL not in (collab.get('experiments') or []):
        return jsonify({"error": "Not a Federated Learning collaboration"}), 400
    fl_pipeline.bootstrap_fl_state(db['collaborations'], collab_uuid)
    fl_pipeline.launch_projection_and_emd(db['collaborations'], collab_uuid)
    return jsonify({"message": "FL projection + EMD pipeline launched"}), 202


@app.route('/api/fl/apply_threshold', methods=['POST'])
def fl_apply_threshold():
    """Initiator applies an EMD threshold → backend recomputes surviving set."""
    if not FL_AVAILABLE:
        return _fl_unavailable_response()
    current_user, error_response = get_current_user()
    if error_response:
        return error_response
    data = request.get_json() or {}
    collab_uuid = data.get('uuid')
    threshold = data.get('threshold')
    if not collab_uuid or threshold is None:
        return jsonify({"error": "uuid and threshold are required"}), 400
    try:
        threshold = float(threshold)
    except (TypeError, ValueError):
        return jsonify({"error": "threshold must be numeric"}), 400

    collab = db['collaborations'].find_one({"uuid": collab_uuid})
    if not collab:
        return jsonify({"error": "Collaboration not found"}), 404
    if str(collab.get('creator_id')) != str(current_user.id):
        return jsonify({"error": "Only the initiator can apply the EMD threshold"}), 403
    try:
        rows = fl_pipeline.apply_threshold(db['collaborations'], collab_uuid, threshold)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 409
    return jsonify({
        "uuid": collab_uuid,
        "threshold": threshold,
        "survivors": rows,
    }), 200


@app.route('/api/fl/start_training', methods=['POST'])
def fl_start_training():
    """Initiator confirms the surviving set → kick off FedAvg training."""
    if not FL_AVAILABLE:
        return _fl_unavailable_response()
    current_user, error_response = get_current_user()
    if error_response:
        return error_response
    data = request.get_json() or {}
    collab_uuid = data.get('uuid')
    if not collab_uuid:
        return jsonify({"error": "uuid is required"}), 400

    collab = db['collaborations'].find_one({"uuid": collab_uuid})
    if not collab:
        return jsonify({"error": "Collaboration not found"}), 404
    if str(collab.get('creator_id')) != str(current_user.id):
        return jsonify({"error": "Only the initiator can start FL training"}), 403

    fl_state = collab.get('fl_state') or {}
    survivors = fl_state.get('survivors') or []
    if len(survivors) < 2:
        return jsonify({
            "error": "Need ≥ 2 surviving collaborators to train.",
            "hint": "Loosen the EMD threshold and re-apply.",
        }), 409

    # Optionally allow overriding hyper-parameters at start time.
    patch = {}
    for key in ("num_rounds", "local_epochs", "batch_size"):
        val = data.get(key)
        if val is not None:
            try:
                patch[f"fl_state.config.{key}"] = int(val)
            except (TypeError, ValueError):
                return jsonify({"error": f"{key} must be an integer"}), 400
    lr = data.get('learning_rate')
    if lr is not None:
        try:
            patch["fl_state.config.learning_rate"] = float(lr)
        except (TypeError, ValueError):
            return jsonify({"error": "learning_rate must be numeric"}), 400
    if patch:
        db['collaborations'].update_one({"uuid": collab_uuid}, {"$set": patch})

    fl_pipeline.launch_training(db['collaborations'], collab_uuid)
    return jsonify({"message": "FL training launched", "survivors": survivors}), 202


@app.route('/api/fl/config', methods=['GET'])
def fl_get_defaults():
    """Expose FL defaults so the frontend can render sensible sliders."""
    if not FL_AVAILABLE:
        return _fl_unavailable_response()
    return jsonify({
        "epsilon": float(FL_DEFAULT_EPSILON),
        "emd_threshold": float(FL_DEFAULT_EMD_THRESHOLD),
        "num_rounds": int(FL_DEFAULT_ROUNDS),
        "local_epochs": int(FL_DEFAULT_LOCAL_EPOCHS),
        "batch_size": int(FL_DEFAULT_BATCH_SIZE),
        "learning_rate": float(FL_DEFAULT_LR),
        "super_populations": FL_SUPER_POPULATIONS,
        "fl_qc_method": FL_QC_METHOD,
    }), 200


if __name__ == '__main__':
    app.run(debug=True)
