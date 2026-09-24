import { NextResponse } from "next/server";
import { authStore, storageWarning } from "@/lib/auth/store";
import { clientKey, newUserId, tooManyAttempts, noteFailure } from "@/lib/auth/session";
import { emailProblem, hashPassword, normalizeEmail, passwordProblem } from "@/lib/auth/password";
import { appUrl, sendMail, verifyEmail } from "@/lib/auth/mail";
import { issueToken } from "@/lib/auth/tokens";

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

  /**
   * Сессию здесь НЕ открываем: почта должна быть подтверждена до входа. Вход
   * даёт сама ссылка из письма — так подтверждение нельзя пропустить, и не
   * приходится вводить пароль второй раз.
   */
  let mail: string | undefined;
  try {
    const link = `${await appUrl()}/verify?token=${await issueToken("verify", user.id)}`;
    const letter = verifyEmail(link);
    const sent = await sendMail(user.email, letter.subject, letter.html, letter.text);
    if (!sent.delivered) {
      console.error("Письмо с подтверждением не отправлено:", sent.reason);
      mail = sent.reason;
    }
  } catch (e) {
    console.error("Письмо с подтверждением не отправлено:", e);
    mail = e instanceof Error ? e.message : "почта недоступна";
  }

  // Учётную запись оставляем даже при упавшей почте: письмо можно выслать
  // заново, а потерять уже занятый адрес — значит не дать человеку
  // зарегистрироваться вовсе.
  return NextResponse.json({
    pending: true,
    email: user.email,
    warning: storageWarning(),
    mailProblem: mail,
  });
}
