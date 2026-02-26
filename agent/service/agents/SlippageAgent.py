from __future__ import annotations

from typing import Any

from ..models import SlippageRiskRequest, SlippageRiskResponse
from .BaseRiskAgent import RiskTaskAgent

SLIPPAGE_SYSTEM_PROMPT_ZH = (
    "你是加密钱包后端的 DEX 滑点风险分析助手。"
    "请基于流动性深度、价差、价格冲击和订单簿信息评估滑点。"
    "请使用中文输出各字段内容。"
    "其中 exceed_slippage_probability_label 表示“超过预期滑点概率”的标签，取值为 高/中/低/未知。"
)

SLIPPAGE_SYSTEM_PROMPT_EN = (
    "You are a DEX execution-risk analyst for a crypto wallet backend. "
    "Estimate slippage risk from liquidity depth, spread, and price impact metrics. "
    "You receive all request fields already expanded in plain text. "
    "Output all fields in English. "
    "Use exceed_slippage_probability_label for probability of exceeding expected slippage: high/medium/low/unknown."
)


class SlippageRiskAgent(RiskTaskAgent):
    def __init__(self) -> None:
        super().__init__(SLIPPAGE_SYSTEM_PROMPT_ZH, [], response_model=SlippageRiskResponse)

    def run(self, req: SlippageRiskRequest) -> SlippageRiskResponse:
        payload = req.model_dump()
        lang = self._normalize_lang(payload.get("lang"))
        orderbook = payload.get("orderbook") or {}
        bids = orderbook.get("bids") or []
        asks = orderbook.get("asks") or []
        payload["derived_context"] = {
            "order_count": len(bids) + len(asks),
            "bid_levels": len(bids),
            "ask_levels": len(asks),
            "has_pool_stats": bool(payload.get("pool")),
            "has_orderbook": bool(orderbook),
        }
        data = self.run_payload("slippage_risk", payload, lang=lang)
        return data if isinstance(data, SlippageRiskResponse) else SlippageRiskResponse.model_validate(data)

    def _system_prompt_for_lang(self, lang: str) -> str:
        return SLIPPAGE_SYSTEM_PROMPT_EN if lang == "en" else SLIPPAGE_SYSTEM_PROMPT_ZH

    def _build_user_prompt_en(
        self,
        task: str,
        pool_address: Any,
        token_in: Any,
        token_out: Any,
        amount_in: Any,
        trade_type: Any,
        time_window: Any,
        liquidity: Any,
        volume_5m: Any,
        volume_1h: Any,
        spread_bps: Any,
        impact_pct: Any,
        order_count: Any,
        bid_levels: Any,
        ask_levels: Any,
        flat_block: str,
    ) -> str:
        return (
            f"Task: {task}\n"
            "Trade Context:\n"
            f"- pool_address={pool_address}, token_in={token_in}, token_out={token_out}\n"
            f"- amount_in={amount_in}, trade_type={trade_type}, time_window={time_window}\n"
            "Signal Summary:\n"
            f"- liquidity={liquidity}, volume_5m={volume_5m}, volume_1h={volume_1h}\n"
            f"- spread_bps={spread_bps}, price_impact_pct={impact_pct}\n"
            f"- order_count={order_count}, bid_levels={bid_levels}, ask_levels={ask_levels}\n"
            "Interpretation Hints:\n"
            "- Use raw numeric values directly; do not convert numbers into categorical bands.\n"
            "- As rough guidance, spread_bps > 100 or price_impact_pct > 3 often implies elevated slippage risk.\n"
            "- Fewer order levels/order_count imply shallower book depth and higher execution uncertainty.\n"
            "- When market data is missing, keep risk probability conservative and explain uncertainty.\n\n"
            "Raw Request Snapshot:\n"
            f"{flat_block if flat_block else '<no_fields>'}"
        )

    def _build_user_prompt_zh(
        self,
        task: str,
        pool_address: Any,
        token_in: Any,
        token_out: Any,
        amount_in: Any,
        trade_type: Any,
        time_window: Any,
        liquidity: Any,
        volume_5m: Any,
        volume_1h: Any,
        spread_bps: Any,
        impact_pct: Any,
        order_count: Any,
        bid_levels: Any,
        ask_levels: Any,
        flat_block: str,
    ) -> str:
        return (
            f"任务: {task}\n"
            "交易上下文:\n"
            f"- pool_address={pool_address}, token_in={token_in}, token_out={token_out}\n"
            f"- amount_in={amount_in}, trade_type={trade_type}, time_window={time_window}\n"
            "信号汇总:\n"
            f"- liquidity={liquidity}, volume_5m={volume_5m}, volume_1h={volume_1h}\n"
            f"- spread_bps={spread_bps}, price_impact_pct={impact_pct}\n"
            f"- order_count={order_count}, bid_levels={bid_levels}, ask_levels={ask_levels}\n"
            "解释提示:\n"
            "- 直接使用原始数值，不要把数值强行离散为等级标签。\n"
            "- 经验上 spread_bps > 100 或 price_impact_pct > 3 往往意味着更高滑点风险。\n"
            "- 订单档位少、order_count 偏低通常代表深度不足和执行不确定性更高。\n"
            "- 当市场数据缺失时，应保守估计概率并明确说明不确定性。\n\n"
            "原始请求快照:\n"
            f"{flat_block if flat_block else '<no_fields>'}"
        )

    def _build_user_prompt(self, task: str, payload_input: dict[str, Any], lang: str = "zh") -> str:
        pool = payload_input.get("pool") or {}
        orderbook = payload_input.get("orderbook") or {}
        derived = payload_input.get("derived_context") or {}

        pool_address = payload_input.get("pool_address")
        token_in = payload_input.get("token_in")
        token_out = payload_input.get("token_out")
        amount_in = payload_input.get("amount_in")
        time_window = payload_input.get("time_window")
        trade_type = payload_input.get("trade_type")

        liquidity = pool.get("liquidity")
        volume_5m = pool.get("volume_5m")
        volume_1h = pool.get("volume_1h")
        spread_bps = orderbook.get("spread_bps")
        impact_pct = pool.get("price_impact_pct")
        order_count = derived.get("order_count")

        flat_block = "\n".join(self._flatten_fields(payload_input))
        if lang == "en":
            return self._build_user_prompt_en(
                task,
                pool_address,
                token_in,
                token_out,
                amount_in,
                trade_type,
                time_window,
                liquidity,
                volume_5m,
                volume_1h,
                spread_bps,
                impact_pct,
                order_count,
                derived.get("bid_levels"),
                derived.get("ask_levels"),
                flat_block,
            )
        return self._build_user_prompt_zh(
            task,
            pool_address,
            token_in,
            token_out,
            amount_in,
            trade_type,
            time_window,
            liquidity,
            volume_5m,
            volume_1h,
            spread_bps,
            impact_pct,
            order_count,
            derived.get("bid_levels"),
            derived.get("ask_levels"),
            flat_block,
        )
