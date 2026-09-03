import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WarningBannerPreset, WarningBannerTarget } from "@/data/substanceWarningBanners";

const { useQueryMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
}));

vi.mock("convex/react", () => ({
  useQuery: useQueryMock,
}));

vi.mock("../../../../../convex/_generated/api", () => ({
  api: {
    warningBanners: { listPresets: "warningBanners.listPresets" },
    siteConfig: { getBannerDisplay: "siteConfig.getBannerDisplay" },
  },
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

const PRESET: WarningBannerPreset = {
  key: "opioid-respiratory",
  tone: "danger",
  icon: "custom:benzene",
  severityLabel: "Danger",
  headline: "Opioids and benzodiazepines stop breathing together",
  points: ["Both depress the brainstem respiratory drive"],
  enabled: true,
  allSubstances: false,
  enabledSlugs: ["diazepam"],
};

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
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        const method = init?.method ?? "GET";
        writes.push({ method, body });
        if (method === "DELETE") {
          return new Response(JSON.stringify({ removed: true }), { status: 200 });
        }
        const submitted = body.enabledSlugs as string[];
        return new Response(
          JSON.stringify({ enabledSlugs: submitted.filter((slug) => !prune.includes(slug)) }),
          { status: 200 },
        );
      }
      throw new Error(`Unexpected fetch ${url}`);
    }),
  );
  return writes;
}

function stubPresets(presets: WarningBannerPreset[]) {
  useQueryMock.mockImplementation((query: string) => {
    if (query === "warningBanners.listPresets") {
      return presets;
    }
    if (query === "siteConfig.getBannerDisplay") {
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
  await screen.findByText(/of 2 substances show a banner/);
}

beforeEach(() => {
  vi.unstubAllGlobals();
  useQueryMock.mockReset();
  stubPresets([PRESET]);
});

describe("WarningBannersTab presets", () => {
  it("saves an edited preset through the preset route and clears the dirty pill", async () => {
    const writes = stubApi();
    const user = userEvent.setup();
    render(<WarningBannersTab />);
    await waitForTargets();

    const headline = await openDrawer(user);
    const save = screen.getByRole("button", { name: /Save preset/ });
    expect(save).toBeDisabled();
    expect(screen.getByText("No changes")).toBeInTheDocument();

    await user.clear(headline);
    await user.type(headline, "  Mixing opioids and benzos  ");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(save).toBeEnabled();

    await user.click(save);

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].method).toBe("POST");
    expect(writes[0].body).toEqual({
      key: "opioid-respiratory",
      tone: "danger",
      icon: "custom:benzene",
      severityLabel: "Danger",
      headline: "Mixing opioids and benzos",
      points: ["Both depress the brainstem respiratory drive"],
      enabled: true,
      allSubstances: false,
      enabledSlugs: ["diazepam"],
    });
    // Origin and draft re-seed together from the write, so nothing is dirty and
    // the save button drops back to disabled.
    await waitFor(() => expect(screen.getByRole("button", { name: /Save preset/ })).toBeDisabled());
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
    expect(writes[0]).toEqual({ method: "DELETE", body: { key: "opioid-respiratory" } });
    await screen.findByText("Deleted opioid-respiratory. Nothing renders it now.");
    expect(screen.queryByLabelText("Headline")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the dialog's Keep preset from writing anything", async () => {
    const writes = stubApi();
    const user = userEvent.setup();
    render(<WarningBannersTab />);
    await waitForTargets();
    await openDrawer(user);

    await user.click(screen.getByRole("button", { name: /Delete preset/ }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Keep preset" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(writes).toHaveLength(0);
    expect(screen.getByLabelText("Headline")).toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: /Save preset/ }));

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
  it("enables a searched substance by writing the whole preset and offers Undo", async () => {
    const writes = stubApi();
    const user = userEvent.setup();
    render(<WarningBannersTab />);
    await waitForTargets();
    await openDrawer(user);

    await user.type(screen.getByLabelText("Find substances"), "alpraz");
    await user.click(screen.getByRole("button", { name: "Enable on Alprazolam" }));

    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0].method).toBe("POST");
    expect(writes[0].body).toMatchObject({
      key: "opioid-respiratory",
      headline: PRESET.headline,
      // `normalizeEnabledSlugs` sorts, so the new slug lands ahead of the stored one.
      enabledSlugs: ["alprazolam", "diazepam"],
    });

    await screen.findByText("Enabled opioid-respiratory on 1 substance.");
    expect(screen.getByRole("button", { name: "Disable on alprazolam" })).toBeInTheDocument();
    expect(screen.getByText("Enabled on 2 substances")).toBeInTheDocument();
    // The write came from inside the drawer, so the drawer must not call it dirty.
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Undo/ }));

    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[1].body.enabledSlugs).toEqual(["diazepam"]);
    await screen.findByText("Restored the previous list for opioid-respiratory.");
    expect(screen.queryByRole("button", { name: "Disable on alprazolam" })).not.toBeInTheDocument();
  });

  it("disables one slug from the Coverage view opened by deep link", async () => {
    const writes = stubApi();
    const user = userEvent.setup();
    render(<WarningBannersTab initialSubstanceSlug="diazepam" />);
    await waitForTargets();

    // Loose on the verb: the live copy reads "1 banner render here" (the plural
    // suffix is applied backwards), and grammar is not the contract under test.
    expect(screen.getByText(/^1 banner renders? here, in this order\.$/)).toBeInTheDocument();
    expect(screen.getByText(/^Opened from/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Disable on diazepam" }));

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
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url === TARGETS_API) {
          return new Response(JSON.stringify({ items: TARGETS }), { status: 200 });
        }
        return new Response(JSON.stringify({ error: "Convex rejected the write." }), {
          status: 500,
        });
      }),
    );
    const user = userEvent.setup();
    render(<WarningBannersTab initialSubstanceSlug="diazepam" />);
    await waitForTargets();

    await user.click(screen.getByRole("button", { name: "Disable on diazepam" }));

    // `SafetyBanner` previews carry `role="alert"` too, so locate the notice by its title.
    const title = await screen.findByText("Couldn't save that preset");
    expect(title.closest('[role="alert"]')).toHaveTextContent("Convex rejected the write.");
    expect(screen.queryByRole("button", { name: /Undo/ })).not.toBeInTheDocument();
  });
});
