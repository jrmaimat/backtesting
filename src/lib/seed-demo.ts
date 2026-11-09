import { isDemoSeeded, markDemoSeeded, persistBacktest } from "./backtest-repo";
import type { ParsedTradeInput } from "./quant-metrics";

function createRng(seed: number) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateSyntheticTrades(config: {
  seed: number;
  count: number;
  symbol: string;
  startIso: string;
  avgDaysBetween: number;
  basePrice: number;
  winProb: number;
  avgWinPct: number;
  avgLossPct: number;
  positionCapital: number;
  shortBias?: number;
}): ParsedTradeInput[] {
  const rng = createRng(config.seed);
  const trades: ParsedTradeInput[] = [];
  let currentMs = new Date(config.startIso).getTime();
  let price = config.basePrice;
  const reasonsWin = ["Trailing Stop", "Take Profit", "Signal Flip", "Target Hit"];
  const reasonsLoss = ["Stop Loss", "ATR Stop", "Time Exit", "Signal Flip"];

  for (let i = 0; i < config.count; i++) {
    const gapHours = Math.max(
      6,
      Math.round(config.avgDaysBetween * 24 * (0.45 + rng() * 1.1))
    );
    currentMs += gapHours * 3600 * 1000;
    const holdHours = Math.max(
      2,
      Math.round(config.avgDaysBetween * 14 * (0.35 + rng() * 1.3))
    );
    const entryMs = currentMs;
    const exitMs = entryMs + holdHours * 3600 * 1000;
    currentMs = exitMs;

    const side: "LONG" | "SHORT" =
      rng() < (config.shortBias ?? 0.35) ? "SHORT" : "LONG";

    // Introduce realistic regime cluster waves
    const regimeShift = Math.sin(i / 8.5) * 0.08;
    const isWin = rng() < Math.min(0.88, Math.max(0.22, config.winProb + regimeShift));

    const movePct = isWin
      ? config.avgWinPct * (0.45 + rng() * 1.45)
      : -config.avgLossPct * (0.55 + rng() * 1.15);

    const entryPrice = Number(price.toFixed(price < 10 ? 4 : 2));
    const dir = side === "LONG" ? 1 : -1;
    const exitPriceRaw = entryPrice * (1 + (dir * movePct) / 100);
    const exitPrice = Number(Math.max(0.01, exitPriceRaw).toFixed(price < 10 ? 4 : 2));

    const qty = config.positionCapital / Math.max(0.01, entryPrice);
    const commission = Number((config.positionCapital * 0.0008).toFixed(2));
    const grossPnl = (exitPrice - entryPrice) * qty * dir;
    const netPnl = Number((grossPnl - commission).toFixed(2));

    // Drift market price realistically
    price = Math.max(
      config.basePrice * 0.45,
      price * (1 + ((rng() - 0.47) * 0.045))
    );

    trades.push({
      tradeNumber: i + 1,
      symbol: config.symbol,
      side,
      entryTime: new Date(entryMs).toISOString(),
      exitTime: new Date(exitMs).toISOString(),
      entryPrice,
      exitPrice,
      quantity: Number(qty.toFixed(price < 10 ? 2 : 4)),
      commission,
      pnl: netPnl,
      exitReason: isWin
        ? reasonsWin[Math.floor(rng() * reasonsWin.length)]
        : reasonsLoss[Math.floor(rng() * reasonsLoss.length)],
    });
  }

  return trades;
}

let seedInFlight: Promise<void> | null = null;

