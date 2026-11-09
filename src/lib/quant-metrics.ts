import type { MonthlyReturnEntry } from "@/db/schema";

export interface ParsedTradeInput {
  tradeNumber?: number;
  symbol?: string;
  side: "LONG" | "SHORT";
  entryTime: string;
  exitTime: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPct?: number;
  commission?: number;
  exitReason?: string;
}

export interface RawEquityInput {
  timestamp: string;
  equity: number;
  benchmarkEquity?: number;
}

export interface ComputedEquityPoint {
  pointIndex: number;
  timestamp: string;
  equity: number;
  returnPct: number;
  drawdownPct: number;
  drawdownAmount: number;
  benchmarkEquity?: number;
}

export interface ComputedTrade {
  tradeNumber: number;
  symbol: string;
  side: "LONG" | "SHORT";
  entryTime: string;
  exitTime: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  pnlPct: number;
  commission: number;
  cumulativeEquity: number;
  drawdownPct: number;
  durationMinutes: number;
  exitReason?: string;
}

export interface ComputedBacktestAnalytics {
  initialCapital: number;
  finalCapital: number;
  netProfit: number;
  totalReturnPct: number;
  cagrPct: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  maxDrawdownPct: number;
  maxDrawdownAmount: number;
  maxDrawdownDurationDays: number;
  winRatePct: number;
  profitFactor: number;
  expectancy: number;
  payoffRatio: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgWin: number;
  avgLoss: number;
  bestTrade: number;
  worstTrade: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  longTradesCount: number;
  longWinRatePct: number;
  longNetProfit: number;
  shortTradesCount: number;
  shortWinRatePct: number;
  shortNetProfit: number;
  startDate: string;
  endDate: string;
  monthlyReturns: MonthlyReturnEntry[];
  equityPoints: ComputedEquityPoint[];
  trades: ComputedTrade[];
}

function safeNum(val: number, fallback = 0): number {
  if (!Number.isFinite(val) || Number.isNaN(val)) return fallback;
  return val;
}

function round(val: number, decimals = 2): number {
  const safe = safeNum(val, 0);
  const factor = Math.pow(10, decimals);
  return Math.round(safe * factor) / factor;
}

