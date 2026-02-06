from typing import Any, Dict

from .llm import LLMClient
from .models import (
    ContractRiskRequest,
    PhishingRiskRequest,
    RiskDetails,
    RiskResponse,
    SlippageRiskRequest,
)
from .prompts import CONTRACT_PROMPT, PHISHING_PROMPT, SLIPPAGE_PROMPT, SYSTEM_PROMPT


class RiskService:
    def __init__(self) -> None:
        self._llm = LLMClient()

    def _fallback(self, summary: str, reasons: list[str], evidence: list[str], data_gaps: list[str]) -> RiskResponse:
        return RiskResponse(
            risk_level="unknown",
            summary=summary,
            confidence=0.3,
            details=RiskDetails(reasons=reasons, evidence=evidence, data_gaps=data_gaps, extra={}),
        )

    def phishing(self, req: PhishingRiskRequest) -> RiskResponse:
        payload: Dict[str, Any] = {"task": "phishing_risk", "input": req.model_dump()}
        if self._llm.enabled():
            data = self._llm.invoke_json(SYSTEM_PROMPT + PHISHING_PROMPT, payload)
            return RiskResponse.model_validate(data)
        reasons = ["LLM disabled; unable to compute risk."]
        data_gaps = ["Model output unavailable"]
        return self._fallback("Unable to assess risk with current configuration.", reasons, [], data_gaps)

    def contract(self, req: ContractRiskRequest) -> RiskResponse:
        payload: Dict[str, Any] = {"task": "contract_risk", "input": req.model_dump()}
        if self._llm.enabled():
            data = self._llm.invoke_json(SYSTEM_PROMPT + CONTRACT_PROMPT, payload)
            return RiskResponse.model_validate(data)
        reasons = ["LLM disabled; unable to compute risk."]
        data_gaps = ["Model output unavailable"]
        return self._fallback("Unable to assess contract risk with current configuration.", reasons, [], data_gaps)

    def slippage(self, req: SlippageRiskRequest) -> RiskResponse:
        payload: Dict[str, Any] = {"task": "slippage_risk", "input": req.model_dump()}
        if self._llm.enabled():
            data = self._llm.invoke_json(SYSTEM_PROMPT + SLIPPAGE_PROMPT, payload)
            return RiskResponse.model_validate(data)
        reasons = ["LLM disabled; unable to compute risk."]
        data_gaps = ["Model output unavailable"]
        return self._fallback("Unable to assess slippage risk with current configuration.", reasons, [], data_gaps)
