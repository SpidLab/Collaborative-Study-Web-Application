from email import parser
import numpy as np 
import pandas as pd
import itertools

def calculate_phi(df, user1, user2):
    # Accessing the rows (people) by index
    n11 = np.logical_and(df.loc[user1] == 1, df.loc[user2] == 1).sum()
    n02 = np.logical_and(df.loc[user1] == 0, df.loc[user2] == 2).sum()
    n20 = np.logical_and(df.loc[user1] == 2, df.loc[user2] == 0).sum()
    n1_ = (df.loc[user1] == 1).sum()
    n_1 = (df.loc[user2] == 1).sum()

    # Avoid division by zero
    if n1_ != 0:
        phi = (2 * n11 - 4 * (n02 + n20) - n_1 + n1_) / (4 * n1_)
    else:
        phi = -999  # Return a default value when the coefficient cannot be computed

    return phi


def compute_coefficients_array(df):
    # Get the list of row indices (people)
    people_list = df.index.to_list()

    coeff_array = []

    # Generate all possible pairs of people (rows)
    row_pairs = itertools.permutations(people_list, 2)

    # Compute coefficients for each pair of people
    for person1, person2 in row_pairs:
        # Calculate the phi coefficient for the pair of people
        phi_val = calculate_phi(df, person1, person2)

        # Store the pair and coefficient regardless of threshold
        coeff_array.append([person1, person2, phi_val])  # Store as [person1, person2, coefficient]

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

    coeff_dict = compute_coefficients_dictionary(merged_data)
    print(coeff_dict)