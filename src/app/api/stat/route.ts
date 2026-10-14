import { NextRequest, NextResponse } from "next/server";
import { CLIENT_EVENTS, logEvents, type EventType } from "@/lib/stats/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Сколько событий принимаем за один заход: остальное отбрасываем молча. */
const MAX_BATCH = 60;

type Body = {
  device?: string;
  session?: string;
  events?: { type?: string; [key: string]: unknown }[];
};

/**
 * Приём событий с телефона.
 *
 * Адрес открыт — иначе он не работал бы, — поэтому здесь не доверяют ничему:
 * тип события должен быть из известного списка, пачка ограничена, поля
 * чистятся и обрезаются при записи. Подделать статистику всё равно можно, но
 * раздуть диск или подсунуть в журнал что-то кроме коротких строк — нет.
 *
 * Ответ всегда 204, даже если что-то не так: приложению с этого ответа нечего
 * делать, а лишний разговор на каждом свайпе ни к чему.
 */
export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const device = typeof body.device === "string" ? body.device : undefined;
  const session = typeof body.session === "string" ? body.session : undefined;
  const incoming = Array.isArray(body.events) ? body.events.slice(0, MAX_BATCH) : [];

  const events = incoming
    .filter((e) => typeof e?.type === "string" && CLIENT_EVENTS.has(e.type as EventType))
    .map(({ type, ...payload }) => ({
      type: type as EventType,
      payload: { ...payload, device, session },
    }));

  await logEvents(events);
  return new NextResponse(null, { status: 204 });
}
