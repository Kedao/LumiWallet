#!/usr/bin/env python3
"""
Run after starting API server, for example:
  cd agent && uv run service/main.py
Then in another shell:
  cd agent && python tests/integration_api_test_v2.py
"""

import argparse
import json
import sys
import urllib.error
import urllib.request
from typing import Any


def post_json(base_url: str, path: str, payload: dict[str, Any], timeout: float) -> tuple[int, dict[str, Any]]:
    url = f"{base_url.rstrip('/')}{path}"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url=url,
        data=data,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8")
            return resp.status, json.loads(body)
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"HTTP {err.code} for {path}: {body}") from err
    except urllib.error.URLError as err:
        raise RuntimeError(f"Failed to call {path}: {err}") from err


def assert_security_response(data: dict[str, Any], path: str) -> None:
    required = ["risk_level", "summary", "confidence", "top_reasons"]
    for key in required:
        if key not in data:
            raise AssertionError(f"{path} missing field: {key}")
    if not isinstance(data["top_reasons"], list) or len(data["top_reasons"]) != 3:
        raise AssertionError(f"{path} top_reasons should contain exactly 3 items")


def assert_phishing_response_v2(
    data: dict[str, Any],
    path: str,
    *,
    min_similarity: float | None = None,
    max_similarity: float | None = None,
    expect_empty: bool = False,
) -> None:
    required = [
        "risk_level",
        "summary",
        "confidence",
        "most_similar_address",
        "most_similar_similarity",
    ]
    for key in required:
        if key not in data:
            raise AssertionError(f"{path} missing field: {key}")
    if not isinstance(data["most_similar_similarity"], (int, float)):
        raise AssertionError(f"{path} most_similar_similarity should be numeric")
    if data["most_similar_similarity"] < 0 or data["most_similar_similarity"] > 1:
        raise AssertionError(f"{path} most_similar_similarity should be in [0, 1]")
    if expect_empty:
        if data["most_similar_address"] is not None:
            raise AssertionError(f"{path} most_similar_address should be null when no transactions")
        if data["most_similar_similarity"] != 0:
            raise AssertionError(f"{path} most_similar_similarity should be 0 when no transactions")
    else:
        if not data["most_similar_address"]:
            raise AssertionError(f"{path} most_similar_address should not be empty")
    if min_similarity is not None and data["most_similar_similarity"] < min_similarity:
        raise AssertionError(f"{path} most_similar_similarity should be >= {min_similarity}")
    if max_similarity is not None and data["most_similar_similarity"] > max_similarity:
        raise AssertionError(f"{path} most_similar_similarity should be <= {max_similarity}")


def assert_slippage_response_v2(data: dict[str, Any], path: str) -> None:
    for key in ("slippage_level", "summary"):
        if key not in data:
            raise AssertionError(f"{path} missing field: {key}")
    allowed = {"high", "medium", "low", "unknown", "高", "中", "低", "未知"}
    if data["slippage_level"] not in allowed:
        raise AssertionError(f"{path} slippage_level should be one of {sorted(allowed)}")
    if not isinstance(data["summary"], str) or not data["summary"].strip():
        raise AssertionError(f"{path} summary should be non-empty string")
    summary = data["summary"].strip()
    if len(summary) > 120:
        raise AssertionError(f"{path} summary should be concise (<=120 chars)")
    sentence_terminators = [ch for ch in summary if ch in ("。", "！", "？", ".", "!", "?")]
    if len(sentence_terminators) > 1:
        raise AssertionError(f"{path} summary should be a single plain-language sentence")


def build_phishing_payload_high_similarity() -> dict[str, Any]:
    return {
        "address": "0xA11ce0000000000000000000000000000000BEEF",
        "chain": "monad",
        "lang": "zh",
        "transactions": [
            {
                "tx_hash": "0x1111",
                "timestamp": 1739001000,
                "from_address": "0xA11ce0000000000000000000000000000000BEEA",
                "to_address": "0xA11ce0000000000000000000000000000000BEE9",
                "value": "125000000000000000",
                "tx_type": "transfer",
                "contract_address": None,
            },
            {
                "tx_hash": "0x2222",
                "timestamp": 1739001600,
                "from_address": "0xA11ce0000000000000000000000000000000BEE8",
                "to_address": "0xA11ce0000000000000000000000000000000BEE7",
                "value": "89000000000000000",
                "tx_type": "transfer",
                "contract_address": None,
            },
        ],
    }