export function normalizeIsoDate(raw: string, fallbackIndex = 0): string {
  if (!raw || !raw.trim()) {
    const d = new Date(Date.UTC(2024, 0, 1 + fallbackIndex));
    return d.toISOString();
  }
  const trimmed = raw.trim();
  // Handle numeric epoch timestamps (seconds or ms)
  if (/^\d{10}$/.test(trimmed)) {
    return new Date(Number(trimmed) * 1000).toISOString();
  }
  if (/^\d{13}$/.test(trimmed)) {
    return new Date(Number(trimmed)).toISOString();
  }
  // Handle YYYY.MM.DD HH:MM (MetaTrader style)
  const mtMatch = trimmed.match(
    /^(\d{4})\.(\d{2})\.(\d{2})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (mtMatch) {
    const [, y, m, d, hh = "00", mm = "00", ss = "00"] = mtMatch;
    return new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}Z`).toISOString();
  }
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }
  const d = new Date(Date.UTC(2024, 0, 1 + fallbackIndex));
  return d.toISOString();
}

function daysBetween(startIso: string, endIso: string): number {
  const s = new Date(startIso).getTime();
  const e = new Date(endIso).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return 0;
  return (e - s) / (1000 * 60 * 60 * 24);
}

function computeMonthlyReturnsFromPoints(
  points: ComputedEquityPoint[],
  initialCapital: number
): MonthlyReturnEntry[] {
  if (points.length === 0) return [];
  const monthMap = new Map<
    string,
    { year: number; month: number; startEquity: number; endEquity: number }
  >();

  let prevEquity = initialCapital;
  for (const pt of points) {
    const dt = new Date(pt.timestamp);
    if (Number.isNaN(dt.getTime())) continue;
    const year = dt.getUTCFullYear();
    const month = dt.getUTCMonth() + 1;
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const existing = monthMap.get(key);
    if (!existing) {
      monthMap.set(key, {
        year,
        month,
        startEquity: prevEquity,
        endEquity: pt.equity,
      });
    } else {
      existing.endEquity = pt.equity;
    }
    prevEquity = pt.equity;
  }

  return Array.from(monthMap.values())
    .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month))
    .map((m) => {
      const pnl = m.endEquity - m.startEquity;
      const returnPct =
        m.startEquity > 0 ? (pnl / m.startEquity) * 100 : 0;
      return {
        year: m.year,
        month: m.month,
        returnPct: round(returnPct, 2),
        pnl: round(pnl, 2),
      };
    });
}

function computeSharpeAndSortino(
  points: ComputedEquityPoint[],
  totalTrades: number,
  spanDays: number
): { sharpeRatio: number; sortinoRatio: number } {
  if (points.length < 2) {
    return { sharpeRatio: 0, sortinoRatio: 0 };
  }

  // Detect if weekend points exist (e.g. 24/7 crypto)
  let weekendCount = 0;
  for (const pt of points) {
    const day = new Date(pt.timestamp).getUTCDay();
    if (day === 0 || day === 6) weekendCount++;
  }
  const is247 = weekendCount / points.length > 0.1;

  // Group closing equity by YYYY-MM-DD
  const dailyClose = new Map<string, number>();
  for (const pt of points) {
    const dayStr = pt.timestamp.slice(0, 10);
    dailyClose.set(dayStr, pt.equity);
  }

  const sortedDays = Array.from(dailyClose.keys()).sort();
  let dailyReturns: number[] = [];

  if (sortedDays.length >= 4 && spanDays >= 4) {
    const startMs = new Date(`${sortedDays[0]}T00:00:00Z`).getTime();
    const endMs = new Date(
      `${sortedDays[sortedDays.length - 1]}T00:00:00Z`
    ).getTime();
    const maxLoopDays = Math.min(4000, Math.ceil((endMs - startMs) / 86400000));
    let lastEq = dailyClose.get(sortedDays[0]) ?? points[0].equity;
    const series: number[] = [lastEq];

    for (let i = 1; i <= maxLoopDays; i++) {
      const d = new Date(startMs + i * 86400000);
      const dayOfWeek = d.getUTCDay();
      const key = d.toISOString().slice(0, 10);
      if (!is247 && (dayOfWeek === 0 || dayOfWeek === 6) && !dailyClose.has(key)) {
        continue;
      }
      if (dailyClose.has(key)) {
        lastEq = dailyClose.get(key)!;
      }
      series.push(lastEq);
    }

    for (let i = 1; i < series.length; i++) {
      const prev = series[i - 1];
      const curr = series[i];
      if (prev > 0) {
        dailyReturns.push((curr - prev) / prev);
      }
    }
  } else {
    // Intraday / short-span fallback: use point-to-point returns
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1].equity;
      const curr = points[i].equity;
      if (prev > 0) {
        dailyReturns.push((curr - prev) / prev);
      }
    }
  }

  if (dailyReturns.length < 2) {
    return { sharpeRatio: 0, sortinoRatio: 0 };
  }

  const n = dailyReturns.length;
  const mean = dailyReturns.reduce((acc, r) => acc + r, 0) / n;
  const variance =
    dailyReturns.reduce((acc, r) => acc + Math.pow(r - mean, 2), 0) /
    Math.max(1, n - 1);
  const stdDev = Math.sqrt(variance);

  const downsideSqSum = dailyReturns.reduce(
    (acc, r) => acc + (r < 0 ? r * r : 0),
    0
  );
  const downsideDev = Math.sqrt(downsideSqSum / Math.max(1, n));

  const periodsPerYear =
    sortedDays.length >= 4 && spanDays >= 4
      ? is247
        ? 365
        : 252
      : Math.max(12, Math.min(252 * 4, totalTrades > 0 ? totalTrades * 12 : 252));

  const annualFactor = Math.sqrt(periodsPerYear);

  const sharpe =
    stdDev > 1e-9 ? Math.max(-10, Math.min(15, (mean / stdDev) * annualFactor)) : 0;
  const sortino =
    downsideDev > 1e-9
      ? Math.max(-10, Math.min(25, (mean / downsideDev) * annualFactor))
      : sharpe > 0
        ? Math.min(25, sharpe * 1.4)
        : 0;

  return {
    sharpeRatio: round(sharpe, 2),
    sortinoRatio: round(sortino, 2),
  };
}

export function downsampleEquityPoints(
  points: ComputedEquityPoint[],
  maxPoints = 900
): ComputedEquityPoint[] {
  if (points.length <= maxPoints) return points;
  const sampled: ComputedEquityPoint[] = [];
  const step = (points.length - 1) / (maxPoints - 1);
  let lastIdx = -1;
  for (let i = 0; i < maxPoints; i++) {
    const start = Math.floor(i * step);
    const end = Math.min(points.length - 1, Math.floor((i + 1) * step));
    if (i === 0) {
      sampled.push({ ...points[0], pointIndex: 0 });
      lastIdx = 0;
      continue;
    }
    if (i === maxPoints - 1) {
      if (lastIdx !== points.length - 1) {
        sampled.push({
          ...points[points.length - 1],
          pointIndex: sampled.length,
        });
      }
      continue;
    }
    // Preserve extreme drawdown or peak inside bucket
    let chosenIdx = start;
    let maxAbsDd = -1;
    for (let j = start; j <= end; j++) {
      if (Math.abs(points[j].drawdownPct) > maxAbsDd) {
        maxAbsDd = Math.abs(points[j].drawdownPct);
        chosenIdx = j;
      }
    }
    if (chosenIdx !== lastIdx) {
      sampled.push({ ...points[chosenIdx], pointIndex: sampled.length });
      lastIdx = chosenIdx;
    }
  }
  return sampled;
}

export function computeAnalyticsFromTrades(
  rawTrades: ParsedTradeInput[],
  initialCapital: number,
  defaultSymbol = "ASSET"
): ComputedBacktestAnalytics {
  const safeCapital = initialCapital > 0 ? initialCapital : 10000;

  const normalizedTrades = rawTrades
    .map((t, idx) => {
      const entryTime = normalizeIsoDate(t.entryTime, idx);
      const exitTime = normalizeIsoDate(t.exitTime || t.entryTime, idx);
      const entryMs = new Date(entryTime).getTime();
      const exitMs = new Date(exitTime).getTime();
      const durationMinutes =
        exitMs >= entryMs ? (exitMs - entryMs) / 60000 : 0;
      const commission = safeNum(t.commission ?? 0, 0);
      const pnl = safeNum(t.pnl, 0);
      const notional =
        Math.abs(safeNum(t.entryPrice, 0) * safeNum(t.quantity, 0)) ||
        safeCapital;
      const pnlPct =
        t.pnlPct !== undefined && Number.isFinite(t.pnlPct)
          ? t.pnlPct
          : notional > 0
            ? (pnl / notional) * 100
            : 0;

      return {
        tradeNumber: t.tradeNumber ?? idx + 1,
        symbol: (t.symbol || defaultSymbol).trim() || defaultSymbol,
        side: t.side,
        entryTime,
        exitTime,
        entryPrice: round(safeNum(t.entryPrice, 0), 6),
        exitPrice: round(safeNum(t.exitPrice, 0), 6),
        quantity: round(safeNum(t.quantity, 1), 6),
        pnl: round(pnl, 2),
        pnlPct: round(pnlPct, 4),
        commission: round(commission, 2),
        durationMinutes: round(durationMinutes, 1),
        exitReason: t.exitReason,
      };
    })
    .sort((a, b) => {
      const ta = new Date(a.exitTime).getTime();
      const tb = new Date(b.exitTime).getTime();
      if (ta !== tb) return ta - tb;
      return a.tradeNumber - b.tradeNumber;
    });

  const startDate =
    normalizedTrades.length > 0
      ? normalizedTrades.reduce(
          (min, t) => (t.entryTime < min ? t.entryTime : min),
          normalizedTrades[0].entryTime
        )
      : new Date().toISOString();
  const endDate =
    normalizedTrades.length > 0
      ? normalizedTrades[normalizedTrades.length - 1].exitTime
      : startDate;

  let currentEquity = safeCapital;
  let peakEquity = safeCapital;
  let peakTimestamp = startDate;
  let maxDrawdownPct = 0;
  let maxDrawdownAmount = 0;
  let maxDrawdownDurationDays = 0;

  const fullEquityPoints: ComputedEquityPoint[] = [
    {
      pointIndex: 0,
      timestamp: startDate,
      equity: round(safeCapital, 2),
      returnPct: 0,
      drawdownPct: 0,
      drawdownAmount: 0,
    },
  ];

  let winningTrades = 0;
  let losingTrades = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let bestTrade = normalizedTrades.length > 0 ? normalizedTrades[0].pnl : 0;
  let worstTrade = normalizedTrades.length > 0 ? normalizedTrades[0].pnl : 0;

  let curWinStreak = 0;
  let curLossStreak = 0;
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;

  let longTradesCount = 0;
  let longWins = 0;
  let longNetProfit = 0;
  let shortTradesCount = 0;
  let shortWins = 0;
  let shortNetProfit = 0;

  const computedTrades: ComputedTrade[] = normalizedTrades.map((t, idx) => {
    currentEquity += t.pnl;
    if (currentEquity >= peakEquity) {
      const recoveryDays = daysBetween(peakTimestamp, t.exitTime);
      if (recoveryDays > maxDrawdownDurationDays) {
        maxDrawdownDurationDays = recoveryDays;
      }
      peakEquity = currentEquity;
      peakTimestamp = t.exitTime;
    } else {
      const curDuration = daysBetween(peakTimestamp, t.exitTime);
      if (curDuration > maxDrawdownDurationDays) {
        maxDrawdownDurationDays = curDuration;
      }
    }

    const drawdownAmount = currentEquity - peakEquity;
    const drawdownPct =
      peakEquity > 0 ? ((currentEquity - peakEquity) / peakEquity) * 100 : 0;

    if (drawdownPct < maxDrawdownPct) {
      maxDrawdownPct = drawdownPct;
    }
    if (drawdownAmount < maxDrawdownAmount) {
      maxDrawdownAmount = drawdownAmount;
    }

    const returnPct = ((currentEquity - safeCapital) / safeCapital) * 100;

    fullEquityPoints.push({
      pointIndex: idx + 1,
      timestamp: t.exitTime,
      equity: round(currentEquity, 2),
      returnPct: round(returnPct, 2),
      drawdownPct: round(drawdownPct, 2),
      drawdownAmount: round(drawdownAmount, 2),
    });

    if (t.pnl > 0) {
      winningTrades++;
      grossProfit += t.pnl;
      curWinStreak++;
      curLossStreak = 0;
      if (curWinStreak > maxConsecutiveWins) maxConsecutiveWins = curWinStreak;
    } else if (t.pnl < 0) {
      losingTrades++;
      grossLoss += Math.abs(t.pnl);
      curLossStreak++;
      curWinStreak = 0;
      if (curLossStreak > maxConsecutiveLosses)
        maxConsecutiveLosses = curLossStreak;
    }

    if (t.pnl > bestTrade) bestTrade = t.pnl;
    if (t.pnl < worstTrade) worstTrade = t.pnl;

    if (t.side === "LONG") {
      longTradesCount++;
      longNetProfit += t.pnl;
      if (t.pnl > 0) longWins++;
    } else {
      shortTradesCount++;
      shortNetProfit += t.pnl;
      if (t.pnl > 0) shortWins++;
    }

    return {
      ...t,
      tradeNumber: idx + 1,
      cumulativeEquity: round(currentEquity, 2),
      drawdownPct: round(drawdownPct, 2),
    };
  });

  const totalTrades = computedTrades.length;
  const finalCapital = currentEquity;
  const netProfit = finalCapital - safeCapital;
  const totalReturnPct = (netProfit / safeCapital) * 100;

  const spanDays = Math.max(1, daysBetween(startDate, endDate));
  const years = spanDays / 365.25;
  let cagrPct = 0;
  if (finalCapital > 0 && safeCapital > 0) {
    if (years >= 0.08) {
      cagrPct = (Math.pow(finalCapital / safeCapital, 1 / years) - 1) * 100;
      cagrPct = Math.max(-99.9, Math.min(9999, cagrPct));
    } else {
      cagrPct = totalReturnPct;
    }
  } else {
    cagrPct = -100;
  }

  const { sharpeRatio, sortinoRatio } = computeSharpeAndSortino(
    fullEquityPoints,
    totalTrades,
    spanDays
  );

  const calmarRatio =
    Math.abs(maxDrawdownPct) > 0.01
      ? Math.max(-50, Math.min(100, cagrPct / Math.abs(maxDrawdownPct)))
      : cagrPct > 0
        ? 10
        : 0;

  const winRatePct = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
  const avgWin = winningTrades > 0 ? grossProfit / winningTrades : 0;
  const avgLoss = losingTrades > 0 ? -(grossLoss / losingTrades) : 0;
  const profitFactor =
    grossLoss > 0.0001
      ? Math.min(99.99, grossProfit / grossLoss)
      : grossProfit > 0
        ? 99.99
        : 0;
  const expectancy = totalTrades > 0 ? netProfit / totalTrades : 0;
  const payoffRatio =
    Math.abs(avgLoss) > 0.0001
      ? Math.min(99.99, avgWin / Math.abs(avgLoss))
      : avgWin > 0
        ? 99.99
        : 0;

  const monthlyReturns = computeMonthlyReturnsFromPoints(
    fullEquityPoints,
    safeCapital
  );
  const equityPoints = downsampleEquityPoints(fullEquityPoints, 900);

  return {
    initialCapital: round(safeCapital, 2),
    finalCapital: round(finalCapital, 2),
    netProfit: round(netProfit, 2),
    totalReturnPct: round(totalReturnPct, 2),
    cagrPct: round(cagrPct, 2),
    sharpeRatio,
    sortinoRatio,
    calmarRatio: round(calmarRatio, 2),
    maxDrawdownPct: round(maxDrawdownPct, 2),
    maxDrawdownAmount: round(maxDrawdownAmount, 2),
    maxDrawdownDurationDays: round(maxDrawdownDurationDays, 1),
    winRatePct: round(winRatePct, 2),
    profitFactor: round(profitFactor, 2),
    expectancy: round(expectancy, 2),
    payoffRatio: round(payoffRatio, 2),
    totalTrades,
    winningTrades,
    losingTrades,
    avgWin: round(avgWin, 2),
    avgLoss: round(avgLoss, 2),
    bestTrade: round(bestTrade, 2),
    worstTrade: round(worstTrade, 2),
    maxConsecutiveWins,
    maxConsecutiveLosses,
    longTradesCount,
    longWinRatePct:
      longTradesCount > 0 ? round((longWins / longTradesCount) * 100, 2) : 0,
    longNetProfit: round(longNetProfit, 2),
    shortTradesCount,
    shortWinRatePct:
      shortTradesCount > 0 ? round((shortWins / shortTradesCount) * 100, 2) : 0,
    shortNetProfit: round(shortNetProfit, 2),
    startDate,
    endDate,
    monthlyReturns,
    equityPoints,
    trades: computedTrades,
  };
}

export function computeAnalyticsFromEquityCurve(
  rawPoints: RawEquityInput[],
  initialCapitalOverride?: number
): ComputedBacktestAnalytics {
  const sorted = rawPoints
    .map((p, idx) => ({
      timestamp: normalizeIsoDate(p.timestamp, idx),
      equity: safeNum(p.equity, 0),
      benchmarkEquity:
        p.benchmarkEquity !== undefined && Number.isFinite(p.benchmarkEquity)
          ? p.benchmarkEquity
          : undefined,
    }))
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

  const initialCapital =
    initialCapitalOverride && initialCapitalOverride > 0
      ? initialCapitalOverride
      : sorted.length > 0 && sorted[0].equity > 0
        ? sorted[0].equity
        : 10000;

  let peakEquity = initialCapital;
  let peakTimestamp = sorted[0]?.timestamp ?? new Date().toISOString();
  let maxDrawdownPct = 0;
  let maxDrawdownAmount = 0;
  let maxDrawdownDurationDays = 0;

  const fullPoints: ComputedEquityPoint[] = sorted.map((p, idx) => {
    if (p.equity >= peakEquity) {
      const recoveryDays = daysBetween(peakTimestamp, p.timestamp);
      if (recoveryDays > maxDrawdownDurationDays) {
        maxDrawdownDurationDays = recoveryDays;
      }
      peakEquity = p.equity;
      peakTimestamp = p.timestamp;
    } else {
      const curDuration = daysBetween(peakTimestamp, p.timestamp);
      if (curDuration > maxDrawdownDurationDays) {
        maxDrawdownDurationDays = curDuration;
      }
    }
    const drawdownAmount = p.equity - peakEquity;
    const drawdownPct =
      peakEquity > 0 ? ((p.equity - peakEquity) / peakEquity) * 100 : 0;
    if (drawdownPct < maxDrawdownPct) maxDrawdownPct = drawdownPct;
    if (drawdownAmount < maxDrawdownAmount) maxDrawdownAmount = drawdownAmount;

    return {
      pointIndex: idx,
      timestamp: p.timestamp,
      equity: round(p.equity, 2),
      returnPct: round(((p.equity - initialCapital) / initialCapital) * 100, 2),
      drawdownPct: round(drawdownPct, 2),
      drawdownAmount: round(drawdownAmount, 2),
      benchmarkEquity: p.benchmarkEquity,
    };
  });

  const startDate = fullPoints[0]?.timestamp ?? new Date().toISOString();
  const endDate =
    fullPoints[fullPoints.length - 1]?.timestamp ?? startDate;
  const finalCapital =
    fullPoints[fullPoints.length - 1]?.equity ?? initialCapital;
  const netProfit = finalCapital - initialCapital;
  const totalReturnPct = (netProfit / initialCapital) * 100;

  const spanDays = Math.max(1, daysBetween(startDate, endDate));
  const years = spanDays / 365.25;
  const cagrPct =
    finalCapital > 0 && initialCapital > 0 && years >= 0.08
      ? Math.max(
          -99.9,
          Math.min(9999, (Math.pow(finalCapital / initialCapital, 1 / years) - 1) * 100)
        )
      : totalReturnPct;

  const { sharpeRatio, sortinoRatio } = computeSharpeAndSortino(
    fullPoints,
    0,
    spanDays
  );

  const calmarRatio =
    Math.abs(maxDrawdownPct) > 0.01
      ? Math.max(-50, Math.min(100, cagrPct / Math.abs(maxDrawdownPct)))
      : cagrPct > 0
        ? 10
        : 0;

  // Period return statistics from curve intervals
  let upPeriods = 0;
  let downPeriods = 0;
  let grossGain = 0;
  let grossLoss = 0;
  let bestStep = 0;
  let worstStep = 0;
  for (let i = 1; i < fullPoints.length; i++) {
    const diff = fullPoints[i].equity - fullPoints[i - 1].equity;
    if (diff > 0) {
      upPeriods++;
      grossGain += diff;
      if (diff > bestStep) bestStep = diff;
    } else if (diff < 0) {
      downPeriods++;
      grossLoss += Math.abs(diff);
      if (diff < worstStep) worstStep = diff;
    }
  }
  const activePeriods = upPeriods + downPeriods;

  return {
    initialCapital: round(initialCapital, 2),
    finalCapital: round(finalCapital, 2),
    netProfit: round(netProfit, 2),
    totalReturnPct: round(totalReturnPct, 2),
    cagrPct: round(cagrPct, 2),
    sharpeRatio,
    sortinoRatio,
    calmarRatio: round(calmarRatio, 2),
    maxDrawdownPct: round(maxDrawdownPct, 2),
    maxDrawdownAmount: round(maxDrawdownAmount, 2),
    maxDrawdownDurationDays: round(maxDrawdownDurationDays, 1),
    winRatePct:
      activePeriods > 0 ? round((upPeriods / activePeriods) * 100, 2) : 0,
    profitFactor:
      grossLoss > 0.0001
        ? round(Math.min(99.99, grossGain / grossLoss), 2)
        : grossGain > 0
          ? 99.99
          : 0,
    expectancy:
      activePeriods > 0 ? round(netProfit / activePeriods, 2) : 0,
    payoffRatio:
      upPeriods > 0 && downPeriods > 0
        ? round((grossGain / upPeriods) / (grossLoss / downPeriods), 2)
        : 0,
    totalTrades: 0,
    winningTrades: upPeriods,
    losingTrades: downPeriods,
    avgWin: upPeriods > 0 ? round(grossGain / upPeriods, 2) : 0,
    avgLoss: downPeriods > 0 ? round(-(grossLoss / downPeriods), 2) : 0,
    bestTrade: round(bestStep, 2),
    worstTrade: round(worstStep, 2),
    maxConsecutiveWins: 0,
    maxConsecutiveLosses: 0,
    longTradesCount: 0,
    longWinRatePct: 0,
    longNetProfit: 0,
    shortTradesCount: 0,
    shortWinRatePct: 0,
    shortNetProfit: 0,
    startDate,
    endDate,
    monthlyReturns: computeMonthlyReturnsFromPoints(fullPoints, initialCapital),
    equityPoints: downsampleEquityPoints(fullPoints, 900),
    trades: [],
  };
}
