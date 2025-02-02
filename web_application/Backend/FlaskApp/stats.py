from scipy.stats import chi2_contingency

import numpy as np


def calc_chi_pvalue(snp_stats):
    """
    Calculate the chi-square test statistic and p-value for GWAS SNPs.

    Args:
        snp_stats: A list of dictionaries, each containing SNP IDs as keys and
                   contingency tables [[case counts (0, 1, 2)], [control counts (0, 1, 2)]] as values.

    Returns:
        gwas_result: A dictionary where keys are SNP IDs and values are (chi-square, p-value).
    """
    gwas_result = {}

    for party_data in snp_stats:
        for snp_id, counts in party_data.items():
            print(f"Processing SNP: {snp_id}")

            aggregated_table = np.zeros((2, 3))  # 2 rows (case, control), 3 columns (0, 1, 2)

            case_counts, control_counts = counts
            aggregated_table[0] = case_counts
            aggregated_table[1] = control_counts

            chi2, p_value, _, _ = chi2_contingency(aggregated_table)

            gwas_result[snp_id] = (chi2, p_value)

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
