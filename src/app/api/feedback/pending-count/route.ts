/**
 * Pending feedback count for the `/dev` tab rail badge.
 *
 * Its own endpoint rather than a field on either queue read, because the
 * badge is fetched by the shell on every `/dev` visit while the queues are
 * only fetched when the Feedback tab is open. The statuses counted are the
 * models' pending lists, the same rows the queue treats as waiting, so the
 * badge and the queue cannot disagree about what is pending.
 *
 *   GET /api/feedback/pending-count → { article, site, total }
 */
import { NextResponse } from "next/server";

import { protectedRouteOperation } from "@/lib/http/protectedRouteOperation";
import { ARTICLE_FEEDBACK_PENDING_STATUSES } from "@/features/article/feedback/articleFeedback";
import {
  ArticleFeedbackStorageConfigurationError,
  getArticleFeedbackStore,
} from "@/features/article/feedback/articleFeedbackStore.server";
import { SITE_FEEDBACK_PENDING_STATUSES } from "@/features/site-feedback/siteFeedback";
import {
  SiteFeedbackStorageConfigurationError,
  getSiteFeedbackStore,
} from "@/features/site-feedback/siteFeedbackStore.server";

export const runtime = "nodejs";

export const GET = protectedRouteOperation({
  auth: "editor",
  rateLimit: "diagnosticRead",
  unexpectedErrorLabel: "Failed to count pending feedback:",
  unexpectedErrorMessage: "Unable to count pending feedback right now.",
  mapError: (error) => {
    if (
      error instanceof ArticleFeedbackStorageConfigurationError ||
      error instanceof SiteFeedbackStorageConfigurationError
    ) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    return null;
  },
  operation: async () => {
    const [articleStore, siteStore] = await Promise.all([
      getArticleFeedbackStore(),
      getSiteFeedbackStore(),
    ]);
    const [article, site] = await Promise.all([
      articleStore.count({ statuses: ARTICLE_FEEDBACK_PENDING_STATUSES }),
      siteStore.count({ statuses: SITE_FEEDBACK_PENDING_STATUSES }),
    ]);

    return NextResponse.json({ ok: true, article, site, total: article + site });
  },
});
