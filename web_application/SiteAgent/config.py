"""Site Agent configuration, loaded from environment variables."""
import os


class Config:
    SERVER_URL = os.environ.get("SERVER_URL", "http://localhost:5050").rstrip("/")
    AGENT_TOKEN = os.environ.get("AGENT_TOKEN", "")
    ENROLL_CODE = os.environ.get("ENROLL_CODE", "")
    DATA_DIR = os.environ.get("DATA_DIR", "/data")
    # Persisted token lives here so the collaborator only ever pastes a code once.
    CONFIG_DIR = os.environ.get("CONFIG_DIR", os.path.join(os.path.dirname(__file__), ".agentconfig"))
    POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "10"))
    POLL_TIMEOUT = int(os.environ.get("POLL_TIMEOUT", "30"))
    REQUEST_TIMEOUT = int(os.environ.get("REQUEST_TIMEOUT", "60"))
    MODELS_DIR = os.environ.get("MODELS_DIR", os.path.join(os.path.dirname(__file__), "models"))
    AGENT_VERSION = "1.0.0"
    # Upload guard: reject result payloads larger than this (bytes, pre-gzip)
    MAX_RESULT_BYTES = int(os.environ.get("MAX_RESULT_BYTES", str(100 * 1024 * 1024)))

    @classmethod
    def token_path(cls):
        return os.path.join(cls.CONFIG_DIR, "token")

    @classmethod
    def read_saved_token(cls):
        try:
            with open(cls.token_path()) as f:
                return f.read().strip()
        except OSError:
            return ""

    @classmethod
    def save_token(cls, token):
        try:
            os.makedirs(cls.CONFIG_DIR, exist_ok=True)
            with open(cls.token_path(), "w") as f:
                f.write(token)
        except OSError:
            pass  # non-fatal: agent still runs with the in-memory token

    @classmethod
    def validate(cls):
        if not cls.AGENT_TOKEN and not cls.ENROLL_CODE and not cls.read_saved_token():
            raise SystemExit(
                "No credentials found. Paste your enrollment code (ENROLL_CODE) on first run, "
                "or set AGENT_TOKEN."
            )
        if not os.path.isdir(cls.DATA_DIR):
            raise SystemExit(f"DATA_DIR does not exist: {cls.DATA_DIR}")
