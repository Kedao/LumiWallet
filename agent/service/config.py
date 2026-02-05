import os


def env(key: str, default: str | None = None) -> str | None:
    value = os.getenv(key)
    return value if value is not None else default


class Settings:
    def __init__(self) -> None:
        self.model_provider = env("MODEL_PROVIDER", "openai_compatible")
        self.model_base_url = env("MODEL_BASE_URL", "")
        self.model_name = env("MODEL_NAME", "")
        self.model_api_key = env("MODEL_API_KEY", "")
        self.llm_disabled = env("LLM_DISABLED", "false").lower() == "true"
        self.request_timeout_s = int(env("REQUEST_TIMEOUT_S", "12"))


settings = Settings()
