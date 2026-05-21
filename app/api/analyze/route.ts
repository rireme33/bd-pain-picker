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

const USER_AGENT = "bd-reddit-pain-picker/5.3";

const RESULT_LIMIT = 10;
const AI_CANDIDATE_LIMIT = 12;
const FETCH_TIMEOUT_MS = 9000;
const MIN_KEEP_SCORE = 7;

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
];

const OFF_TARGET_TERMS = [
  "nsfw",
  "adult",
  "porn",
  "xxx",
  "dick",
  "urologist",
  "movie streaming",
  "dating",
  "relationship",
  "loneliness",
  "stabbed in the back",
  "co-founder",
  "cofounder",
  "intern",
  "interview",
  "hr got offended",
  "unpaid internship",
];

const WORKFLOW_TERMS = [
  "manual",
  "spreadsheet",
  "tracking",
  "follow up",
  "follow-up",
  "copy paste",
  "repetitive",
  "workflow",
  "admin",
  "report",
  "reporting",
  "client",
  "lead",
  "leads",
  "ads",
  "campaign",
  "agency",
  "account",
  "updates",
  "status",
  "sop",
  "process",
  "operations",
  "not managing",
  "offline",
  "missed",
  "wasted",
  "hours",
  "page speed",
  "pagespeed",
  "lighthouse",
  "frontend",
  "cleanup",
  "playbook",
];

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
    ? `${clean.slice(0, max - 1)}…`
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

function lowerText(value: string) {
  return normalizeWs(value).toLowerCase();
}

function combinedPostText(post: RawRedditPost) {
  return lowerText(`${post.title} ${post.excerpt}`);
}

function isClearlyOffTarget(text: string) {
  const lower = lowerText(text);

  return OFF_TARGET_TERMS.some((term) =>
    lower.includes(term.toLowerCase())
  );
}

function hasWorkflowSignal(text: string) {
  const lower = lowerText(text);

  return WORKFLOW_TERMS.some((term) =>
    lower.includes(term.toLowerCase())
  );
}

function buildWillInput(post: RawRedditPost, analysis: AiPainAnalysis) {
  const targetUser =
    safeString(analysis.targetUser) ||
    "Solo founders, operators, agencies, or small teams";

  const pain =
    safeString(analysis.pain) ||
    safeString(analysis.workflowFriction) ||
    post.title;

  const workflowFriction =
    safeString(analysis.workflowFriction) || pain;

  const currentBadWorkaround =
    safeString(analysis.currentBadWorkaround) ||
    "Manual checking, spreadsheets, repeated copy-paste, ad-hoc follow-up, or messy reporting.";

  const whyItMatters =
    safeString(analysis.whyItMatters) ||
    "This wastes time, creates missed opportunities, causes mistakes, or makes the workflow hard to scale.";

  const tinyToolDirection =
    safeString(analysis.tinyToolDirection) ||
    "A tiny tool that turns this messy workflow into a repeatable output.";

  return [
    "A workflow friction signal was found.",
    "",
    `Source: r/${post.subreddit} — ${post.title}`,
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

function validateAnalysis(post: RawRedditPost, analysis: AiPainAnalysis) {
  const score =
    typeof analysis.score === "number"
      ? analysis.score
      : Number(analysis.score ?? 0);

  const usable = analysis.usable === true;

  const rejectReason =
    safeString(analysis.rejectReason) || "Weak workflow signal.";

  if (!usable) {
    throw new Error(`Rejected: ${rejectReason}`);
  }

  if (!Number.isFinite(score) || score < MIN_KEEP_SCORE) {
    throw new Error(
      `Rejected: score ${score || 0} below ${MIN_KEEP_SCORE}. ${rejectReason}`
    );
  }

  const targetUser = safeString(analysis.targetUser);
  const workflowFriction = safeString(analysis.workflowFriction);
  const tinyToolDirection = safeString(analysis.tinyToolDirection);

  if (!targetUser || !workflowFriction || !tinyToolDirection) {
    throw new Error(
      "Rejected: missing targetUser, workflowFriction, or tinyToolDirection."
    );
  }

  if (isClearlyOffTarget(combinedPostText(post))) {
    throw new Error("Rejected: off-target topic.");
  }
}

async function analyzePostWithAi(post: RawRedditPost): Promise<PainItem> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.BD_OPENAI_MODEL || "gpt-5.4-nano";

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing.");
  }

  const systemPrompt = [
    "You are BD.",
    "BD finds real workflow friction that can become a tiny AI/no-code tool.",
    "",
    "KEEP only if all are true:",
    "1. A specific user or buyer has a repeated operational problem.",
    "2. The pain involves manual work, tracking, reporting, follow-up, checking, spreadsheets, client/account management, marketing ops, sales ops, creator ops, frontend cleanup, or business admin.",
    "3. There is a bad current workaround.",
    "4. A solo founder could build a narrow first version within one week.",
    "5. The output could become a useful tool, lead magnet, micro SaaS, automation, or paid service.",
    "",
    "REJECT if it is mainly:",
    "- hiring drama",
    "- founder drama",
    "- relationship/life advice",
    "- generic motivation",
    "- adult/NSFW content",
    "- medical/health advice",
    "- pure entertainment",
    "- a simple project showcase with no workflow pain",
    "- a viral story that cannot become a narrow operational tool",
    "",
    "Return JSON only.",
    "Be strict. Weak signals should be rejected.",
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
      score: 0,
      rejectReason: "",
      targetUser: "",
      pain: "",
      workflowFriction: "",
      currentBadWorkaround: "",
      whyItMatters: "",
      tinyToolDirection: "",
    }),
    "",
    "Scoring guide:",
    "9-10 = obvious paid workflow pain with strong tool opportunity.",
    "7-8 = usable workflow friction with a narrow buildable tool.",
    "4-6 = interesting but weak, vague, or not clearly monetizable.",
    "0-3 = off-topic, drama, showcase, entertainment, adult, medical, or not a workflow.",
  ].join("\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 320,
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

  validateAnalysis(post, analysis);

  const pain =
    safeString(analysis.pain) ||
    safeString(analysis.workflowFriction) ||
    post.title;

  const workflowFriction =
    safeString(analysis.workflowFriction) || pain;

  const targetUser =
    safeString(analysis.targetUser) ||
    "Solo founders, operators, agencies, or small teams";

  const currentBadWorkaround =
    safeString(analysis.currentBadWorkaround) ||
    "Manual checking, spreadsheets, repeated copy-paste, ad-hoc follow-up, or messy reporting.";

  const whyItMatters =
    safeString(analysis.whyItMatters) ||
    "This wastes time, creates mistakes, and makes the workflow harder to scale.";

  const tinyToolDirection =
    safeString(analysis.tinyToolDirection) ||
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
      ...analysis,
      targetUser,
      pain,
      workflowFriction,
      currentBadWorkaround,
      whyItMatters,
      tinyToolDirection,
    }),
  };
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

  headers.set("User-Agent", USER_AGENT);
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

