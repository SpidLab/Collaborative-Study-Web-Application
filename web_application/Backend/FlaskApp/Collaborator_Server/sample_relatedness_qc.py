#!/usr/bin/env python3
"""
Sample Relatedness Quality Control Script for GWAS Data

This script performs sample relatedness QC on GWAS datasets using Identity-By-State (IBS)
or Identity-By-Descent (IBD) methods to detect and remove cryptically related individuals.

Related individuals in GWAS can inflate false positive rates and bias association results.
This QC step should be performed after missing data QC and before association analysis.

Relatedness Thresholds:
- PI_HAT > 0.9375: Duplicate/MZ twin
- PI_HAT > 0.5: 1st degree relatives (parent-child, full siblings)
- PI_HAT > 0.25: 2nd degree relatives (half-siblings, grandparent-grandchild, aunt/uncle-niece/nephew)
- PI_HAT > 0.125: 3rd degree relatives (first cousins)
- PI_HAT > 0.0625: More distant relatives

Default threshold: 0.1875 (removes 2nd degree and closer relatives)

Author: Collaborative Study Application
Usage: python sample_relatedness_qc.py input.csv --threshold 0.1875 --method ibs
"""

import pandas as pd
import numpy as np
import argparse
import logging
import sys
import os
from datetime import datetime
from pathlib import Path


