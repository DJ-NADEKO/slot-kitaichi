"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  Clock3,
  ExternalLink,
  Heart,
  History,
  LogOut,
  Search,
  Sparkles,
  Star,
  TriangleAlert,
} from "lucide-react";

type SourceName = "DMMぱちタウン" | "ハイエナくん";

type QuickFact = {
  label: string;
  value: string;
  games?: number;
};

type SourceResult = {
  source: SourceName;
  title: string;
  url: string;
  heading: string;
  lines?: string[];
  contentHtml?: string;
  quickFacts?: QuickFact[];
};

type ApiResponse = {
  query: string;
  results: SourceResult[];
  errors: string[];
  fetchedAt: string;
};

type StoredMachine = {
  name: string;
  searchedAt: string;
};

const RECENT_KEY = "slot-reference-recent-v1";
const FAVORITES_KEY = "slot-reference-favorites-v1";
const sources: SourceName[] = ["DMMぱちタウン", "ハイエナくん"];

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function sourceClass(source: SourceName) {
  return source === "DMMぱちタウン" ? "source-dmm" : "source-haiena";
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [currentGames, setCurrentGames] = useState("");
  const [recent, setRecent] = useState<StoredMachine[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [openSources, setOpenSources] = useState<Record<SourceName, boolean>>({
    "DMMぱちタウン": true,
    "ハイエナくん": true,
  });

  useEffect(() => {
    setRecent(readStorage<StoredMachine[]>(RECENT_KEY, []));
    setFavorites(readStorage<string[]>(FAVORITES_KEY, []));
  }, []);

  const suggestionItems = useMemo(() => {
    const value = query.trim().toLowerCase();
    const names = [...favorites, ...recent.map((item) => item.name)].filter(
      (item, index, all) => all.indexOf(item) === index,
    );
    if (!value) return names.slice(0, 6);
    return names.filter((name) => name.toLowerCase().includes(value) && name !== query).slice(0, 6);
  }, [favorites, query, recent]);

  function rememberSearch(name: string) {
    const next = [
      { name, searchedAt: new Date().toISOString() },
      ...recent.filter((item) => item.name !== name),
    ].slice(0, 8);
    setRecent(next);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  }

  async function runSearch(value: string) {
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      setError("機種名を2文字以上入力してください。");
      return;
    }
    setQuery(trimmed);
    setLoading(true);
    setError("");
    setData(null);
    setCurrentGames("");
    try {
      const response = await fetch(`/api/reference?q=${encodeURIComponent(trimmed)}`, { cache: "no-store" });
      const json = (await response.json()) as ApiResponse & { message?: string };
      if (!response.ok) throw new Error(json.message || json.errors?.[0] || "検索に失敗しました。");
      setData(json);
      rememberSearch(trimmed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "検索に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runSearch(query);
  }

  function toggleFavorite(name: string) {
    const next = favorites.includes(name)
      ? favorites.filter((item) => item !== name)
      : [name, ...favorites].slice(0, 12);
    setFavorites(next);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const numericGames = Number(currentGames);
  const hasCurrentGames = currentGames !== "" && Number.isFinite(numericGames) && numericGames >= 0;

  return (
    <main className="app-shell">
      <div className="floating-decoration deco-one" aria-hidden="true">✦</div>
      <div className="floating-decoration deco-two" aria-hidden="true">♡</div>

      <header className="app-header">
        <div>
          <p className="eyebrow"><Sparkles size={13} /> SLOT QUICK CHECK</p>
          <h1>狙い目、さくっと確認。</h1>
          <p className="hero-copy">2サイトの要点を、スマホで見やすくひとまとめ。</p>
        </div>
        <button className="icon-text-button" type="button" onClick={logout}>
          <LogOut size={15} /> ログアウト
        </button>
      </header>

      <section className="search-card">
        <form className="main-search" onSubmit={search}>
          <Search size={22} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="機種名を入力"
            autoFocus
            aria-label="機種名"
          />
          <button className="primary-button" disabled={loading} type="submit">
            {loading ? "検索中…" : "検索"}
          </button>
        </form>

        {suggestionItems.length > 0 && (
          <div className="suggestion-row" aria-label="検索候補">
            {suggestionItems.map((item) => (
              <button key={item} type="button" onClick={() => runSearch(item)}>{item}</button>
            ))}
          </div>
        )}
      </section>

      {(favorites.length > 0 || recent.length > 0) && (
        <section className="shortcut-grid">
          {favorites.length > 0 && (
            <div className="shortcut-card">
              <div className="shortcut-title"><Star size={16} /> お気に入り</div>
              <div className="chip-list">
                {favorites.map((name) => <button key={name} onClick={() => runSearch(name)}>{name}</button>)}
              </div>
            </div>
          )}
          {recent.length > 0 && (
            <div className="shortcut-card">
              <div className="shortcut-title"><History size={16} /> 最近の検索</div>
              <div className="chip-list">
                {recent.slice(0, 5).map((item) => <button key={item.name} onClick={() => runSearch(item.name)}>{item.name}</button>)}
              </div>
            </div>
          )}
        </section>
      )}

      {error && <div className="notice error-notice"><TriangleAlert size={19} />{error}</div>}

      {data && (
        <>
          <section className="result-toolbar">
            <div>
              <p className="result-kicker">検索結果</p>
              <div className="result-title-row">
                <h2>{data.query}</h2>
                <button
                  className={`favorite-button ${favorites.includes(data.query) ? "active" : ""}`}
                  type="button"
                  onClick={() => toggleFavorite(data.query)}
                  aria-label="お気に入り切り替え"
                >
                  <Heart size={18} fill={favorites.includes(data.query) ? "currentColor" : "none"} />
                </button>
              </div>
            </div>
            <label className="games-input-card">
              <span><Clock3 size={16} /> 現在G数</span>
              <div><input inputMode="numeric" pattern="[0-9]*" value={currentGames} onChange={(event) => setCurrentGames(event.target.value.replace(/\D/g, ""))} placeholder="例 482" /><b>G</b></div>
            </label>
          </section>

          {data.errors.length > 0 && (
            <div className="notice warning-notice">
              <TriangleAlert size={19} />
              <div>{data.errors.map((item) => <p key={item}>{item}</p>)}</div>
            </div>
          )}

          <section className="comparison-grid">
            {sources.map((source) => {
              const result = data.results.find((item) => item.source === source);
              const facts = result?.quickFacts ?? [];
              const targetFacts = facts.filter((fact) => typeof fact.games === "number");
              const nearest = targetFacts.length > 0
                ? targetFacts.reduce((best, item) => Math.abs((item.games ?? 0) - numericGames) < Math.abs((best.games ?? 0) - numericGames) ? item : best)
                : null;
              const difference = hasCurrentGames && nearest?.games !== undefined ? numericGames - nearest.games : null;

              return (
                <article className={`result-card ${sourceClass(source)}`} key={source}>
                  <button
                    className="result-card-header"
                    type="button"
                    onClick={() => setOpenSources((current) => ({ ...current, [source]: !current[source] }))}
                  >
                    <div>
                      <span className="source-pill">{source}</span>
                      <h3>{result ? `${data.query}｜${source}` : `${source}｜該当記事なし`}</h3>
                    </div>
                    <ChevronDown className={openSources[source] ? "rotate" : ""} size={21} />
                  </button>

                  {openSources[source] && (
                    <div className="result-card-body">
                      {result ? (
                        <>
                          {facts.length > 0 && (
                            <div className="fact-grid">
                              {facts.slice(0, 4).map((fact, index) => (
                                <div className="fact-card" key={`${fact.label}-${index}`}>
                                  <span>{fact.label}</span>
                                  <strong>{fact.value}</strong>
                                </div>
                              ))}
                            </div>
                          )}

                          {hasCurrentGames && nearest && difference !== null && (
                            <div className={`judgement-card ${difference >= 0 ? "ready" : Math.abs(difference) <= 50 ? "near" : "wait"}`}>
                              <span>現在 {numericGames}G ／ 基準 {nearest.games}G</span>
                              <strong>{difference >= 0 ? `狙い目基準を ${difference}G 超過` : `狙い目まであと ${Math.abs(difference)}G`}</strong>
                              <small>{nearest.label}</small>
                            </div>
                          )}

                          <details className="details-panel" open={facts.length === 0}>
                            <summary>元記事の抽出内容を見る</summary>
                            <div className="extract-block">
                              <h4>{result.heading}</h4>
                              {result.contentHtml ? (
                                <div className="original-format" dangerouslySetInnerHTML={{ __html: result.contentHtml }} />
                              ) : result.lines && result.lines.length > 0 ? (
                                <div className="extract-lines">{result.lines.map((line, index) => <p key={`${source}-${index}`}>{line}</p>)}</div>
                              ) : <p className="empty-message">本文を抽出できませんでした。</p>}
                            </div>
                          </details>

                          <a className="source-link-button" href={result.url} target="_blank" rel="noreferrer">
                            {source}で元記事を見る <ExternalLink size={15} />
                          </a>
                        </>
                      ) : (
                        <p className="empty-message">入力した機種名に一致する公開記事を特定できませんでした。</p>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </section>

          {hasCurrentGames && data.results.some((result) => (result.quickFacts ?? []).some((fact) => fact.games !== undefined)) && (
            <section className="quick-summary">
              <p className="result-kicker">比較メモ</p>
              <h3>{numericGames}G時点の目安</h3>
              <div className="summary-list">
                {data.results.map((result) => {
                  const candidates = (result.quickFacts ?? []).filter((fact) => fact.games !== undefined);
                  if (candidates.length === 0) return null;
                  const nearest = candidates.reduce((best, item) => Math.abs((item.games ?? 0) - numericGames) < Math.abs((best.games ?? 0) - numericGames) ? item : best);
                  const diff = numericGames - (nearest.games ?? 0);
                  return (
                    <div key={result.source}>
                      <span>{result.source}</span>
                      <strong>{diff >= 0 ? `基準到達（+${diff}G）` : `あと${Math.abs(diff)}G`}</strong>
                    </div>
                  );
                })}
              </div>
              <p className="summary-note">※ ページから自動抽出した数値のため、必ず元記事の条件も確認してください。</p>
            </section>
          )}

          <p className="fetched-at">取得日時：{new Date(data.fetchedAt).toLocaleString("ja-JP")}</p>
        </>
      )}
    </main>
  );
}
