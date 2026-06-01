# Hardy-Weinberg Equilibrium (HWE) Quality Control Script

## Overview

This script performs Hardy-Weinberg Equilibrium (HWE) quality control on GWAS (Genome-Wide Association Study) datasets. It filters out SNPs (Single Nucleotide Polymorphisms) that deviate significantly from HWE, which can indicate genotyping errors, population stratification, or other data quality issues.

**Important**: This is a **pre-submission QC method** that researchers run on their **raw individual data** before submitting to collaborative analysis. HWE is NOT an alternative to the chi-square association test - it's a quality control step that filters out problematic SNPs before collaborative analysis.

## Features

- **Chi-square and Exact Tests**: Choose between chi-square test (default) or exact test for small samples
- **Population Selection**: Test HWE in controls, cases, combined, or both separately
- **Flexible P-value Thresholds**: User-defined thresholds from 1e-10 to 1.0 (default: 1e-6)
- **Comprehensive Reporting**: Detailed HWE reports with statistics and removed SNPs
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

## What is Hardy-Weinberg Equilibrium?

Hardy-Weinberg Equilibrium (HWE) is a principle in population genetics that describes the relationship between allele and genotype frequencies in a population. Under HWE, if no evolutionary forces are acting, genotype frequencies remain constant from generation to generation.

### Expected Genotype Frequencies

For a biallelic SNP with alleles A (frequency = p) and a (frequency = q, where q = 1 - p):

- **AA (homozygous reference)**: p²
- **Aa (heterozygous)**: 2pq
- **aa (homozygous alternate)**: q²

### Deviations from HWE

Deviations from HWE can indicate:

- **Genotyping errors**: Systematic errors in genotype calling
- **Population stratification**: Mixing of different populations
- **Selection pressures**: Natural selection affecting the locus
- **Non-random mating**: Assortative mating or inbreeding
- **Disease association**: In cases, disease-associated variants may deviate from HWE

### Why Test HWE in Controls?

In GWAS, HWE is typically tested in **controls only** because:

1. Disease-associated variants may naturally deviate from HWE in cases
2. Controls represent the general population
3. HWE deviations in controls more likely indicate data quality issues
4. This is the standard practice in GWAS quality control

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

- **phenotype**: 1=case, 0=control (for population-specific HWE testing)

## Usage

### Basic Usage

```bash
# Auto-detects format and uses default settings (combined population, threshold 1e-6)
python hardy_weinberg_qc.py your_data.csv
```

### Recommended Usage (Controls-Only Testing)

```bash
# Test HWE in controls only (recommended for GWAS)
python hardy_weinberg_qc.py data.csv --population controls --threshold 1e-6 --phenotype-col disease_status
```

### Advanced Usage

```bash
# Combined population testing (when no phenotype available)
python hardy_weinberg_qc.py data.csv --population combined --threshold 1e-6

# Test in both cases and controls separately
python hardy_weinberg_qc.py data.csv --population both --threshold 1e-4 --phenotype-col phenotype

# Use exact test for small samples
python hardy_weinberg_qc.py data.csv --method exact --threshold 1e-6

# Aggregated format with controls-only testing
python hardy_weinberg_qc.py aggregated_data.csv --population controls --threshold 1e-6

# Custom output files
python hardy_weinberg_qc.py data.csv --output filtered_data.csv --report hwe_report.txt

# Quiet mode for large datasets
python hardy_weinberg_qc.py large_dataset.csv --quiet
```

### Command Line Arguments

| Argument          | Short | Type  | Default  | Description                                       |
| ----------------- | ----- | ----- | -------- | ------------------------------------------------- |
| `input_file`      | -     | str   | Required | Input CSV file path (auto-detects format)         |
| `--threshold`     | `-t`  | float | 1e-6     | HWE p-value threshold (1e-10 to 1.0)              |
| `--population`    | `-p`  | str   | combined | Population to test (controls/cases/combined/both) |
| `--method`        | `-m`  | str   | chi2     | Test method (chi2 or exact)                       |
| `--phenotype-col` | -     | str   | None     | Phenotype column name (for individual format)     |
| `--output`        | `-o`  | str   | Auto     | Output file path for filtered dataset             |
| `--report`        | `-r`  | str   | Auto     | Output file path for HWE report                   |
| `--quiet`         | `-q`  | flag  | False    | Suppress verbose output                           |

