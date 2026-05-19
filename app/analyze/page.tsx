"use client";

import { useState } from "react";
import type { FocusEvent, MouseEvent } from "react";

type PainItem = {
  id: string;
  keep: true;
  subreddit: string;
  title: string;
  url: string;
  author?: string;
  publishedAt?: string;
  excerpt: string;
  score?: number;
  comments?: number;
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

type RejectedItem = {
  id: string;
  keep: false;
  subreddit: string;
  title: string;
  url: string;
  excerpt: string;
  rejectReason: string;
};

type AnalyzeResponse = {
  items: PainItem[];
  rejected: RejectedItem[];
  collected_at: string;
  scanned: number;
  kept: number;
  sources: string[];
  pipeline: string[];
  debug?: {
    redditFetched: number;
    afterDedupe: number;
    rejected: number;
    errors?: string[];
  };
};

type ManualResponse = {
  item?: PainItem | RejectedItem;
  message?: string;
};

function formatDate(value?: string) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="bd-score-row">
      <span>{label}</span>
      <div className="bd-score-track" aria-hidden="true">
        <div className="bd-score-fill" style={{ width: `${Math.max(0, Math.min(10, value)) * 10}%` }} />
      </div>
      <strong>{value.toFixed(1)}</strong>
    </div>
  );
}

function EmptyState() {
  return (
    <section className="bd-empty">
      <h2>No pain signals collected yet.</h2>
      <p>
        Click <strong>Scan Reddit pain</strong>. BD will keep only posts with an explicit pain quote.
        Buyer, tool direction, and launch prompt are now WILL's job.
      </p>
    </section>
  );
}

