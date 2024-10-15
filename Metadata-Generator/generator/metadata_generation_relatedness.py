import numpy as np
import pandas as pd
import random
import argparse

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
        selected_samples = np.random.choice(existing_samples, size=num_existing_samples_to_combine, replace=True).astype(str)
        synthetic_samples.append('_'.join(selected_samples))
    synthetic_data = pd.DataFrame()
    for synthetic_sample in synthetic_samples:
        selected_columns = synthetic_sample.split('_')
        synthetic_data[synthetic_sample] = data[selected_columns].apply(lambda x: np.random.choice(x), axis=1)
    augmented_data = pd.concat([data, synthetic_data], axis=1)
    return augmented_data

def main():
    # Parse command-line arguments
    parser = argparse.ArgumentParser(description="Read command-line arguments")
    parser.add_argument("input_csv", type=str, help="The path to the input CSV file")
    parser.add_argument("snp_file", type=str, help="The path to the SNP list file")
    parser.add_argument("output_file", type=str, help="The desired output file name")
    parser.add_argument("--seed", type=int, default=1234, help="Random seed for shuffle alignment")
    parser.add_argument("--eps", type=float, default=5, help="Noise parameter epsilon")
    parser.add_argument("--num_synthetic_samples", type=int, default=100, help="Number of synthetic samples to generate")
    parser.add_argument("--num_existing_samples_to_combine", type=int, default=3, help="Number of existing samples to combine for each synthetic sample")
    
    args = parser.parse_args()

    # Parameters
    seed = args.seed
    eps = args.eps
    num_synthetic_samples = args.num_synthetic_samples
    num_existing_samples_to_combine = args.num_existing_samples_to_combine
    input_csv = args.input_csv
    snp_file = args.snp_file
    output_filename = args.output_file  # Get the output file name from the argument

    # Read the SNP list from the file
    with open(snp_file, 'r') as file:
        snp_list = [line.strip() for line in file]
        
    # Load the dataset
    data = pd.read_csv(input_csv, sep=",", index_col=0).T
    data.columns = data.columns.astype(str)
    data = data.loc[snp_list]

    # Shuffle the data
    shuffled_data = shuffle_data(data, seed)

    # Add noise to the data
    noisy_data = add_noise(shuffled_data, eps)

    # Add synthetic samples to the data
    augmented_data = add_synthetic_samples(noisy_data, num_synthetic_samples, num_existing_samples_to_combine)

    # Transpose back the final data if needed
    augmented_data = augmented_data.T

    # Save the generated metadata to the specified output CSV
    augmented_data.to_csv(output_filename, index=True)

if __name__ == "__main__":
    main()
