#!/usr/bin/env python3
import pandas as pd
import numpy as np
import argparse
import logging
import sys
import os
from datetime import datetime
from pathlib import Path


class MAFQualityControl:
    
    def __init__(self, threshold=0.05, method='combined', verbose=True):
        self.threshold = threshold
        self.method = method
        self.verbose = verbose
        
        if not (0.001 <= threshold <= 0.5):
            raise ValueError("MAF threshold must be between 0.001 and 0.5")
        if method not in ['combined', 'separate']:
            raise ValueError("Method must be 'combined' or 'separate'")
        
        self._setup_logging()
        
        self.original_snp_count = 0
        self.filtered_snp_count = 0
        self.removed_snps = []
        self.qc_stats = {}
        
    def _setup_logging(self):
        log_level = logging.INFO if self.verbose else logging.WARNING
        logging.basicConfig(
            level=log_level,
            format='%(asctime)s - %(levelname)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        self.logger = logging.getLogger(__name__)
    
    def detect_format(self, df):
        if 'SNP_ID' in df.columns:
            case_cols = [col for col in df.columns if col.startswith('Case_')]
            control_cols = [col for col in df.columns if col.startswith('Control_')]
            if len(case_cols) > 0 and len(control_cols) > 0:
                return 'aggregated'
        
        if len(df.columns) > 10:
            sample_cols = df.columns[1:min(6, len(df.columns))]
            genotype_values = set()
            
            for col in sample_cols:
                if pd.api.types.is_numeric_dtype(df[col]):
                    unique_vals = df[col].dropna().unique()
                    genotype_values.update(unique_vals)
            
            if genotype_values.issubset({0, 1, 2, 0.0, 1.0, 2.0}) and len(genotype_values) > 1:
                return 'individual'
        
        return 'unknown'
    
    def validate_input_format(self, df, format_type):
        if format_type == 'aggregated':
            return self._validate_aggregated_format(df)
        elif format_type == 'individual':
            return self._validate_individual_format(df)
        else:
            raise ValueError("Unknown data format. Expected either aggregated (SNP_ID,Case_0,Case_1,Case_2,Control_0,Control_1,Control_2) or individual genotype format.")
    
    def _validate_aggregated_format(self, df):
        if 'SNP_ID' not in df.columns:
            raise ValueError("Missing required 'SNP_ID' column for aggregated format")
        
        case_cols = [col for col in df.columns if col.startswith('Case_')]
        control_cols = [col for col in df.columns if col.startswith('Control_')]
        
        if len(case_cols) == 0:
            raise ValueError("No 'Case_' columns found")
        if len(control_cols) == 0:
            raise ValueError("No 'Control_' columns found")
        
        expected_suffixes = ['0', '1', '2']
        for suffix in expected_suffixes:
            if f'Case_{suffix}' not in df.columns:
                raise ValueError(f"Missing required column 'Case_{suffix}'")
            if f'Control_{suffix}' not in df.columns:
                raise ValueError(f"Missing required column 'Control_{suffix}'")
        
        genotype_cols = case_cols + control_cols
        for col in genotype_cols:
            if not pd.api.types.is_numeric_dtype(df[col]):
                raise ValueError(f"Column '{col}' must contain numeric values")
            if (df[col] < 0).any():
                raise ValueError(f"Column '{col}' contains negative values")
        
        self.logger.info(f"Aggregated format validation passed: {len(df)} SNPs, {len(case_cols)} case columns, {len(control_cols)} control columns")
        return True
    
    def _validate_individual_format(self, df):
        if len(df.columns) < 2:
            raise ValueError("Individual format requires at least 2 columns (ID + SNP columns)")
        
        snp_cols = df.columns[1:]
        
        for col in snp_cols[:5]:
            if not pd.api.types.is_numeric_dtype(df[col]):
                try:
                    df[col] = pd.to_numeric(df[col], errors='coerce')
                except:
                    raise ValueError(f"Column '{col}' contains non-numeric genotype data")
            
            unique_vals = set(df[col].dropna().unique())
            valid_genotypes = {0, 1, 2, 0.0, 1.0, 2.0, -1, 9}
            
            if not unique_vals.issubset(valid_genotypes):
                invalid_vals = unique_vals - valid_genotypes
                raise ValueError(f"Column '{col}' contains invalid genotype values: {invalid_vals}. Expected: 0, 1, 2 (and optionally -1, 9 for missing)")
        
        self.logger.info(f"Individual format validation passed: {len(df)} individuals, {len(snp_cols)} SNP columns")
        return True
    
    def calculate_maf_combined(self, case_counts, control_counts):
        total_aa = case_counts[0] + control_counts[0]
        total_ab = case_counts[1] + control_counts[1]
        total_bb = case_counts[2] + control_counts[2]
        
        total_individuals = total_aa + total_ab + total_bb
        
        if total_individuals == 0:
            return 0.0
        
        total_alleles = 2 * total_individuals
        ref_allele_freq = (2 * total_aa + total_ab) / total_alleles
        alt_allele_freq = (2 * total_bb + total_ab) / total_alleles
        
        maf = min(ref_allele_freq, alt_allele_freq)
        
        return maf
    
    def calculate_maf_separate(self, case_counts, control_counts):
        def calc_single_maf(counts):
            aa, ab, bb = counts
            total_individuals = aa + ab + bb
            
            if total_individuals == 0:
                return 0.0
            
            total_alleles = 2 * total_individuals
            ref_allele_freq = (2 * aa + ab) / total_alleles
            alt_allele_freq = (2 * bb + ab) / total_alleles
            
            return min(ref_allele_freq, alt_allele_freq)
        
        case_maf = calc_single_maf(case_counts)
        control_maf = calc_single_maf(control_counts)
        
        return case_maf, control_maf
    
    def calculate_maf_individual_format(self, genotypes, phenotypes=None):
        # Clean genotypes (remove missing values coded as -1, 9, NaN)
        valid_mask = genotypes.notna() & (~genotypes.isin([-1, 9]))
        clean_genotypes = genotypes[valid_mask]
        if len(clean_genotypes) == 0:
            return {'maf_combined': 0.0, 'total_individuals': 0, 'genotype_counts': [0, 0, 0]}
        count_0 = (clean_genotypes == 0).sum()
        count_1 = (clean_genotypes == 1).sum()
        count_2 = (clean_genotypes == 2).sum()
        total_individuals = len(clean_genotypes)
        total_alleles = 2 * total_individuals
        
        freq_ref = (2 * count_0 + count_1) / total_alleles  # Reference allele frequency
        freq_alt = (2 * count_2 + count_1) / total_alleles  # Alternate allele frequency
        
        maf_combined = min(freq_ref, freq_alt)
        
        result = {
            'maf_combined': maf_combined,
            'total_individuals': total_individuals,
            'genotype_counts': [int(count_0), int(count_1), int(count_2)],
            'allele_frequencies': [freq_ref, freq_alt],
            'missing_count': len(genotypes) - len(clean_genotypes)
        }
        
        if phenotypes is not None and len(phenotypes) == len(genotypes):
            clean_phenotypes = phenotypes[valid_mask]
            
            # Cases (phenotype == 1)
            case_mask = clean_phenotypes == 1
            case_genotypes = clean_genotypes[case_mask]
            
            # Controls (phenotype == 0)
            control_mask = clean_phenotypes == 0
            control_genotypes = clean_genotypes[control_mask]
            
            if len(case_genotypes) > 0:
                case_counts = [(case_genotypes == i).sum() for i in range(3)]
                case_maf = self._calculate_maf_from_counts(case_counts)
                result['maf_cases'] = case_maf
                result['case_counts'] = case_counts
                result['case_individuals'] = len(case_genotypes)
            
            if len(control_genotypes) > 0:
                control_counts = [(control_genotypes == i).sum() for i in range(3)]
                control_maf = self._calculate_maf_from_counts(control_counts)
                result['maf_controls'] = control_maf
                result['control_counts'] = control_counts
                result['control_individuals'] = len(control_genotypes)
        
        return result
    
    def _calculate_maf_from_counts(self, counts):
        count_0, count_1, count_2 = counts
        total_individuals = sum(counts)
        
        if total_individuals == 0:
            return 0.0
        
        total_alleles = 2 * total_individuals
        freq_ref = (2 * count_0 + count_1) / total_alleles
        freq_alt = (2 * count_2 + count_1) / total_alleles
        
        return min(freq_ref, freq_alt)
    
    def process_snp_individual_format(self, snp_col, df, phenotype_col=None):
        genotypes = df[snp_col]
        phenotypes = df[phenotype_col] if phenotype_col else None
        
        maf_result = self.calculate_maf_individual_format(genotypes, phenotypes)
        
        if self.method == 'combined':
            maf = maf_result['maf_combined']
            passes_threshold = maf >= self.threshold
            
            result = {
                'snp_id': snp_col,
                'maf_combined': maf,
                'passes_threshold': passes_threshold,
                'method': 'combined',
                'total_individuals': maf_result['total_individuals'],
                'genotype_counts': maf_result['genotype_counts'],
                'missing_count': maf_result['missing_count']
            }
            
        else:
            case_maf = maf_result.get('maf_cases', 0.0)
            control_maf = maf_result.get('maf_controls', 0.0)
            passes_threshold = case_maf >= self.threshold and control_maf >= self.threshold
            
            result = {
                'snp_id': snp_col,
                'maf_cases': case_maf,
                'maf_controls': control_maf,
                'passes_threshold': passes_threshold,
                'method': 'separate',
                'total_individuals': maf_result['total_individuals'],
                'case_individuals': maf_result.get('case_individuals', 0),
                'control_individuals': maf_result.get('control_individuals', 0),
                'missing_count': maf_result['missing_count']
            }
        
        return result
    
    def process_snp(self, row):
        snp_id = row['SNP_ID']
        
        case_counts = [row['Case_0'], row['Case_1'], row['Case_2']]
        control_counts = [row['Control_0'], row['Control_1'], row['Control_2']]
        
        if self.method == 'combined':
            maf = self.calculate_maf_combined(case_counts, control_counts)
            passes_threshold = maf >= self.threshold
            
            result = {
                'snp_id': snp_id,
                'maf_combined': maf,
                'passes_threshold': passes_threshold,
                'method': 'combined'
            }
            
        else:
            case_maf, control_maf = self.calculate_maf_separate(case_counts, control_counts)
            passes_threshold = case_maf >= self.threshold and control_maf >= self.threshold
            
            result = {
                'snp_id': snp_id,
                'maf_cases': case_maf,
                'maf_controls': control_maf,
                'passes_threshold': passes_threshold,
                'method': 'separate'
            }
        
        return result
    
    def filter_dataset(self, df, phenotype_col=None):
        format_type = self.detect_format(df)
        self.logger.info(f"Detected data format: {format_type}")
        
        self.validate_input_format(df, format_type)
        
        self.logger.info(f"Starting MAF filtering with threshold {self.threshold} using {self.method} method")
        
        if format_type == 'aggregated':
            return self._filter_aggregated_format(df)
        elif format_type == 'individual':
            return self._filter_individual_format(df, phenotype_col)
        else:
            raise ValueError(f"Unsupported data format: {format_type}")
    
    def _filter_aggregated_format(self, df):
        self.original_snp_count = len(df)
        qc_results = []
        
        for idx, row in df.iterrows():
            result = self.process_snp(row)
            qc_results.append(result)
            
            if not result['passes_threshold']:
                self.removed_snps.append(result)
        
        passing_indices = [i for i, result in enumerate(qc_results) if result['passes_threshold']]
        filtered_df = df.iloc[passing_indices].copy()
        
        self.filtered_snp_count = len(filtered_df)
        
        self.logger.info(f"Filtering complete: {self.filtered_snp_count}/{self.original_snp_count} SNPs passed MAF threshold")
        
        return filtered_df, qc_results
    
    def _filter_individual_format(self, df, phenotype_col=None):
        """Filter individual format data"""
        if self.method == 'separate' and phenotype_col is None:
            self.logger.warning(
                "Separate method requested but no phenotype column provided. "
                "Switching to combined method for individual format data."
            )
            self.method = 'combined'
        
        if phenotype_col and phenotype_col not in df.columns:
            self.logger.warning(f"Phenotype column '{phenotype_col}' not found. Using combined method.")
            phenotype_col = None
            if self.method == 'separate':
                self.method = 'combined'
        
        snp_columns = df.columns[1:]
        if phenotype_col:
            snp_columns = [col for col in snp_columns if col != phenotype_col]
        
        self.original_snp_count = len(snp_columns)
        qc_results = []
        passing_snps = []
        
        self.logger.info(f"Processing {len(snp_columns)} SNPs using {self.method} method")
        if phenotype_col:
            case_count = (df[phenotype_col] == 1).sum()
            control_count = (df[phenotype_col] == 0).sum()
            self.logger.info(f"Phenotype distribution: {case_count} cases, {control_count} controls")
        
        for snp_col in snp_columns:
            result = self.process_snp_individual_format(snp_col, df, phenotype_col)
            qc_results.append(result)
            
            if result['passes_threshold']:
                passing_snps.append(snp_col)
            else:
                self.removed_snps.append(result)
        
        filtered_columns = [df.columns[0]] + passing_snps
        if phenotype_col and phenotype_col in df.columns:
            filtered_columns.append(phenotype_col)
        
        filtered_df = df[filtered_columns].copy()
        
        self.filtered_snp_count = len(passing_snps)
        
        self.logger.info(f"Filtering complete: {self.filtered_snp_count}/{self.original_snp_count} SNPs passed MAF threshold")
        
        return filtered_df, qc_results
    
    def process_file(self, input_file, output_file=None, phenotype_col=None):
        try:
            df = pd.read_csv(input_file)
            format_type = self.detect_format(df)
            
            if format_type == 'individual':
                self.logger.info(f"Loaded individual genotype dataset: {input_file} ({len(df)} individuals, {len(df.columns)-1} SNPs)")
            else:
                self.logger.info(f"Loaded aggregated dataset: {input_file} ({len(df)} SNPs)")
                
        except Exception as e:
            raise ValueError(f"Error reading input file: {e}")
        
        filtered_df, qc_results = self.filter_dataset(df, phenotype_col)
        
        if output_file:
            filtered_df.to_csv(output_file, index=False)
            self.logger.info(f"Filtered dataset saved to: {output_file}")
        
        return filtered_df


def main():
    parser = argparse.ArgumentParser(
        description='Minor Allele Frequency Quality Control for GWAS Data - Supports Multiple Formats',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Aggregated format (SNP_ID,Case_0,Case_1,Case_2,Control_0,Control_1,Control_2)
  python minor_allele_freq.py aggregated_data.csv --threshold 0.05
  
  # Individual genotype format (ID,rs001,rs002,rs003,...)
  python minor_allele_freq.py individual_data.csv --threshold 0.01
  
  # Individual format with phenotype column
  python minor_allele_freq.py data.csv --phenotype-col disease_status --method separate
  
  # Custom output and settings
  python minor_allele_freq.py data.csv --threshold 0.1 --output clean_data.csv --quiet
        """
    )
    
    parser.add_argument('input_file', help='Input CSV file with GWAS data (auto-detects format)')
    parser.add_argument('--threshold', '-t', type=float, default=0.05,
                       help='MAF threshold for filtering (default: 0.05)')
    parser.add_argument('--method', '-m', choices=['combined', 'separate'], default='combined',
                       help='MAF calculation method (default: combined)')
    parser.add_argument('--output', '-o', help='Output file path (default: auto-generated)')
    parser.add_argument('--phenotype-col', '-p', help='Phenotype column name (for individual format with case/control info)')
    parser.add_argument('--quiet', '-q', action='store_true',
                       help='Suppress verbose output')
    
    args = parser.parse_args()
    
    # Validate input file exists
    if not os.path.exists(args.input_file):
        print(f"Error: Input file '{args.input_file}' not found")
        sys.exit(1)
    
    try:
        # Initialize MAF QC processor
        maf_qc = MAFQualityControl(
            threshold=args.threshold,
            method=args.method,
            verbose=not args.quiet
        )
        
        # Process the file
        filtered_df, qc_results = maf_qc.process_file(args.input_file, args.output, args.phenotype_col)
        
        # Print summary
        print("\n" + "="*50)
        print("MAF QUALITY CONTROL SUMMARY")
        print("="*50)
        print(f"Original SNPs: {maf_qc.original_snp_count:,}")
        print(f"Filtered SNPs: {maf_qc.filtered_snp_count:,}")
        print(f"Removed SNPs: {len(maf_qc.removed_snps):,}")
        print(f"Pass Rate: {(maf_qc.filtered_snp_count/maf_qc.original_snp_count)*100:.2f}%")
        print(f"Threshold: {args.threshold}")
        print(f"Method: {args.method}")
        print("="*50)
        
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
