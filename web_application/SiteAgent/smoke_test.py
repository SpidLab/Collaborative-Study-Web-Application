#!/usr/bin/env python3
"""
End-to-end smoke test for the new local-agent architecture.

It exercises the WHOLE loop except the browser UI and Docker packaging:
  register -> login -> register dataset metadata -> create a collaboration ->
  enqueue a chained_qc job -> enroll an agent -> the agent polls, runs QC
  LOCALLY, posts results -> verify the server stored them -> repeat for GWAS.

Run it from the SiteAgent folder, against a RUNNING backend + MongoDB:

    pip install -r requirements.txt pymongo requests
    export SERVER_URL=http://localhost:5000
    export MONGO_URI="mongodb://localhost:27017"     # same DB the backend uses
    export MONGO_DB=test
    python smoke_test.py

Exit code 0 = everything passed.
"""
import gzip
import json
import os
import random
import string
import sys
import time

import requests
import pandas as pd
from pymongo import MongoClient

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import data_loader  # noqa: E402
import actions  # noqa: E402
from jobs_client import JobsClient  # noqa: E402

SERVER = os.environ.get("SERVER_URL", "http://localhost:5000").rstrip("/")
MONGO_URI = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB = os.environ.get("MONGO_DB", "test")
MODELS_DIR = os.path.join(HERE, "models")
PHENO = "smoke_pheno"

OK, FAIL = "\033[32m✓\033[0m", "\033[31m✗\033[0m"
passed = 0


def step(msg, cond, detail=""):
    global passed
    mark = OK if cond else FAIL
    print(f"  {mark} {msg}" + (f"  ({detail})" if detail else ""))
    if not cond:
        print("\nFAILED. Aborting.")
        sys.exit(1)
    passed += 1


def make_synthetic_dataset(path, n_samples=40, n_snps=12):
    """A tiny dataset: sample_id index, a phenotype (0/1) column, and SNP columns (0/1/2)."""
    rng = random.Random(42)
    rows = {}
    for i in range(n_samples):
        rec = {"phenotype": i % 2}  # half cases, half controls
        for s in range(n_snps):
            rec[f"SNP_{s}"] = rng.choice([0, 0, 1, 1, 2])
        rows[f"S{i}"] = rec
    df = pd.DataFrame.from_dict(rows, orient="index")
    df.index.name = "sample_id"
    df.to_csv(path)
    return df


