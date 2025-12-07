#!/usr/bin/env python3
import pandas as pd
import numpy as np
import argparse
import logging
import sys
import os
from datetime import datetime
from pathlib import Path


class MissingDataQC:
    
    def __init__(self, missing_threshold=0.10, filter_individuals=True, filter_snps=True, verbose=True):
        self.missing_threshold = missing_threshold
        self.filter_individuals = filter_individuals
        self.filter_snps = filter_snps
        self.verbose = verbose
        
        if not (0.0 <= missing_threshold <= 1.0):
            raise ValueError("Missing threshold must be between 0.0 and 1.0")
        
        self._setup_logging()
        
        self.original_individual_count = 0
        self.filtered_individual_count = 0
        self.original_snp_count = 0
        self.filtered_snp_count = 0
        self.removed_individuals = []
        self.removed_snps = []
        self.individual_missing_rates = {}
        self.snp_missing_rates = {}
        
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
            
            if genotype_values.issubset({0, 1, 2, 0.0, 1.0, 2.0, -1, 9}) and len(genotype_values) > 1:
                return 'individual'
        
        return 'unknown'
    
    def validate_input_format(self, df, format_type):
        if format_type == 'individual':
            return self._validate_individual_format(df)
        else:
            raise ValueError("Missing data QC only supports individual genotype format. Aggregated format already has no missing data.")
    
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
        
        self.logger.info(f"Individual format validation passed: {len(df)} individuals, {len(snp_cols)} SNP columns")
        return True
    
    def _is_missing(self, value):
        """Check if a value represents missing data"""
        if pd.isna(value):
            return True
        if value in [-1, 9]:
            return True
        return False
    
    def calculate_individual_missing_rates(self, df, snp_columns):
        """Calculate missing rate for each individual"""
        id_col = df.columns[0]
        missing_rates = {}
        
        for idx, row in df.iterrows():
            individual_id = row[id_col]
            genotype_values = row[snp_columns]
            
            total_snps = len(snp_columns)
            missing_count = sum(1 for val in genotype_values if self._is_missing(val))
            missing_rate = missing_count / total_snps if total_snps > 0 else 0.0
            
            missing_rates[individual_id] = {
                'missing_count': missing_count,
                'total_snps': total_snps,
                'missing_rate': missing_rate,
                'genotyping_rate': 1.0 - missing_rate
            }
        
        return missing_rates
    
    def calculate_snp_missing_rates(self, df, snp_columns):
        """Calculate missing rate for each SNP"""
        missing_rates = {}
        
        for snp_col in snp_columns:
            genotype_values = df[snp_col]
            
            total_individuals = len(genotype_values)
            missing_count = sum(1 for val in genotype_values if self._is_missing(val))
            missing_rate = missing_count / total_individuals if total_individuals > 0 else 0.0
            
            missing_rates[snp_col] = {
                'missing_count': missing_count,
                'total_individuals': total_individuals,
                'missing_rate': missing_rate,
                'genotyping_rate': 1.0 - missing_rate
            }
        
        return missing_rates
    
    def filter_dataset(self, df, phenotype_col=None):
        """Filter dataset based on missing data thresholds"""
        id_col = df.columns[0]
        snp_columns = df.columns[1:]
        
        if phenotype_col and phenotype_col in snp_columns:
            snp_columns = [col for col in snp_columns if col != phenotype_col]
        
        self.original_individual_count = len(df)
        self.original_snp_count = len(snp_columns)
        
        self.logger.info(f"Calculating missing data rates for {self.original_individual_count} individuals and {self.original_snp_count} SNPs...")
        
        filtered_df = df.copy()
        
        if self.filter_individuals:
            self.individual_missing_rates = self.calculate_individual_missing_rates(filtered_df, snp_columns)
            
            individuals_to_keep = []
            for individual_id, stats in self.individual_missing_rates.items():
                if stats['missing_rate'] <= self.missing_threshold:
                    individuals_to_keep.append(individual_id)
                else:
                    self.removed_individuals.append({
                        'individual_id': individual_id,
                        'missing_rate': stats['missing_rate'],
                        'genotyping_rate': stats['genotyping_rate'],
                        'missing_count': stats['missing_count'],
                        'total_snps': stats['total_snps']
                    })
            
            filtered_df = filtered_df[filtered_df[id_col].isin(individuals_to_keep)].reset_index(drop=True)
            self.filtered_individual_count = len(filtered_df)
            self.logger.info(f"Filtered {self.original_individual_count} individuals to {self.filtered_individual_count} individuals")
            self.logger.info(f"Removed {len(self.removed_individuals)} individuals with missing rate > {self.missing_threshold:.1%}")
        
        if self.filter_snps:
            self.snp_missing_rates = self.calculate_snp_missing_rates(filtered_df, snp_columns)
            
            snps_to_keep = []
            for snp_col, stats in self.snp_missing_rates.items():
                if stats['missing_rate'] <= self.missing_threshold:
                    snps_to_keep.append(snp_col)
                else:
                    self.removed_snps.append({
                        'snp_id': snp_col,
                        'missing_rate': stats['missing_rate'],
                        'genotyping_rate': stats['genotyping_rate'],
                        'missing_count': stats['missing_count'],
                        'total_individuals': stats['total_individuals']
                    })
            
            columns_to_keep = [id_col] + snps_to_keep
            if phenotype_col:
                columns_to_keep.append(phenotype_col)
            
            filtered_df = filtered_df[columns_to_keep]
            self.filtered_snp_count = len(snps_to_keep)
            self.logger.info(f"Filtered {self.original_snp_count} SNPs to {self.filtered_snp_count} SNPs")
            self.logger.info(f"Removed {len(self.removed_snps)} SNPs with missing rate > {self.missing_threshold:.1%}")
        
        return filtered_df
    
    def generate_report(self, output_file=None):
        """Generate missing data QC report"""
        report_lines = []
        report_lines.append("=" * 80)
        report_lines.append("Missing Data Quality Control Report")
        report_lines.append("=" * 80)
        report_lines.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        report_lines.append(f"Missing threshold: {self.missing_threshold:.1%} (genotyping rate ≥ {(1.0 - self.missing_threshold):.1%})")
        report_lines.append(f"Filter individuals: {self.filter_individuals}")
        report_lines.append(f"Filter SNPs: {self.filter_snps}")
        report_lines.append("")
        
        report_lines.append("Summary Statistics")
        report_lines.append("-" * 80)
        report_lines.append(f"Original individuals: {self.original_individual_count}")
        report_lines.append(f"Filtered individuals: {self.filtered_individual_count}")
        if self.filter_individuals:
            report_lines.append(f"Removed individuals: {len(self.removed_individuals)}")
            if self.original_individual_count > 0:
                removal_rate = len(self.removed_individuals) / self.original_individual_count * 100
                report_lines.append(f"Individual removal rate: {removal_rate:.2f}%")
            else:
                report_lines.append("Individual removal rate: N/A")
        report_lines.append("")
        
        report_lines.append(f"Original SNPs: {self.original_snp_count}")
        report_lines.append(f"Filtered SNPs: {self.filtered_snp_count}")
        if self.filter_snps:
            report_lines.append(f"Removed SNPs: {len(self.removed_snps)}")
            if self.original_snp_count > 0:
                removal_rate = len(self.removed_snps) / self.original_snp_count * 100
                report_lines.append(f"SNP removal rate: {removal_rate:.2f}%")
            else:
                report_lines.append("SNP removal rate: N/A")
        report_lines.append("")
        
        if self.filter_individuals and self.removed_individuals:
            report_lines.append("Removed Individuals")
            report_lines.append("-" * 80)
            for removed in sorted(self.removed_individuals, key=lambda x: x['missing_rate'], reverse=True):
                report_lines.append(f"Individual: {removed['individual_id']}")
                report_lines.append(f"  Missing rate: {removed['missing_rate']:.2%}")
                report_lines.append(f"  Genotyping rate: {removed['genotyping_rate']:.2%}")
                report_lines.append(f"  Missing count: {removed['missing_count']} / {removed['total_snps']}")
                report_lines.append("")
        
        if self.filter_snps and self.removed_snps:
            report_lines.append("Removed SNPs")
            report_lines.append("-" * 80)
            for removed in sorted(self.removed_snps, key=lambda x: x['missing_rate'], reverse=True):
                report_lines.append(f"SNP: {removed['snp_id']}")
                report_lines.append(f"  Missing rate: {removed['missing_rate']:.2%}")
                report_lines.append(f"  Genotyping rate: {removed['genotyping_rate']:.2%}")
                report_lines.append(f"  Missing count: {removed['missing_count']} / {removed['total_individuals']}")
                report_lines.append("")
        
        if self.filter_individuals and self.individual_missing_rates:
            report_lines.append("Individual Missing Data Statistics")
            report_lines.append("-" * 80)
            all_rates = [stats['missing_rate'] for stats in self.individual_missing_rates.values()]
            if all_rates:
                report_lines.append(f"Mean missing rate: {np.mean(all_rates):.2%}")
                report_lines.append(f"Median missing rate: {np.median(all_rates):.2%}")
                report_lines.append(f"Min missing rate: {np.min(all_rates):.2%}")
                report_lines.append(f"Max missing rate: {np.max(all_rates):.2%}")
                report_lines.append(f"Std missing rate: {np.std(all_rates):.2%}")
            report_lines.append("")
        
        if self.filter_snps and self.snp_missing_rates:
            report_lines.append("SNP Missing Data Statistics")
            report_lines.append("-" * 80)
            all_rates = [stats['missing_rate'] for stats in self.snp_missing_rates.values()]
            if all_rates:
                report_lines.append(f"Mean missing rate: {np.mean(all_rates):.2%}")
                report_lines.append(f"Median missing rate: {np.median(all_rates):.2%}")
                report_lines.append(f"Min missing rate: {np.min(all_rates):.2%}")
                report_lines.append(f"Max missing rate: {np.max(all_rates):.2%}")
                report_lines.append(f"Std missing rate: {np.std(all_rates):.2%}")
            report_lines.append("")
        
        report_content = "\n".join(report_lines)
        
        if output_file:
            with open(output_file, 'w') as f:
                f.write(report_content)
            self.logger.info(f"Missing data QC report written to {output_file}")
        
        return report_content
    
    def process_file(self, input_file, output_file=None, phenotype_col=None, report_file=None):
        self.logger.info(f"Reading input file: {input_file}")
        df = pd.read_csv(input_file)
        
        format_type = self.detect_format(df)
        self.logger.info(f"Detected format: {format_type}")
        
        if format_type == 'unknown':
            raise ValueError("Could not detect data format. Please ensure data is in individual genotype format.")
        
        self.validate_input_format(df, format_type)
        
        filtered_df = self.filter_dataset(df, phenotype_col)
        
        if output_file is None:
            input_path = Path(input_file)
            output_file = input_path.parent / f"{input_path.stem}_missing_filtered{input_path.suffix}"
        
        filtered_df.to_csv(output_file, index=False)
        self.logger.info(f"Filtered dataset saved to: {output_file}")
        
        if report_file is None:
            input_path = Path(input_file)
            report_file = input_path.parent / f"{input_path.stem}_missing_report.txt"
        
        self.generate_report(report_file)
        
        return filtered_df