class SampleRelatednessQC:
    """Main class for performing Sample Relatedness quality control"""
    
    def __init__(self, threshold=0.1875, method='ibs', verbose=True):
        """
        Initialize Sample Relatedness QC processor
        
        Args:
            threshold (float): Relatedness threshold for filtering (default: 0.1875 for 2nd degree)
            method (str): Method for relatedness calculation - 'ibs' or 'king' (default: 'ibs')
            verbose (bool): Enable verbose logging (default: True)
        """
        self.threshold = threshold
        self.method = method
        self.verbose = verbose
        
        # Validation
        if not (0.0 <= threshold <= 1.0):
            raise ValueError("Relatedness threshold must be between 0.0 and 1.0")
        if method not in ['ibs', 'king']:
            raise ValueError("Method must be 'ibs' or 'king'")
        
        self._setup_logging()
        
        # Initialize tracking variables
        self.original_individual_count = 0
        self.filtered_individual_count = 0
        self.removed_individuals = []
        self.related_pairs = []
        self.relatedness_matrix = None
        
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
        """
        Detect the format of the input data
        
        Args:
            df (pd.DataFrame): Input dataset
            
        Returns:
            str: Format type ('individual' or 'unknown')
        """
        # Check for individual format (many columns with 0/1/2 values)
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
        """
        Validate that the input DataFrame has the correct format
        
        Args:
            df (pd.DataFrame): Input dataset
            
        Returns:
            bool: True if format is valid
            
        Raises:
            ValueError: If format is invalid
        """
        if len(df.columns) < 2:
            raise ValueError("Individual format requires at least 2 columns (ID + SNP columns)")
        
        snp_cols = df.columns[1:]
        
        for col in snp_cols[:5]:
            if not pd.api.types.is_numeric_dtype(df[col]):
                try:
                    df[col] = pd.to_numeric(df[col], errors='coerce')
                except:
                    raise ValueError(f"Column '{col}' contains non-numeric genotype data")
        
        self.logger.info(f"Format validation passed: {len(df)} individuals, {len(snp_cols)} SNP columns")
        return True
    
    def _is_missing(self, value):
        """Check if a value represents missing data"""
        if pd.isna(value):
            return True
        if value in [-1, 9]:
            return True
        return False
    
    def calculate_ibs_relatedness(self, df, snp_columns):
        """
        Calculate pairwise IBS (Identity-By-State) relatedness
        
        IBS measures the proportion of alleles shared between two individuals.
        
        Args:
            df (pd.DataFrame): Input data
            snp_columns (list): List of SNP column names
            
        Returns:
            np.ndarray: Relatedness matrix
        """
        n_individuals = len(df)
        n_snps = len(snp_columns)
        
        self.logger.info(f"Calculating IBS relatedness for {n_individuals} individuals across {n_snps} SNPs")
        
        # Convert to numpy for faster computation
        snp_data = df[snp_columns].values.astype(float)
        
        # Replace missing values (-1, 9) with NaN
        snp_data[(snp_data == -1) | (snp_data == 9)] = np.nan
        
        # Initialize relatedness matrix
        relatedness_matrix = np.zeros((n_individuals, n_individuals))
        
        # Calculate pairwise IBS
        for i in range(n_individuals):
            if i % 50 == 0 and i > 0:
                self.logger.info(f"  Processing individual {i}/{n_individuals}")
            
            for j in range(i + 1, n_individuals):
                geno_i = snp_data[i]
                geno_j = snp_data[j]
                
                # Only use SNPs where both have valid data
                valid_mask = ~(np.isnan(geno_i) | np.isnan(geno_j))
                valid_count = np.sum(valid_mask)
                
                if valid_count == 0:
                    relatedness_matrix[i, j] = 0
                    relatedness_matrix[j, i] = 0
                    continue
                
                geno_i_valid = geno_i[valid_mask]
                geno_j_valid = geno_j[valid_mask]
                
                # IBS calculation
                # IBS0: no alleles shared (genotypes differ by 2: 0,2 or 2,0)
                # IBS1: one allele shared (genotypes differ by 1)
                # IBS2: both alleles shared (same genotype)
                
                ibs2 = np.sum(geno_i_valid == geno_j_valid)
                diff = np.abs(geno_i_valid - geno_j_valid)
                ibs1 = np.sum(diff == 1)
                ibs0 = np.sum(diff == 2)
                
                # IBS proportion: (2*IBS2 + IBS1) / (2*valid_count)
                # This gives a value between 0 and 1
                ibs_score = (2 * ibs2 + ibs1) / (2 * valid_count)
                
                relatedness_matrix[i, j] = ibs_score
                relatedness_matrix[j, i] = ibs_score
        
        # Fill diagonal with 1 (self-relatedness)
        np.fill_diagonal(relatedness_matrix, 1.0)
        
        return relatedness_matrix
    
    def calculate_king_relatedness(self, df, snp_columns):
        """
        Calculate pairwise KING robust relatedness estimator
        
        KING is more robust to population stratification than IBS.
        
        Args:
            df (pd.DataFrame): Input data
            snp_columns (list): List of SNP column names
            
        Returns:
            np.ndarray: Relatedness matrix (kinship coefficients)
        """
        n_individuals = len(df)
        n_snps = len(snp_columns)
        
        self.logger.info(f"Calculating KING relatedness for {n_individuals} individuals across {n_snps} SNPs")
        
        # Convert to numpy for faster computation
        snp_data = df[snp_columns].values.astype(float)
        
        # Replace missing values with NaN
        snp_data[(snp_data == -1) | (snp_data == 9)] = np.nan
        
        # Initialize relatedness matrix
        relatedness_matrix = np.zeros((n_individuals, n_individuals))
        
        # Calculate pairwise KING kinship
        for i in range(n_individuals):
            if i % 50 == 0 and i > 0:
                self.logger.info(f"  Processing individual {i}/{n_individuals}")
            
            for j in range(i + 1, n_individuals):
                geno_i = snp_data[i]
                geno_j = snp_data[j]
                
                # Only use SNPs where both have valid data
                valid_mask = ~(np.isnan(geno_i) | np.isnan(geno_j))
                valid_count = np.sum(valid_mask)
                
                if valid_count == 0:
                    relatedness_matrix[i, j] = 0
                    relatedness_matrix[j, i] = 0
                    continue
                
                geno_i_valid = geno_i[valid_mask]
                geno_j_valid = geno_j[valid_mask]
                
                # KING robust kinship estimator
                # Count heterozygotes
                het_i = np.sum(geno_i_valid == 1)
                het_j = np.sum(geno_j_valid == 1)
                
                # Count IBS0 (opposite homozygotes)
                ibs0 = np.sum(np.abs(geno_i_valid - geno_j_valid) == 2)
                
                # KING robust estimator: (het_i + het_j - 4*IBS0) / (het_i + het_j)
                denominator = het_i + het_j
                if denominator > 0:
                    kinship = 0.5 - (2 * ibs0) / denominator
                else:
                    kinship = 0
                
                # Kinship coefficient can be negative for unrelated individuals
                # Clamp to reasonable range
                kinship = max(kinship, -0.5)
                
                relatedness_matrix[i, j] = kinship
                relatedness_matrix[j, i] = kinship
        
        # Fill diagonal with 0.5 (self-kinship)
        np.fill_diagonal(relatedness_matrix, 0.5)
        
        return relatedness_matrix
    
    def find_related_pairs(self, df, relatedness_matrix):
        """
        Find pairs of individuals above the relatedness threshold
        
        Args:
            df (pd.DataFrame): Input data
            relatedness_matrix (np.ndarray): Pairwise relatedness matrix
            
        Returns:
            list: List of related pairs with their relatedness scores
        """
        id_col = df.columns[0]
        n_individuals = len(df)
        
        related_pairs = []
        
        for i in range(n_individuals):
            for j in range(i + 1, n_individuals):
                relatedness = relatedness_matrix[i, j]
                
                # For KING, threshold is on kinship coefficient (0.0625 to 0.5)
                # For IBS, threshold is on IBS proportion (higher values = more related)
                if self.method == 'king':
                    is_related = relatedness > self.threshold
                else:  # IBS
                    is_related = relatedness > self.threshold
                
                if is_related:
                    related_pairs.append({
                        'ind1_idx': i,
                        'ind2_idx': j,
                        'ind1': df.iloc[i][id_col],
                        'ind2': df.iloc[j][id_col],
                        'relatedness': relatedness,
                        'relationship': self._classify_relationship(relatedness)
                    })
        
        return sorted(related_pairs, key=lambda x: -x['relatedness'])
    
    def _classify_relationship(self, relatedness):
        """Classify relationship based on relatedness score"""
        if self.method == 'king':
            # KING kinship coefficient thresholds
            if relatedness > 0.354:
                return "Duplicate/MZ twin"
            elif relatedness > 0.177:
                return "1st degree (parent-child, full siblings)"
            elif relatedness > 0.0884:
                return "2nd degree (half-siblings, grandparent-grandchild)"
            elif relatedness > 0.0442:
                return "3rd degree (first cousins)"
            else:
                return "Distant/Unrelated"
        else:
            # IBS proportion thresholds (approximate)
            if relatedness > 0.9:
                return "Duplicate/MZ twin"
            elif relatedness > 0.6:
                return "1st degree (parent-child, full siblings)"
            elif relatedness > 0.4:
                return "2nd degree (half-siblings, grandparent-grandchild)"
            elif relatedness > 0.3:
                return "3rd degree (first cousins)"
            else:
                return "Distant/Unrelated"
    
    def select_individuals_to_remove(self, df, related_pairs, snp_columns):
        """
        Select which individual to remove from each related pair
        
        Strategy: Remove the individual with more missing data
        
        Args:
            df (pd.DataFrame): Input data
            related_pairs (list): List of related pairs
            snp_columns (list): List of SNP column names
            
        Returns:
            set: Set of individual IDs to remove
        """
        id_col = df.columns[0]
        snp_data = df[snp_columns].values.astype(float)
        
        # Calculate missing rate for each individual
        missing_rates = {}
        for idx in range(len(df)):
            row_data = snp_data[idx]
            missing_count = np.sum(np.isnan(row_data) | (row_data == -1) | (row_data == 9))
            missing_rates[idx] = missing_count / len(snp_columns)
        
        individuals_to_remove = set()
        
        for pair in related_pairs:
            idx1, idx2 = pair['ind1_idx'], pair['ind2_idx']
            ind1, ind2 = pair['ind1'], pair['ind2']
            
            # Skip if one is already marked for removal
            if ind1 in individuals_to_remove or ind2 in individuals_to_remove:
                continue
            
            # Remove the one with more missing data
            if missing_rates[idx1] >= missing_rates[idx2]:
                individuals_to_remove.add(ind1)
            else:
                individuals_to_remove.add(ind2)
        
        return individuals_to_remove
    
    def filter_dataset(self, df, phenotype_col=None):
        """
        Filter dataset based on sample relatedness
        
        Args:
            df (pd.DataFrame): Input dataset
            phenotype_col (str, optional): Name of phenotype column
            
        Returns:
            pd.DataFrame: Filtered dataset
        """
        id_col = df.columns[0]
        snp_columns = list(df.columns[1:])
        
        # Exclude phenotype column from SNP columns
        if phenotype_col and phenotype_col in snp_columns:
            snp_columns = [col for col in snp_columns if col != phenotype_col]
        
        self.original_individual_count = len(df)
        
        # Calculate relatedness matrix
        if self.method == 'king':
            self.relatedness_matrix = self.calculate_king_relatedness(df, snp_columns)
        else:
            self.relatedness_matrix = self.calculate_ibs_relatedness(df, snp_columns)
        
        # Find related pairs
        self.related_pairs = self.find_related_pairs(df, self.relatedness_matrix)
        self.logger.info(f"Found {len(self.related_pairs)} related pairs above threshold {self.threshold}")
        
        # Select individuals to remove
        individuals_to_remove = self.select_individuals_to_remove(df, self.related_pairs, snp_columns)
        self.removed_individuals = list(individuals_to_remove)
        self.logger.info(f"Removing {len(self.removed_individuals)} individuals")
        
        # Filter dataset
        filtered_df = df[~df[id_col].isin(individuals_to_remove)].reset_index(drop=True)
        self.filtered_individual_count = len(filtered_df)
        
        return filtered_df
    
    def generate_report(self, output_file=None):
        """
        Generate sample relatedness QC report
        
        Args:
            output_file (str, optional): Output file path for report
            
        Returns:
            str: Report content
        """
        report_lines = []
        report_lines.append("=" * 80)
        report_lines.append("Sample Relatedness Quality Control Report")
        report_lines.append("=" * 80)
        report_lines.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        report_lines.append(f"Method: {self.method.upper()}")
        report_lines.append(f"Relatedness threshold: {self.threshold}")
        report_lines.append("")
        
        # Summary statistics
        report_lines.append("Summary Statistics")
        report_lines.append("-" * 80)
        report_lines.append(f"Original individuals: {self.original_individual_count}")
        report_lines.append(f"Filtered individuals: {self.filtered_individual_count}")
        report_lines.append(f"Removed individuals: {len(self.removed_individuals)}")
        if self.original_individual_count > 0:
            removal_rate = len(self.removed_individuals) / self.original_individual_count * 100
            report_lines.append(f"Removal rate: {removal_rate:.2f}%")
        report_lines.append(f"Related pairs found: {len(self.related_pairs)}")
        report_lines.append("")
        
        # Related pairs detail
        if self.related_pairs:
            report_lines.append("Related Pairs (sorted by relatedness)")
            report_lines.append("-" * 80)
            for pair in self.related_pairs[:50]:  # Limit to first 50 pairs
                report_lines.append(f"  {pair['ind1']} <-> {pair['ind2']}")
                report_lines.append(f"    Relatedness: {pair['relatedness']:.4f}")
                report_lines.append(f"    Relationship: {pair['relationship']}")
                report_lines.append("")
            
            if len(self.related_pairs) > 50:
                report_lines.append(f"  ... and {len(self.related_pairs) - 50} more pairs")
                report_lines.append("")
        
        # Removed individuals
        if self.removed_individuals:
            report_lines.append("Removed Individuals")
            report_lines.append("-" * 80)
            for ind_id in self.removed_individuals[:100]:
                report_lines.append(f"  {ind_id}")
            
            if len(self.removed_individuals) > 100:
                report_lines.append(f"  ... and {len(self.removed_individuals) - 100} more")
            report_lines.append("")
        
        # Threshold reference
        report_lines.append("Relatedness Threshold Reference")
        report_lines.append("-" * 80)
        if self.method == 'king':
            report_lines.append("  KING Kinship Coefficient thresholds:")
            report_lines.append("  > 0.354: Duplicate/MZ twin")
            report_lines.append("  > 0.177: 1st degree relatives")
            report_lines.append("  > 0.0884: 2nd degree relatives")
            report_lines.append("  > 0.0442: 3rd degree relatives")
        else:
            report_lines.append("  IBS Proportion thresholds (approximate):")
            report_lines.append("  > 0.9: Duplicate/MZ twin")
            report_lines.append("  > 0.6: 1st degree relatives")
            report_lines.append("  > 0.4: 2nd degree relatives")
            report_lines.append("  > 0.3: 3rd degree relatives")
        report_lines.append("")
        
        report_content = "\n".join(report_lines)
        
        if output_file:
            with open(output_file, 'w') as f:
                f.write(report_content)
            self.logger.info(f"Report written to {output_file}")
        
        return report_content
    
    def process_file(self, input_file, output_file=None, phenotype_col=None, report_file=None):
        """
        Process input file and perform sample relatedness QC
        
        Args:
            input_file (str): Path to input CSV file
            output_file (str, optional): Path to output filtered CSV file
            phenotype_col (str, optional): Name of phenotype column
            report_file (str, optional): Path to output report file
            
        Returns:
            pd.DataFrame: Filtered dataset
        """
        self.logger.info(f"Reading input file: {input_file}")
        df = pd.read_csv(input_file)
        
        # Detect format
        format_type = self.detect_format(df)
        self.logger.info(f"Detected format: {format_type}")
        
        if format_type == 'unknown':
            raise ValueError("Could not detect data format. Please ensure data is in individual genotype format.")
        
        # Validate format
        self.validate_input_format(df)
        
        # Filter dataset
        self.logger.info(f"Processing {len(df)} individuals...")
        filtered_df = self.filter_dataset(df, phenotype_col)
        
        # Save filtered dataset
        if output_file is None:
            input_path = Path(input_file)
            output_file = input_path.parent / f"{input_path.stem}_relatedness_filtered{input_path.suffix}"
        
        filtered_df.to_csv(output_file, index=False)
        self.logger.info(f"Filtered dataset saved to: {output_file}")
        
        # Generate report
        if report_file is None:
            input_path = Path(input_file)
            report_file = input_path.parent / f"{input_path.stem}_relatedness_report.txt"
        
        self.generate_report(report_file)
        
        return filtered_df


