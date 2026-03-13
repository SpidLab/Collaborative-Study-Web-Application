#!/bin/bash
# Start Backend Flask App on port 5002

cd /Users/sahithreddyj/Downloads/Collaborative-Study-Web-Application/web_application/Backend/FlaskApp

export QC_CONTROLLER_URL=http://localhost:5001
export PYTHONUNBUFFERED=1

python -c "
import os
os.environ.pop('WERKZEUG_SERVER_FD', None)
from app import app
print('Starting Backend on port 5002...', flush=True)
app.run(host='0.0.0.0', port=5002, debug=False, use_reloader=False)
"

