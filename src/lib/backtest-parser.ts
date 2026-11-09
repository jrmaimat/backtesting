import Papa from "papaparse";
import type { ParsedTradeInput, RawEquityInput } from "./quant-metrics";

export type BacktestSourceFormat =
  | "tradingview_csv"
  | "trades_csv"
  | "equity_csv"
  | "json_report";

export interface ColumnMapping {
  mode: "trades" | "equity";
  tradeNumber?: string;
  symbol?: string;
  side?: string;
  signal?: string;
  entryTime?: string;
  exitTime?: string;
  entryPrice?: string;
  exitPrice?: string;
  quantity?: string;
  pnl?: string;
  pnlPct?: string;
  commission?: string;
  exitReason?: string;
  // Equity mode
  timestamp?: string;
  equity?: string;
  benchmark?: string;
}

export interface ParsedBacktestFileResult {
  detectedFormat: BacktestSourceFormat;
  headers: string[];
  mapping: ColumnMapping;
  previewRows: Record<string, string>[];
  totalRawRows: number;
  trades: ParsedTradeInput[];
  equityPoints: RawEquityInput[];
  suggestedMeta: {
    name?: string;
    symbol?: string;
    timeframe?: string;
    engine?: string;
    assetClass?: string;
    initialCapital?: number;
    parameters?: Record<string, string | number>;
    tags?: string[];
  };
  warnings: string[];
}

function cleanNumber(raw: unknown): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : NaN;
  if (typeof raw !== "string") return NaN;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "-" || trimmed === "N/A" || trimmed === "null") {
    return NaN;
  }
  // Handle accounting negatives like ($1,234.50)
  const isParenNeg = /^\(.*\)$/.test(trimmed);
  const stripped = trimmed
    .replace(/[()$,%\s]/g, "")
    .replace(/,/g, "");
  const num = Number(stripped);
  if (Number.isNaN(num)) return NaN;
  return isParenNeg ? -Math.abs(num) : num;
}

function normalizeHeader(h: string): string {
  return h
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");
}

function findHeader(headers: string[], candidates: string[]): string | undefined {
  const normalizedMap = new Map<string, string>();
  for (const h of headers) {
    normalizedMap.set(normalizeHeader(h), h);
  }
  // Exact normalized match first
  for (const cand of candidates) {
    const exact = normalizedMap.get(cand.toLowerCase());
    if (exact) return exact;
  }
  // Substring match fallback
  for (const cand of candidates) {
    const lc = cand.toLowerCase();
    for (const [norm, orig] of normalizedMap.entries()) {
      if (norm.includes(lc)) return orig;
    }
  }
  return undefined;
}

function parseSide(raw: string | undefined): "LONG" | "SHORT" {
  if (!raw) return "LONG";
  const v = raw.toLowerCase();
  if (v.includes("short") || v.includes("sell") || v === "s" || v === "-1") {
    return "SHORT";
  }
  return "LONG";
}

function inferMetaFromFileName(fileName?: string): {
  name?: string;
  symbol?: string;
} {
  if (!fileName) return {};
  const base = fileName.replace(/\.(csv|tsv|txt|json)$/i, "").replace(/[_-]+/g, " ").trim();
  const symMatch = base.match(
    /\b(BTC-?USDT|ETH-?USDT|SOL-?USDT|BTC|ETH|SPY|QQQ|AAPL|TSLA|NVDA|MSFT|NQ1!?|ES1!?|EUR\/?USD|GBP\/?USD|XAU\/?USD)\b/i
  );
  return {
    name: base
      ? base.replace(/\b\w/g, (c) => c.toUpperCase())
      : undefined,
    symbol: symMatch ? symMatch[1].toUpperCase() : undefined,
  };
}

