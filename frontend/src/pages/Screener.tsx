import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import { Check, ChevronsUpDown, Loader2, Minus, Search, TrendingDown, TrendingUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { screenerApi } from '@/api/screener'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import {
  confluenceScore,
  type AllPatternHit,
  type ChartData,
  type EmaDataPoint,
  type MacdDataPoint,
  type RsiDataPoint,
  type ScreenerData,
  type SignalType,
  type SymbolSuggestion,
  type TrendMode,
} from '@/types/screener'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(ts: number): string {
  if (!ts) return '—'
  const d = new Date(ts * 1000)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function SignalBadge({ signal }: { signal: SignalType | null | undefined }) {
  if (!signal) return <Badge variant="secondary">—</Badge>
  const cfg: Record<SignalType, { label: string; className: string }> = {
    bullish: { label: 'Bullish', className: 'bg-green-600 text-white hover:bg-green-700' },
    oversold: { label: 'Oversold', className: 'bg-green-600 text-white hover:bg-green-700' },
    bearish: { label: 'Bearish', className: 'bg-red-600 text-white hover:bg-red-700' },
    overbought: { label: 'Overbought', className: 'bg-red-600 text-white hover:bg-red-700' },
    neutral: { label: 'Neutral', className: 'bg-slate-500 text-white hover:bg-slate-600' },
  }
  const c = cfg[signal] ?? cfg.neutral
  return <Badge className={c.className}>{c.label}</Badge>
}

function OverallIcon({ signal }: { signal: SignalType | null | undefined }) {
  if (signal === 'bullish' || signal === 'oversold')
    return <TrendingUp className="h-5 w-5 text-green-500" />
  if (signal === 'bearish' || signal === 'overbought')
    return <TrendingDown className="h-5 w-5 text-red-500" />
  return <Minus className="h-5 w-5 text-slate-400" />
}

function CrossoverBadge({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-muted-foreground text-xs">None recent</span>
  const isGolden = value === 'golden_cross' || value === 'bullish_crossover'
  return (
    <span className={`text-xs font-medium ${isGolden ? 'text-green-500' : 'text-red-500'}`}>
      {value === 'golden_cross'
        ? '✦ Golden Cross'
        : value === 'death_cross'
          ? '✦ Death Cross'
          : value === 'bullish_crossover'
            ? '↑ Bullish Cross'
            : '↓ Bearish Cross'}
    </span>
  )
}

// ─── Confluence helpers ────────────────────────────────────────────────────────

const SCORE_COLORS = ['bg-slate-500', 'bg-slate-400', 'bg-yellow-500', 'bg-green-500', 'bg-green-600']
const SCORE_LABELS = ['None', 'Weak', 'Moderate', 'Strong', 'Very Strong']

function ConflChip({ score }: { score: number }) {
  return (
    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white ${SCORE_COLORS[score]}`}>
      {score}
    </span>
  )
}

function VolBadge({ signal, ratio }: { signal: string; ratio: number | null }) {
  const cfg = {
    high: { dot: 'bg-green-500', label: ratio != null ? `${ratio.toFixed(1)}x` : 'High' },
    normal: { dot: 'bg-slate-400', label: ratio != null ? `${ratio.toFixed(1)}x` : 'Avg' },
    low: { dot: 'bg-red-400', label: ratio != null ? `${ratio.toFixed(1)}x` : 'Low' },
    unknown: { dot: 'bg-slate-600', label: '—' },
  }
  const c = cfg[signal as keyof typeof cfg] ?? cfg.unknown
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span className={`w-2 h-2 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  )
}

function AlignDot({ value, label }: { value: boolean | null; label: string }) {
  if (value === null) return <span className="text-[10px] text-muted-foreground">{label}?</span>
  return (
    <span className={`text-[10px] font-medium ${value ? 'text-green-500' : 'text-red-400'}`}>
      {value ? '✓' : '✗'} {label}
    </span>
  )
}

function markerStyle(hit: AllPatternHit, mode: TrendMode): { color: string; size: number } {
  const score = confluenceScore(hit, mode)
  const isBull = hit.bias === 'bullish'
  if (score >= 3) return { color: isBull ? '#22c55e' : '#ef4444', size: 2 }
  if (score === 2) return { color: isBull ? '#86efac' : '#fca5a5', size: 1 }
  return { color: '#64748b', size: 1 }
}

// ─── Chart Component ───────────────────────────────────────────────────────────

function makeChartOpts(container: HTMLDivElement, height: number, isDark: boolean) {
  const gridColor = isDark ? 'rgba(166,173,187,0.07)' : 'rgba(0,0,0,0.07)'
  const borderColor = isDark ? 'rgba(166,173,187,0.2)' : 'rgba(0,0,0,0.2)'
  return {
    width: container.clientWidth,
    height,
    layout: {
      background: { type: ColorType.Solid, color: 'transparent' },
      textColor: isDark ? '#a6adbb' : '#374151',
    },
    grid: { vertLines: { color: gridColor }, horzLines: { color: gridColor } },
    rightPriceScale: { borderColor },
    timeScale: { borderColor, timeVisible: false, secondsVisible: false },
    crosshair: { mode: CrosshairMode.Normal },
    handleScroll: { pressedMouseMove: true },
    handleScale: { mouseWheel: true, pinch: true },
  }
}

function ScreenerChart({
  data,
  isDarkMode,
  trendMode,
}: {
  data: ScreenerData
  isDarkMode: boolean
  trendMode: TrendMode
}) {
  const priceRef = useRef<HTMLDivElement>(null)
  const rsiRef = useRef<HTMLDivElement>(null)
  const macdRef = useRef<HTMLDivElement>(null)
  const chartsRef = useRef<IChartApi[]>([])
  const isSyncingRef = useRef(false)

  useEffect(() => {
    if (!priceRef.current || !rsiRef.current || !macdRef.current) return

    const cd: ChartData = data.chart_data

    // ── Price chart ──────────────────────────────────────────────────────────
    const priceChart = createChart(priceRef.current, makeChartOpts(priceRef.current, 380, isDarkMode))

    const candleSeries: ISeriesApi<'Candlestick'> = priceChart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    })

    const ema20Series: ISeriesApi<'Line'> = priceChart.addSeries(LineSeries, {
      color: '#38bdf8',
      lineWidth: 1,
      title: 'EMA20',
      crosshairMarkerVisible: false,
      lastValueVisible: true,
      priceLineVisible: false,
    })

    const ema50Series: ISeriesApi<'Line'> = priceChart.addSeries(LineSeries, {
      color: '#fb923c',
      lineWidth: 1,
      title: 'EMA50',
      crosshairMarkerVisible: false,
      lastValueVisible: true,
      priceLineVisible: false,
    })

    candleSeries.setData(
      cd.candles
        .filter((c) => c.o != null && c.h != null && c.l != null && c.c != null)
        .map((c) => ({
          time: c.t as UTCTimestamp,
          open: c.o!,
          high: c.h!,
          low: c.l!,
          close: c.c!,
        })),
    )

    ema20Series.setData(
      cd.ema20
        .filter((d) => d.v != null)
        .map((d) => ({ time: d.t as UTCTimestamp, value: d.v! })),
    )

    ema50Series.setData(
      cd.ema50
        .filter((d) => d.v != null)
        .map((d) => ({ time: d.t as UTCTimestamp, value: d.v! })),
    )

    // Pattern markers — sort ascending (required), merge same-candle hits.
    // Color + size are driven by confluence score; high-conviction signals pop visually.
    const sorted = [...data.all_patterns].sort((a, b) => a.timestamp - b.timestamp)
    type MergedMarker = { bias: string; labels: string[]; bestScore: number; bestHit: AllPatternHit }
    const markerMap = new Map<number, MergedMarker>()
    for (const hit of sorted) {
      const score = confluenceScore(hit, trendMode)
      const existing = markerMap.get(hit.timestamp)
      if (existing) {
        existing.labels.push(hit.pattern.substring(0, 3))
        if (score > existing.bestScore) {
          existing.bestScore = score
          existing.bestHit = hit
          if (hit.bias === 'bullish') existing.bias = 'bullish'
          else if (hit.bias === 'bearish' && existing.bias !== 'bullish') existing.bias = 'bearish'
        }
      } else {
        markerMap.set(hit.timestamp, { bias: hit.bias, labels: [hit.pattern.substring(0, 3)], bestScore: score, bestHit: hit })
      }
    }
    const markers = Array.from(markerMap.entries()).map(([ts, m]) => {
      const style = markerStyle(m.bestHit, trendMode)
      return {
        time: ts as UTCTimestamp,
        position: m.bias === 'bullish' ? ('belowBar' as const) : ('aboveBar' as const),
        color: style.color,
        shape: m.bias === 'bullish' ? ('arrowUp' as const) : ('arrowDown' as const),
        size: style.size,
        text: m.labels.join(' '),
      }
    })
    createSeriesMarkers(candleSeries, markers)

    priceChart.timeScale().fitContent()

    // ── RSI chart ────────────────────────────────────────────────────────────
    const rsiChart = createChart(rsiRef.current, makeChartOpts(rsiRef.current, 130, isDarkMode))

    const rsiSeries: ISeriesApi<'Line'> = rsiChart.addSeries(LineSeries, {
      color: '#a78bfa',
      lineWidth: 1,
      title: 'RSI',
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      lastValueVisible: true,
    })

    rsiSeries.setData(
      cd.rsi
        .filter((d) => d.v != null)
        .map((d) => ({ time: d.t as UTCTimestamp, value: d.v! })),
    )

    rsiSeries.createPriceLine({ price: 65, color: '#ef4444', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'OB' })
    rsiSeries.createPriceLine({ price: 35, color: '#22c55e', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'OS' })

    rsiChart.timeScale().fitContent()

    // ── MACD chart ───────────────────────────────────────────────────────────
    const macdChart = createChart(macdRef.current, makeChartOpts(macdRef.current, 130, isDarkMode))

    const macdLineSeries: ISeriesApi<'Line'> = macdChart.addSeries(LineSeries, {
      color: '#38bdf8',
      lineWidth: 1,
      title: 'MACD',
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      lastValueVisible: true,
    })

    const macdSignalSeries: ISeriesApi<'Line'> = macdChart.addSeries(LineSeries, {
      color: '#fb923c',
      lineWidth: 1,
      title: 'Signal',
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      lastValueVisible: true,
    })

    const macdHistSeries: ISeriesApi<'Histogram'> = macdChart.addSeries(HistogramSeries, {
      color: '#22c55e',
      priceLineVisible: false,
      lastValueVisible: false,
    })

    macdLineSeries.setData(
      cd.macd_line
        .filter((d) => d.v != null)
        .map((d) => ({ time: d.t as UTCTimestamp, value: d.v! })),
    )

    macdSignalSeries.setData(
      cd.macd_signal
        .filter((d) => d.v != null)
        .map((d) => ({ time: d.t as UTCTimestamp, value: d.v! })),
    )

    macdHistSeries.setData(
      cd.macd_hist
        .filter((d) => d.v != null)
        .map((d) => ({
          time: d.t as UTCTimestamp,
          value: d.v!,
          color: d.v! >= 0 ? 'rgba(34,197,94,0.7)' : 'rgba(239,68,68,0.7)',
        })),
    )

    macdChart.timeScale().fitContent()

    // ── Time scale sync ───────────────────────────────────────────────────────
    const all3 = [priceChart, rsiChart, macdChart]
    chartsRef.current = all3

    all3.forEach((src, si) => {
      src.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (isSyncingRef.current || !range) return
        isSyncingRef.current = true
        all3.forEach((tgt, ti) => {
          if (ti !== si) tgt.timeScale().setVisibleLogicalRange(range)
        })
        isSyncingRef.current = false
      })
    })

    // ── Resize ────────────────────────────────────────────────────────────────
    const entries = [
      { chart: priceChart, div: priceRef.current!, h: 380 },
      { chart: rsiChart, div: rsiRef.current!, h: 130 },
      { chart: macdChart, div: macdRef.current!, h: 130 },
    ]

    const ro = new ResizeObserver(() => {
      entries.forEach(({ chart, div, h }) => {
        if (div.clientWidth > 0) chart.applyOptions({ width: div.clientWidth, height: h })
      })
    })
    ro.observe(priceRef.current)

    return () => {
      ro.disconnect()
      all3.forEach((c) => c.remove())
      chartsRef.current = []
    }
  }, [data, isDarkMode, trendMode])

  return (
    <div className="space-y-0">
      {/* Price + EMAs + pattern markers */}
      <div ref={priceRef} style={{ height: 380 }} />
      {/* RSI */}
      <div className="border-t border-border/40">
        <p className="text-[10px] text-muted-foreground px-2 pt-1 pb-0">RSI(14) · OB=65 OS=35</p>
        <div ref={rsiRef} style={{ height: 130 }} />
      </div>
      {/* MACD */}
      <div className="border-t border-border/40">
        <p className="text-[10px] text-muted-foreground px-2 pt-1 pb-0">
          MACD(12,26,9) · <span style={{ color: '#38bdf8' }}>MACD</span> ·{' '}
          <span style={{ color: '#fb923c' }}>Signal</span>
        </p>
        <div ref={macdRef} style={{ height: 130 }} />
      </div>
    </div>
  )
}

