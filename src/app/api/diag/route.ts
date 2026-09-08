import { NextRequest, NextResponse } from "next/server";
import { providerInfo } from "@/lib/providers";
import { probeReport, resolveWbImage } from "@/lib/wb-basket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Проверка окружения на живом деплое: видно, какие источники отвечают и что
 * происходит с картинками Wildberries. Нужна, потому что «нет картинок» может
 * означать и отказ поиска, и неверную корзину CDN, и блокировку по IP.
 */
export async function GET(req: NextRequest) {
  const started = Date.now();
  const out: Record<string, unknown> = { providers: providerInfo() };

  // 1. Отвечает ли поиск Wildberries
  let sampleId: number | null = Number(req.nextUrl.searchParams.get("id")) || null;
  try {
    const base = (process.env.WB_SEARCH_BASE || "https://search.wb.ru").replace(/\/+$/, "");
    const url =
      `${base}/exactmatch/ru/common/v13/search?ab_testing=false&appType=1&curr=rub` +
      `&dest=-1257786&lang=ru&page=1&query=${encodeURIComponent("кроссовки")}&resultset=catalog&sort=popular&spp=30`;
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    });
    const body = res.ok ? ((await res.json()) as { data?: { products?: { id?: number }[] } }) : null;
    const products = body?.data?.products ?? [];
    out.wbSearch = { status: res.status, products: products.length };
    if (!sampleId) sampleId = products[0]?.id ?? null;
  } catch (e) {
    out.wbSearch = { error: e instanceof Error ? e.message : "ошибка" };
  }

  // 2. Что отвечают кандидаты CDN для конкретного товара
  if (sampleId) {
    try {
      out.wbImages = { id: sampleId, ...(await probeReport(sampleId)) };
      out.wbResolved = await resolveWbImage(sampleId, 1);
    } catch (e) {
      out.wbImages = { error: e instanceof Error ? e.message : "ошибка" };
    }
  } else {
    out.wbImages = { skipped: "не удалось получить id товара из поиска" };
  }

  out.elapsedMs = Date.now() - started;
  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
