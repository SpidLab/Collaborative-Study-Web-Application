#!/usr/bin/env python3
"""
Privacy Transform Script for GWAS Data

This script applies privacy-preserving transformations to GWAS datasets before
sharing with collaborators. It uses differential privacy techniques including:
- Randomized Response (flipping genotype values)
- Data Shuffling (row permutation)
- Synthetic Sample Generation

This is the final QC step before data is submitted for collaborative analysis.

Author: Collaborative Study Application
Usage: python privacy_transform.py input.csv --epsilon 5 --seed 1234
"""

import pandas as pd
import numpy as np
import argparse
import logging
import sys
import os
from datetime import datetime
from pathlib import Path


class PrivacyTransform:
    """Main class for applying privacy-preserving transformations"""
    
    def __init__(self, epsilon=5.0, seed=1234, num_synthetic_samples=0, 
                 num_samples_to_combine=3, shuffle=True, verbose=True):
        """
        Initialize Privacy Transform processor
        
        Args:
            epsilon (float): Privacy parameter for randomized response (higher = less noise)
            seed (int): Random seed for reproducibility
            num_synthetic_samples (int): Number of synthetic samples to generate (0 = none)
            num_samples_to_combine (int): Number of existing samples to combine for synthetic
            shuffle (bool): Whether to shuffle the data rows
            verbose (bool): Enable verbose logging
        """
        self.epsilon = epsilon
        self.seed = seed
        self.num_synthetic_samples = num_synthetic_samples
        self.num_samples_to_combine = num_samples_to_combine
        self.shuffle = shuffle
        self.verbose = verbose
        
        if epsilon <= 0:
            raise ValueError("Epsilon must be positive")
        
        self._setup_logging()
        
        # Tracking variables
        self.original_shape = None
        self.transformed_shape = None
        self.noise_params = {}
        
    def _setup_logging(self):
        """Setup logging configuration"""
        log_level = logging.INFO if self.verbose else logging.WARNING
        logging.basicConfig(
            level=log_level,
            format='%(asctime)s - %(levelname)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        self.logger = logging.getLogger(__name__)
    
    def detect_format(self, df):
        """Detect the format of the input data"""
        if len(df.columns) > 10:
            sample_cols = df.columns[1:min(6, len(df.columns))]
            genotype_values = set()
            
            for col in sample_cols:
                if pd.api.types.is_numeric_dtype(df[col]):
                    unique_vals = df[col].dropna().unique()
                    genotype_values.update(unique_vals)
            
            if genotype_values.issubset({0, 1, 2, 0.0, 1.0, 2.0, -1, 9}) and len(genotype_values) > 1:
                return 'individual'
        
        return 'unknown'
    
    def validate_input_format(self, df):
        """Validate input format"""
        if len(df.columns) < 2:
            raise ValueError("Data requires at least 2 columns (ID + SNP columns)")
        
        self.logger.info(f"Format validation passed: {len(df)} individuals, {len(df.columns)-1} SNP columns")
        return True
    
    def _randomized_response(self, val, p, q):
        """
        Apply randomized response to a column of genotype values
        
        This is the core differential privacy mechanism that flips values
        based on probability parameters derived from epsilon.
        
        Args:
            val (pd.Series): Column of genotype values (0, 1, 2)
            p (float): Probability parameter
            q (float): Probability parameter
            
        Returns:
            pd.Series: Transformed values
        """
        rand_val = np.random.uniform(0, 1, size=len(val))
        
        # Flip conditions based on randomized response
        flip_zero = (val == 0) & (rand_val > p)
        flip_two = (val == 2) & (rand_val <= p)
        flip_one = (val == 1) & (rand_val > p + q)
        
        val = val.mask(flip_zero, 1)
        val = val.mask(flip_two, 1)
        val = val.mask(flip_one, 0)
        
        return val
    
    def shuffle_data(self, df):
        """
        Shuffle rows of the dataframe using the seed
        
        Args:
            df (pd.DataFrame): Input data
            
        Returns:
            pd.DataFrame: Shuffled data
        """
        if not self.shuffle:
            return df
        
        num_rows = len(df)
        rng = np.random.default_rng(self.seed)
        permutation = rng.permutation(num_rows)
        shuffled_df = df.iloc[permutation].reset_index(drop=True)
        
        self.logger.info(f"Data shuffled with seed {self.seed}")
        return shuffled_df
    
    def add_noise(self, df, snp_columns):
        """
        Add differential privacy noise using randomized response
        
        Args:
            df (pd.DataFrame): Input data
            snp_columns (list): List of SNP column names
            
        Returns:
            pd.DataFrame: Noisy data
        """
        # Calculate probability parameters from epsilon
        p = np.exp(self.epsilon) / (np.exp(self.epsilon) + 2)
        q = 1 / (np.exp(self.epsilon) + 2)
        
        self.noise_params = {
            'epsilon': self.epsilon,
            'p': p,
            'q': q
        }
        
        self.logger.info(f"Adding noise with epsilon={self.epsilon}, p={p:.4f}, q={q:.4f}")
        
        # Set random seed for reproducibility
        np.random.seed(self.seed)
        
        # Apply randomized response to each SNP column
        df_copy = df.copy()
        for col in snp_columns:
            # Skip missing values (-1, 9, NaN)
            valid_mask = df_copy[col].notna() & ~df_copy[col].isin([-1, 9])
            if valid_mask.any():
                df_copy.loc[valid_mask, col] = self._randomized_response(
                    df_copy.loc[valid_mask, col].copy(), p, q
                )
        
        return df_copy
    
    def add_synthetic_samples(self, df, id_col, snp_columns):
        """
        Add synthetic samples by combining existing samples
        
        Args:
            df (pd.DataFrame): Input data
            id_col (str): Name of ID column
            snp_columns (list): List of SNP column names
            
        Returns:
            pd.DataFrame: Data with synthetic samples added
        """
        if self.num_synthetic_samples <= 0:
            return df
        
        self.logger.info(f"Generating {self.num_synthetic_samples} synthetic samples")
        
        np.random.seed(self.seed + 1)  # Different seed for synthetic generation
        
        existing_indices = df.index.tolist()
        synthetic_rows = []
        
        for i in range(self.num_synthetic_samples):
            # Select random existing samples to combine
            selected_indices = np.random.choice(
                existing_indices, 
                size=min(self.num_samples_to_combine, len(existing_indices)), 
                replace=True
            )
            
            # Create synthetic sample by randomly choosing from selected samples
            synthetic_row = {id_col: f"SYNTHETIC_{i+1}"}
            
            for col in snp_columns:
                values = df.loc[selected_indices, col].values
                # Filter out missing values
                valid_values = values[(~np.isnan(values)) & (values != -1) & (values != 9)]
                if len(valid_values) > 0:
                    synthetic_row[col] = np.random.choice(valid_values)
                else:
                    synthetic_row[col] = np.nan
            
            synthetic_rows.append(synthetic_row)
        
        # Append synthetic samples to dataframe
        synthetic_df = pd.DataFrame(synthetic_rows)
        result_df = pd.concat([df, synthetic_df], ignore_index=True)
        
        self.logger.info(f"Added {self.num_synthetic_samples} synthetic samples")
        return result_df
    
    def transform(self, df, phenotype_col=None):
        """
        Apply all privacy transformations
        
        Args:
            df (pd.DataFrame): Input dataset
            phenotype_col (str, optional): Phenotype column to preserve
            
        Returns:
            pd.DataFrame: Transformed dataset
        """
        id_col = df.columns[0]
        snp_columns = list(df.columns[1:])
        
        # Exclude phenotype column from SNP columns
        if phenotype_col and phenotype_col in snp_columns:
            snp_columns = [col for col in snp_columns if col != phenotype_col]
        
        self.original_shape = df.shape
        
        # Step 1: Shuffle data
        transformed_df = self.shuffle_data(df)
        
        # Step 2: Add noise using randomized response
        transformed_df = self.add_noise(transformed_df, snp_columns)
        
        # Step 3: Add synthetic samples (if configured)
        transformed_df = self.add_synthetic_samples(transformed_df, id_col, snp_columns)
        
        self.transformed_shape = transformed_df.shape
        
        self.logger.info(f"Transformation complete: {self.original_shape} -> {self.transformed_shape}")
        
        return transformed_df
    
    def process_file(self, input_file, output_file=None, phenotype_col=None):
        """
        Process input file and apply privacy transformations
        
        Args:
            input_file (str): Path to input CSV file
            output_file (str, optional): Path to output CSV file
            phenotype_col (str, optional): Phenotype column name
            
        Returns:
            pd.DataFrame: Transformed dataset
        """
        self.logger.info(f"Reading input file: {input_file}")
        df = pd.read_csv(input_file)
        
        # Detect and validate format
        format_type = self.detect_format(df)
        self.logger.info(f"Detected format: {format_type}")
        
        if format_type == 'unknown':
            raise ValueError("Could not detect data format. Please ensure data is in individual genotype format.")
        
        self.validate_input_format(df)
        
        # Apply transformations
        transformed_df = self.transform(df, phenotype_col)
        
        # Save output
        if output_file is None:
            input_path = Path(input_file)
            output_file = input_path.parent / f"{input_path.stem}_privacy_transformed{input_path.suffix}"
        
        transformed_df.to_csv(output_file, index=False)
        self.logger.info(f"Transformed data saved to: {output_file}")
        
        return transformed_df


def main():
    """Main function for command line interface"""
    parser = argparse.ArgumentParser(
        description='Privacy Transform for GWAS Data',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Default transformation (epsilon=5, shuffle, no synthetic samples)
  python privacy_transform.py data.csv
  
  # Higher privacy (lower epsilon = more noise)
  python privacy_transform.py data.csv --epsilon 2
  
  # Add synthetic samples
  python privacy_transform.py data.csv --synthetic 100 --combine 3
  
  # Custom seed for reproducibility
  python privacy_transform.py data.csv --seed 42
  
  # No shuffling
  python privacy_transform.py data.csv --no-shuffle

Privacy Parameter (epsilon):
  Higher epsilon = Less noise = Less privacy but more utility
  Lower epsilon = More noise = More privacy but less utility
  
  Recommended: epsilon between 2 and 10
  - epsilon=2: High privacy, more noise
  - epsilon=5: Balanced (default)
  - epsilon=10: Lower privacy, less noise
        """
    )
    
    parser.add_argument('input_file', help='Input CSV file with GWAS data')
    parser.add_argument('--epsilon', '-e', type=float, default=5.0,
                       help='Privacy parameter (default: 5.0)')
    parser.add_argument('--seed', '-s', type=int, default=1234,
                       help='Random seed for reproducibility (default: 1234)')
    parser.add_argument('--synthetic', type=int, default=0,
                       help='Number of synthetic samples to add (default: 0)')
    parser.add_argument('--combine', type=int, default=3,
                       help='Samples to combine for synthetic (default: 3)')
    parser.add_argument('--no-shuffle', action='store_true',
                       help='Do not shuffle the data')
    parser.add_argument('--phenotype-col', '-p', help='Phenotype column name')
    parser.add_argument('--output', '-o', help='Output file path')
    parser.add_argument('--quiet', '-q', action='store_true',
                       help='Suppress verbose output')
    
    args = parser.parse_args()
    
    if not os.path.exists(args.input_file):
        print(f"Error: Input file '{args.input_file}' not found", file=sys.stderr)
        sys.exit(1)
    
    try:
        transformer = PrivacyTransform(
            epsilon=args.epsilon,
            seed=args.seed,
            num_synthetic_samples=args.synthetic,
            num_samples_to_combine=args.combine,
            shuffle=not args.no_shuffle,
            verbose=not args.quiet
        )
        
        transformed_df = transformer.process_file(
            input_file=args.input_file,
            output_file=args.output,
            phenotype_col=args.phenotype_col
        )
        
        if not args.quiet:
            print(f"\nPrivacy Transform Summary:")
            print(f"  Epsilon: {transformer.epsilon}")
            print(f"  Seed: {transformer.seed}")
            print(f"  Original shape: {transformer.original_shape}")
            print(f"  Transformed shape: {transformer.transformed_shape}")
            if transformer.num_synthetic_samples > 0:
                print(f"  Synthetic samples added: {transformer.num_synthetic_samples}")
        
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        if not args.quiet:
            raise
        sys.exit(1)


if __name__ == '__main__':
    main()

