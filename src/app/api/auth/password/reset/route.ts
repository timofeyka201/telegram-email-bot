import { NextResponse } from "next/server";
import { authStore } from "@/lib/auth/store";
import { clearFailures, clientKey, startSession, toPublic } from "@/lib/auth/session";
import { hashPassword, passwordProblem } from "@/lib/auth/password";
import { consumeToken } from "@/lib/auth/tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { token?: string; password?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const password = String(body.password ?? "");
  const problem = passwordProblem(password);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  try {
    const userId = await consumeToken("reset", String(body.token ?? ""));
    if (!userId) {
      return NextResponse.json({ error: "Ссылка устарела или уже использована" }, { status: 400 });
    }
    const store = authStore();
    const user = await store.getUser(userId);
    if (!user) return NextResponse.json({ error: "Учётная запись не найдена" }, { status: 404 });

    const updated = {
      ...user,
      passwordHash: await hashPassword(password),
      // Письмо дошло до владельца адреса — это и есть подтверждение почты.
      emailVerified: true,
      // Этой отметкой гасятся все прежние входы: доступ мог быть у того,
      // из-за кого пароль и меняют.
      passwordChangedAt: Date.now(),
    };
    await store.updateUser(updated);
    await startSession(user.id);
    clearFailures(clientKey(req));

    return NextResponse.json({ user: toPublic(updated) });
  } catch (e) {
    console.error("Смена пароля не удалась:", e);
    return NextResponse.json({ error: "Хранилище недоступно, попробуйте позже" }, { status: 503 });
  }
}
