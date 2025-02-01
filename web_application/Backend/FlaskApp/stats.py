from scipy.stats import chi2_contingency

import numpy as np


def calc_chi_pvalue(snp_stats):
    """
    Calculate the p-value for GWAS SNPs using Chi-squared test.

    Args:
        snp_stats: A list of dictionaries, each containing SNP IDs as keys and 
                   contingency tables [[case counts (0, 1, 2)], [control counts (0, 1, 2)]] as values.

    Returns:
        gwas_result: A dictionary where keys are SNP IDs and values are the Chi-squared p-values.
    """
    gwas_result = {}

    # Loop through each SNP ID and calculate the chi-squared test
    for party_data in snp_stats:
        for snp_id, counts in party_data.items():
            print(f"Processing SNP: {snp_id}")

            # Aggregate contingency tables for the current SNP across all parties
            aggregated_table = np.zeros((2, 3))  # 2 rows (case, control), 3 columns (0, 1, 2)

            # Aggregate counts from the case and control data
            case_counts, control_counts = counts

            aggregated_table[0] = case_counts  # Set the case counts in the first row
            aggregated_table[1] = control_counts  # Set the control counts in the second row

            # Check if any expected frequency is less than 5
            chi2, p_value, dof, expected = chi2_contingency(aggregated_table)

            # Store the p-value in the result dictionary
            gwas_result[snp_id] = p_value
            print(gwas_result)

    return gwas_result

# # Example usage with mock data
# example_snp_stats = [
#     {"snp1": [[5, 2, 3], [2, 4, 4]], "snp2": [[10, 5, 1], [7, 8, 2]]},
#     {"snp1": [[3, 1, 2], [1, 3, 3]], "snp2": [[8, 3, 2], [5, 6, 1]]}
# ]
#
# # Run the function
# gwas_results = calc_chi_pvalue(example_snp_stats)
# gwas_results
