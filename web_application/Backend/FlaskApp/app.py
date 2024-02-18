from flask import Flask, render_template, redirect, url_for, session
from flask_pymongo import PyMongo
from flask_login import LoginManager
from flask_session import Session
from authlib.integrations.flask_client import OAuth
from dotenv import load_dotenv
import os
import sys

app = Flask(__name__)

# Initialize PyMongo
mongo = PyMongo(app)

# Initialize Flask-Login
login_manager = LoginManager()
login_manager.init_app(app)

# Initialize Flask-Session
Session(app)

# Initialize OAuth lib with your Flask app
oauth = OAuth(app)

# Check if .env file exists
if os.path.exists(".env"):
    load_dotenv(".env")
else:
    print(".env file not found.")
    sys.exit(1)  # Exit if .env file is not found

# Accessing environment variables
app.config['GOOGLE_CLIENT_ID'] = os.getenv("GOOGLE_CLIENT_ID")
app.config['GOOGLE_CLIENT_SECRET'] = os.getenv("GOOGLE_CLIENT_SECRET")
app.config['PORT'] = int(os.getenv("PORT", 5000))  # Default to 5000 if PORT is not set
app.config['MONGO_URI'] = os.getenv("MONGODB_URI")
app.config['COOKIE_KEY'] = os.getenv("COOKIE_KEY")

if not MONGO_URI:
    print("No mongo connection string. Set MONGODB_URI environment variable.")
    sys.exit(1)  # Exit if MONGODB_URI is not set

# Make sure to set the secret key for sessions
app.secret_key = app.config['SECRET_KEY']

google = oauth.register(
    name='google',
    client_id=app.config['GOOGLE_CLIENT_ID'],
    client_secret=app.config['GOOGLE_CLIENT_SECRET'],
    access_token_url='https://accounts.google.com/o/oauth2/token',
    access_token_params=None,
    authorize_url='https://accounts.google.com/o/oauth2/auth',
    authorize_params=None,
    api_base_url='https://www.googleapis.com/oauth2/v1/',
    client_kwargs={'scope': 'openid profile email'},
)


@app.route('/login')
def login():
    redirect_uri = url_for('authorize', _external=True)
    return google.authorize_redirect(redirect_uri)

@app.route('/authorize')
def authorize():
    token = google.authorize_access_token()
    user = google.parse_id_token(token)
    # Here, you can save the user information in the session or a database, as needed
    session['user'] = user
    return redirect('/')

# Flask does not have a direct equivalent to Express's view engine setup as it uses Jinja2 by default.
# Ensure you have a 'templates' folder in your project root with 'home.html' inside it.

if __name__ == '__main__':
    app.run(debug=True)
