import { timingSafeEqual } from "node:crypto";
import { currentUser } from "../auth/session";

/**
 * Кто может смотреть статистику.
 *
 * Два пути: вход владельца (почта из `METRICS_EMAILS`) — для страницы в
 * приложении, и ключ `METRICS_KEY` — для консольной команды, у которой куки
 * нет. Если не настроено ни то ни другое, страница не притворяется
 * несуществующей, а честно говорит, что добавить в окружение: молчаливая
 * «404» на собственном сервере — это полчаса гадания.
 */

export type Access = "ok" | "denied" | "unset";

const emails = () =>
  (process.env.METRICS_EMAILS ?? "")
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

/** Сравнение ключей за одинаковое время: иначе его можно подобрать по задержке. */
function sameKey(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function metricsAccess(key?: string | null): Promise<Access> {
  const secret = process.env.METRICS_KEY?.trim();
  if (secret && key && sameKey(secret, key)) return "ok";

  const allowed = emails();
  if (!allowed.length && !secret) return "unset";
  if (!allowed.length) return "denied";

  const user = await currentUser();
  if (!user) return "denied";
  return allowed.includes(user.email.toLowerCase()) ? "ok" : "denied";
}
