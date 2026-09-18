import { act, render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { SessionContext, type SessionContextValue } from "next-auth/react";
import type { ReactNode } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as SiteFlavorModule from "@/config/siteFlavor";

import { ThemeProvider } from "@/context/ThemeContext";
import {
  EDITOR_HINT_MAX_AGE_MS,
  EDITOR_HINT_STORAGE_KEY,
  clearEditorHint,
  isFreshEditorHint,
  readEditorHint,
  writeEditorHint,
} from "@/lib/auth/editorHint";
import type { AppRole } from "@/lib/auth/roles";
import { AppearanceControls } from "./AppearanceControls";

vi.mock("@/config/siteFlavor", async (importOriginal) => {
  const actual = await importOriginal<typeof SiteFlavorModule>();
  return {
    ...actual,
    SITE_FLAVOR_CONFIG: actual.SITE_FLAVOR_CONFIGS.dosewiki,
    isEffectIndex: (config = actual.SITE_FLAVOR_CONFIGS.dosewiki) =>
      actual.isEffectIndex(config),
  };
});

vi.mock("@/components/common/Icon", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-testid="icon">{icon}</span>,
}));

/**
 * The Theme Lab entry is dev-gated: it appears for a dev-capable session, or
 * when the browser carries a fresh editor hint. The utility's storage behavior
 * is covered below.
 */

/** The session shapes the raw context can hold, built without standing up a provider or a fetch. */
function signedInAs(role: AppRole): SessionContextValue {
  return {
    status: "authenticated",
    data: {
      user: { name: "Editor", email: "editor@example.com", role },
      expires: "2099-01-01T00:00:00.000Z",
    },
    update: async () => null,
  };
}

const SIGNED_OUT: SessionContextValue = {
  status: "unauthenticated",
  data: null,
  update: async () => null,
};

function renderControls(session?: SessionContextValue) {
  const tree = (
    <ThemeProvider initialColorScheme="dark" initialVisualStyle="fun">
      <AppearanceControls />
    </ThemeProvider>
  );

  if (!session) {
    return render(tree);
  }

  return render(<SessionContext.Provider value={session}>{tree}</SessionContext.Provider>);
}

/**
 * Opens the cog by its `data-appearance-cog` hook rather than its label. The hook exists for this
 * (`AppearanceCog.tsx:95`), and the labels and icons in that panel are being reworked — this file is
 * about who sees the Lab entry, so it should not fail over a renamed control. The panel opens on
 * the font tab, so it also swaps to the colour tab, where the dev-gated Theme Lab entry shares
 * the footer row.
 */
async function openPanel(user: UserEvent) {
  const trigger = document.querySelector<HTMLButtonElement>("[data-appearance-cog]");

  if (!trigger) {
    throw new Error("The appearance cog must render its trigger before the panel can be opened.");
  }

  await user.click(trigger);

  const panel = await screen.findByRole("dialog");
  await within(panel).findAllByRole("button");

  const swap = within(panel).queryByRole("button", { name: "Show colour controls" });
  if (swap) {
    await user.click(swap);
  }

  return screen.findByRole("dialog");
}

/** The Lab entry is the panel's only full-width drawer action. */
function labEntry(panel: HTMLElement) {
  return within(panel).queryByRole("button", { name: "Open Theme Lab" });
}

