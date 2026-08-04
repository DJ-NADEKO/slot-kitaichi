import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36";
type Source = "DMMぱちタウン" | "ハイエナくん" | "なな徹";
type SearchItem = { source: Source; title: string; url: string };
type ExpectationRow = { games: number; equivalent?: string; nonEquivalent: string; label?: string };
type Result = SearchItem & { heading: string; lines?: string[]; contentHtml?: string; expectationRows?: ExpectationRow[] };

function decodeHtml(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, x) => String.fromCodePoint(parseInt(x, 16)))
    .replace(/&#(\d+);/g, (_, x) => String.fromCodePoint(Number(x)));
}
function text(value: string) {
  return decodeHtml(value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h1|h2|h3|h4|h5|dt|dd|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ").replace(/[\t ]+/g, " ").replace(/\n\s*\n+/g, "\n").trim());
}
function oneLine(value: string) { return text(value).replace(/\s+/g, " ").trim(); }
function normalize(value: string) { return value.toLowerCase().replace(/[\s　・･\-‐－_\[\]【】「」『』（）()／/]/g, ""); }
function absoluteUrl(href: string, base: string) { try { return new URL(href, base).toString(); } catch { return href; } }
async function fetchHtml(url: string, accept = "text/html") {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { headers: { "user-agent": UA, accept }, cache: "no-store", redirect: "follow", signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally { clearTimeout(timer); }
}
function score(title: string, query: string) {
  const t = normalize(title); const q = normalize(query);
  if (t === q) return 100;
  if (t.includes(q)) return 80 - Math.min(20, Math.max(0, t.length - q.length));
  return query.split(/[\s　]+/).filter(Boolean).reduce((n, w) => n + (t.includes(normalize(w)) ? 10 : 0), 0);
}
function uniqueItems(items: SearchItem[]) {
  return items.filter((item, index, all) => all.findIndex((x) => x.url === item.url) === index);
}

async function findDmmCandidates(query: string): Promise<SearchItem[]> {
  const html = await fetchHtml(`https://p-town.dmm.com/machines/search?keyword=${encodeURIComponent(query)}`);
  const candidates: SearchItem[] = [];
  const re = /<a[^>]+href=["'](\/machines\/\d+[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const cardHtml = match[2];
    // DMM検索結果ではパチンコに text-icon _pinball が付くため除外する。
    if (/class=["'][^"']*text-icon[^"']*(?:_pinball|-pinball|\bpinball\b)[^"']*["']/i.test(cardHtml)) continue;
    const title = oneLine(cardHtml);
    if (!title || /パチンコ/.test(title) || score(title, query) <= 0) continue;
    candidates.push({ source: "DMMぱちタウン", title, url: `https://p-town.dmm.com${match[1].split("?")[0].split("#")[0]}` });
  }
  return uniqueItems(candidates).sort((a, b) => score(b.title, query) - score(a.title, query)).slice(0, 8);
}

async function findHaienakunCandidates(query: string): Promise<SearchItem[]> {
  let candidates: SearchItem[] = [];
  try {
    const raw = await fetchHtml(`https://haienakun.com/wp-json/wp/v2/search?search=${encodeURIComponent(query)}&per_page=20&type=post`, "application/json");
    const json = JSON.parse(raw) as Array<{ title?: string; url?: string }>;
    candidates = json.filter((x) => x.title && x.url).map((x) => ({ source: "ハイエナくん", title: decodeHtml(x.title!), url: x.url! }));
  } catch {
    const html = await fetchHtml(`https://haienakun.com/?s=${encodeURIComponent(query)}`);
    const re = /<a[^>]+href=["'](https:\/\/haienakun\.com\/[^"'#?]+\/?)['"][^>]*>([\s\S]*?)<\/a>/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(html))) { const title = oneLine(match[2]); if (title) candidates.push({ source: "ハイエナくん", title, url: match[1] }); }
  }
  return uniqueItems(candidates.filter((item) => {
    const n = normalize(item.title);
    return score(item.title, query) > 0 && !/ブログ会員限定記事|会員限定|有料記事/.test(item.title)
      && !/_membership\/?$/i.test(item.url) && (/ハイエナ狙い目/.test(item.title) || /狙い目|天井|やめ時|スロット/.test(n));
  })).sort((a, b) => {
    const pa = /ハイエナ狙い目/.test(a.title) ? 30 : 0; const pb = /ハイエナ狙い目/.test(b.title) ? 30 : 0;
    return score(b.title, query) + pb - (score(a.title, query) + pa);
  }).slice(0, 8);
}

async function findNanaCandidates(query: string): Promise<SearchItem[]> {
  const searchUrl = `https://nana-press.com/kaiseki/search/?c=s&keyword=${encodeURIComponent(query)}`;
  const html = await fetchHtml(searchUrl); const candidates: SearchItem[] = [];
  const re = /<a\b[^>]*href=["']([^"']*\/kaiseki\/machine\/\d+\/?(?:[?#][^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const title = oneLine(match[2]); if (!title || score(title, query) <= 0) continue;
    candidates.push({ source: "なな徹", title, url: absoluteUrl(match[1], searchUrl).split("?")[0].split("#")[0] });
  }
  return uniqueItems(candidates).sort((a, b) => score(b.title, query) - score(a.title, query)).slice(0, 8);
}

function cleanMachineName(title: string) {
  return oneLine(title)
    .replace(/^【[^】]+】\s*/g, "")
    .replace(/【スロット[\s\S]*$/g, "")
    .replace(/【[^】]*(?:天井|狙い目|期待値|やめ時|ヤメ時)[^】]*】/g, "")
    .replace(/(?:天井|狙い目|期待値|やめ時|ヤメ時|有利区間)[\s\S]*$/g, "")
    .replace(/\s*[|｜].*$/g, "").trim();
}

function extractHeadingBlock(html: string, headingPattern: RegExp) {
  const headingRe = /<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi;
  const headings: Array<{ level: number; heading: string; start: number; end: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = headingRe.exec(html))) headings.push({ level: Number(match[1].slice(1)), heading: oneLine(match[2]), start: match.index, end: headingRe.lastIndex });
  const targetIndex = headings.findIndex((h) => headingPattern.test(h.heading)); if (targetIndex < 0) return null;
  const target = headings[targetIndex]; const next = headings.slice(targetIndex + 1).find((h) => h.level <= target.level);
  return { heading: target.heading, body: html.slice(target.end, next?.start ?? html.length) };
}
function sanitizeHtml(value: string) {
  return value.replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed|form|input|button|textarea|select|link|meta)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(script|style|iframe|object|embed|form|input|button|textarea|select|link|meta)[^>]*\/?\s*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(["']).*?\1/gi, "").replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")
    .replace(/\s(?:style|class|id|data-[\w-]+)\s*=\s*(["']).*?\1/gi, "").replace(/\s(?:style|class|id|data-[\w-]+)\s*=\s*[^\s>]+/gi, "")
    .replace(/<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>/gi, (_m, _q, href) => `<a href="${(/^(https?:\/\/|\/)/i.test(href) ? href : "#").replace(/"/g, "&quot;")}" target="_blank" rel="noreferrer">`)
    .replace(/<(?!\/?(?:h[1-6]|p|br|ul|ol|li|table|thead|tbody|tfoot|tr|th|td|strong|b|em|i|u|small|blockquote|a|div|span)\b)[^>]+>/gi, "")
    .replace(/<(th|td)\b([^>]*)>/gi, (_m, tag, attrs) => {
      const colspan = attrs.match(/colspan\s*=\s*["']?(\d+)/i)?.[1]; const rowspan = attrs.match(/rowspan\s*=\s*["']?(\d+)/i)?.[1];
      return `<${tag}${colspan ? ` colspan="${colspan}"` : ""}${rowspan ? ` rowspan="${rowspan}"` : ""}>`;
    }).trim();
}
function extractElementSectionById(html: string, id: string, tagName = "h2") {
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const targetRe = new RegExp(`<${tagName}\\b[^>]*\\bid=["']${escapedId}["'][^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const target = targetRe.exec(html); if (!target || target.index === undefined) return null;
  const start = target.index + target[0].length; const nextHeadingRe = new RegExp(`<${tagName}\\b[^>]*>`, "ig"); nextHeadingRe.lastIndex = start;
  const next = nextHeadingRe.exec(html); return { heading: oneLine(target[1]), body: html.slice(start, next?.index ?? html.length) };
}
function sanitizeDmmZoneHtml(value: string) {
  return sanitizeHtml(value).replace(/<a\b[^>]*>[\s\S]*?<img\b[^>]*>[\s\S]*?<\/a>/gi, "").replace(/<img\b[^>]*>/gi, "")
    .replace(/<a\b[^>]*>\s*<\/a>/gi, "").replace(/<(?:p|div|span)>\s*<\/(?:p|div|span)>/gi, "").trim();
}
function extractLinks(html: string, baseUrl: string) {
  const links: Array<{ href: string; label: string }> = []; const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) { const label = oneLine(match[2]); if (label) links.push({ href: absoluteUrl(match[1], baseUrl), label }); }
  return links;
}
function findNanaExpectationLink(html: string, baseUrl: string) {
  // なな徹は「攻略情報」とリンク一覧の間にラッパー要素が入るページがある。
  // そのため隣接するulを前提にせず、「攻略情報」の位置から次のカテゴリ見出しまでを走査する。
  const articlePathPattern = /\/kaiseki\/machine\/\d+\/\d+\/?(?:[?#][^"']*)?$/i;

  const resolveFirstArticleLink = (scope: string) => {
    // 最初のli内にある記事リンクを優先する。
    const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
    let liMatch: RegExpExecArray | null;
    while ((liMatch = liRe.exec(scope))) {
      const href = /<a\b[^>]*href=["']([^"']+)["'][^>]*>/i.exec(liMatch[1])?.[1];
      if (!href) continue;
      const url = absoluteUrl(href, baseUrl).split("#")[0];
      if (articlePathPattern.test(url)) return url;
    }

    // liの構造が通常と異なる場合は、範囲内の最初の記事リンクを使う。
    const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi;
    let anchorMatch: RegExpExecArray | null;
    while ((anchorMatch = anchorRe.exec(scope))) {
      const url = absoluteUrl(anchorMatch[1], baseUrl).split("#")[0];
      if (articlePathPattern.test(url)) return url;
    }
    return null;
  };

  // id属性の前後や属性順に依存せず、攻略情報を持つ開始タグを探す。
  const headingTagRe = /<([a-z][\w:-]*)\b[^>]*\bid=["']攻略情報["'][^>]*>/i;
  const headingTag = headingTagRe.exec(html);
  if (headingTag?.index !== undefined) {
    const start = headingTag.index + headingTag[0].length;

    // 次のメインカテゴリまでを攻略情報の範囲とする。
    const nextHeadingRe = /<(?:p|h[1-6]|div)\b[^>]*class=["'][^"']*el_mainHead[^"']*["'][^>]*>/gi;
    nextHeadingRe.lastIndex = start;
    const nextHeading = nextHeadingRe.exec(html);
    const scope = html.slice(start, nextHeading?.index ?? html.length);
    const first = resolveFirstArticleLink(scope);
    if (first) return first;
  }

  // idが見つからないページ向け。表示文字「攻略情報」から次カテゴリ文字までを対象にする。
  const textHeadingRe = />\s*攻略情報\s*</g;
  const textHeading = textHeadingRe.exec(html);
  if (textHeading?.index !== undefined) {
    const start = textHeading.index + textHeading[0].length;
    const rest = html.slice(start);
    const nextCategory = rest.search(/>\s*(?:通常時情報|ボーナス情報|AT情報|CZ情報|設定判別)\s*</);
    const scope = rest.slice(0, nextCategory >= 0 ? nextCategory : undefined);
    const first = resolveFirstArticleLink(scope);
    if (first) return first;
  }

  // 最終フォールバック：機種ページ内の記事リンクをキーワードで採点する。
  const links = extractLinks(html, baseUrl)
    .filter((link) => articlePathPattern.test(link.href.split("#")[0]))
    .map((link) => {
      const label = normalize(link.label);
      let points = 0;
      if (label.includes("天井")) points += 4;
      if (label.includes("期待値")) points += 4;
      if (label.includes("恩恵")) points += 2;
      if (label.includes("発動条件") || label.includes("発動ゲーム数")) points += 2;
      if (label.includes("狙い目")) points += 1;
      if (label.includes("ヤメ時") || label.includes("やめ時")) points += 1;
      return { ...link, points };
    })
    .filter((link) => link.points >= 8)
    .sort((a, b) => b.points - a.points);

  return links[0]?.href.split("#")[0] ?? null;
}
function extractTablesWithContext(html: string) {
  const tables: Array<{ html: string; context: string }> = []; const re = /<table\b[^>]*>[\s\S]*?<\/table>/gi; let match: RegExpExecArray | null;
  while ((match = re.exec(html))) tables.push({ html: match[0], context: oneLine(html.slice(Math.max(0, match.index - 1800), match.index)) });
  return tables;
}
function parseExpectationRows(tableHtml: string): ExpectationRow[] {
  const rows: ExpectationRow[] = []; const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi; let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(tableHtml))) {
    const cells: string[] = []; const cellRe = /<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi; let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRe.exec(rowMatch[1]))) cells.push(oneLine(cellMatch[1]));
    if (cells.length < 2) continue;
    const gameMatch = cells[0].replace(/,/g, "").match(/(\d{1,4})\s*G?/i); if (!gameMatch) continue;
    const yenCells = cells.slice(1).filter((cell) => /[\-−+＋]?\s*[\d,]+\s*円/.test(cell)); if (!yenCells.length) continue;
    rows.push({ games: Number(gameMatch[1]), equivalent: yenCells.length >= 2 ? yenCells[0] : undefined, nonEquivalent: yenCells.at(-1)!, label: cells[0] });
  }
  return rows.filter((row, index, all) => all.findIndex((x) => x.games === row.games && x.nonEquivalent === row.nonEquivalent) === index);
}
function extractNanaExpectation(html: string) {
  const candidates = extractTablesWithContext(html).filter((table) => {
    const combined = `${table.context} ${oneLine(table.html)}`;
    return /期待値/.test(combined) && /円/.test(combined) && (/非等価|5\.6枚交換|5\.6枚/.test(combined));
  });
  const table = candidates.sort((a, b) => {
    const aa = /期待値の詳細|期待値一覧|非等価/.test(a.context) ? 20 : 0; const bb = /期待値の詳細|期待値一覧|非等価/.test(b.context) ? 20 : 0;
    return bb - aa;
  })[0];
  if (!table) return null;
  const rows = parseExpectationRows(table.html); if (!rows.length) return null;
  return { heading: "非等価の期待値金額表", contentHtml: sanitizeHtml(table.html), rows };
}

function extractMetaContent(html: string, property: string) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const first = new RegExp(`<meta\\b[^>]*(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i").exec(html)?.[1];
  const second = new RegExp(`<meta\\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${escaped}["'][^>]*>`, "i").exec(html)?.[1];
  return oneLine(first || second || "");
}
function extractNanaMachineTitle(html: string, fallback: string) {
  const candidates = [
    html.match(/<h1\b[^>]*class=["'][^"']*(?:model|machine|title)[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1],
    html.match(/<(?:p|div|span)\b[^>]*class=["'][^"']*(?:bl_modelName|modelName|machineName)[^"']*["'][^>]*>([\s\S]*?)<\/(?:p|div|span)>/i)?.[1],
    html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1],
    extractMetaContent(html, "og:title"),
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1],
    fallback,
  ];
  for (const value of candidates) {
    const cleaned = cleanMachineName(oneLine(value || "")
      .replace(/｜.*なな徹.*$/i, "")
      .replace(/- なな徹.*$/i, "")
      .replace(/パチスロ・スロット.*$/i, ""));
    if (cleaned && !/機種解析|解析情報|検索結果|なな徹/.test(cleaned)) return cleaned;
  }
  return cleanMachineName(fallback);
}

async function getDmm(item: SearchItem): Promise<Result> {
  const detailUrl = item.url.replace(/\/$/, ""); const html = await fetchHtml(detailUrl); const block = extractElementSectionById(html, "anc-zone", "h2");
  const pageTitle = oneLine(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || item.title);
  return { ...item, title: cleanMachineName(pageTitle) || cleanMachineName(item.title), url: `${detailUrl}#anc-zone`, heading: block?.heading || "天井・ゾーン・ヤメ時", contentHtml: block ? sanitizeDmmZoneHtml(block.body) : "" };
}
async function getHaienakun(item: SearchItem): Promise<Result> {
  const html = await fetchHtml(item.url); const pageTitle = oneLine(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || item.title);
  if (/ブログ会員限定記事|会員限定|有料記事/.test(pageTitle) || /_membership\/?$/i.test(item.url)) throw new Error("ハイエナくん：会員限定記事は対象外です。");
  const block = extractHeadingBlock(html, /^まとめ$/i);
  return { ...item, title: cleanMachineName(pageTitle) || cleanMachineName(item.title), heading: block?.heading || "まとめ", contentHtml: block ? sanitizeHtml(block.body) : "" };
}
async function getNana(item: SearchItem): Promise<Result> {
  const machineHtml = await fetchHtml(item.url);
  const machineTitle = extractNanaMachineTitle(machineHtml, item.title);
  const expectationUrl = findNanaExpectationLink(machineHtml, item.url);
  if (!expectationUrl) throw new Error("なな徹：攻略情報メニューの1件目のリンクを特定できませんでした。");
  const detailHtml = await fetchHtml(expectationUrl); const expectation = extractNanaExpectation(detailHtml);
  if (!expectation) throw new Error("なな徹：非等価の期待値金額表を抽出できませんでした。");
  return { source: "なな徹", title: machineTitle || cleanMachineName(item.title), url: expectationUrl, heading: expectation.heading, contentHtml: expectation.contentHtml, expectationRows: expectation.rows };
}

function chooseBest(items: SearchItem[], selected: string) {
  return items.sort((a, b) => score(b.title, selected) - score(a.title, selected))[0] ?? null;
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return NextResponse.json({ message: "機種名を2文字以上入力してください。" }, { status: 400 });

  const searched = await Promise.allSettled([
    findDmmCandidates(query),
    findHaienakunCandidates(query),
    findNanaCandidates(query),
  ]);
  const dmmCandidates = searched[0].status === "fulfilled" ? searched[0].value : [];
  const haienaCandidates = searched[1].status === "fulfilled" ? searched[1].value : [];
  const nanaCandidates = searched[2].status === "fulfilled" ? searched[2].value : [];

  const errors: string[] = [];
  const tasks: Promise<Result>[] = [];
  const dmm = chooseBest(dmmCandidates, query);
  const haiena = chooseBest(haienaCandidates, query);
  const nana = chooseBest(nanaCandidates, query);

  if (dmm) tasks.push(getDmm(dmm)); else errors.push("DMMぱちタウン：該当機種を特定できませんでした。");
  if (haiena) tasks.push(getHaienakun(haiena)); else errors.push("ハイエナくん：対象となる通常記事を特定できませんでした。");
  if (nana) tasks.push(getNana(nana)); else errors.push("なな徹：該当機種を特定できませんでした。");

  const settled = await Promise.allSettled(tasks);
  const results: Result[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") results.push(result.value);
    else errors.push(result.reason instanceof Error ? result.reason.message : "記事取得に失敗しました。");
  }

  return NextResponse.json({ query, results, errors, fetchedAt: new Date().toISOString() });
}
