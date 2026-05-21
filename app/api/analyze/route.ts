import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    redditAuthEnabled: boolean;
    redditFetched: number;
    afterDedupe: number;
    aiCandidates: number;
    rejected: number;
    errors: string[];
  };
};

type AiPainAnalysis = {
  usable?: boolean;
  score?: number;
  rejectReason?: string;
  targetUser?: string;
  pain?: string;
  workflowFriction?: string;
  currentBadWorkaround?: string;
  whyItMatters?: string;
  tinyToolDirection?: string;
};

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

const FALLBACK_USER_AGENT = "bd-reddit-pain-picker/5.4";

const RESULT_LIMIT = 10;
const AI_CANDIDATE_LIMIT = 12;
const FETCH_TIMEOUT_MS = 9000;
const REDDIT_SUBREDDIT_LIMIT = 4;
const REDDIT_SEARCH_LIMIT = 4;

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
  "CreatorsAI",
];

const REDDIT_SEARCH_QUERIES = [
  '"manual work"',
  '"spreadsheet"',
  '"follow up"',
  '"takes hours"',
  '"copy paste"',
  '"repetitive"',
  '"workflow"',
  '"tracking"',
  '"admin work"',
  '"hard to keep track"',
  '"I manually"',
  '"wasting hours"',
  '"reporting"',
  '"client updates"',
  '"lead tracking"',
  '"missed follow ups"',
  '"agency"',
  '"ads offline"',
  '"no one noticed"',
  '"pagespeed"',
  '"lighthouse"',
  '"frontend cleanup"',
  '"playbook"',
];

let redditTokenCache:
  | {
      accessToken: string;
      expiresAt: number;
    }
  | null = null;

function normalizeWs(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stripHtml(value: string) {
  return normalizeWs(
    value
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
  );
}

function truncate(value: string, max = 900) {
  const clean = normalizeWs(value);

  return clean.length > max
    ? `${clean.slice(0, max - 1)}...`
    : clean;
}

function toIso(seconds?: number) {
  return seconds
    ? new Date(seconds * 1000).toISOString()
    : undefined;
}

function safeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function buildFallbackAnalysis(post: RawRedditPost): AiPainAnalysis {
  return {
    usable: true,
    score: 7,
    rejectReason: "",
    targetUser:
      "Solo founders, operators, marketers, agencies, creators, or small teams",
    pain:
      post.title ||
      "A repeated business workflow is hard to turn into a clear action.",
    workflowFriction:
      post.excerpt ||
      post.title ||
      "The user is dealing with a messy workflow that needs to be clarified and turned into a repeatable process.",
    currentBadWorkaround:
      "They handle it manually with repeated checking, scattered notes, copy-paste, spreadsheets, ad-hoc replies, or one-off AI chats.",
    whyItMatters:
      "This wastes time, creates missed opportunities, and makes it hard to turn the signal into a useful product or repeatable workflow.",
    tinyToolDirection:
      "A tiny tool that turns the messy source material into a structured workflow brief, reusable checklist, and WILL-ready input.",
  };
}

function normalizeAnalysis(post: RawRedditPost, analysis: AiPainAnalysis) {
  const fallback = buildFallbackAnalysis(post);

  analysis.usable = true;

  if (
    typeof analysis.score !== "number" ||
    !Number.isFinite(analysis.score)
  ) {
    analysis.score = 7;
  }

  analysis.targetUser =
    safeString(analysis.targetUser) ||
    fallback.targetUser;

  analysis.pain =
    safeString(analysis.pain) ||
    safeString(analysis.workflowFriction) ||
    fallback.pain;

  analysis.workflowFriction =
    safeString(analysis.workflowFriction) ||
    safeString(analysis.pain) ||
    fallback.workflowFriction;

  analysis.currentBadWorkaround =
    safeString(analysis.currentBadWorkaround) ||
    fallback.currentBadWorkaround;

  analysis.whyItMatters =
    safeString(analysis.whyItMatters) ||
    fallback.whyItMatters;

  analysis.tinyToolDirection =
    safeString(analysis.tinyToolDirection) ||
    fallback.tinyToolDirection;

  return analysis;
}

function buildWillInput(post: RawRedditPost, analysis: AiPainAnalysis) {
  const normalized = normalizeAnalysis(post, analysis);

  const targetUser =
    safeString(normalized.targetUser) ||
    "Solo founders, operators, agencies, or small teams";

  const pain =
    safeString(normalized.pain) ||
    safeString(normalized.workflowFriction) ||
    post.title;

  const workflowFriction =
    safeString(normalized.workflowFriction) || pain;

  const currentBadWorkaround =
    safeString(normalized.currentBadWorkaround) ||
    "Manual checking, spreadsheets, repeated copy-paste, ad-hoc follow-up, or messy reporting.";

  const whyItMatters =
    safeString(normalized.whyItMatters) ||
    "This wastes time, creates missed opportunities, causes mistakes, or makes the workflow hard to scale.";

  const tinyToolDirection =
    safeString(normalized.tinyToolDirection) ||
    "A tiny tool that turns this messy workflow into a repeatable output.";

  return [
    "A workflow friction signal was found.",
    "",
    `Source: r/${post.subreddit} - ${post.title}`,
    `URL: ${post.url}`,
    "",
    `Target user: ${targetUser}`,
    `Pain: ${pain}`,
    `Workflow friction: ${workflowFriction}`,
    `Current bad workaround: ${currentBadWorkaround}`,
    `Why it matters: ${whyItMatters}`,
    `Tiny tool direction: ${tinyToolDirection}`,
    "",
    "Original source:",
    post.excerpt,
    "",
    "Turn this into one tiny AI/no-code tool.",
    "- Keep it narrow.",
    "- Reduce manual work.",
    "- Make it fast to build.",
    "- Make the first version useful for a solo founder this week.",
  ].join("\n");
}

function extractJsonObject(text: string) {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end === -1) {
    throw new Error("AI did not return JSON.");
  }

  return JSON.parse(cleaned.slice(start, end + 1)) as AiPainAnalysis;
}

