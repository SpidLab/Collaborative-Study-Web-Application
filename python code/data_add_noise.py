import numpy as np
import pandas as pd

def randomized_response(val, p, q):
    rand_val = np.random.uniform(0, 1, size=len(val))

    flip_zero = (val == 0) & (rand_val > p)
    flip_two = (val == 2) & (rand_val <= p)
    flip_one = (val == 1) & (rand_val > p + q)

    val = val.mask(flip_zero, 1)
    val = val.mask(flip_two, 1)
    val = val.mask(flip_one, 0)

    return val


if __name__ == "__main__":
    # Add noise
    eps = 5
    p = np.exp(eps) / (np.exp(eps) + 2)
    q = 1 / (np.exp(eps) + 2)

    # Read the data from CSV
    data = pd.read_csv("first_dataset.csv", sep=",", index_col=0)

    for column in data.columns:
        data[column] = randomized_response(data[column], p, q)

    # Save the noisy data to CSV
    data.to_csv('noisy_data_eps_' + str(eps) + '.csv', index=True)
