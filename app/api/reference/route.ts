import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36";
type Source = "DMMぱちタウン" | "ハイエナくん";
type SearchItem = { source: Source; title: string; url: string };
type QuickFact = { label: string; value: string; games?: number };
type Result = SearchItem & { heading: string; lines?: string[]; contentHtml?: string; quickFacts?: QuickFact[] };

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, x) => String.fromCodePoint(parseInt(x, 16)))
    .replace(/&#(\d+);/g, (_, x) => String.fromCodePoint(Number(x)));
}

function text(value: string) {
  return decodeHtml(value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h1|h2|h3|h4|h5|dt|dd|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[\t ]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim());
}

function oneLine(value: string) { return text(value).replace(/\s+/g, " ").trim(); }
function normalize(value: string) { return value.toLowerCase().replace(/[\s　・･\-‐－_\[\]【】「」『』（）()]/g, ""); }

async function fetchHtml(url: string, accept = "text/html") {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      headers: { "user-agent": UA, accept },
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally { clearTimeout(timer); }
}

function score(title: string, query: string) {
  const t = normalize(title); const q = normalize(query);
  if (t === q) return 100;
  if (t.includes(q)) return 80;
  return query.split(/[\s　]+/).filter(Boolean).reduce((n, w) => n + (t.includes(normalize(w)) ? 10 : 0), 0);
}

async function findDmm(query: string): Promise<SearchItem | null> {
  const html = await fetchHtml(`https://p-town.dmm.com/machines/search?keyword=${encodeURIComponent(query)}`);
  const candidates: SearchItem[] = [];
  const re = /<a[^>]+href=["'](\/machines\/\d+[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const title = oneLine(match[2]);
    if (!title || score(title, query) <= 0) continue;
    const url = `https://p-town.dmm.com${match[1].split("?")[0]}`;
    if (!candidates.some((x) => x.url === url)) candidates.push({ source: "DMMぱちタウン", title, url });
  }
  return candidates.sort((a, b) => score(b.title, query) - score(a.title, query))[0] ?? null;
}

async function findHaienakun(query: string): Promise<SearchItem | null> {
  let candidates: SearchItem[] = [];
  try {
    const raw = await fetchHtml(`https://haienakun.com/wp-json/wp/v2/search?search=${encodeURIComponent(query)}&per_page=20&type=post`, "application/json");
    const json = JSON.parse(raw) as Array<{ title?: string; url?: string }>;
    candidates = json.filter((x) => x.title && x.url).map((x) => ({ source: "ハイエナくん", title: decodeHtml(x.title!), url: x.url! }));
  } catch {
    const html = await fetchHtml(`https://haienakun.com/?s=${encodeURIComponent(query)}`);
    const re = /<a[^>]+href=["'](https:\/\/haienakun\.com\/[^"'#?]+\/?)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(html))) {
      const title = oneLine(match[2]);
      if (title) candidates.push({ source: "ハイエナくん", title, url: match[1] });
    }
  }

  candidates = candidates.filter((item) => {
    const n = normalize(item.title);
    return score(item.title, query) > 0
      && !/ブログ会員限定記事|会員限定|有料記事/.test(item.title)
      && !/_membership\/?$/i.test(item.url)
      && (/ハイエナ狙い目/.test(item.title) || /狙い目|天井|やめ時|スロット/.test(n));
  });
  return candidates.sort((a, b) => {
    const preferredA = /ハイエナ狙い目/.test(a.title) ? 30 : 0;
    const preferredB = /ハイエナ狙い目/.test(b.title) ? 30 : 0;
    return (score(b.title, query) + preferredB) - (score(a.title, query) + preferredA);
  })[0] ?? null;
}

