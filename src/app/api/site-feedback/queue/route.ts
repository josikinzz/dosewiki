import { isSiteFeedbackStatus } from "@/features/site-feedback/siteFeedback";
import {
  SiteFeedbackStorageConfigurationError,
  getSiteFeedbackStore,
} from "@/features/site-feedback/siteFeedbackStore.server";
import { feedbackQueueRoute } from "@/lib/http/feedbackQueueRoute";

export const runtime = "nodejs";

export const GET = feedbackQueueRoute({
  isStatus: isSiteFeedbackStatus,
  getStore: getSiteFeedbackStore,
  StorageConfigurationError: SiteFeedbackStorageConfigurationError,
  sourceLabel: "site",
  unexpectedErrorLabel: "Failed to load site feedback queue:",
  unexpectedErrorMessage: "Unable to load site feedback right now.",
});
