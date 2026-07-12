# Missing Data Quality Control Script

## Overview

This script performs missing data quality control on GWAS (Genome-Wide Association Study) datasets. It filters out individuals and/or SNPs with excessive missing genotype data, which is a critical initial step in GWAS data analysis.

## Features

- **Dual Filtering**: Filter individuals and/or SNPs based on missing data rates
- **Flexible Thresholds**: User-defined missing data thresholds (default: 10% missing = 90% genotyping rate)
- **Comprehensive Reporting**: Detailed QC reports with statistics and removed items
- **Selective Filtering**: Option to filter only individuals or only SNPs
- **Robust Input Validation**: Handles various dataset formats and validates data integrity
- **Progress Tracking**: Verbose logging for large datasets
- **Multiple Output Formats**: Filtered CSV and detailed reports

## Installation

### Prerequisites

- Python 3.6 or higher
- Required packages (install via pip):

```bash
pip install pandas numpy
```

Or install from requirements file:

```bash
pip install -r requirements.txt
```

## Input Data Format

The script supports **individual genotype format**:

```csv
,rs12900938,rs12905389,rs6599770,rs7170864,...
8184,0,0,0,0,...
3543,0,0,0,0,...
8060,0,1,0,0,...
```

**Column Descriptions:**

- **First Column**: Individual IDs (can be any name)
- **Remaining Columns**: SNP genotypes where:
  - **0 = AA**: Homozygous reference
  - **1 = Aa**: Heterozygous
  - **2 = aa**: Homozygous alternate
  - **-1, 9, NaN**: Missing genotypes (automatically detected)

**Optional Phenotype Column:**

```csv
Individual_ID,rs001,rs002,rs003,phenotype
IND001,0,1,2,1
IND002,1,0,1,0
```

- **phenotype**: 1=case, 0=control (will be preserved in output)

## Usage

### Basic Usage

```bash
# Filter both individuals and SNPs with default 10% threshold
python missing_data_qc.py data.csv
```

### Advanced Usage

```bash
# Custom threshold (5% missing = 95% genotyping rate)
python missing_data_qc.py data.csv --threshold 0.05

# Only filter individuals, keep all SNPs
python missing_data_qc.py data.csv --no-filter-snps

# Only filter SNPs, keep all individuals
python missing_data_qc.py data.csv --no-filter-individuals

# Custom output files
python missing_data_qc.py data.csv --output clean_data.csv --report qc_report.txt

# With phenotype column
python missing_data_qc.py data.csv --phenotype-col disease_status

# Quiet mode for large datasets
python missing_data_qc.py large_dataset.csv --quiet
```

### Command Line Arguments

| Argument                  | Short | Type  | Default  | Description                                      |
| ------------------------- | ----- | ----- | -------- | ------------------------------------------------ |
| `input_file`              | -     | str   | Required | Input CSV file path (individual genotype format) |
| `--threshold`             | `-t`  | float | 0.10     | Missing data threshold (0.0-1.0)                 |
| `--no-filter-individuals` | -     | flag  | False    | Do not filter individuals                        |
| `--no-filter-snps`        | -     | flag  | False    | Do not filter SNPs                               |
| `--phenotype-col`         | -     | str   | None     | Phenotype column name (preserved in output)      |
| `--output`                | `-o`  | str   | Auto     | Output file path for filtered dataset            |
| `--report`                | `-r`  | str   | Auto     | Output file path for QC report                   |
| `--quiet`                 | `-q`  | flag  | False    | Suppress verbose output                          |

## Missing Data Threshold Guidelines

### Individual Filtering

- **Default (10% missing)**: Standard GWAS QC threshold
- **Strict (5% missing)**: For high-quality datasets
- **Lenient (20% missing)**: For datasets with known genotyping issues

### SNP Filtering

- **Default (10% missing)**: Standard GWAS QC threshold (90% genotyping rate)
- **Strict (5% missing)**: For high-quality datasets (95% genotyping rate)
- **Lenient (20% missing)**: For datasets with known genotyping issues (80% genotyping rate)

## Output Files

### Filtered Dataset

- **Format**: Same as input (CSV)
- **Content**: Individuals and SNPs that pass the missing data threshold
- **Naming**: `{input_filename}_missing_filtered.csv`

### QC Report

- **Format**: Text file
- **Content**:
  - Summary statistics
  - List of removed individuals with missing rates
  - List of removed SNPs with missing rates
  - Missing data statistics (mean, median, min, max, std)
- **Naming**: `{input_filename}_missing_report.txt`

## Example Output

```
Missing Data QC Summary:
  Original individuals: 471
  Filtered individuals: 471
  Removed individuals: 0
  Original SNPs: 3000
  Filtered SNPs: 3000
  Removed SNPs: 0
```

## Quality Control Workflow

This script is typically used as the **first step** in GWAS QC pipeline:

1. **Missing Data QC** (this script) - Remove individuals/SNPs with excessive missing data
2. **MAF QC** - Remove SNPs with low minor allele frequency
3. **HWE QC** - Remove SNPs that deviate from Hardy-Weinberg Equilibrium
4. **Other QC steps** - PCA, relatedness, etc.

## Notes

- Missing values are automatically detected as: `NaN`, `-1`, or `9`
- The script preserves phenotype columns if specified
- Both filtering operations can be performed independently
- The script is designed to work with large datasets efficiently

## Future Integration

This script is designed to be part of a modular QC pipeline:

- Can be chained with other QC methods (MAF, HWE, etc.)
- Returns standardized QC results format
- Supports batch processing capabilities
- Configurable via JSON/YAML config files
