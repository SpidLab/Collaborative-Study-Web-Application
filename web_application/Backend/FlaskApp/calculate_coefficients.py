from email import parser
import numpy as np 
import pandas as pd
import itertools


def calculate_phi(row1, row2):
    # Logical operations to compute n11, n02, n20
    n11 = np.logical_and(row1 == 1, row2 == 1).sum()
    n02 = np.logical_and(row1 == 0, row2 == 2).sum()
    n20 = np.logical_and(row1 == 2, row2 == 0).sum()
    n1_ = (row1 == 1).sum()
    n_1 = (row2 == 1).sum()

    # Avoid division by zero
    if n1_ != 0:
        phi = (2 * n11 - 4 * (n02 + n20) - n_1 + n1_) / (4 * n1_)
    else:
        phi = -999  # Return a default value when the coefficient cannot be computed

    return phi


def compute_coefficients_array(df):
    coeff_array = []

    # Ensure the DataFrame has a multi-index
    if not isinstance(df.index, pd.MultiIndex):
        raise ValueError("The DataFrame must have a multi-index with 'sample_number' and 'user_id'.")

    # Generate row pairs using combinations of multi-index
    row_pairs = itertools.combinations(df.index, 2)

    for (sample1, user1), (sample2, user2) in row_pairs:
        # Extract rows corresponding to the pair
        row1 = df.loc[(sample1, user1)]
        row2 = df.loc[(sample2, user2)]

        # Calculate phi value between the two rows
        phi_val = calculate_phi(row1, row2)

        # Append results with both sample numbers and user IDs
        coeff_array.append({
            "sample1": sample1,
            "user1": user1,
            "sample2": sample2,
            "user2": user2,
            "phi_value": phi_val
        })

    return coeff_array


if __name__ == "__main__":
    #TODO Modify the code below to read from a list of csv files and merge them together
    print("sad")
    # Read the first CSV file
    first_half_data = pd.read_csv("first_dataset.csv", index_col=0)
    # Read the second CSV file
    second_half_data = pd.read_csv("second_dataset.csv", index_col=0)
    # Merge the DataFrames
    merged_data = pd.concat([first_half_data, second_half_data], axis=1)

    coeff_dict = compute_coefficients_array(merged_data)
    print(coeff_dict)