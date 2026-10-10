import { lookup } from "node:dns/promises";
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { extractPreview } from "@/lib/wish/opengraph";
import { safeUrl } from "@/lib/wish/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * Карточка по ссылке: человек присылает адрес товара, а название, фото и цену
 * достаём сами — переписывать их руками никто не станет.
 *
 * Запрос уходит с нашего сервера, поэтому ссылка — чужой ввод, которым можно
 * попробовать дотянуться до внутренней сети. Отсюда проверка адреса на каждом
 * шаге, ручные перенаправления и жёсткие ограничения на время и объём.
 */

const TIMEOUT = 6000;
const MAX_BYTES = 512 * 1024;
const MAX_HOPS = 3;

/** Диапазоны, которых в интернете не бывает: петля, локальная сеть, метаданные облака. */
function isPrivate(address: string, family: number): boolean {
  if (family === 6) {
    const a = address.toLowerCase();
    if (a === "::1" || a === "::" || a.startsWith("fe80:") || a.startsWith("fc") || a.startsWith("fd")) return true;
    // ::ffff:10.0.0.1 — тот же приватный адрес, только записанный как IPv6.
    const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPrivate(mapped[1], 4) : false;
  }
  const [a, b] = address.split(".").map(Number);
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // сюда же 169.254.169.254 — метаданные хостинга
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

async function reachable(url: URL): Promise<boolean> {
  try {
    const addresses = await lookup(url.hostname, { all: true });
    return addresses.length > 0 && addresses.every((a) => !isPrivate(a.address, a.family));
  } catch {
    return false;
  }
}

/** Ровно столько байт, сколько нужно на <head>: остальное читать незачем. */
async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  await reader.cancel().catch(() => undefined);
  return new TextDecoder("utf-8", { fatal: false }).decode(
    chunks.reduce((acc, c) => {
      const out = new Uint8Array(acc.length + c.length);
      out.set(acc);
      out.set(c, acc.length);
      return out;
    }, new Uint8Array()),
  );
}

export async function GET(req: Request) {
  // Ходить по чужим ссылкам с нашего адреса разрешаем только своим.
  if (!(await currentUser())) return NextResponse.json({ error: "Нужен вход" }, { status: 401 });

  const raw = new URL(req.url).searchParams.get("url") ?? "";
  const normalized = safeUrl(raw);
  if (!normalized) return NextResponse.json({ error: "Это не похоже на ссылку" }, { status: 400 });

  let target = new URL(normalized);
  let html: string | null = null;

  for (let hop = 0; hop <= MAX_HOPS; hop += 1) {
    if (!(await reachable(target))) {
      return NextResponse.json({ error: "По этой ссылке ничего не открыть" }, { status: 400 });
    }
    let res: Response;
    try {
      res = await fetch(target, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT),
        headers: {
          // Без внятного User-Agent половина магазинов отдаёт заглушку.
          "User-Agent": "Mozilla/5.0 (compatible; SwiperWishlist/1.0)",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "ru,en;q=0.8",
        },
      });
    } catch {
      return NextResponse.json({ error: "Магазин не ответил" }, { status: 502 });
    }

    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      const next = safeUrl(new URL(location, target).toString());
      if (!next) return NextResponse.json({ error: "Ссылка ведёт не туда" }, { status: 400 });
      target = new URL(next);
      continue;
    }
    if (!res.ok) return NextResponse.json({ error: `Магазин ответил кодом ${res.status}` }, { status: 502 });
    if (!(res.headers.get("content-type") ?? "").includes("html")) {
      return NextResponse.json({ error: "По ссылке не страница товара" }, { status: 415 });
    }
    html = await readCapped(res);
    break;
  }

  // Цикл кончился, а страницы нет — значит, перенаправления ходят по кругу.
  if (html === null) return NextResponse.json({ error: "Ссылка слишком долго перенаправляет" }, { status: 502 });

  const preview = extractPreview(html, target.toString());

  return NextResponse.json(
    { ...preview, url: target.toString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
