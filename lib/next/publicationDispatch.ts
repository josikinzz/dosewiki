/**
 * Delivery of a publication signal from the editor deployment to the public
 * deployments that serve the affected content.
 *
 * Three properties this module exists to hold:
 *
 * - A committed Postgres write is already durable when delivery runs. A refused,
 *   slow or unreachable receiver is reported, never thrown, so a successful
 *   edit is never reported as a save failure that invites a duplicate write.
 * - Targets come from an environment allowlist and are additionally checked
 *   against the known public hosts, so this is not a general outbound fetch.
 * - Receipts separate "content saved" from "invalidation accepted" per target,
 *   which is what makes a partial failure visible and retryable instead of
 *   silently stale.
 *
 * Ordering needs no sequence number: the signal expires cache entries, it
 * never carries content, so a duplicate or late delivery can only cause a
 * re-read of current Postgres data. It cannot restore an older revision.
 */
import { isPublicHost } from "./publicHostPolicy";
import {
  PUBLICATION_SIGNAL_VERSION,
  PUBLICATION_SIGNAL_MAX_TARGETS,
  PUBLICATION_SIGNATURE_HEADER,
  type PublicationSignal,
  type PublicationSource,
  type PublicationTarget,
} from "./publicationWire";
import {
  getPublicationSecret,
  signPublicationBody,
} from "./publicationSignature";

export const PUBLICATION_TARGETS_ENV = "PUBLIC_CACHE_PUBLISH_TARGETS";
export const PUBLICATION_RECEIVER_PATH = "/api/public-cache/revalidate";

/** A receiver that has not answered by now is reported, not waited for. */
const DISPATCH_TIMEOUT_MS = 2_500;
/** One retry absorbs a cold lambda or a dropped connection, nothing more. */
const DISPATCH_ATTEMPTS = 2;

type PublicationReceiptStatus =
  "accepted" | "pending" | "rejected" | "unreachable" | "unconfigured";

export type SavedArticleRevision = { slug: string; revision: string | null };
type ServedArticleRevision = SavedArticleRevision & {
  status: "verified" | "mismatch" | "unreachable";
  observedRevision?: string;
};

export type PublicationRevisionEvidence = {
  publicationKey: string;
  generation: number;
  savedRevision: string;
  /** Enqueue is not generation completion. Workers fill this later. */
  generatedRevision: string | null;
  /** Public HTML verification fills this independently of generation. */
  renderedRevision: string | null;
  translationStatus: "pending" | "enqueued" | "generated";
  translationJobs: readonly string[];
  catalogIntents: readonly unknown[];
};

export type PublicationReceipt = {
  /** Receiving origin, or "local" for the deployment that ran the write. */
  target: string;
  status: PublicationReceiptStatus;
  attempts: number;
  httpStatus?: number;
  detail?: string;
  /** Present only when a committed writer supplied the content identity. */
  savedRevisions?: readonly SavedArticleRevision[];
  /** Acceptance alone is never evidence that a public page serves this revision. */
  servedRevisions?: ServedArticleRevision[];
  verification?: "not-requested" | "pending" | "verified" | "incomplete";
  translationIntent?: PublicationRevisionEvidence;
  /** Receiver-side HTML and App Router navigation warming, independent of commit success. */
  warming?: unknown;
};

/**
 * Configured public origins. An entry that is not an https origin on a known
 * public host is dropped with a warning: the editor must not be talked into
 * signing a request to an arbitrary address by a mistyped variable.
 * `http://localhost` is accepted in development so the pair can be exercised
 * locally.
 */
export function getPublicationTargets(
  env: Partial<Record<string, string | undefined>> = process.env,
): string[] {
  const configured = env[PUBLICATION_TARGETS_ENV]?.trim();
  if (!configured) return [];
  const development = env.NODE_ENV !== "production";
  const targets: string[] = [];
  for (const entry of configured.split(",")) {
    const value = entry.trim();
    if (!value) continue;
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      console.warn(
        `[publication-dispatch] ignoring unparseable target: ${value}`,
      );
      continue;
    }
    const localDevelopment =
      development &&
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if (
      !localDevelopment &&
      (url.protocol !== "https:" || !isPublicHost(url.hostname))
    ) {
      console.warn(
        `[publication-dispatch] ignoring target outside the public host allowlist: ${value}`,
      );
      continue;
    }
    const origin = url.origin;
    if (!targets.includes(origin)) targets.push(origin);
  }
  return targets;
}

