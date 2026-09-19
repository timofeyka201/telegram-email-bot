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
/**
 * Хранилище для продакшена. Совместимо с Upstash и любым Redis с REST-шлюзом:
 * команды отправляются массивом, ответ приходит в поле result.
 */
function redisStore(url: string, token: string): AuthStore {
  const call = async <T>(command: (string | number)[]): Promise<T | null> => {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(command),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Хранилище ответило ${res.status}`);
    const json = (await res.json()) as { result?: T; error?: string };
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
let cached: AuthStore | null = null;

export function authStore(): AuthStore {
  if (cached) return cached;
  const url = process.env.AUTH_REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.AUTH_REDIS_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  cached = url && token ? redisStore(url, token) : fileStore(process.env.AUTH_FILE || ".data/auth.json");
  return cached;
}

/** Регистрация без надёжного хранилища — обещание, которое приложение не сдержит. */
export function storageWarning(): string | null {
  const store = authStore();
  if (store.durable) return null;
  const onServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  return onServerless
    ? "Учётные записи сейчас пишутся в файл, а на этом хостинге файловая система эфемерная: регистрации будут пропадать. Задайте AUTH_REDIS_URL и AUTH_REDIS_TOKEN."
    : null;
}
