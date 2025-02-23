from scipy.stats import chi2_contingency

import numpy as np


def calc_chi_pvalue(snp_stats):
    """
    Calculate the chi-square test statistic and p-value for GWAS SNPs.

    Args:
        snp_stats: A dictionary where keys are SNP IDs and values are
                   contingency tables [[case counts (0, 1, 2)], [control counts (0, 1, 2)]].

    Returns:
        gwas_result: A dictionary where keys are SNP IDs and values are (chi-square, p-value).
    """
    gwas_result = {}

    for snp_id, counts in snp_stats.items():
        print(f"Processing SNP: {snp_id}")

        aggregated_table = np.array(counts)  # Convert list to numpy array

        # Perform chi-square test
        chi2, p_value, _, _ = chi2_contingency(aggregated_table)

        gwas_result[snp_id] = {"chi_square": chi2, "p_value": p_value}

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
