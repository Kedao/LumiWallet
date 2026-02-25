#!/usr/bin/env python3
"""
Run after starting API server, for example:
  cd agent && uv run service/main.py
Then in another shell:
  cd agent && python tests/integration_api_test.py
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


def assert_slippage_response(data: dict[str, Any], path: str) -> None:
    required = [
        "expected_slippage_pct",
        "exceed_slippage_probability_label",
        "summary",
        "key_factors",
        "market_context",
    ]
    for key in required:
        if key not in data:
            raise AssertionError(f"{path} missing field: {key}")
    if not isinstance(data["key_factors"], list) or len(data["key_factors"]) < 2:
        raise AssertionError(f"{path} key_factors should contain at least 2 items")


def build_phishing_payload() -> dict[str, Any]:
    return {
        "address": "0xA11ce0000000000000000000000000000000BEEF",
        "chain": "monad",
        "lang": "zh",
        "interaction_type": "transfer",
        "transactions": [
            {
                "tx_hash": "0x1111",
                "timestamp": 1739001000,
                "from_address": "0xA11ce0000000000000000000000000000000BEEF",
                "to_address": "0xC0ffee000000000000000000000000000000dEaD",
                "value": "125000000000000000",
                "token_address": None,
                "token_decimals": 18,
                "tx_type": "transfer",
                "contract_address": None,
                "method_sig": None,
                "success": False,
            },
            {
                "tx_hash": "0x2222",
                "timestamp": 1739001600,
                "from_address": "0xA11ce0000000000000000000000000000000BEEF",
                "to_address": "0xC0ffee000000000000000000000000000000dEaD",
                "value": "89000000000000000",
                "token_address": None,
                "token_decimals": 18,
                "tx_type": "transfer",
                "contract_address": None,
                "method_sig": None,
                "success": False,
            },
            {
                "tx_hash": "0x3333",
                "timestamp": 1739002200,
                "from_address": "0xA11ce0000000000000000000000000000000BEEF",
                "to_address": "0xC0ffee000000000000000000000000000000dEaD",
                "value": "54000000000000000",
                "token_address": None,
                "token_decimals": 18,
                "tx_type": "transfer",
                "contract_address": None,
                "method_sig": None,
                "success": True,
            },
        ],
        "lifecycle": {
            "first_seen_timestamp": 1738999000,
            "last_seen_timestamp": 1739002200,
            "active_days": 1,
            "account_age_days": 2,
            "gas_funder": "0xFunder000000000000000000000000000000000001",
        },
        "tags": [
            {"source": "community", "label": "phishing", "confidence": 0.89, "url": "https://example.com/tag/phishing"},
            {"source": "internal", "label": "drainer-related", "confidence": 0.72, "url": None},
        ],
        "extra_features": {"same_recipient_count_24h": 19},
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
        "token_in": "0xTokenIn0000000000000000000000000000001",
        "token_out": "0xTokenOut000000000000000000000000000001",
        "amount_in": "25000000000000000000",
        "time_window": "5m",
        "trade_type": "exact_in",
        "interaction_type": "swap",
        "orderbook": {
            "bids": [
                {"price": "0.9972", "amount": "1800"},
                {"price": "0.9966", "amount": "1600"},
            ],
            "asks": [
                {"price": "1.0032", "amount": "900"},
                {"price": "1.0048", "amount": "700"},
            ],
            "spread_bps": 120.0,
        },
        "pool": {
            "liquidity": 8500.0,
            "volume_5m": 23000.0,
            "volume_1h": 128000.0,
            "price_impact_pct": 3.4,
        },
        "extra_features": {"expected_blocks_to_fill": 2},
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Integration test for LumiWallet risk API endpoints.")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000", help="Risk service base URL")
    parser.add_argument("--timeout", type=float, default=20.0, help="HTTP timeout seconds")
    args = parser.parse_args()

    print(f"[INFO] Base URL: {args.base_url}")

    cases = [
        ("/risk/phishing", build_phishing_payload(), assert_security_response),
        ("/risk/contract", build_contract_payload(), assert_security_response),
        ("/risk/slippage", build_slippage_payload(), assert_slippage_response),
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
