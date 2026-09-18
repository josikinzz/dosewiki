import { expect, it, vi } from "vitest";

vi.mock("../../src/i18n/localeRegistry.mjs", async (importOriginal) => {
  const registry = await importOriginal<typeof import("../../src/i18n/localeRegistry.mjs")>();
  return {
    ...registry,
    PUBLIC_LOCALES: [
      ...registry.PUBLIC_LOCALES,
      {
        ...registry.LOCALE_REGISTRY.nl,
        publicHost: "translation-fixture.dose.wiki",
        pathPrefix: "/translation-fixture",
      },
    ],
  };
});

import { isPublicHost } from "./publicHostPolicy";
import { isUnavailablePublicDynamicPath } from "./publicRouteAvailability";

it("admits a newly published registry locale without treating its prefix as an unknown article", () => {
  expect(isPublicHost("translation-fixture.dose.wiki")).toBe(true);
  expect(isUnavailablePublicDynamicPath("/translation-fixture")).toBe(false);
});
