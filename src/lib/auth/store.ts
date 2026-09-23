import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type UserRecord = {
  id: string;
  email: string;
  name?: string;
  passwordHash: string;
  createdAt: string;
  /** Почта подтверждена переходом по ссылке из письма. */
  emailVerified?: boolean;
  /**
   * Момент последней смены пароля. Сессии, выданные раньше, считаются
   * недействительными — так смена пароля выбрасывает всех, кто уже вошёл,
   * не требуя от хранилища вести список сессий и уметь его не потерять.
   */
  passwordChangedAt?: number;
};

export type SessionRecord = { userId: string; expiresAt: number; issuedAt: number };

export interface AuthStore {
  readonly kind: "redis" | "file";
  readonly durable: boolean;
  /** Проверка связи: пишет, читает и стирает пробный ключ. Бросает с внятным текстом. */
  check(): Promise<void>;
  userIdByEmail(email: string): Promise<string | null>;
  getUser(id: string): Promise<UserRecord | null>;
  createUser(user: UserRecord): Promise<void>;
  /** Перезапись существующей записи: смена пароля, отметка о подтверждении почты. */
  updateUser(user: UserRecord): Promise<void>;
  putSession(token: string, session: SessionRecord): Promise<void>;
  getSession(token: string): Promise<SessionRecord | null>;
  deleteSession(token: string): Promise<void>;
  /** Одноразовый ключ (подтверждение почты, сброс пароля) с временем жизни. */
  putToken(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Читает и сразу стирает: ссылкой из письма можно воспользоваться один раз. */
  takeToken(key: string): Promise<string | null>;
  getProfile(userId: string): Promise<string | null>;
  putProfile(userId: string, json: string): Promise<void>;
}

// ------------------------------------------------------------------- Redis
/** Текст ошибки важнее её кода: по нему человек чинит настройку, не залезая в исходники. */
function explainStatus(status: number, body: string): string {
  if (status === 401 || status === 403) return "токен не подошёл (AUTH_REDIS_TOKEN)";
  if (status === 404) return "по этому адресу ничего нет — проверьте AUTH_REDIS_URL";
  if (status === 429) return "исчерпан лимит запросов к базе";
  if (status >= 500) return "база временно недоступна";
  return body.slice(0, 200) || `код ответа ${status}`;
}

/**
 * Хранилище для продакшена. Совместимо с Upstash и любым Redis с REST-шлюзом:
 * команды отправляются массивом, ответ приходит в поле result.
 */
function redisStore(url: string, token: string): AuthStore {
  const call = async <T>(command: (string | number)[]): Promise<T | null> => {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(command),
        cache: "no-store",
      });
    } catch (e) {
      // Сюда попадают опечатка в домене, отсутствие сети и обрыв соединения.
      throw new Error(`не удалось связаться с базой: ${e instanceof Error ? e.message : "сеть недоступна"}`);
    }
    if (!res.ok) throw new Error(explainStatus(res.status, await res.text().catch(() => "")));
    const json = (await res.json().catch(() => null)) as { result?: T; error?: string } | null;
    if (!json) throw new Error("база ответила не в формате REST-шлюза — похоже, адрес ведёт не туда");
    if (json.error) throw new Error(json.error);
    return json.result ?? null;
  };

  const getJson = async <T>(key: string): Promise<T | null> => {
    const raw = await call<string>(["GET", key]);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  };

  return {
    kind: "redis",
    durable: true,
    async check() {
      const key = `probe:${Date.now()}`;
      await call(["SET", key, "ok", "EX", 60]);
      const back = await call<string>(["GET", key]);
      await call(["DEL", key]);
      if (back !== "ok") throw new Error("база приняла запись, но вернула не то, что записали");
    },
    userIdByEmail: (email) => call<string>(["GET", `user:email:${email}`]),
    getUser: (id) => getJson<UserRecord>(`user:${id}`),
    async createUser(user) {
      // NX не даёт перезаписать чужую регистрацию при гонке двух запросов.
      const claimed = await call<string>(["SET", `user:email:${user.email}`, user.id, "NX"]);
      if (claimed !== "OK") throw new Error("EMAIL_TAKEN");
      await call(["SET", `user:${user.id}`, JSON.stringify(user)]);
    },
    async updateUser(user) {
      await call(["SET", `user:${user.id}`, JSON.stringify(user)]);
    },
    async putSession(token, session) {
      const ttl = Math.max(60, Math.floor((session.expiresAt - Date.now()) / 1000));
      await call(["SET", `session:${token}`, JSON.stringify(session), "EX", ttl]);
    },
    getSession: (token) => getJson<SessionRecord>(`session:${token}`),
    async deleteSession(token) {
      await call(["DEL", `session:${token}`]);
    },
    async putToken(key, value, ttlSeconds) {
      await call(["SET", `tok:${key}`, value, "EX", Math.max(60, Math.floor(ttlSeconds))]);
    },
    async takeToken(key) {
      try {
        return await call<string>(["GETDEL", `tok:${key}`]);
      } catch {
        // GETDEL есть не в каждом шлюзе. Тогда читаем и стираем двумя командами:
        // окно на повторное использование ничтожно, а ссылка всё равно одноразовая.
        const value = await call<string>(["GET", `tok:${key}`]);
        await call(["DEL", `tok:${key}`]);
        return value;
      }
    },
    getProfile: (userId) => call<string>(["GET", `profile:${userId}`]),
    async putProfile(userId, json) {
      await call(["SET", `profile:${userId}`, json]);
    },
  };
}
// -------------------------------------------------------------------- файл
type FileShape = {
  users: Record<string, UserRecord>;
  emails: Record<string, string>;
  sessions: Record<string, SessionRecord>;
  profiles: Record<string, string>;
  tokens: Record<string, { value: string; expiresAt: number }>;
};

