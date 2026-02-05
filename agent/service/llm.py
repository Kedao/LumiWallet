import json
from typing import Any, Dict

from langchain_openai import ChatOpenAI

from .config import settings


class LLMClient:
    def __init__(self) -> None:
        self._llm = None
        if settings.llm_disabled:
            return
        kwargs: Dict[str, Any] = {
            "model": settings.model_name or "gpt-4o-mini",
            "api_key": settings.model_api_key or "",
            "temperature": 0.2,
            "request_timeout": settings.request_timeout_s,
        }
        if settings.model_base_url:
            kwargs["base_url"] = settings.model_base_url
        self._llm = ChatOpenAI(**kwargs)

    def enabled(self) -> bool:
        return self._llm is not None

    def invoke_json(self, system_prompt: str, user_payload: Dict[str, Any]) -> Dict[str, Any]:
        if not self._llm:
            raise RuntimeError("LLM is disabled")
        messages = [
            ("system", system_prompt),
            ("user", json.dumps(user_payload, ensure_ascii=False)),
        ]
        result = self._llm.invoke(messages)
        content = result.content if hasattr(result, "content") else str(result)
        return json.loads(content)
