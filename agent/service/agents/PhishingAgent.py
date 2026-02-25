from __future__ import annotations

from typing import Any

from ..models import PhishingRiskRequest, SecurityRiskResponse
from .BaseRiskAgent import RiskTaskAgent

PHISHING_SYSTEM_PROMPT_ZH = (
    "你是加密钱包后端的钓鱼风险分析助手。"
    "请基于交易行为、生命周期信息和标签信息评估对手地址风险。"
    "请使用中文输出各字段内容（包括 risk_level 使用 高/中/低/未知）。"
)

PHISHING_SYSTEM_PROMPT_EN = (
    "You are a phishing-risk analyst for a crypto wallet backend. "
    "Assess counterparty address risk using transactions, lifecycle, and labels. "
    "You receive all request fields already expanded in plain text. "
    "Output all fields in English."
)


class PhishingRiskAgent(RiskTaskAgent):
    def __init__(self) -> None:
        super().__init__(PHISHING_SYSTEM_PROMPT_ZH, [], response_model=SecurityRiskResponse)

    def run(self, req: PhishingRiskRequest) -> SecurityRiskResponse:
        payload = req.model_dump()
        lang = self._normalize_lang(payload.get("lang"))
        data = self.run_payload("phishing_risk", payload, lang=lang)
        return data if isinstance(data, SecurityRiskResponse) else SecurityRiskResponse.model_validate(data)

    def _system_prompt_for_lang(self, lang: str) -> str:
        return PHISHING_SYSTEM_PROMPT_EN if lang == "en" else PHISHING_SYSTEM_PROMPT_ZH

    def _build_user_prompt_en(
        self,
        task: str,
        address: Any,
        chain: Any,
        interaction_type: Any,
        tx_count: int,
        failed_count: int,
        failed_ratio: float | None,
        account_age_days: Any,
        active_days: Any,
        tag_count: int,
        suspicious_tags: list[str],
        flat_block: str,
    ) -> str:
        return (
            f"Task: {task}\n"
            "Interaction Context:\n"
            f"- address={address}, chain={chain}, interaction_type={interaction_type}\n"
            "Signal Summary:\n"
            f"- tx_count={tx_count}, failed_count={failed_count}, failed_ratio={failed_ratio}\n"
            f"- account_age_days={account_age_days}, active_days={active_days}\n"
            f"- tag_count={tag_count}, suspicious_tags={suspicious_tags}\n"
            "Interpretation Hints:\n"
            "- Very new accounts, high failed tx ratio, and suspicious labels are strong phishing indicators.\n"
            "- Missing behavioral fields should lower confidence.\n\n"
            "Raw Request Snapshot:\n"
            f"{flat_block if flat_block else '<no_fields>'}"
        )

    def _build_user_prompt_zh(
        self,
        task: str,
        address: Any,
        chain: Any,
        interaction_type: Any,
        tx_count: int,
        failed_count: int,
        failed_ratio: float | None,
        account_age_days: Any,
        active_days: Any,
        tag_count: int,
        suspicious_tags: list[str],
        flat_block: str,
    ) -> str:
        return (
            f"任务: {task}\n"
            "交互上下文:\n"
            f"- address={address}, chain={chain}, interaction_type={interaction_type}\n"
            "信号汇总:\n"
            f"- tx_count={tx_count}, failed_count={failed_count}, failed_ratio={failed_ratio}\n"
            f"- account_age_days={account_age_days}, active_days={active_days}\n"
            f"- tag_count={tag_count}, suspicious_tags={suspicious_tags}\n"
            "解释提示:\n"
            "- 账户很新、失败交易占比高、命中可疑标签，通常是较强钓鱼风险信号。\n"
            "- 当行为数据缺失时，应下调置信度并说明不确定性。\n\n"
            "原始请求快照:\n"
            f"{flat_block if flat_block else '<no_fields>'}"
        )

    def _build_user_prompt(self, task: str, payload_input: dict[str, Any], lang: str = "zh") -> str:
        address = payload_input.get("address")
        chain = payload_input.get("chain")
        interaction_type = payload_input.get("interaction_type")

        txs = payload_input.get("transactions") or []
        tx_count = len(txs)
        failed_count = sum(1 for tx in txs if isinstance(tx, dict) and tx.get("success") is False)
        failed_ratio = (failed_count / tx_count) if tx_count > 0 else None

        lifecycle = payload_input.get("lifecycle") or {}
        account_age_days = lifecycle.get("account_age_days")
        active_days = lifecycle.get("active_days")

        tags = payload_input.get("tags") or []
        tag_count = len(tags)
        suspicious_tags = []
        for tag in tags:
            if not isinstance(tag, dict):
                continue
            label = str(tag.get("label", "")).lower()
            if "phish" in label or "scam" in label or "drainer" in label:
                suspicious_tags.append(label)

        flat_block = "\n".join(self._flatten_fields(payload_input))
        if lang == "en":
            return self._build_user_prompt_en(
                task,
                address,
                chain,
                interaction_type,
                tx_count,
                failed_count,
                failed_ratio,
                account_age_days,
                active_days,
                tag_count,
                suspicious_tags,
                flat_block,
            )
        return self._build_user_prompt_zh(
            task,
            address,
            chain,
            interaction_type,
            tx_count,
            failed_count,
            failed_ratio,
            account_age_days,
            active_days,
            tag_count,
            suspicious_tags,
            flat_block,
        )
