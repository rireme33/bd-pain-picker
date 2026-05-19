import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RawRedditPost = {
  id: string;
  subreddit: string;
  title: string;
  url: string;
  author?: string;
  publishedAt?: string;
  excerpt: string;
  score?: number;
  comments?: number;
};

type PainItem = RawRedditPost & {
  keep: true;
  painQuote: string;
  whoHasPain: string;
  currentBadWorkaround: string;
  whyItHurts: string;
  tinyToolOpportunity: string;
  willInput: string;
  painScore: number;
  urgencyScore: number;
  toolabilityScore: number;
  moneyScore: number;
  totalScore: number;
};

type RejectedItem = RawRedditPost & {
  keep: false;
  rejectReason: string;
};

type AnalyzeResponse = {
  items: PainItem[];
  rejected: [];
  collected_at: string;
  scanned: number;
  kept: number;
  sources: string[];
  pipeline: string[];
  debug: {
    redditFetched: number;
    afterDedupe: number;
    rejected: number;
    errors: string[];
  };
};

const USER_AGENT =
  "bd-reddit-pain-picker/3.0 (+https://example.com; contact: builder@example.com)";

const RESULT_LIMIT = 10;
const FETCH_TIMEOUT_MS = 12_000;

const REDDIT_SUBREDDITS = [
  "Entrepreneur",
  "SideProject",
  "SaaS",
  "smallbusiness",
  "freelance",
  "solopreneur",
  "indiehackers",
  "startups",
  "marketing",
  "automation",
  "ChatGPTPro",
  "ClaudeAI",
  "RealEstateMarketing",
  "Quote_to_Cash",
  "AI_Agents",
  "CreatorsAI",
  "quantfinance",
];

const REDDIT_SEARCH_QUERIES = [
  '"what am I doing wrong" "clients"',
  '"spent" "zero clients"',
  '"not converting" "DMs"',
  '"takes hours" "follow ups"',
  '"follow ups" "forgotten"',
  '"forgotten renewals"',
  '"random charges" "subscriptions"',
  '"manual work" "small business"',
  '"admin work" "second job"',
  '"spreadsheet" "revenue leaks"',
  '"rate limit" "retry logic"',
  '"ChatGPT Projects" "previous topic"',
  '"hard to keep track"',
  '"I wish there was" "tool"',
  '"tired of manually"',
  '"wasting hours" "spreadsheet"',
];

