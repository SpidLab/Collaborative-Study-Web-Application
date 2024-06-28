from email import parser
import numpy as np 
import pandas as pd
import itertools

def calculate_phi(df, user1, user2):
    n11 = np.logical_and(df[user1] == 1, df[user2] == 1).sum()
    n02 = np.logical_and(df[user1] == 0, df[user2] == 2).sum()
    n20 = np.logical_and(df[user1] == 2, df[user2] == 0).sum()
    n1_ = (df[user1] == 1).sum()
    n_1 = (df[user2] == 1).sum()

    if n1_ != 0:
        phi = (2 * n11 - 4 * (n02 + n20) - n_1 + n1_) / (4 * n1_)
    else:
        phi = -999

    return phi

def compute_coefficients_dictionary(df):
    threshold = 0.08  # used as a lower limit for second-degree related individuals
    userList = df.columns.to_list()
    coeff_dict = {}
    # the general dictionary that has the following stucture
    # {('10', '100000'): 0.25, ...}

    # Generate all possible pairs of column names
    column_pairs = list(itertools.permutations(userList, 2))
    cnt = 0
    # Compute coefficients for each column pair and add to dictionary if above threshold
    for first_user, second_user in column_pairs:
        phi_val_left = calculate_phi(df, str(first_user), str(second_user))
        phi_val_right = calculate_phi(df, str(second_user), str(first_user))
        phi_val = max(phi_val_left, phi_val_right)  # keeping the largest phi
        cnt+=1
        if phi_val > threshold:
            coeff_dict[(first_user, second_user)] = phi_val
    return coeff_dict

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