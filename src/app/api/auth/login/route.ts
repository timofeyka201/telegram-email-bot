import { NextResponse } from "next/server";
import { authStore } from "@/lib/auth/store";
import { clearFailures, clientKey, noteFailure, startSession, toPublic, tooManyAttempts } from "@/lib/auth/session";
import { normalizeEmail, verifyPassword } from "@/lib/auth/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const key = clientKey(req);
  if (tooManyAttempts(key)) {
    return NextResponse.json({ error: "Слишком много попыток. Подождите несколько минут." }, { status: 429 });
  }

  let body: { email?: string; password?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const email = normalizeEmail(String(body.email ?? ""));
  const password = String(body.password ?? "");

  const store = authStore();
  const id = email ? await store.userIdByEmail(email) : null;
  const user = id ? await store.getUser(id) : null;

  // Один и тот же ответ на «нет такой почты» и «неверный пароль»:
  // иначе форма превращается в проверку, кто здесь зарегистрирован.
  const ok = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !ok) {
    noteFailure(key);
    return NextResponse.json({ error: "Неверная почта или пароль" }, { status: 401 });
  }

  clearFailures(key);
  await startSession(user.id);
  return NextResponse.json({ user: toPublic(user) });
}
