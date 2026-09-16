import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WarningBannerPreset, WarningBannerTarget } from "@/data/substanceWarningBanners";
import type { EditableWarningPreset } from "./warningEditing";

const { useQueryMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
}));

vi.mock("@/hooks/useEditorRead", () => ({
  useEditorRead: useQueryMock,
  useInvalidateEditorReads: () => async () => undefined,
}));

// The icon field resolves Iconify ids over the network on a debounce. Every
// preset here uses a `custom:` glyph, which resolves synchronously from the
// bundled map, so `loadIcon` is never reached; it is stubbed so the import of
// the mocked module still resolves the name.
vi.mock("@iconify/react", () => ({
  Icon: () => null,
  addCollection: () => {},
  loadIcon: () => Promise.resolve({}),
}));

import { WarningBannersTab } from "./WarningBannersTab";

const PRESET_API = "/api/dev/warning-banner";
const TARGETS_API = "/api/dev/warning-banner/targets";

const TARGETS: WarningBannerTarget[] = [
  { slug: "diazepam", title: "Diazepam", classes: ["Benzodiazepine"] },
  { slug: "alprazolam", title: "Alprazolam", classes: ["Benzodiazepine"] },
];

const PRESET: EditableWarningPreset = {
  key: "opioid-respiratory",
  tone: "danger",
  icon: "custom:benzene",
  severityLabel: "Danger",
  headline: "Opioids and benzodiazepines stop breathing together",
  points: ["Both depress the brainstem respiratory drive"],
  enabled: true,
  allSubstances: false,
  enabledSlugs: ["diazepam"],
  baseHash: "a".repeat(64),
};

let storedPresets: WarningBannerPreset[] = [];

type PresetWrite = { method: string; body: Record<string, unknown> };

/**
 * Routes the three endpoints the tab talks to. The preset POST echoes the
 * submitted `enabledSlugs` minus anything in `prune`, which is how the real
 * route behaves for slugs that no longer resolve to an article.
 */
function stubApi({ prune = [] }: { prune?: string[] } = {}) {
  const writes: PresetWrite[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === TARGETS_API) {
        return new Response(JSON.stringify({ items: TARGETS }), { status: 200 });
      }
      if (url === PRESET_API) {
        if (!init?.method || init.method === "GET") {
          return new Response(JSON.stringify({ presets: storedPresets }), { status: 200 });
        }
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        const method = init?.method ?? "GET";
        writes.push({ method, body });
        if (method === "DELETE") {
          return new Response(JSON.stringify({ removed: true, changeId: body.changeId, baseHash: "b".repeat(64) }), { status: 200 });
        }
        const submitted = body.enabledSlugs as string[];
        return new Response(
          JSON.stringify({ changeId: body.changeId, baseHash: "b".repeat(64),
            preset: { ...body, enabledSlugs: submitted.filter((slug) => !prune.includes(slug)) },
            enabledSlugs: submitted.filter((slug) => !prune.includes(slug)) }),
          { status: 200 },
        );
      }
      throw new Error(`Unexpected fetch ${url}`);
    }),
  );
  return writes;
}

function stubPresets(presets: WarningBannerPreset[]) {
  storedPresets = presets;
  useQueryMock.mockImplementation((query: string) => {
    if (query === "siteConfig:getBannerDisplay") {
      return { iconSize: 40 };
    }
    throw new Error(`Unexpected query ${query}`);
  });
}

async function openDrawer(user: UserEvent) {
  await user.click(screen.getByRole("button", { name: new RegExp(PRESET.key), expanded: false }));
  return screen.getByLabelText("Headline");
}

async function waitForTargets() {
  await screen.findByRole("button", { name: new RegExp(PRESET.key), expanded: false });
}

/**
 * Every enablement write and every delete asks first. Returns the dialog so a
 * test can read its copy before confirming.
 */
async function confirmWrite(user: UserEvent, label: string | RegExp) {
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: label }));
  return dialog;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  useQueryMock.mockReset();
  stubPresets([PRESET]);
});

