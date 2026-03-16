"""
Screener Service - Technical analysis screening using TA-Lib.

Indicators:
  - EMA 20/50 crossover (trend)
  - RSI(14) (momentum)
  - MACD(12,26,9) (momentum/trend)

Candlestick Patterns:
  - Hammer (bullish reversal)
  - Bullish/Bearish Engulfing
  - Shooting Star (bearish reversal)
  - Doji (indecision)
  - Morning Star (bullish reversal)
  - Evening Star (bearish reversal)
"""

from datetime import datetime
from typing import Any

import numpy as np
import pandas as pd

from services.history_service import get_history
from utils.logging import get_logger

logger = get_logger(__name__)

try:
    import talib

    TALIB_AVAILABLE = True
except ImportError:
    TALIB_AVAILABLE = False
    logger.warning(
        "TA-Lib not installed. Screener will not work. "
        "Install with: sudo apt-get install ta-lib && uv add ta-lib"
    )

MIN_CANDLES = 52  # Need at least 52 for MACD(26) + signal(9) + buffer
VOLUME_AVG_PERIOD = 20  # Lookback period for average volume
PULLBACK_TOLERANCE = 0.02  # 2% band around EMA20 for pullback detection


def _safe_float(val: Any) -> float | None:
    """Convert numpy float to Python float, returning None for NaN."""
    if val is None:
        return None
    try:
        f = float(val)
        return None if np.isnan(f) else round(f, 4)
    except (TypeError, ValueError):
        return None


def _safe_int(val: Any) -> int | None:
    """Convert numpy/pandas int to native Python int."""
    if val is None:
        return None
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


def _enrich_pattern_hit(
    i: int,
    bias: str,
    close: np.ndarray,
    volume: np.ndarray,
    ema20: np.ndarray,
    ema50: np.ndarray,
    rsi: np.ndarray,
    macd_hist: np.ndarray,
) -> dict[str, Any]:
    """
    Compute confirmation signals for a pattern candle at index i.

    Returns volume ratio/signal plus two independent trend-alignment readings:
      - trend_strict   : pattern bias matches EMA20/50 direction at that candle
      - trend_pullback : macro trend matches bias AND price is pulling back to EMA20
                         (within PULLBACK_TOLERANCE %) — better for buy-the-dip setups
    Also returns RSI and MACD histogram direction alignment.
    """
    # ── Volume ───────────────────────────────────────────────────────────────
    vol_ratio: float | None = None
    vol_signal = "unknown"
    if i > 0 and not np.isnan(volume[i]) and volume[i] > 0:
        window = volume[max(0, i - VOLUME_AVG_PERIOD) : i]
        window = window[~np.isnan(window)]
        window = window[window > 0]
        if len(window) > 0:
            avg = float(np.mean(window))
            if avg > 0:
                vol_ratio = round(float(volume[i]) / avg, 2)
                vol_signal = "high" if vol_ratio >= 1.5 else ("low" if vol_ratio < 0.7 else "normal")

    # ── EMA snapshot ─────────────────────────────────────────────────────────
    e20 = float(ema20[i]) if not np.isnan(ema20[i]) else None
    e50 = float(ema50[i]) if not np.isnan(ema50[i]) else None
    c = float(close[i])

    # ── Trend alignment — strict ──────────────────────────────────────────────
    # Bullish: EMA20 > EMA50 (uptrend); Bearish: EMA20 < EMA50 (downtrend)
    trend_strict: bool | None = None
    if e20 is not None and e50 is not None:
        if bias == "bullish":
            trend_strict = bool(e20 > e50)
        elif bias == "bearish":
            trend_strict = bool(e20 < e50)
        else:
            trend_strict = True  # neutral patterns always pass

    # ── Trend alignment — pullback-aware ─────────────────────────────────────
    # Bullish: macro uptrend (EMA20>EMA50) AND price at/below EMA20 + tolerance
    #          → stock is pulling back in an uptrend — higher-quality buy signal
    # Bearish: macro downtrend (EMA20<EMA50) AND price at/above EMA20 - tolerance
    #          → stock is bouncing in a downtrend — higher-quality sell signal
    trend_pullback: bool | None = None
    if e20 is not None and e50 is not None:
        if bias == "bullish":
            trend_pullback = bool(e20 > e50 and c <= e20 * (1 + PULLBACK_TOLERANCE))
        elif bias == "bearish":
            trend_pullback = bool(e20 < e50 and c >= e20 * (1 - PULLBACK_TOLERANCE))
        else:
            trend_pullback = True

    # ── RSI alignment ────────────────────────────────────────────────────────
    # Bullish: RSI < 55 (not overbought — has room to run upward)
    # Bearish: RSI > 45 (not oversold — has room to fall further)
    rsi_aligned: bool | None = None
    if not np.isnan(rsi[i]):
        r = float(rsi[i])
        if bias == "bullish":
            rsi_aligned = bool(r < 55)
        elif bias == "bearish":
            rsi_aligned = bool(r > 45)
        else:
            rsi_aligned = True

    # ── MACD histogram direction ──────────────────────────────────────────────
    # A rising histogram (even while negative) = building bullish momentum
    # A falling histogram (even while positive) = building bearish momentum
    macd_aligned: bool | None = None
    if i > 0 and not np.isnan(macd_hist[i]) and not np.isnan(macd_hist[i - 1]):
        mh, mh_prev = float(macd_hist[i]), float(macd_hist[i - 1])
        if bias == "bullish":
            macd_aligned = bool(mh > mh_prev)
        elif bias == "bearish":
            macd_aligned = bool(mh < mh_prev)
        else:
            macd_aligned = True

    return {
        "volume_ratio": vol_ratio,
        "volume_signal": vol_signal,
        "trend_strict": trend_strict,
        "trend_pullback": trend_pullback,
        "rsi_aligned": rsi_aligned,
        "macd_aligned": macd_aligned,
    }


