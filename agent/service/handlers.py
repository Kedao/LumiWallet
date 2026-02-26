from .models import (
    ContractRiskRequest,
    PhishingRiskResponse,
    PhishingRiskRequest,
    SecurityRiskResponse,
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
        normalized_summary = (
            "Insufficient data, so slippage can only be judged conservatively."
            if self._normalize_lang(lang) == "en"
            else "数据不足，因此只能对滑点做保守判断。"
        )
        return SlippageRiskResponse(
            slippage_level="unknown" if self._normalize_lang(lang) == "en" else "未知",
            summary=normalized_summary,
        )

    def _phishing_fallback(self, summary: str, lang: str = "zh") -> PhishingRiskResponse:
        return PhishingRiskResponse(
            risk_level="unknown" if self._normalize_lang(lang) == "en" else "未知",
            summary=summary,
            confidence=0.3,
            most_similar_address=None,
            most_similar_similarity=0.0,
            most_similar_transactions=[],
            similarity_method="weighted(prefix=0.4,suffix=0.4,levenshtein=0.2)",
        )

    def phishing(self, req: PhishingRiskRequest) -> PhishingRiskResponse:
        lang = self._normalize_lang(req.lang)
        if self._phishing_agent is None:
            return self._phishing_fallback(
                "Unable to assess risk with current configuration." if lang == "en" else "当前配置下无法完成风险评估。",
                lang=lang,
            )

        try:
            return self._phishing_agent.run(req)
        except Exception:
            return self._phishing_fallback(
                "Unable to assess phishing risk due to runtime error."
                if lang == "en"
                else "由于运行时错误，无法完成钓鱼风险评估。",
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
