from scipy.stats import chi2_contingency
from concurrent.futures import ProcessPoolExecutor, as_completed
import numpy as np

from concurrent.futures import ProcessPoolExecutor, as_completed
import numpy as np
from scipy.stats import chi2_contingency


def calc_chi_pvalue_for_snp(snp_id, counts):
    """
    Calculate the chi-square test statistic and p-value for a single SNP.

    Args:
        snp_id: SNP ID.
        counts: Contingency table [[case counts (0, 1, 2)], [control counts (0, 1, 2)]].

    Returns:
        Tuple containing SNP ID and its chi-square result (chi-square, p-value).
    """
    try:
        aggregated_table = np.array(counts)  # Convert list to numpy array

        chi2, p_value, _, _ = chi2_contingency(aggregated_table)

    except Exception as e:
        return snp_id, {"chi_square": None, "p_value": None}

    return snp_id, {"chi_square": chi2, "p_value": p_value}


def calc_chi_pvalue(snp_stats):
    """
    Calculate the chi-square test statistic and p-value for GWAS SNPs using multiprocessing.

    Args:
        snp_stats: A dictionary where keys are SNP IDs and values are
                   contingency tables [[case counts (0, 1, 2)], [control counts (0, 1, 2)]].

    Returns:
        gwas_result: A dictionary where keys are SNP IDs and values are (chi-square, p-value).
    """
    gwas_result = {}

    with ProcessPoolExecutor() as executor:
        future_to_snp = {
            executor.submit(calc_chi_pvalue_for_snp, snp_id, counts): snp_id
            for snp_id, counts in snp_stats.items()
        }

        for future in as_completed(future_to_snp):
            try:
                snp_id, result = future.result()
                gwas_result[snp_id] = result
            except Exception as e:
                pass

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
