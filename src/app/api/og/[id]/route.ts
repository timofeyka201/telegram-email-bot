import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { imageDir, productById } from "@/lib/catalog";

export const runtime = "nodejs";

/**
 * Картинка к ссылке на товар — то, что видно в Telegram, WhatsApp и VK
 * вместо серого прямоугольника.
 *
 * Снимок товара квадратный, а превью в мессенджерах — широкое, поэтому фото
 * вписывается в полотно 1200×630 на светлой подложке, а не обрезается по
 * бокам. Текст сюда не рисуется намеренно: название и цену мессенджер и так
 * покажет из og-разметки, а шрифт с кириллицей пришлось бы тащить на сервер
 * и следить, чтобы он никуда не делся.
 */
const WIDTH = 1200;
const HEIGHT = 630;
/** Светлая подложка — тот же фон, что у витрины. */
const BACKGROUND = { r: 236, g: 238, b: 242, alpha: 1 };
/** Чужой сервер может молчать сколько угодно, а превью нужно отдать сейчас. */
const FETCH_TIMEOUT = 4000;

/** Снимок с диска или из сети — смотря что лежит в карточке. */
async function photo(src?: string): Promise<Buffer | null> {
  if (!src) return null;

  const local = /^\/media\/([a-f0-9]{32}(?:-t)?\.webp)$/.exec(src);
  if (local) {
    try {
      return await readFile(join(imageDir(), local[1]));
    } catch {
      return null;
    }
  }

  if (!/^https?:\/\//.test(src)) return null;
  try {
    const res = await fetch(src, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
      headers: { "User-Agent": "Mozilla/5.0", Accept: "image/*" },
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = productById(id);
  const source = await photo(product?.images?.[0]);

  const canvas = sharp({ create: { width: WIDTH, height: HEIGHT, channels: 3, background: BACKGROUND } });

  try {
    const body = source
      ? await sharp(source)
          .resize(WIDTH, HEIGHT, { fit: "contain", background: BACKGROUND })
          .jpeg({ quality: 82 })
          .toBuffer()
      : await canvas.jpeg({ quality: 82 }).toBuffer();

    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": "image/jpeg",
        // Превью перечитывают редко, но живёт оно ровно до следующего
        // снапшота: сутки — разумная середина.
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (e) {
    console.error("Превью не собрано:", e instanceof Error ? e.message : e);
    // Пустая подложка лучше битой картинки: мессенджер покажет хотя бы
    // название и цену из разметки.
    const body = await sharp({ create: { width: WIDTH, height: HEIGHT, channels: 3, background: BACKGROUND } })
      .jpeg()
      .toBuffer();
    return new NextResponse(new Uint8Array(body), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=300" },
    });
  }
}