// ─── Sub-tabs ──────────────────────────────────────────────────────────────────

function SummaryTab({ data }: { data: ScreenerData }) {
  const s = data.summary
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="sm:col-span-1">
          <CardContent className="pt-6 flex flex-col items-center gap-2">
            <OverallIcon signal={s.overall} />
            <p className="text-sm text-muted-foreground">Overall Signal</p>
            <SignalBadge signal={s.overall} />
            <p className="text-xs text-muted-foreground mt-1">
              {s.bullish_signals}B · {s.bearish_signals}Be · {s.neutral_signals}N
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Last Close</p>
            <p className="text-2xl font-semibold">
              {s.close_price != null ? `₹${s.close_price.toLocaleString('en-IN')}` : '—'}
            </p>
            <p className="text-xs text-muted-foreground">
              {data.candle_count} candles · {data.interval} interval
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Patterns Found</p>
            <p className="text-2xl font-semibold">{s.total_patterns_found}</p>
            {s.recent_pattern && (
              <p className="text-xs">
                Recent bias:{' '}
                <span className={s.recent_pattern === 'bullish' ? 'text-green-500' : s.recent_pattern === 'bearish' ? 'text-red-500' : 'text-muted-foreground'}>
                  {s.recent_pattern}
                </span>
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Indicator Signals</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left pb-2 font-medium">Indicator</th>
                <th className="text-left pb-2 font-medium">Value</th>
                <th className="text-left pb-2 font-medium">Signal</th>
                <th className="text-left pb-2 font-medium">Recent Event</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <tr>
                <td className="py-2 font-medium">EMA 20/50</td>
                <td className="py-2 text-muted-foreground text-xs">
                  20: {data.indicators.ema.ema20_current ?? '—'} / 50: {data.indicators.ema.ema50_current ?? '—'}
                </td>
                <td className="py-2"><SignalBadge signal={s.ema_signal} /></td>
                <td className="py-2"><CrossoverBadge value={s.ema_crossover} /></td>
              </tr>
              <tr>
                <td className="py-2 font-medium">RSI(14)</td>
                <td className="py-2 text-muted-foreground text-xs">
                  {s.rsi_value != null ? s.rsi_value.toFixed(2) : '—'}
                </td>
                <td className="py-2"><SignalBadge signal={s.rsi_signal} /></td>
                <td className="py-2 text-xs text-muted-foreground">
                  {s.rsi_value != null && s.rsi_value < 35 ? 'Near oversold zone' : s.rsi_value != null && s.rsi_value > 65 ? 'Near overbought zone' : 'Within normal range'}
                </td>
              </tr>
              <tr>
                <td className="py-2 font-medium">MACD(12,26,9)</td>
                <td className="py-2 text-muted-foreground text-xs">
                  {data.indicators.macd.macd_current ?? '—'} / {data.indicators.macd.signal_current ?? '—'}
                </td>
                <td className="py-2"><SignalBadge signal={s.macd_signal} /></td>
                <td className="py-2"><CrossoverBadge value={s.macd_crossover} /></td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}

function TrendTab({ data }: { data: ScreenerData }) {
  const ema = data.indicators.ema
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">EMA 20/50 Signal:</span>
        <SignalBadge signal={ema.signal} />
        {ema.recent_crossover && <CrossoverBadge value={ema.recent_crossover} />}
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-2 font-medium">Date</th>
                  <th className="text-right px-4 py-2 font-medium">Close</th>
                  <th className="text-right px-4 py-2 font-medium">EMA 20</th>
                  <th className="text-right px-4 py-2 font-medium">EMA 50</th>
                  <th className="text-right px-4 py-2 font-medium">Spread</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[...ema.data].reverse().map((row: EmaDataPoint, i) => {
                  const spread = row.ema20 != null && row.ema50 != null ? (row.ema20 - row.ema50).toFixed(2) : null
                  const isAbove = row.ema20 != null && row.ema50 != null && row.ema20 > row.ema50
                  return (
                    <tr key={i} className="hover:bg-muted/20">
                      <td className="px-4 py-2 text-muted-foreground text-xs">{formatTimestamp(row.timestamp)}</td>
                      <td className="px-4 py-2 text-right font-mono">{row.close?.toFixed(2) ?? '—'}</td>
                      <td className="px-4 py-2 text-right font-mono">{row.ema20?.toFixed(2) ?? '—'}</td>
                      <td className="px-4 py-2 text-right font-mono">{row.ema50?.toFixed(2) ?? '—'}</td>
                      <td className={`px-4 py-2 text-right font-mono text-xs ${isAbove ? 'text-green-500' : 'text-red-500'}`}>
                        {spread ?? '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Showing last {ema.data.length} candles. Positive spread = EMA20 above EMA50 (bullish).
      </p>
    </div>
  )
}

function MomentumTab({ data }: { data: ScreenerData }) {
  const rsi = data.indicators.rsi
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">RSI(14) = {rsi.current?.toFixed(2) ?? '—'}</span>
        <SignalBadge signal={rsi.signal} />
        <span className="text-xs text-muted-foreground">Thresholds: ≤35 oversold · ≥65 overbought</span>
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-2 font-medium">Date</th>
                  <th className="text-right px-4 py-2 font-medium">Close</th>
                  <th className="text-right px-4 py-2 font-medium">RSI</th>
                  <th className="text-right px-4 py-2 font-medium">Zone</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[...rsi.data].reverse().map((row: RsiDataPoint, i) => {
                  const zone = row.rsi == null ? '—' : row.rsi <= 35 ? 'Oversold' : row.rsi >= 65 ? 'Overbought' : 'Neutral'
                  const zoneColor = zone === 'Oversold' ? 'text-green-500' : zone === 'Overbought' ? 'text-red-500' : 'text-muted-foreground'
                  return (
                    <tr key={i} className="hover:bg-muted/20">
                      <td className="px-4 py-2 text-muted-foreground text-xs">{formatTimestamp(row.timestamp)}</td>
                      <td className="px-4 py-2 text-right font-mono">{row.close?.toFixed(2) ?? '—'}</td>
                      <td className="px-4 py-2 text-right font-mono">{row.rsi?.toFixed(2) ?? '—'}</td>
                      <td className={`px-4 py-2 text-right text-xs font-medium ${zoneColor}`}>{zone}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function MacdTab({ data }: { data: ScreenerData }) {
  const macd = data.indicators.macd
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">MACD(12,26,9) Signal:</span>
        <SignalBadge signal={macd.signal} />
        {macd.recent_crossover && <CrossoverBadge value={macd.recent_crossover} />}
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-4 py-2 font-medium">Date</th>
                  <th className="text-right px-4 py-2 font-medium">Close</th>
                  <th className="text-right px-4 py-2 font-medium">MACD</th>
                  <th className="text-right px-4 py-2 font-medium">Signal</th>
                  <th className="text-right px-4 py-2 font-medium">Histogram</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[...macd.data].reverse().map((row: MacdDataPoint, i) => {
                  const histColor = row.histogram == null ? '' : row.histogram > 0 ? 'text-green-500' : 'text-red-500'
                  return (
                    <tr key={i} className="hover:bg-muted/20">
                      <td className="px-4 py-2 text-muted-foreground text-xs">{formatTimestamp(row.timestamp)}</td>
                      <td className="px-4 py-2 text-right font-mono">{row.close?.toFixed(2) ?? '—'}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs">{row.macd?.toFixed(4) ?? '—'}</td>
                      <td className="px-4 py-2 text-right font-mono text-xs">{row.signal_line?.toFixed(4) ?? '—'}</td>
                      <td className={`px-4 py-2 text-right font-mono text-xs ${histColor}`}>{row.histogram?.toFixed(4) ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function PatternsTab({
  data,
  trendMode,
}: {
  data: ScreenerData
  trendMode: TrendMode
}) {
  const [minScore, setMinScore] = useState(0)
  const patternKeys = Object.keys(data.patterns) as (keyof typeof data.patterns)[]

  const filtered = data.all_patterns.filter((h) => confluenceScore(h, trendMode) >= minScore)
  const highCount = data.all_patterns.filter((h) => confluenceScore(h, trendMode) >= 3).length
  const display = filtered.slice(0, 50)

  return (
    <div className="space-y-4">
      {/* Pattern summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {patternKeys.map((key) => {
          const p = data.patterns[key]
          const colorClass = p.default_bias === 'bullish' ? 'border-green-500/40' : p.default_bias === 'bearish' ? 'border-red-500/40' : 'border-slate-500/40'
          return (
            <Card key={key} className={`border ${colorClass}`}>
              <CardContent className="pt-4 pb-3 px-3 text-center">
                <p className="text-xs font-medium truncate">{p.name}</p>
                <p className="text-2xl font-semibold mt-1">{p.total_count}</p>
                <p className="text-xs text-muted-foreground">occurrences</p>
                {p.last_occurrence && (
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    Last: {formatTimestamp(p.last_occurrence.timestamp)}
                  </p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Min confluence filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Min score:</span>
          {[0, 1, 2, 3].map((s) => (
            <button
              key={s}
              onClick={() => setMinScore(s)}
              className={`w-6 h-6 rounded-full text-[10px] font-bold text-white transition-opacity ${SCORE_COLORS[s]} ${minScore === s ? 'opacity-100 ring-2 ring-offset-1 ring-current' : 'opacity-60 hover:opacity-90'}`}
            >
              {s}+
            </button>
          ))}
        </div>

        <span className="text-xs text-muted-foreground ml-auto">
          {filtered.length} signals shown · {highCount} high-conviction (≥3) in{' '}
          <span className="font-medium">
            {trendMode === 'pullback' ? 'Pullback-Aware' : 'Strict'} mode
          </span>
        </span>
      </div>

      {/* Confluence legend */}
      <div className="flex flex-wrap gap-4 text-[10px] text-muted-foreground">
        <span className="font-medium text-foreground">Score factors:</span>
        <span>Vol = volume ≥1.5× avg</span>
        <span>Trend = {trendMode === 'pullback' ? 'macro trend + pullback to EMA20' : 'EMA20/50 direction match'}</span>
        <span>RSI = not at extreme vs pattern bias</span>
        <span>MACD = histogram direction aligns</span>
      </div>

      {/* Timeline table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            Pattern Timeline · most recent first · {display.length}/{filtered.length} shown
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {display.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              No patterns match the current score filter.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-xs">
                    <th className="text-left px-3 py-2 font-medium">Date</th>
                    <th className="text-left px-3 py-2 font-medium">Pattern</th>
                    <th className="text-right px-3 py-2 font-medium">Close</th>
                    <th className="text-left px-3 py-2 font-medium">Bias</th>
                    <th className="text-left px-3 py-2 font-medium">Volume</th>
                    <th className="text-center px-3 py-2 font-medium">Trend</th>
                    <th className="text-center px-3 py-2 font-medium">RSI</th>
                    <th className="text-center px-3 py-2 font-medium">MACD</th>
                    <th className="text-center px-3 py-2 font-medium">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {display.map((hit: AllPatternHit, i) => {
                    const score = confluenceScore(hit, trendMode)
                    const trendAligned = trendMode === 'strict' ? hit.trend_strict : hit.trend_pullback
                    const rowBg = score >= 3 ? 'bg-green-500/5' : score === 2 ? 'bg-yellow-500/5' : ''
                    return (
                      <tr key={i} className={`hover:bg-muted/20 ${rowBg}`}>
                        <td className="px-3 py-2 text-muted-foreground text-xs whitespace-nowrap">{formatTimestamp(hit.timestamp)}</td>
                        <td className="px-3 py-2 font-medium text-xs">{hit.pattern}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">{hit.close?.toFixed(2) ?? '—'}</td>
                        <td className="px-3 py-2">
                          <span className={`text-xs font-medium ${hit.bias === 'bullish' ? 'text-green-500' : hit.bias === 'bearish' ? 'text-red-500' : 'text-muted-foreground'}`}>
                            {hit.bias.charAt(0).toUpperCase() + hit.bias.slice(1)}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <VolBadge signal={hit.volume_signal} ratio={hit.volume_ratio} />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <AlignDot value={trendAligned} label="T" />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <AlignDot value={hit.rsi_aligned} label="R" />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <AlignDot value={hit.macd_aligned} label="M" />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <ConflChip score={score} />
                          <p className="text-[9px] text-muted-foreground mt-0.5">{SCORE_LABELS[score]}</p>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EXCHANGES = [
  { value: 'NSE', label: 'NSE' },
  { value: 'BSE', label: 'BSE' },
  { value: 'NSE_INDEX', label: 'NSE Index' },
  { value: 'BSE_INDEX', label: 'BSE Index' },
  { value: 'NFO', label: 'NFO' },
  { value: 'BFO', label: 'BFO' },
]

const INTERVALS = [
  { value: 'D', label: 'Daily' },
  { value: 'W', label: 'Weekly' },
  { value: 'M', label: 'Monthly' },
  { value: '1h', label: '1 Hour' },
  { value: '4h', label: '4 Hour' },
  { value: '30m', label: '30 Min' },
  { value: '15m', label: '15 Min' },
]

const SOURCES = [
  { value: 'api', label: 'Live (Broker API)' },
  { value: 'db', label: 'Local DB (Historify)' },
]

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Screener() {
  const { apiKey } = useAuthStore()
  const { mode } = useThemeStore()
  const isDarkMode = mode === 'dark'

  // Form state
  const [symbol, setSymbol] = useState('')
  const [exchange, setExchange] = useState('NSE')
  const [interval, setInterval] = useState('D')
  const [startDate, setStartDate] = useState(() => {
    const d = new Date()
    d.setFullYear(d.getFullYear() - 1)
    return d.toISOString().split('T')[0]
  })
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0])
  const [source, setSource] = useState<'api' | 'db'>('api')

  // Symbol combobox state
  const [symbolOpen, setSymbolOpen] = useState(false)
  const [symbolQuery, setSymbolQuery] = useState('')
  const [suggestions, setSuggestions] = useState<SymbolSuggestion[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Result state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ScreenerData | null>(null)
  const [activeTab, setActiveTab] = useState('summary')
  const [trendMode, setTrendMode] = useState<TrendMode>('pullback')

  // Fetch symbol suggestions with debounce
  const fetchSuggestions = useCallback(
    (query: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (query.length < 2) {
        setSuggestions([])
        return
      }
      debounceRef.current = setTimeout(async () => {
        setSuggestionsLoading(true)
        try {
          const res = await screenerApi.searchSymbols({
            apikey: apiKey ?? '',
            query: query.toUpperCase(),
            exchange,
            source,
          })
          if (res.status === 'success') setSuggestions(res.data ?? [])
        } catch {
          setSuggestions([])
        } finally {
          setSuggestionsLoading(false)
        }
      }, 300)
    },
    [apiKey, exchange, source],
  )

  // Re-clear suggestions when exchange or source changes
  useEffect(() => {
    setSuggestions([])
    setSymbolQuery('')
  }, [exchange, source])

  const handleRun = async () => {
    if (!symbol.trim()) {
      setError('Please select a symbol.')
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const response = await screenerApi.analyze({
        apikey: apiKey ?? '',
        symbol: symbol.trim().toUpperCase(),
        exchange,
        interval,
        start_date: startDate,
        end_date: endDate,
        source,
      })
      if (response.status === 'success' && response.data) {
        setResult(response.data)
        setActiveTab('summary')
      } else {
        setError(response.message ?? 'Unknown error')
      }
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to run screener. Check your symbol and date range.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Screener</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Technical analysis on a symbol — EMA trend, RSI momentum, MACD, and candlestick patterns.
        </p>
      </div>

      {/* Input form */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {/* Symbol combobox */}
            <div className="col-span-2 sm:col-span-1 lg:col-span-2 space-y-1">
              <Label>Symbol</Label>
              <Popover open={symbolOpen} onOpenChange={setSymbolOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={symbolOpen}
                    className="w-full justify-between font-normal"
                  >
                    {symbol ? (
                      <span className="font-medium uppercase">{symbol}</span>
                    ) : (
                      <span className="text-muted-foreground">Search symbol…</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Type ≥2 chars to search…"
                      value={symbolQuery}
                      onValueChange={(val) => {
                        setSymbolQuery(val)
                        fetchSuggestions(val)
                      }}
                    />
                    <CommandList>
                      {suggestionsLoading && (
                        <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Searching…
                        </div>
                      )}
                      {!suggestionsLoading && symbolQuery.length >= 2 && suggestions.length === 0 && (
                        <CommandEmpty>No symbols found.</CommandEmpty>
                      )}
                      {suggestions.length > 0 && (
                        <CommandGroup>
                          {suggestions.map((s, i) => (
                            <CommandItem
                              key={`${s.symbol}-${s.exchange}-${i}`}
                              value={s.symbol}
                              onSelect={() => {
                                setSymbol(s.symbol)
                                setExchange(s.exchange)
                                setSymbolQuery('')
                                setSuggestions([])
                                setSymbolOpen(false)
                              }}
                            >
                              <Check
                                className={`mr-2 h-4 w-4 ${symbol === s.symbol ? 'opacity-100' : 'opacity-0'}`}
                              />
                              <span className="font-medium">{s.symbol}</span>
                              <span className="ml-2 text-xs text-muted-foreground">{s.exchange}</span>
                              {s.name && (
                                <span className="ml-auto text-xs text-muted-foreground truncate max-w-[120px]">
                                  {s.name}
                                </span>
                              )}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1">
              <Label>Exchange</Label>
              <Select value={exchange} onValueChange={setExchange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXCHANGES.map((e) => (
                    <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Interval</Label>
              <Select value={interval} onValueChange={setInterval}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INTERVALS.map((i) => (
                    <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="startDate">From</Label>
              <Input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label htmlFor="endDate">To</Label>
              <Input id="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label>Source</Label>
              <Select value={source} onValueChange={(v) => setSource(v as 'api' | 'db')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOURCES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <Button onClick={handleRun} disabled={loading} className="gap-2">
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Analyzing…</>
              ) : (
                <><Search className="h-4 w-4" />Run Screen</>
              )}
            </Button>
            {result && (
              <span className="text-xs text-muted-foreground">
                {result.symbol} · {result.candle_count} candles
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span className="mt-0.5">⚠</span>
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          {/* Trend mode toggle — affects chart marker colors and patterns tab scoring */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-muted-foreground">Trend alignment mode:</span>
            <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
              <button
                onClick={() => setTrendMode('pullback')}
                className={`px-3 py-1.5 transition-colors ${trendMode === 'pullback' ? 'bg-primary text-primary-foreground font-medium' : 'bg-background hover:bg-muted text-muted-foreground'}`}
              >
                Pullback-Aware
              </button>
              <button
                onClick={() => setTrendMode('strict')}
                className={`px-3 py-1.5 border-l border-border transition-colors ${trendMode === 'strict' ? 'bg-primary text-primary-foreground font-medium' : 'bg-background hover:bg-muted text-muted-foreground'}`}
              >
                Strict
              </button>
            </div>
            <span className="text-[11px] text-muted-foreground">
              {trendMode === 'pullback'
                ? 'Macro trend intact + price pulling back to EMA20'
                : 'EMA20/50 direction must match pattern bias'}
            </span>
          </div>

          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="chart">Chart</TabsTrigger>
            <TabsTrigger value="trend">Trend</TabsTrigger>
            <TabsTrigger value="momentum">Momentum</TabsTrigger>
            <TabsTrigger value="macd">MACD</TabsTrigger>
            <TabsTrigger value="patterns">Patterns</TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="mt-4">
            <SummaryTab data={result} />
          </TabsContent>

          <TabsContent value="chart" className="mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-3">
                  {result.symbol} · {result.exchange} · {result.interval}
                  <span className="text-xs font-normal text-muted-foreground">
                    <span style={{ color: '#38bdf8' }}>■</span> EMA20
                    &nbsp;<span style={{ color: '#fb923c' }}>■</span> EMA50
                    &nbsp;▲ Bullish pattern&nbsp;▼ Bearish pattern
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScreenerChart data={result} isDarkMode={isDarkMode} trendMode={trendMode} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="trend" className="mt-4">
            <TrendTab data={result} />
          </TabsContent>
          <TabsContent value="momentum" className="mt-4">
            <MomentumTab data={result} />
          </TabsContent>
          <TabsContent value="macd" className="mt-4">
            <MacdTab data={result} />
          </TabsContent>
          <TabsContent value="patterns" className="mt-4">
            <PatternsTab data={result} trendMode={trendMode} />
          </TabsContent>
        </Tabs>
      )}

      {/* Empty state */}
      {!result && !loading && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-3">
          <Search className="h-10 w-10 opacity-30" />
          <p className="text-sm">Search a symbol above and click Run Screen to begin analysis.</p>
          <p className="text-xs opacity-70">Needs at least 52 candles in the date range.</p>
        </div>
      )}
    </div>
  )
}