const PAIN_RULES: Array<{ re: RegExp; weight: number }> = [
  { re: /what am i doing wrong/i, weight: 5 },
  { re: /how do you|does anyone know|anyone know/i, weight: 3 },
  { re: /i wish|wish there (was|were)|need a better way/i, weight: 5 },
  { re: /struggl|stuck|confus|overwhelm|frustrat|tired of|hate|annoying|painful|very frustrating/i, weight: 5 },
  { re: /manual|manually|spreadsheet|copy.?paste|repetitive|tedious|takes hours|wasting time|time[- ]consuming|cleanup/i, weight: 5 },
  { re: /lost money|losing money|spent \$?\d|zero clients|no clients|not converting|churn|missed revenue|revenue leak|opportunity cost/i, weight: 6 },
  { re: /forgot|forgetting|forgotten|missed|late|failed to|locked out|bug|rate limit|hammering the endpoint|broke|breaks/i, weight: 5 },
  { re: /random charges|bank statement|subscription fatigue|recurring charges/i, weight: 6 },
  { re: /previous topic|stale context|over-anchors|over anchors|stuck on/i, weight: 6 },
  { re: /hard to|difficult to|can't|cannot|don.t know|no idea/i, weight: 3 },
  { re: /hundreds of hours|six months|3am|2:17am|six- to seven-figures|\$10k|\$40k/i, weight: 4 },
];

const TOOLABLE_REGEX =
  /track|check|audit|analy[sz]e|compare|remind|alert|monitor|reply|follow.?up|convert|summari[sz]e|score|diagnos|extract|spreadsheet|workflow|automation|api|rate limit|subscription|dm|email|proposal|quote|booking|viewing|billing|invoice|onboarding|context|dashboard|parser|crm|lead|renewal/i;

const MONEY_REGEX =
  /client|customer|revenue|sales|ads?|lead|conversion|paid|pricing|subscription|invoice|proposal|agency|freelance|business|mrr|arr|\$\s?\d|commission|billing|renewal|fundraising|investor|vc|costs?|savings/i;

const SOLUTION_ONLY_QUOTE_REGEX = [
  /^works in any app/i,
  /^i built/i,
  /^i launched/i,
  /^here'?s what has changed/i,
  /^you just manually add/i,
  /^right now,? i am mainly focused/i,
  /^lately,? i.?ve been seeing more businesses hire/i,
  /^the app covers/i,
  /^has anyone here worked with ai consultants/i,
  /what other ai workflows are we treating as generic/i,
  /you can build a full product/i,
];

const PROMO_OR_NOISE_TITLE_REGEX = [
  /prompt of the day/i,
  /100 tips/i,
  /certification|passed claude/i,
  /i love reading/i,
];

function normalizeWs(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function stripHtml(s: string) {
  return normalizeWs(
    s
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
  );
}

function truncate(s: string, max = 900) {
  const clean = normalizeWs(s);
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function toIso(seconds?: number) {
  return seconds ? new Date(seconds * 1000).toISOString() : undefined;
}

function splitSentences(text: string) {
  const clean = stripHtml(text)
    .replace(/\s+-\s+/g, ". ")
    .replace(/\s+\*\s+/g, ". ")
    .replace(/\s+\d+\.\s+/g, ". ");
  if (!clean) return [];

  const rough = clean
    .split(/(?<=[.!?])\s+|\n+|\s{2,}/g)
    .map((s) => normalizeWs(s))
    .filter(Boolean);

  const chunks: string[] = [];
  for (const sentence of rough) {
    if (sentence.length <= 340) {
      chunks.push(sentence);
      continue;
    }
    const parts = sentence.split(/,|;|\s+-\s+/g).map((s) => normalizeWs(s));
    chunks.push(...parts.filter((s) => s.length > 20));
  }

  return chunks.filter(Boolean).slice(0, 30);
}

function sentencePainScore(sentence: string) {
  const s = sentence.trim();
  if (SOLUTION_ONLY_QUOTE_REGEX.some((re) => re.test(s))) return 0;
  if (s.length > 360) return 0;

  let score = 0;
  for (const rule of PAIN_RULES) {
    if (rule.re.test(s)) score += rule.weight;
  }

  if (/\b(i|we|our|my|they|people|founder|agency|agents|business|staff|teams|creators|lawyers)\b/i.test(s)) score += 1;
  if (TOOLABLE_REGEX.test(s)) score += 1;
  if (MONEY_REGEX.test(s)) score += 1;

  return score;
}

function findPainQuote(title: string, excerpt: string) {
  const candidates = [...splitSentences(title), ...splitSentences(excerpt)];
  const scored = candidates
    .map((sentence) => ({ sentence: truncate(sentence, 280), score: sentencePainScore(sentence) }))
    .filter((item) => item.score >= 5)
    .sort((a, b) => b.score - a.score);

  return scored[0] ?? null;
}

function calculateScores(text: string, quoteScore: number) {
  const urgencyBase = /urgent|today|now|zero clients|lost money|spent \$?\d|broke|failed|rate limit|forgot|missed|stuck|takes hours|leak|3am|2:17am/i.test(text)
    ? 7
    : /manual|wasting time|hard to|confus|not converting|subscription|repetitive|annoying/i.test(text)
      ? 6
      : 4;

  const painScore = Math.min(10, Math.max(6, quoteScore));
  const urgencyScore = Math.min(10, urgencyBase);
  const toolabilityScore = Math.min(10, TOOLABLE_REGEX.test(text) ? 8 : 6);
  const moneyScore = Math.min(10, MONEY_REGEX.test(text) ? 8 : 5);
  const totalScore = Math.round((painScore * 0.42 + urgencyScore * 0.16 + toolabilityScore * 0.26 + moneyScore * 0.16) * 10) / 10;

  return { painScore, urgencyScore, toolabilityScore, moneyScore, totalScore };
}

function isLikelyPromoNoise(post: RawRedditPost, painQuote: string) {
  if (SOLUTION_ONLY_QUOTE_REGEX.some((re) => re.test(painQuote.trim()))) return true;
  if (PROMO_OR_NOISE_TITLE_REGEX.some((re) => re.test(post.title))) return true;
  return false;
}

function buildWillInput(post: RawRedditPost, painQuote: string) {
  return [
    "A real Reddit pain signal was found.",
    "",
    `Source: r/${post.subreddit} — ${post.title}`,
    `URL: ${post.url}`,
    "",
    `Pain quote: "${painQuote}"`,
    "",
    "Original excerpt:",
    post.excerpt,
    "",
    "Turn this into one Codex-ready tiny web app prompt.",
    "Your job:",
    "- Identify the buyer from the quote and excerpt.",
    "- Identify the current bad workaround.",
    "- Identify why the pain matters.",
    "- Propose one tiny web tool that directly reduces this pain.",
    "- Do not generate generic startup ideas.",
    "- Do not build BD or WILL. Build the actual tool implied by this pain.",
  ].join("\n");
}

function reject(post: RawRedditPost, rejectReason: string): RejectedItem {
  return { ...post, keep: false, rejectReason };
}

function analyzePost(post: RawRedditPost): PainItem | RejectedItem {
  const text = `${post.title}. ${post.excerpt}`;
  const pain = findPainQuote(post.title, post.excerpt);

  if (!pain) return reject(post, "No explicit pain quote found. BD does not invent pain.");
  if (isLikelyPromoNoise(post, pain.sentence)) return reject(post, "Pain quote is too promotional, generic, or solution-only.");
  if (!TOOLABLE_REGEX.test(`${pain.sentence} ${text}`)) return reject(post, "Pain exists, but the tiny web-tool angle is weak.");

  const scores = calculateScores(text, pain.score);
  if (scores.totalScore < 6.8 || scores.painScore < 6 || scores.toolabilityScore < 7) {
    return reject(post, "Pain is too soft for WILL. Needs stronger repeated workflow friction.");
  }

  const willInput = buildWillInput(post, pain.sentence);

  return {
    ...post,
    keep: true,
    painQuote: pain.sentence,
    whoHasPain: "Let WILL infer this from the quote and excerpt.",
    currentBadWorkaround: "Let WILL infer this from the quote and excerpt.",
    whyItHurts: "Let WILL infer this from the quote and excerpt.",
    tinyToolOpportunity: "Let WILL generate the tool direction.",
    willInput,
    ...scores,
  };
}

function dedupeByTitle<T extends { title: string }>(items: T[]) {
  const seen = new Set<string>();
  const out: T[] = [];

  for (const item of items) {
    const key = normalizeWs(item.title.toLowerCase()).replace(/[^a-z0-9]+/g, " ");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

function dedupeByPainQuote(items: PainItem[]) {
  const seen = new Set<string>();
  const out: PainItem[] = [];

  for (const item of items) {
    const quoteKey = normalizeWs(item.painQuote.toLowerCase()).replace(/[^a-z0-9]+/g, " ").slice(0, 110);
    if (seen.has(quoteKey)) continue;
    seen.add(quoteKey);
    out.push(item);
  }

  return out;
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function fetchWithTimeout(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json,text/plain,*/*",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

type RedditPostData = {
  id?: string;
  subreddit?: string;
  title?: string;
  selftext?: string;
  permalink?: string;
  url?: string;
  author?: string;
  created_utc?: number;
  score?: number;
  num_comments?: number;
};

type RedditListing = {
  data?: {
    children?: Array<{
      data?: RedditPostData;
    }>;
  };
};

function mapRedditPost(post: RedditPostData): RawRedditPost | null {
  const title = normalizeWs(post.title ?? "");
  const excerpt = truncate(normalizeWs(stripHtml(post.selftext ?? "")), 900);

  if (!title || title.length < 12) return null;
  if (!excerpt || excerpt.length < 40) return null;

  const permalink = post.permalink ? `https://www.reddit.com${post.permalink}` : post.url ?? "https://www.reddit.com/";

  return {
    id: `reddit-${post.id ?? Math.random().toString(36).slice(2)}`,
    subreddit: post.subreddit ?? "unknown",
    title,
    url: permalink,
    author: post.author,
    publishedAt: toIso(post.created_utc),
    excerpt,
    score: typeof post.score === "number" ? post.score : undefined,
    comments: typeof post.num_comments === "number" ? post.num_comments : undefined,
  };
}

async function fetchRedditUrl(url: string): Promise<RawRedditPost[]> {
  const json = await fetchJson<RedditListing>(url);
  const children = json?.data?.children ?? [];
  return children.map((child) => child.data && mapRedditPost(child.data)).filter((item): item is RawRedditPost => Boolean(item));
}

async function fetchReddit(): Promise<{ posts: RawRedditPost[]; errors: string[] }> {
  const errors: string[] = [];
  const subreddits = shuffle(REDDIT_SUBREDDITS).slice(0, 7);
  const queries = shuffle(REDDIT_SEARCH_QUERIES).slice(0, 10);
  const urls: string[] = [];

  for (const subreddit of subreddits) {
    urls.push(`https://www.reddit.com/r/${subreddit}/new.json?limit=20`);
    urls.push(`https://www.reddit.com/r/${subreddit}/top.json?t=week&limit=20`);
  }

  for (const query of queries) {
    urls.push(`https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=new&t=month&limit=20`);
  }

  const settled = await Promise.allSettled(urls.map(fetchRedditUrl));
  const posts = settled.flatMap((result, index) => {
    if (result.status === "rejected") {
      errors.push(`Reddit fetch failed: ${urls[index]}`);
      return [];
    }
    return result.value;
  });

  return { posts, errors };
}

async function collectRedditPain(): Promise<AnalyzeResponse> {
  const { posts, errors } = await fetchReddit();
  const deduped = dedupeByTitle(posts);
  const analyzed = deduped.map(analyzePost);
  const allKept = analyzed.filter((item): item is PainItem => item.keep);
  const items = dedupeByPainQuote(allKept)
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, RESULT_LIMIT);

  return {
    items,
    rejected: [],
    collected_at: new Date().toISOString(),
    scanned: deduped.length,
    kept: items.length,
    sources: ["Reddit"],
    pipeline: [
      "Fetch fresh Reddit pain queries",
      "Find an explicit pain quote",
      "Reject promo/noise/solution-only posts",
      "Return only the 10 strongest pain signals",
      "Let WILL infer buyer, bad workaround, why it hurts, and tiny tool direction",
    ],
    debug: {
      redditFetched: posts.length,
      afterDedupe: deduped.length,
      rejected: analyzed.length - allKept.length,
      errors,
    },
  };
}

export async function GET() {
  try {
    return NextResponse.json(await collectRedditPain());
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Failed to collect Reddit pain signals.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      title?: string;
      text?: string;
      url?: string;
      subreddit?: string;
    };

    const post: RawRedditPost = {
      id: "manual-input",
      subreddit: body.subreddit?.trim() || "manual",
      title: body.title?.trim() || "Manual pasted signal",
      url: body.url?.trim() || "manual-input",
      excerpt: body.text?.trim() || "",
      publishedAt: new Date().toISOString(),
    };

    if (post.excerpt.length < 20) {
      return NextResponse.json({ message: "Paste more source text before analyzing." }, { status: 400 });
    }

    const result = analyzePost(post);
    return NextResponse.json({ item: result, collected_at: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Failed to analyze pasted signal.",
      },
      { status: 500 }
    );
  }
}
