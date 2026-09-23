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

import { localeForHost, localizedIndexRoutePath, localizedRecordRoutePath } from "./localeHostPolicy";
import { localeForPathname, parseUiLocale, formattingLocale } from "../../src/i18n/messages";

it("routes Russian reading pages and preserves the locale through client and API inputs", () => {
  const locale = localeForHost("ru.dose.wiki");
  expect(locale?.code).toBe("ru");
  expect(isPublicHost("ru.dose.wiki")).toBe(true);
  expect(isUnavailablePublicDynamicPath("/ru")).toBe(false);
  expect(localizedIndexRoutePath(locale!, "/about")).toBe("/ru/about");
  expect(localizedRecordRoutePath(locale!, "/reports/example")?.path).toBe("/ru/reports/example");
  expect(localeForPathname("/ru/about")).toBe("ru");
  expect(parseUiLocale("ru")).toBe("ru");
  expect(parseUiLocale("not-a-locale")).toBe("en");
  expect(formattingLocale("ru")).toBe("ru-RU");
});
