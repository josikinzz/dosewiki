import type { PublicationReceipt } from "@server/next/publicationDispatch";

export type PublicationDelivery = "done" | "pending" | "failed" | "unknown";

export type ArticlePublicationNotice = {
  delivery: PublicationDelivery;
  message: string;
  path: string;
  receipts: readonly Pick<PublicationReceipt, "status" | "verification">[] | null;
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

export function publicationMessage(delivery: PublicationDelivery): string {
  return MESSAGES[delivery];
}

export function articlePublicationNotice(
  slug: string,
  receipts: readonly Pick<PublicationReceipt, "status" | "verification">[] | null | undefined,
): ArticlePublicationNotice {
  const delivery = publicationDelivery(receipts);
  return { delivery, message: MESSAGES[delivery], path: `/${slug}`, receipts: Array.isArray(receipts) ? receipts : null };
}
