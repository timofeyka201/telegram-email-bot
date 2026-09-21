import { randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { authStore, type UserRecord } from "./store";

export const SESSION_COOKIE = "swiper_session";
const SESSION_DAYS = 30;

/**
 * Флаг Secure у куки должен совпадать с тем, как сайт реально отдаётся: по
 * http браузер куку с этим флагом просто выбрасывает, и вход перестаёт
 * работать молча. Поэтому смотрим на APP_URL — он и так описывает адрес
 * приложения, — а не на режим сборки.
 */
function secureCookie(): boolean {
  const url = process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (url) return /^https:/i.test(url);
  return process.env.NODE_ENV === "production";
}

export type PublicUser = {
  id: string;
  email: string;
  name?: string;
  createdAt: string;
  emailVerified: boolean;
};

export const toPublic = (u: UserRecord): PublicUser => ({
  id: u.id,
  email: u.email,
  name: u.name,
  createdAt: u.createdAt,
  emailVerified: !!u.emailVerified,
});

export const newUserId = () => randomUUID();

/** Токен сессии — случайные 32 байта: угадать нельзя, отозвать можно. */
export async function startSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const issuedAt = Date.now();
  const expiresAt = issuedAt + SESSION_DAYS * 24 * 60 * 60 * 1000;
  await authStore().putSession(token, { userId, expiresAt, issuedAt });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true, // из JavaScript кука недоступна — это защита от XSS
    sameSite: "lax", // и от отправки куки со сторонних сайтов
    secure: secureCookie(),
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await authStore().deleteSession(token);
  jar.delete(SESSION_COOKIE);
}

/** Текущий пользователь или null. Истёкшие сессии подчищаются на месте. */
export async function currentUser(): Promise<UserRecord | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const store = authStore();
  const session = await store.getSession(token);
  if (!session || session.expiresAt < Date.now()) {
    if (session) await store.deleteSession(token);
    return null;
  }

  const user = await store.getUser(session.userId);
  if (!user) return null;

  // Смена пароля обесценивает все входы, сделанные до неё. Сессии, выданные до
  // появления этого поля, считаем действительными: issuedAt у них нет.
  if (user.passwordChangedAt && (session.issuedAt ?? Infinity) < user.passwordChangedAt) {
    await store.deleteSession(token);
    return null;
  }
  return user;
}

/**
 * Грубое ограничение попыток входа: защищает от перебора паролей.
 * Память у инстанса своя, поэтому это не броня, а первый заслон.
 */
const attempts = new Map<string, { count: number; until: number }>();
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000;

export function tooManyAttempts(key: string): boolean {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (entry.until < Date.now()) {
    attempts.delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

export function noteFailure(key: string): void {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.until < now) attempts.set(key, { count: 1, until: now + WINDOW_MS });
  else entry.count += 1;
  // Карта не должна расти бесконечно на долгоживущем инстансе.
  if (attempts.size > 5000) {
    for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
  }
}

export function clearFailures(key: string): void {
  attempts.delete(key);
}

export function clientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return (forwarded?.split(",")[0] ?? "local").trim();
}
