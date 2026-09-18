import { NextRequest, NextResponse } from "next/server";
import { currentPrices } from "@/lib/providers/local";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Текущие цены отложенных товаров. Клиент хранит цену на момент, когда товар
 * попал в списки, и сверяет её с этой выдачей — так находится снижение.
 */
export async function POST(req: NextRequest) {
  let ids: unknown;
  try {
    ({ ids } = (await req.json()) as { ids?: unknown });
  } catch {
    return NextResponse.json({ error: "Некорректное тело запроса" }, { status: 400 });
  }
  if (!Array.isArray(ids)) return NextResponse.json({ prices: {} });

  const wanted = ids.filter((id): id is string => typeof id === "string").slice(0, 500);
  return NextResponse.json({ prices: currentPrices(wanted) }, { headers: { "Cache-Control": "no-store" } });
}
