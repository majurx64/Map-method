import { useState } from "react";
import { supabase } from "./lib/supabase";

export default function Auth({ onAuth, language = "ru" }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
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
        setMessage(error.message);
      } else {
        onAuth?.(data.user);
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { locale: language || navigator.language || "ru" },
        },
      });

      if (error) {
        setMessage(error.message);
      } else if (data.user) {
        if (data.session) onAuth?.(data.user);
        setMessage(
          "Аккаунт создан. Подтверди email по ссылке из письма, затем войди в аккаунт."
        );
      }
    }

    setLoading(false);
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">MM</div>

        <h1>{mode === "login" ? "Вход" : "Регистрация"}</h1>

        <p>
          {mode === "login"
            ? "Войди, чтобы продолжить работу с картами."
            : "Создай аккаунт, чтобы сохранять свои карты."}
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
