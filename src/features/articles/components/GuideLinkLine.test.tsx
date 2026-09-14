import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";


vi.mock("next/navigation", () => ({
  useSelectedLayoutSegments: () => null,
}));

vi.mock("@/components/common/Icon", () => ({
  Icon: () => null,
}));

import { UiLocaleProvider } from "@/i18n/client";
import { DISSOCIATIVE_INTENSITY_SCALE } from "../domain/articleGuides";
import { GuideLinkLine } from "./GuideLinkLine";

describe("GuideLinkLine", () => {
  it("keeps the canonical scale destination on the mirror", () => {
    render(
      <UiLocaleProvider locale="zh-Hans">
        <GuideLinkLine scale={DISSOCIATIVE_INTENSITY_SCALE} />
      </UiLocaleProvider>,
    );

    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/articles/dissociative-intensity-scale",
    );
  });

});
