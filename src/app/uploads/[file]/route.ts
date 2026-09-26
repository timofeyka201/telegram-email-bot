import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { uploadDir, UPLOAD_NAME } from "@/lib/uploads";

export const runtime = "nodejs";

/**
 * Фотография, приложенная к желанию. Имя — хэш содержимого, поэтому файл по
 * этому адресу никогда не меняется: кэшируем навсегда.
 *
 * Доступ открытый: вишлист смотрят по ссылке люди без учётной записи, и
 * картинки в нём должны открываться у них тоже. Угадать имя нельзя — это
 * 128 бит от содержимого.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;

  // Имя пришло из адресной строки: пускаем только то, что порождаем сами.
  if (!UPLOAD_NAME.test(file)) return new NextResponse("Неверное имя файла", { status: 400 });

  try {
    const body = await readFile(join(uploadDir(), file));
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Нет такой картинки", { status: 404 });
  }
}