const EMPTY: FileShape = { users: {}, emails: {}, sessions: {}, profiles: {}, tokens: {} };

/**
 * Хранилище для разработки и самостоятельного запуска. На Vercel не годится:
 * файловая система там эфемерная и своя у каждого инстанса.
 */
function fileStore(path: string): AuthStore {
  let queue: Promise<unknown> = Promise.resolve();

  const read = async (): Promise<FileShape> => {
    try {
      return { ...EMPTY, ...(JSON.parse(await readFile(path, "utf8")) as FileShape) };
    } catch {
      return { ...EMPTY };
    }
  };

  /** Операции выстраиваются в очередь: файл нельзя писать двумя потоками сразу. */
  const mutate = <T>(fn: (data: FileShape) => T | Promise<T>): Promise<T> => {
    const next = queue.then(async () => {
      const data = await read();
      const result = await fn(data);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, JSON.stringify(data, null, 2), "utf8");
      return result;
    });
    queue = next.catch(() => undefined);
    return next;
  };

  const prune = (data: FileShape) => {
    const now = Date.now();
    for (const [token, s] of Object.entries(data.sessions)) {
      if (s.expiresAt < now) delete data.sessions[token];
    }
    for (const [key, t] of Object.entries(data.tokens ?? {})) {
      if (t.expiresAt < now) delete data.tokens[key];
    }
  };

  return {
    kind: "file",
    durable: false,
    async check() {
      await mutate((data) => data);
    },
    async userIdByEmail(email) {
      return (await read()).emails[email] ?? null;
    },
    async getUser(id) {
      return (await read()).users[id] ?? null;
    },
    createUser: (user) =>
      mutate((data) => {
        if (data.emails[user.email]) throw new Error("EMAIL_TAKEN");
        data.emails[user.email] = user.id;
        data.users[user.id] = user;
      }),
    updateUser: (user) =>
      mutate((data) => {
        data.users[user.id] = user;
        data.emails[user.email] = user.id;
      }),
    putSession: (token, session) =>
      mutate((data) => {
        prune(data);
        data.sessions[token] = session;
      }),
    async getSession(token) {
      const s = (await read()).sessions[token];
      if (!s || s.expiresAt < Date.now()) return null;
      return s;
    },
    deleteSession: (token) =>
      mutate((data) => {
        delete data.sessions[token];
      }),
    putToken: (key, value, ttlSeconds) =>
      mutate((data) => {
        prune(data);
        data.tokens[key] = { value, expiresAt: Date.now() + Math.max(60, ttlSeconds) * 1000 };
      }),
    takeToken: (key) =>
      mutate((data) => {
        const entry = data.tokens[key];
        delete data.tokens[key];
        return entry && entry.expiresAt > Date.now() ? entry.value : null;
      }),
    async getProfile(userId) {
      return (await read()).profiles[userId] ?? null;
    },
    putProfile: (userId, json) =>
      mutate((data) => {
        data.profiles[userId] = json;
      }),
  };
}


// ------------------------------------------------------------------- выбор
/**
 * Upstash показывает ключи готовой строкой для .env, и её часто копируют целиком —
 * вместе с именем переменной и кавычками. Отрезаем и то, и другое.
 */
