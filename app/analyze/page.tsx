"use client";

import { useState } from "react";
import type {
  FocusEvent,
  MouseEvent,
} from "react";

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
};

type AnalyzeResponse = {
  items: PainItem[];
  rejected: [];
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
  item?: PainItem;
  message?: string;
};

function formatDate(value?: string) {
  if (!value) return "Unknown";

  const date = new Date(value);

  if (Number.isNaN(date.getTime()))
    return value;

  return date.toLocaleDateString(
    "en-US",
    {
      year: "numeric",
      month: "short",
      day: "numeric",
    }
  );
}

function EmptyState() {
  return (
    <section className="bd-empty">
      <h2>
        No workflow friction collected
        yet.
      </h2>

      <p>
        Click{" "}
        <strong>
          Scan workflow friction
        </strong>
        .
      </p>
    </section>
  );
}

export default function AnalyzePage() {
  const [loading, setLoading] =
    useState(false);

  const [
    manualLoading,
    setManualLoading,
  ] = useState(false);

  const [error, setError] =
    useState("");

  const [data, setData] =
    useState<AnalyzeResponse | null>(
      null
    );

  const [manualText, setManualText] =
    useState("");

  const [
    manualResult,
    setManualResult,
  ] = useState<PainItem | null>(
    null
  );

  const [copiedId, setCopiedId] =
    useState<string | null>(null);

  async function runCollect() {
    try {
      setLoading(true);

      setError("");

      const res = await fetch(
        "/api/analyze",
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const json =
        (await res.json()) as Partial<AnalyzeResponse> & {
          message?: string;
        };

      if (!res.ok) {
        throw new Error(
          json?.message ||
            `Request failed: ${res.status}`
        );
      }

      setData({
        items: Array.isArray(
          json.items
        )
          ? json.items
          : [],

        rejected: [],

        collected_at:
          json.collected_at ??
          new Date().toISOString(),

        scanned:
          typeof json.scanned ===
          "number"
            ? json.scanned
            : 0,

        kept:
          typeof json.kept ===
          "number"
            ? json.kept
            : 0,

        sources: Array.isArray(
          json.sources
        )
          ? json.sources
          : ["Reddit"],

        pipeline: Array.isArray(
          json.pipeline
        )
          ? json.pipeline
          : [],

        debug: json.debug,
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unknown error"
      );

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

      const res = await fetch(
        "/api/analyze",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            text: manualText,
          }),
        }
      );

      const json =
        (await res.json()) as ManualResponse;

      if (!res.ok) {
        throw new Error(
          json?.message ||
            `Request failed: ${res.status}`
        );
      }

      setManualResult(
        json.item ?? null
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Unknown error"
      );
    } finally {
      setManualLoading(false);
    }
  }

  async function copyToClipboard(
    text: string
  ) {
    const copyText = text.trim();

    if (!copyText) return false;

    try {
      await navigator.clipboard.writeText(
        copyText
      );

      return true;
    } catch {
      return false;
    }
  }

  async function copyItemText(
    id: string,
    text: string
  ) {
    const ok =
      await copyToClipboard(text);

    if (ok) {
      setCopiedId(id);

      window.setTimeout(
        () => setCopiedId(null),
        1800
      );
    }
  }

  function selectTextarea(
    event:
      | FocusEvent<HTMLTextAreaElement>
      | MouseEvent<HTMLTextAreaElement>
  ) {
    event.currentTarget.select();
  }

  function renderPainCard(
    item: PainItem,
    source: "manual" | "feed"
  ) {
    const copyId = `${source}-${item.id}`;

    return (
      <article
        key={copyId}
        className="bd-card bd-pain-card"
      >
        <div className="bd-card-topline">
          <span className="bd-pill bd-pill-dark">
            KEEP
          </span>

          <span className="bd-pill">
            r/{item.subreddit}
          </span>

          {typeof item.comments ===
          "number" ? (
            <span className="bd-pill">
              {item.comments} comments
            </span>
          ) : null}
        </div>

        <h2>{item.title}</h2>

        <blockquote className="bd-pain-quote">
          “{item.painQuote}”
        </blockquote>

        <div>
          <p className="bd-label">
            Original excerpt
          </p>

          <p className="bd-excerpt">
            {item.excerpt}
          </p>
        </div>

        <div className="bd-meta-grid">
          <div>
            <p className="bd-label">
              Author
            </p>

            <p>
              {item.author ??
                "Unknown"}
            </p>
          </div>

          <div>
            <p className="bd-label">
              Published
            </p>

            <p>
              {formatDate(
                item.publishedAt
              )}
            </p>
          </div>
        </div>

        {item.url !==
        "manual-input" ? (
          <div className="bd-source-row">
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
            >
              Open Reddit thread ↗
            </a>
          </div>
        ) : null}

        <div className="bd-actions">
          <button
            type="button"
            onClick={() =>
              copyItemText(
                copyId,
                item.willInput
              )
            }
            className="bd-primary-button bd-small-button"
          >
            {copiedId === copyId
              ? "Copied"
              : "Copy WILL input"}
          </button>
        </div>

        <details className="bd-will-copy-box">
          <summary>
            <span>
              WILL-ready input
            </span>

            <small>
              Use this if the workflow
              is worth building.
            </small>
          </summary>

          <textarea
            readOnly
            value={item.willInput}
            onFocus={selectTextarea}
            onClick={selectTextarea}
            className="bd-will-textarea"
          />
        </details>
      </article>
    );
  }

  return (
    <main className="bd-page">
      <section className="bd-hero">
        <div>
          <p className="bd-kicker">
            BD / Workflow Friction
          </p>

          <h1>
            Find workflow friction.
            Package it for WILL.
          </h1>

          <p className="bd-lead">
            BD finds repeated
            manual work,
            spreadsheets,
            follow-ups,
            tracking problems,
            and messy operations.
          </p>
        </div>
      </section>

      <section className="bd-toolbar">
        <button
          onClick={runCollect}
          disabled={loading}
          className="bd-primary-button"
        >
          {loading
            ? "Scanning..."
            : "Scan workflow friction"}
        </button>
      </section>

      <section className="bd-manual-panel">
        <div>
          <p className="bd-kicker">
            Manual test
          </p>

          <h2>
            Paste one post or comment
          </h2>

          <p>
            Paste messy market
            signals.
            BD packages them for
            WILL.
          </p>
        </div>

        <textarea
          value={manualText}
          onChange={(event) =>
            setManualText(
              event.target.value
            )
          }
          className="bd-manual-textarea"
          placeholder="Paste a Reddit post, tweet, workflow complaint, or operational mess..."
        />

        <button
          type="button"
          disabled={
            manualLoading ||
            manualText.trim().length <
              20
          }
          onClick={analyzeManualText}
          className="bd-secondary-button"
        >
          {manualLoading
            ? "Analyzing..."
            : "Analyze with AI"}
        </button>
      </section>

      {error ? (
        <p className="bd-error">
          {error}
        </p>
      ) : null}

      {manualResult ? (
        <section className="bd-section-block">
          <div className="bd-section-header">
            <p className="bd-kicker">
              Manual result
            </p>

            <h2>
              This can go to WILL
            </h2>
          </div>

          {renderPainCard(
            manualResult,
            "manual"
          )}
        </section>
      ) : null}

      {data ? (
        <section
          className="bd-stats"
          aria-label="Collection stats"
        >
          <span>
            {data.kept} kept
          </span>

          <span>
            {data.scanned} scanned
          </span>

          <span>
            {data.debug
              ?.redditFetched ?? 0}{" "}
            fetched
          </span>
        </section>
      ) : null}

      {!data ? (
        <EmptyState />
      ) : data.items.length === 0 ? (
        <section className="bd-empty bd-warning">
          <h2>
            No workflow friction
            found this run.
          </h2>
        </section>
      ) : (
        <section className="bd-grid">
          {data.items.map((item) =>
            renderPainCard(
              item,
              "feed"
            )
          )}
        </section>
      )}
    </main>
  );
}