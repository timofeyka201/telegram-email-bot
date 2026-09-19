import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { authStore } from "@/lib/auth/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Больше мегабайта личных списков — уже не витрина, а свалка. */
const MAX_BYTES = 1_000_000;

/**
 * Личные данные пользователя: избранное, вишлист, корзина, вкусы, размеры.
 * Ради этого регистрация и нужна — иначе всё осталось бы в одном браузере.
 * Разрешение конфликтов простое: побеждает более свежая запись целиком.
 */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Нужен вход" }, { status: 401 });

  const raw = await authStore().getProfile(user.id);
  return NextResponse.json({ profile: raw ? JSON.parse(raw) : null }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Нужен вход" }, { status: 401 });

  let body: { profile?: unknown; updatedAt?: number };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  if (!body.profile || typeof body.profile !== "object") {
    return NextResponse.json({ error: "Пустой профиль" }, { status: 400 });
  }

  const payload = JSON.stringify({ ...body.profile, updatedAt: body.updatedAt ?? Date.now() });
  if (payload.length > MAX_BYTES) {
    return NextResponse.json({ error: "Слишком много данных" }, { status: 413 });
  }

  await authStore().putProfile(user.id, payload);
  return NextResponse.json({ ok: true });
}
