from flask import Flask, request, jsonify, g
from flask_login import LoginManager, login_user, logout_user, UserMixin
from flask_cors import CORS
from itsdangerous import Serializer, SignatureExpired, BadSignature
from werkzeug.security import generate_password_hash, check_password_hash
from bson.objectid import ObjectId
from bson.json_util import dumps
from dotenv import load_dotenv, find_dotenv
from werkzeug.utils import secure_filename
from pymongo.mongo_client import MongoClient
import os
import jwt
import time
from flask_httpauth import HTTPBasicAuth
import json
import pandas as pd
# import logging

#Added Pandas

app = Flask(__name__)
load_dotenv(find_dotenv())
auth = HTTPBasicAuth()

app.config["MONGO_URI"] = os.getenv("MONGO_URI")
app.config["PORT"] = os.getenv("PORT")
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY')
CORS(app)  # Initialize CORS

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

    def generate_auth_token(self, expires_in=600):
        return jwt.encode(
            {'id': self.id, 'exp': time.time() + expires_in},
            app.config['SECRET_KEY'], algorithm='HS256')

    @staticmethod
    def verify_auth_token(token):
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

@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()
    email = data['email']
    password = data['password']
    user = db.users.find_one({'email': email})

    if user:
        return jsonify({'message': 'email already exists'}), 409

    hashed_password = generate_password_hash(password, method='sha256')
    db.users.insert_one({'email': email, 'password': hashed_password})

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

@app.route('/api/logout', methods=['POST'])
def logout():
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

@app.route('/api/invitations', methods=['GET'])
def get_user_invitations():
    data = request.get_json()
    user_id = data['user_id']

    invitations = db.invitations.find({
        '$or': [
            {'receiver_id': ObjectId(user_id)},
            {'sender_id': ObjectId(user_id)}
        ]
    })

    invitations_list = [{
        "_id": str(invitation["_id"]),
        "receiver_id": str(invitation["receiver_id"]),
        "sender_id": str(invitation["sender_id"]),
        "research_project_id": str(invitation["research_project_id"]),
        "status": invitation["status"]
    } for invitation in invitations]

    return jsonify(invitations_list), 200

@app.route('/api/sendinvitation', methods=['POST'])
def send_invitation():
    data = request.get_json()
    receiver_id = data['receiver_id']
    sender_id = data['sender_id']
    research_project_id = data['research_project_id']

    invitation = {
        'receiver_id': ObjectId(receiver_id),
        'sender_id': ObjectId(sender_id),
        'research_project_id': ObjectId(research_project_id),
        'status': 'pending'  # Add status field
    }

    db.invitations.insert_one(invitation)

    return jsonify({'message': 'Invitation sent successfully'}), 200

@app.route('/api/acceptinvitation', methods=['POST'])
def accept_invitation():
    data = request.get_json()
    receiver_id = data['receiver_id']
    sender_id = data['sender_id']
    research_project_id = data['research_project_id']

    invitation = db.invitations.find_one({
        'receiver_id': ObjectId(receiver_id),
        'sender_id': ObjectId(sender_id),
        'research_project_id': ObjectId(research_project_id)
    })

    if invitation:
        db.invitations.update_one(
            {'_id': invitation['_id']},
            {'$set': {'status': 'accepted'}}
        )
        return jsonify({'message': 'Invitation status updated successfully to accepted'}), 200
    else:
        return jsonify({'message': 'No matching invitation found'}), 404

@app.route('/api/rejectinvitation', methods=['POST'])
def reject_invitation():
    data = request.get_json()
    receiver_id = data['receiver_id']
    sender_id = data['sender_id']
    research_project_id = data['research_project_id']

    invitation = db.invitations.find_one({
        'receiver_id': ObjectId(receiver_id),
        'sender_id': ObjectId(sender_id),
        'research_project_id': ObjectId(research_project_id)
    })

    if invitation:
        db.invitations.update_one(
            {'_id': invitation['_id']},
            {'$set': {'status': 'rejected'}}
        )
        return jsonify({'message': 'Invitation status updated successfully to rejected'}), 200
    else:
        return jsonify({'message': 'No matching invitation found'}), 404


@app.route('/api/upload_csv', methods=['POST'])
def upload_csv():
    try:
        # Check if the post request has the file part
        if 'file' not in request.files:
            return jsonify({'message': 'No file part in the request'}), 400

        # Get text fields from the request
        field1 = request.form.get('field1')
        field2 = request.form.get('field2')

        file = request.files['file']
        # If the user does not select a file, the browser submits an empty file w/o a filename
        if file.filename == '':
            return jsonify({'message': 'No selected file'}), 400
        if file and file.filename.endswith('.csv'):
            filename = secure_filename(file.filename)
            filepath = os.path.join('/tmp', filename)
            file.save(filepath)

            # Initialize an empty list to store records
            records = []

            try:
                df = pd.read_csv(filepath)
                # Check if DataFrame is not empty
                if not df.empty:
                    # Iterate over DataFrame rows and construct records
                    for index, row in df.iterrows():
                        record = {}  # Initialize record as a dictionary
                        record['datasetID'] = str(ObjectId())  
                        record['field1'] = field1
                        record['field2'] = field2
                        # Populate record with row data
                        for column, value in row.items():
                            record[column] = value
                        records.append(record)  # Append record to records list
            except Exception as e:
                return jsonify({'message': 'An error occurred while processing the file', 'error': str(e)}), 500

            # Insert records into MongoDB
            if records:
                db.fileUploads.insert_many(records)

            return jsonify({'message': 'CSV file processed successfully'}), 200
        else:
            return jsonify({'message': 'Unsupported file type'}), 400
    except Exception as e:
        return jsonify({'message': 'An error occurred while processing the file', 'error': str(e)}), 500

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


# Start collaboration - need to fix the calculate_coefficient.py file
@app.route('/api/start_collaboration', methods=['POST'])
def start_collaboration():
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
        coeff_dict = compute_coefficients_dictionary(merged_data)

        results_table = pd.DataFrame(list(coeff_dict.items()), columns=['Pair', 'Coefficient'])

        return results_table.to_json(orient='records'), 200

    except Exception as e:
        return jsonify({'message': 'An error occurred while starting collaboration', 'error': str(e)}), 500
    


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


if __name__ == '__main__':
    app.run(debug=True)



