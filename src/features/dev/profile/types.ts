import type { NormalizedUserProfile } from "@/data/userProfiles";
import type { ChangeLogEntry } from "@/data/changelog/changeLog";

export const MAX_BIO_LENGTH = 4000;
export const MAX_LINKS = 3;
export const MAX_AVATAR_BYTES = 1024 * 1024 * 2; // 2 MiB
export const ALLOWED_AVATAR_MIME_TYPES = new Set(["image/png", "image/jpeg"]);

export type ChangeNotice = {
  type: "success" | "error";
  message: string;
};

export type ProfileFormLink = {
  label: string;
  url: string;
};

export type ProfileFormState = {
  displayName: string;
  avatarUrl: string;
  bio: string;
  links: ProfileFormLink[];
};

export type ProfileEditorTabProps = {
  profile: NormalizedUserProfile;
  profileHistory: ChangeLogEntry[];
  verifyCredentials: (
    options?: { username?: string; password?: string }
  ) => Promise<{ username: string; password: string; key: string }>;
  onProfileUpdated: (profile: NormalizedUserProfile, canonicalKey: string) => void;
  hasStoredCredentials: boolean;
};

export type AvatarUploadProps = {
  avatarPreviewSource: string | null;
  avatarInitials: string;
  avatarSelectionSummary: string | null;
  avatarFile: File | null;
  trimmedAvatarUrl: string;
  onUploadClick: () => void;
  onClearSelection: () => void;
  onRemoveAvatar: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  avatarUrl: string;
  onAvatarUrlChange: (value: string) => void;
};

export type LinkManagerProps = {
  links: ProfileFormLink[];
  onLinkChange: (index: number, field: keyof ProfileFormLink, value: string) => void;
  onRemoveLink: (index: number) => void;
  onAddLink: () => void;
  hasPartialLink: boolean;
};

export type BioEditorProps = {
  bio: string;
  onBioChange: (value: string) => void;
  bioLength: number;
};
