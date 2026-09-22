import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EditorSelect } from "@/features/dev/components/EditorSelect";
import { ExpandButton } from "@/components/common/ExpandButton";
import { Button } from "./button";
import { Input } from "./input";
import { Textarea } from "./textarea";

/**
 * Mobile sizing contract for the shared controls: every compact button size
 * carries a 44px floor under a coarse pointer, and every compact field keeps
 * 16px on phones so iOS does not zoom on focus. jsdom cannot evaluate media
 * queries, so the contract is checked on the rendered class recipe.
 */
const COARSE_FLOOR = "[@media(pointer:coarse)]:min-h-11";
const MOBILE_TEXT = "text-[16px]";
const COARSE_HALO = "[@media(pointer:coarse)]:before:min-h-11";

describe("touch sizing of shared controls", () => {
  it.each(["sm", "pill", "xs", "chip", "quiet"] as const)("button size %s has a coarse-pointer 44px floor", (size) => {
    render(<Button size={size}>Act</Button>);
    expect(screen.getByRole("button", { name: "Act" }).className).toContain(COARSE_FLOOR);
  });

  it.each(["floating", "inline", "count", "faint"] as const)("expand button %s keeps its rendered box and floors the hit area invisibly", (variant) => {
    render(<ExpandButton isExpanded={false} onToggle={() => {}} variant={variant} count={3} ariaLabel="More" />);
    const className = screen.getByRole("button", { name: "More" }).className;
    expect(className).toContain(COARSE_HALO);
    expect(className).not.toContain(COARSE_FLOOR);
    expect(className).not.toContain("[@media(pointer:coarse)]:h-11");
  });

  it("small input, textarea, and editor select keep 16px on phones", () => {
    render(
      <>
        <Input inputSize="sm" aria-label="field" />
        <Textarea textareaSize="sm" aria-label="body" />
        <EditorSelect selectSize="sm" aria-label="pick" options={[{ value: "a", label: "A" }]} />
      </>,
    );
    expect(screen.getByLabelText("field").className).toContain(MOBILE_TEXT);
    expect(screen.getByLabelText("body").className).toContain(MOBILE_TEXT);
    expect(screen.getByLabelText("pick").className).toContain(MOBILE_TEXT);
  });
});
