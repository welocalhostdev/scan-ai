"""
AI provider pricing helpers.

Gemini prices are from the official Google AI for Developers pricing page,
checked on 2026-05-11: https://ai.google.dev/gemini-api/docs/pricing
Rates are USD per 1M tokens for standard paid API usage.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TokenPrice:
    input_per_1m: float
    output_per_1m: float


GEMINI_TOKEN_PRICES: dict[str, TokenPrice] = {
    "gemini-2.5-flash": TokenPrice(input_per_1m=0.30, output_per_1m=2.50),
    "gemini-2.5-flash-lite": TokenPrice(input_per_1m=0.10, output_per_1m=0.40),
    "gemini-3.1-flash-lite-preview": TokenPrice(input_per_1m=0.25, output_per_1m=1.50),
    "gemini-3.1-pro-preview": TokenPrice(input_per_1m=2.00, output_per_1m=12.00),
    "gemini-3.0-flash": TokenPrice(input_per_1m=0.50, output_per_1m=3.00),
}

MODEL_PRICE_ALIASES = {
    "gemini-1.5-flash": "gemini-2.5-flash-lite",
    "gemini-1.5-pro": "gemini-2.5-flash",
    "gemini-2.0-flash": "gemini-2.5-flash",
    "gemini-2.0-flash-001": "gemini-2.5-flash",
    "gemini-2.0-flash-lite": "gemini-2.5-flash-lite",
    "gemini-2.0-flash-lite-001": "gemini-2.5-flash-lite",
    "google/gemma-4-26b-a4b-it:free": "free",
}


def normalize_pricing_model(model: str | None) -> str:
    normalized = (model or "").strip().lower()
    if not normalized:
        return "gemini-2.5-flash"
    normalized = normalized.removeprefix("models/")
    return MODEL_PRICE_ALIASES.get(normalized, normalized)


def estimate_ai_cost_usd(model: str | None, prompt_tokens: int | None, completion_tokens: int | None) -> float:
    pricing_model = normalize_pricing_model(model)
    if pricing_model == "free":
        return 0.0

    price = GEMINI_TOKEN_PRICES.get(pricing_model)
    if not price:
        price = GEMINI_TOKEN_PRICES["gemini-2.5-flash"]

    input_tokens = max(0, int(prompt_tokens or 0))
    output_tokens = max(0, int(completion_tokens or 0))
    return ((input_tokens / 1_000_000) * price.input_per_1m) + ((output_tokens / 1_000_000) * price.output_per_1m)


def format_usd(value: float) -> str:
    return f"${value:.4f}"