def build_phishing_payload_low_similarity() -> dict[str, Any]:
    return {
        "address": "0xA11ce0000000000000000000000000000000BEEF",
        "chain": "monad",
        "lang": "zh",
        "transactions": [
            {
                "tx_hash": "0x3333",
                "timestamp": 1739002200,
                "from_address": "0x0000000000000000000000000000000000001111",
                "to_address": "0x9999999999999999999999999999999999998888",
                "contract_address": "0x7777777777777777777777777777777777776666",
            }
        ],
    }


def build_phishing_payload_no_transactions() -> dict[str, Any]:
    return {
        "address": "0xA11ce0000000000000000000000000000000BEEF",
        "chain": "monad",
        "lang": "zh",
        "transactions": [],
    }


def build_contract_payload() -> dict[str, Any]:
    return {
        "contract_address": "0xDeaD00000000000000000000000000000000BEEF",
        "chain": "monad",
        "lang": "zh",
        "interaction_type": "approve",
        "creator": {
            "creator_address": "0xF00d00000000000000000000000000000000CAFE",
            "creation_tx_hash": "0xabcdeff1",
            "creation_timestamp": 1730000000,
        },
        "proxy": {
            "is_proxy": True,
            "implementation_address": "0x1mpl0000000000000000000000000000000CAFE",
            "admin_address": "0xAdm1n0000000000000000000000000000000BEEF",
        },
        "permissions": {
            "owner": "0x0wner000000000000000000000000000000BEEF",
            "admin": "0xAdm1n0000000000000000000000000000000BEEF",
            "can_upgrade": True,
            "can_pause": True,
            "can_blacklist": False,
            "can_mint": True,
            "can_burn": False,
        },
        "token_flags": {
            "has_transfer_tax": True,
            "tax_changeable": True,
            "max_tx_limit": True,
            "max_wallet_limit": False,
            "trading_restrictions": False,
        },
        "code": {
            "verified": False,
            "source_code": None,
            "bytecode": "0x6080604052...",
            "compiler_version": "v0.8.24+commit.e11b9ed9",
            "abi": None,
        },
        "tags": [{"source": "scanner", "label": "high_privilege", "confidence": 0.83, "url": "https://example.com/risk"}],
        "extra_features": {"holders_top10_pct": 78.1},
    }


def build_slippage_payload() -> dict[str, Any]:
    return {
        "pool_address": "0xP00100000000000000000000000000000000BEEF",
        "chain": "monad",
        "lang": "zh",
        "token_pay_amount": "25000000000000000000",
        "interaction_type": "swap",
        "pool": {
            "token_pay_amount": "5000000000000000000000",
            "token_get_amount": "2600000000000000000000",
            "price_impact_pct": 3.4,
            "type": "AMM",
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Integration test v2 for LumiWallet risk API endpoints.")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000", help="Risk service base URL")
    parser.add_argument("--timeout", type=float, default=20.0, help="HTTP timeout seconds")
    args = parser.parse_args()

    print(f"[INFO] Base URL: {args.base_url}")

    cases = [
        (
            "/risk/phishing",
            build_phishing_payload_high_similarity(),
            lambda data, path: assert_phishing_response_v2(data, path, min_similarity=0.7),
        ),
        (
            "/risk/phishing",
            build_phishing_payload_low_similarity(),
            lambda data, path: assert_phishing_response_v2(data, path, max_similarity=0.9),
        ),
        (
            "/risk/phishing",
            build_phishing_payload_no_transactions(),
            lambda data, path: assert_phishing_response_v2(data, path, expect_empty=True),
        ),
        ("/risk/contract", build_contract_payload(), assert_security_response),
        ("/risk/slippage", build_slippage_payload(), assert_slippage_response_v2),
    ]

    for path, payload, validator in cases:
        print(f"[INFO] Testing {path} ...")
        status, data = post_json(args.base_url, path, payload, args.timeout)
        if status != 200:
            raise AssertionError(f"{path} expected HTTP 200, got {status}")
        validator(data, path)
        print(f"[PASS] {path}")
        print(json.dumps(data, ensure_ascii=False, indent=2))

    print("[DONE] All endpoints passed integration checks.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"[FAIL] {exc}", file=sys.stderr)
        raise SystemExit(1)