export function detectCsvMapping(headers: string[]): {
  mapping: ColumnMapping;
  isTradingViewPaired: boolean;
} {
  const tradeNumber = findHeader(headers, ["trade #", "trade num", "trade id", "id"]);
  const side = findHeader(headers, ["type", "side", "direction", "action", "position"]);
  const signal = findHeader(headers, ["signal", "exit reason", "reason", "comment"]);
  const entryTime = findHeader(headers, [
    "entry time",
    "entry date",
    "open time",
    "open date",
    "date/time",
    "datetime",
    "timestamp",
    "date",
    "time",
  ]);
  const exitTime = findHeader(headers, [
    "exit time",
    "exit date",
    "close time",
    "close date",
    "date/time",
    "datetime",
    "timestamp",
    "date",
  ]);
  const entryPrice = findHeader(headers, [
    "entry price",
    "open price",
    "avg entry",
    "price usd",
    "price usdt",
    "price",
    "fill price",
  ]);
  const exitPrice = findHeader(headers, [
    "exit price",
    "close price",
    "avg exit",
  ]);
  const quantity = findHeader(headers, [
    "contracts",
    "quantity",
    "qty",
    "size",
    "shares",
    "amount",
    "volume",
    "units",
  ]);
  const pnl = findHeader(headers, [
    "net p&l usd",
    "net p&l",
    "profit usd",
    "profit usdt",
    "net profit",
    "realized pnl",
    "pnl",
    "profit",
    "p&l",
    "return $",
    "gain",
  ]);
  const pnlPct = findHeader(headers, [
    "profit %",
    "net p&l %",
    "pnl %",
    "pnl pct",
    "return %",
    "pct",
  ]);
  const commission = findHeader(headers, ["commission", "fee", "fees", "comm"]);
  const symbol = findHeader(headers, ["symbol", "ticker", "pair", "instrument", "asset"]);
  const exitReason = findHeader(headers, ["exit reason", "reason", "signal", "comment"]);

  const equityCol = findHeader(headers, [
    "equity",
    "portfolio value",
    "account balance",
    "balance",
    "nav",
    "total equity",
    "capital",
    "value",
  ]);
  const timestampCol = findHeader(headers, [
    "timestamp",
    "date/time",
    "datetime",
    "date",
    "time",
  ]);
  const benchmarkCol = findHeader(headers, [
    "benchmark",
    "benchmark equity",
    "buy & hold",
    "buy and hold",
    "spy",
    "bh",
  ]);

  const isTradingViewPaired = Boolean(
    tradeNumber &&
      side &&
      findHeader(headers, ["date/time"]) &&
      pnl
  );

  // Decide between trades mode vs equity mode
  const hasTradeSignals = Boolean(pnl || (entryPrice && exitPrice));
  const mode: "trades" | "equity" =
    hasTradeSignals ? "trades" : equityCol ? "equity" : "trades";

  return {
    isTradingViewPaired,
    mapping: {
      mode,
      tradeNumber,
      symbol,
      side,
      signal,
      entryTime,
      exitTime,
      entryPrice,
      exitPrice,
      quantity,
      pnl,
      pnlPct,
      commission,
      exitReason,
      timestamp: timestampCol,
      equity: equityCol,
      benchmark: benchmarkCol,
    },
  };
}