const clean = (raw: string): string =>
  raw
    .trim()
    .replace(/^[A-Za-z_][A-Za-z0-9_]*\s*=\s*/, "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();

/** Значение переменной и имя, под которым его нашли, — чтобы ошибка указывала на нужную строку. */
type Found = { name: string; value: string } | null;

function pick(...names: string[]): Found {
  for (const name of names) {
    const value = process.env[name];
    if (value && clean(value)) return { name, value: clean(value) };
  }
  return null;
}

type Config = { url: string; token: string; problem?: undefined } | { url?: undefined; token?: undefined; problem: string | null };

/**
 * Разбор настроек хранилища. problem — то, что человек может починить руками;
 * null означает, что хранилище просто не настраивали.
 */
function readConfig(): Config {
  const url = pick("AUTH_REDIS_URL", "UPSTASH_REDIS_REST_URL");
  const token = pick("AUTH_REDIS_TOKEN", "UPSTASH_REDIS_REST_TOKEN");

  if (!url && !token) return { problem: null };
  if (!url) return { problem: "токен задан, а адреса нет — добавьте AUTH_REDIS_URL" };
  if (!token) return { problem: "адрес задан, а токена нет — добавьте AUTH_REDIS_TOKEN" };
  if (/^rediss?:\/\//i.test(url.value)) {
    return {
      problem: `в ${url.name} попал адрес для TCP-подключения (redis://…). Нужен адрес из блока «REST API», он начинается с https://`,
    };
  }
  if (!/^https?:\/\//i.test(url.value)) {
    return { problem: `${url.name} должен начинаться с https://, а там «${url.value.slice(0, 40)}»` };
  }
  return { url: url.value.replace(/\/+$/, ""), token: token.value };
}

const onServerless = () => !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

/**
 * На Vercel и в Lambda весь диск смонтирован только для чтения, кроме /tmp:
 * запись в .data/ там не теряется со временем, а падает на первой же попытке.
 */
const filePath = () => process.env.AUTH_FILE || (onServerless() ? "/tmp/swiper-auth.json" : ".data/auth.json");

let cached: AuthStore | null = null;

export function authStore(): AuthStore {
  if (cached) return cached;
  const config = readConfig();
  cached = config.url ? redisStore(config.url, config.token) : fileStore(filePath());
  return cached;
}

/** Регистрация без надёжного хранилища — обещание, которое приложение не сдержит. */
export function storageWarning(): string | null {
  if (authStore().durable) return null;
  const { problem } = readConfig();
  if (problem) return `Хранилище настроено с ошибкой: ${problem}. Пока учётные записи пишутся в файл.`;
  return onServerless()
    ? "Учётные записи сейчас пишутся в файл, а на этом хостинге файловая система эфемерная: регистрации будут пропадать. Задайте AUTH_REDIS_URL и AUTH_REDIS_TOKEN."
    : null;
}

export type StorageReport = {
  kind: "redis" | "file";
  durable: boolean;
  reachable: boolean;
  detail: string;
};

/** Живая проверка хранилища: настройки могут быть на месте, а база — не отвечать. */
export async function diagnoseStorage(): Promise<StorageReport> {
  const store = authStore();
  const { problem } = readConfig();
  if (problem) return { kind: store.kind, durable: false, reachable: false, detail: problem };

  try {
    await store.check();
  } catch (e) {
    const cause = e instanceof Error ? e.message : "неизвестная ошибка";
    return {
      kind: store.kind,
      durable: store.durable,
      reachable: false,
      detail:
        store.kind === "file"
          ? `Файл ${filePath()} не пишется: ${cause}. Задайте AUTH_REDIS_URL и AUTH_REDIS_TOKEN.`
          : cause,
    };
  }

  if (store.durable) return { kind: "redis", durable: true, reachable: true, detail: "Запись и чтение работают." };
  return {
    kind: "file",
    durable: false,
    reachable: true,
    detail: onServerless()
      ? `Пишем в ${filePath()} на эфемерном диске — регистрации будут пропадать. Задайте AUTH_REDIS_URL и AUTH_REDIS_TOKEN.`
      : // На своём сервере файл лежит на постоянном диске и ничем не хуже базы,
        // пока приложение одно. Прежний текст про «локальный запуск» сбивал с
        // толку там, где всё как раз в порядке.
        `Пишем в файл ${filePath()}. Данные переживут перезапуск; отдельное хранилище понадобится, только если запустить приложение в несколько процессов.`,
  };
}
