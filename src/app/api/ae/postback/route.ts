import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Постбэк AE Platform: площадка дёргает этот адрес, когда по нашей ссылке
 * сделали, завершили или отменили заказ. Это единственный способ узнать, что
 * переход превратился в покупку, — и единственный источник выручки в цифрах.
 *
 * Шаблон постбэка задаётся в кабинете: Инструменты → Постбэки. Например
 *   https://swipers.ru/api/ae/postback?key=СЕКРЕТ&order=%{order_number}%&status=%{order_status}%
 *   &product=%{product_id}%&price=%{price}%&commission=%{commission_user}%&click=%{aep_click_id}%
 *
 * Адрес открыт в интернет, поэтому запрос подтверждается секретом из
 * переменной окружения: без него кто угодно мог бы записать нам выдуманные
 * заказы и испортить статистику.
 */

function logPath(): string {
  const auth = process.env.AUTH_FILE?.trim();
  return join(auth ? dirname(auth) : ".data", "ae-orders.log");
}

/** Поля, которые имеет смысл сохранять. Остальное площадка может слать свободно. */
const FIELDS = [
  "order",
  "order_number",
  "order_id",
  "status",
  "order_status",
  "product",
  "product_id",
  "product_title",
  "price",
  "revenue",
  "commission",
  "commission_user",
  "currency",
  "click",
  "aep_click_id",
  "user_sub_id",
  "country_code",
  "order_type",
  "platform",
  "is_new",
];

async function record(url: URL): Promise<NextResponse> {
  const secret = process.env.AE_POSTBACK_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "Постбэк не настроен" }, { status: 503 });
  if (url.searchParams.get("key") !== secret) {
    // Молча 404, а не 403: отвечать «секрет неверный» — значит подсказывать,
    // что адрес вообще существует.
    return new NextResponse("Нет такой страницы", { status: 404 });
  }

  const row: Record<string, string> = { at: new Date().toISOString() };
  for (const field of FIELDS) {
    const value = url.searchParams.get(field);
    // Значения приходят из внешнего мира: длину режем, чтобы журнал не раздуло.
    if (value) row[field] = value.slice(0, 200);
  }

  try {
    const path = logPath();
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, JSON.stringify(row) + "\n");
  } catch (e) {
    console.error("Постбэк не записан:", e instanceof Error ? e.message : e);
    // Площадке отвечаем успехом: повторять ей нечего, а разбираться с диском
    // будем сами по логу службы.
  }
  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  return record(new URL(req.url));
}

/** Некоторые площадки шлют постбэк POST-ом — принимаем оба способа. */
export async function POST(req: Request) {
  return record(new URL(req.url));
}
