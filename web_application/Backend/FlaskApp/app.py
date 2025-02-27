import traceback

from pandas import DataFrame
import numpy as np
from flask import Flask, request, jsonify, g
from flask_login import LoginManager, login_user, logout_user, UserMixin
from flask_cors import CORS
from importlib_metadata import metadata
from itsdangerous import Serializer, SignatureExpired, BadSignature
from werkzeug.security import generate_password_hash, check_password_hash
from bson.objectid import ObjectId
from bson.json_util import dumps
from dotenv import load_dotenv, find_dotenv
from werkzeug.utils import secure_filename
from pymongo.mongo_client import MongoClient
import os
import jwt
import datetime
import time
from flask_httpauth import HTTPBasicAuth
import json
import pandas as pd
import logging
from calculate_coefficients import compute_coefficients_array
from fuzzywuzzy import process
import uuid
from stats import calc_chi_pvalue
# from stats import calc_chi_pvalue

app = Flask(__name__)
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
        search_filter = {}
        if min_samples:
            try:
                min_samples_int = int(min_samples)
                search_filter['$expr'] = {"$gte": [{"$toInt": "$number_of_samples"}, min_samples_int]}
            except ValueError:
                return jsonify({"error": "minSamples must be an integer"}), 400

        # Fetch datasets from the database
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

        # Prepare the response list
        users_list = []
        for doc in matched_datasets:
            user_id_str = doc.get('user_id')
            if not user_id_str:
                continue  # Skip if user_id is missing

            # Exclude current user
            if user_id_str == str(current_user.get_id()):
                continue

            user = user_map.get(user_id_str)
            if not user:
                continue  # Skip if user not found

            users_list.append({
                "dataset_id": str(doc["_id"]),
                "_id": user_id_str,
                "name": user.get("name", "No Name Provided"),
                "phenotype": doc.get('phenotype', "No Phenotype"),
                "number_of_samples": doc.get('number_of_samples', "No Samples")
            })

        return jsonify(users_list), 200

    except Exception as e:
        logging.error(f"Error: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500



@app.route('/api/invitations', methods=['GET'])
def get_user_invitations():
    try:
        current_user, error_response = get_current_user()
        if error_response:
            return error_response
        
        user_id = current_user.get_id()
        
        # Find collaborations where the user is either the creator (sender) or an invited user (receiver)
        collaborations = db.collaborations.find({
            '$or': [
                {'creator_id': ObjectId(user_id)},  # If the user is the sender (creator)
                {'invited_users.user_id': ObjectId(user_id)}  # If the user is an invited user (receiver)
            ]
        })
        

        invitations_list = []
        
        # Iterate over the collaborations
        for collaboration in collaborations:
            collaboration_uuid = collaboration.get("uuid", None)
            collaboration_name = collaboration.get("name", "No name")

            # Sender (initiator) info
            sender_user = db.users.find_one({"_id": ObjectId(collaboration["creator_id"])})
            sender_email = sender_user["email"] if sender_user else "Unknown"
            sender_name = sender_user["name"] if sender_user else "Unknown"
            
            # Iterate over invited users
            for invited_user in collaboration.get('invited_users', []):
                receiver_user = db.users.find_one({"_id": ObjectId(invited_user["user_id"])})
                receiver_email = receiver_user["email"] if receiver_user else "Unknown"
                receiver_name = receiver_user["name"] if receiver_user else "Unknown"
                
                # Only include invitations where the user is the sender or receiver
                if str(invited_user["user_id"]) == user_id or str(collaboration["creator_id"]) == user_id:
                    invitations_list.append({
                        "_id": str(collaboration["_id"]),
                        "uuid": str(collaboration_uuid),
                        "collab_name": collaboration_name,
                        "collab_uuid": str(collaboration_uuid),
                        "receiver_id": str(invited_user["user_id"]),
                        "sender_id": str(collaboration["creator_id"]),
                        "receiver_email": receiver_email,
                        "receiver_name": receiver_name,
                        "sender_email": sender_email,
                        "sender_name": sender_name,
                        "status": invited_user["status"],
                        "phenotype": invited_user.get("phenotype", "Not provided")
                    })

        return jsonify({"invitations": invitations_list, "user_id": user_id}), 200
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
        result = db.collaborations.update_one(
            {'uuid': uuid, 'invited_users.user_id': ObjectId(user_id)},
            {'$set': {'invited_users.$.status': 'accepted'}}   
        )

        if result.modified_count == 0:
            return jsonify({'message': 'No matching user found in invited_users'}), 404

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

        return jsonify({'message': 'Invitation status updated successfully to accepted'}), 200
    else:
        return jsonify({'message': 'No matching collaboration found'}), 404


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

        
        datasets_cursor = db.datasets.find(
            {'user_id': user_id},
            {'phenotype': 1, 'number_of_samples': 1, '_id' : 1}  # Projection: include only these fields
        )

        datasets = []
        for dataset in datasets_cursor:
            dataset_id = dataset.get('_id', 'N/A')
            phenotype = dataset.get('phenotype', 'N/A')
            number_of_samples = dataset.get('number_of_samples', '0')

            # Ensure both fields are strings
            dataset_id = str(dataset_id) if not isinstance(dataset_id, str) else dataset_id
            phenotype = str(phenotype) if not isinstance(phenotype, str) else phenotype
            number_of_samples = str(number_of_samples) if not isinstance(number_of_samples, str) else number_of_samples

            datasets.append({
                'phenotype': phenotype,
                'number_of_samples': number_of_samples,
                'dataset_id' : dataset_id

            })

        return jsonify({'datasets': datasets}), 200

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
        invited_users = data.get('invitedUsers', [])
        creator_dataset_id = data.get('creatorDatasetId')
        logging.info(invited_users)

        if not collab_name:
            logging.error("Collaboration name missing in the request")
            return jsonify({"error": "Collaboration name is required"}), 400
            

        collaboration = {
            'uuid': str(uuid.uuid4()),
            'name': collab_name,
            'experiments': experiments,
            'creator_id': ObjectId(creator_id),
            'creator_dataset_id': ObjectId(creator_dataset_id),
            'invited_users': [
                {
                    'user_id': ObjectId(user['_id']),
                    'user_dataset_id': ObjectId(user['dataset_id']),
                    'status': 'pending',
                    'phenotype': user.get('phenotype', 'N/A'),
                } for user in invited_users
            ],
            # 'created_at': datetime.datetime.utcnow()  # Optionally add timestamp
        }

        result = db.collaborations.insert_one(collaboration)
        logging.info(f"Inserted collaboration with id: {result.inserted_id}")


        return jsonify({
            'message': 'Collaboration created successfully',
            'collaboration_id': collaboration['uuid']
        }), 201

    except Exception as e:
        logging.error(f"Error creating collaboration: {str(e)}")
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
            invited_user_dataset_uploaded = True if invited_user_dataset and len(invited_user_dataset.get('data', [])) > 0 else False

            phenotype = invited_user_dataset.get('phenotype') if invited_user_dataset else None
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


        # To check if the Stat Exist and which user has uploaded their stat data for conditional UI Rendering
        stats = collaboration.get('stats', {})
        stat_uploaded_users = []
        for su_id, user_obj in stats.items():
            if user_obj and isinstance(user_obj, dict) and len(user_obj) > 0:
                stat_uploaded_users.append(su_id)
        
        stat_uploaded = True
        waiting_user_to_upload_stat = []

        if sender_id not in stat_uploaded_users:
            stat_uploaded = False
            waiting_user_to_upload_stat.append(sender_id)

        for invited_user in invited_users_details:
            u_id = invited_user.get("user_id")
    
            if u_id not in stat_uploaded_users:
                stat_uploaded = False
                waiting_user_to_upload_stat.append(u_id)

        # To fetch the data of creator/initator
        dataset = db.datasets.find_one(
            {'_id': ObjectId(collaboration["creator_dataset_id"])},
            {'phenotype': 1, 'number_of_samples': 1}
        )

        # To fetch the data of invited_user/collaborator
        # invited_dataset = db.datasets.find_one(
        #     {'_id': ObjectId(collaboration["user_dataset_id"])},
        #     {'phenotype': 1, 'number_of_samples': 1}
        # )
        # Making multiple queries can be optimised but using for time being
        creator_phenotype = dataset.get('phenotype', 'N/A') if dataset else 'N/A'
        creator_number_of_samples = dataset.get('number_of_samples', '0') if dataset else '0'
        creator_dataset = {
            'phenotype': creator_phenotype,
            'samples': creator_number_of_samples
        }

        # invited_user_phenotype = invited_dataset.get('phenotype', 'N/A') if invited_dataset else 'N/A'
        # invited_user_number_of_samples = invited_dataset.get('number_of_samples', '0') if invited_dataset else '0'
        # invited_user_dataset = {
        #     'phenotype': invited_user_phenotype,
        #     'samples': invited_user_number_of_samples
        # }

        collaboration_details = {
            'uuid': collaboration['uuid'],
            'name': collaboration['name'],
            'experiments': collaboration.get('experiments', []),
            'phenotype': collaboration.get('phenotype', None),
            'samples': collaboration.get('samples', None),
            'is_sender': is_sender,
            'sender_id': sender_id,
            'sender_name': sender_name,
            'invited_users': invited_users_details,
            'creator_datasets': creator_dataset,
            "missing_stat_user": list(set(waiting_user_to_upload_stat)),
            "stat_uploaded": stat_uploaded
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

        return jsonify({"message": "Metadata uploaded successfully", "dataset_id": dataset_id}), 200

    except Exception as e:
        logging.error(f'Unexpected error: {str(e)}')
        return jsonify({'message': 'An error occurred while processing the metadata', 'error': str(e)}), 500

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

        # Get the dataset ID and file from the request
        dataset_id = request.form.get('dataset_id')  # Expecting dataset_id in JSON payload
        if not dataset_id:
            return jsonify({"error": "Dataset ID is required"}), 400

        file = request.files['file']

        if not file or file.filename == '':
            return jsonify({"error": "CSV file is required"}), 400

        if not file.filename.endswith('.csv'):
            return jsonify({"error": "Only CSV files are supported"}), 400

        # Read the file directly into a DataFrame, setting the first column as sample_id
        df = pd.read_csv(file, index_col=0)
        df.index.name = 'sample_id'  # Set the index name

        if not df.empty:
            data = {}

            # Store each row in the data dictionary using sample_id as the key
            for sample_id, row in df.iterrows():
                data[str(sample_id)] = row.to_dict()

        # Get the dataset from the DB
        dataset = db['datasets'].find_one({"_id": ObjectId(dataset_id)})
        if not dataset:
            return jsonify({"error": "Dataset not found"}), 404


        # Update the dataset in the DB with the new data
        db['datasets'].update_one(
            {"_id": ObjectId(dataset_id)},
            {"$set": {"data": data}}
        )

        return jsonify({"message": "Dataset updated successfully"}), 200

    except Exception as e:
        logging.error(f'Error updating dataset with CSV data: {str(e)}')
        return jsonify({"error": "An error occurred while processing the CSV file", "details": str(e)}), 500



@app.route('/api/upload_csv_stats', methods=['POST'])
def upload_csv_stats():
    try:
        # Validate Authorization header
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

        # Check for file in the request
        if 'file' not in request.files:
            logging.error('No file part in the request')
            return jsonify({'message': 'No file part in the request'}), 400

        file = request.files['file']

        # Check if file is selected and has a valid CSV format
        if file.filename == '':
            logging.error('No selected file')
            return jsonify({'message': 'No selected file'}), 400

        if not file.filename.endswith('.csv'):
            logging.error('Unsupported file type')
            return jsonify({'message': 'Unsupported file type'}), 400

        # Get the collaboration UUID from the request
        collaboration_uuid = request.form.get('uuid')
        if not collaboration_uuid:
            logging.error("Collaboration UUID missing")
            return jsonify({"error": "Collaboration UUID missing"}), 400

        try:
            # Read CSV into DataFrame
            df = pd.read_csv(file)

            # Ensure the first column is SNP_ID
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
@app.route('/api/user/<user_id>/collaborations', methods=['GET'])
def get_user_collaborations(user_id):
    # Find all sessions where the user is either the owner or a collaborator
    sessions = Session.objects.filter(__raw__={'$or': [{'userID': user_id}, {'collaborators': user_id}]})
    
    # Prepare the list of sessions with session ID and collaborators
    collaborations = [
        {'sessionID': str(session.id), 'collaborators': session.collaborators} 
        for session in sessions
    ]
    
    return jsonify(collaborations), 200


# Start session - need to fix the calculate_coefficient.py file
@app.route('/api/start_session', methods=['POST'])
def start_session():
    data = request.json
    user_ids = data.get('user_ids')  # Expecting a list of user IDs

    try:
        dataframes = []
        for user_id in user_ids:
            dataset = db.datasets.find_one({'userID': user_id})
            if dataset:
                df = pd.read_csv(io.StringIO(dataset['csv_content']))
                dataframes.append(df)
            else:
                return jsonify({'message': f"Dataset for user {user_id} not found"}), 404

        merged_data = pd.concat(dataframes, axis=1, join='inner')
        coeff_arr = compute_coefficients_array(merged_data)

        results_table = pd.DataFrame(list(coeff_arr.items()), columns=['Pair', 'Coefficient'])

        return results_table.to_json(orient='records'), 200

    except Exception as e:
        return jsonify({'message': 'An error occurred while starting session', 'error': str(e)}), 500
     
@app.route('/api/calculations', methods=['GET'])
def calculate_cofficients():
    data = request.json
    user1 = data['user1']
    user2 = data['user2']

    

    # Connect to MongoDB
    client = MongoClient(os.getenv("MONGO_URI"))

    try:
        # Get datasets for both users
        df_user1 = get_user_dataset(client, user1)
        df_user2 = get_user_dataset(client, user2)

        # Merge the datasets

        merged_data = pd.concat([df_user1, df_user2], axis=1)
  
        # Compute coefficients
        coeff_arr = compute_coefficients_array(merged_data)

        # Convert the results to a table format (DataFrame)
        results_table = pd.DataFrame(list(coeff_arr.items()), columns=['Pair', 'Coefficient'])
        
        # Return the table as a JSON response
        return results_table.to_json(orient='records'), 200

    except ValueError as ve:
        return jsonify({'message': str(ve)}), 404
    except Exception as e:
        return jsonify({'message': 'An error occurred', 'error': str(e)}), 500

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
            print("Collaboration not found.")
            return None  # Collaboration not found
        return collaboration_data

    except Exception as e:
        print(f"Error fetching collaboration data for UUID {uuid}: {str(e)}")
        raise  # Re-raise the exception for higher-level handling


def fetch_datasets_by_ids(dataset_ids):
    dataset_collection = db["datasets"]
    datasets = []

    for dataset_id in dataset_ids:
        dataset = dataset_collection.find_one({"_id": ObjectId(dataset_id)})
        if dataset:
            datasets.append(dataset)
        else:
            print(f"Dataset ID {dataset_id} not found.")

    return datasets


def combine_datasets(dataset_ids, fetch_dataset):
    combined_data = []

    for dataset_id in dataset_ids:
        dataset = fetch_dataset(dataset_id)  # Fetch dataset by ID

        if 'data' in dataset:
            sample_data = dataset['data']
            all_columns = set()

            # Prepare list of sample data dictionaries
            samples = []

            for sample_id, sample in sample_data.items():
                sample['sample_id'] = sample_id  # Add sample_id field

                # Ensure that we have all columns (rs SNPs) in the DataFrame
                all_columns.update(sample.keys())

                # Append the sample data to the list
                samples.append(sample)

            # Create DataFrame from the sample data
            df = pd.DataFrame(samples)

            # Add 'user_id' to each sample's data
            df['user_id'] = dataset.get('user_id')

            # Set the multi-index with sample_id and user_id
            df.set_index(['sample_id', 'user_id'], inplace=True)

            combined_data.append(df)
        else:
            print(f"Dataset ID {dataset_id} does not contain 'data' key. Skipping.")

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

                # For each sample in the dataset, gather the SNPs and add sample_id/user_id
                for sample_id, sample in sample_data.items():
                    sample['sample_id'] = sample_id
                    sample['user_id'] = user_id
                    samples.append(sample)

                    all_columns.update(sample.keys())

                # Create DataFrame from the sample data
                df = pd.DataFrame(samples)

                # Reorder the DataFrame columns and set the index
                df = df.reindex(columns=sorted(all_columns))  # Ensure all columns exist
                df.set_index(['sample_id', 'user_id'], inplace=True)

                dfs.append(df)

        if dfs:
            combined_df = pd.concat(dfs)
            combined_df = combined_df[sorted(combined_df.columns)]  # Sort columns
            return combined_df

    return pd.DataFrame()

def get_combined_datasets(collab_uuid):
    try:
        # Fetch collaboration data
        collaboration_data = fetch_collaboration_data(collab_uuid)
        if not collaboration_data:
            return jsonify({"error": "Collaboration not found for the provided UUID."}), 404

        # Get threshold and dataset IDs
        threshold = collaboration_data.get("threshold", 1)
        invited_users = collaboration_data.get("invited_users", [])
        creator_dataset_id = collaboration_data.get("creator_dataset_id")

        all_dataset_ids = [user["user_dataset_id"] for user in invited_users if "user_dataset_id" in user]
        if creator_dataset_id:
            all_dataset_ids.append(creator_dataset_id)

        # Fetch datasets and combine
        datasets_data = fetch_datasets_by_ids(all_dataset_ids)
        if not datasets_data:
            return jsonify({"error": "No datasets found for the provided IDs."}), 404

        combined_df = combine_datasets_to_dataframe(datasets_data)

        # Return the combined DataFrame and threshold
        return combined_df, threshold

    except Exception as e:
        print(f"An error occurred: {str(e)}")
        return jsonify({"error": str(e)}), 500

def store_qc_results_in_mongo(collab_uuid, results_array, key: str):
    try:
        # Get the collaboration data
        collaboration_collection = db["collaborations"]
        collaboration_data = collaboration_collection.find_one({"uuid": collab_uuid})

        if collaboration_data is None:
            print("Collaboration not found.")
            return None

        # Add the results to the document
        collaboration_collection.update_one(
            {"uuid": collab_uuid},
            {"$set": {key: results_array}}
        )
        print("Results stored successfully.")

    except Exception as e:
        print(f"Error storing results: {str(e)}")

# def store_qc_results_in_mongo(collab_uuid, results_array):
#     try:
#         # Get the collaboration data
#         collaboration_collection = db["collaborations"]
#         collaboration_data = collaboration_collection.find_one({"uuid": collab_uuid})
#
#         if collaboration_data is None:
#             print("Collaboration not found.")
#             return None
#
#         # Add the results to the document
#         collaboration_collection.update_one(
#             {"uuid": collab_uuid},
#             {"$set": {"qc_results": results_array}}
#         )
#         print("Results stored successfully.")
#
#     except Exception as e:
#         print(f"Error storing results: {str(e)}")
# init qc
@app.route('/api/datasets/<collab_uuid>', methods=['POST'])
def initiate_qc(collab_uuid):
    try:
        # Get the combined datasets and threshold from the collaboration data
        df, threshold = get_combined_datasets(collab_uuid)

        if isinstance(df, dict):  # Check for an error response (dict could be an error message)
            return df  # This is already a JSON response

        print("Got datasets")
        # print(df)
        print(df)
        

        # Compute the coefficients using the fetched threshold
        results = compute_coefficients_array(df)

        if results:
            print("Results computed successfully.")

            # Store the computed results in MongoDB
            store_qc_results_in_mongo(collab_uuid, results, "full_qc")

            # Return the results as a JSON response
            return jsonify(results), 200  # Return results as JSON response
        else:
            return jsonify({"error": "No results returned from compute_coefficients_array."}), 404

    except Exception as e:
        print(f"An error occurred in initiate_qc: {str(e)}")
        return jsonify({"error": str(e)}), 500  # Return an error response

@app.route('/api/datasets/<collab_uuid>/qc-results', methods=['GET'])
def get_initial_qc_matrix(collab_uuid):
    try:
        # Fetch collaboration data
        collaboration_data = fetch_collaboration_data(collab_uuid)
        if not collaboration_data:
            return jsonify({"error": "Collaboration not found."}), 404

        # Get the QC results matrix from the collaboration data
        full_qc_results = collaboration_data.get("full_qc", [])
        threshold_value = collaboration_data.get("threshold", None)
        threshold_value = collaboration_data.get("threshold", None)

        if not full_qc_results:
            return jsonify({"message": "No QC results available for this collaboration."}), 201

        # Return the full QC results matrix as a JSON response
        return jsonify(full_qc_results=full_qc_results, threshold=threshold_value), 200

    except Exception as e:
        print(f"Error retrieving QC results matrix: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/datasets/<collab_uuid>/qc-results', methods=['POST'])
# def get_filtered_qc_results(collab_uuid):
#     try:
#         # Fetch collaboration data
#         collaboration_data = fetch_collaboration_data(collab_uuid)
#         if not collaboration_data:
#             return jsonify({"error": "Collaboration not found."}), 404

#         # Get the threshold value from the request body (or fallback to the default in collaboration data)
#         threshold = request.json.get("threshold", collaboration_data.get("threshold", 0.08))
#         print("Threshold received:", threshold)

#         # Reference to MongoDB collection
#         collaboration_collection = db["collaborations"]

#         # Check if threshold was already set in the database
#         existing_threshold = collaboration_data.get("threshold")

#         if existing_threshold is not None:
#             # First, remove 'stats' and 'chi_square_results' if threshold was already set
#             collaboration_collection.update_one(
#                 {"uuid": collab_uuid},
#                 {"$unset": {"stats": "", "chi_square_results": ""}}
#             )

#         # Update threshold in the database
#         threshold_update_result = collaboration_collection.update_one(
#             {"uuid": collab_uuid},
#             {"$set": {"threshold": threshold}}
#         )

#         if threshold_update_result.matched_count == 0:
#             return jsonify({"error": "Failed to update threshold."}), 500

#         # Get full QC results
#         full_qc_results = collaboration_data.get("full_qc", [])
#         filtered_results = {}

#         # Filter results based on the threshold and phi value
#         for result in full_qc_results:
#             if result["phi_value"] < threshold:
#                 user1, sample1 = result["user1"], result["sample1"]
#                 user2, sample2 = result["user2"], result["sample2"]

#                 # Add samples to filtered results
#                 if user1 not in filtered_results:
#                     filtered_results[user1] = set()
#                 filtered_results[user1].add(sample1)

#                 if user2 not in filtered_results:
#                     filtered_results[user2] = set()
#                 filtered_results[user2].add(sample2)

#         # Convert sets to lists for JSON serialization
#         for user_id in filtered_results:
#             filtered_results[user_id] = list(filtered_results[user_id])

#         # Store the filtered results in the database
#         filtered_qc_update_result = collaboration_collection.update_one(
#             {"uuid": collab_uuid},
#             {"$set": {"filtered_qc": filtered_results}}
#         )

#         if filtered_qc_update_result.matched_count == 0:
#             return jsonify({"error": "Failed to update filtered QC results."}), 500

#         return jsonify(filtered_results), 200

#     except Exception as e:
#         print(f"Error retrieving and filtering QC results: {str(e)}")
#         return jsonify({"error": str(e)}), 500

def get_filtered_qc_results(collab_uuid):
    try:
        # Fetch collaboration data
        collaboration_data = fetch_collaboration_data(collab_uuid)
        if not collaboration_data:
            return jsonify({"error": "Collaboration not found."}), 404

        # Get the threshold value from the request body (or fallback to the default in collaboration data)
        threshold = request.json.get("threshold", collaboration_data.get("threshold", 0.08))
        print("Threshold received:", threshold)

        # Reference to MongoDB collection
        collaboration_collection = db["collaborations"]

        # Check if threshold was already set in the database
        existing_threshold = collaboration_data.get("threshold")

        if existing_threshold is not None:
            # First, remove 'stats' and 'chi_square_results' if threshold was already set
            collaboration_collection.update_one(
                {"uuid": collab_uuid},
                {"$unset": {"stats": "", "chi_square_results": ""}}
            )

        # Update threshold in the database
        threshold_update_result = collaboration_collection.update_one(
            {"uuid": collab_uuid},
            {"$set": {"threshold": threshold}}
        )

        if threshold_update_result.matched_count == 0:
            return jsonify({"error": "Failed to update threshold."}), 500

        full_qc_results = collaboration_data.get("full_qc", [])

        final_results = {}

        for result in full_qc_results:
            user1, sample1 = result["user1"], result["sample1"]
            user2, sample2 = result["user2"], result["sample2"]
            phi_value = result["phi_value"]

            if user1 not in final_results:
                final_results[user1] = set()
            if user2 not in final_results:
                final_results[user2] = set()

            if phi_value > threshold:
                final_results[user1].discard(sample1)
                final_results[user2].discard(sample2)
            else:
                final_results[user1].add(sample1)
                final_results[user2].add(sample2)

        for user_id in final_results:
            final_results[user_id] = list(final_results[user_id])

        filtered_qc_update_result = collaboration_collection.update_one(
            {"uuid": collab_uuid},
            {"$set": {"filtered_qc": final_results}}
        )

        if filtered_qc_update_result.matched_count == 0:
            return jsonify({"error": "Failed to update filtered QC results."}), 500

        return jsonify(final_results), 200

    except Exception as e:
        print(f"Error retrieving and filtering QC results: {str(e)}")
        return jsonify({"error": str(e)}), 500


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

        chi_square_results = {}
        aggregated_snp_data = {}

        for user_id, user_stats in stats.items():
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

        # Compute chi-square results for the aggregated table
        aggregated_results = {}
        for snp_id, user_tables in aggregated_snp_data.items():
            total_table = np.zeros((2, 3))
            for user_table in user_tables.values():
                total_table += user_table

            # Replace zero counts with 0.5 in the aggregated table to prevent zero expected frequencies
            total_table = np.where(total_table == 0, 0.5, total_table)

            # Ensure chi-square calculation is performed only on valid tables
            aggregated_results[snp_id] = calc_chi_pvalue({snp_id: total_table})[snp_id]

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
        # Fetch the chi-square results from the database (after calculation)
        collaboration = db['collaborations'].find_one({"uuid": collab_uuid})
        chi_square_results = collaboration.get('chi_square_results', {})

        if not chi_square_results:
            return jsonify({"error": "Chi-square results not found"}), 404

        return jsonify({"chi_square_results": chi_square_results}), 200

    except Exception as e:
        print(f"Unexpected error: {str(e)}")
        return jsonify({"error": f"Unexpected error: {str(e)}"}), 500


if __name__ == '__main__':
    app.run(debug=True)