describe("WarningBannersTab presets", () => {
  it("publishes an edited preset only after confirmation and clears local dirty state", async () => {
    const writes = stubApi();
    const user = userEvent.setup();
    render(<WarningBannersTab />);
    await waitForTargets();

    const headline = await openDrawer(user);
    const save = screen.getByRole("button", { name: /Publish preset/ });
    expect(save).toBeDisabled();
    expect(screen.getByText("No changes")).toBeInTheDocument();

    await user.clear(headline);
    await user.type(headline, "  Mixing opioids and benzos  ");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(save).toBeEnabled();

    await user.click(save);
    expect(writes).toHaveLength(0);
    await confirmWrite(user, "Publish preset");

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].method).toBe("POST");
    expect(writes[0].body).toMatchObject({
      headline: "Mixing opioids and benzos",
      baseHash: PRESET.baseHash,
    });
    // Origin and draft re-seed together from the write, so nothing is dirty and
    // the save button drops back to disabled.
    await waitFor(() => expect(screen.getByRole("button", { name: /Publish preset/ })).toBeDisabled());
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
    expect(screen.queryByText(/dropped on save/)).not.toBeInTheDocument();
    expect(screen.queryByText("Couldn't save that preset")).not.toBeInTheDocument();
  });

  it("deletes a preset only after the dialog confirms, then closes the drawer", async () => {
    const writes = stubApi();
    const user = userEvent.setup();
    render(<WarningBannersTab />);
    await waitForTargets();
    await openDrawer(user);

    await user.click(screen.getByRole("button", { name: /Delete preset/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("opioid-respiratory is enabled on 1 substance.");
    expect(writes).toHaveLength(0);

    await user.click(within(dialog).getByRole("button", { name: /Delete preset/ }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].method).toBe("DELETE");
    await screen.findByText("Deleted opioid-respiratory. Nothing renders it now.");
    expect(screen.queryByLabelText("Headline")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps the dialog's Cancel from writing anything", async () => {
    const writes = stubApi();
    const user = userEvent.setup();
    render(<WarningBannersTab />);
    await waitForTargets();
    await openDrawer(user);

    await user.click(screen.getByRole("button", { name: /Delete preset/ }));
    await confirmWrite(user, "Cancel");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(writes).toHaveLength(0);
    expect(screen.getByLabelText("Headline")).toBeInTheDocument();
  });

  it("reads coverage by tone and names sitewide presets instead of counting them", async () => {
    stubPresets([
      PRESET,
      {
        ...PRESET,
        key: "citation-system-overhaul-1",
        tone: "caution",
        enabledSlugs: [],
        allSubstances: true,
      },
      { ...PRESET, key: "dormant-danger", enabled: false, enabledSlugs: ["alprazolam"] },
    ]);
    stubApi();
    render(<WarningBannersTab />);
    await waitForTargets();
    await userEvent.click(screen.getByRole("tab", { name: /Coverage/ }));
    await screen.findByText(/of 2 substances are on a banner list/);

    // One danger substance, not "2 of 2": the sitewide caution notice is a
    // preset, never every slug, and the switched-off preset counts for nothing.
    const summary = screen.getByText(
      "1 of 2 substances are on a banner list. 1 sitewide preset reaches every article, including ones published later.",
    );
    const tones = within(summary.previousElementSibling as HTMLElement);
    expect(tones.getByText("danger").closest("div")).toHaveTextContent("1of 2 substances");
    expect(tones.getByText("unsafe").closest("div")).toHaveTextContent("0of 2 substances");
    expect(tones.getByText("caution").closest("div")).toHaveTextContent(
      "Every article1 sitewide preset",
    );
  });

  it("adopts the echoed slug list and reports slugs the server pruned", async () => {
    stubPresets([{ ...PRESET, enabledSlugs: ["diazepam", "ghost-slug"] }]);
    const writes = stubApi({ prune: ["ghost-slug"] });
    const user = userEvent.setup();
    render(<WarningBannersTab />);
    await waitForTargets();

    const headline = await openDrawer(user);
    expect(screen.getByRole("button", { name: "Disable on ghost-slug" })).toBeInTheDocument();
    expect(screen.getByText("Enabled on 2 substances")).toBeInTheDocument();

    await user.type(headline, "!");
    await user.click(screen.getByRole("button", { name: /Publish preset/ }));
    await confirmWrite(user, "Publish preset");

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].body.enabledSlugs).toEqual(["diazepam", "ghost-slug"]);

    const notice = await screen.findByText("1 slug dropped on save");
    expect(notice.closest('[role="note"]')).toHaveTextContent(
      "Saved, but these do not resolve to an article and were removed: ghost-slug. Everything else is stored as submitted.",
    );
    // Never optimistic: the drawer shows the server's list, not the submitted one.
    expect(screen.queryByRole("button", { name: "Disable on ghost-slug" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disable on diazepam" })).toBeInTheDocument();
    expect(screen.getByText("Enabled on 1 substance")).toBeInTheDocument();
  });
});

describe("WarningBannersTab coverage", () => {
  it("enables a searched substance only after the dialog confirms, writes the whole preset and offers Undo", async () => {
    const writes = stubApi();
    const user = userEvent.setup();
    render(<WarningBannersTab />);
    await waitForTargets();
    const headline = await openDrawer(user);
    await user.type(headline, "!");

    await user.type(screen.getByLabelText("Find substances"), "alpraz");
    await user.click(screen.getByRole("button", { name: "Enable on Alprazolam" }));

    // Nothing is written until the dialog agrees, and the dialog says the
    // unsaved headline rides along.
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Enable opioid-respiratory on Alprazolam?");
    expect(dialog).toHaveTextContent("Readers of Alprazolam see this banner");
    expect(dialog).toHaveTextContent("Unsaved edits to its words are saved with it.");
    expect(writes).toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: "Enable on alprazolam" }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].method).toBe("POST");
    expect(writes[0].body).toMatchObject({
      key: "opioid-respiratory",
      headline: `${PRESET.headline}!`,
      // `normalizeEnabledSlugs` sorts, so the new slug lands ahead of the stored one.
      enabledSlugs: ["alprazolam", "diazepam"],
    });

    await screen.findByText("Enabled opioid-respiratory on 1 substance.");
    expect(screen.getByRole("button", { name: "Disable on alprazolam" })).toBeInTheDocument();
    expect(screen.getByText("Enabled on 2 substances")).toBeInTheDocument();
    // The write came from inside the drawer, so the drawer must not call it dirty.
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();

    // Undo is the escape hatch and never asks.
    await user.click(screen.getByRole("button", { name: /Undo/ }));

    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[1].body.enabledSlugs).toEqual(["diazepam"]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await screen.findByText("Restored the previous list for opioid-respiratory.");
    expect(screen.queryByRole("button", { name: "Disable on alprazolam" })).not.toBeInTheDocument();
  });

  it("keeps staged ticks when the enable dialog is cancelled", async () => {
    const writes = stubApi();
    const user = userEvent.setup();
    render(<WarningBannersTab />);
    await waitForTargets();
    await openDrawer(user);

    await user.type(screen.getByLabelText("Find substances"), "alpraz");
    await user.click(screen.getByLabelText("Stage alprazolam"));
    await user.click(screen.getByRole("button", { name: "Enable on 1 substance" }));
    await confirmWrite(user, "Cancel");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(writes).toHaveLength(0);
    expect(screen.getByLabelText("Stage alprazolam")).toBeChecked();
    expect(screen.getByRole("button", { name: "Enable on 1 substance" })).toBeEnabled();
  });

  it("disables one slug from the Coverage view opened by deep link", async () => {
    const writes = stubApi();
    const user = userEvent.setup();
    render(<WarningBannersTab initialSubstanceSlug="diazepam" />);
    await screen.findByRole("button", { name: "Disable on diazepam" });

    // Loose on the verb: the live copy reads "1 banner render here" (the plural
    // suffix is applied backwards), and grammar is not the contract under test.
    expect(screen.getByText(/^1 banner renders? here, in this order\.$/)).toBeInTheDocument();
    expect(screen.getByText(/^Coverage started on/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Disable on diazepam" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Disable opioid-respiratory on Diazepam?");
    expect(dialog).toHaveTextContent(
      "Readers of Diazepam stop seeing this banner as soon as you confirm. It will render nowhere afterwards.",
    );
    expect(writes).toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: "Disable on diazepam" }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].method).toBe("POST");
    expect(writes[0].body).toMatchObject({
      key: "opioid-respiratory",
      enabled: true,
      enabledSlugs: [],
    });
    await screen.findByText("Disabled opioid-respiratory on diazepam.");

    await user.click(screen.getByRole("button", { name: /Undo/ }));

    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[1].body.enabledSlugs).toEqual(["diazepam"]);
    await screen.findByText("Restored the previous list for opioid-respiratory.");
  });

  it("surfaces a failed write and leaves the stored list alone", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === TARGETS_API) {
          return new Response(JSON.stringify({ items: TARGETS }), { status: 200 });
        }
        if (url === PRESET_API && !init?.method) {
          return new Response(JSON.stringify({ presets: storedPresets }), { status: 200 });
        }
        return new Response(JSON.stringify({ error: "Postgres rejected the write." }), {
          status: 409,
        });
      }),
    );
    const user = userEvent.setup();
    render(<WarningBannersTab initialSubstanceSlug="diazepam" />);
    await screen.findByRole("button", { name: "Disable on diazepam" });

    await user.click(screen.getByRole("button", { name: "Disable on diazepam" }));
    await confirmWrite(user, "Disable on diazepam");

    // `SafetyBanner` previews carry `role="alert"` too, so locate the notice by its title.
    const title = await screen.findByText("Couldn't save that preset");
    expect(title.closest('[role="alert"]')).toHaveTextContent("Postgres rejected the write.");
    expect(screen.queryByRole("button", { name: /Undo/ })).not.toBeInTheDocument();
  });
});
