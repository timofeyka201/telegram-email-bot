import { NextResponse } from "next/server";
import { authStore } from "@/lib/auth/store";
import { consumeToken } from "@/lib/auth/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Подтверждение приходит методом POST, а не переходом по ссылке: антивирусы и
 * почтовые клиенты открывают ссылки сами, и одноразовый токен сгорал бы
 * раньше, чем человек нажмёт кнопку.
 */
export async function POST(req: Request) {
  let body: { token?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  try {
    const userId = await consumeToken("verify", String(body.token ?? ""));
    if (!userId) {
      return NextResponse.json({ error: "Ссылка устарела или уже использована" }, { status: 400 });
    }
    const store = authStore();
    const user = await store.getUser(userId);
    if (!user) return NextResponse.json({ error: "Учётная запись не найдена" }, { status: 404 });

    if (!user.emailVerified) await store.updateUser({ ...user, emailVerified: true });
    return NextResponse.json({ ok: true, email: user.email });
  } catch (e) {
    console.error("Подтверждение почты: хранилище недоступно —", e);
    return NextResponse.json({ error: "Хранилище недоступно, попробуйте позже" }, { status: 503 });
  }
}
