import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36";
type Source = "DMMぱちタウン" | "ハイエナくん" | "なな徹";
type SearchItem = { source: Source; title: string; url: string };
type ExpectationRow = { games: number; equivalent?: string; nonEquivalent: string; label?: string };
type Result = SearchItem & {
  heading: string;
  lines?: string[];
  contentHtml?: string;
  expectationRows?: ExpectationRow[];
};

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
function absoluteUrl(href: string, base: string) {
  try { return new URL(href, base).toString(); } catch { return href; }
}

async function fetchHtml(url: string, accept = "text/html") {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      headers: { "user-agent": UA, accept },
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
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
    const url = `https://p-town.dmm.com${match[1].split("?")[0].split("#")[0]}`;
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
    const re = /<a[^>]+href=["'](https:\/\/haienakun\.com\/[^"'#?]+\/?)['"][^>]*>([\s\S]*?)<\/a>/gi;
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

async function findNana(query: string): Promise<SearchItem | null> {
  const searchUrl = `https://nana-press.com/kaiseki/search/?c=s&keyword=${encodeURIComponent(query)}`;
  const html = await fetchHtml(searchUrl);
  const candidates: SearchItem[] = [];
  const re = /<a\b[^>]*href=["']([^"']*\/kaiseki\/machine\/\d+\/?(?:[?#][^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const title = oneLine(match[2]);
    if (!title || score(title, query) <= 0) continue;
    const url = absoluteUrl(match[1], searchUrl).split("?")[0].split("#")[0];
    if (!candidates.some((item) => item.url === url)) candidates.push({ source: "なな徹", title, url });
  }
  return candidates.sort((a, b) => score(b.title, query) - score(a.title, query))[0] ?? null;
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
  return { heading: target.heading, body: html.slice(target.end, next?.start ?? html.length) };
}

function sanitizeHtml(value: string) {
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
  const targetRe = new RegExp(`<${tagName}\\b[^>]*\\bid=["']${escapedId}["'][^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const target = targetRe.exec(html);
  if (!target || target.index === undefined) return null;
  const start = target.index + target[0].length;
  const nextHeadingRe = new RegExp(`<${tagName}\\b[^>]*>`, "ig");
  nextHeadingRe.lastIndex = start;
  const next = nextHeadingRe.exec(html);
  return { heading: oneLine(target[1]), body: html.slice(start, next?.index ?? html.length) };
}

function sanitizeDmmZoneHtml(value: string) {
  return sanitizeHtml(value)
    .replace(/<a\b[^>]*>[\s\S]*?<img\b[^>]*>[\s\S]*?<\/a>/gi, "")
    .replace(/<img\b[^>]*>/gi, "")
    .replace(/<a\b[^>]*>\s*<\/a>/gi, "")
    .replace(/<(?:p|div|span)>\s*<\/(?:p|div|span)>/gi, "")
    .trim();
}

function extractLinks(html: string, baseUrl: string) {
  const links: Array<{ href: string; label: string }> = [];
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const label = oneLine(match[2]);
    if (!label) continue;
    links.push({ href: absoluteUrl(match[1], baseUrl), label });
  }
  return links;
}

function findNanaStrategyLink(html: string, baseUrl: string) {
  const links = extractLinks(html, baseUrl)
    .map((link) => ({ ...link, normalizedLabel: normalize(link.label) }))
    .filter((link) => {
      // 機種ページ下部「攻略情報」にある期待値まとめ記事だけを候補にする。
      // 設定判別・朝一・有利区間など、別の関連記事は除外する。
      return /天井/.test(link.label)
        && /期待値/.test(link.label)
        && /恩恵/.test(link.label)
        && /狙い目/.test(link.label)
        && /(?:ヤメ時|やめ時)/.test(link.label)
        && /まとめ/.test(link.label);
    });

  // 現在のスマホ版で表示される文言を最優先する。
  const exactLabels = [
    "天井の期待値や恩恵狙い目とヤメ時まとめ",
    "天井の期待値や恩恵ヤメ時と狙い目まとめ",
    "天井の期待値や恩恵狙い目とやめ時まとめ",
  ];
  const exact = links.find((link) => exactLabels.includes(link.normalizedLabel));
  if (exact) return exact.href.split("#")[0];

  // 表記揺れがあっても、必要な6語をすべて含むリンクを採用する。
  return links[0]?.href.split("#")[0] ?? null;
}

function extractTablesWithContext(html: string) {
  const tables: Array<{ html: string; start: number; context: string }> = [];
  const re = /<table\b[^>]*>[\s\S]*?<\/table>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const start = match.index;
    const context = oneLine(html.slice(Math.max(0, start - 1400), start));
    tables.push({ html: match[0], start, context });
  }
  return tables;
}

function parseExpectationRows(tableHtml: string): ExpectationRow[] {
  const rows: ExpectationRow[] = [];
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(tableHtml))) {
    const cells: string[] = [];
    const cellRe = /<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRe.exec(rowMatch[1]))) cells.push(oneLine(cellMatch[1]));
    if (cells.length < 2) continue;
    const gameMatch = cells[0].replace(/,/g, "").match(/(\d{1,4})\s*G?/i);
    if (!gameMatch) continue;
    const games = Number(gameMatch[1]);
    const nonEquivalentIndex = cells.findIndex((cell, index) => index > 0 && /5\.6枚|非等価/.test(cell));
    const valueCells = cells.slice(1);
    const nonEquivalent = nonEquivalentIndex > 0
      ? cells[nonEquivalentIndex]
      : valueCells[valueCells.length - 1];
    if (!/[\-−+＋]?\s*[\d,]+\s*円/.test(nonEquivalent)) continue;
    rows.push({
      games,
      equivalent: valueCells.length >= 2 ? valueCells[0] : undefined,
      nonEquivalent,
      label: cells[0],
    });
  }
  return rows.filter((row, index, all) => all.findIndex((item) => item.games === row.games && item.nonEquivalent === row.nonEquivalent) === index);
}

function extractNanaExpectation(html: string) {
  const tables = extractTablesWithContext(html);
  const candidates = tables.filter((table) => {
    const combined = `${table.context} ${oneLine(table.html)}`;
    return /期待値/.test(combined) && (/非等価|5\.6枚交換|5\.6枚/.test(combined));
  });
  const table = candidates.sort((a, b) => {
    const scoreA = /非等価の期待値一覧/.test(a.context) ? 20 : 0;
    const scoreB = /非等価の期待値一覧/.test(b.context) ? 20 : 0;
    return scoreB - scoreA;
  })[0];
  if (!table) return null;

  const headingMatch = table.context.match(/([^。\n]{0,40}(?:非等価|5\.6枚)[^。\n]{0,40}期待値[^。\n]{0,40})$/);
  return {
    heading: headingMatch?.[1]?.trim() || "非等価の期待値一覧",
    contentHtml: sanitizeHtml(table.html),
    rows: parseExpectationRows(table.html),
  };
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
  };
}

async function getHaienakun(item: SearchItem): Promise<Result> {
  const html = await fetchHtml(item.url);
  const pageTitle = oneLine(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || item.title);
  if (/ブログ会員限定記事|会員限定|有料記事/.test(pageTitle) || /_membership\/?$/i.test(item.url)) {
    throw new Error("会員限定記事は対象外です。");
  }
  const block = extractHeadingBlock(html, /^まとめ$/i);
  return { ...item, heading: block?.heading || "まとめ", contentHtml: block ? sanitizeHtml(block.body) : "" };
}

async function getNana(item: SearchItem): Promise<Result> {
  const machineHtml = await fetchHtml(item.url);
  const strategyUrl = findNanaStrategyLink(machineHtml, item.url);
  if (!strategyUrl) throw new Error("『天井の期待値や恩恵・ヤメ時と狙い目まとめ』へのリンクを特定できませんでした。");
  const strategyHtml = await fetchHtml(strategyUrl);
  const expectation = extractNanaExpectation(strategyHtml);
  if (!expectation) throw new Error("非等価の期待値一覧を抽出できませんでした。");
  return {
    source: "なな徹",
    title: item.title,
    url: strategyUrl,
    heading: expectation.heading,
    contentHtml: expectation.contentHtml,
    expectationRows: expectation.rows,
  };
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return NextResponse.json({ message: "機種名を2文字以上入力してください。" }, { status: 400 });

  const errors: string[] = [];
  const found = await Promise.allSettled([findDmm(query), findHaienakun(query), findNana(query)]);
  const tasks: Promise<Result>[] = [];

  const dmm = found[0].status === "fulfilled" ? found[0].value : null;
  const haienakun = found[1].status === "fulfilled" ? found[1].value : null;
  const nana = found[2].status === "fulfilled" ? found[2].value : null;

  if (dmm) tasks.push(getDmm(dmm)); else errors.push("DMMぱちタウン：該当機種を特定できませんでした。");
  if (haienakun) tasks.push(getHaienakun(haienakun)); else errors.push("ハイエナくん：対象となる通常記事を特定できませんでした。");
  if (nana) tasks.push(getNana(nana)); else errors.push("なな徹：該当機種を特定できませんでした。");

  const settled = await Promise.allSettled(tasks);
  const results: Result[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") results.push(result.value);
    else errors.push(result.reason instanceof Error ? result.reason.message : "記事取得に失敗しました。");
  }

  return NextResponse.json({ query, results, errors, fetchedAt: new Date().toISOString() });
}
