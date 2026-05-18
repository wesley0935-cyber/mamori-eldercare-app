const LUCKY_ITEMS = ['出門', '運動', '社交', '閱讀', '烹飪', '園藝', '購物', '拜訪親友'];
const AVOID_ITEMS = ['衝動消費', '劇烈運動', '遠行', '爭執'];
const LUCKY_COLORS = ['珊瑚紅', '橙黃色', '鵝黃色', '翠綠色', '寶藍色', '薰衣草紫', '珍珠白', '金黃色'];

export interface FortuneData {
  stars: number;   // 1–5
  lucky: string[]; // 2–3 items
  avoid: string[]; // 1–2 items
  color: string;
  number: number;  // 1–9
}

export interface NewsItem {
  title: string;
  summary: string; // plain text ≤100 chars, empty string if nothing useful
  url: string;     // Google News article URL for Linking.openURL
}

// ─── Seeded RNG (deterministic by date) ──────────────────────────────────────

function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function pickN<T>(arr: T[], n: number, rand: () => number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

// ─── Fortune generator ────────────────────────────────────────────────────────

export function generateFortune(date?: Date): FortuneData {
  const d = date ?? new Date();
  const seed =
    d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  const rand = seededRng(seed);

  const stars = Math.floor(rand() * 5) + 1;
  const luckyCount = Math.floor(rand() * 2) + 2;
  const avoidCount = Math.floor(rand() * 2) + 1;
  const lucky = pickN(LUCKY_ITEMS, luckyCount, rand);
  const avoid = pickN(AVOID_ITEMS, avoidCount, rand);
  const color = LUCKY_COLORS[Math.floor(rand() * LUCKY_COLORS.length)];
  const number = Math.floor(rand() * 9) + 1;

  return {stars, lucky, avoid, color, number};
}

// ─── News fetcher (Google News RSS) ──────────────────────────────────────────

/**
 * Two-pass HTML stripper.
 *
 * Pass 1 removes literal tags (<ol>, <li> …).
 * Entity decoding then turns &lt;ol&gt; → <ol> (entity-encoded HTML).
 * Pass 2 removes those newly-visible tags.
 * A final URL sweep removes any bare https:// that survived.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')              // pass 1 – literal tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&[a-z]+;/gi, '')
    .replace(/<[^>]*>/g, '')              // pass 2 – tags exposed by entity decode
    .replace(/https?:\/\/[^\s]*/g, '')    // remove bare URLs
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 100);
}

/** Extract CDATA or plain text content from an XML element string. */
function extractContent(element: string): string {
  // Strip optional CDATA wrapper — handles whitespace variations between ]]> and tag
  return element
    .replace(/^\s*<!\[CDATA\[/, '')
    .replace(/\]\]>\s*$/, '')
    .trim();
}

export async function fetchTodayNews(): Promise<NewsItem | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(
      'https://news.google.com/rss?hl=zh-TW&gl=TW&ceid=TW:zh-Hant',
      {signal: controller.signal},
    );
    clearTimeout(timeoutId);
    const text = await res.text();

    const itemMatch = text.match(/<item>([\s\S]*?)<\/item>/);
    if (!itemMatch) return null;
    const item = itemMatch[1];

    // ── Title ──────────────────────────────────────────────────────────────
    const titleElement = item.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '';
    const title = stripHtml(extractContent(titleElement))
      .replace(/ - [^-]+$/, '') // remove " - SourceName" suffix
      .trim();

    // ── Article URL ────────────────────────────────────────────────────────
    const linkMatch = item.match(/<link>(https?:\/\/[^<\s]+)<\/link>/);
    const descElement = item.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? '';
    const descRaw = extractContent(descElement);
    const hrefMatch = descRaw.match(/href="(https?:\/\/[^"]+)"/);
    const url = linkMatch?.[1]?.trim() ?? hrefMatch?.[1]?.trim() ?? '';

    // ── Summary ────────────────────────────────────────────────────────────
    const summary = stripHtml(descRaw); // already ≤100 chars and pure text

    return {title: title || '今日新聞', summary, url};
  } catch (e) {
    clearTimeout(timeoutId);
    console.warn('[DailyFortune] fetchTodayNews error:', e);
    return null;
  }
}
