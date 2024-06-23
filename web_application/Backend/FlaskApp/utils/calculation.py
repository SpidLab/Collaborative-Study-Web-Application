import pandas as pd
import numpy as np
import itertools
from pymongo import MongoClient
import io
from flask import Flask, request, jsonify, g
from calculate_coefficients import compute_coefficients_dictionary

def get_user_dataset(client, user_id):
    db = client['your_database_name']
    dataset_document = db.datasets.find_one({'userID': user_id})
    if dataset_document:
        return pd.read_csv(io.StringIO(dataset_document['csv_content']))
    else:
        raise ValueError(f"Dataset for user {user_id} not found")

# Rest of the functions (calculate_phi and compute_coefficients_dictionary) remain unchanged

# Flask endpoint to start a collaboration
@app.route('/api/start_collaboration', methods=['POST'])
def start_collaboration():
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
        coeff_dict = compute_coefficients_dictionary(merged_data)

        # Convert the results to a table format (DataFrame)
        results_table = pd.DataFrame(list(coeff_dict.items()), columns=['Pair', 'Coefficient'])
        
        # Return the table as a JSON response
        return results_table.to_json(orient='records'), 200

    except ValueError as ve:
        return jsonify({'message': str(ve)}), 404
    except Exception as e:
        return jsonify({'message': 'An error occurred', 'error': str(e)}), 500
