from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any

from ..models import SlippageRiskRequest, SlippageRiskResponse
from .BaseRiskAgent import RiskTaskAgent

SLIPPAGE_SYSTEM_PROMPT_ZH = (
    "你是加密钱包后端的 DEX 滑点分析助手。"
    "当前仅按 AMM 模型处理输入，并输出简洁结果。"
    "你必须只返回两个字段：slippage_level（滑点大小的定性等级）和 summary（为什么会发生这种滑点的通俗解释）。"
)

SLIPPAGE_SYSTEM_PROMPT_EN = (
    "You are a DEX slippage analyst for a crypto wallet backend. "
    "Use AMM-style calculation assumptions only. "
    "You must return exactly two fields: slippage_level (qualitative slippage size) and summary "
    "(a plain-language reason why this slippage happens)."
)


class SlippageRiskAgent(RiskTaskAgent):
    def __init__(self) -> None:
        super().__init__(SLIPPAGE_SYSTEM_PROMPT_ZH, [], response_model=SlippageRiskResponse)

    def run(self, req: SlippageRiskRequest) -> SlippageRiskResponse:
        payload = req.model_dump()
        lang = self._normalize_lang(payload.get("lang"))
        payload["derived_context"] = self._build_derived_context(payload)
        data = self.run_payload("slippage_risk", payload, lang=lang)
        if isinstance(data, SlippageRiskResponse):
            return data.model_copy(update={"summary": self._normalize_summary(data.summary, lang)})
        if isinstance(data, dict):
            # Compatibility: map old numeric field to qualitative level.
            if "slippage_level" not in data and "expected_slippage_pct" in data:
                data["slippage_level"] = self._pct_to_level(data.get("expected_slippage_pct"), lang)
            data["summary"] = self._normalize_summary(data.get("summary"), lang)
            return SlippageRiskResponse.model_validate(data)
        result = SlippageRiskResponse.model_validate(data)
        return result.model_copy(update={"summary": self._normalize_summary(result.summary, lang)})

    def _system_prompt_for_lang(self, lang: str) -> str:
        return SLIPPAGE_SYSTEM_PROMPT_EN if lang == "en" else SLIPPAGE_SYSTEM_PROMPT_ZH

    def _to_decimal(self, value: Any) -> Decimal | None:
        if value is None:
            return None
        try:
            return Decimal(str(value))
        except (InvalidOperation, ValueError):
            return None

    def _pct_to_level(self, value: Any, lang: str) -> str:
        pct = self._to_decimal(value)
        if pct is None:
            return "unknown" if lang == "en" else "未知"
        if pct < 1:
            return "low" if lang == "en" else "低"
        if pct <= 3:
            return "medium" if lang == "en" else "中"
        return "high" if lang == "en" else "高"

    def _normalize_summary(self, summary: Any, lang: str) -> str:
        text = str(summary or "").strip().replace("\n", " ")
        if not text:
            return (
                "Insufficient data, so slippage can only be judged conservatively."
                if lang == "en"
                else "数据不足，因此只能对滑点做保守判断。"
            )

        for sep in ("。", "！", "？", ".", "!", "?"):
            idx = text.find(sep)
            if idx > 0:
                text = text[: idx + 1]
                break
        return text[:120].strip()

    def _build_derived_context(self, payload_input: dict[str, Any]) -> dict[str, Any]:
        pool = payload_input.get("pool") or {}
        trade_in = self._to_decimal(payload_input.get("token_pay_amount"))
        reserve_in = self._to_decimal(pool.get("token_pay_amount"))
        reserve_out = self._to_decimal(pool.get("token_get_amount"))

        if (
            trade_in is None
            or reserve_in is None
            or reserve_out is None
            or trade_in <= 0
            or reserve_in <= 0
            or reserve_out <= 0
        ):
            return {
                "has_required_amounts": False,
                "estimated_slippage_pct": 0.0,
                "assumption": "insufficient_data",
            }

        spot_price = reserve_out / reserve_in
        output_after_trade = reserve_out - (reserve_in * reserve_out / (reserve_in + trade_in))
        if output_after_trade <= 0:
            return {
                "has_required_amounts": False,
                "estimated_slippage_pct": 0.0,
                "assumption": "invalid_output",
            }

        execution_price = output_after_trade / trade_in
        slippage_pct = max(Decimal("0"), (spot_price - execution_price) / spot_price * Decimal("100"))

        return {
            "has_required_amounts": True,
            "assumption": "constant_product_amm",
            "spot_price": float(spot_price),
            "execution_price": float(execution_price),
            "estimated_slippage_pct": float(round(slippage_pct, 6)),
            "pool_type": pool.get("type") or "AMM",
            "price_impact_pct": pool.get("price_impact_pct"),
        }

    def _build_user_prompt_en(
        self,
        task: str,
        pool_address: Any,
        token_pay_amount: Any,
        pool_type: Any,
        pool_token_pay_amount: Any,
        pool_token_get_amount: Any,
        price_impact_pct: Any,
        derived: dict[str, Any],
        flat_block: str,
    ) -> str:
        return (
            f"Task: {task}\n"
            "Trade Context:\n"
            f"- pool_address={pool_address}\n"
            f"- token_pay_amount={token_pay_amount}\n"
            f"- pool_type={pool_type}\n"
            f"- pool.token_pay_amount={pool_token_pay_amount}\n"
            f"- pool.token_get_amount={pool_token_get_amount}\n"
            f"- pool.price_impact_pct={price_impact_pct}\n"
            "Precomputed AMM Context:\n"
            f"- derived_context={derived}\n"
            "Rules:\n"
            "- Use AMM constant-product reasoning from provided amounts.\n"
            "- slippage_level must be one of: high | medium | low | unknown.\n"
            "- summary must be one plain-language sentence explaining why this slippage happens.\n"
            "- If key inputs are missing/invalid, return slippage_level=unknown and explain insufficient data.\n"
            "- If pool.type is not AMM, keep AMM assumption and mention it in summary.\n"
            "- Do not output any extra fields.\n\n"
            "Raw Request Snapshot:\n"
            f"{flat_block if flat_block else '<no_fields>'}"
        )

    def _build_user_prompt_zh(
        self,
        task: str,
        pool_address: Any,
        token_pay_amount: Any,
        pool_type: Any,
        pool_token_pay_amount: Any,
        pool_token_get_amount: Any,
        price_impact_pct: Any,
        derived: dict[str, Any],
        flat_block: str,
    ) -> str:
        return (
            f"任务: {task}\n"
            "交易上下文:\n"
            f"- pool_address={pool_address}\n"
            f"- token_pay_amount={token_pay_amount}\n"
            f"- pool_type={pool_type}\n"
            f"- pool.token_pay_amount={pool_token_pay_amount}\n"
            f"- pool.token_get_amount={pool_token_get_amount}\n"
            f"- pool.price_impact_pct={price_impact_pct}\n"
            "预计算 AMM 上下文:\n"
            f"- derived_context={derived}\n"
            "规则:\n"
            "- 基于给定数量按 AMM 常乘积思路估算滑点。\n"
            "- slippage_level 必须是定性等级：高/中/低/未知 或 high/medium/low/unknown。\n"
            "- summary 必须是一句通俗解释“为什么会发生这种滑点”。\n"
            "- 关键输入缺失或无效时，返回 slippage_level=未知（或 unknown），并说明数据不足。\n"
            "- 若 pool.type 不是 AMM，仍按 AMM 假设计算并在 summary 中说明。\n"
            "- 不要输出额外字段。\n\n"
            "原始请求快照:\n"
            f"{flat_block if flat_block else '<no_fields>'}"
        )

    def _build_user_prompt(self, task: str, payload_input: dict[str, Any], lang: str = "zh") -> str:
        pool = payload_input.get("pool") or {}
        derived = payload_input.get("derived_context") or {}

        pool_address = payload_input.get("pool_address")
        token_pay_amount = payload_input.get("token_pay_amount")
        pool_type = pool.get("type") or "AMM"
        pool_token_pay_amount = pool.get("token_pay_amount")
        pool_token_get_amount = pool.get("token_get_amount")
        price_impact_pct = pool.get("price_impact_pct")

        flat_block = "\n".join(self._flatten_fields(payload_input))
        if lang == "en":
            return self._build_user_prompt_en(
                task,
                pool_address,
                token_pay_amount,
                pool_type,
                pool_token_pay_amount,
                pool_token_get_amount,
                price_impact_pct,
                derived,
                flat_block,
            )
        return self._build_user_prompt_zh(
            task,
            pool_address,
            token_pay_amount,
            pool_type,
            pool_token_pay_amount,
            pool_token_get_amount,
            price_impact_pct,
            derived,
            flat_block,
        )
