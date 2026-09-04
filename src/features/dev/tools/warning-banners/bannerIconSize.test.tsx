import { render, screen } from "@testing-library/react";
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
      openKey={PRESET.key}
      draft={PRESET}
      isNew={false}
      isDirty={false}
      saveState="idle"
      iconValid
      onIconValidityChange={vi.fn()}
      onDraftChange={vi.fn()}
      onOpen={vi.fn()}
      onCreate={vi.fn()}
      onSave={vi.fn()}
      onDiscard={vi.fn()}
      onRequestEnablement={vi.fn()}
      onRequestDelete={vi.fn()}
      onInspectCoverage={vi.fn()}
    />,
  );
}

const SIZE_LABEL = "Icon size · applies to every banner";

describe("global safety-banner icon size", () => {
  it("offers exactly one size control, in the global toolbar beside New preset", () => {
    renderPresets(iconSizeControl());

    const field = screen.getByLabelText(SIZE_LABEL);
    expect(field).toHaveValue(58);
    expect(field).toHaveAttribute("min", "24");
    expect(field).toHaveAttribute("max", "72");

    // One number field on the whole view, drawer open and all: a second one
    // would mean the size had leaked into per-preset state.
    expect(screen.getAllByRole("spinbutton")).toHaveLength(1);

    const [globalToolbar] = screen.getAllByRole("toolbar");
    expect(globalToolbar).toContainElement(field);
    expect(globalToolbar).toContainElement(
      screen.getByRole("button", { name: /New preset/ }),
    );
  });

  it("keeps the size save distinct from the preset save", () => {
    const onSave = vi.fn();
    const { rerender, container } = renderPresets(iconSizeControl());

    const sizeSave = screen.getByRole("button", { name: /Save size/ });
    const sizeReset = screen.getByRole("button", { name: /Reset/ });
    expect(sizeSave).toBeDisabled();
    expect(sizeReset).toBeDisabled();
    expect(screen.getByRole("button", { name: /Save preset/ })).toBeInTheDocument();
    expect(container.textContent).not.toContain("Unsaved size");

    rerender(
      <PresetsView
        presets={[PRESET]}
        targets={TARGETS}
        iconSizeControl={iconSizeControl({ dirty: true, size: 60, text: "60", onSave })}
        openKey={PRESET.key}
        draft={PRESET}
        isNew={false}
        isDirty={false}
        saveState="idle"
        iconValid
        onIconValidityChange={vi.fn()}
        onDraftChange={vi.fn()}
        onOpen={vi.fn()}
        onCreate={vi.fn()}
        onSave={vi.fn()}
        onDiscard={vi.fn()}
        onRequestEnablement={vi.fn()}
        onRequestDelete={vi.fn()}
        onInspectCoverage={vi.fn()}
      />,
    );

    const dirtySave = screen.getByRole("button", { name: /Save size/ });
    expect(dirtySave).toBeEnabled();
    dirtySave.click();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Unsaved size")).toBeInTheDocument();
  });

  it("says which number the server will believe when the field is out of range", () => {
    renderPresets(iconSizeControl({ text: "9", size: 24, dirty: true }));

    expect(screen.getByText("Sizes run 24–72px; 9 saves as 24px.")).toBeInTheDocument();
  });

  it("renders the drawer preview glyph at the global size", () => {
    const { container } = renderPresets(iconSizeControl());

    const glyphs = container.querySelectorAll('[data-icon="custom:banner-glyph"][data-size="58"]');
    expect(glyphs).toHaveLength(1);
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