## Population Selection

### Controls Only (Recommended for GWAS)

Test HWE in controls only to avoid disease-related deviations:

```bash
python hardy_weinberg_qc.py data.csv --population controls --phenotype-col disease_status
```

**Why**: Controls represent the general population. HWE deviations in controls more likely indicate data quality issues rather than biological effects.

### Cases Only

Test HWE in cases only (less common):

```bash
python hardy_weinberg_qc.py data.csv --population cases --phenotype-col disease_status
```

**Note**: Disease-associated variants may naturally deviate from HWE in cases, so this is less informative for QC.

### Combined (Default)

Test HWE using all individuals together:

```bash
python hardy_weinberg_qc.py data.csv --population combined
```

**When to use**: When no phenotype information is available, or when you want to test the overall population.

### Both Separate

Test HWE separately in cases and controls:

```bash
python hardy_weinberg_qc.py data.csv --population both --phenotype-col disease_status
```

**When to use**: When you want to compare HWE between cases and controls, or ensure quality in both groups.

## HWE Test Methods

### Chi-Square Test (Default)

- **Formula**: χ² = Σ((Observed - Expected)² / Expected)
- **Degrees of freedom**: 1
- **When to use**: Standard approach for large sample sizes (n > 100)
- **Advantages**: Fast, computationally efficient
- **Limitations**: Less accurate for small samples or when expected counts < 5

### Exact Test

- **When to use**: Small sample sizes or when expected counts < 5
- **Advantages**: More accurate for small samples
- **Limitations**: More computationally intensive

**Note**: The current implementation uses a chi-square approximation for the exact test. For very small samples, consider using specialized HWE exact test software.

## Output Files

### 1. Filtered Dataset

- **File**: `{input_name}_hwe_filtered.csv` (or custom name)
- **Format**: Same as input, with failing SNPs removed
- **Content**: Only SNPs that pass the HWE p-value threshold

### 2. HWE Report

- **File**: `{input_name}_hwe_report.txt` (or custom name)
- **Content**:
  - Analysis parameters (method, population, threshold)
  - Summary statistics
  - Detailed HWE test results for each SNP
  - List of removed SNPs with p-values

## Example Output

### Console Output

```
2024-01-15 10:30:15 - INFO - Reading input file: data.csv
2024-01-15 10:30:15 - INFO - Detected format: individual
2024-01-15 10:30:15 - INFO - Individual format validation passed: 1000 individuals, 5000 SNP columns
2024-01-15 10:30:16 - INFO - Testing HWE for 5000 SNPs...
2024-01-15 10:30:20 - INFO - Filtered 5000 SNPs to 4875 SNPs
2024-01-15 10:30:20 - INFO - Removed 125 SNPs with HWE p-value < 1.00e-06
2024-01-15 10:30:20 - INFO - Filtered dataset saved to: data_hwe_filtered.csv
2024-01-15 10:30:20 - INFO - HWE report written to data_hwe_report.txt

HWE QC Summary:
  Original SNPs: 5000
  Filtered SNPs: 4875
  Removed SNPs: 125
  Removal rate: 2.50%
```

### HWE Report Sample

```
================================================================================
Hardy-Weinberg Equilibrium Quality Control Report
================================================================================
Generated: 2024-01-15 10:30:20
Method: chi2
Population: controls
HWE p-value threshold: 1.00e-06

Summary Statistics
--------------------------------------------------------------------------------
Total SNPs tested: 5000
SNPs removed: 125
SNPs passing: 4875
Removal rate: 2.50%

Detailed HWE Test Results
--------------------------------------------------------------------------------
SNP_ID          Population  P_value    Chi2_stat  P_allele_freq  Q_allele_freq  ...
rs12900938      controls    0.5234     0.4123     0.8234         0.1766         ...
rs12905389      controls    2.34e-07   25.6789    0.6543         0.3457         ...
...
```

## Quality Control Guidelines

### Recommended HWE P-value Thresholds

| Study Type          | Threshold | Rationale                                  |
| ------------------- | --------- | ------------------------------------------ |
| Standard GWAS       | 1e-6      | Very strict, removes most problematic SNPs |
| Moderate QC         | 1e-4      | Balanced approach                          |
| Lenient QC          | 0.05      | Removes only severe deviations             |
| Population-specific | 1e-5      | Adjust based on population characteristics |

