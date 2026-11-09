import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export interface MonthlyReturnEntry {
  year: number;
  month: number; // 1-12
  returnPct: number;
  pnl: number;
}

export const appMeta = pgTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const backtests = pgTable(
  "backtests",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    symbol: text("symbol").notNull(),
    timeframe: text("timeframe").notNull(),
    assetClass: text("asset_class").notNull(),
    engine: text("engine").notNull(),
    sourceType: text("source_type").notNull(),
    fileName: text("file_name"),
    initialCapital: doublePrecision("initial_capital").notNull(),
    finalCapital: doublePrecision("final_capital").notNull(),
    netProfit: doublePrecision("net_profit").notNull(),
    totalReturnPct: doublePrecision("total_return_pct").notNull(),
    cagrPct: doublePrecision("cagr_pct").notNull(),
    sharpeRatio: doublePrecision("sharpe_ratio").notNull(),
    sortinoRatio: doublePrecision("sortino_ratio").notNull(),
    calmarRatio: doublePrecision("calmar_ratio").notNull(),
    maxDrawdownPct: doublePrecision("max_drawdown_pct").notNull(),
    maxDrawdownAmount: doublePrecision("max_drawdown_amount").notNull(),
    maxDrawdownDurationDays: doublePrecision("max_drawdown_duration_days")
      .notNull()
      .default(0),
    winRatePct: doublePrecision("win_rate_pct").notNull(),
    profitFactor: doublePrecision("profit_factor").notNull(),
    expectancy: doublePrecision("expectancy").notNull(),
    payoffRatio: doublePrecision("payoff_ratio").notNull(),
    totalTrades: integer("total_trades").notNull(),
    winningTrades: integer("winning_trades").notNull(),
    losingTrades: integer("losing_trades").notNull(),
    avgWin: doublePrecision("avg_win").notNull(),
    avgLoss: doublePrecision("avg_loss").notNull(),
    bestTrade: doublePrecision("best_trade").notNull(),
    worstTrade: doublePrecision("worst_trade").notNull(),
    maxConsecutiveWins: integer("max_consecutive_wins").notNull().default(0),
    maxConsecutiveLosses: integer("max_consecutive_losses").notNull().default(0),
    longTradesCount: integer("long_trades_count").notNull().default(0),
    longWinRatePct: doublePrecision("long_win_rate_pct").notNull().default(0),
    longNetProfit: doublePrecision("long_net_profit").notNull().default(0),
    shortTradesCount: integer("short_trades_count").notNull().default(0),
    shortWinRatePct: doublePrecision("short_win_rate_pct").notNull().default(0),
    shortNetProfit: doublePrecision("short_net_profit").notNull().default(0),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    parameters: jsonb("parameters")
      .$type<Record<string, string | number>>()
      .notNull()
      .default({}),
    monthlyReturns: jsonb("monthly_returns")
      .$type<MonthlyReturnEntry[]>()
      .notNull()
      .default([]),
    notes: text("notes").notNull().default(""),
    isPinned: boolean("is_pinned").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("backtests_created_at_idx").on(table.createdAt),
    index("backtests_pinned_idx").on(table.isPinned),
  ]
);

export const backtestEquityPoints = pgTable(
  "backtest_equity_points",
  {
    id: serial("id").primaryKey(),
    backtestId: text("backtest_id")
      .notNull()
      .references(() => backtests.id, { onDelete: "cascade" }),
    pointIndex: integer("point_index").notNull(),
    timestamp: text("timestamp").notNull(),
    equity: doublePrecision("equity").notNull(),
    returnPct: doublePrecision("return_pct").notNull(),
    drawdownPct: doublePrecision("drawdown_pct").notNull(),
    drawdownAmount: doublePrecision("drawdown_amount").notNull(),
    benchmarkEquity: doublePrecision("benchmark_equity"),
  },
  (table) => [
    index("equity_points_backtest_idx").on(table.backtestId, table.pointIndex),
  ]
);

export const backtestTrades = pgTable(
  "backtest_trades",
  {
    id: serial("id").primaryKey(),
    backtestId: text("backtest_id")
      .notNull()
      .references(() => backtests.id, { onDelete: "cascade" }),
    tradeNumber: integer("trade_number").notNull(),
    symbol: text("symbol").notNull(),
    side: text("side").notNull(),
    entryTime: text("entry_time").notNull(),
    exitTime: text("exit_time").notNull(),
    entryPrice: doublePrecision("entry_price").notNull(),
    exitPrice: doublePrecision("exit_price").notNull(),
    quantity: doublePrecision("quantity").notNull(),
    pnl: doublePrecision("pnl").notNull(),
    pnlPct: doublePrecision("pnl_pct").notNull(),
    commission: doublePrecision("commission").notNull().default(0),
    cumulativeEquity: doublePrecision("cumulative_equity").notNull(),
    drawdownPct: doublePrecision("drawdown_pct").notNull(),
    durationMinutes: doublePrecision("duration_minutes").notNull().default(0),
    exitReason: text("exit_reason"),
  },
  (table) => [
    index("trades_backtest_idx").on(table.backtestId, table.tradeNumber),
  ]
);

export type BacktestRecord = typeof backtests.$inferSelect;
export type NewBacktestRecord = typeof backtests.$inferInsert;
export type BacktestEquityPointRecord = typeof backtestEquityPoints.$inferSelect;
export type BacktestTradeRecord = typeof backtestTrades.$inferSelect;
