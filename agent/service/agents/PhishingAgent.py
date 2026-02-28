from __future__ import annotations

import re
from typing import Any, Literal

from pydantic import BaseModel, Field

from ..models import PhishingRiskRequest, PhishingRiskResponse
from .BaseRiskAgent import RiskTaskAgent

SIMILARITY_METHOD = "max(prefix,suffix,levenshtein,head_bag_6)"
_INTERNAL_TERM_PATTERN = re.compile(
    r"(?i)(head_bag_similarity_6|max_similarity|high_similarity_count|prefix_match_ratio|"
    r"suffix_match_ratio|normalized_levenshtein_similarity|levenshtein|threshold|阈值)"
)
_METRIC_NUMBER_PATTERN = re.compile(r"(?<![a-zA-Z])(?:0?\.\d{2,4}|[1-9]\d?(?:\.\d{1,4})?%)(?![a-zA-Z])")

PHISHING_SYSTEM_PROMPT_ZH = (
    "你是加密钱包后端的钓鱼风险分析助手。"
    "请根据已计算好的地址相似度上下文完成风险总结。"
    "你只能输出 risk_level、summary、confidence 三个字段。"
    "summary 必须简洁清晰，聚焦风险结论。"
    "请使用中文输出（risk_level 使用 高/中/低/未知）。"
)

PHISHING_SYSTEM_PROMPT_EN = (
    "You are a phishing-risk analyst for a crypto wallet backend. "
    "Use the precomputed address-similarity context to produce a risk summary. "
    "summary must be concise and focused on the core risk conclusion. "
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
        user_summary = self._sanitize_user_summary(
            summary=summary.summary,
            risk_level=summary.risk_level,
            lang=lang,
            similarity_context=similarity_context,
        )

        return PhishingRiskResponse(
            risk_level=summary.risk_level,
            summary=user_summary,
            confidence=summary.confidence,
            most_similar_address=similarity_context["most_similar_address"],
            most_similar_similarity=similarity_context["most_similar_similarity"],
            most_similar_transactions=similarity_context["most_similar_transactions"],
            similarity_method=SIMILARITY_METHOD,
        )

    def _sanitize_user_summary(
        self,
        summary: str,
        risk_level: str,
        lang: str,
        similarity_context: dict[str, Any],
    ) -> str:
        text = str(summary or "").strip().replace("\n", " ")
        text = re.sub(r"\s+", " ", text)
        if not text:
            return self._friendly_summary_fallback(risk_level, lang, similarity_context)

        contains_internal_terms = bool(_INTERNAL_TERM_PATTERN.search(text))
        contains_metric_numbers = bool(_METRIC_NUMBER_PATTERN.search(text))
        if contains_internal_terms or contains_metric_numbers:
            return self._friendly_summary_fallback(risk_level, lang, similarity_context)
        return text

    def _friendly_summary_fallback(
        self,
        risk_level: str,
        lang: str,
        similarity_context: dict[str, Any],
    ) -> str:
        normalized_lang = self._normalize_lang(lang)
        normalized_level = str(risk_level).strip().lower()
        has_similar = bool(similarity_context.get("most_similar_address"))

        if normalized_lang == "en":
            if normalized_level in {"high"}:
                return "This address looks highly similar to suspicious historical counterparts, so verify it carefully before transfer."
            if normalized_level in {"medium"}:
                return "This address shows noticeable similarity to prior counterparts, so please re-check before proceeding."
            if normalized_level in {"low"}:
                return "No obvious phishing-like address pattern is detected, but you should still confirm the recipient."
            if has_similar:
                return "Some address similarity risk is detected, so please verify the recipient before transfer."
            return "Current evidence is limited, so verify the recipient address carefully before transfer."

        if normalized_level in {"高"}:
            return "该地址与历史可疑地址高度相似，疑似钓鱼，请转账前仔细核验。"
        if normalized_level in {"中"}:
            return "该地址与历史地址存在明显相似风险，建议操作前再次核对。"
        if normalized_level in {"低"}:
            return "暂未发现明显钓鱼型地址特征，但仍建议转账前确认收款方。"
        if has_similar:
            return "检测到一定地址相似风险，请在转账前再次核验收款地址。"
        return "当前证据有限，无法明确判断风险，请谨慎核验收款地址。"

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
        head_bag_6 = self._head_bag_similarity(target, candidate, head_len=6)
        weighted = max(prefix, suffix, lev, head_bag_6)
        return {
            "address": f"0x{candidate}",
            "prefix_match_ratio": round(prefix, 4),
            "suffix_match_ratio": round(suffix, 4),
            "normalized_levenshtein_similarity": round(lev, 4),
            "head_bag_similarity_6": round(head_bag_6, 4),
            "similarity": round(weighted, 4),
        }

    def _head_bag_similarity(self, target: str, candidate: str, head_len: int = 6) -> float:
        """Order-tolerant similarity on the first N chars to catch visual-clone prefixes."""
        if head_len <= 0:
            return 0.0
        ta = target[:head_len]
        ca = candidate[:head_len]
        if not ta or not ca:
            return 0.0

        counts_target: dict[str, int] = {}
        counts_candidate: dict[str, int] = {}
        for ch in ta:
            counts_target[ch] = counts_target.get(ch, 0) + 1
        for ch in ca:
            counts_candidate[ch] = counts_candidate.get(ch, 0) + 1

        overlap = 0
        for ch, count in counts_target.items():
            overlap += min(count, counts_candidate.get(ch, 0))

        denom = len(ta) + len(ca)
        if denom == 0:
            return 0.0
        return (2.0 * overlap) / denom

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
            "- summary must be concise and focused on the core risk conclusion.\n"
            "- summary is user-facing text; do not mention metric names, thresholds, or numeric scores.\n"
            "- max_similarity >= 0.82 is a strong phishing signal.\n"
            "- head_bag_similarity_6 >= 0.80 is also a strong visual-clone signal.\n"
            "- 0.70 ~ 0.82 indicates medium-high risk.\n"
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
            "- summary 必须简洁明了，聚焦核心风险结论。\n"
            "- summary 面向普通用户，不要出现指标名、阈值或分数。\n"
            "- max_similarity >= 0.82 视为强钓鱼风险信号。\n"
            "- head_bag_similarity_6 >= 0.80 也视为强视觉克隆信号。\n"
            "- 0.70 ~ 0.82 视为中高风险信号。\n"
            "- 未找到相似地址时应下调置信度并说明不确定性。\n\n"
            "原始请求快照:\n"
            f"{flat_block if flat_block else '<no_fields>'}"
        )

    def _build_user_prompt(self, task: str, payload_input: dict[str, Any], lang: str = "zh") -> str:
        chain = payload_input.get("chain")
        similarity_context = self._build_similarity_context(payload_input)
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
