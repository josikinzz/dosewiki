import { createRef } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type {
  WarningBannerPreset,
  WarningBannerTarget,
} from "@/data/substanceWarningBanners";
import { CoverageView } from "./CoverageView";
import { PresetsView, type BannerIconSizeControl } from "./PresetsView";

// Stubbed so the rendered glyph size is readable from the DOM: the whole point
// of the global setting is that every preview renders at the stored number.
vi.mock("@/components/common/Icon", () => ({
  Icon: ({ icon, size }: { icon: string; size?: number }) => (
    <span data-icon={icon} data-size={size} />
  ),
}));

vi.mock("@/hooks/useEditorRead", () => ({ useEditorRead: () => null }));

// The icon field resolves real Iconify ids over the network on a debounce.
vi.mock("@iconify/react", () => ({
  loadIcon: () => Promise.resolve({}),
}));

const PRESET: WarningBannerPreset = {
  key: "opioid-respiratory",
  tone: "danger",
  icon: "custom:banner-glyph",
  severityLabel: "Danger",
  headline: "Opioids and benzodiazepines stop breathing together",
  points: ["Both depress the brainstem respiratory drive"],
  enabled: true,
  enabledSlugs: ["diazepam"],
};

const TARGETS: WarningBannerTarget[] = [
  { slug: "diazepam", title: "Diazepam", classes: ["Benzodiazepine"] },
];

function iconSizeControl(
  overrides: Partial<BannerIconSizeControl> = {},
): BannerIconSizeControl {
  return {
    size: 58,
    text: "58",
    dirty: false,
    saveState: "idle",
    onTextChange: vi.fn(),
    onSave: vi.fn(),
    onReset: vi.fn(),
    ...overrides,
  };
}

function renderPresets(control: BannerIconSizeControl) {
  return render(
    <PresetsView
      presets={[PRESET]}
      targets={TARGETS}
      iconSizeControl={control}
      iconSizeNotice={null}
      onDismissIconSizeNotice={vi.fn()}
      draft={PRESET}
      saved={PRESET}
      isDirty={false}
      saveState="idle"
      iconValid
      notice={null}
      onDismissNotice={vi.fn()}
      saveKeyLabel="Ctrl S"
      listRef={createRef()}
      paneRef={createRef()}
      titleRef={createRef()}
      onIconValidityChange={vi.fn()}
      onDraftChange={vi.fn()}
      onOpen={vi.fn()}
      onCreate={vi.fn()}
      onSave={vi.fn()}
      onDiscard={vi.fn()}
      onClose={vi.fn()}
      onBackToList={vi.fn()}
      onRequestEnablement={vi.fn()}
      onRequestDelete={vi.fn()}
      onInspectCoverage={vi.fn()}
    />,
  );
}

const SIZE_LABEL = "Icon size · applies to every banner";

describe("global safety-banner icon size", () => {
  it("offers exactly one size control, beside the preset list and outside the open preset", () => {
    renderPresets(iconSizeControl());

    const field = screen.getByLabelText(SIZE_LABEL);
    expect(field).toHaveValue(58);
    expect(field).toHaveAttribute("min", "24");
    expect(field).toHaveAttribute("max", "72");

    // One number field on the whole view, drawer open and all: a second one
    // would mean the size had leaked into per-preset state.
    expect(screen.getAllByRole("spinbutton")).toHaveLength(1);

    // Beside the list, never in the pane: the size is not preset state.
    expect(screen.getByTestId("banner-preset-editor")).not.toContainElement(field);
    expect(screen.getByRole("region", { name: "Every banner" })).toContainElement(field);
  });

  it("renders the drawer preview glyph at the global size, inside the article frame", async () => {
    renderPresets(iconSizeControl());

    // The drawer previews the banner in the article frame, which is its own
    // document; the stack renders there while the article loads.
    const frame = screen.getByTitle(/Banner preview/) as HTMLIFrameElement;
    await waitFor(() =>
      expect(
        frame.contentDocument!.querySelectorAll('[data-icon="custom:banner-glyph"][data-size="58"]'),
      ).toHaveLength(1),
    );
  });

  it("renders every Coverage preview glyph at the global size", () => {
    const { container } = render(
      <CoverageView
        presets={[PRESET]}
        targets={TARGETS}
        iconSize={31}
        activeSlug="diazepam"
        onActiveSlugChange={vi.fn()}
        saveState="idle"
        onRequestEnablement={vi.fn()}
        onEditPreset={vi.fn()}
      />,
    );

    expect(
      container.querySelectorAll('[data-icon="custom:banner-glyph"][data-size="31"]'),
    ).toHaveLength(1);
  });
});
