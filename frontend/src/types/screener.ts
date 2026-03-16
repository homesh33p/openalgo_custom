export type SignalType = 'bullish' | 'bearish' | 'neutral' | 'oversold' | 'overbought'
export type BiasType = 'bullish' | 'bearish' | 'neutral' | 'both'

export interface EmaDataPoint {
  timestamp: number
  close: number | null
  ema20: number | null
  ema50: number | null
}

export interface RsiDataPoint {
  timestamp: number
  close: number | null
  rsi: number | null
}

export interface MacdDataPoint {
  timestamp: number
  close: number | null
  macd: number | null
  signal_line: number | null
  histogram: number | null
}

export interface EmaIndicator {
  ema20_current: number | null
  ema50_current: number | null
  signal: SignalType
  recent_crossover: 'golden_cross' | 'death_cross' | null
  data: EmaDataPoint[]
}

export interface RsiIndicator {
  current: number | null
  signal: SignalType
  data: RsiDataPoint[]
}

export interface MacdIndicator {
  macd_current: number | null
  signal_current: number | null
  histogram_current: number | null
  signal: SignalType
  recent_crossover: 'bullish_crossover' | 'bearish_crossover' | null
  data: MacdDataPoint[]
}

export interface PatternHit {
  timestamp: number
  close: number | null
  strength: number
  bias: BiasType
}

export interface PatternResult {
  name: string
  default_bias: BiasType
  total_count: number
  last_occurrence: PatternHit | null
  recent: PatternHit[]
}

export type TrendMode = 'strict' | 'pullback'

export interface AllPatternHit extends PatternHit {
  pattern: string
  // Enrichment fields
  volume_ratio: number | null
  volume_signal: 'high' | 'normal' | 'low' | 'unknown'
  trend_strict: boolean | null
  trend_pullback: boolean | null
  rsi_aligned: boolean | null
  macd_aligned: boolean | null
}

/** Compute confluence score (0–4) for a hit given the active trend mode. */
export function confluenceScore(hit: AllPatternHit, mode: TrendMode): number {
  let score = 0
  if (hit.volume_signal === 'high') score++
  const trendAligned = mode === 'strict' ? hit.trend_strict : hit.trend_pullback
  if (trendAligned === true) score++
  if (hit.rsi_aligned === true) score++
  if (hit.macd_aligned === true) score++
  return score
}

export interface ScreenerSummary {
  overall: SignalType
  bullish_signals: number
  bearish_signals: number
  neutral_signals: number
  close_price: number | null
  ema_signal: SignalType
  rsi_signal: SignalType
  rsi_value: number | null
  macd_signal: SignalType
  ema_crossover: 'golden_cross' | 'death_cross' | null
  macd_crossover: 'bullish_crossover' | 'bearish_crossover' | null
  recent_pattern: BiasType | null
  total_patterns_found: number
}

// Chart data types (compact keys to reduce payload size)
export interface ChartCandle {
  t: number
  o: number | null
  h: number | null
  l: number | null
  c: number | null
  v: number | null
}

export interface ChartPoint {
  t: number
  v: number | null
}

export interface ChartData {
  candles: ChartCandle[]
  ema20: ChartPoint[]
  ema50: ChartPoint[]
  rsi: ChartPoint[]
  macd_line: ChartPoint[]
  macd_signal: ChartPoint[]
  macd_hist: ChartPoint[]
}

export interface ScreenerData {
  symbol: string
  exchange: string
  interval: string
  candle_count: number
  first_date: number
  last_date: number
  close_price: number | null
  indicators: {
    ema: EmaIndicator
    rsi: RsiIndicator
    macd: MacdIndicator
  }
  patterns: {
    hammer: PatternResult
    engulfing: PatternResult
    shooting_star: PatternResult
    doji: PatternResult
    morning_star: PatternResult
    evening_star: PatternResult
  }
  all_patterns: AllPatternHit[]
  chart_data: ChartData
  summary: ScreenerSummary
}

export interface ScreenerResponse {
  status: 'success' | 'error'
  message?: string
  data?: ScreenerData
}

export interface ScreenerRequest {
  apikey: string
  symbol: string
  exchange: string
  interval: string
  start_date: string
  end_date: string
  source?: 'api' | 'db'
}

// Symbol autocomplete
export interface SymbolSuggestion {
  symbol: string
  exchange: string
  name?: string
  brsymbol?: string
}

export interface SymbolSearchRequest {
  apikey: string
  query: string
  exchange?: string
  source?: 'api' | 'db'
}

export interface SymbolSearchResponse {
  status: 'success' | 'error'
  message?: string
  data?: SymbolSuggestion[]
}