export async function ensureDemoSeeded(force = false): Promise<boolean> {
  if (!force) {
    const already = await isDemoSeeded();
    if (already) return false;
  }

  if (seedInFlight) {
    await seedInFlight;
    return true;
  }

  seedInFlight = (async () => {
    try {
      if (!force) {
        const already = await isDemoSeeded();
        if (already) return;
      }

      await persistBacktest({
        name: "BTC Volatility Breakout v4.2",
        symbol: "BTC-USDT",
        timeframe: "4h",
        assetClass: "Crypto",
        engine: "TradingView",
        sourceType: "tradingview_csv",
        fileName: "BTC_Volatility_Breakout_v4.2_4h.csv",
        initialCapital: 100000,
        isPinned: true,
        tags: ["breakout", "volatility", "momentum", "crypto"],
        parameters: {
          keltnerLength: 20,
          atrMultiplier: 1.65,
          adxThreshold: 22,
          riskPerTradePct: 1.25,
          trailingStopAtr: 2.1,
        },
        notes:
          "Keltner Channel + ADX regime filter on 4H BTC perpetuals. Avoids sideways chop by requiring ADX(14) > 22 before arming breakout stop orders.",
        trades: generateSyntheticTrades({
          seed: 4201,
          count: 108,
          symbol: "BTC-USDT",
          startIso: "2024-01-05T08:00:00Z",
          avgDaysBetween: 3.8,
          basePrice: 44200,
          winProb: 0.54,
          avgWinPct: 4.1,
          avgLossPct: 2.05,
          positionCapital: 48000,
          shortBias: 0.34,
        }),
      });

      await persistBacktest({
        name: "SPY Dual-MA Mean Reversion",
        symbol: "SPY",
        timeframe: "1D",
        assetClass: "Equities",
        engine: "QuantConnect",
        sourceType: "json_report",
        fileName: "spy_dual_ma_reversion_2023_2025.json",
        initialCapital: 100000,
        isPinned: true,
        tags: ["mean-reversion", "equities", "low-drawdown", "etf"],
        parameters: {
          rsiPeriod: 2,
          rsiOversold: 12,
          trendFilterSma: 200,
          maxHoldDays: 5,
          leverage: 1.0,
        },
        notes:
          "Connors-style 2-period RSI pullback strictly above the 200-day SMA. High hit-rate swing strategy with tight tail-risk controls.",
        trades: generateSyntheticTrades({
          seed: 8812,
          count: 86,
          symbol: "SPY",
          startIso: "2023-06-12T14:30:00Z",
          avgDaysBetween: 6.2,
          basePrice: 438,
          winProb: 0.65,
          avgWinPct: 1.85,
          avgLossPct: 1.75,
          positionCapital: 85000,
          shortBias: 0.12,
        }),
      });

      await persistBacktest({
        name: "NQ Opening Range Momentum",
        symbol: "NQ1!",
        timeframe: "15m",
        assetClass: "Futures",
        engine: "Backtrader",
        sourceType: "trades_csv",
        fileName: "nq_orb_15m_backtrader.csv",
        initialCapital: 50000,
        isPinned: false,
        tags: ["intraday", "orb", "futures", "nasdaq"],
        parameters: {
          openingRangeMins: 30,
          vwapFilter: "Aligned",
          rTarget: 2.4,
          maxDailyTrades: 2,
          slippageTicks: 2,
        },
        notes:
          "30-minute New York Opening Range breakout aligned with session VWAP slope. Asymmetric 2.4R payoff ratio offsets lower hit rate.",
        trades: generateSyntheticTrades({
          seed: 1934,
          count: 132,
          symbol: "NQ1!",
          startIso: "2024-03-04T14:30:00Z",
          avgDaysBetween: 2.4,
          basePrice: 18150,
          winProb: 0.45,
          avgWinPct: 2.65,
          avgLossPct: 1.25,
          positionCapital: 36000,
          shortBias: 0.45,
        }),
      });

      await persistBacktest({
        name: "EUR/USD London Session Fade",
        symbol: "EUR/USD",
        timeframe: "1h",
        assetClass: "Forex",
        engine: "VectorBT",
        sourceType: "trades_csv",
        fileName: "eurusd_london_fade_v1.csv",
        initialCapital: 25000,
        isPinned: false,
        tags: ["forex", "mean-reversion", "experimental"],
        parameters: {
          bollingerStd: 2.2,
          sessionWindow: "07:00-11:00 UTC",
          hardStopPips: 24,
        },
        notes:
          "Experimental London open exhaustion fade. Underperformed during strong Q4 dollar trend — kept in Vault as baseline benchmark for v2 regime filter.",
        trades: generateSyntheticTrades({
          seed: 7741,
          count: 92,
          symbol: "EUR/USD",
          startIso: "2024-02-01T07:00:00Z",
          avgDaysBetween: 3.1,
          basePrice: 1.084,
          winProb: 0.43,
          avgWinPct: 1.15,
          avgLossPct: 1.08,
          positionCapital: 20000,
          shortBias: 0.5,
        }),
      });

      await markDemoSeeded();
    } finally {
      seedInFlight = null;
    }
  })();

  await seedInFlight;
  return true;
}
