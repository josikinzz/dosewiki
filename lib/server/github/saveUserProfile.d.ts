import type {
  GitHubFileChangeSet,
  GitHubRepositoryAdapter,
} from "./fileChange.js";
import type { RequestErrorStatus } from "./saveSubstanceIndex.js";

export const MAX_PROFILE_PAYLOAD_BYTES: number;

export class RequestError extends Error {
  status: RequestErrorStatus | number;
  constructor(status: RequestErrorStatus | number, message: string);
}

export type UserProfileLink = {
  label: string;
  url: string;
};

export type UserProfile = {
  key: string;
  displayName: string;
  bio: string;
  links: UserProfileLink[];
  avatarUrl: string | null;
  aliases: string[];
  hasCustomBio: boolean;
};

export type SaveUserProfileBody = {
  profile?: Partial<UserProfile> & Record<string, unknown>;
  avatarUpload?: {
    filename?: string;
    mimeType?: string;
    base64?: string;
  };
};

export type UserProfileFileChangeSetResult =
  | {
      success: true;
      unchanged: true;
      profile: UserProfile;
      submittedBy: string;
    }
  | {
      changeSet: GitHubFileChangeSet & {
        kind: "backup";
        actor: { key: string };
        timestamp: string;
      };
      profile: UserProfile;
      submittedBy: string;
    };

export type SaveUserProfileResult =
  | {
      success: true;
      unchanged: true;
      profile: UserProfile;
      submittedBy: string;
    }
  | {
      success: true;
      commitSha: string;
      commitUrl: string;
      profile: UserProfile;
      submittedBy: string;
      createdAt: string;
    };

export function getProfilePayloadByteLength(payload: unknown): number;
export function buildUserProfileFileChangeSet(options?: {
  body?: SaveUserProfileBody;
  submittedBy?: string;
  existingProfiles?: UserProfile[];
  timestamp?: Date;
}): Promise<UserProfileFileChangeSetResult>;
export function saveUserProfileWithGitHub(options?: {
  body?: SaveUserProfileBody;
  submittedBy?: string;
  githubToken?: string;
  repository?: GitHubRepositoryAdapter;
}): Promise<SaveUserProfileResult>;