### Standard GWAS Practice

- **Threshold**: p < 1e-6 (very strict)
- **Population**: Controls only (recommended)
- **Method**: Chi-square test (default)
- **Rationale**: Remove SNPs with genotyping errors or population stratification

### When to Use Different Thresholds

- **1e-6 (Very Strict)**: Standard for large GWAS studies
- **1e-4 (Moderate)**: When you want to be less aggressive in filtering
- **0.05 (Lenient)**: When sample size is small or you want to retain more SNPs

## Integration with Collaborative Study Application

This script is designed as a **pre-submission QC method**:

1. **Researchers run HWE QC** on their raw individual data before submission
2. **Filtered data** is then submitted to the collaborative platform
3. **Collaborative analysis** (chi-square association test) runs on cleaned, aggregated data

### Workflow

```
Raw Individual Data → HWE QC → Cleaned Data → Submit to Collaboration → Chi-square Association Test
```

### Future Integration

The script is designed to be integrated into a QC pipeline that can chain multiple QC methods:

- MAF QC → HWE QC → PCA → Sample Relatedness → Submit

## Error Handling

The script includes comprehensive error handling for:

- **File not found**: Clear error message with file path
- **Invalid format**: Detailed validation of required columns
- **Invalid thresholds**: Range validation (1e-10 to 1.0)
- **Invalid populations**: Must be 'controls', 'cases', 'combined', or 'both'
- **Invalid methods**: Must be 'chi2' or 'exact'
- **Data integrity**: Checks for negative values and non-numeric data
- **Missing phenotype**: Automatic fallback to 'combined' when phenotype column missing

## Performance Considerations

- **Memory Usage**: Loads entire dataset into memory (suitable for typical GWAS files)
- **Processing Speed**: ~1000 SNPs per second on standard hardware
- **Large Files**: Use `--quiet` flag for files >10,000 SNPs to reduce log output
- **Parallel Processing**: Future versions may include multiprocessing support

## Troubleshooting

### Common Issues

1. **"Missing required column"**

   - Ensure CSV has SNP_ID, Case_0/1/2, Control_0/1/2 columns (aggregated format)
   - Or ensure first column is ID and remaining are SNP columns (individual format)
   - Check for typos in column names

2. **"Column contains negative values"**

   - All genotype counts must be non-negative integers
   - Check for data entry errors

3. **"HWE p-value threshold must be between 1e-10 and 1.0"**

   - Use reasonable threshold values
   - 1e-6 is standard for most GWAS studies

4. **"Population 'controls' requested but no phenotype column provided"**

   - Provide phenotype column with `--phenotype-col` argument
   - Or switch to 'combined' population mode

5. **Memory errors with large files**
   - Process files in chunks if >100,000 SNPs
   - Use more powerful hardware or cloud computing

### Getting Help

For issues or questions:

1. Check this documentation
2. Verify input data format
3. Test with smaller sample files
4. Contact the development team

## Mathematical Details

### Allele Frequency Calculation

For genotype counts [AA, Aa, aa]:

```
p = (2 × AA + Aa) / (2 × Total_Individuals)  # Reference allele frequency
q = (2 × aa + Aa) / (2 × Total_Individuals)  # Alternate allele frequency
```

### Expected Genotype Frequencies

Under HWE:

```
Expected_AA = Total × p²
Expected_Aa = Total × 2pq
Expected_aa = Total × q²
```

### Chi-Square Statistic

```
χ² = Σ((Observed_i - Expected_i)² / Expected_i)
```

Degrees of freedom = 1 (3 genotypes - 1 - 1 estimated parameter)

## License

This script is part of the Collaborative Study Web Application project.

## Version History

- **v1.0**: Initial implementation with chi-square test and population selection
- Current version includes comprehensive reporting and validation

## References

1. Hardy, G. H. (1908). Mendelian proportions in a mixed population. Science, 28(706), 49-50.
2. Weinberg, W. (1908). Über den Nachweis der Vererbung beim Menschen. Jahreshefte des Vereins für vaterländische Naturkunde in Württemberg, 64, 368-382.
3. Wigginton, J. E., Cutler, D. J., & Abecasis, G. R. (2005). A note on exact tests of Hardy-Weinberg equilibrium. The American Journal of Human Genetics, 76(5), 887-893.