function toPainItem(post: RawRedditPost, analysis: AiPainAnalysis): PainItem {
  const normalized = normalizeAnalysis(post, analysis);

  const pain =
    safeString(normalized.pain) ||
    safeString(normalized.workflowFriction) ||
    post.title;

  const workflowFriction =
    safeString(normalized.workflowFriction) || pain;

  const targetUser =
    safeString(normalized.targetUser) ||
    "Solo founders, operators, agencies, creators, or small teams";

  const currentBadWorkaround =
    safeString(normalized.currentBadWorkaround) ||
    "Manual checking, spreadsheets, repeated copy-paste, ad-hoc follow-up, or messy reporting.";

  const whyItMatters =
    safeString(normalized.whyItMatters) ||
    "This wastes time, creates mistakes, and makes the workflow harder to scale.";

  const tinyToolDirection =
    safeString(normalized.tinyToolDirection) ||
    "A tiny tool that turns this messy workflow into one repeatable output.";

  return {
    ...post,
    keep: true,
    painQuote: workflowFriction,
    whoHasPain: targetUser,
    currentBadWorkaround,
    whyItHurts: whyItMatters,
    tinyToolOpportunity: tinyToolDirection,
    willInput: buildWillInput(post, {
      ...normalized,
      targetUser,
      pain,
      workflowFriction,
      currentBadWorkaround,
      whyItMatters,
      tinyToolDirection,
    }),
  };
}

async function analyzePostWithAi(post: RawRedditPost): Promise<PainItem> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.BD_OPENAI_MODEL || "gpt-5.4-nano";

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing.");
  }

  const systemPrompt = [
    "You are BD.",
    "BD turns messy market signals into workflow-friction briefs for tiny AI/no-code tools.",
    "",
    "Do not be too strict.",
    "Your job is not to reject most posts.",
    "Your job is to extract the most buildable workflow, even if the source is messy.",
    "",
    "Prefer signals involving:",
    "- manual work",
    "- repeated checking",
    "- tracking",
    "- reporting",
    "- follow-up",
    "- marketing ops",
    "- sales ops",
    "- creator ops",
    "- frontend cleanup",
    "- PageSpeed/Lighthouse cleanup",
    "- project discovery",
    "- user acquisition",
    "- agency/client accountability",
    "- messy comments or scattered data",
    "",
    "Return JSON only.",
  ].join("\n");

  const userPrompt = [
    `Title: ${post.title}`,
    `Subreddit: ${post.subreddit}`,
    `URL: ${post.url}`,
    "",
    "Source text:",
    post.excerpt,
    "",
    "Return JSON in this exact shape:",
    JSON.stringify({
      usable: true,
      score: 7,
      rejectReason: "",
      targetUser: "",
      pain: "",
      workflowFriction: "",
      currentBadWorkaround: "",
      whyItMatters: "",
      tinyToolDirection: "",
    }),
    "",
    "Rules:",
    "- Set usable=true unless the source is completely impossible to convert.",
    "- If the source is weak, still extract a narrow workflow angle.",
    "- Keep every field short and concrete.",
    "- Make tinyToolDirection specific enough to build this week.",
  ].join("\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 360,
      response_format: {
        type: "json_object",
      },
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`OpenAI failed: ${res.status} ${detail}`);
  }

  const json = await res.json();
  const content = json.choices?.[0]?.message?.content || "";
  const analysis = extractJsonObject(content);

  return toPainItem(post, analysis);
}

