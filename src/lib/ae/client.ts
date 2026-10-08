import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Клиент AE Platform — партнёрского API AliExpress.
 *
 * Главная особенность платформы: токен выдаётся на полчаса, и **выдача нового
 * токена убивает прежний**. Поэтому токен здесь общий: он лежит в файле рядом
 * с остальными данными, и его переиспользуют все, кому он нужен, — и
 * приложение, и ночной импортёр. Если бы каждый запрашивал свой, они бы
 * бесконечно выбивали токен друг у друга.
 */

export type AeToken = { token: string; expiresAt: number; scope: string; scheme: string };

const TOKEN_URL = process.env.AE_TOKEN_URL?.trim() || "https://oauth2.aeplatform.ru/token";
const API_BASE = (process.env.AE_API_BASE?.trim() || "https://api2.aeplatform.ru").replace(/\/+$/, "");

/** Обновляем заранее: запрос, начатый на последней секунде, не должен упасть. */
const EARLY = 60 * 1000;
const TIMEOUT = 20000;

/**
 * Документация говорит «передавайте с префиксом Authorization», но не
 * уточняет схему, а token_type приходит как «jwt». Поэтому схему подбираем
 * один раз и запоминаем вместе с токеном.
 */
const SCHEMES = ["Bearer", "jwt", ""] as const;

export function aeConfigured(): boolean {
  return !!(process.env.AE_CLIENT_ID?.trim() && process.env.AE_CLIENT_SECRET?.trim());
}

/** Идентификатор партнёра: без него не собрать пути вида /users/{userId}/… */
export function aeUserId(): string | null {
  return process.env.AE_USER_ID?.trim() || null;
}

function tokenPath(): string {
  const configured = process.env.AE_TOKEN_FILE?.trim();
  if (configured) return configured;
  const auth = process.env.AUTH_FILE?.trim();
  return auth ? join(dirname(auth), "ae-token.json") : ".data/ae-token.json";
}

let memo: AeToken | null = null;
let inFlight: Promise<AeToken> | null = null;

async function readToken(): Promise<AeToken | null> {
  try {
    const saved = JSON.parse(await readFile(tokenPath(), "utf8")) as AeToken;
    return saved.token && saved.expiresAt > Date.now() + EARLY ? saved : null;
  } catch {
    return null;
  }
}

async function saveToken(token: AeToken): Promise<void> {
  const path = tokenPath();
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  // Токен — такой же секрет, как пароль: читать его должно только приложение.
  await writeFile(tmp, JSON.stringify(token), { mode: 0o600 });
  await rename(tmp, path);
}

async function requestToken(): Promise<AeToken> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.AE_CLIENT_ID?.trim() ?? "",
    client_secret: process.env.AE_CLIENT_SECRET?.trim() ?? "",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(TIMEOUT),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`AE Platform не выдал токен (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: string | number; scope?: string };
  if (!data.access_token) throw new Error("AE Platform вернул ответ без токена");
  // expires_in приходит строкой — приводим и подстраховываемся на случай пустого.
  const seconds = Number(data.expires_in) > 0 ? Number(data.expires_in) : 1800;
  const token: AeToken = {
    token: data.access_token,
    expiresAt: Date.now() + seconds * 1000,
    scope: data.scope ?? "",
    scheme: SCHEMES[0],
  };
  await saveToken(token);
  return token;
}

/** Действующий токен: из памяти, из общего файла или новый — в таком порядке. */
export async function aeToken(force = false): Promise<AeToken> {
  if (!aeConfigured()) throw new Error("Не заданы AE_CLIENT_ID и AE_CLIENT_SECRET");
  if (!force) {
    if (memo && memo.expiresAt > Date.now() + EARLY) return memo;
    const saved = await readToken();
    if (saved) return (memo = saved);
  }
  // Один запрос на процесс: параллельные вызовы выбили бы токен друг у друга.
  if (!inFlight) inFlight = requestToken().finally(() => (inFlight = null));
  return (memo = await inFlight);
}

/** Токен больше не действует: забываем его и у себя, и в общем файле. */
async function dropToken(): Promise<void> {
  memo = null;
  try {
    await unlink(tokenPath());
  } catch {
    // Файла нет — значит, его уже убрал кто-то другой.
  }
}

export class AeError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
  }
}

type Options = { method?: string; query?: Record<string, string | number | boolean | undefined>; body?: unknown };

/**
 * Запрос к API. Берёт общий токен, при 401 обновляет его и повторяет один раз:
 * токен могли выбить в соседнем процессе, и это нормальная ситуация, а не сбой.
 */
export async function aeFetch<T>(path: string, options: Options = {}): Promise<T> {
  const url = new URL(path.startsWith("http") ? path : `${API_BASE}${path}`);
  for (const [k, v] of Object.entries(options.query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }

  const allowed = process.env.AE_AUTH_SCHEME ? [process.env.AE_AUTH_SCHEME.trim()] : [...SCHEMES];
  let lastBody = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    let auth = await aeToken(attempt > 0);
    // Схему заголовка документация не называет, поэтому проверенную пробуем
    // первой, а при отказе перебираем остальные и запоминаем сработавшую.
    const order = [auth.scheme, ...allowed.filter((s) => s !== auth.scheme)];

    for (const scheme of order) {
      const res = await fetch(url, {
        method: options.method ?? "GET",
        headers: {
          Authorization: scheme ? `${scheme} ${auth.token}` : auth.token,
          ...(options.body ? { "Content-Type": "application/json" } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT),
        cache: "no-store",
      });

      if (res.status === 401) {
        lastBody = (await res.text()).slice(0, 300);
        continue;
      }
      if (!res.ok) {
        const body = (await res.text()).slice(0, 400);
        throw new AeError(`AE Platform ответил ${res.status} на ${url.pathname}`, res.status, body);
      }
      if (scheme !== auth.scheme) {
        auth = { ...auth, scheme };
        memo = auth;
        await saveToken(auth);
      }
      return (await res.json()) as T;
    }
    // Ни одна схема не подошла: скорее всего токен выбили в соседнем процессе.
    await dropToken();
  }
  throw new AeError(`AE Platform не принял токен: ${lastBody}`, 401, lastBody);
}
