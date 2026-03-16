# OpenAlgo Screener — User Guide

## What it does

The Screener lets you run technical analysis on any single symbol from either a live broker feed or your locally downloaded Historify data. It produces a tabbed view covering trend, momentum, MACD, candlestick patterns, and an interactive chart — all enriched with a confluence scoring system that tells you which signals are worth paying attention to.

---

## Getting started

### 1. Download data (recommended path)

Go to **Historify** (`/react` → menu → Historify) and download the symbol you want to analyse. Daily (`D`) data for 3–5 years gives the best results for the indicators used.

Example: `BHARATFORG` on `BSE`, interval `1d`, last 5 years.

### 2. Open the Screener

Menu → **Screener** (or navigate to `/react` → profile dropdown → Screener).

### 3. Fill in the form

| Field | What to enter |
|-------|---------------|
| **Symbol** | Start typing — autocomplete will suggest matches. Selecting a result also auto-fills the exchange. |
| **Exchange** | NSE, BSE, NSE Index, BSE Index, NFO, BFO |
| **Interval** | Daily is recommended to start. Weekly/Monthly for longer-term views. |
| **From / To** | Date range. Needs **at least 52 candles** — for daily data that means roughly 2.5 months minimum; 1–5 years is typical. |
| **Source** | `Live (Broker API)` pulls fresh data from your connected broker. `Local DB (Historify)` uses data you've already downloaded — faster and works offline. |

### 4. Symbol autocomplete

- Type **≥ 2 characters** to trigger search.
- Results come from the master contract DB (Live) or the Historify catalog (Local DB).
- Changing the **Source** or **Exchange** clears suggestions so you always get the right set.
- Selecting a suggestion auto-fills the exchange — no need to set it manually.

### 5. Click Run Screen

Results appear across six tabs. The **Trend Mode** toggle above the tabs applies to both the Chart and Patterns tabs — you can switch it at any time without re-running.

---

## The six result tabs

### Summary
A quick-glance overview:
- **Overall Signal** — majority vote across EMA, RSI, and MACD.
- **Last Close** — current price, candle count, interval.
- **Patterns Found** — total count with most recent bias.
- **Indicator Signals table** — current value, signal badge, and most recent crossover event for each indicator.

---

### Chart
An interactive three-pane chart, all panes **time-synced** (scroll/zoom any pane and the others follow).

| Pane | What's shown |
|------|-------------|
| **Top (price)** | Candlesticks + EMA20 (sky blue line) + EMA50 (orange line) + pattern markers |
| **Middle (RSI)** | RSI(14) in purple; dashed red line at 65 (overbought), dashed green at 35 (oversold) |
| **Bottom (MACD)** | MACD line (blue) + signal line (orange) + histogram bars (green/red) |

**Pattern markers on the price chart:**
- ▲ below bar = bullish pattern; ▼ above bar = bearish pattern.
- **Marker brightness and size reflect the confluence score** of that signal in the active Trend Mode:
  - Large bright arrow → score ≥ 3 (high conviction)
  - Small bright arrow → score 2 (moderate)
  - Small grey arrow → score 0–1 (weak, low confirmation)
- Multiple patterns on the same candle are merged into one marker; the label shows abbreviations of each pattern name.

Switching the **Trend Mode** toggle instantly redraws marker colors — no re-run needed.

---

### Trend
EMA 20/50 crossover table — last 30 candles in reverse chronological order.

- **EMA20 > EMA50** = bullish (uptrend). Spread column goes green.
- **EMA20 < EMA50** = bearish (downtrend). Spread column goes red.
- A **Golden Cross** (EMA20 crosses above EMA50) is historically a bullish continuation signal.
- A **Death Cross** (EMA20 crosses below EMA50) is a bearish signal.

**How to read it for trading:** Look for the Golden Cross combined with price pulling back to the EMA20 line and a bullish candlestick pattern — that combination is the Pullback-Aware mode's ideal scenario.

---

### Momentum
RSI(14) table — last 30 candles.

| RSI zone | Meaning |
|----------|---------|
| < 35 | Oversold — selling pressure may be exhausting; look for bullish patterns here |
| 35–65 | Neutral range — trend continuation likely |
| > 65 | Overbought — buying pressure extended; look for bearish patterns here |

**How to use it:** RSI alone is not a signal. Use it to confirm pattern signals. A Hammer at RSI 28 is more reliable than a Hammer at RSI 60.

---

### MACD
MACD(12, 26, 9) table — last 30 candles.

- **MACD line > Signal line** and histogram positive = bullish momentum.
- **Histogram turning from negative to less negative** (rising bars while still below zero) = early sign that selling momentum is fading — often precedes a reversal.
- A **bullish crossover** (MACD crosses above signal) is a buy signal; **bearish crossover** is a sell signal.

**How to use it:** MACD histogram direction (rising or falling) is what the confluence scorer uses — it catches early momentum shifts before the actual line crossover.

---

### Patterns
The most information-dense tab. Shows all detected candlestick patterns enriched with confirmation signals.

#### Pattern summary cards (top row)
Each pattern type shows total occurrences and the date of the last occurrence.

| Pattern | Bias | What it signals |
|---------|------|-----------------|
| **Hammer** | Bullish | Buyers pushed back hard against sellers; often a bottom reversal |
| **Engulfing** | Bullish or Bearish | A candle that completely engulfs the prior candle; strong conviction shift |
| **Shooting Star** | Bearish | Long upper wick after a rally; sellers drove price back down |
| **Doji** | Neutral | Open and close nearly equal; indecision, possible trend pause |
| **Morning Star** | Bullish | Three-candle reversal pattern; bottom with follow-through confirmation |
| **Evening Star** | Bearish | Three-candle reversal pattern; top with follow-through confirmation |