def main():
    """Main function for command line interface"""
    parser = argparse.ArgumentParser(
        description='Sample Relatedness Quality Control for GWAS Data',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Default threshold (0.1875 removes 2nd degree and closer relatives)
  python sample_relatedness_qc.py data.csv
  
  # Strict threshold (remove 3rd degree relatives and closer)
  python sample_relatedness_qc.py data.csv --threshold 0.125
  
  # Use KING robust method
  python sample_relatedness_qc.py data.csv --method king --threshold 0.0884
  
  # Custom output files
  python sample_relatedness_qc.py data.csv --output clean.csv --report report.txt

Relatedness Thresholds:
  IBS method (default):
    > 0.9: Duplicate/MZ twin
    > 0.6: 1st degree relatives
    > 0.4: 2nd degree relatives (default threshold: 0.1875)
    > 0.3: 3rd degree relatives
    
  KING method:
    > 0.354: Duplicate/MZ twin
    > 0.177: 1st degree relatives
    > 0.0884: 2nd degree relatives
    > 0.0442: 3rd degree relatives
        """
    )
    
    parser.add_argument('input_file', help='Input CSV file with GWAS data')
    parser.add_argument('--threshold', '-t', type=float, default=0.1875,
                       help='Relatedness threshold (default: 0.1875 for 2nd degree relatives)')
    parser.add_argument('--method', '-m', choices=['ibs', 'king'], default='ibs',
                       help='Relatedness estimation method (default: ibs)')
    parser.add_argument('--phenotype-col', '-p', help='Phenotype column name (will be preserved)')
    parser.add_argument('--output', '-o', help='Output file path for filtered dataset')
    parser.add_argument('--report', '-r', help='Output file path for QC report')
    parser.add_argument('--quiet', '-q', action='store_true',
                       help='Suppress verbose output')
    
    args = parser.parse_args()
    
    if not os.path.exists(args.input_file):
        print(f"Error: Input file '{args.input_file}' not found", file=sys.stderr)
        sys.exit(1)
    
    try:
        relatedness_qc = SampleRelatednessQC(
            threshold=args.threshold,
            method=args.method,
            verbose=not args.quiet
        )
        
        filtered_df = relatedness_qc.process_file(
            input_file=args.input_file,
            output_file=args.output,
            phenotype_col=args.phenotype_col,
            report_file=args.report
        )
        
        if not args.quiet:
            print(f"\nSample Relatedness QC Summary:")
            print(f"  Original individuals: {relatedness_qc.original_individual_count}")
            print(f"  Filtered individuals: {relatedness_qc.filtered_individual_count}")
            print(f"  Removed individuals: {len(relatedness_qc.removed_individuals)}")
            print(f"  Related pairs found: {len(relatedness_qc.related_pairs)}")
        
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        if not args.quiet:
            raise
        sys.exit(1)


if __name__ == '__main__':
    main()

