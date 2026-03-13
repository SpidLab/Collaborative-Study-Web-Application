#!/bin/bash
# Start QC Controller on port 5001

cd /Users/sahithreddyj/Downloads/Collaborative-Study-Web-Application/web_application/Backend/FlaskApp/Collaborator_Server

export DEFAULT_DATA_FILE=$(pwd)/data/data_party_a.csv
export MONGO_USERNAME=CollaboratorDB
export MONGO_PASSWORD='CollaboratorDB@123'
export MONGO_CLUSTER=collaboratordb.68hkp69.mongodb.net
export PORT=5001
export PYTHONUNBUFFERED=1

python -c "
import os
os.environ.pop('WERKZEUG_SERVER_FD', None)
from qc_controller import app
print('Starting QC Controller on port 5001...', flush=True)
app.run(host='0.0.0.0', port=5001, debug=False, use_reloader=False)
"

