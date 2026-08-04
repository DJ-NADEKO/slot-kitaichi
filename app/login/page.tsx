"use client";

import { FormEvent, useState } from "react";
import { KeyRound, LockKeyhole } from "lucide-react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(json.message || "ログインに失敗しました。");

      const params = new URLSearchParams(window.location.search);
      const next = params.get("next");
      window.location.href = next?.startsWith("/") ? next : "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : "ログインに失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="login-icon"><LockKeyhole size={28} /></div>
        <p className="eyebrow">PRIVATE ACCESS</p>
        <h1>機種情報クイック参照</h1>
        <p className="login-description">個人用ツールです。パスワードを入力してください。</p>

        <form className="login-form" onSubmit={login}>
          <label htmlFor="password">パスワード</label>
          <div className="password-field">
            <KeyRound size={19} aria-hidden="true" />
            <input
              id="password"
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoFocus
              required
            />
          </div>
          {error && <p className="login-error">{error}</p>}
          <button className="button login-button" disabled={loading} type="submit">
            {loading ? "確認中…" : "ログイン"}
          </button>
        </form>
      </section>
    </main>
  );
}
