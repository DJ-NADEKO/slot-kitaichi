"use client";

import { FormEvent, useState } from "react";
import { ExternalLink, Search, TriangleAlert } from "lucide-react";

type SourceResult = {
  source: "DMMぱちタウン" | "ハイエナくん";
  title: string;
  url: string;
  heading: string;
  lines?: string[];
  contentHtml?: string;
};

type ApiResponse = {
  query: string;
  results: SourceResult[];
  errors: string[];
  fetchedAt: string;
};

export default function Home() {
  const [query, setQuery] = useState("");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    if (value.length < 2) {
      setError("機種名を2文字以上入力してください。");
      return;
    }
    setLoading(true);
    setError("");
    setData(null);
    try {
      const response = await fetch(`/api/reference?q=${encodeURIComponent(value)}`, { cache: "no-store" });
      const json = (await response.json()) as ApiResponse & { message?: string };
      if (!response.ok) throw new Error(json.message || json.errors?.[0] || "検索に失敗しました。");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "検索に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  const sources: SourceResult["source"][] = ["DMMぱちタウン", "ハイエナくん"];

  return (
    <main className="reference-shell">
      <header className="reference-hero">
        <p className="eyebrow">PRIVATE SLOT REFERENCE</p>
        <h1>機種情報クイック参照</h1>
        <p>機種名を検索し、2サイトの指定箇所だけを都度取得して表示します。データは保存しません。</p>
      </header>

      <section className="search-panel">
        <form className="reference-search" onSubmit={search}>
          <Search size={21} aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="例：Lワールドダイスター"
            autoFocus
            aria-label="機種名"
          />
          <button className="button" disabled={loading} type="submit">
            {loading ? "取得中…" : "2サイトを検索"}
          </button>
        </form>
        <div className="scope-note">
          <span><strong>DMMぱちタウン：</strong>詳細ページ内「天井・ゾーン・ヤメ時」（#anc-zone）</span>
          <span><strong>ハイエナくん：</strong>会員限定記事を除く通常記事の「まとめ」</span>
        </div>
      </section>

      {error && <div className="error-box"><TriangleAlert size={19} />{error}</div>}

      {data && (
        <>
          {data.errors.length > 0 && (
            <div className="warning-box">
              <TriangleAlert size={19} />
              <div>{data.errors.map((item) => <p key={item}>{item}</p>)}</div>
            </div>
          )}

          <section className="source-grid">
            {sources.map((source) => {
              const result = data.results.find((item) => item.source === source);
              return (
                <article className="source-card" key={source}>
                  <div className="source-card-head">
                    <div>
                      <span className="source-badge">{source}</span>
                      <h2>{result?.title || "該当記事なし"}</h2>
                    </div>
                    {result && (
                      <a className="open-link" href={result.url} target="_blank" rel="noreferrer">
                        元記事 <ExternalLink size={15} />
                      </a>
                    )}
                  </div>

                  {result ? (
                    <div className="extract-block">
                      <h3>{result.heading}</h3>
                      {result.contentHtml ? (
                        <div className="original-format" dangerouslySetInnerHTML={{ __html: result.contentHtml }} />
                      ) : result.lines && result.lines.length > 0 ? (
                        <div className="extract-lines">
                          {result.lines.map((line, index) => <p key={`${source}-${index}`}>{line}</p>)}
                        </div>
                      ) : <p className="empty-message">対象見出しは見つかりましたが、本文を抽出できませんでした。</p>}
                    </div>
                  ) : (
                    <p className="empty-message">入力した機種名に一致する公開記事を特定できませんでした。</p>
                  )}
                </article>
              );
            })}
          </section>
          <p className="fetched-at">取得日時：{new Date(data.fetchedAt).toLocaleString("ja-JP")}</p>
        </>
      )}
    </main>
  );
}
