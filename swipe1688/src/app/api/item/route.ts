import { NextRequest, NextResponse } from "next/server";
import { ApiError, fetchByUrl, hasToken, toOfferUrl } from "@/lib/bhapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Догрузка полной карточки: в выдаче поиска обычно нет описания и отзывов. */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url") || "";
  const url = toOfferUrl(raw);
  if (!url) return NextResponse.json({ error: "Нужна ссылка или ID товара 1688" }, { status: 400 });
  if (!hasToken()) return NextResponse.json({ error: "Токен парсера не настроен" }, { status: 503 });

  try {
    return NextResponse.json({ product: await fetchByUrl(url) });
  } catch (e) {
    const err = e instanceof ApiError ? e : new ApiError("Неизвестная ошибка");
    return NextResponse.json({ error: err.message }, { status: err.status ?? 502 });
  }
}
