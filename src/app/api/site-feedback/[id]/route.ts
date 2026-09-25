import {
  SiteFeedbackStorageConfigurationError,
  getSiteFeedbackStore,
} from "@/features/site-feedback/siteFeedbackStore.server";
import { feedbackItemRoute } from "@/lib/http/feedbackItemRoute";

export const runtime = "nodejs";

export const GET = feedbackItemRoute({
  getStore: getSiteFeedbackStore,
  StorageConfigurationError: SiteFeedbackStorageConfigurationError,
  notFoundMessage: "Site feedback not found.",
  unexpectedErrorLabel: "Failed to read site feedback:",
  unexpectedErrorMessage: "Unable to load that site feedback right now.",
});
