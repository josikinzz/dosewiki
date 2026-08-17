import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import { MoleculeImage } from "./MoleculeImage";

vi.mock("@/components/common/AppImage", () => ({
  AppImage: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

function Harness({ src }: { src: string }) {
  const { setColorScheme, setVisualStyle } = useTheme();
  return (
    <>
      <button type="button" onClick={() => setVisualStyle("pro")}>Pro</button>
      <button type="button" onClick={() => setVisualStyle("fun")}>Fun</button>
      <button type="button" onClick={() => setColorScheme("dark")}>Dark</button>
      <MoleculeImage src={src} alt="Structure" width={100} height={100} />
    </>
  );
}

describe("MoleculeImage", () => {
  beforeEach(() => {
    document.documentElement.dataset.theme = "light";
    document.documentElement.dataset.visualStyle = "fun";
    localStorage.clear();
  });

  it("changes static molecule bytes with both appearance axes", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider
        initialColorScheme="light"
        initialVisualStyle="fun"
        isVisualStyleLocked={false}
      >
        <Harness src="/molecules/classes/tryptamine.svg" />
      </ThemeProvider>,
    );

    const image = screen.getByRole("img", { name: "Structure" });
    expect(image).toHaveAttribute("src", "/molecules/classes/tryptamine.svg");

    await user.click(screen.getByRole("button", { name: "Pro" }));
    expect(image).toHaveAttribute("src", "/molecules-ei/classes/tryptamine.svg");

    await user.click(screen.getByRole("button", { name: "Dark" }));
    expect(image).toHaveAttribute("src", "/molecules-ei-dark/classes/tryptamine.svg");

    await user.click(screen.getByRole("button", { name: "Fun" }));
    expect(image).toHaveAttribute("src", "/molecules/classes/tryptamine.svg");
  });

  it("changes dynamic route colorways without remounting", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider
        initialColorScheme="light"
        initialVisualStyle="fun"
        isVisualStyleLocked={false}
      >
        <Harness src="/api/molecules/lsd?v=published" />
      </ThemeProvider>,
    );

    const image = screen.getByRole("img", { name: "Structure" });
    await user.click(screen.getByRole("button", { name: "Pro" }));
    expect(image).toHaveAttribute(
      "src",
      "/api/molecules/lsd?v=published&colorway=pro-light",
    );

    await user.click(screen.getByRole("button", { name: "Dark" }));
    expect(image).toHaveAttribute(
      "src",
      "/api/molecules/lsd?v=published&colorway=pro-dark",
    );
  });
});
