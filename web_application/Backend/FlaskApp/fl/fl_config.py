"""Shared constants for the federated-learning pipeline."""
from pathlib import Path

# Directory layout
REPO_ROOT = Path(__file__).resolve().parents[4]
FL_DATA_DIR = REPO_ROOT / "datasets" / "fl_synpop"
FL_MODELS_DIR = Path(__file__).resolve().parent / "models"

# Public PCA artifacts (trained once on held-out reference data)
PUBLIC_PCA_PATH = FL_MODELS_DIR / "public_pca.pkl"
PUBLIC_SCALER_PATH = FL_MODELS_DIR / "public_scaler.pkl"
PUBLIC_FEATURE_LIST_PATH = FL_MODELS_DIR / "public_feature_list.json"

# Per-site prepared splits
SITE_DATA_PATTERN = "site_{idx}_data.csv"
SITE_LABELS_PATTERN = "site_{idx}_labels.csv"
REFERENCE_DATA_PATH = FL_DATA_DIR / "public_pca_reference.csv"
REFERENCE_LABELS_PATH = FL_DATA_DIR / "public_pca_reference_labels.csv"
SPLIT_MANIFEST_PATH = FL_DATA_DIR / "split_manifest.json"

# 1000 Genomes population → super-population mapping (standard mapping).
# Synpop labels use descriptive strings; this table is robust to either the
# descriptive form or the 3-letter population code.
SUPER_POPULATION = {
    # European
    "British in England and Scotland": "EUR",
    "Finnish in Finland": "EUR",
    "Toscani in Italy": "EUR",
    "Iberian populations in Spain": "EUR",
    "Utah residents (CEPH) with Northern and Western European ancestry": "EUR",
    # African
    "Yoruba in Ibadan, Nigeria": "AFR",
    "Luhya in Webuye, Kenya": "AFR",
    "Gambian in Western Division, The Gambia - Mandinka": "AFR",
    "Mende in Sierra Leone": "AFR",
    "Esan in Nigeria": "AFR",
    "African Caribbean in Barbados": "AFR",
    "African Ancestry in Southwest US": "AFR",
    # East Asian
    "Han Chinese in Beijing, China": "EAS",
    "Han Chinese South": "EAS",
    "Chinese Dai in Xishuangbanna, China": "EAS",
    "Kinh in Ho Chi Minh City, Vietnam": "EAS",
    "Japanese in Tokyo, Japan": "EAS",
    # South Asian
    "Gujarati Indians in Houston, TX": "SAS",
    "Punjabi in Lahore, Pakistan": "SAS",
    "Bengali in Bangladesh": "SAS",
    "Sri Lankan Tamil in the UK": "SAS",
    "Indian Telugu in the UK": "SAS",
    # Ad Mixed American
    "Mexican Ancestry in Los Angeles, California": "AMR",
    "Puerto Rican in Puerto Rico": "AMR",
    "Colombian in Medellin, Colombia": "AMR",
    "Peruvian in Lima, Peru": "AMR",
}

SUPER_POPULATIONS = ["EUR", "AFR", "EAS", "SAS", "AMR"]

# Phenotype name used for the synpop demo. Collaborators with this phenotype
# are routed through the FL pipeline when "Federated Learning" is selected.
FL_DEFAULT_PHENOTYPE = "SuperPopulation"

# Pipeline defaults (user-overridable from the UI).
DEFAULT_PCA_COMPONENTS = 20
DEFAULT_EPSILON = 3.0          # LDP budget for PCA projections
DEFAULT_EMD_THRESHOLD = 1.0    # EMD <= threshold → compatible
DEFAULT_FL_ROUNDS = 5
DEFAULT_LOCAL_EPOCHS = 2
DEFAULT_BATCH_SIZE = 32
DEFAULT_LEARNING_RATE = 1e-3
DEFAULT_NUM_SITES = 5
DEFAULT_REFERENCE_FRACTION = 0.2  # fraction held out for public PCA training
