import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageGlossaryPage } from "./LanguageGlossaryPage";
import { HomeLanguageMenu } from "./HomeLanguageMenu";
import { glossaryLanguage, projectGlossary } from "./languageGlossary";
vi.mock("@/components/glossary/GlossaryUsageDisclosure", () => ({
  GlossaryUsageDisclosure: ({ term }: { term: string }) => (
    <button>Where {term} is used</button>
  ),
}));
const entries = projectGlossary(
  [
    { term: "Calm", kind: "effect-name", gloss: "Feeling calm" },
    { term: "Energy", kind: "effect-name", gloss: "Feeling energetic" },
  ],
  [
    {
      term: "Calm",
      target: "هدوء",
      kind: "effect-name",
      status: "draft",
      updated_at: 1,
    },
  ],
);
const page = () =>
  render(
    <LanguageGlossaryPage
      language={glossaryLanguage("ar")!}
      entries={entries}
      usages={{}}
      readiness={{
        state: "Glossary in review",
        href: "/glossary/ar",
        glossaryHref: "/glossary/ar",
      }}
    />,
  );
// The Radix Select overlays manage pointer capture and scrolling; jsdom has neither.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: () => false },
    setPointerCapture: { configurable: true, value: () => {} },
    releasePointerCapture: { configurable: true, value: () => {} },
    scrollIntoView: { configurable: true, value: () => {} },
  });
});
beforeEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});
it("searches translations, labels proposed and missing rows, and provides Arabic direction", async () => {
  page();
  expect(screen.getByText("Machine suggestion")).toBeVisible();
  expect(screen.getByRole("button", { name: /^Energy\s*Suggest a translation$/ })).toBeVisible();
  expect(screen.getByText("هدوء")).toHaveAttribute("dir", "rtl");
  fireEvent.change(screen.getByLabelText("Search terms"), {
    target: { value: "هدوء" },
  });
  expect(screen.queryByText("Energy")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Search terms"), {
    target: { value: "unknown" },
  });
  expect(screen.getByText("No terms match your search.")).toBeVisible();
});
const zhEntries = projectGlossary(
  [
    { term: "Phenidate", kind: "chemical-class", gloss: "" },
    { term: "Euphoria", kind: "effect-name", gloss: "" },
    { term: "Tracers", kind: "effect-name", gloss: "" },
    { term: "Drifting", kind: "effect-name", gloss: "" },
  ],
  [
    { term: "Phenidate", target: "Phenidate", kind: "chemical-class", status: "approved", provenance: "legacy_unverified", updated_at: 1 },
    { term: "Euphoria", target: "欣快", kind: "effect-name", status: "approved", provenance: "human_review", updated_at: 1 },
    { term: "Tracers", target: "拖影", kind: "effect-name", status: "draft", updated_at: 1 },
  ],
).map((entry) =>
  entry.term === "Phenidate"
    ? {
        ...entry,
        example: {
          english: "\u2026The phenidates, esters built on this scaffold, are the best-known branch of the family.",
          target: "\u2026以这一骨架构建的酯类，，phenidates，，是该家族最知名的分支。",
          href: "/chemical-classes/2-benzylpiperidines",
        },
      }
    : entry,
);
const zhPage = () =>
  render(
    <LanguageGlossaryPage
      language={glossaryLanguage("zh-Hans")!}
      entries={zhEntries}
      usages={{}}
      readiness={{ state: "Glossary in review", href: "/glossary/zh-Hans", glossaryHref: "/glossary/zh-Hans" }}
    />,
  );
const rowOf = (term: string) => screen.getByText(term, { selector: "span" }).closest("dt")!.parentElement!;
function chooseStatus(option: string) {
  fireEvent.pointerDown(screen.getByRole("combobox", { name: "Status" }), { button: 0, ctrlKey: false, pointerType: "mouse" });
  fireEvent.click(screen.getByRole("option", { name: option }));
}

it("says who checked each word without calling legacy wording checked", () => {
  zhPage();
  expect(within(rowOf("Phenidate")).getByText("Live, not yet checked")).toBeVisible();
  expect(within(rowOf("Phenidate")).queryByText("Checked by a person")).not.toBeInTheDocument();
  expect(within(rowOf("Euphoria")).getByText("Checked by a person")).toBeVisible();
  expect(within(rowOf("Tracers")).getByText("Machine suggestion")).toBeVisible();
  expect(within(rowOf("Drifting")).getByText("Not translated yet")).toBeVisible();
});

it("shows one English and Chinese example for a term with a usage, and none for a term without", () => {
  zhPage();
  const phenidate = within(rowOf("Phenidate"));
  expect(phenidate.getByText(/The phenidates, esters built on this scaffold/)).toHaveAttribute("lang", "en");
  expect(phenidate.getByText(/以这一骨架构建的酯类/)).toHaveAttribute("lang", "zh-Hans");
  expect(phenidate.getByRole("link", { name: "See this sentence on the site" })).toHaveAttribute("href", "/chemical-classes/2-benzylpiperidines");
  expect(within(rowOf("Euphoria")).queryByRole("link", { name: "See this sentence on the site" })).not.toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "See this sentence on the site" })).toHaveLength(1);
});

