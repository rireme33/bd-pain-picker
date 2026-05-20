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
  "bd-reddit-pain-picker/5.0";

const RESULT_LIMIT = 10;
const FETCH_TIMEOUT_MS = 12000;

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
  "Quote_to_Cash",
];

const REDDIT_SEARCH_QUERIES = [
  '"manual work"',
  '"spreadsheet"',
  '"follow up"',
  '"forgotten"',
  '"takes hours"',
  '"copy paste"',
  '"repetitive"',
  '"workflow"',
  '"tracking"',
  '"admin work"',
  '"we built an internal tool"',
  '"hard to keep track"',
  '"I manually"',
  '"wasting hours"',
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

  return clean.length > max
    ? `${clean.slice(0, max - 1)}…`
    : clean;
}

function toIso(seconds?: number) {
  return seconds
    ? new Date(seconds * 1000).toISOString()
    : undefined;
}

type AiPainAnalysis = {
  usable: boolean;
  targetUser: string;
  pain: string;
  workflowFriction: string;
  currentBadWorkaround: string;
  whyItMatters: string;
  tinyToolDirection: string;
};

function buildWillInput(
  post: RawRedditPost,
  analysis: AiPainAnalysis
) {
  return [
    "A workflow friction signal was found.",
    "",
    `Source: r/${post.subreddit} — ${post.title}`,
    `URL: ${post.url}`,
    "",
    `Target user: ${analysis.targetUser}`,
    `Pain: ${analysis.pain}`,
    `Workflow friction: ${analysis.workflowFriction}`,
    `Current bad workaround: ${analysis.currentBadWorkaround}`,
    `Why it matters: ${analysis.whyItMatters}`,
    `Tiny tool direction: ${analysis.tinyToolDirection}`,
    "",
    "Original source:",
    post.excerpt,
    "",
    "Turn this into one tiny AI/no-code tool.",
    "- Keep it narrow.",
    "- Reduce manual work.",
    "- Make it fast to build.",
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

  return JSON.parse(
    cleaned.slice(start, end + 1)
  ) as AiPainAnalysis;
}

async function analyzePostWithAi(
  post: RawRedditPost
): Promise<PainItem> {
  const apiKey = process.env.OPENAI_API_KEY;

  const model =
    process.env.BD_OPENAI_MODEL ||
    "gpt-5.4-nano";

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is missing."
    );
  }

  const systemPrompt = [
    "You are BD.",
    "Find workflow friction.",
    "Find repeated manual work.",
    "Find spreadsheet workflows.",
    "Find repetitive operations.",
    "Do NOT reject weak signals.",
    "Return short JSON only.",
  ].join("\n");

  const userPrompt = [
    `Title: ${post.title}`,
    `Subreddit: ${post.subreddit}`,
    "",
    post.excerpt,
    "",
    "Return JSON:",
    JSON.stringify({
      usable: true,
      targetUser: "",
      pain: "",
      workflowFriction: "",
      currentBadWorkaround: "",
      whyItMatters: "",
      tinyToolDirection: "",
    }),
  ].join("\n");

  const res = await fetch(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 220,
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
    }
  );

  if (!res.ok) {
    const detail = await res.text();

    throw new Error(
      `OpenAI failed: ${res.status} ${detail}`
    );
  }

  const json = await res.json();

  const content =
    json.choices?.[0]?.message
      ?.content || "";

  const analysis =
    extractJsonObject(content);

  return {
    ...post,
    keep: true,
    painQuote:
      String(
        analysis.workflowFriction ||
          analysis.pain ||
          post.title
      ) || "",

    whoHasPain:
      analysis.targetUser || "",

    currentBadWorkaround:
      analysis.currentBadWorkaround ||
      "",

    whyItHurts:
      analysis.whyItMatters || "",

    tinyToolOpportunity:
      analysis.tinyToolDirection ||
      "",

    willInput: buildWillInput(
      post,
      analysis
    ),
  };
}

function dedupeByTitle<
  T extends { title: string }
