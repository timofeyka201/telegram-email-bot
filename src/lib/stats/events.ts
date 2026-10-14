import { appendFile, mkdir, readdir, readFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Журнал событий.
 *
 * Своё, а не сторонний счётчик: отправлять поведение людей наружу ради
 * графиков — плохой обмен, а всё, что нужно, укладывается в текстовый файл.
 * Строка на событие, файл на сутки: такой журнал можно читать глазами,
 * грепать, резать по дням и удалять по одному файлу.
 *
 * В событиях нет ни почты, ни адреса, ни браузера. Есть случайный
 * идентификатор устройства — он нужен ровно для одного: отличить «десять
 * человек по разу» от «один человек десять раз». У поисковых запросов и его
 * нет: что искали — знать полезно, кто искал — незачем.
 */

export type EventType =
  | "open"
  | "swipe"
  | "undo"
  | "reason"
  | "search"
  | "filter"
  | "quiz"
  | "onboard"
  | "save"
  | "share"
  | "view"
  | "wait"
  | "shop"
  | "order"
  | "feed";

export type StatEvent = {
  /** ISO-время записи: ставит сервер, часам телефона тут веры нет */
  at: string;
  type: EventType;
  /** случайный идентификатор устройства; у поисковых запросов его нет */
  device?: string;
  /** идентификатор сессии: от открытия приложения до ухода */
  session?: string;
  [key: string]: unknown;
};

/** События, которые приходят с телефона. Остальные ставит сервер сам. */
export const CLIENT_EVENTS = new Set<EventType>([
  "open",
  "swipe",
  "undo",
  "reason",
  "search",
  "filter",
  "quiz",
  "onboard",
  "save",
  "share",
  "view",
  "wait",
]);

/** У этих событий устройство не записывается. */
const ANONYMOUS = new Set<EventType>(["search"]);

/** Длина строкового поля в событии: всё, что длиннее, — обрезается. */
const MAX_TEXT = 120;

export function statsDir(): string {
  const configured = process.env.STATS_DIR?.trim();
  if (configured) return configured;
  const auth = process.env.AUTH_FILE?.trim();
  return auth ? join(dirname(auth), "events") : ".data/events";
}

export const dayOf = (at: Date | string): string =>
  (typeof at === "string" ? new Date(at) : at).toISOString().slice(0, 10);

/** Поля события: только примитивы, строки короткие, вложенности нет. */
function clean(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string") out[key] = value.slice(0, MAX_TEXT);
    else if (typeof value === "number" && Number.isFinite(value)) out[key] = Math.round(value * 1000) / 1000;
    else if (typeof value === "boolean") out[key] = value;
    else if (Array.isArray(value)) {
      out[key] = value
        .slice(0, 12)
        .filter((v) => typeof v === "string" || typeof v === "number")
        .map((v) => (typeof v === "string" ? v.slice(0, MAX_TEXT) : v));
    }
  }
  return out;
}

/**
 * Запись события. Никогда не бросает: статистика не та вещь, ради которой
 * можно уронить ленту.
 */
export async function logEvent(type: EventType, payload: Record<string, unknown> = {}): Promise<void> {
  const at = new Date();
  const { device, session, ...rest } = payload;
  const line: StatEvent = {
    at: at.toISOString(),
    type,
    ...(ANONYMOUS.has(type) ? {} : { device: typeof device === "string" ? device.slice(0, 64) : undefined }),
    session: typeof session === "string" ? session.slice(0, 64) : undefined,
    ...clean(rest),
  };
  for (const key of Object.keys(line)) if (line[key] === undefined) delete line[key];

  try {
    const dir = statsDir();
    await mkdir(dir, { recursive: true });
    await appendFile(join(dir, `${dayOf(at)}.jsonl`), `${JSON.stringify(line)}\n`);
  } catch (e) {
    console.error("Событие не записано:", e instanceof Error ? e.message : e);
  }
}

/** Пачкой — один поход на диск вместо двадцати. */
export async function logEvents(events: { type: EventType; payload: Record<string, unknown> }[]): Promise<void> {
  if (!events.length) return;
  const at = new Date();
  const lines = events.map(({ type, payload }) => {
    const { device, session, ...rest } = payload;
    const line: StatEvent = {
      at: at.toISOString(),
      type,
      ...(ANONYMOUS.has(type) ? {} : { device: typeof device === "string" ? device.slice(0, 64) : undefined }),
      session: typeof session === "string" ? session.slice(0, 64) : undefined,
      ...clean(rest),
    };
    for (const key of Object.keys(line)) if (line[key] === undefined) delete line[key];
    return JSON.stringify(line);
  });

  try {
    const dir = statsDir();
    await mkdir(dir, { recursive: true });
    await appendFile(join(dir, `${dayOf(at)}.jsonl`), `${lines.join("\n")}\n`);
  } catch (e) {
    console.error("События не записаны:", e instanceof Error ? e.message : e);
  }
}

/** Какие дни есть в журнале, от свежих к старым. */
export async function journalDays(): Promise<string[]> {
  try {
    const files = await readdir(statsDir());
    return files
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

/** События за последние `days` суток, от старых к новым. Битые строки пропускаем. */
export async function readEvents(days: number): Promise<StatEvent[]> {
  const wanted = (await journalDays()).slice(0, Math.max(1, days)).reverse();
  const out: StatEvent[] = [];
  for (const day of wanted) {
    let text = "";
    try {
      text = await readFile(join(statsDir(), `${day}.jsonl`), "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      if (!line) continue;
      try {
        const parsed = JSON.parse(line) as StatEvent;
        if (parsed && typeof parsed.type === "string" && typeof parsed.at === "string") out.push(parsed);
      } catch {
        // Оборванная строка бывает, если сервер упал посреди записи.
      }
    }
  }
  return out;
}

/** Удаление журналов старше `keep` суток. Возвращает, что удалено. */
export async function pruneEvents(keep: number): Promise<string[]> {
  const edge = new Date(Date.now() - keep * 86_400_000).toISOString().slice(0, 10);
  const gone: string[] = [];
  for (const day of await journalDays()) {
    if (day >= edge) continue;
    try {
      await unlink(join(statsDir(), `${day}.jsonl`));
      gone.push(day);
    } catch {
      // Уже удалён — и хорошо.
    }
  }
  return gone;
}
