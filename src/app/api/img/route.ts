import { NextRequest, NextResponse } from "next/server";
import { resolveWbImage, WB_REFERER, WB_UA } from "@/lib/wb-basket";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Прокси картинок. Нужен по двум причинам: CDN маркетплейсов отдают файлы
 * только со «своим» Referer, а у Wildberries ссылку ещё и нужно подобрать.
 * Список хостов закрытый — это заодно защита от SSRF.
 */
const ALLOWED = [
  /(^|\.)alicdn\.com$/i,
  /(^|\.)1688\.com$/i,
  /(^|\.)taobao\.com$/i,
  /(^|\.)tbcdn\.cn$/i,
  /(^|\.)aliyuncs\.com$/i,
  /(^|\.)picsum\.photos$/i,
  /(^|\.)unsplash\.com$/i,
  /(^|\.)dummyjson\.com$/i,
  /(^|\.)wbbasket\.ru$/i,
  /(^|\.)wb\.ru$/i,
];

/** Дополнительные хосты для зеркал и локальных стендов. Пусто по умолчанию. */
const EXTRA = (process.env.IMG_EXTRA_HOSTS || "")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

const MAX_BYTES = 8 * 1024 * 1024;

/** Каждому источнику — его собственный Referer, иначе CDN отвечает отказом. */
function headersFor(host: string): Record<string, string> {
  const wb = /wbbasket\.ru$|wb\.ru$/i.test(host);
  return {
    Referer: wb ? WB_REFERER : "https://detail.1688.com/",
    "User-Agent": WB_UA,
    Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
  };
}

function allowed(host: string): boolean {
  return ALLOWED.some((re) => re.test(host)) || EXTRA.includes(host);
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  // Wildberries: конкретную ссылку подбирает резолвер, а не клиент.
  const wbId = sp.get("wb");
  if (wbId) {
    const id = Number(wbId);
    const index = Math.max(1, Math.min(20, Number(sp.get("n") || 1)));
    if (!Number.isFinite(id) || id <= 0) return new NextResponse("bad wb id", { status: 400 });
    const resolved = await resolveWbImage(id, index);
    if (!resolved) return new NextResponse("image not found", { status: 404 });
    return stream(resolved);
  }

  const raw = sp.get("u");
  if (!raw) return new NextResponse("missing u", { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new NextResponse("bad url", { status: 400 });
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return new NextResponse("bad scheme", { status: 400 });
  }
  if (!allowed(target.hostname.toLowerCase())) {
    return new NextResponse("host not allowed", { status: 403 });
  }
  return stream(target.toString());
}

async function stream(url: string): Promise<NextResponse> {
  const host = new URL(url).hostname.toLowerCase();
  // Проверяем хост и здесь: резолвер настраивается переменными окружения,
  // и подобранная ссылка не должна обходить общий список разрешённых.
  if (!allowed(host)) return new NextResponse("host not allowed", { status: 403 });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const upstream = await fetch(url, { signal: ctrl.signal, headers: headersFor(host) });
    if (!upstream.ok || !upstream.body) return new NextResponse("upstream error", { status: 502 });

    const type = upstream.headers.get("content-type") || "image/jpeg";
    if (!type.startsWith("image/")) return new NextResponse("not an image", { status: 415 });

    const len = Number(upstream.headers.get("content-length") || 0);
    if (len > MAX_BYTES) return new NextResponse("too large", { status: 413 });

    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return new NextResponse("fetch failed", { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