function extractHeadingBlock(html: string, headingPattern: RegExp, stopAtSameOrHigher = true) {
  const headingRe = /<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi;
  const headings: Array<{ level: number; heading: string; start: number; end: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = headingRe.exec(html))) {
    headings.push({ level: Number(match[1].slice(1)), heading: oneLine(match[2]), start: match.index, end: headingRe.lastIndex });
  }
  const targetIndex = headings.findIndex((h) => headingPattern.test(h.heading));
  if (targetIndex < 0) return null;
  const target = headings[targetIndex];
  const next = headings.slice(targetIndex + 1).find((h) => !stopAtSameOrHigher || h.level <= target.level);
  const body = html.slice(target.end, next?.start ?? html.length);
  return { heading: target.heading, body };
}

function linesFromBody(body: string) {
  const cleaned = text(body);
  const lines = cleaned.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const noise = /^(目次|HOME|コメント|関連記事|スポンサーリンク|広告|この記事を書いた人|SNS|タイトルとURLをコピー|Copyright)/i;
  return lines
    .filter((line) => line.length >= 2 && line.length <= 500 && !noise.test(line))
    .filter((line, index, all) => all.indexOf(line) === index)
    .slice(0, 120);
}

function sanitizeSummaryHtml(value: string) {
  return value
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed|form|input|button|textarea|select|link|meta)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(script|style|iframe|object|embed|form|input|button|textarea|select|link|meta)[^>]*\/?\s*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(["']).*?\1/gi, "")
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")
    .replace(/\s(?:style|class|id|data-[\w-]+)\s*=\s*(["']).*?\1/gi, "")
    .replace(/\s(?:style|class|id|data-[\w-]+)\s*=\s*[^\s>]+/gi, "")
    .replace(/<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>/gi, (_m, _q, href) => {
      const safe = /^(https?:\/\/|\/)/i.test(href) ? href : "#";
      return `<a href="${safe.replace(/"/g, "&quot;")}" target="_blank" rel="noreferrer">`;
    })
    .replace(/<(?!\/?(?:h[1-6]|p|br|ul|ol|li|table|thead|tbody|tfoot|tr|th|td|strong|b|em|i|u|small|blockquote|a|div|span)\b)[^>]+>/gi, "")
    .replace(/<(th|td)\b([^>]*)>/gi, (_m, tag, attrs) => {
      const colspan = attrs.match(/colspan\s*=\s*["']?(\d+)/i)?.[1];
      const rowspan = attrs.match(/rowspan\s*=\s*["']?(\d+)/i)?.[1];
      return `<${tag}${colspan ? ` colspan="${colspan}"` : ""}${rowspan ? ` rowspan="${rowspan}"` : ""}>`;
    })
    .trim();
}

function extractElementSectionById(html: string, id: string, tagName = "h2") {
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const targetRe = new RegExp(
    `<${tagName}\\b[^>]*\\bid=["']${escapedId}["'][^>]*>([\\s\\S]*?)<\\/${tagName}>`,
    "i"
  );
  const target = targetRe.exec(html);
  if (!target || target.index === undefined) return null;

  const start = target.index + target[0].length;
  const nextHeadingRe = new RegExp(`<${tagName}\\b[^>]*>`, "ig");
  nextHeadingRe.lastIndex = start;
  const next = nextHeadingRe.exec(html);
  return {
    heading: oneLine(target[1]),
    body: html.slice(start, next?.index ?? html.length)
  };
}


function extractQuickFacts(value: string): QuickFact[] {
  const plain = text(value).replace(/\s+/g, " ").trim();
  if (!plain) return [];

  const facts: QuickFact[] = [];
  const patterns: Array<{ label: string; re: RegExp }> = [
    { label: "狙い目", re: /(?:狙い目|天井狙い|打ち出し|狙い時)[^。\n]{0,45}?(\d{2,4})\s*G(?:以降|以上|～|~|から)?/gi },
    { label: "ゾーン", re: /(?:ゾーン|周期狙い)[^。\n]{0,45}?(\d{2,4})\s*G(?:以降|以上|～|~|から)?/gi },
    { label: "天井", re: /(?:天井|最大)[^。\n]{0,35}?(\d{2,4})\s*G/gi },
    { label: "リセット", re: /(?:リセット|朝一)[^。\n]{0,45}?(\d{2,4})\s*G(?:以降|以上|～|~|から)?/gi },
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.re.exec(plain))) {
      const games = Number(match[1]);
      if (!Number.isFinite(games)) continue;
      const start = Math.max(0, match.index - 8);
      const end = Math.min(plain.length, match.index + match[0].length + 20);
      const valueText = plain.slice(start, end).replace(/^.*?[。！？]/, "").trim();
      if (!facts.some((fact) => fact.label === pattern.label && fact.games === games)) {
        facts.push({ label: pattern.label, value: valueText.length <= 70 ? valueText : `${games}G～`, games });
      }
      if (facts.length >= 6) break;
    }
  }

  const stopMatch = plain.match(/(?:ヤメ時|やめ時|止め時)[：:\s]*([^。]{2,70})/i);
  if (stopMatch) facts.push({ label: "ヤメ時", value: stopMatch[1].trim() });

  return facts.slice(0, 6);
}

function sanitizeDmmZoneHtml(value: string) {
  return sanitizeSummaryHtml(value)
    // 「狙い目・ゾーン狙いまとめはコチラ！」など、別ページへ遷移する画像バナーを除外する。
    .replace(/<a\b[^>]*>[\s\S]*?<img\b[^>]*>[\s\S]*?<\/a>/gi, "")
    .replace(/<img\b[^>]*>/gi, "")
    // 画像除去後に空になったリンクや要素を整理する。
    .replace(/<a\b[^>]*>\s*<\/a>/gi, "")
    .replace(/<(?:p|div|span)>\s*<\/(?:p|div|span)>/gi, "")
    .trim();
}

async function getDmm(item: SearchItem): Promise<Result> {
  const detailUrl = item.url.replace(/\/$/, "");
  const html = await fetchHtml(detailUrl);
  const block = extractElementSectionById(html, "anc-zone", "h2");
  return {
    ...item,
    url: `${detailUrl}#anc-zone`,
    heading: block?.heading || "天井・ゾーン・ヤメ時",
    contentHtml: block ? sanitizeDmmZoneHtml(block.body) : "",
    quickFacts: block ? extractQuickFacts(block.body) : []
  };
}

async function getHaienakun(item: SearchItem): Promise<Result> {
  const html = await fetchHtml(item.url);
  const pageTitle = oneLine(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || item.title);
  if (/ブログ会員限定記事|会員限定|有料記事/.test(pageTitle) || /_membership\/?$/i.test(item.url)) {
    throw new Error("会員限定記事は対象外です。");
  }
  const block = extractHeadingBlock(html, /^まとめ$/i);
  return {
    ...item,
    heading: block?.heading || "まとめ",
    contentHtml: block ? sanitizeSummaryHtml(block.body) : "",
    quickFacts: block ? extractQuickFacts(block.body) : []
  };
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() || "";
  if (query.length < 2) return NextResponse.json({ message: "機種名を2文字以上入力してください。" }, { status: 400 });

  const found = await Promise.allSettled([findDmm(query), findHaienakun(query)]);
  const dmm = found[0].status === "fulfilled" ? found[0].value : null;
  const haiena = found[1].status === "fulfilled" ? found[1].value : null;
  const errors: string[] = [];
  if (!dmm) errors.push("DMMぱちタウンで該当する機種ページを特定できませんでした。");
  if (!haiena) errors.push("ハイエナくんで会員限定ではない該当記事を特定できませんでした。");

  const jobs: Promise<Result>[] = [];
  if (dmm) jobs.push(getDmm(dmm));
  if (haiena) jobs.push(getHaienakun(haiena));
  const fetched = await Promise.allSettled(jobs);
  const results: Result[] = [];
  fetched.forEach((result, index) => {
    if (result.status === "fulfilled") results.push(result.value);
    else errors.push(`${jobs.length === 1 ? (dmm ? "DMMぱちタウン" : "ハイエナくん") : index === 0 && dmm ? "DMMぱちタウン" : "ハイエナくん"}の記事取得に失敗しました。`);
  });

  return NextResponse.json({ query, results, errors, fetchedAt: new Date().toISOString() });
}
