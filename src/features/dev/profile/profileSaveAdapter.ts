import type { SaveProfilePayload, SaveProfileResult } from "@/hooks/useApiMutations";
import type { ProfileEditorTabProps } from "./types";

export type ProfileCredentialVerifier = ProfileEditorTabProps["verifyCredentials"];
export type VerifiedProfileCredentials = Awaited<ReturnType<ProfileCredentialVerifier>>;
export type ProfileSaveMutation = (payload: SaveProfilePayload) => Promise<SaveProfileResult>;

export async function verifyProfileSaveCredentials(verifyCredentials: ProfileCredentialVerifier) {
  return verifyCredentials();
}

export async function invokeVerifiedProfileSave({
  credentials,
  saveProfile,
  payload,
}: {
  credentials: VerifiedProfileCredentials;
  saveProfile: ProfileSaveMutation;
  payload: Omit<SaveProfilePayload, "username" | "password">;
}) {
  return saveProfile({
    username: credentials.username,
    password: credentials.password,
    ...payload,
  });
}
