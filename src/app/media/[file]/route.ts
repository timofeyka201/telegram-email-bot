import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { NextResponse } from "next/server";
import { catalogPath } from "@/lib/catalog";

export const runtime = "nodejs";

/** Где лежат скачанные картинки. По умолчанию — рядом со снапшотом каталога. */
function imageDir(): string {
  const configured = process.env.IMAGE_DIR?.trim();
  if (configured) return configured;
  const catalog = catalogPath();
  return catalog ? join(dirname(catalog), "images") : "data/images";
}

/**
 * Отдаёт картинку, скачанную импортёром. Имя файла — хэш исходного адреса,
 * поэтому содержимое по нему никогда не меняется: кэшируем навсегда.
 *
 * Если файла нет (диск чистили, картинку не успели скачать), перенаправляем на
 * первоисточник из манифеста — карточка останется с фотографией, просто
 * медленнее. Пустая карточка была бы хуже.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;

  // Имя пришло из адресной строки: пускаем только то, что порождает импортёр,
  // иначе «../../etc/passwd» стал бы валидным запросом.
  if (!/^[a-f0-9]{32}\.webp$/.test(file)) {
    return new NextResponse("Неверное имя файла", { status: 400 });
  }

  const dir = imageDir();
  try {
    const body = await readFile(join(dir, file));
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    const source = await originalUrl(dir, file);
    if (source) return NextResponse.redirect(source, 302);
    return new NextResponse("Нет такой картинки", { status: 404 });
  }
}

/** Манифест читаем только при промахе — на горячем пути он не нужен. */
async function originalUrl(dir: string, file: string): Promise<string | null> {
  try {
    const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8")) as Record<string, string>;
    const url = manifest[file];
    return url && /^https?:\/\//.test(url) ? url : null;
  } catch {
    return null;
  }
}
