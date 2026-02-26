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
