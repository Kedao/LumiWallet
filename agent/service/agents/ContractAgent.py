from __future__ import annotations

from typing import Any

from ..models import ContractRiskRequest, SecurityRiskResponse
from .BaseRiskAgent import RiskTaskAgent

CONTRACT_SYSTEM_PROMPT_ZH = (
    "你是加密钱包后端的合约风险分析助手。"
    "请评估代码透明度、权限控制、代理升级能力与代币行为特征。"
    "请使用中文输出各字段内容（包括 risk_level 使用 高/中/低/未知）。"
)

CONTRACT_SYSTEM_PROMPT_EN = (
    "You are a smart-contract risk analyst for a crypto wallet backend. "
    "Evaluate transparency, control permissions, proxy upgradeability, and token behavior flags. "
    "You receive all request fields already expanded in plain text. "
    "Output all fields in English."
)


class ContractRiskAgent(RiskTaskAgent):
    def __init__(self) -> None:
        super().__init__(CONTRACT_SYSTEM_PROMPT_ZH, [], response_model=SecurityRiskResponse)

    def run(self, req: ContractRiskRequest) -> SecurityRiskResponse:
        payload = req.model_dump()
        lang = self._normalize_lang(payload.get("lang"))
        data = self.run_payload("contract_risk", payload, lang=lang)
        return data if isinstance(data, SecurityRiskResponse) else SecurityRiskResponse.model_validate(data)

    def _system_prompt_for_lang(self, lang: str) -> str:
        return CONTRACT_SYSTEM_PROMPT_EN if lang == "en" else CONTRACT_SYSTEM_PROMPT_ZH

    def _build_user_prompt_en(
        self,
        task: str,
        contract_address: Any,
        chain: Any,
        interaction_type: Any,
        verified: Any,
        is_proxy: Any,
        enabled_privileges: list[str],
        risky_token_flags: list[str],
        flat_block: str,
    ) -> str:
        return (
            f"Task: {task}\n"
            "Interaction Context:\n"
            f"- contract_address={contract_address}, chain={chain}, interaction_type={interaction_type}\n"
            "Signal Summary:\n"
            f"- code_verified={verified}, is_proxy={is_proxy}\n"
            f"- enabled_privileges_count={len(enabled_privileges)}, enabled_privileges={enabled_privileges}\n"
            f"- risky_token_flags={risky_token_flags}\n"
            "Interpretation Hints:\n"
            "- Unverified code and multiple privileged controls increase rug/abuse risk.\n"
            "- Proxy upgradeability should be treated as governance trust risk.\n"
            "- Missing permissions or code metadata should reduce confidence.\n\n"
            "Raw Request Snapshot:\n"
            f"{flat_block if flat_block else '<no_fields>'}"
        )

    def _build_user_prompt_zh(
        self,
        task: str,
        contract_address: Any,
        chain: Any,
        interaction_type: Any,
        verified: Any,
        is_proxy: Any,
        enabled_privileges: list[str],
        risky_token_flags: list[str],
        flat_block: str,
    ) -> str:
        return (
            f"任务: {task}\n"
            "交互上下文:\n"
            f"- contract_address={contract_address}, chain={chain}, interaction_type={interaction_type}\n"
            "信号汇总:\n"
            f"- code_verified={verified}, is_proxy={is_proxy}\n"
            f"- enabled_privileges_count={len(enabled_privileges)}, enabled_privileges={enabled_privileges}\n"
            f"- risky_token_flags={risky_token_flags}\n"
            "解释提示:\n"
            "- 代码未验证且高权限较多时，通常意味着更高的滥用或作恶风险。\n"
            "- 代理可升级应作为治理与信任风险处理。\n"
            "- 权限信息或代码信息缺失时，应下调置信度。\n\n"
            "原始请求快照:\n"
            f"{flat_block if flat_block else '<no_fields>'}"
        )

    def _build_user_prompt(self, task: str, payload_input: dict[str, Any], lang: str = "zh") -> str:
        contract_address = payload_input.get("contract_address")
        chain = payload_input.get("chain")
        interaction_type = payload_input.get("interaction_type")

        code = payload_input.get("code") or {}
        verified = code.get("verified")

        proxy = payload_input.get("proxy") or {}
        is_proxy = proxy.get("is_proxy")

        permissions = payload_input.get("permissions") or {}
        privileged_fields = ["can_upgrade", "can_pause", "can_blacklist", "can_mint", "can_burn"]
        enabled_privileges = [field for field in privileged_fields if permissions.get(field) is True]

        token_flags = payload_input.get("token_flags") or {}
        risky_token_flags = [k for k, v in token_flags.items() if v is True]

        flat_block = "\n".join(self._flatten_fields(payload_input))
        if lang == "en":
            return self._build_user_prompt_en(
                task,
                contract_address,
                chain,
                interaction_type,
                verified,
                is_proxy,
                enabled_privileges,
                risky_token_flags,
                flat_block,
            )
        return self._build_user_prompt_zh(
            task,
            contract_address,
            chain,
            interaction_type,
            verified,
            is_proxy,
            enabled_privileges,
            risky_token_flags,
            flat_block,
        )
