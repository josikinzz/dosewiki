import "server-only";

import {
  ConvexTripReportSubmissionStore,
  type TripReportSubmissionStore,
} from "./convexTripReportSubmissionStore";
import { getServerConvexWriteCapability } from "@server/convex/serverWriteCapability";

export class TripReportSubmissionStorageConfigurationError extends Error {
  constructor(message = "Trip report submission storage is not configured.") {
    super(message);
    this.name = "TripReportSubmissionStorageConfigurationError";
  }
}

let store: TripReportSubmissionStore | null = null;
let storeCacheKey: string | null = null;

export async function getTripReportSubmissionStore(): Promise<TripReportSubmissionStore> {
  const writeCapability = getServerConvexWriteCapability();
  if (writeCapability.ok === false) {
    throw new TripReportSubmissionStorageConfigurationError(
      "Set CONVEX_URL, VITE_CONVEX_URL, or NEXT_PUBLIC_CONVEX_URL plus CONVEX_ADMIN_KEY to enable private trip report submissions.",
    );
  }

  const { capability } = writeCapability;
  const apiKey =
    capability.getAdminIntentToken("editorArticleWrite") || capability.adminKey;
  const cacheKey = `${capability.deployment.writeUrl}:${apiKey}`;

  if (store && storeCacheKey === cacheKey) {
    return store;
  }

  store = new ConvexTripReportSubmissionStore({
    client: capability.client,
    apiKey,
  });
  storeCacheKey = cacheKey;
  return store;
}

export function resetTripReportSubmissionStoreForTests() {
  store = null;
  storeCacheKey = null;
}
