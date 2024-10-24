# Metadata-Generator
This tool generates privacy-preserving copies of genomic datasets by shuffling it, adding synthetic samples, and adding random response noises.

## Usage
Datasets are located in `../datasets`. We use `eye_color` as an example here. 
- `snp_list.txt` contains 200 SNPs sampled from the original dataset `Eye_color_original_3000_SNPs_chrm15.csv`. We use this smaller dataset for the prototype.
- `data.csv` is a cleansed version of `Eye_color_original_3000_SNPs_chrm15.csv` with only SNPs in the list above, where the ids of case and control samples are stored in `eye_color/case_ids.txt` and `eye_color/control_ids.txt`, respectively. 
- `data_party_a.csv` and `data_party_b.csv` are each party's data after equally splitting the entire one into 2.

To generate the noisy copies of the two datasets, run the below commands in the current directory:

```
python generator/metadata_generation_relatedness.py ../datasets/eye_color/data_party_a.csv ../datasets/eye_color/snp_list.txt ../datasets/eye_color/output_party_a.csv --seed 1234 --eps 5 --num_synthetic_samples 100 --num_existing_samples_to_combine 3

python generator/metadata_generation_relatedness.py ../datasets/eye_color/data_party_b.csv ../datasets/eye_color/snp_list.txt ../datasets/eye_color/output_party_b.csv --seed 1234 --eps 5 --num_synthetic_samples 100 --num_existing_samples_to_combine 3
```
This will generate the noisy copies of party A's and B's datasets as `output_party_a.csv` and `output_party_b.csv`. Both datasets will be stored in MongoDB and used in the QC part.