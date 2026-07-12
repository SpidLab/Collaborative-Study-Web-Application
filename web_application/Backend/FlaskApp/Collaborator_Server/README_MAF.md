# Minor Allele Frequency (MAF) Quality Control Script

## Overview

This script performs Minor Allele Frequency (MAF) based quality control on GWAS (Genome-Wide Association Study) datasets. It filters out SNPs (Single Nucleotide Polymorphisms) that don't meet specified MAF thresholds and provides comprehensive reporting.

## Features

- **Flexible MAF Thresholds**: User-defined thresholds from 0.001 to 0.5
- **Multiple Calculation Methods**: Combined (cases+controls) or separate calculations
- **Comprehensive Reporting**: Detailed QC reports with statistics and removed SNPs
- **Robust Input Validation**: Handles various dataset formats and validates data integrity
- **Progress Tracking**: Verbose logging for large datasets
- **Multiple Output Formats**: Filtered CSV and detailed reports

## Installation

### Prerequisites

- Python 3.6 or higher
- Required packages (install via pip):

```bash
pip install pandas numpy scipy
```

Or install from requirements file:

```bash
pip install -r requirements.txt
```

## Input Data Formats

The script **automatically detects** and supports two data formats:

### Format 1: Aggregated Counts (Case/Control Summary)

```csv
SNP_ID,Case_0,Case_1,Case_2,Control_0,Control_1,Control_2
snp_001,5,10,15,8,12,10
snp_002,3,7,12,6,9,8
```

**Column Descriptions:**

- **SNP_ID**: Unique identifier for each SNP
- **Case_0**: Count of cases with genotype AA (homozygous reference)
- **Case_1**: Count of cases with genotype Aa (heterozygous)
- **Case_2**: Count of cases with genotype aa (homozygous alternate)
- **Control_0**: Count of controls with genotype AA
- **Control_1**: Count of controls with genotype Aa
- **Control_2**: Count of controls with genotype aa

### Format 2: Individual Genotypes (Raw Data)

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
  - **-1, 9, NaN**: Missing genotypes (automatically handled)

**Optional Phenotype Column:**

```csv
Individual_ID,rs001,rs002,rs003,phenotype
IND001,0,1,2,1
IND002,1,0,1,0
```

- **phenotype**: 1=case, 0=control (for separate MAF calculation)

## Usage

### Basic Usage

```bash
# Auto-detects format and uses default settings
python minor_allele_freq.py your_data.csv
```

### Advanced Usage

```bash
# Aggregated format with custom threshold
python minor_allele_freq.py aggregated_data.csv --threshold 0.01

# Individual format with phenotype-based separate analysis
python minor_allele_freq.py individual_data.csv --phenotype-col disease_status --method separate

# Specify custom output file
python minor_allele_freq.py data.csv --output filtered_data.csv --threshold 0.1

# Quiet mode for large datasets
python minor_allele_freq.py large_dataset.csv --quiet

# Complete example with all options
python minor_allele_freq.py gwas_data.csv --threshold 0.05 --method combined --output clean_data.csv

# Real-world example with your data format
python minor_allele_freq.py data_party_a.csv --threshold 0.05 --method combined
```

### Command Line Arguments

| Argument          | Short | Type  | Default  | Description                               |
| ----------------- | ----- | ----- | -------- | ----------------------------------------- |
| `input_file`      | -     | str   | Required | Input CSV file path (auto-detects format) |
| `--threshold`     | `-t`  | float | 0.05     | MAF threshold (0.001-0.5)                 |
| `--method`        | `-m`  | str   | combined | Calculation method                        |
| `--output`        | `-o`  | str   | Auto     | Output file path                          |
| `--phenotype-col` | `-p`  | str   | None     | Phenotype column (individual format)      |
| `--quiet`         | `-q`  | flag  | False    | Suppress verbose output                   |

## MAF Calculation Methods

### Combined Method (Default)

Calculates MAF using all samples (cases + controls combined):

```
Total AA = Case_AA + Control_AA
Total Aa = Case_Aa + Control_Aa
Total aa = Case_aa + Control_aa

Reference_Freq = (2×AA + Aa) / (2×Total_Samples)
Alternate_Freq = (2×aa + Aa) / (2×Total_Samples)

MAF = min(Reference_Freq, Alternate_Freq)
```

**Filter Rule**: Remove SNP if MAF < threshold

### Separate Method

Calculates MAF separately for cases and controls:

```
Case_MAF = calculated using only case samples
Control_MAF = calculated using only control samples
```

**Filter Rule**: Remove SNP if either Case_MAF < threshold OR Control_MAF < threshold

