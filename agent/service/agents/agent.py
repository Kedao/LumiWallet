from __future__ import annotations

import json
from typing import Any, Sequence

from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.tools import BaseTool
from langchain_openai import ChatOpenAI
from pydantic import BaseModel

from ..config import settings


class BaseAgent:
    def __init__(
        self,
        system_prompt: str,
        tools: Sequence[BaseTool] | None = None,
        response_model: type[BaseModel] | None = None,
        model_name: str | None = None,
        temperature: float = 0.2,
        verbose: bool = False,
    ) -> None:
        self.system_prompt = system_prompt
        self._tools: list[BaseTool] = list(tools or [])

        kwargs: dict[str, Any] = {
            "model": model_name or settings.model_name or "gpt-4o-mini",
            "api_key": settings.model_api_key or "",
            "temperature": temperature,
            "request_timeout": settings.request_timeout_s,
        }
        if settings.model_base_url:
            kwargs["base_url"] = settings.model_base_url
        self.llm = ChatOpenAI(**kwargs)
        self._response_model = response_model
        self.structured_llm = self.llm.with_structured_output(response_model) if response_model else None

        tool_list = self.toolList()
        self._use_tools = len(tool_list) > 0
        self.executor = None
        if self._use_tools:
            prompt = ChatPromptTemplate.from_messages(
                [
                    ("system", self.system_prompt),
                    ("human", "{input}"),
                    MessagesPlaceholder(variable_name="agent_scratchpad"),
                ]
            )
            agent = create_tool_calling_agent(self.llm, tool_list, prompt)
            self.executor = AgentExecutor(agent=agent, tools=tool_list, verbose=verbose)

    def invoke(self, input_text: str, system_prompt_override: str | None = None, **kwargs: Any) -> dict[str, Any]:
        if not self._use_tools:
            system_prompt = system_prompt_override or self.system_prompt
            messages = [
                ("system", system_prompt),
                ("human", input_text),
            ]
            if self.structured_llm is not None:
                return {"output": self.structured_llm.invoke(messages, **kwargs)}
            result = self.llm.invoke(messages, **kwargs)
            content = result.content if hasattr(result, "content") else str(result)
            return {"output": content}
        payload = {"input": input_text, **kwargs}
        if self.executor is None:
            raise RuntimeError("Agent executor is not initialized")
        return self.executor.invoke(payload)

    def invoke_json(self, input_payload: dict[str, Any], system_prompt_override: str | None = None, **kwargs: Any) -> dict[str, Any]:
        result = self.invoke(
            json.dumps(input_payload, ensure_ascii=False),
            system_prompt_override=system_prompt_override,
            **kwargs,
        )
        return self._result_to_json(result)

    def invoke_text_json(self, input_text: str, system_prompt_override: str | None = None, **kwargs: Any) -> dict[str, Any]:
        result = self.invoke(input_text, system_prompt_override=system_prompt_override, **kwargs)
        return self._result_to_json(result)

    def invoke_text_structured(self, input_text: str, system_prompt_override: str | None = None, **kwargs: Any) -> Any:
        result = self.invoke(input_text, system_prompt_override=system_prompt_override, **kwargs)
        return result.get("output", result)

    def toolList(self) -> list[BaseTool]:
        return self._tools

    def _result_to_json(self, result: dict[str, Any]) -> dict[str, Any]:
        output = result.get("output", result)
        if isinstance(output, BaseModel):
            return output.model_dump()
        if isinstance(output, dict):
            return output
        if isinstance(output, str):
            return self._extract_json(output)
        return self._extract_json(str(output))

    @staticmethod
    def _extract_json(content: str) -> dict[str, Any]:
        text = content.strip()
        if not text:
            raise ValueError("Empty agent output")

        try:
            data = json.loads(text)
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            pass

        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise ValueError("Agent output does not contain JSON object")
        snippet = text[start : end + 1]
        data = json.loads(snippet)
        if not isinstance(data, dict):
            raise ValueError("Agent output JSON is not an object")
        return data