export function parseBacktestFile(
  rawText: string,
  fileName?: string,
  customMapping?: ColumnMapping
): ParsedBacktestFileResult {
  const trimmed = rawText.replace(/^\uFEFF/, "").trim();
  const warnings: string[] = [];
  const fileMeta = inferMetaFromFileName(fileName);

  if (!trimmed) {
    return {
      detectedFormat: "trades_csv",
      headers: [],
      mapping: { mode: "trades" },
      previewRows: [],
      totalRawRows: 0,
      trades: [],
      equityPoints: [],
      suggestedMeta: fileMeta,
      warnings: ["The uploaded file is empty."],
    };
  }

  // Try JSON if starts with { or [ or filename ends with .json
  if (
    trimmed.startsWith("{") ||
    trimmed.startsWith("[") ||
    fileName?.toLowerCase().endsWith(".json")
  ) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      return parseJsonReport(parsed, fileName, fileMeta);
    } catch {
      if (fileName?.toLowerCase().endsWith(".json")) {
        return {
          detectedFormat: "json_report",
          headers: [],
          mapping: { mode: "trades" },
          previewRows: [],
          totalRawRows: 0,
          trades: [],
          equityPoints: [],
          suggestedMeta: fileMeta,
          warnings: ["Invalid JSON syntax. Please check your file formatting."],
        };
      }
    }
  }

  // Parse as CSV/TSV via PapaParse
  const csvResult = Papa.parse<Record<string, string>>(trimmed, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.replace(/^\uFEFF/, "").trim(),
  });

  if (csvResult.errors.length > 0 && csvResult.data.length === 0) {
    warnings.push(
      `CSV parsing encountered an issue: ${csvResult.errors[0].message}`
    );
  }

  const headers = csvResult.meta.fields ?? [];
  const rows = csvResult.data.filter((r) =>
    Object.values(r).some((v) => v !== undefined && String(v).trim() !== "")
  );

  const detected = detectCsvMapping(headers);
  const mapping = customMapping ?? detected.mapping;

  // Check if TradingView paired rows exist (e.g. Type contains "Entry Long" / "Exit Long")
  const hasEntryExitPairs =
    mapping.mode === "trades" &&
    mapping.tradeNumber &&
    mapping.side &&
    rows.some((r) => {
      const val = (r[mapping.side!] ?? "").toLowerCase();
      return val.includes("entry") || val.includes("exit");
    });

  if (mapping.mode === "equity") {
    const equityPoints: RawEquityInput[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const ts = mapping.timestamp ? row[mapping.timestamp] : "";
      const eq = mapping.equity ? cleanNumber(row[mapping.equity]) : NaN;
      const bm = mapping.benchmark ? cleanNumber(row[mapping.benchmark]) : NaN;
      if (Number.isFinite(eq)) {
        equityPoints.push({
          timestamp: ts || "",
          equity: eq,
          benchmarkEquity: Number.isFinite(bm) ? bm : undefined,
        });
      }
    }
    if (equityPoints.length === 0) {
      warnings.push(
        "No valid numeric equity rows were found. Verify the Equity column mapping."
      );
    }

    return {
      detectedFormat: "equity_csv",
      headers,
      mapping,
      previewRows: rows.slice(0, 6),
      totalRawRows: rows.length,
      trades: [],
      equityPoints,
      suggestedMeta: {
        ...fileMeta,
        engine: "Equity Curve CSV",
        initialCapital: equityPoints[0]?.equity,
      },
      warnings,
    };
  }

  // Trades mode
  const trades: ParsedTradeInput[] = [];

  if (hasEntryExitPairs) {
    const grouped = new Map<
      string,
      { entry?: Record<string, string>; exit?: Record<string, string> }
    >();
    for (const r of rows) {
      const numKey = (r[mapping.tradeNumber!] ?? "").trim();
      if (!numKey) continue;
      const typeVal = (r[mapping.side!] ?? "").toLowerCase();
      const bucket = grouped.get(numKey) ?? {};
      if (typeVal.includes("entry")) {
        bucket.entry = r;
      } else if (typeVal.includes("exit")) {
        bucket.exit = r;
      } else if (!bucket.entry) {
        bucket.entry = r;
      } else {
        bucket.exit = r;
      }
      grouped.set(numKey, bucket);
    }

    let fallbackNum = 1;
    for (const [tradeNumStr, pair] of grouped.entries()) {
      const entryRow = pair.entry ?? pair.exit;
      const exitRow = pair.exit ?? pair.entry;
      if (!entryRow || !exitRow) continue;

      const sideRaw =
        entryRow[mapping.side!] ?? exitRow[mapping.side!] ?? "Long";
      const side = parseSide(sideRaw);
      const entryTime = mapping.entryTime
        ? entryRow[mapping.entryTime] ?? ""
        : "";
      const exitTime = mapping.exitTime
        ? exitRow[mapping.exitTime] ?? entryTime
        : entryTime;
      const entryPrice = mapping.entryPrice
        ? cleanNumber(entryRow[mapping.entryPrice])
        : 0;
      const exitPrice = mapping.exitPrice
        ? cleanNumber(exitRow[mapping.exitPrice])
        : mapping.entryPrice
          ? cleanNumber(exitRow[mapping.entryPrice])
          : 0;
      const quantity = mapping.quantity
        ? cleanNumber(exitRow[mapping.quantity] || entryRow[mapping.quantity])
        : 1;
      const commission = mapping.commission
        ? cleanNumber(exitRow[mapping.commission])
        : 0;

      let pnl = mapping.pnl ? cleanNumber(exitRow[mapping.pnl]) : NaN;
      if (!Number.isFinite(pnl)) {
        const ep = Number.isFinite(entryPrice) ? entryPrice : 0;
        const xp = Number.isFinite(exitPrice) ? exitPrice : 0;
        const q = Number.isFinite(quantity) ? quantity : 1;
        pnl = (xp - ep) * q * (side === "SHORT" ? -1 : 1) - (Number.isFinite(commission) ? commission : 0);
      }

      const pnlPct = mapping.pnlPct
        ? cleanNumber(exitRow[mapping.pnlPct])
        : undefined;

      trades.push({
        tradeNumber: Number(tradeNumStr) || fallbackNum,
        symbol: mapping.symbol
          ? entryRow[mapping.symbol] || fileMeta.symbol
          : fileMeta.symbol,
        side,
        entryTime,
        exitTime,
        entryPrice: Number.isFinite(entryPrice) ? entryPrice : 0,
        exitPrice: Number.isFinite(exitPrice) ? exitPrice : 0,
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        pnl,
        pnlPct: Number.isFinite(pnlPct) ? pnlPct : undefined,
        commission: Number.isFinite(commission) ? commission : 0,
        exitReason: mapping.exitReason
          ? exitRow[mapping.exitReason] || undefined
          : undefined,
      });
      fallbackNum++;
    }

    if (trades.length === 0) {
      warnings.push("Could not match Entry/Exit pairs in TradingView CSV.");
    }

    return {
      detectedFormat: "tradingview_csv",
      headers,
      mapping,
      previewRows: rows.slice(0, 6),
      totalRawRows: rows.length,
      trades,
      equityPoints: [],
      suggestedMeta: {
        ...fileMeta,
        engine: "TradingView",
      },
      warnings,
    };
  }

  // Standard 1-row-per-trade CSV
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const side = parseSide(mapping.side ? row[mapping.side] : undefined);
    const entryTime = mapping.entryTime ? row[mapping.entryTime] ?? "" : "";
    const exitTime = mapping.exitTime
      ? row[mapping.exitTime] ?? entryTime
      : entryTime;
    const entryPrice = mapping.entryPrice
      ? cleanNumber(row[mapping.entryPrice])
      : 0;
    const exitPrice = mapping.exitPrice
      ? cleanNumber(row[mapping.exitPrice])
      : entryPrice;
    const quantity = mapping.quantity ? cleanNumber(row[mapping.quantity]) : 1;
    const commission = mapping.commission
      ? cleanNumber(row[mapping.commission])
      : 0;
    let pnl = mapping.pnl ? cleanNumber(row[mapping.pnl]) : NaN;
    const pnlPct = mapping.pnlPct ? cleanNumber(row[mapping.pnlPct]) : undefined;

    if (!Number.isFinite(pnl)) {
      if (Number.isFinite(entryPrice) && Number.isFinite(exitPrice) && (entryPrice !== 0 || exitPrice !== 0)) {
        const q = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
        const comm = Number.isFinite(commission) ? commission : 0;
        pnl = (exitPrice - entryPrice) * q * (side === "SHORT" ? -1 : 1) - comm;
      } else {
        continue;
      }
    }

    const tradeNum = mapping.tradeNumber
      ? cleanNumber(row[mapping.tradeNumber])
      : i + 1;

    trades.push({
      tradeNumber: Number.isFinite(tradeNum) ? tradeNum : i + 1,
      symbol: mapping.symbol
        ? row[mapping.symbol] || fileMeta.symbol
        : fileMeta.symbol,
      side,
      entryTime,
      exitTime,
      entryPrice: Number.isFinite(entryPrice) ? entryPrice : 0,
      exitPrice: Number.isFinite(exitPrice) ? exitPrice : 0,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      pnl,
      pnlPct: Number.isFinite(pnlPct) ? pnlPct : undefined,
      commission: Number.isFinite(commission) ? commission : 0,
      exitReason: mapping.exitReason ? row[mapping.exitReason] : undefined,
    });
  }

  if (trades.length === 0) {
    warnings.push(
      "No valid trades could be extracted. Please adjust your column mappings below."
    );
  }

  return {
    detectedFormat: "trades_csv",
    headers,
    mapping,
    previewRows: rows.slice(0, 6),
    totalRawRows: rows.length,
    trades,
    equityPoints: [],
    suggestedMeta: {
      ...fileMeta,
      engine: "Custom CSV",
      symbol: trades[0]?.symbol || fileMeta.symbol,
    },
    warnings,
  };
}

