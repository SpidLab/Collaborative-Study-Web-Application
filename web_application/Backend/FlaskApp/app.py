from flask import Flask, request, jsonify
from pymongo.mongo_client import MongoClient
from flask_login import LoginManager, login_user, logout_user, login_required, UserMixin
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from bson.objectid import ObjectId
from bson.json_util import dumps
import json
import os
from dotenv import load_dotenv, find_dotenv
import pandas as pd
from werkzeug.utils import secure_filename
import os


app = Flask(__name__)
load_dotenv(find_dotenv())

app.config["MONGO_URI"] = os.getenv("MONGO_URI")
app.config["PORT"] = os.getenv("PORT")
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
        return jsonify({'message': 'Login successful'}), 200

    return jsonify({'message': 'Invalid email or password'}), 401

@app.route('/api/logout', methods=['POST'])
@login_required
def logout():
    logout_user()
    return jsonify({'message': 'Logout successful'})

@app.route('/api/users', methods=['GET'])
def get_users():
    users = db.users.find({})
    users_list = [{"email": user["email"], "_id": str(user["_id"])} for user in users]
    # Convert the list to JSON, `dumps` from `bson.json_util` handles MongoDB ObjectId
    return dumps(users_list), 200


@app.route('/api/uplaod_csv', methods=['POST'])
@login_required
def upload_csv():
    # Check if the post request has the file part
    if 'file' not in request.files:
       return jsonify({'message': 'No file part in the request'}), 400
    file = request.files['file']
    # If the user does not select a file, the browser submits an empty file w/o a filename
    if file.filename == '':
        return jsonify({'message': 'No selected file'}), 400
    if file and file.filename.endswith('.csv'):
        filename = secure_filename(file.filename)
        filepath = os.path.join('/tmp', filename)
        file.save(filepath)
        try:
            df = pd.read_csv(filepath)
                # calculate coefficients after upload

            return jsonify({'message': 'CSV file processed successfully'}), 200
        except Exception as e:
            return jsonify({'message': 'An error occurred while processing the file', 'error': str(e)}), 500
    else:
        return jsonify({'message': 'Unsupported file type'}), 400
    
    
if __name__ == '__main__':
    app.run(debug=True)



