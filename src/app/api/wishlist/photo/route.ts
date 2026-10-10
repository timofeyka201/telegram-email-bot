import { createHash } from "node:crypto";
import { mkdir, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { clientKey, currentUser } from "@/lib/auth/session";
import { uploadDir, uploadUrl } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Снимок с телефона легко весит десяток мегабайт — дальше это уже не фотография. */
const MAX_BYTES = 12 * 1024 * 1024;
/** Та же ширина, что у фотографий каталога: больше плитки в вишлисте не нужно. */
const WIDTH = 640;
const QUALITY = 80;

/** Грубое ограничение: загрузка — самая дорогая операция, какая есть у вошедшего. */
const recent = new Map<string, { count: number; until: number }>();
const LIMIT = 40;
const WINDOW = 60 * 60 * 1000;

function tooMany(key: string): boolean {
  const now = Date.now();
  const entry = recent.get(key);
  if (!entry || entry.until < now) {
    recent.set(key, { count: 1, until: now + WINDOW });
    if (recent.size > 5000) for (const [k, v] of recent) if (v.until < now) recent.delete(k);
    return false;
  }
  entry.count += 1;
  return entry.count > LIMIT;
}

/**
 * Фотография к своему желанию. Принимаем файл из галереи, а не ссылку:
 * ссылку на своё фото человеку взять негде, а чужая однажды перестанет
 * открываться.
 *
 * Всё перекодируется в WebP через sharp. Это не только про вес: заодно
 * отваливаются метаданные снимка — а в них у телефона лежат координаты места
 * съёмки, и уехать вместе с вишлистом к друзьям они не должны.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Нужен вход" }, { status: 401 });
  if (tooMany(`${user.id}:${clientKey(req)}`)) {
    return NextResponse.json({ error: "Слишком много загрузок подряд. Попробуйте позже" }, { status: 429 });
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const value = form.get("photo");
    if (value instanceof File) file = value;
  } catch {
    return NextResponse.json({ error: "Не удалось прочитать файл" }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "Файл не выбран" }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Фотография тяжелее 12 МБ — выберите другую" }, { status: 413 });
  }

  const input = Buffer.from(await file.arrayBuffer());
  let output: Buffer;
  try {
    output = await sharp(input)
      // rotate() без аргумента применяет поворот из EXIF: снятое боком
      // иначе так боком и останется.
      .rotate()
      .resize({ width: WIDTH, withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toBuffer();
  } catch {
    return NextResponse.json({ error: "Это не похоже на фотографию" }, { status: 415 });
  }

  const name = `${createHash("sha256").update(output).digest("hex").slice(0, 32)}.webp`;
  const dir = uploadDir();
  try {
    await mkdir(dir, { recursive: true });
    // Через временный файл: раздача не должна встретить половину картинки.
    const tmp = join(dir, `${name}.tmp`);
    await writeFile(tmp, output);
    await rename(tmp, join(dir, name));
  } catch (e) {
    console.error("Фотография не сохранена:", e);
    return NextResponse.json({ error: "Не удалось сохранить фотографию" }, { status: 503 });
  }

  return NextResponse.json({ url: uploadUrl(name), bytes: output.length });
}
