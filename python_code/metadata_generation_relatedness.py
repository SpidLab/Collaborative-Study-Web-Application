import numpy as np
import pandas as pd
import random

def randomized_response(val, p, q):
    rand_val = np.random.uniform(0, 1, size=len(val))

    flip_zero = (val == 0) & (rand_val > p)
    flip_two = (val == 2) & (rand_val <= p)
    flip_one = (val == 1) & (rand_val > p + q)

    val = val.mask(flip_zero, 1)
    val = val.mask(flip_two, 1)
    val = val.mask(flip_one, 0)

    return val

def shuffle_data(data, seed):
    num_rows = len(data)
    rng = np.random.default_rng(seed)
    permutation = rng.permutation(num_rows)
    shuffled_data = data.iloc[permutation]
    return shuffled_data

def add_noise(data, eps):
    p = np.exp(eps) / (np.exp(eps) + 2)
    q = 1 / (np.exp(eps) + 2)
    for column in data.columns:
        data[column] = randomized_response(data[column], p, q)
    return data

def add_synthetic_samples(data, num_synthetic_samples, num_existing_samples_to_combine):
    existing_samples = data.columns.tolist()
    synthetic_samples = []
    for _ in range(num_synthetic_samples):
        selected_samples = np.random.choice(existing_samples, size=num_existing_samples_to_combine, replace=True)
        synthetic_samples.append('_'.join(selected_samples))
    synthetic_data = pd.DataFrame()
    for synthetic_sample in synthetic_samples:
        selected_columns = synthetic_sample.split('_')
        synthetic_data[synthetic_sample] = data[selected_columns].apply(lambda x: np.random.choice(x), axis=1)
    augmented_data = pd.concat([data, synthetic_data], axis=1)
    return augmented_data

if __name__ == "__main__":
    # Parameters
    seed = 1234
    eps = 5
    num_synthetic_samples = 100
    num_existing_samples_to_combine = 3

    # Read the data from CSV
    data = pd.read_csv("first_dataset.csv", sep=",", index_col=0)

    # TODO: The following two lines will be replaced by inputting SNPlist from the provided arguments
    row_names = data.index.tolist()
    SNPlist = random.sample(row_names, k=100)

    data = data.loc[SNPlist]

    # Shuffle the data
    shuffled_data = shuffle_data(data, seed)

    # Add noise to the data
    noisy_data = add_noise(shuffled_data, eps)

    # Add synthetic samples to the data
    augmented_data = add_synthetic_samples(noisy_data, num_synthetic_samples, num_existing_samples_to_combine)

    # Save the generated metadata to CSV
    augmented_data.to_csv('metadata_eps_' + str(eps) + '.csv', index=True)
