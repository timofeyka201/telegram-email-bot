import { NextRequest, NextResponse } from "next/server";
import { ApiError, fetchByUrl, hasToken, toOfferUrl } from "@/lib/bhapi";
import { fetchCard } from "@/lib/providers/wildberries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Догрузка карточки. В выдаче поиска описания и характеристик обычно нет:
 * у 1688 забираем товар целиком, у Wildberries — только недостающие поля.
 */
export async function GET(req: NextRequest) {
  const raw = (req.nextUrl.searchParams.get("url") || "").trim();

  const wbId = raw.match(/wildberries\.ru\/catalog\/(\d+)/i)?.[1];
  if (wbId) {
    const patch = await fetchCard(Number(wbId));
    return NextResponse.json({ patch });
  }

  const url = toOfferUrl(raw);
  if (!url) return NextResponse.json({ error: "Неизвестная ссылка на товар" }, { status: 400 });
  if (!hasToken()) return NextResponse.json({ error: "Токен парсера не настроен" }, { status: 503 });

  try {
    return NextResponse.json({ product: await fetchByUrl(url) });
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError("Неизвестная ошибка");
    return NextResponse.json({ error: err.message }, { status: err.status ?? 502 });
  }
}
