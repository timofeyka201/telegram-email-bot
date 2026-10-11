import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { imageDir } from "@/lib/catalog";
import { uploadDir, UPLOAD_NAME } from "@/lib/uploads";
import { wishlistByCode } from "@/lib/wish/server";
import { normalizeCode } from "@/lib/wish/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Картинка к ссылке на вишлист: коллаж из первых подарков.
 *
 * Одно фото рассказало бы про один подарок, а ссылку отправляют ради всего
 * списка — поэтому до четырёх снимков в сетке. Текста нет по той же причине,
 * что и в превью товара: имя и число желаний мессенджер возьмёт из разметки,
 * а шрифт с кириллицей пришлось бы возить с собой.
 */
const WIDTH = 1200;
const HEIGHT = 630;
const BACKGROUND = { r: 236, g: 238, b: 242, alpha: 1 };
const FETCH_TIMEOUT = 4000;
/** Больше четырёх плиток на таком полотне уже не разглядеть. */
const MAX_TILES = 4;

async function bytes(src?: string): Promise<Buffer | null> {
  if (!src) return null;

  const media = /^\/media\/([a-f0-9]{32}(?:-t)?\.webp)$/.exec(src);
  if (media) {
    try {
      return await readFile(join(imageDir(), media[1]));
    } catch {
      return null;
    }
  }

  // Фотография, приложенная к своему желанию, лежит в другом каталоге.
  const upload = /^\/uploads\/([^/]+)$/.exec(src);
  if (upload) {
    if (!UPLOAD_NAME.test(upload[1])) return null;
    try {
      return await readFile(join(uploadDir(), upload[1]));
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

/** Сетка под число плиток: одна во всё полотно, две половинами, дальше 2×2. */
function grid(n: number): { left: number; top: number; w: number; h: number }[] {
  if (n <= 1) return [{ left: 0, top: 0, w: WIDTH, h: HEIGHT }];
  if (n === 2) {
    return [
      { left: 0, top: 0, w: WIDTH / 2, h: HEIGHT },
      { left: WIDTH / 2, top: 0, w: WIDTH / 2, h: HEIGHT },
    ];
  }
  const w = WIDTH / 2;
  const h = HEIGHT / 2;
  return [
    { left: 0, top: 0, w, h },
    { left: w, top: 0, w, h },
    { left: 0, top: h, w, h },
    { left: w, top: h, w, h },
  ].slice(0, n);
}

const blank = () =>
  sharp({ create: { width: WIDTH, height: HEIGHT, channels: 3, background: BACKGROUND } }).jpeg({ quality: 82 }).toBuffer();

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = normalizeCode(raw);

  const send = (body: Buffer, maxAge: number) =>
    new NextResponse(new Uint8Array(body), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": `public, max-age=${maxAge}` },
    });

  try {
    const list = code ? await wishlistByCode(code) : null;
    // Закрытый список не показывает даже своих картинок.
    if (!list || !list.shared) return send(await blank(), 300);

    const sources = list.items.map((i) => i.image).filter(Boolean).slice(0, MAX_TILES) as string[];
    const loaded = (await Promise.all(sources.map(bytes))).filter((b): b is Buffer => !!b);
    if (!loaded.length) return send(await blank(), 600);

    const cells = grid(loaded.length);
    const tiles = await Promise.all(
      loaded.slice(0, cells.length).map(async (buf, i) => ({
        input: await sharp(buf)
          .resize(Math.round(cells[i].w), Math.round(cells[i].h), { fit: "cover" })
          .toBuffer(),
        left: Math.round(cells[i].left),
        top: Math.round(cells[i].top),
      })),
    );

    const body = await sharp({ create: { width: WIDTH, height: HEIGHT, channels: 3, background: BACKGROUND } })
      .composite(tiles)
      .jpeg({ quality: 82 })
      .toBuffer();
    return send(body, 1800);
  } catch (e) {
    console.error("Превью вишлиста не собрано:", e instanceof Error ? e.message : e);
    return send(await blank(), 300);
  }
}