async function fetchJson<T>(
  url: string,
  errors: string[]
): Promise<T | null> {
  try {
    const res = await fetchWithTimeout(url);

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

  if (!title || title.length < 12) {
    return null;
  }

  const rawSelftext = normalizeWs(stripHtml(post.selftext ?? ""));

  const excerpt = truncate(
    rawSelftext.length >= 40 ? rawSelftext : title,
    900
  );

  if (!excerpt || excerpt.length < 12) {
    return null;
  }

  const mapped: RawRedditPost = {
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

  const combined = combinedPostText(mapped);

  if (isClearlyOffTarget(combined)) {
    return null;
  }

  if (!hasWorkflowSignal(combined)) {
    return null;
  }

  return mapped;
}

async function fetchRedditUrl(
  url: string,
  errors: string[]
): Promise<RawRedditPost[]> {
  const json = await fetchJson<RedditListing>(url, errors);

  const children = json?.data?.children ?? [];

  return children
    .map((child) => child.data && mapRedditPost(child.data))
    .filter(Boolean) as RawRedditPost[];
}

async function fetchReddit() {
  const errors: string[] = [];

  const subreddits = shuffle(REDDIT_SUBREDDITS).slice(0, 6);
  const queries = shuffle(REDDIT_SEARCH_QUERIES).slice(0, 8);

  const urls: string[] = [];

  for (const subreddit of subreddits) {
    urls.push(`https://www.reddit.com/r/${subreddit}/new.json?limit=20`);
    urls.push(`https://www.reddit.com/r/${subreddit}/top.json?t=week&limit=20`);
  }

  for (const query of queries) {
    urls.push(
      `https://www.reddit.com/search.json?q=${encodeURIComponent(
        query
      )}&sort=new&t=month&limit=20`
    );
  }

  const settled = await Promise.allSettled(
    urls.map((url) => fetchRedditUrl(url, errors))
  );

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

  const analyzed = settled.flatMap((result) => {
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
      "Fetch workflow friction",
      "Show Reddit fetch errors in debug",
      "Reject weak or off-target posts",
      "Analyze limited candidates with AI",
      "Package strong signals for WILL",
    ],
    debug: {
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

    const result = await analyzePostWithAi(post);

    return NextResponse.json({
      item: result,
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