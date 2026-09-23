import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
beforeEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});
it("searches translations, labels proposed and missing rows, and provides Arabic direction", async () => {
  page();
  expect(screen.getByText("Proposed")).toBeVisible();
  expect(screen.getByText("Translation missing")).toBeVisible();
  expect(screen.getByText("هدوء")).toHaveAttribute("dir", "rtl");
  fireEvent.change(screen.getByLabelText("Search English or translations"), {
    target: { value: "هدوء" },
  });
  expect(screen.queryByText("Energy")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Search English or translations"), {
    target: { value: "unknown" },
  });
  expect(screen.getByText("No terms match your search.")).toBeVisible();
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
  const disclosure = screen
    .getByText("Give feedback on Calm")
    .closest("details")!;
  disclosure.open = true;
  fireEvent(disclosure, new Event("toggle"));
  const comment = await screen.findByLabelText("Comment (optional)");
  fireEvent.change(comment, { target: { value: "A useful comment" } });
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Send privately" }),
    ).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "Send privately" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Try again");
  expect(comment).toHaveValue("A useful comment");
  fireEvent.click(screen.getByRole("button", { name: "Send privately" }));
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
  const disclosure = screen
    .getByText("Give feedback on Calm")
    .closest("details")!;
  disclosure.open = true;
  fireEvent(disclosure, new Event("toggle"));
  expect(
    await screen.findByRole("button", { name: "Clear reaction" }),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Needs improvement" }),
  ).toHaveAttribute("aria-pressed", "true");
});
