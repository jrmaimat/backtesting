import { NextResponse } from "next/server";
import { asc, desc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { backtestEquityPoints, backtests } from "@/db/schema";
import { persistBacktest } from "@/lib/backtest-repo";
import { parseBacktestFile } from "@/lib/backtest-parser";
import { ensureDemoSeeded } from "@/lib/seed-demo";
import type { ParsedTradeInput, RawEquityInput } from "@/lib/quant-metrics";

export const dynamic = "force-dynamic";

function downsampleSparkline(
  points: Array<{ timestamp: string; returnPct: number; equity: number }>,
  target = 36
) {
  if (points.length <= target) return points;
  const out = [];
  const step = (points.length - 1) / (target - 1);
  for (let i = 0; i < target; i++) {
    const idx = Math.round(i * step);
    out.push(points[idx]);
  }
  return out;
}

export async function GET(request: Request) {
  try {
    await ensureDemoSeeded(false);

    const url = new URL(request.url);
    const includeSparkline = url.searchParams.get("sparklines") !== "false";

    const rows = await db
      .select()
      .from(backtests)
      .orderBy(desc(backtests.isPinned), desc(backtests.createdAt));

    if (!includeSparkline || rows.length === 0) {
      return NextResponse.json({
        backtests: rows.map((r) => ({ ...r, sparkline: [] })),
      });
    }

    const ids = rows.map((r) => r.id);
    const eqRows = await db
      .select({
        backtestId: backtestEquityPoints.backtestId,
        pointIndex: backtestEquityPoints.pointIndex,
        timestamp: backtestEquityPoints.timestamp,
        returnPct: backtestEquityPoints.returnPct,
        equity: backtestEquityPoints.equity,
      })
      .from(backtestEquityPoints)
      .where(inArray(backtestEquityPoints.backtestId, ids))
      .orderBy(asc(backtestEquityPoints.pointIndex));

    const eqByBacktest = new Map<
      string,
      Array<{ timestamp: string; returnPct: number; equity: number }>
    >();
    for (const pt of eqRows) {
      const list = eqByBacktest.get(pt.backtestId) ?? [];
      list.push({
        timestamp: pt.timestamp,
        returnPct: pt.returnPct,
        equity: pt.equity,
      });
      eqByBacktest.set(pt.backtestId, list);
    }

    const enriched = rows.map((r) => ({
      ...r,
      sparkline: downsampleSparkline(eqByBacktest.get(r.id) ?? [], 36),
    }));

    return NextResponse.json({ backtests: enriched });
  } catch (error) {
    console.error("GET /api/backtests error:", error);
    return NextResponse.json(
      { error: "Failed to load backtests." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    let body: Record<string, unknown> = {};

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      const rawText =
        file && typeof file !== "string"
          ? await file.text()
          : String(formData.get("rawText") ?? "");
      const fileName =
        file && typeof file !== "string"
          ? file.name
          : String(formData.get("fileName") ?? "upload.csv");
      const parsed = parseBacktestFile(rawText, fileName);

      body = {
        name:
          formData.get("name") ||
          parsed.suggestedMeta.name ||
          "Uploaded Strategy",
        symbol:
          formData.get("symbol") || parsed.suggestedMeta.symbol || "ASSET",
        timeframe:
          formData.get("timeframe") || parsed.suggestedMeta.timeframe || "1D",
        assetClass:
          formData.get("assetClass") ||
          parsed.suggestedMeta.assetClass ||
          "Crypto",
        engine:
          formData.get("engine") || parsed.suggestedMeta.engine || "Custom CSV",
        sourceType: parsed.detectedFormat,
        fileName,
        initialCapital: Number(
          formData.get("initialCapital") ||
            parsed.suggestedMeta.initialCapital ||
            10000
        ),
        trades: parsed.trades,
        equityPoints: parsed.equityPoints,
        notes: String(formData.get("notes") ?? ""),
      };
    } else {
      body = (await request.json()) as Record<string, unknown>;
    }

    // Optional rawFileText fallback if client posts raw file text in JSON
    let trades = Array.isArray(body.trades)
      ? (body.trades as ParsedTradeInput[])
      : [];
    let equityPoints = Array.isArray(body.equityPoints)
      ? (body.equityPoints as RawEquityInput[])
      : [];
    let sourceType =
      typeof body.sourceType === "string" ? body.sourceType : "trades_csv";

    if (
      trades.length === 0 &&
      equityPoints.length === 0 &&
      typeof body.rawText === "string"
    ) {
      const parsed = parseBacktestFile(
        body.rawText,
        typeof body.fileName === "string" ? body.fileName : undefined
      );
      trades = parsed.trades;
      equityPoints = parsed.equityPoints;
      sourceType = parsed.detectedFormat;
    }

    const name = String(body.name ?? "").trim();
    const symbol = String(body.symbol ?? "ASSET").trim();
    const timeframe = String(body.timeframe ?? "1D").trim();
    const assetClass = String(body.assetClass ?? "Crypto").trim();
    const engine = String(body.engine ?? "Custom CSV").trim();
    const initialCapital = Number(body.initialCapital ?? 10000);

    if (!name) {
      return NextResponse.json(
        { error: "Strategy name is required." },
        { status: 400 }
      );
    }

    if (!Number.isFinite(initialCapital) || initialCapital <= 0) {
      return NextResponse.json(
        { error: "Initial capital must be a positive number." },
        { status: 400 }
      );
    }

    if (trades.length === 0 && equityPoints.length === 0) {
      return NextResponse.json(
        {
          error:
            "No valid trades or equity curve points were found in the uploaded data.",
        },
        { status: 400 }
      );
    }

    const tags = Array.isArray(body.tags)
      ? body.tags.map((t) => String(t).trim()).filter(Boolean)
      : [];

    const parameters =
      body.parameters && typeof body.parameters === "object"
        ? (body.parameters as Record<string, string | number>)
        : {};

    const created = await persistBacktest({
      name,
      symbol,
      timeframe,
      assetClass,
      engine,
      sourceType,
      fileName: typeof body.fileName === "string" ? body.fileName : null,
      initialCapital,
      tags,
      parameters,
      notes: typeof body.notes === "string" ? body.notes : "",
      isPinned: Boolean(body.isPinned),
      trades,
      equityPoints,
    });

    return NextResponse.json({ backtest: created }, { status: 201 });
  } catch (error) {
    console.error("POST /api/backtests error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to save backtest result.",
      },
      { status: 500 }
    );
  }
}