it("combines the status filter with search", () => {
  zhPage();
  chooseStatus("Live, not yet checked");
  expect(screen.getByText("Phenidate", { selector: "span" })).toBeVisible();
  expect(screen.queryByText("Euphoria", { selector: "span" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Search terms"), { target: { value: "欣快" } });
  // Euphoria matches the search but not the status; Phenidate the status but not the search.
  expect(screen.getByText("No terms match your search.")).toBeVisible();
  chooseStatus("Checked by a person");
  expect(screen.getByText("Euphoria", { selector: "span" })).toBeVisible();
  expect(screen.queryByText("Phenidate", { selector: "span" })).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("1 terms");
});

it("keeps a failed suggestion draft and acknowledges a retry", async () => {
  let posts = 0;
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (_url, init) => {
      if (init?.method !== "POST")
        return new Response('{"choice":"clear"}', { status: 200 });
      posts += 1;
      return posts === 1
        ? new Response('{"error":"Try again"}', { status: 503 })
        : new Response("{}", { status: 202 });
    });
  page();
  fireEvent.click(screen.getByRole("button", { name: /^Calm/ }));
  const comment = await screen.findByLabelText("Why is it better? (optional)");
  fireEvent.change(comment, { target: { value: "A useful comment" } });
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Send to reviewers" }),
    ).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Send to reviewers" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Try again");
  expect(comment).toHaveValue("A useful comment");
  fireEvent.click(screen.getByRole("button", { name: "Send to reviewers" }));
  await waitFor(() => expect(comment).toHaveValue(""));
  expect(
    fetcher.mock.calls
      .filter((call) => call[1]?.method !== "POST")
      .every((call) =>
        String(call[0]).startsWith("/api/glossary-feedback/identity"),
      ),
  ).toBe(true);
  const sent = fetcher.mock.calls.filter((call) => call[1]?.method === "POST");
  const first = JSON.parse(String(sent[0][1]?.body));
  const retry = JSON.parse(String(sent[1][1]?.body));
  expect(retry.id).toBe(first.id);
  expect(first).not.toHaveProperty("turnstileToken");
});
it("lists terms that still need a person first and keeps checked terms in their own section", () => {
  zhPage();
  const terms = screen
    .getAllByRole("button", { name: /Suggest a (better )?translation/ })
    .map((button) => button.querySelector('span[lang="en"]')!.textContent);
  expect(terms).toEqual(["Drifting", "Tracers", "Phenidate", "Euphoria"]);
  expect(screen.getByRole("heading", { name: "Needs a person" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Checked by a person" })).toBeVisible();
  expect(screen.getByText("1 of 4 terms checked by a person · 3 need help")).toBeVisible();
});

it("opens one term's suggestion box at a time, and asks for a first translation of an untranslated term", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response('{"choice":"clear"}', { status: 200 }),
  );
  zhPage();
  const drifting = screen.getByRole("button", { name: /^Drifting/ });
  expect(drifting).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(drifting);
  expect(drifting).toHaveAttribute("aria-expanded", "true");
  const translation = screen.getByLabelText("Your translation");
  expect(translation).toHaveAttribute("lang", "zh-Hans");
  // No wording yet, so nothing to react to, and a comment alone is not a translation.
  expect(screen.queryByRole("button", { name: "Looks right" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Note for reviewers (optional)"), { target: { value: "Hmm" } });
  expect(screen.getByRole("button", { name: "Send to reviewers" })).toBeDisabled();
  fireEvent.change(translation, { target: { value: "漂移" } });
  expect(screen.getByRole("button", { name: "Send to reviewers" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: /^Tracers/ }));
  expect(drifting).toHaveAttribute("aria-expanded", "false");
  expect(translation).not.toBeInTheDocument();
  expect(await screen.findByLabelText("Your translation")).toHaveAttribute("placeholder", "拖影");
  expect(screen.getByRole("button", { name: "Looks right" })).toBeInTheDocument();
});
it("opens language destinations and returns keyboard focus after Escape", async () => {
  const user = userEvent.setup();
  render(
    <HomeLanguageMenu
      languages={[
        {
          ...glossaryLanguage("ar")!,
          href: "/glossary/ar",
          readiness: "Glossary in review",
        },
      ]}
    />,
  );
  const trigger = screen.getByRole("button", { name: "Languages" });
  trigger.focus();
  await user.keyboard("{Enter}");
  expect(
    await screen.findByRole("menuitem", { name: /Arabic/ }),
  ).toHaveAttribute("href", "/glossary/ar");
  expect(
    screen.getByRole("menuitem", { name: "All glossaries" }),
  ).toHaveAttribute("href", "/glossary/languages");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(trigger).toHaveFocus());
});

it("restores the stored reaction in a new session and offers removal", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response('{"choice":"improve"}', { status: 200 }),
  );
  page();
  fireEvent.click(screen.getByRole("button", { name: /^Calm/ }));
  expect(
    await screen.findByRole("button", { name: "Clear reaction" }),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Needs improvement" }),
  ).toHaveAttribute("aria-pressed", "true");
});
it("credits the language's translation contributors near the header, and omits the block when no one is credited", () => {
  const { unmount } = render(
    <LanguageGlossaryPage
      language={glossaryLanguage("zh-Hans")!}
      entries={entries}
      usages={{}}
      readiness={{ state: "Glossary in review", href: "/glossary/zh-Hans", glossaryHref: "/glossary/zh-Hans" }}
      credits={[{
        key: "VACUE",
        displayName: "Vacue",
        avatarUrl: null,
        href: "https://x.com/Vacue138950",
        contribution: "Chinese localization, terminology review, and localization workflow feedback",
      }]}
    />,
  );
  const credits = within(screen.getByRole("region", { name: "Translation contributors" }));
  expect(credits.getByRole("link", { name: "Vacue" })).toHaveAttribute("href", "https://x.com/Vacue138950");
  expect(credits.getByText("Chinese localization, terminology review, and localization workflow feedback")).toBeVisible();
  unmount();

  page();
  expect(screen.queryByRole("region", { name: "Translation contributors" })).toBeNull();
});
