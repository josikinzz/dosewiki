export const ADMIN_INTENTS = [
  "legacyAdmin",
  "editorArticleWrite",
  "publicIntakeCreate",
  "promptMigrationWrite",
  "quoteMigrationWrite",
  "profileMediaWrite",
  "replicationMaintenance",
  "articleSourceMigration",
  "productionSync",
  "citationEvidenceWrite",
  "citationEvidenceReview",
  "generatedPublicationWrite",
  "reagentTestImport",
] as const;

export type AdminIntent = (typeof ADMIN_INTENTS)[number];

export type AdminIntentTokenResult =
  | {
      ok: true;
      intent: AdminIntent;
      source: "legacy" | "scoped";
      envVar: string;
    }
  | {
      ok: false;
      reason: "missing" | "invalid";
      intent: AdminIntent;
    };

const LEGACY_ADMIN_KEY_ENV_VAR = "DATA_ADMIN_KEY";

const INTENT_ENV_VARS: Record<AdminIntent, string | null> = {
  legacyAdmin: null,
  editorArticleWrite: "DATA_ADMIN_TOKEN_EDITOR_ARTICLE_WRITE",
  publicIntakeCreate: "DATA_ADMIN_TOKEN_PUBLIC_INTAKE_CREATE",
  promptMigrationWrite: "DATA_ADMIN_TOKEN_PROMPT_MIGRATION_WRITE",
  quoteMigrationWrite: "DATA_ADMIN_TOKEN_QUOTE_MIGRATION_WRITE",
  profileMediaWrite: "DATA_ADMIN_TOKEN_PROFILE_MEDIA_WRITE",
  replicationMaintenance: "DATA_ADMIN_TOKEN_REPLICATION_MAINTENANCE",
  articleSourceMigration: "DATA_ADMIN_TOKEN_ARTICLE_SOURCE_MIGRATION",
  productionSync: "DATA_ADMIN_TOKEN_PRODUCTION_SYNC",
  citationEvidenceWrite: "DATA_ADMIN_TOKEN_CITATION_EVIDENCE_WRITE",
  citationEvidenceReview: "DATA_ADMIN_TOKEN_CITATION_EVIDENCE_REVIEW",
  generatedPublicationWrite: "DATA_ADMIN_TOKEN_GENERATED_PUBLICATION_WRITE",
  reagentTestImport: "DATA_ADMIN_TOKEN_REAGENT_TEST_IMPORT",
};

function readEnv(name: string | null): string | null {
  if (!name) {
    return null;
  }

  const value = process.env[name];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function hasAnyConfiguredAdminToken(): boolean {
  if (readEnv(LEGACY_ADMIN_KEY_ENV_VAR)) {
    return true;
  }

  return ADMIN_INTENTS.some((intent) => Boolean(readEnv(getAdminIntentEnvVar(intent))));
}

export function getAdminIntentEnvVar(intent: AdminIntent): string | null {
  return INTENT_ENV_VARS[intent];
}

export function validateAdminIntentToken(token: string, intent: AdminIntent): AdminIntentTokenResult {
  const scopedEnvVar = getAdminIntentEnvVar(intent);
  const scopedToken = readEnv(scopedEnvVar);

  if (scopedToken && timingSafeEqual(token, scopedToken)) {
    return {
      ok: true,
      intent,
      source: "scoped",
      envVar: scopedEnvVar as string,
    };
  }

  const legacyToken = readEnv(LEGACY_ADMIN_KEY_ENV_VAR);
  if (legacyToken && timingSafeEqual(token, legacyToken)) {
    return {
      ok: true,
      intent,
      source: "legacy",
      envVar: LEGACY_ADMIN_KEY_ENV_VAR,
    };
  }

  return {
    ok: false,
    reason: hasAnyConfiguredAdminToken() ? "invalid" : "missing",
    intent,
  };
}

/**
 * Performs constant-time string comparison to prevent timing attacks.
 * Returns true if strings are equal, false otherwise.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const maxLength = Math.max(a.length, b.length);
  const paddedA = a.padEnd(maxLength, "\0");
  const paddedB = b.padEnd(maxLength, "\0");

  let result = a.length ^ b.length;
  for (let i = 0; i < maxLength; i++) {
    result |= paddedA.charCodeAt(i) ^ paddedB.charCodeAt(i);
  }

  return result === 0;
}