def _build_series(timestamps: list, closes: np.ndarray, values: np.ndarray, key: str) -> list[dict]:
    """Build a list of {timestamp, close, <key>} dicts for the last N data points."""
    n = len(timestamps)
    result = []
    for i in range(n):
        idx = -(n - i)
        result.append(
            {
                "timestamp": timestamps[i],
                "close": _safe_float(closes[idx]),
                key: _safe_float(values[idx]),
            }
        )
    return result


def analyze_symbol(
    symbol: str,
    exchange: str,
    interval: str,
    start_date: str,
    end_date: str,
    api_key: str | None = None,
    source: str = "api",
) -> tuple[bool, dict, int]:
    """
    Run full technical analysis on a symbol using TA-Lib.

    Returns:
        (success, response_dict, http_status_code)
    """
    if not TALIB_AVAILABLE:
        return (
            False,
            {
                "status": "error",
                "message": "TA-Lib is not installed. Run: sudo apt-get install ta-lib && uv add ta-lib",
            },
            500,
        )

    # 1. Fetch OHLCV
    success, response, code = get_history(
        symbol=symbol,
        exchange=exchange,
        interval=interval,
        start_date=start_date,
        end_date=end_date,
        api_key=api_key,
        source=source,
    )
    if not success:
        return False, response, code

    raw_data = response.get("data", [])
    if len(raw_data) < MIN_CANDLES:
        return (
            False,
            {
                "status": "error",
                "message": (
                    f"Not enough data: got {len(raw_data)} candles, need at least {MIN_CANDLES}. "
                    "Extend your date range."
                ),
            },
            400,
        )

    df = pd.DataFrame(raw_data)
    df = df.sort_values("timestamp").reset_index(drop=True)

    open_ = df["open"].values.astype(float)
    high = df["high"].values.astype(float)
    low = df["low"].values.astype(float)
    close = df["close"].values.astype(float)
    volume = df["volume"].values.astype(float) if "volume" in df.columns else np.full(len(df), np.nan)

    # Use last 30 candles for display tables
    display_n = min(30, len(close))
    display_timestamps = [_safe_int(t) for t in df["timestamp"].tolist()[-display_n:]]

    result: dict[str, Any] = {
        "symbol": symbol.upper(),
        "exchange": exchange.upper(),
        "interval": interval,
        "candle_count": len(df),
        "first_date": _safe_int(df["timestamp"].iloc[0]),
        "last_date": _safe_int(df["timestamp"].iloc[-1]),
        "close_price": _safe_float(close[-1]),
        "indicators": {},
        "patterns": {},
        "all_patterns": [],
        "summary": {},
    }

    # ─────────────────────────────────────────────
    # EMA 20 / 50
    # ─────────────────────────────────────────────
    ema20 = talib.EMA(close, timeperiod=20)
    ema50 = talib.EMA(close, timeperiod=50)

    ema_signal = "neutral"
    if not np.isnan(ema20[-1]) and not np.isnan(ema50[-1]):
        if ema20[-1] > ema50[-1]:
            ema_signal = "bullish"
        elif ema20[-1] < ema50[-1]:
            ema_signal = "bearish"

    # Detect most recent crossover in last 5 candles
    recent_crossover = None
    for i in range(-5, 0):
        try:
            prev20, curr20 = ema20[i - 1], ema20[i]
            prev50, curr50 = ema50[i - 1], ema50[i]
            if any(np.isnan([prev20, curr20, prev50, curr50])):
                continue
            if prev20 < prev50 and curr20 > curr50:
                recent_crossover = "golden_cross"
            elif prev20 > prev50 and curr20 < curr50:
                recent_crossover = "death_cross"
        except IndexError:
            pass

    ema_data = []
    for i in range(display_n):
        idx = -(display_n - i)
        ema_data.append(
            {
                "timestamp": display_timestamps[i],
                "close": _safe_float(close[idx]),
                "ema20": _safe_float(ema20[idx]),
                "ema50": _safe_float(ema50[idx]),
            }
        )

    result["indicators"]["ema"] = {
        "ema20_current": _safe_float(ema20[-1]),
        "ema50_current": _safe_float(ema50[-1]),
        "signal": ema_signal,
        "recent_crossover": recent_crossover,
        "data": ema_data,
    }

    # ─────────────────────────────────────────────
    # RSI(14)
    # ─────────────────────────────────────────────
    rsi = talib.RSI(close, timeperiod=14)
    rsi_current = float(rsi[-1]) if not np.isnan(rsi[-1]) else 50.0

    if rsi_current <= 35:
        rsi_signal = "oversold"
    elif rsi_current >= 65:
        rsi_signal = "overbought"
    else:
        rsi_signal = "neutral"

    result["indicators"]["rsi"] = {
        "current": _safe_float(rsi[-1]),
        "signal": rsi_signal,
        "data": _build_series(display_timestamps, close, rsi[-display_n:], "rsi"),
    }

    # ─────────────────────────────────────────────
    # MACD(12, 26, 9)
    # ─────────────────────────────────────────────
    macd_line, macd_signal_line, macd_hist = talib.MACD(
        close, fastperiod=12, slowperiod=26, signalperiod=9
    )

    macd_signal = "neutral"
    if not np.isnan(macd_line[-1]) and not np.isnan(macd_signal_line[-1]):
        if macd_line[-1] > macd_signal_line[-1]:
            macd_signal = "bullish"
        elif macd_line[-1] < macd_signal_line[-1]:
            macd_signal = "bearish"

    macd_crossover = None
    for i in range(-5, 0):
        try:
            pm, sm = macd_line[i - 1], macd_signal_line[i - 1]
            cm, cs = macd_line[i], macd_signal_line[i]
            if any(np.isnan([pm, sm, cm, cs])):
                continue
            if pm < sm and cm > cs:
                macd_crossover = "bullish_crossover"
            elif pm > sm and cm < cs:
                macd_crossover = "bearish_crossover"
        except IndexError:
            pass

    macd_data = []
    for i in range(display_n):
        idx = -(display_n - i)
        macd_data.append(
            {
                "timestamp": display_timestamps[i],
                "close": _safe_float(close[idx]),
                "macd": _safe_float(macd_line[idx]),
                "signal_line": _safe_float(macd_signal_line[idx]),
                "histogram": _safe_float(macd_hist[idx]),
            }
        )

    result["indicators"]["macd"] = {
        "macd_current": _safe_float(macd_line[-1]),
        "signal_current": _safe_float(macd_signal_line[-1]),
        "histogram_current": _safe_float(macd_hist[-1]),
        "signal": macd_signal,
        "recent_crossover": macd_crossover,
        "data": macd_data,
    }

    # ─────────────────────────────────────────────
    # Candlestick Patterns
    # ─────────────────────────────────────────────
    pattern_defs = {
        "hammer": (talib.CDLHAMMER, "Hammer", "bullish"),
        "engulfing": (talib.CDLENGULFING, "Engulfing", "both"),
        "shooting_star": (talib.CDLSHOOTINGSTAR, "Shooting Star", "bearish"),
        "doji": (talib.CDLDOJI, "Doji", "neutral"),
        "morning_star": (talib.CDLMORNINGSTAR, "Morning Star", "bullish"),
        "evening_star": (talib.CDLEVENINGSTAR, "Evening Star", "bearish"),
    }

    all_hits: list[dict] = []
    timestamps_list = [_safe_int(t) for t in df["timestamp"].tolist()]

    for key, (func, name, default_bias) in pattern_defs.items():
        values = func(open_, high, low, close)
        hits = []
        for i, v in enumerate(values):
            if v == 0:
                continue
            bias = default_bias
            if default_bias == "both":
                bias = "bullish" if v > 0 else "bearish"
            entry = {
                "timestamp": _safe_int(timestamps_list[i]),
                "close": _safe_float(close[i]),
                "strength": int(v),
                "bias": bias,
                **_enrich_pattern_hit(i, bias, close, volume, ema20, ema50, rsi, macd_hist),
            }
            hits.append(entry)
            all_hits.append({"pattern": name, **entry})

        result["patterns"][key] = {
            "name": name,
            "default_bias": default_bias,
            "total_count": len(hits),
            "last_occurrence": hits[-1] if hits else None,
            "recent": hits[-5:],  # Last 5 occurrences
        }

    # Sort all pattern hits newest-first, keep all for chart markers
    all_hits.sort(key=lambda x: x["timestamp"], reverse=True)
    result["all_patterns"] = all_hits

    # ─────────────────────────────────────────────
    # Chart data — full series for visualisation
    # ─────────────────────────────────────────────
    chart_candles = []
    for i in range(len(df)):
        chart_candles.append(
            {
                "t": timestamps_list[i],
                "o": _safe_float(open_[i]),
                "h": _safe_float(high[i]),
                "l": _safe_float(low[i]),
                "c": _safe_float(close[i]),
                "v": _safe_float(volume[i]) if not np.isnan(volume[i]) else None,
            }
        )

    n = len(timestamps_list)
    result["chart_data"] = {
        "candles": chart_candles,
        "ema20": [{"t": timestamps_list[i], "v": _safe_float(ema20[i])} for i in range(n)],
        "ema50": [{"t": timestamps_list[i], "v": _safe_float(ema50[i])} for i in range(n)],
        "rsi": [{"t": timestamps_list[i], "v": _safe_float(rsi[i])} for i in range(n)],
        "macd_line": [{"t": timestamps_list[i], "v": _safe_float(macd_line[i])} for i in range(n)],
        "macd_signal": [{"t": timestamps_list[i], "v": _safe_float(macd_signal_line[i])} for i in range(n)],
        "macd_hist": [{"t": timestamps_list[i], "v": _safe_float(macd_hist[i])} for i in range(n)],
    }

    # ─────────────────────────────────────────────
    # Summary
    # ─────────────────────────────────────────────
    bullish_count = sum(
        1
        for ind in result["indicators"].values()
        if ind.get("signal") in ("bullish", "oversold")
    )
    bearish_count = sum(
        1
        for ind in result["indicators"].values()
        if ind.get("signal") in ("bearish", "overbought")
    )

    if bullish_count > bearish_count:
        overall = "bullish"
    elif bearish_count > bullish_count:
        overall = "bearish"
    else:
        overall = "neutral"

    # Recent pattern bias (last 3 candles)
    recent_pattern_bias = None
    if all_hits:
        most_recent_ts = all_hits[0]["timestamp"]
        last_ts = timestamps_list[-1]
        # If a pattern fired on the last 3 candles, surface it
        last_3 = timestamps_list[-3:]
        recent_hits_last3 = [h for h in all_hits if h["timestamp"] in last_3]
        if recent_hits_last3:
            biases = [h["bias"] for h in recent_hits_last3 if h["bias"] != "neutral"]
            if biases:
                recent_pattern_bias = max(set(biases), key=biases.count)

    result["summary"] = {
        "overall": overall,
        "bullish_signals": bullish_count,
        "bearish_signals": bearish_count,
        "neutral_signals": 3 - bullish_count - bearish_count,
        "close_price": _safe_float(close[-1]),
        "ema_signal": result["indicators"]["ema"]["signal"],
        "rsi_signal": result["indicators"]["rsi"]["signal"],
        "rsi_value": result["indicators"]["rsi"]["current"],
        "macd_signal": result["indicators"]["macd"]["signal"],
        "ema_crossover": recent_crossover,
        "macd_crossover": macd_crossover,
        "recent_pattern": recent_pattern_bias,
        "total_patterns_found": len(all_hits),
    }

    return True, {"status": "success", "data": result}, 200
