/**
 * Общая часть для сценариев, которые ходят в AE Platform (партнёрское API
 * AliExpress): чтение ключей, токен и запросы.
 *
 * Токен живёт полчаса, и выдача нового убивает прежний, поэтому он хранится в
 * файле и делится между всеми, кому нужен, — приложением и импортёром.
 * Логика та же, что в src/lib/ae/client.ts; здесь она на обычном JS, потому
 * что сценарии запускаются без сборки.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Ключи читаем из файла, а не из командной строки: иначе они остаются в
 * истории команд и в списке процессов. На сервере настройки лежат отдельно от
 * кода, поэтому путь можно задать через ENV_FILE:
 *
 *   ENV_FILE=/home/swiper/.env.production node scripts/build-catalog-ae.mjs
 */
function readEnvFile() {
  const out = {};
  for (const file of [process.env.ENV_FILE, ".env.local", ".env"].filter(Boolean)) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !(m[1] in out)) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return out;
}

export const env = { ...readEnvFile(), ...process.env };

export const TOKEN_URL = env.AE_TOKEN_URL || "https://oauth2.aeplatform.ru/token";
export const API_BASE = (env.AE_API_BASE || "https://api2.aeplatform.ru").replace(/\/+$/, "");

const EARLY = 60 * 1000;
const TIMEOUT = 20000;

export function tokenPath() {
  if (env.AE_TOKEN_FILE) return env.AE_TOKEN_FILE;
  return env.AUTH_FILE ? join(dirname(env.AUTH_FILE), "ae-token.json") : ".data/ae-token.json";
}

let memo = null;

function readToken() {
  try {
    const saved = JSON.parse(readFileSync(tokenPath(), "utf8"));
    return saved.token && saved.expiresAt > Date.now() + EARLY ? saved : null;
  } catch {
    return null;
  }
}

function saveToken(token) {
  const path = tokenPath();
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(token), { mode: 0o600 });
  renameSync(tmp, path);
}

/** Счётчик запросов за прогон: по нему считается расход дневного бюджета. */
export const spent = { calls: 0 };

/** Лишние пробелы и кавычки вокруг значения — самая частая причина отказа. */
const clean = (v) => String(v ?? "").trim().replace(/^["']|["']$/g, "").trim();

/**
 * Подсказка к отказу «invalid_client»: платформа не говорит, что именно не
 * понравилось, а причина почти всегда в том, как ключ попал в файл. Сами
 * значения не печатаем — только их приметы.
 */
function credentialsHint(id, secret) {
  const notes = [];
  notes.push(`длина client_id: ${id.length}${/^\d+$/.test(id) ? "" : " (не только цифры)"}`);
  notes.push(`длина секрета: ${secret.length}`);
  if (/\s/.test(id) || /\s/.test(secret)) notes.push("ВНУТРИ ЕСТЬ ПРОБЕЛ ИЛИ ПЕРЕНОС СТРОКИ — значение попало в файл не целиком");
  if (secret.length < 60) notes.push("секрет короче ожидаемого: в кабинете он длинный, похоже, скопировалась только часть");
  return notes.join("; ");
}

async function requestToken() {
  const id = clean(env.AE_CLIENT_ID);
  const secret = clean(env.AE_CLIENT_SECRET);
  if (!id || !secret) {
    throw new Error("Не заданы AE_CLIENT_ID и AE_CLIENT_SECRET (кабинет AE Platform → Мой профиль → Client credentials)");
  }

  const body = new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret });

  // Сначала так, как написано в документации — параметрами тела. Если
  // площадка отвечает «invalid_client», пробуем второй стандартный способ:
  // те же данные в заголовке Basic. Какой из них ждёт сервер, по ответу не
  // понять, а стоит попытка один запрос.
  const attempts = [
    { label: "в теле запроса", headers: {}, body },
    {
      label: "заголовком Basic",
      headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}` },
      body: new URLSearchParams({ grant_type: "client_credentials" }),
    },
  ];

  let last = "";
  for (const attempt of attempts) {
    spent.calls += 1;
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", ...attempt.headers },
      body: attempt.body,
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (res.ok) {
      const data = await res.json();
      return finishToken(data);
    }
    last = (await res.text()).slice(0, 300);
    // 401 и 400 с «invalid_client» — повод попробовать другой способ,
    // остальное бессмысленно повторять.
    if (!/invalid_client|unauthorized|authentication/i.test(last) || res.status >= 500) {
      throw new Error(`Токен не выдан (${res.status}): ${last}`);
    }
    console.error(`  способ «${attempt.label}» не подошёл: ${res.status}`);
  }

  throw new Error(
    `Токен не выдан: ${last}\n  Площадка не приняла ни данные в теле запроса, ни заголовок Basic.\n  ${credentialsHint(id, secret)}\n  Проверьте: клиент активен в кабинете, права выданы, почта подтверждена, а значения скопированы целиком.`,
  );
}

function finishToken(data) {
  if (!data.access_token) throw new Error("Ответ без токена");
  const seconds = Number(data.expires_in) > 0 ? Number(data.expires_in) : 1800;
  const token = {
    token: data.access_token,
    expiresAt: Date.now() + seconds * 1000,
    scope: data.scope ?? "",
    scheme: env.AE_AUTH_SCHEME ?? "Bearer",
  };
  saveToken(token);
  return token;
}

export async function token(force = false) {
  if (!force) {
    if (memo && memo.expiresAt > Date.now() + EARLY) return memo;
    const saved = readToken();
    if (saved) return (memo = saved);
  }
  return (memo = await requestToken());
}

function dropToken() {
  memo = null;
  try {
    unlinkSync(tokenPath());
  } catch {
    // уже убрали
  }
}

export class AeError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/**
 * Запрос к API. При 401 обновляет токен и повторяет один раз: его могли выбить
 * в соседнем процессе, и это обычное дело, а не сбой.
 *
 * Схему заголовка документация не называет, поэтому при 401 на первом же
 * запросе перебираем известные варианты и запоминаем сработавший.
 */
export async function call(path, { method = "GET", query, body } = {}) {
  const url = new URL(path.startsWith("http") ? path : `${API_BASE}${path}`);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }

  const schemes = env.AE_AUTH_SCHEME ? [env.AE_AUTH_SCHEME] : ["Bearer", "jwt", ""];
  let auth = await token();
  let lastBody = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    for (const scheme of attempt === 0 ? [auth.scheme, ...schemes.filter((s) => s !== auth.scheme)] : schemes) {
      spent.calls += 1;
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: scheme ? `${scheme} ${auth.token}` : auth.token,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT),
      });

      if (res.status === 401) {
        lastBody = (await res.text()).slice(0, 300);
        continue; // другая схема заголовка или протухший токен
      }
      if (res.status === 429) {
        throw new AeError("Платформа просит притормозить (429)", 429, (await res.text()).slice(0, 300));
      }
      if (!res.ok) {
        throw new AeError(`${res.status} на ${url.pathname}`, res.status, (await res.text()).slice(0, 400));
      }
      if (scheme !== auth.scheme) {
        // Схема подобрана — сохраняем, чтобы следующие запуски не перебирали заново.
        auth = { ...auth, scheme };
        saveToken(auth);
        memo = auth;
      }
      return await res.json();
    }
    // Ни одна схема не подошла: возможно, токен выбили. Берём новый и повторяем.
    dropToken();
    auth = await token(true);
  }
  throw new AeError(`Платформа не приняла токен: ${lastBody}`, 401, lastBody);
}

/** Пауза между запросами: лимиты в документации не названы, идём спокойно. */
export const pause = (ms) => new Promise((r) => setTimeout(r, ms));
