#!/usr/bin/env python3
"""
PCA Handler for Collaborator Server
Handles training, loading, and transforming PCA models
"""

import os
import sys
import logging
import pandas as pd
import numpy as np
import pickle
from pathlib import Path
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class PCAHandler:
    def __init__(self, models_dir="models"):
        self.models_dir = models_dir
        os.makedirs(models_dir, exist_ok=True)
        self.loaded_models = {}
        
    def _calculate_sensitivities(self, data):
        # Sensitivity per column: max(abs(max - min), 1)
        sens = []
        for i in range(data.shape[1]):
            col = data[:, i]
            sens.append(max(abs(np.max(col) - np.min(col)), 1))
        return np.array(sens)

    def _add_laplace_noise(self, data, sensitivities, epsilon, random_seed=None):
        if random_seed is not None:
            np.random.seed(random_seed)
        n_rows, n_cols = data.shape
        epsilons = np.array([epsilon / n_cols] * n_cols)
        scales = sensitivities / epsilons
        noise = np.zeros_like(data)
        for i in range(n_cols):
            noise[:, i] = np.random.laplace(0, scales[i], size=n_rows)
        noisy_data = data + noise
        return noisy_data, noise, scales.tolist(), epsilons.tolist()

    def train_pca(self, data_file, model_name, n_components=2):
        try:    
            model_file = os.path.join(self.models_dir, f"{model_name}.pkl")
            
            logger.info(f"Training PCA model: {model_name}")
            logger.info(f"Data file: {data_file}")
            logger.info(f"Output file: {model_file}")

            data = pd.read_csv(data_file)
            
            numeric_data = data.select_dtypes(include=[np.number])
            
            if numeric_data.isnull().any().any():
                numeric_data = numeric_data.fillna(numeric_data.mean())
            
            print(f"Data shape: {numeric_data.shape}")

            # Always skip the first column for PCA training
            first_column = None
            first_column_name = None
            if numeric_data.shape[1] > 0:
                first_column = numeric_data.iloc[:, 0].copy()
                first_column_name = numeric_data.columns[0]
                numeric_data = numeric_data.iloc[:, 1:]  # Skip first column
                print(f"First column: {first_column}")
                print(f"First column name: {first_column_name}")
                print(f"Numeric data shape: {numeric_data.shape}")
                print(f"Numeric data columns: {numeric_data.columns}")
                print(f"Numeric data: {numeric_data.head()}")
                print(f"Skipped first column '{first_column_name}' for PCA training")
                print(f"Training data shape after skipping: {numeric_data.shape}")

            scaler = StandardScaler()
            scaled_data = scaler.fit_transform(numeric_data)

            print(f"Training PCA with {n_components} components...")
            pca = PCA(n_components=n_components)
            pca.fit(scaled_data)
            
            model_data = {
                'pca': pca,
                'scaler': scaler,
                'feature_names': list(numeric_data.columns),
                'first_column_name': first_column_name
            }
            
            os.makedirs(os.path.dirname(model_file), exist_ok=True)

            with open(model_file, 'wb') as f:
                pickle.dump(model_data, f)
            
            print(f"PCA model saved to {model_file}")
            
            results = {
                'n_components': pca.n_components_,
                'explained_variance_ratio': pca.explained_variance_ratio_.tolist(),
                'total_variance_explained': sum(pca.explained_variance_ratio_)
            }
            
            logger.info(f"PCA training completed for {model_name}")
            logger.info(f"Components: {results['n_components']}")
            logger.info(f"Variance explained: {results['total_variance_explained']:.4f}")
            
            return {
                "success": True,
                "model_name": model_name,
                "model_file": model_file,
                "results": results
            }
            
        except Exception as e:
            logger.error(f"Error training PCA model {model_name}: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def load_pca_model(self, model_name):
        try:
            if model_name in self.loaded_models:
                logger.info(f"Using cached model: {model_name}")
                return {
                    "success": True,
                    "model_data": self.loaded_models[model_name],
                    "cached": True
                }
            
            model_file = os.path.join(self.models_dir, f"{model_name}.pkl")
            
            if not os.path.exists(model_file):
                return {
                    "success": False,
                    "error": f"Model file not found: {model_file}"
                }
            
            logger.info(f"Loading PCA model: {model_name}")
            
            with open(model_file, 'rb') as f:
                model_data = pickle.load(f)
            
            self.loaded_models[model_name] = model_data
            
            return {
                "success": True,
                "model_data": model_data,
                "cached": False
            }
            
        except Exception as e:
            logger.error(f"Error loading PCA model {model_name}: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def transform_data(self, model_name, data_file=None, data_df=None, add_noise=False, epsilon=1.0, random_seed=None):
        try:
            load_result = self.load_pca_model(model_name)
            if not load_result["success"]:
                return load_result
            
            model_data = load_result["model_data"]
            pca = model_data['pca']
            scaler = model_data['scaler']
            
            if data_df is not None:
                data = data_df
                logger.info(f"Using provided DataFrame for transformation")
            elif data_file is not None:
                if not os.path.exists(data_file):
                    return {
                        "success": False,
                        "error": f"Data file not found: {data_file}"
                    }
                data = pd.read_csv(data_file)
                logger.info(f"Loaded data from file: {data_file}")
            else:
                return {
                    "success": False,
                    "error": "Either data_file or data_df must be provided"
                }
            
            logger.info(f"Transforming data using model: {model_name}")
            logger.info(f"Original data shape: {data.shape}")
            
            # Always skip the first column for transformation
            first_column = None
            if data.shape[1] > 0:
                if isinstance(data, pd.DataFrame):
                    first_column = data.iloc[:, 0].copy()
                    data = data.iloc[:, 1:]  # Skip first column
                    print(f"Skipped first column '{data.columns[0] if len(data.columns) > 0 else 'unknown'}' for transformation")
                else:
                    first_column = data[:, 0].copy()
                    data = data[:, 1:]  # Skip first column
                    print(f"Skipped first column for transformation")
                print(f"Data shape after skipping first column: {data.shape}")
            
            if isinstance(data, pd.DataFrame):
                numeric_data = data.select_dtypes(include=[np.number])
                available_features = [col for col in model_data['feature_names'] if col in numeric_data.columns]
                if len(available_features) != len(model_data['feature_names']):
                    print(f"Warning: Missing features. Expected {len(model_data['feature_names'])}, got {len(available_features)}")
                numeric_data = numeric_data[available_features]
                data = numeric_data.values
            
            if np.isnan(data).any():
                data = np.nan_to_num(data, nan=np.nanmean(data))
            
            scaled_data = scaler.transform(data)
            transformed_data = pca.transform(scaled_data)
            
            logger.info(f"Transformation completed")
            logger.info(f"Transformed shape: {transformed_data.shape}")

            noise = None
            noise_params = None
            if add_noise:
                sensitivities = self._calculate_sensitivities(transformed_data)
                noisy_data, noise, scales, epsilons = self._add_laplace_noise(transformed_data, sensitivities, epsilon, random_seed)
                logger.info(f"Laplacian noise added to transformed data")
                transformed_data = noisy_data
                noise_params = {
                    'sensitivities': sensitivities.tolist(),
                    'scales': scales,
                    'epsilons': epsilons,
                    'random_seed': random_seed,
                    'epsilon': epsilon
                }
            
            # Always add first column back to the output
            if first_column is not None:
                # Add first column back as the first column (no reshaping needed)
                final_data = np.column_stack([first_column, transformed_data])
                print(f"Added first column back to output")
                print(f"Final output shape: {final_data.shape}")
                
                transformed_data = final_data
            
            # Save transformed data to CSV
            try:
                # Create DataFrame with proper column names
                if first_column is not None:
                    # Create column names: First column name + PC_1, PC_2, etc.
                    first_col_name = "First_Column"
                    if isinstance(first_column, pd.Series):
                        first_col_name = first_column.name if first_column.name else "First_Column"
                    
                    pc_columns = [f"PC_{i+1}" for i in range(transformed_data.shape[1] - 1)]
                    column_names = [first_col_name] + pc_columns
                    
                    df = pd.DataFrame(transformed_data, columns=column_names)
                    
                    # Convert first column back to integers if possible
                    try:
                        df[first_col_name] = df[first_col_name].astype(int)
                        
                    except:
                        print(f"⚠️  Could not convert first column to integers, keeping as float")
                else:
                    # If no first column, just use PC column names
                    pc_columns = [f"PC_{i+1}" for i in range(transformed_data.shape[1])]
                    df = pd.DataFrame(transformed_data, columns=pc_columns)
                
                # Save to CSV
                output_filename = f"transformed_data_{model_name}.csv"
                df.to_csv(output_filename, index=False)
                print(f"Transformed data saved to: {output_filename}")
                
            except Exception as e:
                print(f"Warning: Could not save to CSV: {str(e)}")
            result = {
                "success": True,
                "model_name": model_name,
                "original_shape": data.shape,
                "transformed_shape": transformed_data.shape,
                "transformed_data": transformed_data,
                "transformed_data_list": transformed_data.tolist()
            }
            if add_noise:
                result["noise"] = noise.tolist()
                result["noise_params"] = noise_params
            return result
            
        except Exception as e:
            logger.error(f"Error transforming data with model {model_name}: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def get_model_info(self, model_name):
        try:
            load_result = self.load_pca_model(model_name)
            if not load_result["success"]:
                return load_result
            
            model_data = load_result["model_data"]
            pca = model_data['pca']
            
            return {
                "success": True,
                "model_name": model_name,
                "n_components": pca.n_components_,
                "explained_variance_ratio": pca.explained_variance_ratio_.tolist(),
                "total_variance_explained": sum(pca.explained_variance_ratio_),
                "feature_names": model_data['feature_names'],
                "model_file": os.path.join(self.models_dir, f"{model_name}.pkl")
            }
            
        except Exception as e:
            logger.error(f"Error getting info for model {model_name}: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def list_models(self):
        try:
            models = []
            for file in os.listdir(self.models_dir):
                if file.endswith('.pkl'):
                    model_name = file.replace('.pkl', '')
                    models.append(model_name)
            
            return {
                "success": True,
                "models": models,
                "models_dir": self.models_dir
            }
            
        except Exception as e:
            logger.error(f"Error listing models: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    def clear_cache(self):
        try:
            cache_size = len(self.loaded_models)
            self.loaded_models.clear()
            logger.info(f"Cleared cache ({cache_size} models)")
            
            return {
                "success": True,
                "message": f"Cleared cache ({cache_size} models)"
            }
            
        except Exception as e:
            logger.error(f"Error clearing cache: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }


pca_handler = PCAHandler()


def train_pca_model_handler(data_file, model_name, n_components=2):
    return pca_handler.train_pca(data_file, model_name, n_components)

def load_pca_model_handler(model_name): 
    return pca_handler.load_pca_model(model_name)

def transform_data_handler(model_name, data_file=None, data_df=None, add_noise=False, epsilon=1.0, random_seed=None):
    return pca_handler.transform_data(model_name, data_file, data_df, add_noise, epsilon, random_seed)

def get_model_info_handler(model_name):
    return pca_handler.get_model_info(model_name)

def list_models_handler():
    return pca_handler.list_models()

def clear_cache_handler():
    return pca_handler.clear_cache()


if __name__ == "__main__":
    print("=== PCA Handler Example ===")
    
    result = list_models_handler()
    print(f"Available models: {result}")
    
    data_file = "../Eye_color_original_3000_SNPs_chrm15.csv"
    if os.path.exists(data_file):
        print("\nTraining PCA model...")
        result = train_pca_model_handler(data_file, "eye_color_pca", n_components=2)
        print(f"Training result: {result['success']}")
        
        if result['success']:
            print("\nGetting model info...")
            info = get_model_info_handler("eye_color_pca")
            print(f"Model info: {info}")
            
            print("\nTransforming data...")
            transform_result = transform_data_handler("eye_color_pca", data_file=data_file)
            print(f"Transform result: {transform_result['success']}")
            if transform_result['success']:
                print(f"Original shape: {transform_result['original_shape']}")
                print(f"Transformed shape: {transform_result['transformed_shape']}")
    else:
        print(f"Data file {data_file} not found. Skipping training example.") 