function buildPublicationSignal(
  targets: readonly PublicationTarget[],
  source: PublicationSource,
  now: number = Date.now(),
): PublicationSignal {
  return {
    version: PUBLICATION_SIGNAL_VERSION,
    source,
    issuedAt: now,
    dispatchId: `${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    targets: [...targets],
  };
}

async function deliver(
  origin: string,
  body: string,
  signature: string,
  dispatchId: string,
): Promise<PublicationReceipt> {
  let last: PublicationReceipt = {
    target: origin,
    status: "unreachable",
    attempts: 0,
  };
  for (let attempt = 1; attempt <= DISPATCH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(`${origin}${PUBLICATION_RECEIVER_PATH}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [PUBLICATION_SIGNATURE_HEADER]: signature,
        },
        body,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
      });
      if (response.ok) {
        const acknowledgement: unknown = await response
          .json()
          .catch(() => null);
        if (
          !acknowledgement ||
          typeof acknowledgement !== "object" ||
          !("ok" in acknowledgement) ||
          acknowledgement.ok !== true ||
          !("dispatchId" in acknowledgement) ||
          acknowledgement.dispatchId !== dispatchId
        ) {
          return {
            target: origin,
            status: "rejected",
            attempts: attempt,
            httpStatus: response.status,
            detail: "invalid_acknowledgement",
          };
        }
        return {
          target: origin,
          status: "accepted",
          attempts: attempt,
          httpStatus: response.status,
          ...("warming" in acknowledgement
            ? { warming: acknowledgement.warming }
            : {}),
        };
      }
      last = {
        target: origin,
        // A 4xx is a contract disagreement: retrying sends the same bytes.
        status: response.status >= 500 ? "unreachable" : "rejected",
        attempts: attempt,
        httpStatus: response.status,
        detail:
          (await response.text().catch(() => "")).slice(0, 200) || undefined,
      };
      if (last.status === "rejected") return last;
    } catch (error) {
      last = {
        target: origin,
        status: "unreachable",
        attempts: attempt,
        detail: error instanceof Error ? error.message : "delivery failed",
      };
    }
  }
  return last;
}

/** Probe canonical HTML, not an uncached database revision endpoint. No cache-busting
 * query, redirect following, or acceptance-to-verification inference is permitted. */
async function verifyServedArticle(
  origin: string,
  saved: SavedArticleRevision,
): Promise<ServedArticleRevision> {
  try {
    const response = await fetch(`${origin}/${saved.slug}`, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (saved.revision === null) {
      return {
        ...saved,
        status:
          response.status === 404
            ? "verified"
            : response.ok
              ? "mismatch"
              : "unreachable",
      };
    }
    if (!response.ok) return { ...saved, status: "unreachable" };
    const html = await response.text();
    const marker =
      /<meta\b[^>]*\bname="dosewiki-public-revision"[^>]*\bcontent="([a-f0-9]{64})"[^>]*>/i.exec(
        html,
      );
    const observedRevision = marker?.[1];
    return {
      ...saved,
      status: observedRevision === saved.revision ? "verified" : "mismatch",
      ...(observedRevision ? { observedRevision } : {}),
    };
  } catch {
    return { ...saved, status: "unreachable" };
  }
}

/**
 * Sign one signal per batch and deliver it to every configured public origin
 * in parallel. Never throws. An unset secret or empty target list yields a
 * single `unconfigured` receipt, which is the honest answer for a deployment
 * that has not been given the pair of settings yet.
 *
 * A write that touches more identities than one signal may carry (a banner
 * preset covering every article, for example) is split into whole batches
 * rather than refused: the receiver bounds one request, not one edit. Each
 * batch reports its own receipt, so a partial delivery stays visible.
 */
export async function dispatchPublicationSignal(
  targets: readonly PublicationTarget[],
  source: PublicationSource,
  env: Partial<Record<string, string | undefined>> = process.env,
  savedRevisions: readonly SavedArticleRevision[] = [],
): Promise<PublicationReceipt[]> {
  if (targets.length === 0) return [];
  const origins = getPublicationTargets(env);
  const secret = getPublicationSecret(env);
  if (origins.length === 0 || !secret) {
    return (origins.length ? origins : ["unconfigured"]).map((target) => ({
      target,
      status: "unconfigured",
      attempts: 0,
      savedRevisions,
      verification: savedRevisions.length ? "pending" : "not-requested",
      detail: !secret
        ? "PUBLIC_CACHE_PUBLISH_SECRET is unset; durable publication remains pending"
        : "PUBLIC_CACHE_PUBLISH_TARGETS is unset; durable publication remains pending",
    }));
  }
  const receipts: PublicationReceipt[] = [];
  for (
    let start = 0;
    start < targets.length;
    start += PUBLICATION_SIGNAL_MAX_TARGETS
  ) {
    const batch = targets.slice(start, start + PUBLICATION_SIGNAL_MAX_TARGETS);
    const signal = buildPublicationSignal(batch, source);
    const body = JSON.stringify(signal);
    const signature = signPublicationBody(body, secret);
    const saved = savedRevisions.filter((revision) =>
      batch.some(
        (target) => target.kind === "article" && target.slug === revision.slug,
      ),
    );
    receipts.push(
      ...(await Promise.all(
        origins.map(async (origin) => {
          const receipt = await deliver(
            origin,
            body,
            signature,
            signal.dispatchId,
          );
          receipt.savedRevisions = saved;
          receipt.verification = saved.length ? "pending" : "not-requested";
          if (receipt.status === "accepted" && saved.length) {
            const served: ServedArticleRevision[] = [];
            for (let offset = 0; offset < saved.length; offset += 8) {
              served.push(
                ...(await Promise.all(
                  saved
                    .slice(offset, offset + 8)
                    .map((revision) => verifyServedArticle(origin, revision)),
                )),
              );
            }
            receipt.servedRevisions = served;
            receipt.verification = served.every(
              (revision) => revision.status === "verified",
            )
              ? "verified"
              : "incomplete";
          }
          return receipt;
        }),
      )),
    );
  }
  return receipts;
}
