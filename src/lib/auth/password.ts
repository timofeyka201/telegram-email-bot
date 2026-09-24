import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

type ScryptOptions = { N: number; r: number; p: number; maxmem: number };

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/**
 * Пароли храним хэшем scrypt: он встроен в Node, устойчив к перебору на видео-
 * картах и не тянет зависимостей. Параметры — рекомендованные OWASP на 2025 год.
 */
const PARAMS = { N: 2 ** 15, r: 8, p: 1 };
/**
 * Эти параметры требуют 128·N·r ≈ 33.5 МБ, а у Node лимит по умолчанию 32 МБ —
 * без явного maxmem вызов падает с «memory limit exceeded».
 */
const MAXMEM = 128 * PARAMS.N * PARAMS.r * 2;
const KEYLEN = 32;
const SALT_BYTES = 16;


export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await scrypt(password.normalize("NFKC"), salt, KEYLEN, { ...PARAMS, maxmem: MAXMEM });
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

/** Сравнение постоянного времени: иначе по задержке можно подбирать хэш. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, n, r, p, saltB64, keyB64] = stored.split("$");
    if (scheme !== "scrypt") return false;
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(keyB64, "base64");
    const params = { N: Number(n), r: Number(r), p: Number(p) };
    const actual = await scrypt(password.normalize("NFKC"), salt, expected.length, {
      ...params,
      // Лимит считаем по параметрам из самого хэша: он мог быть создан другими.
      maxmem: 128 * params.N * params.r * 2,
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// Правила лежат отдельно: их применяет и браузер, а сюда тянется node:crypto.
export { MIN_PASSWORD, PASSWORD_RULE, emailProblem, normalizeEmail, passwordProblem } from "./rules";
