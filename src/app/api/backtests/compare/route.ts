import { NextResponse } from "next/server";
import { asc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { backtestEquityPoints, backtests } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const idsParam = url.searchParams.get("ids") ?? "";
    const ids = idsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 6);

    if (ids.length === 0) {
      return NextResponse.json({ strategies: [] });
    }

    const rows = await db
      .select()
      .from(backtests)
      .where(inArray(backtests.id, ids));

    const eqRows = await db
      .select()
      .from(backtestEquityPoints)
      .where(inArray(backtestEquityPoints.backtestId, ids))
      .orderBy(asc(backtestEquityPoints.pointIndex));

    const eqMap = new Map<string, typeof eqRows>();
    for (const pt of eqRows) {
      const arr = eqMap.get(pt.backtestId) ?? [];
      arr.push(pt);
      eqMap.set(pt.backtestId, arr);
    }

    // Preserve requested order
    const byId = new Map(rows.map((r) => [r.id, r]));
    const strategies = ids
      .map((id) => {
        const b = byId.get(id);
        if (!b) return null;
        return {
          backtest: b,
          equityPoints: eqMap.get(id) ?? [],
        };
      })
      .filter(Boolean);

    return NextResponse.json({ strategies });
  } catch (error) {
    console.error("GET /api/backtests/compare error:", error);
    return NextResponse.json(
      { error: "Failed to load comparison data." },
      { status: 500 }
    );
  }
}