def main():
    parser = argparse.ArgumentParser(
        description='Missing Data Quality Control for GWAS Data',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Filter both individuals and SNPs with default 10% threshold
  python missing_data_qc.py data.csv
  
  # Custom threshold (5% missing = 95% genotyping rate)
  python missing_data_qc.py data.csv --threshold 0.05
  
  # Only filter individuals, keep all SNPs
  python missing_data_qc.py data.csv --no-filter-snps
  
  # Only filter SNPs, keep all individuals
  python missing_data_qc.py data.csv --no-filter-individuals
  
  # Custom output files
  python missing_data_qc.py data.csv --output clean_data.csv --report qc_report.txt
        """
    )
    
    parser.add_argument('input_file', help='Input CSV file with GWAS data (individual genotype format)')
    parser.add_argument('--threshold', '-t', type=float, default=0.10,
                       help='Missing data threshold (default: 0.10 = 10%% missing, 90%% genotyping rate)')
    parser.add_argument('--no-filter-individuals', action='store_true',
                       help='Do not filter individuals based on missing data')
    parser.add_argument('--no-filter-snps', action='store_true',
                       help='Do not filter SNPs based on missing data')
    parser.add_argument('--phenotype-col', help='Phenotype column name (will be preserved in output)')
    parser.add_argument('--output', '-o', help='Output file path for filtered dataset (default: auto-generated)')
    parser.add_argument('--report', '-r', help='Output file path for QC report (default: auto-generated)')
    parser.add_argument('--quiet', '-q', action='store_true',
                       help='Suppress verbose output')
    
    args = parser.parse_args()
    
    if not os.path.exists(args.input_file):
        print(f"Error: Input file '{args.input_file}' not found", file=sys.stderr)
        sys.exit(1)
    
    try:
        missing_qc = MissingDataQC(
            missing_threshold=args.threshold,
            filter_individuals=not args.no_filter_individuals,
            filter_snps=not args.no_filter_snps,
            verbose=not args.quiet
        )
        
        filtered_df = missing_qc.process_file(
            input_file=args.input_file,
            output_file=args.output,
            phenotype_col=args.phenotype_col,
            report_file=args.report
        )
        
        if not args.quiet:
            print(f"\nMissing Data QC Summary:")
            print(f"  Original individuals: {missing_qc.original_individual_count}")
            print(f"  Filtered individuals: {missing_qc.filtered_individual_count}")
            if missing_qc.filter_individuals:
                print(f"  Removed individuals: {len(missing_qc.removed_individuals)}")
            print(f"  Original SNPs: {missing_qc.original_snp_count}")
            print(f"  Filtered SNPs: {missing_qc.filtered_snp_count}")
            if missing_qc.filter_snps:
                print(f"  Removed SNPs: {len(missing_qc.removed_snps)}")
        
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        if args.quiet:
            sys.exit(1)
        else:
            raise


if __name__ == '__main__':
    main()