## Output Files

### 1. Filtered Dataset

- **File**: `{input_name}_maf_filtered.csv` (or custom name)
- **Format**: Same as input, with failing SNPs removed
- **Content**: Only SNPs that pass the MAF threshold

### 2. QC Report

- **File**: `maf_qc_report.txt`
- **Content**:
  - Analysis parameters
  - Summary statistics
  - MAF distribution
  - List of removed SNPs (first 50)

### 3. Removed SNPs List

- **File**: `removed_snps.csv`
- **Content**: Detailed list of all removed SNPs with their MAF values

## Example Output

### Console Output

```
2024-01-15 10:30:15 - INFO - Loaded dataset: gwas_data.csv (1000 SNPs)
2024-01-15 10:30:15 - INFO - Input validation passed: 1000 SNPs, 3 case columns, 3 control columns
2024-01-15 10:30:16 - INFO - Starting MAF filtering with threshold 0.05 using combined method
2024-01-15 10:30:17 - INFO - Filtering complete: 847/1000 SNPs passed MAF threshold
2024-01-15 10:30:17 - INFO - Filtered dataset saved to: gwas_data_maf_filtered.csv
2024-01-15 10:30:17 - INFO - QC report saved to: maf_qc_report.txt

==================================================
MAF QUALITY CONTROL SUMMARY
==================================================
Original SNPs: 1,000
Filtered SNPs: 847
Removed SNPs: 153
Pass Rate: 84.70%
Threshold: 0.05
Method: combined
==================================================
```

### QC Report Sample

```
============================================================
MINOR ALLELE FREQUENCY QUALITY CONTROL REPORT
============================================================

Analysis Date: 2024-01-15 10:30:17
MAF Threshold: 0.05
Calculation Method: combined

SUMMARY STATISTICS
------------------------------
Original SNP Count: 1,000
Filtered SNP Count: 847
Removed SNP Count: 153
Pass Rate: 84.70%

MAF DISTRIBUTION
------------------------------
Mean MAF: 0.2341
Median MAF: 0.2156
Min MAF: 0.0001
Max MAF: 0.5000

REMOVED SNPs
------------------------------
snp_045: MAF = 0.0234
snp_123: MAF = 0.0156
snp_234: MAF = 0.0445
...
```

## Quality Control Guidelines

### Recommended MAF Thresholds

| Study Type          | Threshold | Rationale              |
| ------------------- | --------- | ---------------------- |
| Common Variants     | 0.05      | Standard for GWAS      |
| Rare Variants       | 0.01      | Include rarer variants |
| Very Rare           | 0.001     | Specialized studies    |
| Population-specific | 0.02-0.1  | Depends on population  |

### Method Selection

- **Combined**: Use when sample sizes are similar between cases/controls
- **Separate**: Use when you want to ensure adequate representation in both groups

## Error Handling

The script includes comprehensive error handling for:

- **File not found**: Clear error message with file path
- **Invalid format**: Detailed validation of required columns
- **Invalid thresholds**: Range validation (0.001-0.5)
- **Invalid methods**: Must be 'combined' or 'separate'
- **Data integrity**: Checks for negative values and non-numeric data

## Performance Considerations

- **Memory Usage**: Loads entire dataset into memory (suitable for typical GWAS files)
- **Processing Speed**: ~1000 SNPs per second on standard hardware
- **Large Files**: Use `--quiet` flag for files >10,000 SNPs to reduce log output

## Integration with Collaborative Study Application

This script can be used as:

1. **Preprocessing Step**: Clean datasets before uploading to collaboration
2. **Standalone QC**: Independent quality control analysis
3. **Batch Processing**: Process multiple files with shell scripts

## Troubleshooting

### Common Issues

1. **"Missing required column"**

   - Ensure CSV has SNP_ID, Case_0/1/2, Control_0/1/2 columns
   - Check for typos in column names

2. **"Column contains negative values"**

   - All genotype counts must be non-negative integers
   - Check for data entry errors

3. **"MAF threshold must be between 0.001 and 0.5"**

   - Use reasonable threshold values
   - 0.05 is standard for most GWAS studies

4. **Memory errors with large files**
   - Process files in chunks if >100,000 SNPs
   - Use more powerful hardware or cloud computing

### Getting Help

For issues or questions:

1. Check this documentation
2. Verify input data format
3. Test with smaller sample files
4. Contact the development team

## License

This script is part of the Collaborative Study Web Application project.

## Version History

- **v1.0**: Initial implementation with basic MAF filtering
- Current version includes comprehensive reporting and validation
