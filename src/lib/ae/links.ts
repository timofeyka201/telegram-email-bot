import { mkdir, readFile, rename, writeFile, appendFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { AeError, aeConfigured, aeFetch, aeUserId } from "./client";

/**
 * Партнёрские ссылки AliExpress.
 *
 * Платформа превращает обычную ссылку на товар в «креатив» — ссылку с меткой,
 * по которой засчитывается комиссия, и с токеном erid для маркировки рекламы.
 * Создавать креативы на весь каталог бессмысленно: это десятки тысяч запросов
 * ради товаров, которые никто не откроет. Поэтому ссылка создаётся в момент
 * первого перехода и кладётся в кэш навсегда — товар на AliExpress живёт по
 * одному адресу, и метка к нему не меняется.
 */

export type Creative = { target: string; erid?: string; createdAt: number };

function storePath(name: string): string {
  const auth = process.env.AUTH_FILE?.trim();
  const dir = auth ? dirname(auth) : ".data";
  return join(dir, name);
}

const CACHE = () => storePath("ae-creatives.json");
/** Журнал переходов: та самая метрика «переходы в магазин». */
const CLICKS = () => storePath("ae-clicks.log");

let memo: Record<string, Creative> | null = null;
/** Один запрос на товар: десять одновременных переходов не должны создавать
 *  десять креативов. */
const inFlight = new Map<string, Promise<Creative | null>>();

async function readCache(): Promise<Record<string, Creative>> {
  if (memo) return memo;
  try {
    memo = JSON.parse(await readFile(CACHE(), "utf8")) as Record<string, Creative>;
  } catch {
    memo = {};
  }
  return memo;
}

async function saveCache(): Promise<void> {
  if (!memo) return;
  const path = CACHE();
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(memo));
  await rename(tmp, path);
}

/** Запись о переходе. Пишем строкой в файл: разбирать её будем потом, а
 *  потерять переход из-за недоступной базы нельзя. */
export async function noteClick(productId: string, outcome: "affiliate" | "direct"): Promise<void> {
  const line = JSON.stringify({ at: new Date().toISOString(), productId, outcome });
  try {
    const path = CLICKS();
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, line + "\n");
  } catch (e) {
    console.error("Переход не записан:", e instanceof Error ? e.message : e);
  }
}

/**
 * Ответ площадки на создание креатива. Фиды приходят в обёртке JSON:API
 * (data.attributes), и здесь может быть так же, поэтому ссылку ищем во всех
 * местах, где она может лежать, а не только там, где обещано в документации.
 */
function findLink(body: unknown): { target?: string; erid?: string } {
  const paths = [
    ["targetLink"],
    ["data", "targetLink"],
    ["data", "attributes", "targetLink"],
    ["creative", "targetLink"],
    ["creatives", "0", "targetLink"],
    ["creatives", "0", "attributes", "targetLink"],
  ];
  const at = (path: string[]): unknown =>
    path.reduce<unknown>((value, key) => (value as Record<string, unknown>)?.[key], body);

  const target = paths.map(at).find((v) => typeof v === "string" && v);
  const erid = [["eridToken"], ["data", "eridToken"], ["data", "attributes", "eridToken"]]
    .map(at)
    .find((v) => typeof v === "string" && v);
  return { target: target as string | undefined, erid: erid as string | undefined };
}

let placementMemo: string | null = null;

/**
 * Площадка, к которой привязываются креативы. Её можно задать настройкой, но
 * искать идентификатор в кабинете не обязательно: платформа перечисляет свои
 * активные площадки сама, и если она одна — выбирать не из чего.
 */
async function placement(userId: string): Promise<string | null> {
  const configured = process.env.AE_PLACEMENT_ID?.trim();
  if (configured) return configured;
  if (placementMemo) return placementMemo;
  try {
    const res = await aeFetch<{
      placements?: { id?: string | number }[];
      data?: { id?: string | number }[];
    }>(`/api/v1/users/${userId}/placements/active`);
    const first = (res.placements ?? res.data ?? [])[0]?.id;
    if (first === undefined) {
      console.error("У партнёра нет активных площадок — партнёрские ссылки создавать не на что.");
      return null;
    }
    return (placementMemo = String(first));
  } catch (e) {
    console.error("Список площадок не получен:", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Партнёрская ссылка на товар. Возвращает null, если платформа не настроена
 * или отказала: в этом случае человека отправляем на обычную ссылку товара —
 * потерять комиссию неприятно, не пустить человека в магазин недопустимо.
 */
export async function affiliateLink(productId: string, url: string, title: string): Promise<Creative | null> {
  const cache = await readCache();
  const hit = cache[productId];
  if (hit) return hit;

  if (!aeConfigured()) return null;
  const userId = await aeUserId();
  const placementId = userId ? await placement(userId) : null;
  if (!userId || !placementId) return null;

  const pending = inFlight.get(productId);
  if (pending) return pending;

  const task = (async () => {
    try {
      const res = await aeFetch<unknown>(`/api/v1/users/${userId}/creative`, {
        method: "POST",
        body: {
          link: url,
          // Название попадает и в кабинет, и в данные для ОРД: пусть будет
          // человеческим, а не «товар №12345».
          title: title.slice(0, 120) || "Товар",
          placementId: Number(placementId),
          ordInfo: { description: title.slice(0, 200) || "Товар" },
          creationConditions: { createLinks: true, createArticles: false },
        },
      });
      const { target, erid } = findLink(res);
      if (!target) {
        // Креатив, похоже, создан, но ссылку мы в ответе не нашли. Показываем
        // ответ целиком: иначе каждый переход будет создавать креатив заново,
        // а человек всё равно уйдёт по обычной ссылке.
        console.error("В ответе площадки нет targetLink:", JSON.stringify(res).slice(0, 600));
        return null;
      }
      const creative: Creative = { target, erid, createdAt: Date.now() };
      (await readCache())[productId] = creative;
      await saveCache();
      return creative;
    } catch (e) {
      console.error("Партнёрская ссылка не создана:", e instanceof Error ? e.message : e);
      // Текст отказа площадки — единственное, по чему видно, какое поле ей не
      // понравилось.
      if (e instanceof AeError && e.body) console.error("  ответ площадки:", e.body);
      return null;
    } finally {
      inFlight.delete(productId);
    }
  })();

  inFlight.set(productId, task);
  return task;
}