#### Trend Mode toggle
Controls how the **Trend** factor in the confluence score is evaluated:

| Mode | Trend is "aligned" when |
|------|------------------------|
| **Pullback-Aware** *(default)* | Macro trend intact (EMA20 > EMA50 for bullish) AND price has pulled back to within 2% of EMA20. Catches buy-the-dip setups in an uptrend. Generates more signals. |
| **Strict** | EMA20/50 direction simply matches pattern bias. Fewer signals, but each one sits clearly within the trend. Works better in strong trending markets with shallow pullbacks. |

Switch between modes instantly to see how many signals survive each filter. The counter in the controls row updates live.

#### Min score filter
Four buttons: `0+` `1+` `2+` `3+` — filters the timeline to show only patterns at or above that score.

#### Confluence score (0–4)
Each pattern gets one point for each confirmed factor:

| Factor | Bullish aligned when | Bearish aligned when |
|--------|---------------------|---------------------|
| **Volume** | Candle volume ≥ 1.5× the prior 20-candle average | Same threshold |
| **Trend** | Depends on mode (see above) | Mirror of bullish |
| **RSI** | RSI < 55 — not overbought, has room to run | RSI > 45 — not oversold, has room to fall |
| **MACD** | MACD histogram is rising (even if still negative) | Histogram is falling (even if still positive) |

| Score | Label | Meaning |
|-------|-------|---------|
| 0 | None | No confirmation — high noise, likely to fail |
| 1 | Weak | One factor aligns — treat with scepticism |
| 2 | Moderate | Two factors align — worth watching |
| 3 | Strong | Three factors align — meaningful signal |
| 4 | Very Strong | All four factors align — rare, highest quality |

**Row background tinting:** Score ≥3 rows get a faint green background; score 2 rows get faint yellow — easier to scan quickly.

#### Pattern timeline columns

| Column | What it shows |
|--------|--------------|
| Date | Candle date |
| Pattern | Pattern name |
| Close | Closing price on the pattern candle |
| Bias | Bullish / Bearish / Neutral |
| Volume | Ratio vs. 20-period average (e.g. `2.3x` with green dot = high volume) |
| T | Trend aligned (✓/✗) in the active mode |
| R | RSI aligned (✓/✗) |
| M | MACD histogram direction aligned (✓/✗) |
| Score | Numeric chip (0–4) with label |

---

## Understanding the Trend Mode difference

This is the key analytical tool in the screener. The same pattern on the same date gets a different **Trend** point depending on the mode:

**Example — Bullish Engulfing:**
- Stock is in an uptrend (EMA20 > EMA50). Price pulls back slightly and touches EMA20.
  - **Pullback-Aware**: Trend ✓ — this is exactly the setup the mode is designed to catch.
  - **Strict**: Trend ✓ — EMA20 still above EMA50, so it also passes strict.

- Same stock, same pattern, but price is well above EMA20 (no pullback, parabolic move).
  - **Pullback-Aware**: Trend ✗ — price is not near EMA20, so the pullback condition fails.
  - **Strict**: Trend ✓ — EMA20 still above EMA50, passes anyway.

- Stock is in a downtrend (EMA20 < EMA50), gets a bullish engulfing.
  - **Pullback-Aware**: Trend ✗ — macro trend is down, pattern fights the trend.
  - **Strict**: Trend ✗ — same result.

**Practical comparison workflow:**
1. Run the screener on a symbol.
2. Note the **high-conviction count (≥3)** in Pullback-Aware mode.
3. Switch to Strict — count drops (fewer signals, all sitting cleanly within the trend).
4. The signals that survive **both modes** are the highest quality of all.
5. Scroll back through the chart and see how price behaved after each high-scoring signal — this is manual backtesting.

---

## Limitations to keep in mind

- **Candlestick patterns are short-term signals.** They tell you about one or two candles. The confluence score improves reliability but does not guarantee follow-through.
- **Volume data availability depends on your broker/source.** If volume is missing, the Volume factor is marked unknown and contributes 0 to the score — scores will be capped at 3.
- **RSI and MACD need warmup candles.** RSI needs 14 candles, MACD needs 26+9=35 candles before producing values. Patterns in the first ~35 candles of your date range will have `null` for those factors.
- **EMA20/50 need warmup too.** Patterns in the first 50 candles may have `null` for the Trend factor.
- **This screener analyses one symbol at a time.** Batch screening across all symbols on a schedule is a future feature.

---

## Recommended workflow for a new symbol

1. Download 3–5 years of daily data via Historify.
2. Run the screener with Source = `Local DB`.
3. Open the **Chart** tab first — get a visual sense of the overall trend, where the EMAs sit, and where patterns appeared.
4. Switch to the **Patterns** tab. Set Min Score to `2+`. Toggle between Pullback-Aware and Strict — observe how many signals remain in each mode.
5. For each high-conviction signal (score ≥3), look at the date and find it on the chart — see what price did over the next 5–10 candles. This is your manual backtest.
6. Use the **Momentum** tab to understand where RSI was during key moves — are oversold readings reliable turning points for this stock?
7. Use the **MACD** tab to see how the histogram behaved before major rallies and declines.

The goal is to build intuition about **this specific stock's behaviour** before committing capital.
