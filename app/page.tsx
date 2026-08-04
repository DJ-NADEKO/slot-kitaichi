"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Clock3, ExternalLink, Heart, History, LogOut, Search, Sparkles, Star, TriangleAlert } from "lucide-react";

type SourceName = "DMMぱちタウン" | "ハイエナくん" | "なな徹";
type ExpectationRow = { games: number; equivalent?: string; nonEquivalent: string; label?: string };
type SourceResult = {
  source: SourceName;
  title: string;
  url: string;
  heading: string;
  lines?: string[];
  contentHtml?: string;
  expectationRows?: ExpectationRow[];
};
type ApiResponse = { query: string; results: SourceResult[]; errors: string[]; fetchedAt: string };
type StoredMachine = { name: string; searchedAt: string };

const RECENT_KEY = "slot-reference-recent-v1";
const FAVORITES_KEY = "slot-reference-favorites-v1";
const sources: SourceName[] = ["DMMぱちタウン", "ハイエナくん", "なな徹"];

function readStorage<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}
function sourceClass(source: SourceName) {
  if (source === "DMMぱちタウン") return "source-dmm";
  if (source === "ハイエナくん") return "source-haiena";
  return "source-nana";
}
function parseYen(value: string) {
  const match = value.replace(/,/g, "").match(/([\-−+＋]?\s*\d+)\s*円/);
  return match ? Number(match[1].replace(/−/g, "-").replace(/[＋+\s]/g, "")) : null;
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [currentGames, setCurrentGames] = useState("");
  const [recent, setRecent] = useState<StoredMachine[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    setRecent(readStorage<StoredMachine[]>(RECENT_KEY, []));
    setFavorites(readStorage<string[]>(FAVORITES_KEY, []));
  }, []);

  const suggestionItems = useMemo(() => {
    const value = query.trim().toLowerCase();
    const names = [...favorites, ...recent.map((item) => item.name)].filter((item, index, all) => all.indexOf(item) === index);
    if (!value) return names.slice(0, 6);
    return names.filter((name) => name.toLowerCase().includes(value) && name !== query).slice(0, 6);
  }, [favorites, query, recent]);

  function rememberSearch(name: string) {
    const next = [{ name, searchedAt: new Date().toISOString() }, ...recent.filter((item) => item.name !== name)].slice(0, 8);
    setRecent(next); localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  }

  async function runSearch(value: string) {
    const trimmed = value.trim();
    if (trimmed.length < 2) { setError("機種名を2文字以上入力してください。"); return; }
    setQuery(trimmed); setLoading(true); setError(""); setData(null); setCurrentGames("");
    try {
      const response = await fetch(`/api/reference?q=${encodeURIComponent(trimmed)}`, { cache: "no-store" });
      const json = await response.json() as ApiResponse & { message?: string };
      if (!response.ok) throw new Error(json.message || json.errors?.[0] || "検索に失敗しました。");
      setData(json); rememberSearch(trimmed);
    } catch (e) { setError(e instanceof Error ? e.message : "検索に失敗しました。"); }
    finally { setLoading(false); }
  }

  async function search(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await runSearch(query); }
  function toggleFavorite(name: string) {
    const next = favorites.includes(name) ? favorites.filter((item) => item !== name) : [name, ...favorites].slice(0, 12);
    setFavorites(next); localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
  }
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }

  const numericGames = Number(currentGames);
  const hasCurrentGames = currentGames !== "" && Number.isFinite(numericGames) && numericGames >= 0;
  const nanaResult = data?.results.find((item) => item.source === "なな徹");
  const nanaRows = nanaResult?.expectationRows ?? [];
  const expectationAtCurrent = hasCurrentGames && nanaRows.length > 0
    ? [...nanaRows].sort((a, b) => a.games - b.games).filter((row) => row.games <= numericGames).at(-1)
      ?? [...nanaRows].sort((a, b) => Math.abs(a.games - numericGames) - Math.abs(b.games - numericGames))[0]
    : null;
  const expectationYen = expectationAtCurrent ? parseYen(expectationAtCurrent.nonEquivalent) : null;

  return (
    <main className="app-shell">
      <div className="floating-decoration deco-one" aria-hidden="true">✦</div>
      <div className="floating-decoration deco-two" aria-hidden="true">♡</div>

      <header className="app-header">
        <div>
          <p className="eyebrow"><Sparkles size={13} /> SLOT QUICK CHECK</p>
          <h1>狙い目、さくっと確認。</h1>
          <p className="hero-copy">3サイトの必要箇所を、元の表や見出しを保って表示します。</p>
        </div>
        <button className="icon-text-button" type="button" onClick={logout}><LogOut size={15} /> ログアウト</button>
      </header>

      <section className="search-card">
        <form className="main-search" onSubmit={search}>
          <Search size={22} aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="機種名を入力" autoFocus aria-label="機種名" />
          <button className="primary-button" disabled={loading} type="submit">{loading ? "検索中…" : "検索"}</button>
        </form>
        {suggestionItems.length > 0 && <div className="suggestion-row">{suggestionItems.map((item) => <button key={item} type="button" onClick={() => runSearch(item)}>{item}</button>)}</div>}
      </section>

      {(favorites.length > 0 || recent.length > 0) && <section className="shortcut-grid">
        {favorites.length > 0 && <div className="shortcut-card"><div className="shortcut-title"><Star size={16} /> お気に入り</div><div className="chip-list">{favorites.map((name) => <button key={name} onClick={() => runSearch(name)}>{name}</button>)}</div></div>}
        {recent.length > 0 && <div className="shortcut-card"><div className="shortcut-title"><History size={16} /> 最近の検索</div><div className="chip-list">{recent.slice(0, 5).map((item) => <button key={item.name} onClick={() => runSearch(item.name)}>{item.name}</button>)}</div></div>}
      </section>}

      {error && <div className="notice error-notice"><TriangleAlert size={19} />{error}</div>}

      {data && <>
        <section className="result-toolbar">
          <div><p className="result-kicker">検索結果</p><div className="result-title-row"><h2>{data.query}</h2><button className={`favorite-button ${favorites.includes(data.query) ? "active" : ""}`} type="button" onClick={() => toggleFavorite(data.query)}><Heart size={18} fill={favorites.includes(data.query) ? "currentColor" : "none"} /></button></div></div>
          <label className="games-input-card"><span><Clock3 size={16} /> 現在G数</span><div><input inputMode="numeric" pattern="[0-9]*" value={currentGames} onChange={(event) => setCurrentGames(event.target.value.replace(/\D/g, ""))} placeholder="例 482" /><b>G</b></div></label>
        </section>

        {hasCurrentGames && nanaRows.length > 0 && expectationAtCurrent && <section className={`expectation-summary ${expectationYen !== null && expectationYen >= 0 ? "positive" : "negative"}`}>
          <div><span>なな徹・非等価の目安</span><strong>{numericGames}G時点：{expectationAtCurrent.nonEquivalent}</strong></div>
          <small>表の{expectationAtCurrent.label ?? `${expectationAtCurrent.games}G`}行を参照しています。</small>
        </section>}

        {data.errors.length > 0 && <div className="notice warning-notice"><TriangleAlert size={19} /><div>{data.errors.map((item) => <p key={item}>{item}</p>)}</div></div>}

        <section className="results-stack">
          {sources.map((source) => {
            const result = data.results.find((item) => item.source === source);
            return <article className={`result-section ${sourceClass(source)}`} key={source}>
              <header className="result-section-header"><div><span className="source-pill">{source}</span><h3>{result ? `${data.query}｜${source}` : `${source}｜該当記事なし`}</h3></div>{result && <a href={result.url} target="_blank" rel="noreferrer">元記事 <ExternalLink size={14} /></a>}</header>
              <div className="result-section-body">
                {result ? <><h4>{result.heading}</h4>{result.contentHtml ? <div className="original-format" dangerouslySetInnerHTML={{ __html: result.contentHtml }} /> : result.lines?.length ? <div className="extract-lines">{result.lines.map((line, index) => <p key={`${source}-${index}`}>{line}</p>)}</div> : <p className="empty-message">本文を抽出できませんでした。</p>}</> : <p className="empty-message">入力した機種名に一致する記事を特定できませんでした。</p>}
              </div>
            </article>;
          })}
        </section>
        <p className="fetched-at">取得日時：{new Date(data.fetchedAt).toLocaleString("ja-JP")}</p>
      </>}
    </main>
  );
}
