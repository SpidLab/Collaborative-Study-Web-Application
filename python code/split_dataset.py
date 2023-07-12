import pandas as pd

data = pd.read_csv("Eye_color_original_3000_SNPs_chrm15.csv", sep=",", index_col=0)

columns_to_drop = []
for column in data.columns:
    if any(letter.isalpha() for letter in column):
        columns_to_drop.append(column)

data = data.drop(columns=columns_to_drop)

num_columns = len(data.columns)
half_columns = num_columns // 2

first_half_columns = data.columns[:half_columns]
second_half_columns = data.columns[half_columns:]

first_half_data = data[first_half_columns]
second_half_data = data[second_half_columns]

# Exporting first half data to CSV
first_half_data.to_csv("first_dataset.csv", index=True)

# Exporting second half data to CSV
second_half_data.to_csv("second_dataset.csv", index=True)