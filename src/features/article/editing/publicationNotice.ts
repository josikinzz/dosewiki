import type { PublicationReceipt } from "@server/next/publicationDispatch";

/**
 * What an article write can honestly say about public delivery.
 *
 * The write route answers once the change is saved on the editor host; the
 * public site catches up later through the publication outbox. The receipt it
 * returns is the only evidence of where delivery stands, so this reads that
 * receipt and never reports a change as live while delivery is pending.
 */
export type PublicationDelivery = "done" | "pending" | "failed" | "unknown";

export type ArticlePublicationNotice = {
  delivery: PublicationDelivery;
  message: string;
  /** App Path of the public article the change goes to. */
  path: string;
};

const FAILED_STATUSES = new Set(["rejected", "unreachable", "unconfigured"]);

export function publicationDelivery(
  receipts: readonly Pick<PublicationReceipt, "status" | "verification">[] | null | undefined,
): PublicationDelivery {
  if (!Array.isArray(receipts) || receipts.length === 0) return "unknown";
  if (receipts.some((receipt) => FAILED_STATUSES.has(receipt.status))) return "failed";
  if (receipts.some((receipt) => receipt.status === "pending"
    || receipt.verification === "pending"
    || receipt.verification === "incomplete")) return "pending";
  return "done";
}

const MESSAGES: Record<PublicationDelivery, string> = {
  done: "Saved on the editor host. The public site now serves this change.",
  pending: "Saved on the editor host. Public delivery is pending; readers may see the previous version until it completes.",
  failed: "Saved on the editor host. Public delivery did not go through; readers still see the previous version until it is delivered again.",
  unknown: "Saved on the editor host. The public delivery state was not reported.",
};

export function articlePublicationNotice(
  slug: string,
  receipts: readonly Pick<PublicationReceipt, "status" | "verification">[] | null | undefined,
): ArticlePublicationNotice {
  const delivery = publicationDelivery(receipts);
  return { delivery, message: MESSAGES[delivery], path: `/${slug}` };
}
