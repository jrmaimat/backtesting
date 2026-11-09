"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  BarChart2,
  CheckSquare,
  Database,
  GitCompareArrows,
  LayoutGrid,
  Pin,
  Plus,
  RotateCcw,
  Search,
  Square,
  Table2,
  Trash2,
  TrendingDown,
  TrendingUp,
  Trophy,
  Upload,
} from "lucide-react";
import type { BacktestRecord } from "@/db/schema";
import { SparklineChart } from "@/components/charts/SparklineChart";
import {
  formatCurrency,
  formatPct,
  formatRatio,
  formatShortDate,
} from "@/lib/formatters";

export interface BacktestWithSparkline extends BacktestRecord {
  sparkline: Array<{
    timestamp: string;
    returnPct: number;
    equity: number;
  }>;
}

interface VaultDashboardProps {
  initialBacktests: BacktestWithSparkline[];
}

type SortKey =
  | "pinned_recent"
  | "return_desc"
  | "sharpe_desc"
  | "drawdown_asc"
  | "winrate_desc"
  | "pf_desc";

export function VaultDashboard({ initialBacktests }: VaultDashboardProps) {
  const router = useRouter();
  const [items, setItems] = useState<BacktestWithSparkline[]>(initialBacktests);
  const [search, setSearch] = useState("");
  const [assetFilter, setAssetFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState<SortKey>("pinned_recent");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const assetClasses = useMemo(() => {
    const unique = Array.from(new Set(items.map((b) => b.assetClass))).sort();
    return ["ALL", ...unique];
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = items.filter((b) => {
      if (assetFilter !== "ALL" && b.assetClass !== assetFilter) return false;
      if (!q) return true;
      return (
        b.name.toLowerCase().includes(q) ||
        b.symbol.toLowerCase().includes(q) ||
        b.engine.toLowerCase().includes(q) ||
        b.timeframe.toLowerCase().includes(q) ||
        b.tags.some((t) => t.toLowerCase().includes(q))
      );
    });

    return [...list].sort((a, b) => {
      switch (sortBy) {
        case "return_desc":
          return b.totalReturnPct - a.totalReturnPct;
        case "sharpe_desc":
          return b.sharpeRatio - a.sharpeRatio;
        case "drawdown_asc":
          // Less negative is smaller drawdown (e.g. -4% > -15%)
          return b.maxDrawdownPct - a.maxDrawdownPct;
        case "winrate_desc":
          return b.winRatePct - a.winRatePct;
        case "pf_desc":
          return b.profitFactor - a.profitFactor;
        case "pinned_recent":
        default:
          if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
      }
    });
  }, [items, search, assetFilter, sortBy]);

  const summary = useMemo(() => {
    if (items.length === 0) {
      return {
        totalStrategies: 0,
        pinnedCount: 0,
        totalTrades: 0,
        avgSharpe: 0,
        topStrategy: null as BacktestWithSparkline | null,
      };
    }
    const totalTrades = items.reduce((acc, b) => acc + b.totalTrades, 0);
    const avgSharpe =
      items.reduce((acc, b) => acc + b.sharpeRatio, 0) / items.length;
    const pinnedCount = items.filter((b) => b.isPinned).length;
    const topStrategy = [...items].sort(
      (a, b) => b.sharpeRatio - a.sharpeRatio
    )[0];

    return {
      totalStrategies: items.length,
      pinnedCount,
      totalTrades,
      avgSharpe,
      topStrategy,
    };
  }, [items]);

  function toggleCompare(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 6) return prev;
      return [...prev, id];
    });
  }

  async function togglePin(item: BacktestWithSparkline) {
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/backtests/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPinned: !item.isPinned }),
      });
      if (res.ok) {
        setItems((prev) =>
          prev.map((x) =>
            x.id === item.id ? { ...x, isPinned: !item.isPinned } : x
          )
        );
      }
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(item: BacktestWithSparkline) {
    if (
      !window.confirm(
        `Delete "${item.name}" and all of its stored trades and equity curve data?`
      )
    ) {
      return;
    }
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/backtests/${item.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setItems((prev) => prev.filter((x) => x.id !== item.id));
        setSelectedIds((prev) => prev.filter((id) => id !== item.id));
      }
    } finally {
      setBusyId(null);
    }
  }

  async function handleRestoreDemo() {
    setSeeding(true);
    try {
      const res = await fetch("/api/backtests/seed", { method: "POST" });
      if (res.ok) {
        const listRes = await fetch("/api/backtests");
        if (listRes.ok) {
          const data = (await listRes.json()) as {
            backtests: BacktestWithSparkline[];
          };
          setItems(data.backtests);
        }
      }
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* Top Banner */}
      <section className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-800/80 bg-[#0F141D]/90 p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[11px] font-medium text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              QUANT WORKBENCH
            </span>
            <span className="text-xs text-slate-500">
              PostgreSQL Persistent Vault
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">
            Backtested Strategy Vault
          </h1>
          <p className="max-w-2xl text-sm text-slate-400">
            Upload TradingView exports, trade-log CSVs, equity curves, or JSON
            reports to compute institutional risk metrics, drawdowns, and
            multi-strategy benchmarks.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {selectedIds.length >= 2 && (
            <button
              type="button"
              onClick={() =>
                router.push(`/compare?ids=${selectedIds.join(",")}`)
              }
              className="inline-flex items-center gap-2 rounded-xl border border-indigo-500/40 bg-indigo-500/15 px-4 py-2.5 text-sm font-medium text-indigo-300 transition hover:bg-indigo-500/25"
            >
              <GitCompareArrows className="h-4 w-4" />
              Compare ({selectedIds.length})
            </button>
          )}
          <Link
            href="/upload"
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-[0_0_28px_rgba(16,185,129,0.28)] transition hover:bg-emerald-400"
          >
            <Upload className="h-4 w-4 stroke-[2.25]" />
            Upload New Backtest
          </Link>
        </div>
      </section>

      {/* Bento Telemetry KPIs */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-800/80 bg-[#0F141D] p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-400">
            <span>Stored Backtests</span>
            <Database className="h-4 w-4 text-slate-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2.5">
            <span className="font-mono text-2xl font-bold tabular-nums text-slate-100">
              {summary.totalStrategies}
            </span>
            <span className="font-mono text-xs text-slate-500">
              {summary.pinnedCount} pinned
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800/80 bg-[#0F141D] p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-400">
            <span>Top Alpha (Sharpe)</span>
            <Trophy className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-2">
            {summary.topStrategy ? (
              <div className="flex items-baseline justify-between gap-2">
                <Link
                  href={`/backtests/${summary.topStrategy.id}`}
                  className="truncate text-sm font-semibold text-slate-100 hover:text-emerald-400"
                >
                  {summary.topStrategy.name}
                </Link>
                <span className="font-mono text-lg font-bold tabular-nums text-emerald-400">
                  {formatRatio(summary.topStrategy.sharpeRatio)}
                </span>
              </div>
            ) : (
              <span className="font-mono text-xl text-slate-500">—</span>
            )}
            {summary.topStrategy && (
              <p className="mt-0.5 font-mono text-xs text-slate-500">
                {summary.topStrategy.symbol} ·{" "}
                {formatPct(summary.topStrategy.totalReturnPct)}
              </p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800/80 bg-[#0F141D] p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-400">
            <span>Mean Vault Sharpe</span>
            <Activity className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={`font-mono text-2xl font-bold tabular-nums ${
                summary.avgSharpe >= 1
                  ? "text-emerald-400"
                  : summary.avgSharpe >= 0
                    ? "text-slate-100"
                    : "text-rose-400"
              }`}
            >
              {formatRatio(summary.avgSharpe)}
            </span>
            <span className="text-xs text-slate-500">annualized</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800/80 bg-[#0F141D] p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-400">
            <span>Executed Trades Logged</span>
            <BarChart2 className="h-4 w-4 text-indigo-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold tabular-nums text-slate-100">
              {summary.totalTrades.toLocaleString()}
            </span>
            <span className="text-xs text-slate-500">across runs</span>
          </div>
        </div>
      </section>

      {/* Toolbar: Search, Asset Filters, Sort, View Switch */}
      <section className="flex flex-col gap-3 rounded-2xl border border-slate-800/80 bg-[#0F141D] p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search strategy, ticker, engine, tag..."
              className="w-full rounded-xl border border-slate-800 bg-[#080B10] py-2 pl-9 pr-3 text-sm text-slate-200 placeholder-slate-500 focus:border-emerald-500/60 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {assetClasses.map((ac) => (
              <button
                key={ac}
                type="button"
                onClick={() => setAssetFilter(ac)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  assetFilter === ac
                    ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40"
                    : "bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }`}
              >
                {ac === "ALL" ? "All Assets" : ac}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            aria-label="Sort strategies"
            className="rounded-xl border border-slate-800 bg-[#080B10] px-3 py-2 text-xs font-medium text-slate-200 focus:border-emerald-500/60 focus:outline-none"
          >
            <option value="pinned_recent">Sort: Pinned & Recent</option>
            <option value="return_desc">Sort: Highest Return %</option>
            <option value="sharpe_desc">Sort: Highest Sharpe Ratio</option>
            <option value="drawdown_asc">Sort: Lowest Max Drawdown</option>
            <option value="winrate_desc">Sort: Highest Win Rate</option>
            <option value="pf_desc">Sort: Highest Profit Factor</option>
          </select>

          <div className="inline-flex rounded-xl border border-slate-800 bg-[#080B10] p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              title="Card Grid"
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                viewMode === "grid"
                  ? "bg-slate-800 text-slate-100"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Cards
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              title="Leaderboard Table"
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                viewMode === "table"
                  ? "bg-slate-800 text-slate-100"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <Table2 className="h-3.5 w-3.5" />
              Table
            </button>
          </div>
        </div>
      </section>

      {/* Empty State */}
      {items.length === 0 ? (
        <section className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-[#0F141D]/60 px-6 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10">
            <Upload className="h-6 w-6 text-emerald-400" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-slate-100">
            Your Backtest Vault is Empty
          </h2>
          <p className="mt-1.5 max-w-md text-sm text-slate-400">
            Upload a CSV or JSON backtest export from TradingView, Backtrader,
            QuantConnect, VectorBT, or custom scripts to visualize equity
            curves and risk ratios.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/upload"
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              <Plus className="h-4 w-4" />
              Upload First Backtest
            </Link>
            <button
              type="button"
              disabled={seeding}
              onClick={handleRestoreDemo}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" />
              {seeding ? "Loading..." : "Load Sample Demo Dataset"}
            </button>
          </div>
        </section>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-[#0F141D] px-6 py-12 text-center text-sm text-slate-400">
          No backtests match your current search or asset class filter.
        </div>
      ) : viewMode === "grid" ? (
        /* Strategy Cards Grid */
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-2">
          {filtered.map((item) => {
            const isPositive = item.totalReturnPct >= 0;
            const isSelected = selectedIds.includes(item.id);
            return (
              <article
                key={item.id}
                className={`group relative flex flex-col justify-between rounded-2xl border bg-[#0F141D] p-5 transition-all hover:border-slate-700 ${
                  isSelected
                    ? "border-indigo-500/60 ring-1 ring-indigo-500/30"
                    : "border-slate-800/80"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md border border-slate-700/80 bg-slate-900 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-200">
                        {item.symbol}
                      </span>
                      <span className="rounded-md bg-slate-800/80 px-2 py-0.5 font-mono text-[11px] text-slate-400">
                        {item.timeframe}
                      </span>
                      <span className="rounded-md border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium text-cyan-300">
                        {item.engine}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {item.assetClass}
                      </span>
                    </div>

                    <Link
                      href={`/backtests/${item.id}`}
                      className="flex items-center gap-1.5 text-lg font-semibold text-slate-100 transition group-hover:text-emerald-400"
                    >
                      <span className="truncate">{item.name}</span>
                      <ArrowUpRight className="h-4 w-4 shrink-0 opacity-0 transition group-hover:opacity-100" />
                    </Link>

                    <p className="font-mono text-xs text-slate-500">
                      {formatShortDate(item.startDate)} →{" "}
                      {formatShortDate(item.endDate)} · Init{" "}
                      {formatCurrency(item.initialCapital)}
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggleCompare(item.id)}
                      title={
                        isSelected
                          ? "Remove from comparison"
                          : "Select for comparison"
                      }
                      className={`rounded-lg p-1.5 transition ${
                        isSelected
                          ? "bg-indigo-500/20 text-indigo-300"
                          : "text-slate-500 hover:bg-slate-800 hover:text-slate-200"
                      }`}
                    >
                      {isSelected ? (
                        <CheckSquare className="h-4 w-4" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => togglePin(item)}
                      title={item.isPinned ? "Unpin strategy" : "Pin strategy"}
                      className={`rounded-lg p-1.5 transition ${
                        item.isPinned
                          ? "bg-amber-500/15 text-amber-400"
                          : "text-slate-500 hover:bg-slate-800 hover:text-slate-200"
                      }`}
                    >
                      <Pin className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => handleDelete(item)}
                      title="Delete backtest"
                      className="rounded-lg p-1.5 text-slate-500 transition hover:bg-rose-500/15 hover:text-rose-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Middle Row: Big Return + Sparkline */}
                <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-slate-800/70 bg-[#0A0E16] px-4 py-3">
                  <div>
                    <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                      {isPositive ? (
                        <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <TrendingDown className="h-3.5 w-3.5 text-rose-400" />
                      )}
                      Net Return
                    </div>
                    <div className="mt-1 flex items-baseline gap-2.5">
                      <span
                        className={`font-mono text-2xl font-bold tabular-nums ${
                          isPositive ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {formatPct(item.totalReturnPct)}
                      </span>
                      <span className="font-mono text-xs tabular-nums text-slate-400">
                        {formatCurrency(item.netProfit, true)}
                      </span>
                    </div>
                  </div>

                  <Link href={`/backtests/${item.id}`} className="shrink-0">
                    <SparklineChart
                      points={item.sparkline}
                      positive={isPositive}
                      width={156}
                      height={46}
                    />
                  </Link>
                </div>

                {/* Quant Metrics Grid */}
                <div className="mt-4 grid grid-cols-5 gap-2 border-t border-slate-800/80 pt-3.5 text-center sm:text-left">
                  <div>
                    <div className="text-[11px] text-slate-500">Sharpe</div>
                    <div className="font-mono text-sm font-semibold tabular-nums text-slate-200">
                      {formatRatio(item.sharpeRatio)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Max DD</div>
                    <div className="font-mono text-sm font-semibold tabular-nums text-rose-400">
                      {formatPct(item.maxDrawdownPct, false)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Win Rate</div>
                    <div className="font-mono text-sm font-semibold tabular-nums text-slate-200">
                      {item.totalTrades > 0
                        ? `${item.winRatePct.toFixed(1)}%`
                        : "Curve"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">PF</div>
                    <div className="font-mono text-sm font-semibold tabular-nums text-slate-200">
                      {formatRatio(item.profitFactor)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">Trades</div>
                    <div className="font-mono text-sm font-semibold tabular-nums text-slate-200">
                      {item.totalTrades > 0 ? item.totalTrades : "—"}
                    </div>
                  </div>
                </div>

                {/* Tags + Link */}
                <div className="mt-3.5 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5">
                    {item.tags.slice(0, 4).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-md bg-slate-900 px-2 py-0.5 font-mono text-[10px] text-slate-400"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                  <Link
                    href={`/backtests/${item.id}`}
                    className="shrink-0 text-xs font-medium text-emerald-400 hover:text-emerald-300"
                  >
                    Inspect Run →
                  </Link>
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        /* Dense Institutional Leaderboard Table */
        <section className="overflow-hidden rounded-2xl border border-slate-800/80 bg-[#0F141D]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1020px] text-left text-sm">
              <thead className="border-b border-slate-800 bg-[#0B0F17] font-mono text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="w-10 px-4 py-3 text-center">Cmp</th>
                  <th className="px-4 py-3">Strategy</th>
                  <th className="px-3 py-3">Asset</th>
                  <th className="px-3 py-3">Curve</th>
                  <th className="px-3 py-3 text-right">Net Profit</th>
                  <th className="px-3 py-3 text-right">Return %</th>
                  <th className="px-3 py-3 text-right">Sharpe</th>
                  <th className="px-3 py-3 text-right">Max DD</th>
                  <th className="px-3 py-3 text-right">Win Rate</th>
                  <th className="px-3 py-3 text-right">PF</th>
                  <th className="px-3 py-3 text-right">Trades</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map((item) => {
                  const isPos = item.totalReturnPct >= 0;
                  const isSelected = selectedIds.includes(item.id);
                  return (
                    <tr
                      key={item.id}
                      className="transition hover:bg-slate-900/60"
                    >
                      <td className="px-4 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => toggleCompare(item.id)}
                          className={`${
                            isSelected ? "text-indigo-400" : "text-slate-600 hover:text-slate-300"
                          }`}
                        >
                          {isSelected ? (
                            <CheckSquare className="mx-auto h-4 w-4" />
                          ) : (
                            <Square className="mx-auto h-4 w-4" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/backtests/${item.id}`}
                          className="block font-semibold text-slate-100 hover:text-emerald-400"
                        >
                          {item.name}
                        </Link>
                        <span className="font-mono text-[11px] text-slate-500">
                          {item.engine} · {item.timeframe}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 font-mono text-xs text-slate-200">
                          {item.symbol}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <SparklineChart
                          points={item.sparkline}
                          positive={isPos}
                          width={108}
                          height={32}
                        />
                      </td>
                      <td
                        className={`px-3 py-3 text-right font-mono tabular-nums font-medium ${
                          isPos ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {formatCurrency(item.netProfit, true)}
                      </td>
                      <td
                        className={`px-3 py-3 text-right font-mono tabular-nums font-semibold ${
                          isPos ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {formatPct(item.totalReturnPct)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-200">
                        {formatRatio(item.sharpeRatio)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-rose-400">
                        {formatPct(item.maxDrawdownPct, false)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-300">
                        {item.totalTrades > 0
                          ? `${item.winRatePct.toFixed(1)}%`
                          : "—"}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-300">
                        {formatRatio(item.profitFactor)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-400">
                        {item.totalTrades > 0 ? item.totalTrades : "Curve"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => togglePin(item)}
                            className={`rounded p-1.5 ${
                              item.isPinned
                                ? "text-amber-400"
                                : "text-slate-500 hover:text-slate-200"
                            }`}
                          >
                            <Pin className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(item)}
                            className="rounded p-1.5 text-slate-500 hover:text-rose-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Floating Comparison Action Dock */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-indigo-500/40 bg-[#0F141D]/95 px-4 py-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.6)] backdrop-blur-xl">
          <span className="font-mono text-xs text-slate-300">
            {selectedIds.length} strateg{selectedIds.length === 1 ? "y" : "ies"} selected
          </span>
          <button
            type="button"
            onClick={() => setSelectedIds([])}
            className="text-xs text-slate-400 hover:text-slate-200"
          >
            Clear
          </button>
          <button
            type="button"
            disabled={selectedIds.length < 2}
            onClick={() =>
              router.push(`/compare?ids=${selectedIds.join(",")}`)
            }
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-500 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <GitCompareArrows className="h-3.5 w-3.5" />
            Compare Curves
          </button>
        </div>
      )}
    </div>
  );
}
