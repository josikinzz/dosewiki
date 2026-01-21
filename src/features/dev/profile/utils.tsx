import type { ReactNode } from "react";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import type { ProfileFormState } from "./types";
import { ALLOWED_AVATAR_MIME_TYPES, MAX_LINKS } from "./types";

export const toFormState = (profile: NormalizedUserProfile): ProfileFormState => ({
  displayName: profile.displayName,
  avatarUrl: profile.avatarUrl ?? "",
  bio: profile.bio,
  links: profile.links.map((link) => ({ ...link })),
});

export const normalizeFormState = (form: ProfileFormState) => ({
  displayName: form.displayName.trim(),
  avatarUrl: form.avatarUrl.trim(),
  bio: form.bio.replace(/\r\n/g, "\n"),
  links: form.links
    .map((link) => ({ label: link.label.trim(), url: link.url.trim() }))
    .filter((link) => link.label.length > 0 && link.url.length > 0)
    .slice(0, MAX_LINKS),
});

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export const formatFileSize = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export const inferAvatarMimeType = (file: File) => {
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
    default:
      return "";
  }
};

export const bioMarkdownComponents = {
  p: ({ node: _node, ...props }: { node?: unknown }) => (
    <p className="mt-3 text-[0.95rem] leading-7 text-white/85 first:mt-0" {...props} />
  ),
  strong: ({ node: _node, ...props }: { node?: unknown }) => <strong className="text-white" {...props} />,
  a: ({ node: _node, ...props }: { node?: unknown; children?: ReactNode }) => {
    const { children, ...rest } = props;
    return (
      <a
        className="text-fuchsia-200 underline decoration-dotted underline-offset-4 transition hover:text-fuchsia-100"
        target="_blank"
        rel="noopener noreferrer"
        {...rest}
      >
        {children}
      </a>
    );
  },
  ul: ({ node: _node, ...props }: { node?: unknown }) => (
    <ul className="mt-4 list-disc space-y-2 pl-5 text-[0.95rem] leading-7 text-white/85" {...props} />
  ),
  ol: ({ node: _node, ...props }: { node?: unknown }) => (
    <ol className="mt-4 list-decimal space-y-2 pl-5 text-[0.95rem] leading-7 text-white/85" {...props} />
  ),
  li: ({ node: _node, ...props }: { node?: unknown }) => (
    <li className="marker:text-fuchsia-300" {...props} />
  ),
};
