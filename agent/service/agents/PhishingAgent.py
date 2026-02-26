from __future__ import annotations

import re
from typing import Any, Literal

from pydantic import BaseModel, Field

from ..models import PhishingRiskRequest, PhishingRiskResponse
from .BaseRiskAgent import RiskTaskAgent

SIMILARITY_METHOD = "max(prefix,suffix,levenshtein)"

PHISHING_SYSTEM_PROMPT_ZH = (
    "你是加密钱包后端的钓鱼风险分析助手。"
    "请根据已计算好的地址相似度上下文完成风险总结。"
    "你只能输出 risk_level、summary、confidence 三个字段。"
    "请使用中文输出（risk_level 使用 高/中/低/未知）。"
)

PHISHING_SYSTEM_PROMPT_EN = (
    "You are a phishing-risk analyst for a crypto wallet backend. "
    "Use the precomputed address-similarity context to produce a risk summary. "
    "You must return only risk_level, summary, confidence in English."
)


class PhishingRiskLLMSummary(BaseModel):
    risk_level: Literal["high", "medium", "low", "unknown", "高", "中", "低", "未知"]
    summary: str
    confidence: float = Field(ge=0, le=1)


class PhishingRiskAgent(RiskTaskAgent):
    def __init__(self) -> None:
        super().__init__(PHISHING_SYSTEM_PROMPT_ZH, [], response_model=PhishingRiskLLMSummary)

    def run(self, req: PhishingRiskRequest) -> PhishingRiskResponse:
        payload = req.model_dump()
        lang = self._normalize_lang(payload.get("lang"))
        similarity_context = self._build_similarity_context(payload)

        data = self.run_payload("phishing_risk", payload, lang=lang)
        summary = data if isinstance(data, PhishingRiskLLMSummary) else PhishingRiskLLMSummary.model_validate(data)

        return PhishingRiskResponse(
            risk_level=summary.risk_level,
            summary=summary.summary,
            confidence=summary.confidence,
            most_similar_address=similarity_context["most_similar_address"],
            most_similar_similarity=similarity_context["most_similar_similarity"],
            most_similar_transactions=similarity_context["most_similar_transactions"],
            similarity_method=SIMILARITY_METHOD,
        )

    def _system_prompt_for_lang(self, lang: str) -> str:
        return PHISHING_SYSTEM_PROMPT_EN if lang == "en" else PHISHING_SYSTEM_PROMPT_ZH

    def _normalize_address(self, value: Any) -> str:
        text = str(value or "").strip().lower()
        if text.startswith("0x"):
            text = text[2:]
        return re.sub(r"[^0-9a-f]", "", text)[:40]

    def _levenshtein_distance(self, a: str, b: str) -> int:
        if a == b:
            return 0
        if not a:
            return len(b)
        if not b:
            return len(a)

        prev = list(range(len(b) + 1))
        for i, ca in enumerate(a, start=1):
            curr = [i]
            for j, cb in enumerate(b, start=1):
                insert_cost = curr[j - 1] + 1
                delete_cost = prev[j] + 1
                replace_cost = prev[j - 1] + (0 if ca == cb else 1)
                curr.append(min(insert_cost, delete_cost, replace_cost))
            prev = curr
        return prev[-1]

    def _normalized_levenshtein_similarity(self, a: str, b: str) -> float:
        distance = self._levenshtein_distance(a, b)
        return max(0.0, 1.0 - distance / 40.0)

    def _weighted_similarity(self, target: str, candidate: str) -> dict[str, Any]:
        prefix = self._prefix_match_ratio(target, candidate)
        suffix = self._suffix_match_ratio(target, candidate)
        lev = self._normalized_levenshtein_similarity(target, candidate)
        weighted = max(prefix, suffix, lev)
        return {
            "address": f"0x{candidate}",
            "prefix_match_ratio": round(prefix, 4),
            "suffix_match_ratio": round(suffix, 4),
            "normalized_levenshtein_similarity": round(lev, 4),
            "similarity": round(weighted, 4),
        }

    def _candidate_addresses(self, transactions: list[dict[str, Any]], target: str) -> list[str]:
        dedup: set[str] = set()
        for tx in transactions:
            if not isinstance(tx, dict):
                continue
            for key in ("from_address", "to_address", "contract_address"):
                value = self._normalize_address(tx.get(key))
                if len(value) == 40 and value != target:
                    dedup.add(value)
        return sorted(dedup)

    def _related_transactions_for_address(self, transactions: list[dict[str, Any]], address: str) -> list[dict[str, Any]]:
        normalized = self._normalize_address(address)
        if len(normalized) != 40:
            return []

        matched: list[dict[str, Any]] = []
        for tx in transactions:
            if not isinstance(tx, dict):
                continue
            candidates = [
                self._normalize_address(tx.get("from_address")),
                self._normalize_address(tx.get("to_address")),
                self._normalize_address(tx.get("contract_address")),
            ]
            if normalized in candidates:
                matched.append(tx)

        matched.sort(key=lambda item: int(item.get("timestamp") or 0), reverse=True)
        return matched[:3]

    def _build_similarity_context(self, payload_input: dict[str, Any]) -> dict[str, Any]:
        target = self._normalize_address(payload_input.get("address"))
        txs = payload_input.get("transactions") or []
        candidates = self._candidate_addresses(txs, target)

        if len(target) != 40 or not candidates:
            return {
                "target_address": payload_input.get("address"),
                "normalized_target_address": f"0x{target}" if target else None,
                "candidate_count": len(candidates),
                "max_similarity": 0.0,
                "high_similarity_count": 0,
                "top_similar_addresses": [],
                "most_similar_address": None,
                "most_similar_similarity": 0.0,
                "most_similar_transactions": [],
            }

        scores = [self._weighted_similarity(target, candidate) for candidate in candidates]
        scores.sort(key=lambda item: item["similarity"], reverse=True)
        top = scores[0]
        high_similarity_count = sum(1 for item in scores if item["similarity"] >= 0.85)
        most_similar_transactions = self._related_transactions_for_address(txs, top["address"])

        return {
            "target_address": payload_input.get("address"),
            "normalized_target_address": f"0x{target}",
            "candidate_count": len(candidates),
            "max_similarity": round(top["similarity"], 4),
            "high_similarity_count": high_similarity_count,
            "top_similar_addresses": scores[:3],
            "most_similar_address": top["address"],
            "most_similar_similarity": round(top["similarity"], 4),
            "most_similar_transactions": most_similar_transactions,
        }

    def _build_user_prompt_en(
        self,
        task: str,
        chain: Any,
        similarity_context: dict[str, Any],
        flat_block: str,
    ) -> str:
        return (
            f"Task: {task}\n"
            "Interaction Context:\n"
            f"- chain={chain}\n"
            f"- target_address={similarity_context.get('target_address')}\n"
            "Precomputed Similarity:\n"
            f"- max_similarity={similarity_context.get('max_similarity')}\n"
            f"- high_similarity_count(threshold>=0.85)={similarity_context.get('high_similarity_count')}\n"
            f"- most_similar_address={similarity_context.get('most_similar_address')}\n"
            f"- most_similar_similarity={similarity_context.get('most_similar_similarity')}\n"
            "Rules:\n"
            "- Return only risk_level, summary, confidence.\n"
            "- max_similarity >= 0.90 is a strong phishing signal.\n"
            "- 0.80 ~ 0.90 indicates medium-high risk.\n"
            "- If no similar address is found, lower confidence and explain uncertainty.\n\n"
            "Raw Request Snapshot:\n"
            f"{flat_block if flat_block else '<no_fields>'}"
        )

    def _build_user_prompt_zh(
        self,
        task: str,
        chain: Any,
        similarity_context: dict[str, Any],
        flat_block: str,
    ) -> str:
        return (
            f"任务: {task}\n"
            "交互上下文:\n"
            f"- chain={chain}\n"
            f"- target_address={similarity_context.get('target_address')}\n"
            "预计算相似度:\n"
            f"- max_similarity={similarity_context.get('max_similarity')}\n"
            f"- high_similarity_count(threshold>=0.85)={similarity_context.get('high_similarity_count')}\n"
            f"- most_similar_address={similarity_context.get('most_similar_address')}\n"
            f"- most_similar_similarity={similarity_context.get('most_similar_similarity')}\n"
            "规则:\n"
            "- 只能输出 risk_level、summary、confidence 三个字段。\n"
            "- max_similarity >= 0.90 视为强钓鱼风险信号。\n"
            "- 0.80 ~ 0.90 视为中高风险信号。\n"
            "- 未找到相似地址时应下调置信度并说明不确定性。\n\n"
            "原始请求快照:\n"
            f"{flat_block if flat_block else '<no_fields>'}"
        )

    def _build_user_prompt(self, task: str, payload_input: dict[str, Any], lang: str = "zh") -> str:
        chain = payload_input.get("chain")
        similarity_context = self._build_similarity_context(payload_input)
        payload_input = {**payload_input, "derived_similarity": similarity_context}
        flat_block = "\n".join(self._flatten_fields(payload_input))

        if lang == "en":
            return self._build_user_prompt_en(task, chain, similarity_context, flat_block)
        return self._build_user_prompt_zh(task, chain, similarity_context, flat_block)
    def _prefix_match_ratio(self, a: str, b: str) -> float:
        matched = 0
        limit = min(len(a), len(b))
        for i in range(limit):
            if a[i] != b[i]:
                break
            matched += 1
        return matched / 40.0

    def _suffix_match_ratio(self, a: str, b: str) -> float:
        matched = 0
        limit = min(len(a), len(b))
        for i in range(1, limit + 1):
            if a[-i] != b[-i]:
                break
            matched += 1
        return matched / 40.0
