import type { ReactNode } from "react";

export { inferAvatarMimeType } from "./avatarUploadModel";
export {
  normalizeProfileFormState as normalizeFormState,
  toProfileFormState as toFormState,
} from "./profileFormModel";

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export const formatFileSize = (bytes: number) => {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const bioMarkdownComponents = {
  p: ({ node: _node, ...props }: { node?: unknown }) => (
    <p className="theme-text-secondary mt-3 text-[0.95rem] leading-7 first:mt-0" {...props} />
  ),
  strong: ({ node: _node, ...props }: { node?: unknown }) => (
    <strong className="theme-text-primary" {...props} />
  ),
  a: ({ node: _node, ...props }: { node?: unknown; children?: ReactNode }) => {
    const { children, ...rest } = props;
    return (
      <a
        className="theme-link-muted underline decoration-dotted underline-offset-4 transition"
        target="_blank"
        rel="noopener noreferrer"
        {...rest}
      >
        {children}
      </a>
    );
  },
  ul: ({ node: _node, ...props }: { node?: unknown }) => (
    <ul className="theme-text-secondary mt-4 list-disc space-y-2 pl-5 text-[0.95rem] leading-7" {...props} />
  ),
  ol: ({ node: _node, ...props }: { node?: unknown }) => (
    <ol className="theme-text-secondary mt-4 list-decimal space-y-2 pl-5 text-[0.95rem] leading-7" {...props} />
  ),
  li: ({ node: _node, ...props }: { node?: unknown }) => (
    <li className="marker:text-[color:var(--theme-accent-strong)]" {...props} />
  ),
};
