import { dirname, join } from "node:path";

/**
 * Фотографии, которые человек приложил к своему желанию. Лежат рядом с
 * остальными данными — вне выкладки, чтобы переживать обновление кода.
 */
export function uploadDir(): string {
  const configured = process.env.UPLOAD_DIR?.trim();
  if (configured) return configured;
  const auth = process.env.AUTH_FILE?.trim();
  return auth ? join(dirname(auth), "uploads") : ".data/uploads";
}

/** Имя файла — хэш содержимого: одна и та же фотография не хранится дважды. */
export const UPLOAD_NAME = /^[a-f0-9]{32}\.webp$/;

export const uploadUrl = (name: string): string => `/uploads/${name}`;
