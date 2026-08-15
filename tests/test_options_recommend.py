from __future__ import annotations

from market_predictor.data_providers.types import OptionQuote, OptionsChain
from market_predictor.options_recommend import recommend_option_contracts


def _quote(symbol: str, *, bid: float, ask: float, oi: float, volume: float) -> OptionQuote:
    return OptionQuote(
        symbol=symbol,
        underlying="AAPL",
        expiration="2026-09-18",
        strike=200,
        right="call",
        bid=bid,
        ask=ask,
        mid=(bid + ask) / 2,
        implied_vol=0.3,
        delta=0.5,
        open_interest=oi,
        volume=volume,
    )


def test_options_screen_rejects_illiquid_quotes():
    chain = OptionsChain(
        underlying="AAPL",
        as_of="2026-08-14",
        spot=200,
        provider="fixture",
        quotes=[_quote("WIDE", bid=1, ask=3, oi=1, volume=0)],
    )

    result = recommend_option_contracts(chain, 0.65, 0.03, 0.04, 5)

    assert result["available"] is False
    assert result["rejectedCount"] == 1


def test_options_screen_surfaces_defined_debit_risk():
    chain = OptionsChain(
        underlying="AAPL",
        as_of="2026-08-14",
        spot=200,
        provider="fixture",
        quotes=[_quote("LIQUID", bid=4.8, ask=5.2, oi=500, volume=100)],
    )

    result = recommend_option_contracts(chain, 0.65, 0.03, 0.04, 5)

    assert result["available"] is True
    assert result["contracts"][0]["maxLoss"] == 500
    assert result["contracts"][0]["eligible"] is True
    assert "not a personalized recommendation" in result["riskDisclosure"]


def test_options_screen_uses_volume_when_open_interest_is_unavailable():
    quote = _quote("EOD", bid=4.8, ask=5.2, oi=0, volume=100)
    quote = OptionQuote(
        symbol=quote.symbol,
        underlying=quote.underlying,
        expiration=quote.expiration,
        strike=quote.strike,
        right=quote.right,
        bid=quote.bid,
        ask=quote.ask,
        mid=quote.mid,
        implied_vol=quote.implied_vol,
        delta=quote.delta,
        open_interest=None,
        volume=quote.volume,
    )
    chain = OptionsChain(
        underlying="AAPL",
        as_of="2026-08-13",
        spot=200,
        provider="thetadata",
        quotes=[quote],
    )

    result = recommend_option_contracts(chain, 0.65, 0.03, 0.04, 5)

    assert result["available"] is True
    assert result["filters"]["openInterestApplied"] is False
    assert result["filters"]["volumeApplied"] is True
    assert "Open interest was unavailable" in result["methodology"]