function parseJsonReport(
  parsed: unknown,
  fileName: string | undefined,
  fileMeta: { name?: string; symbol?: string }
): ParsedBacktestFileResult {
  const warnings: string[] = [];

  // Normalize root structure
  let rawTrades: Record<string, unknown>[] = [];
  let rawEquity: Record<string, unknown>[] = [];
  let metaObj: Record<string, unknown> = {};

  if (Array.isArray(parsed)) {
    const first = parsed[0] as Record<string, unknown> | undefined;
    if (first && ("pnl" in first || "profit" in first || "entryPrice" in first || "entry_price" in first)) {
      rawTrades = parsed as Record<string, unknown>[];
    } else {
      rawEquity = parsed as Record<string, unknown>[];
    }
  } else if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    metaObj = obj;
    if (Array.isArray(obj.trades)) {
      rawTrades = obj.trades as Record<string, unknown>[];
    }
    if (Array.isArray(obj.equityCurve)) {
      rawEquity = obj.equityCurve as Record<string, unknown>[];
    } else if (Array.isArray(obj.equity_curve)) {
      rawEquity = obj.equity_curve as Record<string, unknown>[];
    } else if (Array.isArray(obj.equity)) {
      rawEquity = obj.equity as Record<string, unknown>[];
    }
  }

  const trades: ParsedTradeInput[] = rawTrades
    .map((r, idx): ParsedTradeInput | null => {
      const pnlVal = cleanNumber(
        r.pnl ?? r.profit ?? r.netProfit ?? r.net_profit ?? r.realizedPnl
      );
      const entryPrice = cleanNumber(r.entryPrice ?? r.entry_price ?? r.openPrice ?? 0);
      const exitPrice = cleanNumber(r.exitPrice ?? r.exit_price ?? r.closePrice ?? 0);
      const quantity = cleanNumber(r.quantity ?? r.qty ?? r.size ?? r.contracts ?? 1);
      const side = parseSide(String(r.side ?? r.type ?? r.direction ?? "LONG"));
      const commission = cleanNumber(r.commission ?? r.fee ?? 0);

      let pnl = pnlVal;
      if (!Number.isFinite(pnl)) {
        if (Number.isFinite(entryPrice) && Number.isFinite(exitPrice)) {
          pnl =
            (exitPrice - entryPrice) *
              (Number.isFinite(quantity) ? quantity : 1) *
              (side === "SHORT" ? -1 : 1) -
            (Number.isFinite(commission) ? commission : 0);
        } else {
          return null;
        }
      }

      const pnlPctRaw = cleanNumber(r.pnlPct ?? r.pnl_pct ?? r.returnPct);

      return {
        tradeNumber: Number(r.tradeNumber ?? r.trade_number ?? idx + 1) || idx + 1,
        symbol: String(r.symbol ?? metaObj.symbol ?? fileMeta.symbol ?? "ASSET"),
        side,
        entryTime: String(
          r.entryTime ?? r.entry_time ?? r.openTime ?? r.date ?? r.timestamp ?? ""
        ),
        exitTime: String(
          r.exitTime ?? r.exit_time ?? r.closeTime ?? r.entryTime ?? r.date ?? ""
        ),
        entryPrice: Number.isFinite(entryPrice) ? entryPrice : 0,
        exitPrice: Number.isFinite(exitPrice) ? exitPrice : 0,
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        pnl,
        pnlPct: Number.isFinite(pnlPctRaw) ? pnlPctRaw : undefined,
        commission: Number.isFinite(commission) ? commission : 0,
        exitReason:
          typeof (r.exitReason ?? r.exit_reason ?? r.signal) === "string"
            ? String(r.exitReason ?? r.exit_reason ?? r.signal)
            : undefined,
      };
    })
    .filter((t): t is ParsedTradeInput => t !== null);

  const equityPoints: RawEquityInput[] = rawEquity
    .map((r): RawEquityInput | null => {
      const eq = cleanNumber(r.equity ?? r.value ?? r.balance ?? r.nav);
      if (!Number.isFinite(eq)) return null;
      const bm = cleanNumber(r.benchmarkEquity ?? r.benchmark ?? r.spy);
      return {
        timestamp: String(r.timestamp ?? r.date ?? r.time ?? ""),
        equity: eq,
        benchmarkEquity: Number.isFinite(bm) ? bm : undefined,
      };
    })
    .filter((p): p is RawEquityInput => p !== null);

  if (trades.length === 0 && equityPoints.length === 0) {
    warnings.push(
      "Could not find `trades` or `equityCurve` items inside the JSON file."
    );
  }

  const initialCap = cleanNumber(
    metaObj.initialCapital ?? metaObj.initial_capital ?? metaObj.capital
  );

  const previewSource = rawTrades.length > 0 ? rawTrades : rawEquity;
  const headers =
    previewSource[0] && typeof previewSource[0] === "object"
      ? Object.keys(previewSource[0])
      : [];

  const previewRows = previewSource.slice(0, 6).map((r) => {
    const out: Record<string, string> = {};
    for (const k of headers) {
      out[k] = r[k] !== undefined && r[k] !== null ? String(r[k]) : "";
    }
    return out;
  });

  return {
    detectedFormat: "json_report",
    headers,
    mapping: { mode: trades.length > 0 ? "trades" : "equity" },
    previewRows,
    totalRawRows: previewSource.length,
    trades,
    equityPoints,
    suggestedMeta: {
      name:
        typeof metaObj.name === "string" ? metaObj.name : fileMeta.name,
      symbol:
        typeof metaObj.symbol === "string" ? metaObj.symbol : fileMeta.symbol,
      timeframe:
        typeof metaObj.timeframe === "string" ? metaObj.timeframe : undefined,
      engine:
        typeof metaObj.engine === "string" ? metaObj.engine : "JSON Report",
      assetClass:
        typeof metaObj.assetClass === "string" ? metaObj.assetClass : undefined,
      initialCapital: Number.isFinite(initialCap)
        ? initialCap
        : equityPoints[0]?.equity,
      parameters:
        metaObj.parameters && typeof metaObj.parameters === "object"
          ? (metaObj.parameters as Record<string, string | number>)
          : undefined,
      tags: Array.isArray(metaObj.tags)
        ? metaObj.tags.map(String)
        : undefined,
    },
    warnings,
  };
}
