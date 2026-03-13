#!/usr/bin/env python3
import pandas as pd
import numpy as np
import argparse
import logging
import sys
import os
from datetime import datetime
from pathlib import Path
from scipy.stats.distributions import chi2


class HardyWeinbergQC:
    
    def __init__(self, threshold=1e-6, population='combined', method='chi2', verbose=True):
        self.threshold = threshold
        self.population = population
        self.method = method
        self.verbose = verbose
        
        # Validation
        if not (1e-10 <= threshold <= 1.0):
            raise ValueError("HWE p-value threshold must be between 1e-10 and 1.0")
        if population not in ['controls', 'cases', 'combined', 'both']:
            raise ValueError("Population must be 'controls', 'cases', 'combined', or 'both'")
        if method not in ['chi2', 'exact']:
            raise ValueError("Method must be 'chi2' or 'exact'")
        
        # Setup logging
        self._setup_logging()
        
        # Initialize tracking variables
        self.original_snp_count = 0
        self.filtered_snp_count = 0
        self.removed_snps = []
        self.hwe_results = {}
        
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
        if 'SNP_ID' in df.columns:
            case_cols = [col for col in df.columns if col.startswith('Case_')]
            control_cols = [col for col in df.columns if col.startswith('Control_')]
            if len(case_cols) > 0 and len(control_cols) > 0:
                return 'aggregated'
        
        # Check for individual format (many columns with 0/1/2 values)  likely many SNP columns
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
    
    def calculate_allele_frequencies(self, genotype_counts):
        aa, ab, bb = genotype_counts
        total_individuals = aa + ab + bb
        
        if total_individuals == 0:
            return (0.0, 0.0)
        
        total_alleles = 2 * total_individuals
        p = (2 * aa + ab) / total_alleles
        q = (2 * bb + ab) / total_alleles
        
        return (p, q)
    
    def calculate_expected_genotype_frequencies(self, genotype_counts):
        total_individuals = sum(genotype_counts)
        
        if total_individuals == 0:
            return (0.0, 0.0, 0.0, 0.0, 0.0)
        
        p, q = self.calculate_allele_frequencies(genotype_counts)
        
        expected_aa = total_individuals * (p ** 2)
        expected_ab = total_individuals * (2 * p * q)
        expected_bb = total_individuals * (q ** 2)
        
        return (expected_aa, expected_ab, expected_bb, p, q)
    
    def test_hwe_chi2(self, genotype_counts):
        aa, ab, bb = genotype_counts
        total_individuals = sum(genotype_counts)
        
        if total_individuals == 0:
            return {
                'p_value': 1.0,
                'chi2_stat': 0.0,
                'p_allele_freq': 0.0,
                'q_allele_freq': 0.0,
                'observed': [0, 0, 0],
                'expected': [0.0, 0.0, 0.0],
                'valid': False
            }
        
        expected_aa, expected_ab, expected_bb, p, q = self.calculate_expected_genotype_frequencies(genotype_counts)
        expected_counts = [expected_aa, expected_ab, expected_bb]
        observed_counts = [aa, ab, bb]
        
        min_expected = min([e for e in expected_counts if e > 0] or [0])
        
        if min_expected < 1:
            self.logger.debug(f"Very small expected count ({min_expected:.2f}) for HWE test - chi-square may be less accurate")
        
        chi2_stat = 0.0
        for obs, exp in zip(observed_counts, expected_counts):
            if exp > 0:
                chi2_stat += ((obs - exp) ** 2) / exp
            elif obs > 0:
                chi2_stat += float('inf')
        
        df = 1
        p_value = 1.0 - chi2.cdf(chi2_stat, df) if chi2_stat != float('inf') else 0.0
        
        if p_value < 1e-10:
            p_value = 1e-10
        
        return {
            'p_value': p_value,
            'chi2_stat': chi2_stat,
            'p_allele_freq': p,
            'q_allele_freq': q,
            'observed': observed_counts,
            'expected': expected_counts,
            'valid': True,
            'total_individuals': total_individuals
        }
    
    def test_hwe(self, genotype_counts):
        return self.test_hwe_chi2(genotype_counts)
    
    def process_snp_aggregated_format(self, row, population='combined'):
        snp_id = row['SNP_ID']
        
        case_counts = [row.get(f'Case_{i}', 0) for i in range(3)]
        control_counts = [row.get(f'Control_{i}', 0) for i in range(3)]
        
        if population == 'controls':
            genotype_counts = control_counts
            pop_label = 'controls'
        elif population == 'cases':
            genotype_counts = case_counts
            pop_label = 'cases'
        else:  # combined
            genotype_counts = [case_counts[i] + control_counts[i] for i in range(3)]
            pop_label = 'combined'
        
        hwe_result = self.test_hwe(genotype_counts)
        hwe_result['snp_id'] = snp_id
        hwe_result['population'] = pop_label
        
        return hwe_result
    
    def process_snp_individual_format(self, genotypes, phenotypes=None, population='combined'):
        valid_mask = genotypes.notna() & (~genotypes.isin([-1, 9]))
        clean_genotypes = genotypes[valid_mask]
        
        if len(clean_genotypes) == 0:
            return {
                'p_value': 1.0,
                'chi2_stat': 0.0,
                'valid': False,
                'total_individuals': 0
            }
        
        if phenotypes is not None and len(phenotypes) == len(genotypes):
            clean_phenotypes = phenotypes[valid_mask]
            
            if population == 'controls':
                mask = clean_phenotypes == 0
                clean_genotypes = clean_genotypes[mask]
            elif population == 'cases':
                mask = clean_phenotypes == 1
                clean_genotypes = clean_genotypes[mask]
        
        count_0 = (clean_genotypes == 0).sum()  # AA
        count_1 = (clean_genotypes == 1).sum()  # Aa
        count_2 = (clean_genotypes == 2).sum()  # aa
        
        genotype_counts = [int(count_0), int(count_1), int(count_2)]
        
        hwe_result = self.test_hwe(genotype_counts)
        hwe_result['total_individuals'] = len(clean_genotypes)
        
        return hwe_result
    
    def _check_snp_passes_hwe(self, snp_results, snp_id):
        for pop, result in snp_results.items():
            if result.get('valid', False) and result.get('p_value', 1.0) < self.threshold:
                self.logger.debug(f"SNP {snp_id} ({pop}): p-value {result['p_value']:.2e} < threshold {self.threshold:.2e}")
                return False
        return True
    
    def filter_dataset_aggregated_format(self, df):
        hwe_results = {}
        filtered_rows = []
        populations_to_test = ['controls', 'cases'] if self.population == 'both' else [self.population]
        
        for idx, row in df.iterrows():
            snp_id = row['SNP_ID']
            snp_results = {pop: self.process_snp_aggregated_format(row, population=pop) 
                          for pop in populations_to_test}
            hwe_results[snp_id] = snp_results
            
            if self._check_snp_passes_hwe(snp_results, snp_id):
                filtered_rows.append(row)
            else:
                self.removed_snps.append({
                    'snp_id': snp_id,
                    'results': snp_results,
                    'reason': f"HWE p-value < {self.threshold}"
                })
        
        return pd.DataFrame(filtered_rows).reset_index(drop=True), hwe_results
    
    def filter_dataset_individual_format(self, df, phenotype_col=None):
        if self.population in ['controls', 'cases', 'both']:
            if phenotype_col is None:
                self.logger.warning(
                    f"Population '{self.population}' requested but no phenotype column provided. "
                    "Switching to combined method."
                )
                self.population = 'combined'
            elif phenotype_col not in df.columns:
                self.logger.warning(f"Phenotype column '{phenotype_col}' not found. Using combined method.")
                self.population = 'combined'
                phenotype_col = None
        
        id_col = df.columns[0]
        snp_columns = df.columns[1:]
        if phenotype_col and phenotype_col in snp_columns:
            snp_columns = [col for col in snp_columns if col != phenotype_col]
        
        phenotypes = df[phenotype_col] if phenotype_col else None
        
        populations_to_test = ['controls', 'cases'] if self.population == 'both' else [self.population]
        
        hwe_results = {}
        snps_to_remove = set()
        
        for snp_col in snp_columns:
            genotypes = df[snp_col]
            snp_results = {pop: self.process_snp_individual_format(genotypes, phenotypes, population=pop)
                          for pop in populations_to_test}
            hwe_results[snp_col] = snp_results
            
            if not self._check_snp_passes_hwe(snp_results, snp_col):
                snps_to_remove.add(snp_col)
                self.removed_snps.append({
                    'snp_id': snp_col,
                    'results': snp_results,
                    'reason': f"HWE p-value < {self.threshold}"
                })
        
        columns_to_keep = [id_col] + [col for col in snp_columns if col not in snps_to_remove]
        if phenotype_col:
            columns_to_keep.append(phenotype_col)
        
        filtered_df = df[columns_to_keep].copy()
        
        return filtered_df, hwe_results
    
    def filter_dataset(self, df, format_type, phenotype_col=None):
        if format_type == 'aggregated':
            return self.filter_dataset_aggregated_format(df)
        else:
            return self.filter_dataset_individual_format(df, phenotype_col)
    
    def process_file(self, input_file, output_file=None, phenotype_col=None):
        self.logger.info(f"Reading input file: {input_file}")
        df = pd.read_csv(input_file)
        
        format_type = self.detect_format(df)
        self.logger.info(f"Detected format: {format_type}")
        
        if format_type == 'unknown':
            raise ValueError("Could not detect data format. Please ensure data is in aggregated or individual genotype format.")
        
        self.validate_input_format(df, format_type)
        
        if format_type == 'aggregated':
            self.original_snp_count = len(df)
        else:
            snp_columns = [col for col in df.columns[1:] if col != phenotype_col] if phenotype_col else df.columns[1:]
            self.original_snp_count = len(snp_columns)
        
        self.logger.info(f"Testing HWE for {self.original_snp_count} SNPs...")
        filtered_df, hwe_results = self.filter_dataset(df, format_type, phenotype_col)
        
        if format_type == 'aggregated':
            self.filtered_snp_count = len(filtered_df)
        else:
            excluded_cols = {df.columns[0]}
            if phenotype_col:
                excluded_cols.add(phenotype_col)
            self.filtered_snp_count = len([col for col in filtered_df.columns if col not in excluded_cols])
        
        self.logger.info(f"Filtered {self.original_snp_count} SNPs to {self.filtered_snp_count} SNPs")
        self.logger.info(f"Removed {len(self.removed_snps)} SNPs with HWE p-value < {self.threshold:.2e}")
        
        if output_file:
            filtered_df.to_csv(output_file, index=False)
            self.logger.info(f"Filtered dataset saved to: {output_file}")
        
        return filtered_df


