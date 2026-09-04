import { isSiteFeedbackStatus } from "@/features/site-feedback/siteFeedback";
import {
  SiteFeedbackNotFoundError,
  SiteFeedbackStorageConfigurationError,
  getSiteFeedbackStore,
} from "@/features/site-feedback/siteFeedbackStore.server";
import { feedbackStatusRoute } from "@/lib/http/feedbackStatusRoute";

export const runtime = "nodejs";

export const POST = feedbackStatusRoute({
  isStatus: isSiteFeedbackStatus,
  getStore: getSiteFeedbackStore,
  NotFoundError: SiteFeedbackNotFoundError,
  StorageConfigurationError: SiteFeedbackStorageConfigurationError,
  notFoundMessage: "Site feedback not found.",
  unexpectedErrorLabel: "Failed to update site feedback status:",
  unexpectedErrorMessage: "Unable to update site feedback right now.",
});
