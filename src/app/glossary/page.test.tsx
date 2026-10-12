import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { SITE_FLAVOR_CONFIG } from "@/config/siteFlavor";
import ChineseMessagesProvider from "@/i18n/ChineseMessagesProvider";
import {
  projectGlossary,
  glossaryLanguage,
} from "@/features/language-glossary/languageGlossary";

const mocks = vi.hoisted(() => ({
  readGlosses: vi.fn(),
  readPublicLanguageGlossary: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));
vi.mock("@server/translation/glossaryGloss", () => ({
  readGlosses: mocks.readGlosses,
}));
vi.mock("@server/translation/publicGlossary", () => ({
  readPublicLanguageGlossary: mocks.readPublicLanguageGlossary,
}));
vi.mock("@server/translation/glossaryUsage", () => ({
  getGlossaryUsages: vi.fn(async () => ({})),
}));
vi.mock("@server/data/publicData", () => ({
  getPublicTranslationCredits: vi.fn(async () => []),
}));
vi.mock("next/navigation", async (original) => ({
  ...(await original<object>()),
  permanentRedirect: mocks.redirect,
}));

import GlossaryPage, { generateMetadata } from "./page";
import ChineseGlossary, {
  generateMetadata as generateMirrorMetadata,
} from "../zh/glossary/page";
import OldGlossaryPage from "./[locale]/page";

beforeEach(() => {
  mocks.readGlosses.mockResolvedValue([
    { term: "Euphoria", kind: "effect-name", gloss: "A pleasurable state" },
  ]);
  mocks.readPublicLanguageGlossary.mockResolvedValue({
    language: glossaryLanguage("zh-Hans"),
    entries: projectGlossary(
      [{ term: "Euphoria", kind: "effect-name", gloss: "A pleasurable state" }],
      [
        {
          term: "Euphoria",
          target: "欣快",
          kind: "effect-name",
          status: "approved",
          provenance: "human_review",
          updated_at: 1,
        },
      ],
    ),
    usages: {},
  });
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response('{"choice":"clear"}'),
  );
});

it("renders the shared English reference with categorized definitions and search", async () => {
  render(await GlossaryPage({ searchParams: Promise.resolve({}) }));
  expect(
    within(document.getElementById("effects")!).getByText("Euphoria"),
  ).toBeVisible();
  expect(screen.getByText("A pleasurable state")).toHaveAttribute("lang", "en");
  fireEvent.change(screen.getByLabelText("Search terms"), {
    target: { value: "unknown" },
  });
  expect(screen.getByText("No terms match your search.")).toBeVisible();
});
it("renders the reference empty state", async () => {
  mocks.readGlosses.mockResolvedValue([]);
  render(await GlossaryPage({ searchParams: Promise.resolve({}) }));
  expect(screen.getByText("No glossary entries yet")).toBeVisible();
});
it("opens a Chinese suggestion on the plain Chinese route while leaving definitions English", async () => {
  render(
    <ChineseMessagesProvider>
      {await ChineseGlossary()}
    </ChineseMessagesProvider>,
  );
  expect(screen.getByRole("heading", { name: "术语表" })).toBeVisible();
  expect(screen.getByText("A pleasurable state")).toHaveAttribute("lang", "en");
  const row = screen.getByText("Euphoria").closest("dt")!.parentElement!;
  expect(within(row).getByText("已人工审校")).toHaveAttribute(
    "data-badge-tone",
    "green",
  );
  fireEvent.click(screen.getByRole("button", { name: /建议改进翻译/ }));
  expect(screen.getByLabelText("您的翻译")).toHaveAttribute("lang", "zh-Hans");
  expect(screen.getByRole("button", { name: "发送给审校者" })).toBeDisabled();
});
it.each([
  ["zh-Hans", "https://zh.dose.wiki/glossary"],
  ["ru", "https://ru.dose.wiki/glossary"],
  ["de", "/glossary?locale=de"],
  ["en", "/glossary"],
])(
  "redirects the old %s address to its single glossary",
  async (locale, href) => {
    await expect(
      OldGlossaryPage({ params: Promise.resolve({ locale }) }),
    ).rejects.toThrow(`redirect:${href}`);
  },
);
it("keeps English canonical metadata and mirror noindex policy", async () => {
  expect(
    (await generateMetadata({ searchParams: Promise.resolve({}) })).alternates
      ?.canonical,
  ).toBe(`${SITE_FLAVOR_CONFIG.launchSiteUrl}/glossary`);
  expect(generateMirrorMetadata().robots).toEqual({
    index: false,
    follow: false,
  });
});

it("shows Chinese success after a reader suggestion and keeps the term version", async () => {
  const sent: Record<string, unknown>[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    if (init?.method === "POST") sent.push(JSON.parse(String(init.body)));
    return new Response('{"choice":"clear"}', {
      status: init?.method === "POST" ? 202 : 200,
    });
  });
  render(
    <ChineseMessagesProvider>
      {await ChineseGlossary()}
    </ChineseMessagesProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /建议改进翻译/ }));
  fireEvent.change(screen.getByLabelText("您的翻译"), {
    target: { value: "欣快感" },
  });
  fireEvent.click(screen.getByRole("button", { name: "发送给审校者" }));
  expect(await screen.findByText("谢谢！审校者将查看您的建议。")).toBeVisible();
  expect(sent).toEqual([
    expect.objectContaining({
      locale: "zh-Hans",
      term: "Euphoria",
      alternative: "欣快感",
      version: expect.any(String),
    }),
  ]);
});

it("redirects a mirror locale query instead of publishing a second page", async () => {
  await expect(
    GlossaryPage({ searchParams: Promise.resolve({ locale: "zh-Hans" }) }),
  ).rejects.toThrow("redirect:https://zh.dose.wiki/glossary");
});

it("keeps an unlaunched translation glossary out of search indexes", async () => {
  expect(
    (
      await generateMetadata({
        searchParams: Promise.resolve({ locale: "de" }),
      })
    ).robots,
  ).toEqual({ index: false, follow: false });
});

it("explains a stale Chinese term and retains the reader's suggestion", async () => {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async (_url, init) =>
      new Response('{"choice":"clear"}', {
        status: init?.method === "POST" ? 409 : 200,
      }),
  );
  render(
    <ChineseMessagesProvider>
      {await ChineseGlossary()}
    </ChineseMessagesProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /建议改进翻译/ }));
  const input = screen.getByLabelText("您的翻译");
  fireEvent.change(input, { target: { value: "欣快感" } });
  fireEvent.click(screen.getByRole("button", { name: "发送给审校者" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "此术语已更改。请刷新页面后重试。",
  );
  expect(input).toHaveValue("欣快感");
});
