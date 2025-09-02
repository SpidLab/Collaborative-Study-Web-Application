#!/usr/bin/env python3
"""
Script to split a CSV file into 3 equal parts.
Each part will contain the header row and approximately 1/3 of the data rows.
"""

import pandas as pd
import math
import os

def split_csv_into_three(input_file, output_prefix="part"):
    """
    Split a CSV file into 3 equal parts.
    
    Args:
        input_file (str): Path to the input CSV file
        output_prefix (str): Prefix for output files (default: "part")
    """
    
    # Read the CSV file
    print(f"Reading CSV file: {input_file}")
    df = pd.read_csv(input_file)
    
    # Get total number of rows (excluding header)
    total_rows = len(df)
    print(f"Total rows in CSV: {total_rows}")
    
    # Calculate rows per part
    rows_per_part = math.ceil(total_rows / 3)
    print(f"Rows per part: {rows_per_part}")
    
    # Split the dataframe into 3 parts
    for i in range(3):
        start_idx = i * rows_per_part
        end_idx = min((i + 1) * rows_per_part, total_rows)
        
        # Extract the part
        part_df = df.iloc[start_idx:end_idx]
        
        # Create output filename
        output_file = f"{output_prefix}{i+1}.csv"
        
        # Save to CSV
        part_df.to_csv(output_file, index=False)
        
        print(f"Created {output_file} with {len(part_df)} rows (rows {start_idx+1}-{end_idx})")
    
    print(f"\n✅ Successfully split {input_file} into 3 parts!")
    print(f"Files created: {output_prefix}1.csv, {output_prefix}2.csv, {output_prefix}3.csv")

def split_csv_into_three_manual(input_file, output_prefix="part"):
    """
    Alternative method using manual file reading (useful for very large files).
    
    Args:
        input_file (str): Path to the input CSV file
        output_prefix (str): Prefix for output files (default: "part")
    """
    
    # Count total lines first
    with open(input_file, 'r') as f:
        lines = f.readlines()
    
    total_lines = len(lines)
    header = lines[0]  # First line is header
    data_lines = lines[1:]  # Rest are data
    
    print(f"Total lines in CSV: {total_lines}")
    print(f"Header + {len(data_lines)} data rows")
    
    # Calculate lines per part
    lines_per_part = math.ceil(len(data_lines) / 3)
    print(f"Data lines per part: {lines_per_part}")
    
    # Split into 3 parts
    for i in range(3):
        start_idx = i * lines_per_part
        end_idx = min((i + 1) * lines_per_part, len(data_lines))
        
        # Create output filename
        output_file = f"{output_prefix}{i+1}.csv"
        
        # Write header + data lines for this part
        with open(output_file, 'w') as f:
            f.write(header)  # Write header
            f.writelines(data_lines[start_idx:end_idx])  # Write data lines
        
        print(f"Created {output_file} with {end_idx - start_idx} data rows (rows {start_idx+1}-{end_idx})")
    
    print(f"\n✅ Successfully split {input_file} into 3 parts!")
    print(f"Files created: {output_prefix}1.csv, {output_prefix}2.csv, {output_prefix}3.csv")

if __name__ == "__main__":
    # Example usage
    input_csv = "datasets/eye_color/output_party_b.csv"
    
    if os.path.exists(input_csv):
        print("=== Using pandas method ===")
        split_csv_into_three(input_csv, "output_party_b_part")
        
        print("\n=== Using manual file reading method ===")
        split_csv_into_three_manual(input_csv, "output_party_b_part_manual")
    else:
        print(f"Error: File {input_csv} not found!")
        print("Please update the input_csv variable with the correct path.")
        
        # Example with a different file
        print("\nTo use with a different file, modify the script:")
        print("input_csv = 'path/to/your/file.csv'")
        print("split_csv_into_three(input_csv, 'your_prefix')") 