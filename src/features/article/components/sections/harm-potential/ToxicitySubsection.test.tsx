import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SubstanceArticle } from "@/schema";
import { normalizeHarmPotential } from "./HarmPotentialUtils";
import { ToxicitySubsection } from "./ToxicitySubsection";

vi.mock("@/components/common/Icon", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} aria-hidden />,
}));

function renderOrganCards(systems: string[]) {
  const article = {
    references: [],
    harm_potential: {
      toxicity: {
        lethal_dosage: { ld50: [], notes: "" },
        organ_toxicity: systems.map((system) => ({ system, findings: `${system.trim()} findings.` })),
      },
    },
  } as unknown as SubstanceArticle;
  const harm = normalizeHarmPotential(article);
  if (!harm) throw new Error("fixture produced no harm potential");
  return render(<ToxicitySubsection toxicity={harm.toxicity} article={article} />);
}

describe("ToxicitySubsection organ cards", () => {
  it("renders every organ card with a glyph, resolving names loosely and falling back for unknown systems", () => {
    const { getByText } = renderOrganCards(["Respiratory System", " respiratory system ", "Unknown System"]);

    // InfoCard renders the glyph immediately before the title text.
    const iconFor = (title: string) =>
      getByText(title, { normalizer: (text) => text }).previousElementSibling?.getAttribute("data-icon");

    expect(iconFor("Respiratory System")).toBe("tabler:lungs");
    expect(iconFor(" respiratory system ")).toBe("tabler:lungs");
    // The previous fallback glyph was dropped upstream and rendered nothing, so
    // an unknown system card must still carry a resolvable icon name.
    expect(iconFor("Unknown System")).toBe("healthicons:body-outline");
  });
});
