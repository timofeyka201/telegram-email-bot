import { NextResponse } from "next/server";
import { authStore, storageWarning } from "@/lib/auth/store";
import { clientKey, newUserId, startSession, toPublic, tooManyAttempts, noteFailure } from "@/lib/auth/session";
import { emailProblem, hashPassword, normalizeEmail, passwordProblem } from "@/lib/auth/password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const key = clientKey(req);
  if (tooManyAttempts(key)) {
    return NextResponse.json({ error: "Слишком много попыток. Подождите несколько минут." }, { status: 429 });
  }

  let body: { email?: string; password?: string; name?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const email = normalizeEmail(String(body.email ?? ""));
  const password = String(body.password ?? "");
  const name = String(body.name ?? "").trim().slice(0, 60) || undefined;

  const problem = emailProblem(email) ?? passwordProblem(password);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const store = authStore();
  try {
    if (await store.userIdByEmail(email)) {
      return NextResponse.json({ error: "Такая почта уже зарегистрирована" }, { status: 409 });
    }
  } catch (e) {
    console.error("Регистрация: хранилище недоступно —", e);
    return NextResponse.json(
      { error: "Не удалось связаться с хранилищем учётных записей." },
      { status: 503 },
    );
  }

  const user = {
    id: newUserId(),
    email,
    name,
    passwordHash: await hashPassword(password),
    createdAt: new Date().toISOString(),
  };

  try {
    await store.createUser(user);
  } catch (e) {
    // Гонка двух одновременных регистраций на один адрес.
    if (e instanceof Error && e.message === "EMAIL_TAKEN") {
      return NextResponse.json({ error: "Такая почта уже зарегистрирована" }, { status: 409 });
    }
    noteFailure(key);
    // Без этой строки причина теряется, и в логах остаётся только «503».
    console.error("Регистрация: хранилище недоступно —", e);
    return NextResponse.json(
      { error: "Не удалось сохранить учётную запись: хранилище недоступно." },
      { status: 503 },
    );
  }

  await startSession(user.id);
  return NextResponse.json({ user: toPublic(user), warning: storageWarning() });
}
