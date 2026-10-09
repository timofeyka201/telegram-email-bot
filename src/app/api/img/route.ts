import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Прокси картинок: запасной путь, когда браузер не смог забрать фотографию с
 * чужого CDN напрямую. Список хостов закрытый — это заодно защита от SSRF.
 */
const ALLOWED = [
  // Фотографии AliExpress живут на этих хостах.
  /(^|\.)alicdn\.com$/i,
  /(^|\.)aliexpress-media\.com$/i,
  /(^|\.)aliyuncs\.com$/i,
  // Заглушки, которыми пользуется офлайн-подборка.
  /(^|\.)picsum\.photos$/i,
  /(^|\.)unsplash\.com$/i,
];

/** Дополнительные хосты для зеркал и локальных стендов. Пусто по умолчанию. */
const EXTRA = (process.env.IMG_EXTRA_HOSTS || "")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Referer не отправляем: часть CDN отдаёт файл только при его отсутствии, а
 * AliExpress на него не смотрит вовсе. User-Agent обычный — браузерный, иначе
 * некоторые узлы отвечают отказом серверным клиентам.
 */
function headers(): Record<string, string> {
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
    Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
  };
}

function allowed(host: string): boolean {
  return ALLOWED.some((re) => re.test(host)) || EXTRA.includes(host);
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

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
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const upstream = await fetch(url, { signal: ctrl.signal, headers: headers() });
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
