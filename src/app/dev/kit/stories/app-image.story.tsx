import { AppImage } from "@/components/common/AppImage";

import type { StoryDef } from "../registry/types";

// A real '/'-prefixed public asset exercises the local (next/image) branch.
const localSrc = "/dosewiki-logo.png";

// An inline data URI (no leading '/', not StaticImageData) takes the remote
// <img> branch, so examples mount without depending on a third-party host.
const remoteSrc =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#0e7c66"/><text x="60" y="66" font-family="sans-serif" font-size="13" fill="#fff" text-anchor="middle">remote</text></svg>`,
  );

export const appImageStory: StoryDef = {
  id: "app-image",
  name: "AppImage",
  tier: "common",
  status: "stable",
  summary:
    "Source-aware image wrapper. Local paths and StaticImageData use next/image. Managed canonical raster images use responsive Worker URLs; other remote sources stay direct.",
  source: "src/components/common/AppImage.tsx",
  importLine: 'import { AppImage } from "@/components/common/AppImage";',
  exports: ["AppImage"],
  examples: [
    {
      label: "Local source (next/image)",
      note: "A string starting with '/' or StaticImageData is treated as local and optimised via next/image.",
      background: "card",
      render: () => (
        <AppImage
          src={localSrc}
          alt="Local placeholder"
          width={120}
          height={120}
          className="rounded-lg"
        />
      ),
    },
    {
      label: "Remote source (plain img)",
      note: "An absolute http(s) URL on any other host falls back to a native <img> with lazy loading and async decoding.",
      background: "card",
      render: () => (
        <AppImage
          src={remoteSrc}
          alt="Remote placeholder"
          width={120}
          height={120}
          className="rounded-lg"
        />
      ),
    },
    {
      label: "Priority (eager, above the fold)",
      note: "priority loads eagerly with fetchPriority=\"high\" for hero/LCP imagery.",
      background: "card",
      render: () => (
        <AppImage
          src={remoteSrc}
          alt="Priority placeholder"
          width={96}
          height={96}
          priority
          className="rounded-full"
        />
      ),
    },
    {
      label: "Sizing & styling",
      note: "width/height set intrinsic dimensions; className and style apply on top of either element.",
      background: "card",
      full: true,
      render: () => (
        <div className="flex flex-wrap items-end gap-4">
          <AppImage src={localSrc} alt="Small" width={48} height={48} className="rounded-md" />
          <AppImage src={localSrc} alt="Medium" width={80} height={80} className="rounded-md" />
          <AppImage
            src={localSrc}
            alt="Large with border"
            width={120}
            height={120}
            className="rounded-md ring-1 ring-[var(--theme-border-strong)]"
            style={{ opacity: 0.85 }}
          />
        </div>
      ),
    },
    {
      label: "Non-draggable",
      note: "draggable={false} blocks the browser's image drag-and-drop affordance.",
      background: "card",
      render: () => (
        <AppImage
          src={remoteSrc}
          alt="Non-draggable placeholder"
          width={96}
          height={96}
          draggable={false}
          className="rounded-lg"
        />
      ),
    },
  ],
  props: [
    {
      name: "src",
      type: "string | StaticImageData",
      description:
        "Local paths and StaticImageData use next/image. Managed canonical rasters use a native responsive image; other remote URLs use a direct image.",
    },
    { name: "alt", type: "string", description: "Required alt text for accessibility." },
    { name: "width", type: "number", description: "Intrinsic width in pixels." },
    { name: "height", type: "number", description: "Intrinsic height in pixels." },
    {
      name: "priority",
      type: "boolean",
      default: "false",
      description:
        "Eager-load for above-the-fold/LCP images. Local: sets next/image priority. Remote: sets loading=\"eager\" and fetchPriority=\"high\".",
    },
    {
      name: "sizes",
      type: "string",
      description:
        "Responsive sizes hint, forwarded to next/image (local) or the native <img> sizes attribute (remote).",
    },
    {
      name: "loading",
      type: '"lazy" | "eager"',
      default: '"lazy"',
      description: "Remote <img> loading mode; ignored when priority is set.",
    },
    { name: "draggable", type: "boolean", description: "Toggle the native image drag affordance." },
    { name: "className", type: "string", description: "Classes applied to the rendered element." },
    { name: "style", type: "CSSProperties", description: "Inline styles applied to the rendered element." },
    { name: "title", type: "string", description: "Native title/tooltip text." },
  ],
  whenToUse: [
    "Rendering an image whose source may be either a bundled/local asset or an external URL.",
    "Article and content imagery where remote hosts aren't in the next/image allowlist.",
  ],
  whenNotToUse: [
    "Pure local assets with a known import — call next/image directly if you don't need the remote fallback.",
    "Decorative CSS backgrounds — use a background-image utility instead.",
  ],
  notes: [
    "Local sources are StaticImageData or root-relative paths, excluding protocol-relative URLs. Only local images use Next's optimizer.",
    "Managed canonical raster URLs use responsive Worker candidates directly, with a withdrawal check on every request. Legacy R2 and other external fallbacks stay direct and have no managed withdrawal protection. Raw animations remain direct; full-fidelity viewers opt out of resizing with unoptimized.",
    "priority makes the remote branch eager: loading=\"eager\" plus fetchPriority=\"high\" (otherwise it stays lazy).",
  ],
};
