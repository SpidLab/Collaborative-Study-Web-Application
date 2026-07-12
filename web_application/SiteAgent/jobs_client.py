"""HTTP client to the central collaboration server's agent API.

Replaces the old orchestrator_client.py. The agent only ever makes outbound
calls; no inbound ports are needed on the collaborator machine.
"""
import gzip
import json
import logging

import requests

logger = logging.getLogger("siteagent.client")


class JobsClient:
    def __init__(self, server_url, token, request_timeout=60):
        self.server_url = server_url.rstrip("/")
        self.token = token
        self.request_timeout = request_timeout

    def _headers(self):
        return {"Authorization": f"Bearer {self.token}"}

    @classmethod
    def enroll(cls, server_url, enroll_code, request_timeout=60):
        """Exchange a one-time enrollment code for a long-lived bearer token."""
        url = f"{server_url.rstrip('/')}/api/agent/enroll"
        resp = requests.post(url, json={"code": enroll_code}, timeout=request_timeout)
        resp.raise_for_status()
        token = resp.json().get("token")
        if not token:
            raise RuntimeError("Enrollment succeeded but no token was returned.")
        return token

    def version(self):
        url = f"{self.server_url}/api/agent/version"
        resp = requests.get(url, headers=self._headers(), timeout=self.request_timeout)
        resp.raise_for_status()
        return resp.json()

    def me(self):
        """Return the account this agent's token is scoped to: {uid, email, name}."""
        url = f"{self.server_url}/api/agent/me"
        resp = requests.get(url, headers=self._headers(), timeout=self.request_timeout)
        resp.raise_for_status()
        return resp.json()

    def list_datasets(self):
        """List the datasets registered to this agent's user (id + phenotype)."""
        url = f"{self.server_url}/api/agent/datasets"
        resp = requests.get(url, headers=self._headers(), timeout=self.request_timeout)
        resp.raise_for_status()
        return resp.json().get("datasets", [])

    def register_metadata(self, dataset_id, phenotype, sample_count, file_hash, snp_ids=None):
        url = f"{self.server_url}/api/agent/datasets/{dataset_id}/metadata"
        payload = {
            "phenotype": phenotype,
            "number_of_samples": sample_count,
            "file_sha256": file_hash,
        }
        if snp_ids is not None:
            payload["snp_ids"] = snp_ids
        resp = requests.post(url, json=payload, headers=self._headers(), timeout=self.request_timeout)
        resp.raise_for_status()
        return resp.json()

    def next_job(self, poll_timeout):
        """Long-poll for the next job scoped to this agent. Returns a job dict or None."""
        url = f"{self.server_url}/api/agent/jobs/next"
        resp = requests.get(
            url,
            headers=self._headers(),
            params={"wait": poll_timeout},
            timeout=poll_timeout + 15,
        )
        if resp.status_code == 204:
            return None
        resp.raise_for_status()
        data = resp.json()
        return data.get("job")

    def post_result(self, job_id, result):
        """Upload a job result as gzipped JSON."""
        url = f"{self.server_url}/api/agent/jobs/{job_id}/result"
        body = gzip.compress(json.dumps(result).encode("utf-8"))
        headers = dict(self._headers())
        headers["Content-Type"] = "application/json"
        headers["Content-Encoding"] = "gzip"
        resp = requests.post(url, data=body, headers=headers, timeout=self.request_timeout)
        resp.raise_for_status()
        return resp.json()

    def post_failure(self, job_id, error):
        url = f"{self.server_url}/api/agent/jobs/{job_id}/result"
        resp = requests.post(
            url,
            json={"status": "failed", "error": str(error)},
            headers=self._headers(),
            timeout=self.request_timeout,
        )
        resp.raise_for_status()
        return resp.json()
