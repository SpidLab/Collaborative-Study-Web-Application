#!/usr/bin/env python3
"""
Test script for PCA Handler in Collaborator Server
"""

import os
import sys
import pandas as pd
from pca_handler import (
    train_pca_model_handler, 
    load_pca_model_handler, 
    transform_data_handler,
    get_model_info_handler,
    list_models_handler
)

def test_pca_handler():
    """Test the PCA handler functionality"""
    
    print("=== Testing PCA Handler in Collaborator Server ===")
    
    # Test data file (relative to Collaborator_Server directory) - using data_party_a.csv
    data_file = "../../../../datasets/eye_color/pca_party1.csv"
    model_name = "pca_model"
    
    if not os.path.exists(data_file):
        print(f" Test data file {data_file} not found!")
        return
    
    try:
        # # Step 1: List existing models
        # print("1. Listing existing models...")
        # models_result = list_models_handler()
        # print(f"Available models: {models_result['models'] if models_result['success'] else 'Error'}")
        
        # # Step 2: Train PCA model
        # print("\n2. Training PCA model...")
        # train_result = train_pca_model_handler(data_file, model_name, n_components=2)
        
        # if train_result['success']:
        #     print(f" Training completed!")
        #     print(f"   Model name: {train_result['model_name']}")
        #     print(f"   Model file: {train_result['model_file']}")
        #     print(f"   Components: {train_result['results']['n_components']}")
        #     print(f"   Variance explained: {train_result['results']['total_variance_explained']:.4f}")
        # else:
        #     print(f" Training failed: {train_result['error']}")
        #     return
        
        # # Step 3: Get model info
        # print("\n3. Getting model info...")
        # info_result = get_model_info_handler(model_name)
        
        # if info_result['success']:
        #     print(f" Model info retrieved!")
        #     print(f"   Components: {info_result['n_components']}")
        #     print(f"   Variance explained: {info_result['total_variance_explained']:.4f}")
        #     print(f"   Features: {len(info_result['feature_names'])}")
        # else:
        #     print(f" Failed to get model info: {info_result['error']}")
        
        # # Step 4: Load model (this will be cached)
        # print("\n4. Loading model...")
        # load_result = load_pca_model_handler(model_name)
        
        # if load_result['success']:
        #     print(f" Model loaded successfully!")
        #     print(f"   Cached: {load_result['cached']}")
        # else:
        #     print(f" Failed to load model: {load_result['error']}")
        
        # Step 5: Transform data
        print("\n5. Transforming data...")
        transform_result = transform_data_handler(model_name, data_file=data_file, add_noise=True, epsilon=1.0, random_seed=42)
        
        if transform_result['success']:
            print(f" Transformation completed!")
            print(f"   Original shape: {transform_result['original_shape']}")
            print(f"   Transformed shape: {transform_result['transformed_shape']}")
            print(f"   Model used: {transform_result['model_name']}")
        else:
            print(f" Transformation failed: {transform_result['error']}")
 
        
    except Exception as e:
        print(f" Error during testing: {str(e)}")

if __name__ == "__main__":
    test_pca_handler() 