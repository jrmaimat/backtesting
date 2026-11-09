import { asc, desc, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  backtestEquityPoints,
  backtests,
  type BacktestEquityPointRecord,
} from "@/db/schema";
import { ensureDemoSeeded } from "@/lib/seed-demo";
import { CompareWorkbench } from "@/components/CompareWorkbench";

export const dynamic = "force-dynamic";

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  await ensureDemoSeeded(false);
  const { ids: idsParam } = await searchParams;

  const allBacktests = await db
    .select()
    .from(backtests)
    .orderBy(desc(backtests.isPinned), desc(backtests.sharpeRatio));

  const requestedIds = (idsParam ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((id) => allBacktests.some((b) => b.id === id))
    .slice(0, 6);

  const initialSelectedIds =
    requestedIds.length > 0
      ? requestedIds
      : allBacktests.slice(0, 3).map((b) => b.id);

  const equityByBacktestId: Record<string, BacktestEquityPointRecord[]> = {};

  if (initialSelectedIds.length > 0) {
    const eqRows = await db
      .select()
      .from(backtestEquityPoints)
      .where(inArray(backtestEquityPoints.backtestId, initialSelectedIds))
      .orderBy(asc(backtestEquityPoints.pointIndex));

    for (const pt of eqRows) {
      if (!equityByBacktestId[pt.backtestId]) {
        equityByBacktestId[pt.backtestId] = [];
      }
      equityByBacktestId[pt.backtestId].push(pt);
    }
  }

  return (
    <CompareWorkbench
      allBacktests={allBacktests}
      initialSelectedIds={initialSelectedIds}
      equityByBacktestId={equityByBacktestId}
    />
  );
}
