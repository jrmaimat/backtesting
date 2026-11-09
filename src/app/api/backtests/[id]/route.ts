import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { backtestEquityPoints, backtestTrades, backtests } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [backtest] = await db
      .select()
      .from(backtests)
      .where(eq(backtests.id, id));

    if (!backtest) {
      return NextResponse.json(
        { error: "Backtest not found." },
        { status: 404 }
      );
    }

    const [equityPoints, trades] = await Promise.all([
      db
        .select()
        .from(backtestEquityPoints)
        .where(eq(backtestEquityPoints.backtestId, id))
        .orderBy(asc(backtestEquityPoints.pointIndex)),
      db
        .select()
        .from(backtestTrades)
        .where(eq(backtestTrades.backtestId, id))
        .orderBy(asc(backtestTrades.tradeNumber))
        .limit(3000),
    ]);

    return NextResponse.json({
      backtest,
      equityPoints,
      trades,
    });
  } catch (error) {
    console.error("GET /api/backtests/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to load backtest details." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;

    const [existing] = await db
      .select()
      .from(backtests)
      .where(eq(backtests.id, id));

    if (!existing) {
      return NextResponse.json(
        { error: "Backtest not found." },
        { status: 404 }
      );
    }

    const updates: Partial<typeof backtests.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (typeof body.name === "string" && body.name.trim()) {
      updates.name = body.name.trim();
    }
    if (typeof body.symbol === "string" && body.symbol.trim()) {
      updates.symbol = body.symbol.trim().toUpperCase();
    }
    if (typeof body.timeframe === "string" && body.timeframe.trim()) {
      updates.timeframe = body.timeframe.trim();
    }
    if (typeof body.assetClass === "string" && body.assetClass.trim()) {
      updates.assetClass = body.assetClass.trim();
    }
    if (typeof body.engine === "string" && body.engine.trim()) {
      updates.engine = body.engine.trim();
    }
    if (typeof body.notes === "string") {
      updates.notes = body.notes;
    }
    if (typeof body.isPinned === "boolean") {
      updates.isPinned = body.isPinned;
    }
    if (Array.isArray(body.tags)) {
      updates.tags = body.tags.map((t) => String(t).trim()).filter(Boolean);
    }
    if (body.parameters && typeof body.parameters === "object") {
      updates.parameters = body.parameters as Record<string, string | number>;
    }

    const [updated] = await db
      .update(backtests)
      .set(updates)
      .where(eq(backtests.id, id))
      .returning();

    return NextResponse.json({ backtest: updated });
  } catch (error) {
    console.error("PATCH /api/backtests/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update backtest." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const deleted = await db
      .delete(backtests)
      .where(eq(backtests.id, id))
      .returning({ id: backtests.id });

    if (deleted.length === 0) {
      return NextResponse.json(
        { error: "Backtest not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({ deletedId: id });
  } catch (error) {
    console.error("DELETE /api/backtests/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete backtest." },
      { status: 500 }
    );
  }
}