def main():
    print(f"Backend: {SERVER}   Mongo: {MONGO_URI}/{MONGO_DB}\n")
    db = MongoClient(MONGO_URI)[MONGO_DB]

    data_dir = os.path.join(HERE, ".smoke_data")
    os.makedirs(data_dir, exist_ok=True)
    df = make_synthetic_dataset(os.path.join(data_dir, f"{PHENO}.csv"))
    print(f"Synthetic dataset: {df.shape[0]} samples x {df.shape[1]} cols at {data_dir}/{PHENO}.csv\n")

    suffix = "".join(random.choices(string.ascii_lowercase, k=6))
    email = f"smoke_{suffix}@example.com"
    pw = "SmokeTest123!"

    print("1) Account + auth")
    r = requests.post(f"{SERVER}/api/register", json={"name": f"Smoke {suffix}", "email": email, "password": pw})
    step("register", r.status_code in (200, 201), f"HTTP {r.status_code}")
    r = requests.post(f"{SERVER}/api/login", json={"email": email, "password": pw})
    step("login", r.status_code == 200, f"HTTP {r.status_code}")
    web_token = r.json().get("token") or r.json().get("access_token")
    step("login returned a token", bool(web_token))
    H = {"Authorization": f"Bearer {web_token}"}

    print("2) Dataset metadata (no raw rows stored server-side)")
    r = requests.post(f"{SERVER}/api/upload_csv_qc",
                      data={"phenotype": PHENO, "number_of_samples": str(df.shape[0])}, headers=H)
    step("upload_csv_qc", r.status_code == 200, f"HTTP {r.status_code}")
    dataset_id = r.json().get("dataset_id")
    step("got dataset_id", bool(dataset_id))
    ds = db["datasets"].find_one({"_id": __import__("bson").ObjectId(dataset_id)})
    step("dataset stored WITHOUT raw 'data'", not ds.get("data"), "privacy invariant")
    uid = str(ds["user_id"])

    print("3) Create a collaboration (creator = this user) with a filter QC scheme")
    collab_uuid = f"smoke-{suffix}"
    db["collaborations"].insert_one({
        "uuid": collab_uuid,
        "creator_id": uid,
        "creator_dataset_id": dataset_id,
        "invited_users": [],
        "qc_scheme": [
            {"method": "Missing Data QC", "params": {"threshold": 0.5}},
            {"method": "Minor Allele Frequency (MAF)", "params": {"threshold": 0.01}},
            {"method": "Hardy-Weinberg Equilibrium (HWE)", "params": {"threshold": 1e-6}},
        ],
    })
    step("collaboration inserted", True)

    print("4) Enqueue a chained_qc job for the creator")
    r = requests.post(f"{SERVER}/api/qc/create_chained", json={"uuid": collab_uuid}, headers=H)
    step("create_chained queued", r.status_code == 202, f"HTTP {r.status_code}")
    step("job is pending in db.jobs", db["jobs"].find_one({"collaboration_uuid": collab_uuid, "status": "pending"}) is not None)

    print("5) Enroll a local agent")
    r = requests.post(f"{SERVER}/api/agent/enrollment-code", headers=H)
    step("got enrollment code", r.status_code == 200, f"HTTP {r.status_code}")
    agent_token = JobsClient.enroll(SERVER, r.json()["code"])
    step("exchanged code for agent token", bool(agent_token))
    client = JobsClient(SERVER, agent_token)

    print("6) Agent polls, runs QC LOCALLY, posts results")
    job = client.next_job(10)
    step("agent received its job", job is not None and job["action"] == "chained_qc")
    local_df = data_loader.load_dataframe(os.path.join(data_dir, f"{job['phenotype']}.csv"))
    result = actions.run_chained_qc(local_df, job["params"]["methods"], MODELS_DIR)
    client.post_result(job["id"], result)
    step("agent posted chained_qc result", True,
         f"{len(result['surviving_snps'])} SNPs, {len(result['surviving_samples'])} samples")

    print("7) Verify the server stored the derived outputs")
    collab = db["collaborations"].find_one({"uuid": collab_uuid})
    step("surviving_snps[user] stored", bool(collab.get("surviving_snps", {}).get(uid)))
    step("surviving_samples[user] stored", bool(collab.get("surviving_samples", {}).get(uid)))

    print("8) GWAS summary path")
    sample_ids = [str(i) for i in local_df.index.tolist()]
    r = requests.post(f"{SERVER}/api/create_gwas_dataset",
                      json={"uuid": collab_uuid, "sample_ids": sample_ids}, headers=H)
    step("create_gwas_dataset queued", r.status_code == 202, f"HTTP {r.status_code}")
    gjob = client.next_job(10)
    step("agent received gwas job", gjob is not None and gjob["action"] == "gwas_summary")
    gresult = actions.run_gwas_summary(local_df, gjob["params"].get("sample_ids") or sample_ids, gjob["params"])
    client.post_result(gjob["id"], gresult)
    collab = db["collaborations"].find_one({"uuid": collab_uuid})
    step("stats[user] stored (per-SNP case/control counts)", bool(collab.get("stats", {}).get(uid)),
         f"{len(collab.get('stats', {}).get(uid, {}))} SNPs")

    print(f"\n\033[32mALL {passed} CHECKS PASSED — the local-agent loop works end to end.\033[0m")
    print("Cleaning up test collaboration/jobs...")
    db["collaborations"].delete_one({"uuid": collab_uuid})
    db["jobs"].delete_many({"collaboration_uuid": collab_uuid})


if __name__ == "__main__":
    main()