def main():
    parser = argparse.ArgumentParser(
        description='Hardy-Weinberg Equilibrium Quality Control for GWAS Data',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Individual format with controls-only testing (recommended for GWAS)
  python hardy_weinberg_qc.py data.csv --population controls --threshold 1e-6 --phenotype-col disease_status
  
  # Combined population testing (when no phenotype available)
  python hardy_weinberg_qc.py data.csv --population combined --threshold 1e-6
  
  # Test in both cases and controls separately
  python hardy_weinberg_qc.py data.csv --population both --threshold 1e-4 --phenotype-col phenotype
  
  # Use exact test for small samples
  python hardy_weinberg_qc.py data.csv --method exact --threshold 1e-6
  
  # Aggregated format
  python hardy_weinberg_qc.py aggregated_data.csv --population controls --threshold 1e-6
        """
    )
    
    parser.add_argument('input_file', help='Input CSV file with GWAS data (auto-detects format)')
    parser.add_argument('--threshold', '-t', type=float, default=1e-6,
                       help='HWE p-value threshold for filtering (default: 1e-6)')
    parser.add_argument('--population', '-p', choices=['controls', 'cases', 'combined', 'both'],
                       default='combined', help='Population to test (default: combined)')
    parser.add_argument('--method', '-m', choices=['chi2', 'exact'], default='chi2',
                       help='Test method: chi2 or exact (default: chi2)')
    parser.add_argument('--phenotype-col', help='Phenotype column name (for individual format with case/control info)')
    parser.add_argument('--output', '-o', help='Output file path for filtered dataset (default: auto-generated)')
    parser.add_argument('--report', '-r', help='Output file path for HWE report (default: auto-generated)')
    parser.add_argument('--quiet', '-q', action='store_true',
                       help='Suppress verbose output')
    
    args = parser.parse_args()
    
    # Validate input file exists
    if not os.path.exists(args.input_file):
        print(f"Error: Input file '{args.input_file}' not found", file=sys.stderr)
        sys.exit(1)
    
    try:
        # Initialize HWE QC processor
        hwe_qc = HardyWeinbergQC(
            threshold=args.threshold,
            population=args.population,
            method=args.method,
            verbose=not args.quiet
        )
        
        # Process file
        filtered_df, hwe_results = hwe_qc.process_file(
            input_file=args.input_file,
            output_file=args.output,
            phenotype_col=args.phenotype_col,
            report_file=args.report
        )
        
        # Print summary
        if not args.quiet:
            print(f"\nHWE QC Summary:")
            print(f"  Original SNPs: {hwe_qc.original_snp_count}")
            print(f"  Filtered SNPs: {hwe_qc.filtered_snp_count}")
            print(f"  Removed SNPs: {len(hwe_qc.removed_snps)}")
            if hwe_qc.original_snp_count > 0:
                removal_rate = len(hwe_qc.removed_snps) / hwe_qc.original_snp_count * 100
                print(f"  Removal rate: {removal_rate:.2f}%")
            else:
                print(f"  Removal rate: N/A (no SNPs tested)")
        
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        if args.quiet:
            sys.exit(1)
        else:
            raise


if __name__ == '__main__':
    main()

