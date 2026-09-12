import { describe, expect, it, vi } from "vitest";

import { resolveLocale } from "../../scripts/translation/locales.mjs";
import { glossaryDigestInput } from "./glossary";
import { promptVersionFor } from "./liveTranslation";

vi.mock("@server/postgres/runtime/backend", () => ({
  getDataBackend: () => "postgres",
  getPostgresConvexClient: () => ({ sql: vi.fn() }),
}));
vi.mock("@server/convex/publicData", () => ({}));
vi.mock("@server/convex/publicData.substances", () => ({}));

const zh = resolveLocale("zh-Hans");

describe("promptVersionFor over the approved glossary", () => {
  it("does not depend on the order rows arrive in", () => {
    const a = promptVersionFor(zh, { tolerance: "耐受性", comedown: "退效", "come-up": "上头" });
    const b = promptVersionFor(zh, { "come-up": "上头", comedown: "退效", tolerance: "耐受性" });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });

  it("changes when a rendering changes, a term is added, or the locale prompt differs", () => {
    const base = promptVersionFor(zh, { comedown: "退效" });
    expect(promptVersionFor(zh, { comedown: "退坡" })).not.toBe(base);
    expect(promptVersionFor(zh, { comedown: "退效", tolerance: "耐受性" })).not.toBe(base);
    expect(promptVersionFor(resolveLocale("nl"), { comedown: "退效" })).not.toBe(base);
  });

  it("digests the sorted term pairs and nothing else", () => {
    expect(glossaryDigestInput({ tolerance: "耐受性", "Come Up": "起效期", comedown: "退效" })).toBe(
      JSON.stringify([["Come Up", "起效期"], ["comedown", "退效"], ["tolerance", "耐受性"]]),
    );
    expect(glossaryDigestInput({})).toBe("[]");
  });
});
