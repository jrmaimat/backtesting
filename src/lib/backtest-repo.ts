import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  appMeta,
  backtestEquityPoints,
  backtestTrades,
  backtests,
  type BacktestRecord,
} from "@/db/schema";
import {
  computeAnalyticsFromEquityCurve,
  computeAnalyticsFromTrades,
  type ParsedTradeInput,
  type RawEquityInput,
} from "./quant-metrics";

export interface PersistBacktestInput {
  name: string;
  symbol: string;
  timeframe: string;
  assetClass: string;
  engine: string;
  sourceType: string;
  fileName?: string | null;
  initialCapital: number;
  tags?: string[];
  parameters?: Record<string, string | number>;
  notes?: string;
  isPinned?: boolean;
  trades?: ParsedTradeInput[];
  equityPoints?: RawEquityInput[];
}

export async function persistBacktest(
  input: PersistBacktestInput
): Promise<BacktestRecord> {
  const trades = input.trades ?? [];
  const rawEquity = input.equityPoints ?? [];

  if (trades.length === 0 && rawEquity.length === 0) {
    throw new Error("Backtest must include at least one trade or equity point.");
  }

  const analytics =
    trades.length > 0
      ? computeAnalyticsFromTrades(trades, input.initialCapital, input.symbol)
      : computeAnalyticsFromEquityCurve(rawEquity, input.initialCapital);

  const id = crypto.randomUUID();
  const now = new Date();

  const [created] = await db
    .insert(backtests)
    .values({
      id,
      name: input.name.trim(),
      symbol: input.symbol.trim().toUpperCase(),
      timeframe: input.timeframe.trim(),
      assetClass: input.assetClass.trim(),
      engine: input.engine.trim(),
      sourceType: input.sourceType,
      fileName: input.fileName ?? null,
      initialCapital: analytics.initialCapital,
      finalCapital: analytics.finalCapital,
      netProfit: analytics.netProfit,
      totalReturnPct: analytics.totalReturnPct,
      cagrPct: analytics.cagrPct,
      sharpeRatio: analytics.sharpeRatio,
      sortinoRatio: analytics.sortinoRatio,
      calmarRatio: analytics.calmarRatio,
      maxDrawdownPct: analytics.maxDrawdownPct,
      maxDrawdownAmount: analytics.maxDrawdownAmount,
      maxDrawdownDurationDays: analytics.maxDrawdownDurationDays,
      winRatePct: analytics.winRatePct,
      profitFactor: analytics.profitFactor,
      expectancy: analytics.expectancy,
      payoffRatio: analytics.payoffRatio,
      totalTrades: analytics.totalTrades,
      winningTrades: analytics.winningTrades,
      losingTrades: analytics.losingTrades,
      avgWin: analytics.avgWin,
      avgLoss: analytics.avgLoss,
      bestTrade: analytics.bestTrade,
      worstTrade: analytics.worstTrade,
      maxConsecutiveWins: analytics.maxConsecutiveWins,
      maxConsecutiveLosses: analytics.maxConsecutiveLosses,
      longTradesCount: analytics.longTradesCount,
      longWinRatePct: analytics.longWinRatePct,
      longNetProfit: analytics.longNetProfit,
      shortTradesCount: analytics.shortTradesCount,
      shortWinRatePct: analytics.shortWinRatePct,
      shortNetProfit: analytics.shortNetProfit,
      startDate: analytics.startDate,
      endDate: analytics.endDate,
      tags: input.tags ?? [],
      parameters: input.parameters ?? {},
      monthlyReturns: analytics.monthlyReturns,
      notes: input.notes ?? "",
      isPinned: input.isPinned ?? false,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  // Batch insert equity curve points
  const chunkSize = 400;
  if (analytics.equityPoints.length > 0) {
    for (let i = 0; i < analytics.equityPoints.length; i += chunkSize) {
      const slice = analytics.equityPoints.slice(i, i + chunkSize);
      await db.insert(backtestEquityPoints).values(
        slice.map((pt) => ({
          backtestId: id,
          pointIndex: pt.pointIndex,
          timestamp: pt.timestamp,
          equity: pt.equity,
          returnPct: pt.returnPct,
          drawdownPct: pt.drawdownPct,
          drawdownAmount: pt.drawdownAmount,
          benchmarkEquity: pt.benchmarkEquity ?? null,
        }))
      );
    }
  }

  // Batch insert individual trades (cap at 10,000 trades for responsiveness)
  const tradesToStore = analytics.trades.slice(0, 10000);
  if (tradesToStore.length > 0) {
    for (let i = 0; i < tradesToStore.length; i += chunkSize) {
      const slice = tradesToStore.slice(i, i + chunkSize);
      await db.insert(backtestTrades).values(
        slice.map((t) => ({
          backtestId: id,
          tradeNumber: t.tradeNumber,
          symbol: t.symbol,
          side: t.side,
          entryTime: t.entryTime,
          exitTime: t.exitTime,
          entryPrice: t.entryPrice,
          exitPrice: t.exitPrice,
          quantity: t.quantity,
          pnl: t.pnl,
          pnlPct: t.pnlPct,
          commission: t.commission,
          cumulativeEquity: t.cumulativeEquity,
          drawdownPct: t.drawdownPct,
          durationMinutes: t.durationMinutes,
          exitReason: t.exitReason ?? null,
        }))
      );
    }
  }

  return created;
}

export async function isDemoSeeded(): Promise<boolean> {
  const rows = await db
    .select()
    .from(appMeta)
    .where(eq(appMeta.key, "demo_seeded"));
  return rows.length > 0 && rows[0].value === "true";
}

export async function markDemoSeeded(): Promise<void> {
  await db
    .insert(appMeta)
    .values({
      key: "demo_seeded",
      value: "true",
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: appMeta.key,
      set: { value: "true", updatedAt: new Date() },
    });
}
