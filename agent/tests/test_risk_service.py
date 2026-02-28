try:
    from service.handlers import RiskService
    from service.models import ContractRiskRequest, PhishingRiskRequest, SlippageRiskRequest
    from service.agents.PhishingAgent import PhishingRiskAgent
except ModuleNotFoundError:
    from agent.service.handlers import RiskService
    from agent.service.models import ContractRiskRequest, PhishingRiskRequest, SlippageRiskRequest
    from agent.service.agents.PhishingAgent import PhishingRiskAgent


def _fallback_service() -> RiskService:
    service = RiskService()
    service._phishing_agent = None
    service._contract_agent = None
    service._slippage_agent = None
    return service


def test_phishing_fallback_default_zh() -> None:
    service = _fallback_service()
    resp = service.phishing(PhishingRiskRequest(address="0xabc"))

    assert resp.risk_level == "未知"
    assert "风险评估" in resp.summary
    assert resp.most_similar_address is None
    assert resp.most_similar_similarity == 0.0
    assert resp.most_similar_transactions == []


def test_contract_fallback_en() -> None:
    service = _fallback_service()
    resp = service.contract(ContractRiskRequest(contract_address="0xdef", lang="en"))

    assert resp.risk_level == "unknown"
    assert "Unable to assess contract risk" in resp.summary
    assert len(resp.top_reasons) == 3


def test_slippage_fallback_lang_switch() -> None:
    service = _fallback_service()

    zh_resp = service.slippage(
        SlippageRiskRequest(
            pool_address="0xpool",
            token_pay_amount="10",
            pool={"token_pay_amount": "1000", "token_get_amount": "900"},
        )
    )
    en_resp = service.slippage(
        SlippageRiskRequest(
            pool_address="0xpool",
            token_pay_amount="10",
            pool={"token_pay_amount": "1000", "token_get_amount": "900"},
            lang="en",
        )
    )

    assert "滑点评估" in zh_resp.summary
    assert "Unable to assess slippage risk" in en_resp.summary
    assert zh_resp.slippage_level == "未知"
    assert en_resp.slippage_level == "unknown"


def test_phishing_similarity_high_signal() -> None:
    agent = PhishingRiskAgent()
    ctx = agent._build_similarity_context(
        {
            "address": "0x1234567890abcdef1234567890abcdef12345678",
            "transactions": [
                {
                    "tx_hash": "0x1",
                    "timestamp": 1,
                    "from_address": "0x1234567890abcdef1234567890abcdef12345670",
                    "to_address": "0x9999999999999999999999999999999999999999",
                    "contract_address": None,
                }
            ],
        }
    )
    assert ctx["candidate_count"] >= 1
    assert ctx["max_similarity"] > 0.55
    assert ctx["most_similar_address"] is not None


def test_phishing_similarity_low_signal() -> None:
    agent = PhishingRiskAgent()
    ctx = agent._build_similarity_context(
        {
            "address": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            "transactions": [
                {
                    "tx_hash": "0x1",
                    "timestamp": 1,
                    "from_address": "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
                    "to_address": "0xcccccccccccccccccccccccccccccccccccccccc",
                    "contract_address": None,
                }
            ],
        }
    )
    assert ctx["candidate_count"] >= 1
    assert ctx["max_similarity"] < 0.3


def test_phishing_similarity_no_transactions() -> None:
    agent = PhishingRiskAgent()
    ctx = agent._build_similarity_context(
        {
            "address": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            "transactions": [],
        }
    )
    assert ctx["candidate_count"] == 0
    assert ctx["max_similarity"] == 0.0
    assert ctx["most_similar_address"] is None
    assert ctx["most_similar_transactions"] == []


def test_phishing_most_similar_transactions_recent_3() -> None:
    agent = PhishingRiskAgent()
    ctx = agent._build_similarity_context(
        {
            "address": "0x1234567890abcdef1234567890abcdef12345678",
            "transactions": [
                {
                    "tx_hash": "0x1",
                    "timestamp": 10,
                    "from_address": "0x1234567890abcdef1234567890abcdef12345670",
                    "to_address": "0x9999999999999999999999999999999999999999",
                },
                {
                    "tx_hash": "0x2",
                    "timestamp": 40,
                    "from_address": "0x1234567890abcdef1234567890abcdef12345670",
                    "to_address": "0x8888888888888888888888888888888888888888",
                },
                {
                    "tx_hash": "0x3",
                    "timestamp": 30,
                    "from_address": "0x7777777777777777777777777777777777777777",
                    "to_address": "0x1234567890abcdef1234567890abcdef12345670",
                },
                {
                    "tx_hash": "0x4",
                    "timestamp": 20,
                    "from_address": "0x1234567890abcdef1234567890abcdef12345670",
                    "to_address": "0x6666666666666666666666666666666666666666",
                },
            ],
        }
    )
    tx_hashes = [tx["tx_hash"] for tx in ctx["most_similar_transactions"]]
    assert len(tx_hashes) == 3
    assert tx_hashes == ["0x2", "0x3", "0x4"]


def test_phishing_visual_clone_prefix_pair_1() -> None:
    agent = PhishingRiskAgent()
    target = agent._normalize_address("0x84BC7EE53E8B2EB827738148b902D45F10eda2B9")
    phishing = agent._normalize_address("0xB487caC8C0A54a18744C5Efe040146B41Af9A7c8")

    score = agent._weighted_similarity(target, phishing)
    assert score["head_bag_similarity_6"] >= 0.8
    assert score["similarity"] >= 0.8


def test_phishing_visual_clone_prefix_pair_2() -> None:
    agent = PhishingRiskAgent()
    target = agent._normalize_address("0xB8e8De89C501ae4d56170213258D54222763dC73")
    phishing = agent._normalize_address("0x88eBDbd3b394fc1FF32fA974230FF399A94D3e22")

    score = agent._weighted_similarity(target, phishing)
    assert score["head_bag_similarity_6"] >= 0.8
    assert score["similarity"] >= 0.8


def test_phishing_summary_sanitize_internal_metric_terms_zh() -> None:
    agent = PhishingRiskAgent()
    ctx = {"most_similar_address": "0xabc", "most_similar_similarity": 0.8333}
    summary = "head_bag_similarity_6达到0.8333，超过0.82阈值，存在钓鱼风险。"

    sanitized = agent._sanitize_user_summary(summary, "高", "zh", ctx)
    assert "head_bag_similarity_6" not in sanitized
    assert "阈值" not in sanitized
    assert "0.8333" not in sanitized
    assert "0.82" not in sanitized


def test_phishing_summary_sanitize_internal_metric_terms_en() -> None:
    agent = PhishingRiskAgent()
    ctx = {"most_similar_address": "0xabc", "most_similar_similarity": 0.8333}
    summary = "max_similarity is 0.84 and above threshold 0.82, so this is high risk."

    sanitized = agent._sanitize_user_summary(summary, "high", "en", ctx)
    assert "max_similarity" not in sanitized.lower()
    assert "threshold" not in sanitized.lower()
    assert "0.84" not in sanitized
    assert "0.82" not in sanitized