export default function AnalyzePage() {
  const [loading, setLoading] = useState(false);
  const [manualLoading, setManualLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<AnalyzeResponse | null>(null);
  const [manualText, setManualText] = useState("");
  const [manualResult, setManualResult] = useState<PainItem | RejectedItem | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyErrorId, setCopyErrorId] = useState<string | null>(null);

  async function runCollect() {
    try {
      setLoading(true);
      setError("");
      setCopiedId(null);
      setCopyErrorId(null);

      const res = await fetch("/api/analyze", {
        method: "GET",
        cache: "no-store",
      });

      const json = (await res.json()) as Partial<AnalyzeResponse> & { message?: string };

      if (!res.ok) throw new Error(json?.message || `Request failed: ${res.status}`);

      setData({
        items: Array.isArray(json.items) ? json.items : [],
        rejected: Array.isArray(json.rejected) ? json.rejected : [],
        collected_at: json.collected_at ?? new Date().toISOString(),
        scanned: typeof json.scanned === "number" ? json.scanned : 0,
        kept: typeof json.kept === "number" ? json.kept : 0,
        sources: Array.isArray(json.sources) ? json.sources : ["Reddit"],
        pipeline: Array.isArray(json.pipeline) ? json.pipeline : [],
        debug: json.debug,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  async function analyzeManualText() {
    try {
      setManualLoading(true);
      setError("");
      setManualResult(null);

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: manualText }),
      });

      const json = (await res.json()) as ManualResponse;
      if (!res.ok) throw new Error(json?.message || `Request failed: ${res.status}`);
      setManualResult(json.item ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setManualLoading(false);
    }
  }

  async function copyToClipboard(text: string) {
    const copyText = text.trim();
    if (!copyText) return false;

    try {
      if (navigator?.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(copyText);
        return true;
      }
    } catch {
      // Use fallback below.
    }

    try {
      const textarea = document.createElement("textarea");
      textarea.value = copyText;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.top = "0";
      textarea.style.left = "0";
      textarea.style.width = "1px";
      textarea.style.height = "1px";
      textarea.style.opacity = "0";
      textarea.style.pointerEvents = "none";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  }

  async function copyItemText(id: string, text: string) {
    const ok = await copyToClipboard(text);

    if (ok) {
      setCopiedId(id);
      setCopyErrorId(null);
      window.setTimeout(() => setCopiedId(null), 1800);
      return;
    }

    setCopiedId(null);
    setCopyErrorId(id);
  }

  function selectTextarea(event: FocusEvent<HTMLTextAreaElement> | MouseEvent<HTMLTextAreaElement>) {
    event.currentTarget.select();
  }

  function renderPainCard(item: PainItem, source: "manual" | "feed") {
    const copyId = `${source}-${item.id}`;

    return (
      <article key={copyId} className="bd-card bd-pain-card">
        <div className="bd-card-topline">
          <span className="bd-pill bd-pill-dark">KEEP</span>
          <span className="bd-pill">r/{item.subreddit}</span>
          <span className="bd-pill">Pain {item.painScore.toFixed(1)}</span>
          <span className="bd-pill">Toolability {item.toolabilityScore.toFixed(1)}</span>
          <span className="bd-pill">Total {item.totalScore.toFixed(1)}</span>
          {typeof item.comments === "number" ? <span className="bd-pill">{item.comments} comments</span> : null}
        </div>

        <h2>{item.title}</h2>

        <blockquote className="bd-pain-quote">“{item.painQuote}”</blockquote>

        <div className="bd-score-panel" aria-label="Pain scores">
          <ScoreBar label="Pain" value={item.painScore} />
          <ScoreBar label="Urgency" value={item.urgencyScore} />
          <ScoreBar label="Toolability" value={item.toolabilityScore} />
          <ScoreBar label="Money" value={item.moneyScore} />
        </div>

        <div>
          <p className="bd-label">Original excerpt</p>
          <p className="bd-excerpt">{item.excerpt}</p>
        </div>

        <div className="bd-meta-grid">
          <div>
            <p className="bd-label">Author</p>
            <p>{item.author ?? "Unknown"}</p>
          </div>
          <div>
            <p className="bd-label">Published</p>
            <p>{formatDate(item.publishedAt)}</p>
          </div>
        </div>

        {item.url !== "manual-input" ? (
          <div className="bd-source-row">
            <a href={item.url} target="_blank" rel="noreferrer">
              Open Reddit thread ↗
            </a>
          </div>
        ) : null}

        <div className="bd-actions">
          <button
            type="button"
            onClick={() => copyItemText(copyId, item.willInput)}
            className="bd-primary-button bd-small-button"
            title="Copy the clean WILL input. Paste it directly into WILL."
          >
            {copiedId === copyId ? "Copied. Paste into WILL" : "Copy WILL input"}
          </button>
          <button
            type="button"
            onClick={() => copyItemText(`${copyId}-quote`, item.painQuote)}
            className="bd-secondary-button bd-small-button"
          >
            {copiedId === `${copyId}-quote` ? "Copied" : "Copy pain quote"}
          </button>
        </div>

        <details className="bd-will-copy-box" open={copyErrorId === copyId}>
          <summary>
            <span>WILL-ready input</span>
            <small>Paste this directly into WILL.</small>
          </summary>
          <textarea
            readOnly
            value={item.willInput}
            onFocus={selectTextarea}
            onClick={selectTextarea}
            className="bd-will-textarea"
            aria-label={`WILL input for ${item.title}`}
          />
        </details>
      </article>
    );
  }

  function renderRejected(item: RejectedItem, index: number) {
    return (
      <article key={`${item.id}-${index}`} className="bd-reject-card">
        <div className="bd-card-topline">
          <span className="bd-pill">REJECT</span>
          <span className="bd-pill">r/{item.subreddit}</span>
        </div>
        <h3>{item.title}</h3>
        <p className="bd-label">Reject reason</p>
        <p>{item.rejectReason}</p>
      </article>
    );
  }

  return (
    <main className="bd-page">
      <section className="bd-hero">
        <div>
          <p className="bd-kicker">BD / Reddit Pain Gate</p>
          <h1>Pick 10 Reddit pain signals. Let WILL do the thinking.</h1>
          <p className="bd-lead">
            BD no longer guesses buyers or tool ideas. It only finds explicit pain quotes and packages them for WILL. No category bugs. No template pollution.
          </p>
        </div>

        <div className="bd-hero-card">
          <p className="bd-hero-card-title">Final safe flow</p>
          <ol>
            <li>Find an explicit pain quote</li>
            <li>Reject if pain is invented</li>
            <li>Show only the top 10 pain signals</li>
            <li>Copy the quote + original excerpt</li>
            <li>Let WILL generate buyer, tool, and Codex prompt</li>
          </ol>
        </div>
      </section>

      <section className="bd-toolbar">
        <button onClick={runCollect} disabled={loading} className="bd-primary-button">
          {loading ? "Scanning Reddit pain..." : "Scan Reddit pain"}
        </button>

        <div className="bd-toolbar-copy">
          <strong>Rule:</strong> BD only picks pain. WILL decides the buyer, tiny tool, and Codex prompt.
        </div>
      </section>

      <section className="bd-manual-panel">
        <div>
          <p className="bd-kicker">Manual test</p>
          <h2>Paste one post or comment</h2>
          <p>
            Use this when Reddit search is noisy. Paste the text, then BD will either package the strongest pain quote for WILL or quietly reject it.
          </p>
        </div>
        <textarea
          value={manualText}
          onChange={(event) => setManualText(event.target.value)}
          className="bd-manual-textarea"
          placeholder="Paste a Reddit post, comment, tweet, or messy market signal here..."
        />
        <button
          type="button"
          disabled={manualLoading || manualText.trim().length < 20}
          onClick={analyzeManualText}
          className="bd-secondary-button"
        >
          {manualLoading ? "Checking pain..." : "Check pasted pain"}
        </button>
      </section>

      {error ? <p className="bd-error">{error}</p> : null}

      {manualResult ? (
        <section className="bd-section-block">
          <div className="bd-section-header">
            <p className="bd-kicker">Manual result</p>
            <h2>{manualResult.keep ? "This can go to WILL" : "Not strong enough for WILL"}</h2>
          </div>
          {manualResult.keep ? (
            renderPainCard(manualResult, "manual")
          ) : (
            <section className="bd-empty bd-warning">
              <h2>Skipped.</h2>
              <p>BD did not find a strong explicit pain quote. Use a sharper post.</p>
            </section>
          )}
        </section>
      ) : null}

      {data ? (
        <section className="bd-stats" aria-label="Collection stats">
          <span>{data.kept} kept</span>
          <span>{data.scanned} scanned</span>
          <span>{data.debug?.redditFetched ?? 0} fetched</span>
          {data.sources.map((source) => (
            <span key={source}>{source}</span>
          ))}
        </section>
      ) : null}

      {!data ? (
        <EmptyState />
      ) : data.items.length === 0 ? (
        <section className="bd-empty bd-warning">
          <h2>No usable pain found this run.</h2>
          <p>
That is correct behavior. BD now hides weak posts instead of padding the page. Try another scan or use the manual paste box with a stronger post.
          </p>
        </section>
      ) : (
        <section className="bd-grid">{data.items.map((item) => renderPainCard(item, "feed"))}</section>
      )}
    </main>
  );
}
