import "server-only";

import {
  DataTripReportSubmissionStore,
  createSubmissionForIntake,
  type TripReportSubmissionStore,
} from "./dataTripReportSubmissionStore";
import {
  getPublicIntakeWriteCapability,
  getServerDataWriteCapability,
} from "@server/data/serverWriteCapability";

export class TripReportSubmissionStorageConfigurationError extends Error {
  constructor(message = "Trip report submission storage is not configured.") {
    super(message);
    this.name = "TripReportSubmissionStorageConfigurationError";
  }
}

let store: TripReportSubmissionStore | null = null;
let storeCacheKey: string | null = null;

export async function getPublicTripReportSubmissionStore(): Promise<
  Pick<TripReportSubmissionStore, "create">
> {
  const capability = getPublicIntakeWriteCapability();
  if (!capability) {
    throw new TripReportSubmissionStorageConfigurationError(
      "Configure the Postgres target and the public-intake create credential to enable public trip report submissions.",
    );
  }

  return { create: (input) => createSubmissionForIntake(capability, input) };
}

export async function getTripReportSubmissionStore(): Promise<TripReportSubmissionStore> {
  const writeCapability = getServerDataWriteCapability();
  if (writeCapability.ok === false) {
    throw new TripReportSubmissionStorageConfigurationError(
      "Configure the Postgres target and an editorial write credential to enable private trip report submissions.",
    );
  }

  const { capability } = writeCapability;
  const apiKey =
    capability.getAdminIntentToken("editorArticleWrite") || capability.adminKey;
  const cacheKey = `${capability.deployment.writeUrl}:${apiKey}`;

  if (store && storeCacheKey === cacheKey) {
    return store;
  }

  store = new DataTripReportSubmissionStore({
    client: capability.client,
    apiKey,
  });
  storeCacheKey = cacheKey;
  return store;
}