function dedupeByTitle<T extends { title: string }>(items: T[]) {
  const seen = new Set<string>();
  const out: T[] = [];

  for (const item of items) {
    const key = normalizeWs(
      String(item.title || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
    );

    if (!key) continue;
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(item);
  }

  return out;
}

function dedupeByPainQuote(items: PainItem[]) {
  const seen = new Set<string>();
  const out: PainItem[] = [];

  for (const item of items) {
    const key = normalizeWs(
      String(item.painQuote || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
    );

    if (!key) continue;
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(item);
  }

  return out;
}

function shuffle<T>(items: T[]) {
  const copy = [...items];

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}

async function fetchWithTimeout(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  const headers = new Headers(init?.headers);
  headers.set(
    "User-Agent",
    process.env.REDDIT_USER_AGENT || FALLBACK_USER_AGENT
  );
  headers.set("Accept", "application/json,text/plain,*/*");

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeout);
  }
}

function getRedditOAuthConfig() {
  const clientId = process.env.REDDIT_CLIENT_ID?.trim();
  const clientSecret = process.env.REDDIT_CLIENT_SECRET?.trim();
  const userAgent =
    process.env.REDDIT_USER_AGENT?.trim() || FALLBACK_USER_AGENT;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Reddit OAuth env vars are missing. Add REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET in Vercel."
    );
  }

  return { clientId, clientSecret, userAgent };
}

async function getRedditAccessToken() {
  const now = Date.now();

  if (
    redditTokenCache?.accessToken &&
    redditTokenCache.expiresAt > now
  ) {
    return redditTokenCache.accessToken;
  }

  const { clientId, clientSecret, userAgent } =
    getRedditOAuthConfig();

  const credentials = Buffer.from(
    `${clientId}:${clientSecret}`
  ).toString("base64");

  const res = await fetchWithTimeout(
    "https://www.reddit.com/api/v1/access_token",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": userAgent,
      },
      body: "grant_type=client_credentials",
    }
  );

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(
      `Reddit OAuth failed: ${res.status} ${detail}`
    );
  }

  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };

  if (!json.access_token) {
    throw new Error("Reddit OAuth did not return an access token.");
  }

  const expiresInMs =
    Math.max(60, json.expires_in ?? 3600) * 1000;

  redditTokenCache = {
    accessToken: json.access_token,
    expiresAt: now + expiresInMs - 60_000,
  };

  return json.access_token;
}

async function fetchJson<T>(
  url: string,
  errors: string[],
  headers?: HeadersInit
): Promise<T | null> {
  try {
    const res = await fetchWithTimeout(url, { headers });

    if (!res.ok) {
      errors.push(`Reddit returned ${res.status}: ${url}`);
      return null;
    }

    return (await res.json()) as T;
  } catch (error) {
    errors.push(
      error instanceof Error
        ? `Reddit fetch error: ${error.message} | ${url}`
        : `Reddit fetch error: ${url}`
    );

    return null;
  }
}

function mapRedditPost(post: RedditPostData): RawRedditPost | null {
  const title = normalizeWs(post.title ?? "");

  if (!title || title.length < 8) {
    return null;
  }

  const rawSelftext = normalizeWs(stripHtml(post.selftext ?? ""));

  const excerpt = truncate(
    rawSelftext.length >= 20 ? rawSelftext : title,
    900
  );

  if (!excerpt || excerpt.length < 8) {
    return null;
  }

  return {
    id: post.id
      ? `reddit-${post.id}`
      : Math.random().toString(36).slice(2),

    subreddit: post.subreddit || "unknown",

    title,

    url: post.permalink
      ? `https://www.reddit.com${post.permalink}`
      : post.url || "https://www.reddit.com/",

    author: post.author,

    publishedAt: toIso(post.created_utc),

    excerpt,

    score: post.score,

    comments: post.num_comments,
  };
}

async function fetchRedditUrl(
  url: string,
  accessToken: string,
  errors: string[]
): Promise<RawRedditPost[]> {
  const json = await fetchJson<RedditListing>(url, errors, {
    Authorization: `Bearer ${accessToken}`,
  });
  const children = json?.data?.children ?? [];

  return children
    .map((child) => child.data && mapRedditPost(child.data))
    .filter(Boolean) as RawRedditPost[];
}

