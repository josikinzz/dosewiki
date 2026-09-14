import { ALLOWED_AVATAR_MIME_TYPES, MAX_AVATAR_BYTES } from "./contributorsModel";

export type AvatarFileLike = {
  name: string;
  size: number;
  type?: string;
};

export type AvatarUploadPayload = {
  filename: string;
  mimeType: string;
  base64: string;
};

export type AvatarFileReaderAdapter<TFile extends AvatarFileLike = File> = {
  inferMimeType: (file: TFile) => string;
  readAsBase64: (file: TFile) => Promise<string>;
};

export type AvatarObjectUrlAdapter<TFile extends AvatarFileLike = File> = {
  createObjectUrl: (file: TFile) => string;
  revokeObjectUrl: (url: string) => void;
};

export type AvatarBrowserFileAdapter<TFile extends AvatarFileLike = File> =
  AvatarFileReaderAdapter<TFile> & AvatarObjectUrlAdapter<TFile>;

export type AvatarFileValidationResult =
  | { ok: true; mimeType: string }
  | { ok: false; message: string };

export const formatFileSize = (bytes: number) => {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const inferAvatarMimeType = (file: AvatarFileLike) => {
  if (file.type && ALLOWED_AVATAR_MIME_TYPES.has(file.type)) {
    return file.type;
  }

  const match = file.name.toLowerCase().match(/\.([a-z0-9]+)$/);
  if (!match) {
    return "";
  }

  switch (match[1]) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    default:
      return "";
  }
};

export const validateAvatarFile = (file: AvatarFileLike): AvatarFileValidationResult => {
  const mimeType = inferAvatarMimeType(file);
  if (!mimeType || !ALLOWED_AVATAR_MIME_TYPES.has(mimeType)) {
    return { ok: false, message: "Avatar must be a PNG, JPG, or WebP image." };
  }

  if (file.size > MAX_AVATAR_BYTES) {
    return {
      ok: false,
      message: `Avatar image exceeds ${formatFileSize(MAX_AVATAR_BYTES)} limit. Select a smaller file.`,
    };
  }

  return { ok: true, mimeType };
};

const readFileAsBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Unable to read image file."));
        return;
      }
      const commaIndex = result.indexOf(",");
      const base64 = commaIndex === -1 ? result : result.slice(commaIndex + 1);
      resolve(base64.trim());
    };
    reader.onerror = () => {
      reject(new Error("Failed to read image file."));
    };
    reader.readAsDataURL(file);
  })

export const browserAvatarFileAdapter: AvatarBrowserFileAdapter<File> = {
  inferMimeType: inferAvatarMimeType,
  readAsBase64: readFileAsBase64,
  createObjectUrl: (file) => URL.createObjectURL(file),
  revokeObjectUrl: (url) => URL.revokeObjectURL(url),
};

export async function createAvatarUploadPayload<TFile extends AvatarFileLike>(
  file: TFile,
  adapter: AvatarFileReaderAdapter<TFile>,
): Promise<AvatarUploadPayload> {
  const mimeType = adapter.inferMimeType(file);
  if (!mimeType || !ALLOWED_AVATAR_MIME_TYPES.has(mimeType)) {
    throw new Error("Avatar must be a PNG, JPG, or WebP image.");
  }

  return {
    filename: file.name,
    mimeType,
    base64: await adapter.readAsBase64(file),
  };
}

export function createAvatarPreviewSession<TFile extends AvatarFileLike>(
  file: TFile,
  adapter: AvatarObjectUrlAdapter<TFile>,
) {
  const source = adapter.createObjectUrl(file);
  return {
    source,
    dispose: () => adapter.revokeObjectUrl(source),
  };
}
