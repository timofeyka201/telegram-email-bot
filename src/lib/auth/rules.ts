/**
 * Правила к почте и паролю. Отдельным модулем и без зависимостей от Node:
 * их применяет и сервер, и форма в браузере, а держать два свода правил —
 * верный способ получить расхождение между подсказкой и отказом.
 */

export const MIN_PASSWORD = 8;

/** Требования к паролю одной строкой — для подписи под полем ввода. */
export const PASSWORD_RULE = "от 8 символов, латиница и цифра";

/**
 * Что именно не так с паролем — чтобы не отвечать «неверный формат».
 *
 * Кириллицу запрещаем не из вредности: такой пароль невозможно ввести там, где
 * раскладки нет — на чужом устройстве, в экранной клавиатуре телевизора, — и
 * человек остаётся без доступа к собственному аккаунту.
 */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD) return `Пароль короче ${MIN_PASSWORD} символов`;
  if (password.length > 200) return "Пароль слишком длинный";
  if (/\s/.test(password)) return "Пароль не должен содержать пробелов";
  // Печатные символы ASCII: латиница, цифры и знаки препинания.
  if (!/^[\x21-\x7e]+$/.test(password)) return "Только латинские буквы, цифры и знаки препинания";
  if (!/[A-Za-z]/.test(password)) return "Добавьте хотя бы одну латинскую букву";
  if (!/[0-9]/.test(password)) return "Добавьте хотя бы одну цифру";
  return null;
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function emailProblem(email: string): string | null {
  if (!email) return "Укажите почту";
  if (email.length > 254) return "Адрес слишком длинный";
  // Проверка намеренно мягкая: строгая регулярка отсекает валидные адреса.
  if (!/^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(email)) return "Похоже, в адресе опечатка";
  return null;
}
