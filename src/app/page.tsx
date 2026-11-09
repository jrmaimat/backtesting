import { asc, desc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { backtestEquityPoints, backtests } from "@/db/schema";
import { ensureDemoSeeded } from "@/lib/seed-demo";
import {
  VaultDashboard,
  type BacktestWithSparkline,
} from "@/components/VaultDashboard";

export const dynamic = "force-dynamic";

function downsampleSparkline(
  points: Array<{ timestamp: string; returnPct: number; equity: number }>,
  target = 36
) {
  if (points.length <= target) return points;
  const out = [];
  const step = (points.length - 1) / (target - 1);
  for (let i = 0; i < target; i++) {
    out.push(points[Math.round(i * step)]);
  }
  return out;
}

export default async function HomePage() {
  await ensureDemoSeeded(false);

  const rows = await db
    .select()
    .from(backtests)
    .orderBy(desc(backtests.isPinned), desc(backtests.createdAt));

  let enriched: BacktestWithSparkline[] = [];

  if (rows.length > 0) {
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

    enriched = rows.map((r) => ({
      ...r,
      sparkline: downsampleSparkline(eqByBacktest.get(r.id) ?? [], 36),
    }));
  }

  return <VaultDashboard initialBacktests={enriched} />;
}