>(items: T[]) {
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

function dedupeByPainQuote(
  items: PainItem[]
) {
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

  for (
    let i = copy.length - 1;
    i > 0;
    i--
  ) {
    const j = Math.floor(
      Math.random() * (i + 1)
    );

    [copy[i], copy[j]] = [
      copy[j],
      copy[i],
    ];
  }

  return copy;
}

async function fetchWithTimeout(
  url: string,
  init?: RequestInit
) {
  const controller =
    new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    FETCH_TIMEOUT_MS
  );

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "application/json,text/plain,*/*",
      },
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson<T>(
  url: string
): Promise<T | null> {
  try {
    const res = await fetchWithTimeout(
      url
    );

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

function mapRedditPost(
  post: RedditPostData
): RawRedditPost | null {
  const title = normalizeWs(
    post.title ?? ""
  );

  const excerpt = truncate(
    normalizeWs(
      stripHtml(post.selftext ?? "")
    ),
    900
  );

  if (!title || title.length < 12)
    return null;

  if (!excerpt || excerpt.length < 40)
    return null;

  const permalink = post.permalink
    ? `https://www.reddit.com${post.permalink}`
    : post.url ??
      "https://www.reddit.com/";

  return {
    id:
      `reddit-${post.id}` ||
      Math.random()
        .toString(36)
        .slice(2),

    subreddit:
      post.subreddit || "unknown",

    title,

    url: permalink,

    author: post.author,

    publishedAt: toIso(
      post.created_utc
    ),

    excerpt,

    score: post.score,

    comments: post.num_comments,
  };
}

async function fetchRedditUrl(
  url: string
): Promise<RawRedditPost[]> {
  const json =
    await fetchJson<RedditListing>(
      url
    );

  const children =
    json?.data?.children ?? [];

  return children
    .map(
      (child) =>
        child.data &&
        mapRedditPost(child.data)
    )
    .filter(Boolean) as RawRedditPost[];
}

async function fetchReddit() {
  const errors: string[] = [];

  const subreddits = shuffle(
    REDDIT_SUBREDDITS
  ).slice(0, 7);

  const queries = shuffle(
    REDDIT_SEARCH_QUERIES
  ).slice(0, 8);

  const urls: string[] = [];

  for (const subreddit of subreddits) {
    urls.push(
      `https://www.reddit.com/r/${subreddit}/new.json?limit=20`
    );

    urls.push(
      `https://www.reddit.com/r/${subreddit}/top.json?t=week&limit=20`
    );
  }

  for (const query of queries) {
    urls.push(
      `https://www.reddit.com/search.json?q=${encodeURIComponent(
        query
      )}&sort=new&t=month&limit=20`
    );
  }

  const settled =
    await Promise.allSettled(
      urls.map(fetchRedditUrl)
    );

  const posts = settled.flatMap(
    (result, index) => {
      if (
        result.status === "rejected"
      ) {
        errors.push(
          `Reddit fetch failed: ${urls[index]}`
        );

        return [];
      }

      return result.value;
    }
  );

  return { posts, errors };
}

async function collectRedditPain(): Promise<AnalyzeResponse> {
  const { posts, errors } =
    await fetchReddit();

  const deduped =
    dedupeByTitle(posts);

  const analyzed =
    await Promise.all(
      deduped.map(analyzePostWithAi)
    );

  const items =
    dedupeByPainQuote(analyzed)
      .sort((a, b) => {
        const aComments =
          a.comments || 0;

        const bComments =
          b.comments || 0;

        return (
          bComments - aComments
        );
      })
      .slice(0, RESULT_LIMIT);

  return {
    items,
    rejected: [],
    collected_at:
      new Date().toISOString(),
    scanned: deduped.length,
    kept: items.length,
    sources: ["Reddit"],
    pipeline: [
      "Fetch workflow friction",
      "Find repeated manual work",
      "Package it for WILL",
    ],
    debug: {
      redditFetched: posts.length,
      afterDedupe:
        deduped.length,
      rejected: 0,
      errors,
    },
  };
}

export async function GET() {
  try {
    return NextResponse.json(
      await collectRedditPain()
    );
  } catch (error) {
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

export async function POST(
  request: Request
) {
  try {
    const body =
      (await request.json()) as {
        title?: string;
        text?: string;
        url?: string;
        subreddit?: string;
      };

    const post: RawRedditPost = {
      id: "manual-input",
      subreddit:
        body.subreddit?.trim() ||
        "manual",

      title:
        body.title?.trim() ||
        "Manual pasted signal",

      url:
        body.url?.trim() ||
        "manual-input",

      excerpt:
        body.text?.trim() || "",

      publishedAt:
        new Date().toISOString(),
    };

    if (post.excerpt.length < 20) {
      return NextResponse.json(
        {
          message:
            "Paste more source text.",
        },
        { status: 400 }
      );
    }

    const result =
      await analyzePostWithAi(post);

    return NextResponse.json({
      item: result,
      collected_at:
        new Date().toISOString(),
    });
  } catch (error) {
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