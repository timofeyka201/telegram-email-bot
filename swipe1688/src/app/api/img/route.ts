import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Картинки 1688 лежат на alicdn и отдаются только со «своим» Referer, поэтому
 * фронт грузит их через этот прокси. Список хостов закрытый — это и защита от SSRF.
 */
const ALLOWED = [
  /(^|\.)alicdn\.com$/i,
  /(^|\.)1688\.com$/i,
  /(^|\.)taobao\.com$/i,
  /(^|\.)tbcdn\.cn$/i,
  /(^|\.)aliyuncs\.com$/i,
  /(^|\.)picsum\.photos$/i,
  /(^|\.)unsplash\.com$/i,
];

const MAX_BYTES = 8 * 1024 * 1024;

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("u");
  if (!raw) return new NextResponse("missing u", { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new NextResponse("bad url", { status: 400 });
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") return new NextResponse("bad scheme", { status: 400 });
  if (!ALLOWED.some((re) => re.test(target.hostname))) return new NextResponse("host not allowed", { status: 403 });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const upstream = await fetch(target, {
      signal: ctrl.signal,
      headers: {
        Referer: "https://detail.1688.com/",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
        Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
      },
    });
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
