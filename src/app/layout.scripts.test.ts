import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The root layout renders on every route, `/dev` included, where the middleware
 * sends a per-request CSP nonce. `next/script` stamps that nonce on its server
 * render only (the browser's HeadManagerContext has none), so a `next/script`
 * in this layout is a hydration mismatch on every `/dev` page. The layout's
 * inline scripts are raw `<script>` elements allowed by their sha256 hashes.
 */
const source = readFileSync(resolve(__dirname, "layout.tsx"), "utf8");

describe("root layout inline scripts", () => {
  it("never renders next/script, whose nonce only the server knows", () => {
    expect(source).not.toMatch(/from\s+["']next\/script["']/);
    expect(source).not.toMatch(/<Script\b/);
  });

  it("renders the zod jitless bootstrap as a raw head script with the hashed builder's output", () => {
    expect(source).toMatch(
      /<script id="zod-jitless-bootstrap" dangerouslySetInnerHTML=\{\{ __html: zodJitlessBootstrap \}\} \/>/,
    );
    expect(source).toMatch(/const zodJitlessBootstrap = buildZodJitlessBootstrapScript\(\);/);
    const head = source.slice(source.indexOf("<head>"), source.indexOf("</head>"));
    expect(head).toContain('id="zod-jitless-bootstrap"');
  });
});
