import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/context/ThemeContext";
import type { AccentId, VisualStyle } from "@/theme";
import { ACCENTS, getAccent } from "@/theme/accents";
import { getPreset } from "./palettePresets";
import type { ThemeLabState } from "./paletteLabTheme";
import { ThemeGallery } from "./ThemeGallery";

/**
 * What the gallery *claims* about the page, checked against the cascade.
 *
 * The gallery reports two axes it does not own, so these tests pin the claim
 * rather than the styling: a card may only be badged "active" when the selection
 * is what the stylesheets actually resolve. The accent table drives the
 * expectations here too — the colourway names are read from `funPresetId`, so a
 * hard-coded mapping in the component would fail the moment the table changed.
 */

vi.mock("@/components/common/Icon", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}));

const SAVED_PRESET_ID = "garnet";

function labState(presetId = SAVED_PRESET_ID): ThemeLabState {
  return { activeThemeRef: { kind: "preset", id: presetId }, editsByPreset: {}, customThemes: [] };
}

function renderGallery({
  accent = "default",
  visualStyle = "fun",
  state = labState(),
  changedCount = 0,
}: {
  accent?: AccentId;
  visualStyle?: VisualStyle;
  state?: ThemeLabState;
  changedCount?: number;
} = {}) {
  return render(
    <ThemeProvider
      initialColorScheme="dark"
      initialVisualStyle={visualStyle}
      initialAccent={accent}
      isVisualStyleLocked={false}
      isAccentLocked={false}
    >
      <ThemeGallery
        themeState={state}
        changedCount={changedCount}
        onSelect={() => {}}
        onChanged={() => {}}
      />
    </ThemeProvider>,
  );
}

/** The provider reads back what the bootstrap painted, so a leftover attribute
 *  from a previous case would decide the next one's accent. */
beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-accent");
  document.documentElement.removeAttribute("data-visual-style");
});

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-accent");
  document.documentElement.removeAttribute("data-visual-style");
});

/** Every accent but the default; each carries a whole colourway in its Fun half. */
const OVERRIDING_ACCENTS = ACCENTS.filter(
  (accent) => accent.funPresetId !== null && accent.funPresetId !== SAVED_PRESET_ID,
);

describe("ThemeGallery, accent-aware", () => {
  it.each(OVERRIDING_ACCENTS.map((accent) => accent.id))(
    "names the colourway the %s accent paints instead of the saved one",
    (accentId) => {
      const { funPresetId, label } = getAccent(accentId);
      const painting = getPreset(funPresetId).name;
      const saved = getPreset(SAVED_PRESET_ID).name;

      renderGallery({ accent: accentId });

      const notice = screen.getByRole("status");
      expect(notice).toHaveTextContent(`The ${label} accent carries a whole colourway`);
      expect(notice).toHaveTextContent(`${painting} is painting`);
      expect(notice).toHaveTextContent(`your saved ${saved} sits under it`);

      // The claim, not the styling: the saved card is still the selection
      // (`aria-pressed`), and the accent's colourway is what wears "painting".
      // Card names are matched by prefix because a badge glues straight onto the
      // name, the way `PaletteLab.test.tsx:467` matches them.
      const savedCard = screen.getByRole("button", { name: new RegExp(`^${saved}`) });
      expect(savedCard).toHaveAttribute("aria-pressed", "true");
      expect(within(savedCard).getByText("saved")).toBeInTheDocument();

      const paintingCard = screen.getByRole("button", { name: new RegExp(`^${painting}`) });
      expect(paintingCard).toHaveAttribute("aria-pressed", "false");
      expect(within(paintingCard).getByText("painting")).toBeInTheDocument();
      expect(screen.queryByText("active")).not.toBeInTheDocument();
    },
  );

  it("keeps the saved theme active when the accent wears that same colourway", () => {
    const accent = ACCENTS.find((entry) => entry.funPresetId === SAVED_PRESET_ID);
    expect(accent).toBeDefined();

    renderGallery({ accent: accent!.id });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.queryByText("painting")).not.toBeInTheDocument();
  });

  it("keeps the saved theme active under the default accent, edits included", () => {
    renderGallery({ changedCount: 3 });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText("active · edited")).toBeInTheDocument();
  });
});

describe("ThemeGallery, style-aware", () => {
  it("states that Pro's palette masks a colourway selection", () => {
    renderGallery({ visualStyle: "pro" });

    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("Pro paints from its own palette");
    expect(notice).toHaveTextContent("only the hue seeds Pro leaves alone");

    const saved = getPreset(SAVED_PRESET_ID).name;
    const savedCard = screen.getByRole("button", { name: new RegExp(`^${saved}`) });
    expect(within(savedCard).getByText("saved")).toBeInTheDocument();
    expect(screen.queryByText("active")).not.toBeInTheDocument();
    expect(screen.queryByText("painting")).not.toBeInTheDocument();
  });

  it("says nothing about the accent's colourway under Pro, where its Fun block cannot apply", () => {
    const overriding = OVERRIDING_ACCENTS[0];
    renderGallery({ accent: overriding.id, visualStyle: "pro" });

    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("Pro paints from its own palette");
    expect(notice).not.toHaveTextContent("carries a whole colourway");
  });
});
