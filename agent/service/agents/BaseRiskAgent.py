from __future__ import annotations

from typing import Any, Sequence

from pydantic import BaseModel

from .agent import BaseAgent

class RiskTaskAgent(BaseAgent):
    def __init__(
        self,
        task_system_prompt: str,
        tools: Sequence[Any] | None = None,
        response_model: type[BaseModel] | None = None,
    ) -> None:
        super().__init__(system_prompt=task_system_prompt, tools=tools, response_model=response_model)

    def _normalize_lang(self, lang: Any) -> str:
        value = str(lang or "zh").strip().lower()
        if value.startswith("en"):
            return "en"
        return "zh"

    def _system_prompt_for_lang(self, lang: str) -> str:
        return self.system_prompt

    def _flatten_fields(self, value: Any, prefix: str = "") -> list[str]:
        lines: list[str] = []
        if isinstance(value, dict):
            if not value:
                lines.append(f"{prefix}=<empty_dict>")
                return lines
            for key, child in value.items():
                next_prefix = f"{prefix}.{key}" if prefix else str(key)
                lines.extend(self._flatten_fields(child, next_prefix))
            return lines

        if isinstance(value, list):
            if not value:
                lines.append(f"{prefix}=<empty_list>")
                return lines
            for idx, child in enumerate(value):
                next_prefix = f"{prefix}[{idx}]"
                lines.extend(self._flatten_fields(child, next_prefix))
            return lines

        lines.append(f"{prefix}={value!r}")
        return lines

    def _build_user_prompt(self, task: str, payload_input: dict[str, Any], lang: str = "zh") -> str:
        flat_lines = self._flatten_fields(payload_input)
        flat_block = "\n".join(flat_lines) if flat_lines else "<no_fields>"
        return (
            f"Task: {task}\n"
            "Request fields (flattened):\n"
            f"{flat_block}\n\n"
            "Generate final risk result strictly in the required JSON schema."
        )

    def run_payload(self, task: str, payload_input: dict[str, Any], lang: str = "zh") -> Any:
        normalized_lang = self._normalize_lang(lang)
        system_prompt = self._system_prompt_for_lang(normalized_lang)
        prompt = self._build_user_prompt(task, payload_input, normalized_lang)
        if self.structured_llm is not None:
            return self.invoke_text_structured(prompt, system_prompt_override=system_prompt)
        return self.invoke_text_json(prompt, system_prompt_override=system_prompt)
