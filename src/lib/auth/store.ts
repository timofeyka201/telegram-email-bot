import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type UserRecord = {
  id: string;
  email: string;
  name?: string;
  passwordHash: string;
  createdAt: string;
};

export type SessionRecord = { userId: string; expiresAt: number };

export interface AuthStore {
  readonly kind: "redis" | "file";
  readonly durable: boolean;
  /** Проверка связи: пишет, читает и стирает пробный ключ. Бросает с внятным текстом. */
  check(): Promise<void>;
  userIdByEmail(email: string): Promise<string | null>;
  getUser(id: string): Promise<UserRecord | null>;
  createUser(user: UserRecord): Promise<void>;
  putSession(token: string, session: SessionRecord): Promise<void>;
  getSession(token: string): Promise<SessionRecord | null>;
  deleteSession(token: string): Promise<void>;
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
    async putSession(token, session) {
      const ttl = Math.max(60, Math.floor((session.expiresAt - Date.now()) / 1000));
      await call(["SET", `session:${token}`, JSON.stringify(session), "EX", ttl]);
    },
    getSession: (token) => getJson<SessionRecord>(`session:${token}`),
    async deleteSession(token) {
      await call(["DEL", `session:${token}`]);
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
};

const EMPTY: FileShape = { users: {}, emails: {}, sessions: {}, profiles: {} };

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
/** Переменные окружения часто приезжают с кавычками или переводом строки внутри. */
const env = (name: string): string | undefined =>
  process.env[name]?.trim().replace(/^["']|["']$/g, "").trim() || undefined;

type Config = { url: string; token: string; problem?: undefined } | { url?: undefined; token?: undefined; problem: string | null };

/**
 * Разбор настроек хранилища. problem — то, что человек может починить руками;
 * null означает, что хранилище просто не настраивали.
 */
function readConfig(): Config {
  const url = env("AUTH_REDIS_URL") ?? env("UPSTASH_REDIS_REST_URL");
  const token = env("AUTH_REDIS_TOKEN") ?? env("UPSTASH_REDIS_REST_TOKEN");

  if (!url && !token) return { problem: null };
  if (!url) return { problem: "токен задан, а адреса нет — добавьте AUTH_REDIS_URL" };
  if (!token) return { problem: "адрес задан, а токена нет — добавьте AUTH_REDIS_TOKEN" };
  if (/^rediss?:\/\//i.test(url)) {
    return {
      problem:
        "в AUTH_REDIS_URL попал адрес для TCP-подключения (redis://…). Нужен адрес из блока «REST API», он начинается с https://",
    };
  }
  if (!/^https?:\/\//i.test(url)) {
    return { problem: `AUTH_REDIS_URL должен начинаться с https://, а там «${url.slice(0, 40)}»` };
  }
  return { url: url.replace(/\/+$/, ""), token };
}

let cached: AuthStore | null = null;

export function authStore(): AuthStore {
  if (cached) return cached;
  const config = readConfig();
  cached = config.url
    ? redisStore(config.url, config.token)
    : fileStore(process.env.AUTH_FILE || ".data/auth.json");
  return cached;
}

const onServerless = () => !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

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
    return {
      kind: store.kind,
      durable: store.durable,
      reachable: false,
      detail: e instanceof Error ? e.message : "неизвестная ошибка",
    };
  }

  if (store.durable) return { kind: "redis", durable: true, reachable: true, detail: "Запись и чтение работают." };
  return {
    kind: "file",
    durable: false,
    reachable: true,
    detail: onServerless()
      ? "Пишем в файл на эфемерном диске — регистрации будут пропадать. Задайте AUTH_REDIS_URL и AUTH_REDIS_TOKEN."
      : "Пишем в файл .data/auth.json. Для локального запуска это нормально.",
  };
}