async function fetchReddit() {
  const errors: string[] = [];
  const accessToken = await getRedditAccessToken();

  const subreddits = shuffle(REDDIT_SUBREDDITS).slice(
    0,
    REDDIT_SUBREDDIT_LIMIT
  );
  const queries = shuffle(REDDIT_SEARCH_QUERIES).slice(
    0,
    REDDIT_SEARCH_LIMIT
  );

  const urls: string[] = [];

  for (const subreddit of subreddits) {
    urls.push(
      `https://oauth.reddit.com/r/${subreddit}/new?limit=20&raw_json=1`
    );
    urls.push(
      `https://oauth.reddit.com/r/${subreddit}/top?t=week&limit=20&raw_json=1`
    );
  }

  for (const query of queries) {
    urls.push(
      `https://oauth.reddit.com/search?q=${encodeURIComponent(
        query
      )}&sort=new&t=month&limit=20&raw_json=1`
    );
  }

  const posts: RawRedditPost[] = [];

  for (const url of urls) {
    posts.push(...(await fetchRedditUrl(url, accessToken, errors)));
  }

  return { posts, errors };
}

async function collectRedditPain(): Promise<AnalyzeResponse> {
  const { posts, errors } = await fetchReddit();

  const deduped = dedupeByTitle(posts);

  const candidates = [...deduped]
    .sort((a, b) => {
      const aComments = a.comments || 0;
      const bComments = b.comments || 0;
      return bComments - aComments;
    })
    .slice(0, AI_CANDIDATE_LIMIT);

  if (candidates.length > 0 && !process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing.");
  }

  const settled = await Promise.allSettled(
    candidates.map(analyzePostWithAi)
  );

  let analyzed = settled.flatMap((result) => {
    if (result.status === "fulfilled") {
      return [result.value];
    }

    errors.push(
      result.reason instanceof Error
        ? result.reason.message
        : "AI analysis failed."
    );

    return [];
  });

  if (analyzed.length === 0 && candidates.length > 0) {
    errors.push("AI produced no cards. Fallback cards were used.");

    analyzed = candidates
      .slice(0, RESULT_LIMIT)
      .map((post) => toPainItem(post, buildFallbackAnalysis(post)));
  }

  const items = dedupeByPainQuote(analyzed)
    .sort((a, b) => {
      const aComments = a.comments || 0;
      const bComments = b.comments || 0;
      return bComments - aComments;
    })
    .slice(0, RESULT_LIMIT);

  return {
    items,
    rejected: [],
    collected_at: new Date().toISOString(),
    scanned: deduped.length,
    kept: items.length,
    sources: ["Reddit"],
    pipeline: [
      "Fetch Reddit signals",
      "Keep candidates loosely",
      "Analyze limited candidates with AI",
      "Use fallback cards if AI produces nothing",
      "Package results for WILL",
    ],
    debug: {
      redditAuthEnabled: true,
      redditFetched: posts.length,
      afterDedupe: deduped.length,
      aiCandidates: candidates.length,
      rejected: Math.max(0, candidates.length - analyzed.length),
      errors,
    },
  };
}

export async function GET() {
  try {
    const result = await collectRedditPain();

    console.log("BD GET /api/analyze result:", {
      redditFetched: result.debug.redditFetched,
      afterDedupe: result.debug.afterDedupe,
      aiCandidates: result.debug.aiCandidates,
      kept: result.kept,
      errors: result.debug.errors.slice(0, 5),
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("BD GET /api/analyze failed:", error);

    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Failed to collect Reddit signals.",
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
      input?: string;
      content?: string;
      url?: string;
      subreddit?: string;
    };

    const sourceText =
      body.text?.trim() ||
      body.input?.trim() ||
      body.content?.trim() ||
      "";

    const post: RawRedditPost = {
      id: "manual-input",
      subreddit: body.subreddit?.trim() || "manual",
      title: body.title?.trim() || "Manual pasted signal",
      url: body.url?.trim() || "manual-input",
      excerpt: sourceText,
      publishedAt: new Date().toISOString(),
    };

    if (post.excerpt.length < 20) {
      return NextResponse.json(
        {
          message: "Paste more source text.",
        },
        { status: 400 }
      );
    }

    let item: PainItem;

    try {
      item = await analyzePostWithAi(post);
    } catch (error) {
      console.error("BD POST AI failed. Fallback item used:", error);
      item = toPainItem(post, buildFallbackAnalysis(post));
    }

    return NextResponse.json({
      item,
      collected_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("BD POST /api/analyze failed:", error);

    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Failed to analyze signal.",
      },
      { status: 500 }
    );
  }
}
