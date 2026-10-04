import { useState } from "react";
import { supabase } from "./lib/supabase";
  import { INVITE_KEY } from "./lib/collaboration";

const AUTH_REDIRECT_URL = import.meta.env.PROD
  ? "https://www.mapmethod.ru/"
  : window.location.origin;

  function authRedirectUrl() {
    const url = new URL(AUTH_REDIRECT_URL);
    const invitation = localStorage.getItem(INVITE_KEY);
    if (invitation) url.searchParams.set('collaborate', invitation);
    return url.href;
  }

function authErrorMessage(error) {
  const message = (error?.message || '').toLowerCase();
  if (error?.code === 'invalid_credentials' || message.includes('invalid login credentials')) return 'Неверная почта или пароль.';
  if (error?.code === 'email_not_confirmed' || message.includes('email not confirmed')) return 'Подтвердите почту по ссылке из письма.';
  if (message.includes('already registered') || error?.code === 'user_already_exists') return 'Аккаунт с этой почтой уже существует.';
  if (error?.status === 429 || message.includes('rate limit') || message.includes('too many')) return 'Слишком много попыток. Подождите немного и попробуйте снова.';
  if (message.includes('password') && (message.includes('weak') || message.includes('at least'))) return 'Пароль слишком простой. Используйте не менее 6 символов.';
  if (error?.status === 402 || error?.status >= 500) return 'Сервис временно недоступен. Попробуйте позже.';
  return 'Не удалось выполнить запрос. Проверьте подключение и попробуйте ещё раз.';
}

export default function Auth({ onAuth, language = "ru" }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();

    setLoading(true);
    setMessage("");

    if (mode === "login") {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setMessage(authErrorMessage(error));
      } else {
        onAuth?.(data.user);
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: authRedirectUrl(),
          data: { locale: language || navigator.language || "ru" },
        },
      });

      if (error) {
        setMessage(authErrorMessage(error));
      } else if (data.user) {
        if (data.session) onAuth?.(data.user);
        setMessage(
          "Подтвердите email по ссылке из письма, затем войдите в аккаунт."
        );
      }
    }

    setLoading(false);
  }

  async function resendConfirmation() {
    if (!email.trim()) {
      setMessage("Введите email, на который нужно повторно отправить письмо.");
      return;
    }
    setResending(true);
    setMessage("");
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: authRedirectUrl() },
    });
    setMessage(error ? authErrorMessage(error) : "Письмо с подтверждением отправлено повторно. Проверьте входящие и папку «Спам».");
    setResending(false);
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <img className="auth-logo" src="/mm-logo.png" alt="Map Method" />

        <h1>{mode === "login" ? "Вход" : "Регистрация"}</h1>

        <p>
          {mode === "login"
            ? "Войдите, чтобы продолжить работу с картами."
            : "Создайте аккаунт, чтобы сохранять свои карты."}
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <div className="password-field">
            <input
              type={isPasswordVisible ? "text" : "password"}
              placeholder="Пароль"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={6}
            />
            <button type="button" className="password-visibility" onClick={() => setIsPasswordVisible((visible) => !visible)} aria-label={isPasswordVisible ? "Скрыть пароль" : "Показать пароль"}>
              {isPasswordVisible ? "Скрыть" : "Показать"}
            </button>
          </div>

          <button type="submit" disabled={loading}>
            {loading
              ? "Загрузка..."
              : mode === "login"
                ? "Войти"
                : "Создать аккаунт"}
          </button>
        </form>

        {message && <div className="auth-message">{message}</div>}

        {mode === "register" && (
          <button type="button" className="auth-resend" onClick={resendConfirmation} disabled={loading || resending}>
            {resending ? "Отправляем письмо…" : "Отправить письмо подтверждения ещё раз"}
          </button>
        )}

        <button
          type="button"
          className="auth-switch"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setMessage("");
          }}
        >
          {mode === "login"
            ? "Нет аккаунта? Зарегистрироваться"
            : "Уже есть аккаунт? Войти"}
        </button>
      </div>
    </div>
  );
}
