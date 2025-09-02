# Collaborator Server - PCA Handler

This folder contains the **fully consolidated** PCA (Principal Component Analysis) handler for the Collaborator Server.

## Files

- `pca_handler.py` - **Complete PCA handler** with all functionality in class methods
- `test_pca_handler.py` - Test script to verify functionality
- `README.md` - This documentation

## Features

✅ **Fully Consolidated**: All PCA functionality in class methods only  
✅ **No Redundancy**: No standalone functions, everything in class  
✅ **Model Training**: Train PCA models and save as pickle files  
✅ **Model Loading**: Load models with intelligent caching  
✅ **Data Transformation**: Transform new data using trained models  
✅ **Model Management**: List models, get info, clear cache  
✅ **Flexible Input**: Accept data files or DataFrames  
✅ **Error Handling**: Comprehensive error handling and logging  
✅ **Self-Contained**: No external dependencies

## Quick Start

### 1. Import the Handler

```python
from pca_handler import (
    train_pca_model_handler,
    load_pca_model_handler,
    transform_data_handler,
    get_model_info_handler,
    list_models_handler
)
```

### 2. Train a PCA Model

```python
# Train PCA model using data_party_a.csv
result = train_pca_model_handler(
    data_file="../../../datasets/eye_color/data_party_a.csv",
    model_name="party_a_pca_model",
    n_components=0.95  # Keep 95% of variance
)

if result['success']:
    print(f"Model trained: {result['model_name']}")
    print(f"Components: {result['results']['n_components']}")
    print(f"Variance: {result['results']['total_variance_explained']:.4f}")
```

### 3. Transform Data

```python
# Transform data using the trained model
transform_result = transform_data_handler(
    model_name="party_a_pca_model",
    data_file="../../../datasets/eye_color/data_party_a.csv"  # or use data_df=your_dataframe
)

if transform_result['success']:
    print(f"Original shape: {transform_result['original_shape']}")
    print(f"Transformed shape: {transform_result['transformed_shape']}")
    transformed_data = transform_result['transformed_data']
```

## Functions

### `train_pca_model_handler(data_file, model_name, n_components=0.95)`

Trains a PCA model and saves it.

**Parameters:**

- `data_file`: Path to training data file
- `model_name`: Name for the model (without .pkl extension)
- `n_components`: Number of components (0.95 = 95% variance)

**Returns:** Dictionary with success status and results

### `load_pca_model_handler(model_name)`

Loads a PCA model (with caching).

**Parameters:**

- `model_name`: Name of the model to load

**Returns:** Dictionary with model data or error

### `transform_data_handler(model_name, data_file=None, data_df=None)`

Transforms data using a PCA model.

**Parameters:**

- `model_name`: Name of the model to use
- `data_file`: Path to data file (optional)
- `data_df`: DataFrame (optional)

**Returns:** Dictionary with transformation results

### `get_model_info_handler(model_name)`

Gets information about a PCA model.

**Parameters:**

- `model_name`: Name of the model

**Returns:** Dictionary with model information

### `list_models_handler()`

Lists all available PCA models.

**Returns:** Dictionary with list of models

## Example Usage

### Complete Workflow

```python
from pca_handler import *

# 1. Train model using data_party_a.csv
train_result = train_pca_model_handler(
    "../../../datasets/eye_color/data_party_a.csv",
    "party_a_pca_model",
    n_components=0.95
)

# 2. Get model info
info = get_model_info_handler("party_a_pca_model")
print(f"Model has {info['n_components']} components")

# 3. Transform new data
transform_result = transform_data_handler(
    "party_a_pca_model",
    data_file="../../../datasets/eye_color/data_party_a.csv"
)

# 4. Use transformed data
transformed_data = transform_result['transformed_data']
# transformed_data is now a numpy array with reduced dimensions
```

### Using with DataFrames

```python
import pandas as pd
from pca_handler import transform_data_handler

# Load your data
data = pd.read_csv("../../../datasets/eye_color/data_party_a.csv")

# Transform using DataFrame
result = transform_data_handler(
    model_name="party_a_pca_model",
    data_df=data
)

if result['success']:
    transformed = result['transformed_data']
    print(f"Transformed shape: {transformed.shape}")
```

## Model Caching

The handler automatically caches loaded models for better performance:

- First load: Loads from file
- Subsequent loads: Uses cached version
- Cache persists until manually cleared

## Testing

Run the test script to verify everything works:

```bash
cd Collaborator_Server
python test_pca_handler.py
```

This will:

1. Train a PCA model on your data
2. Test loading and caching
3. Test data transformation
4. Test with both files and DataFrames

## Integration with Your App

You can now use these functions in your main application:

```python
# In your main app
from Collaborator_Server.pca_handler import transform_data_handler

# Use with data_party_a.csv dataset
result = transform_data_handler(
    model_name="party_a_pca_model",
    data_file="../../../datasets/eye_color/data_party_a.csv"
)
```

## Dataset Information

The PCA handler is configured to work with the `data_party_a.csv` dataset:

- **Location**: `datasets/eye_color/data_party_a.csv`
- **Size**: 471 rows × 3001 columns
- **Type**: Genetic SNP data
- **Format**: CSV with numeric values

This dataset contains genetic variant data suitable for PCA dimensionality reduction and analysis.

## Benefits of Full Consolidation

✅ **Zero Redundancy**: No duplicate functions or code  
✅ **Single Source**: All logic in class methods only  
✅ **Cleaner Code**: No standalone functions to maintain  
✅ **Better Organization**: Everything logically grouped in class  
✅ **Easier Debugging**: All functionality in one place  
✅ **Reduced Complexity**: Simpler architecture  
✅ **Self-Contained**: Can be moved or copied easily

## Architecture

The fully consolidated design includes:

1. **PCAHandler Class**: Contains all PCA functionality

   - `train_pca()`: Complete training logic
   - `load_pca_model()`: Loading with caching
   - `transform_data()`: Complete transformation logic
   - `get_model_info()`: Model information
   - `list_models()`: Model management
   - `clear_cache()`: Cache management

2. **Convenience Functions**: Simple wrappers around class methods
3. **Global Instance**: Pre-configured handler for immediate use

This design eliminates ALL redundancy while maintaining full functionality!
