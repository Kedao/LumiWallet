from .models import (
    ContractRiskRequest,
    PhishingRiskRequest,
    SecurityRiskResponse,
    SlippageFactor,
    SlippageRiskRequest,
    SlippageRiskResponse,
    RiskReason,
)


class RiskService:
    def __init__(self) -> None:
        self._phishing_agent = None
        self._contract_agent = None
        self._slippage_agent = None
        try:
            from .agents import ContractRiskAgent, PhishingRiskAgent, SlippageRiskAgent

            self._phishing_agent = PhishingRiskAgent()
            self._contract_agent = ContractRiskAgent()
            self._slippage_agent = SlippageRiskAgent()
        except Exception:
            pass

    def _normalize_lang(self, lang: str | None) -> str:
        value = (lang or "zh").strip().lower()
        return "en" if value.startswith("en") else "zh"

    def _security_fallback(self, summary: str, reason: str, lang: str = "zh") -> SecurityRiskResponse:
        if self._normalize_lang(lang) == "en":
            return SecurityRiskResponse(
                risk_level="unknown",
                summary=summary,
                confidence=0.3,
                top_reasons=[
                    RiskReason(reason=reason, explanation="Model output unavailable or runtime execution failed."),
                    RiskReason(reason="Insufficient model output", explanation="No structured result was returned."),
                    RiskReason(reason="Fallback mode", explanation="Using conservative fallback response."),
                ],
            )

        return SecurityRiskResponse(
            risk_level="未知",
            summary=summary,
            confidence=0.3,
            top_reasons=[
                RiskReason(reason=reason, explanation="模型输出不可用或运行时执行失败。"),
                RiskReason(reason="模型结果不足", explanation="未返回可用的结构化结果。"),
                RiskReason(reason="兜底模式", explanation="当前使用保守的兜底返回。"),
            ],
        )

    def _slippage_fallback(self, summary: str, reason: str, lang: str = "zh") -> SlippageRiskResponse:
        if self._normalize_lang(lang) == "en":
            return SlippageRiskResponse(
                expected_slippage_pct=0.0,
                exceed_slippage_probability_label="unknown",
                summary=summary,
                key_factors=[
                    SlippageFactor(factor=reason, explanation="Model output unavailable or runtime execution failed."),
                    SlippageFactor(factor="Insufficient market data", explanation="No structured slippage estimate available."),
                ],
                market_context={},
            )

        return SlippageRiskResponse(
            expected_slippage_pct=0.0,
            exceed_slippage_probability_label="未知",
            summary=summary,
            key_factors=[
                SlippageFactor(factor=reason, explanation="模型输出不可用或运行时执行失败。"),
                SlippageFactor(factor="市场数据不足", explanation="未返回可用的结构化滑点估计。"),
            ],
            market_context={},
        )

    def phishing(self, req: PhishingRiskRequest) -> SecurityRiskResponse:
        lang = self._normalize_lang(req.lang)
        if self._phishing_agent is None:
            return self._security_fallback(
                "Unable to assess risk with current configuration." if lang == "en" else "当前配置下无法完成风险评估。",
                "Agent unavailable" if lang == "en" else "风险 Agent 不可用",
                lang=lang,
            )

        try:
            return self._phishing_agent.run(req)
        except Exception:
            return self._security_fallback(
                "Unable to assess phishing risk due to runtime error."
                if lang == "en"
                else "由于运行时错误，无法完成钓鱼风险评估。",
                "Phishing agent execution failed" if lang == "en" else "钓鱼风险 Agent 执行失败",
                lang=lang,
            )

    def contract(self, req: ContractRiskRequest) -> SecurityRiskResponse:
        lang = self._normalize_lang(req.lang)
        if self._contract_agent is None:
            return self._security_fallback(
                "Unable to assess contract risk with current configuration."
                if lang == "en"
                else "当前配置下无法完成合约风险评估。",
                "Agent unavailable" if lang == "en" else "风险 Agent 不可用",
                lang=lang,
            )

        try:
            return self._contract_agent.run(req)
        except Exception:
            return self._security_fallback(
                "Unable to assess contract risk due to runtime error."
                if lang == "en"
                else "由于运行时错误，无法完成合约风险评估。",
                "Contract agent execution failed" if lang == "en" else "合约风险 Agent 执行失败",
                lang=lang,
            )

    def slippage(self, req: SlippageRiskRequest) -> SlippageRiskResponse:
        lang = self._normalize_lang(req.lang)
        if self._slippage_agent is None:
            return self._slippage_fallback(
                "Unable to assess slippage risk with current configuration."
                if lang == "en"
                else "当前配置下无法完成滑点评估。",
                "Agent unavailable" if lang == "en" else "风险 Agent 不可用",
                lang=lang,
            )

        try:
            return self._slippage_agent.run(req)
        except Exception:
            return self._slippage_fallback(
                "Unable to assess slippage risk due to runtime error."
                if lang == "en"
                else "由于运行时错误，无法完成滑点评估。",
                "Slippage agent execution failed" if lang == "en" else "滑点风险 Agent 执行失败",
                lang=lang,
            )