describe("AppearanceControls Theme Lab entry", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("hides the Lab entry without a session or a local editor hint", async () => {
    const user = userEvent.setup();
    renderControls();

    const panel = await openPanel(user);

    expect(labEntry(panel)).not.toBeInTheDocument();
  });

  it("offers the Lab entry on a page with no session provider once the hint is stored", async () => {
    writeEditorHint();
    const user = userEvent.setup();
    renderControls();

    const panel = await openPanel(user);
    const entry = labEntry(panel);

    expect(entry).not.toBeNull();
    expect(entry).toBeInTheDocument();
  });

  it("offers the Lab entry when the session context itself says editor, before any hint lands", async () => {
    const user = userEvent.setup();
    renderControls(signedInAs("editor"));

    const panel = await openPanel(user);

    expect(labEntry(panel)).toBeInTheDocument();
  });

  it("keeps the entry for a signed-in viewer only while the dev hint is fresh", async () => {
    // The hint says a dev used this browser recently; providers.tsx retracts it
    // the moment a lesser session mounts a provider-backed page. Until then the
    // stale-but-fresh hint keeps the entry — presentation, not a boundary.
    writeEditorHint();
    const user = userEvent.setup();
    renderControls(signedInAs("viewer"));

    const panel = await openPanel(user);

    expect(labEntry(panel)).toBeInTheDocument();
  });

  it("hides the entry from a signed-in viewer without the hint", async () => {
    const user = userEvent.setup();
    renderControls(signedInAs("viewer"));

    const panel = await openPanel(user);

    expect(labEntry(panel)).not.toBeInTheDocument();
  });

  it("hides the entry from a signed-out reader without the hint", async () => {
    const user = userEvent.setup();
    renderControls(SIGNED_OUT);

    const panel = await openPanel(user);

    expect(labEntry(panel)).not.toBeInTheDocument();
  });

  it("treats an expired hint as no hint", async () => {
    window.localStorage.setItem(
      EDITOR_HINT_STORAGE_KEY,
      String(Date.now() - EDITOR_HINT_MAX_AGE_MS - 1),
    );
    const user = userEvent.setup();
    renderControls();

    const panel = await openPanel(user);

    expect(labEntry(panel)).not.toBeInTheDocument();
  });

  it("treats a hand-edited hint as no hint", async () => {
    window.localStorage.setItem(EDITOR_HINT_STORAGE_KEY, '{"role":"admin"}');
    const user = userEvent.setup();
    renderControls();

    const panel = await openPanel(user);

    expect(labEntry(panel)).not.toBeInTheDocument();
  });

  it("keeps the first render independent of browser-only hint storage", async () => {
    // The footer is server-rendered. Any future localStorage read must stay out
    // of the first render pass so the server and first client markup agree.
    writeEditorHint();

    const tree: ReactNode = (
      <ThemeProvider initialColorScheme="dark" initialVisualStyle="fun">
        <AppearanceControls />
      </ThemeProvider>
    );
    const container = document.createElement("div");
    document.body.append(container);

    // `src/test/setup.ts:10-22` replaces `window.localStorage` with a plain object, so the spy has
    // to sit on that rather than on `Storage.prototype` — which nothing here goes through.
    const getItem = vi.spyOn(window.localStorage, "getItem");
    const serverMarkup = renderToString(tree);
    expect(getItem.mock.calls.flat()).not.toContain(EDITOR_HINT_STORAGE_KEY);
    getItem.mockRestore();

    container.innerHTML = serverMarkup;

    const errors: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    });

    await act(async () => {
      hydrateRoot(container, tree);
    });

    // Only hydration complaints are of interest; `renderToString` in jsdom also warns about
    // `useLayoutEffect`, which is Radix's business and not this component's.
    expect(errors.filter((message) => /hydrat|did not match/i.test(message))).toEqual([]);
    // Hydration completes and the appearance control remains available.
    expect(container.querySelector("[data-appearance-cog]")).not.toBeNull();

    container.remove();
  });
});

describe("editor hint", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("stores a write time and nothing else", () => {
    const before = Date.now();
    writeEditorHint();

    const stored = window.localStorage.getItem(EDITOR_HINT_STORAGE_KEY);

    // No email, no role, no id — a value the reader could forge in one keystroke, which is the
    // point: there is nothing here worth forging.
    expect(stored).toMatch(/^\d+$/);
    expect(Number(stored)).toBeGreaterThanOrEqual(before);
    // Bounded to next-auth's own default session lifetime, so a stale hint lapses unattended.
    expect(EDITOR_HINT_MAX_AGE_MS).toBe(30 * 24 * 60 * 60 * 1000);
    // One key, sitting beside dosewiki-theme and friends. Nothing else was written.
    expect(window.localStorage.length).toBe(1);
    expect(window.localStorage.key(0)).toBe(EDITOR_HINT_STORAGE_KEY);
  });

  it("clears what it wrote", () => {
    writeEditorHint();
    expect(window.localStorage.getItem(EDITOR_HINT_STORAGE_KEY)).not.toBeNull();

    clearEditorHint();
    expect(window.localStorage.getItem(EDITOR_HINT_STORAGE_KEY)).toBeNull();
  });

  it("reports no hint when the store itself refuses", () => {
    // Safari's private mode and a full quota both throw on access. The reader loses a control, not
    // the page.
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });

    expect(readEditorHint()).toBe(false);
  });

  it("validates the stored value instead of trusting it", () => {
    const now = Date.parse("2026-08-17T12:00:00.000Z");

    expect(isFreshEditorHint(String(now), now)).toBe(true);
    expect(isFreshEditorHint(String(now - EDITOR_HINT_MAX_AGE_MS), now)).toBe(true);
    expect(isFreshEditorHint(String(now - EDITOR_HINT_MAX_AGE_MS - 1), now)).toBe(false);

    // Nothing here throws, and nothing here is a hint.
    expect(isFreshEditorHint(null, now)).toBe(false);
    expect(isFreshEditorHint("", now)).toBe(false);
    expect(isFreshEditorHint("yes", now)).toBe(false);
    expect(isFreshEditorHint('{"role":"admin"}', now)).toBe(false);
    expect(isFreshEditorHint("NaN", now)).toBe(false);
    expect(isFreshEditorHint("1e999", now)).toBe(false);
    expect(isFreshEditorHint("-1", now)).toBe(false);
    // A stamp in the future would never lapse, so it is refused rather than trusted.
    expect(isFreshEditorHint(String(now + 1000), now)).toBe(false);
  });
});
