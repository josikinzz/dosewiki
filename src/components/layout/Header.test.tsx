import { render, screen } from "@testing-library/react";
import { forwardRef } from "react";
import type { AnchorHTMLAttributes, ComponentType, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { getRouteChromeModel } from "@/utils/routeChrome";
import { Header } from "./Header";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={typeof href === "string" && href.length > 0 ? href : "/"} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/image", () => ({
  default: ({
    alt,
    src,
    width,
    height,
    priority: _priority,
    ...props
  }: {
    alt: string;
    src: string;
    width: number;
    height: number;
    priority?: boolean;
  }) => <img alt={alt} src={src} width={width} height={height} {...props} />,
}));

vi.mock("next/dynamic", () => ({
  default: () => {
    const MockGlobalSearch: ComponentType<{ currentView: { type: string } }> = ({ currentView }) => (
      <div data-testid="global-search" data-current-view={currentView.type} />
    );
    return MockGlobalSearch;
  },
}));

vi.mock("@/components/ui/button", () => ({
  Button: forwardRef<
    HTMLButtonElement,
    {
      children: ReactNode;
      asChild?: boolean;
    } & React.ButtonHTMLAttributes<HTMLButtonElement>
  >(function MockButton({ children, asChild, ...props }, ref) {
    return asChild ? children : <button ref={ref} {...props}>{children}</button>;
  }),
}));

describe("Header", () => {
  it("renders supplied model hrefs and active grouping", () => {
    render(<Header model={getRouteChromeModel("/mechanism/5-ht2a-agonist")} onNavigate={vi.fn()} />);

    expect(screen.getByRole("link", { name: /dose\.wiki/i })).toHaveAttribute("href", "/");
    expect(screen.getByTestId("global-search")).toHaveAttribute("data-current-view", "mechanism");
    expect(screen.getByRole("link", { name: "Substances" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Effects" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Reports" })).not.toHaveAttribute("aria-current");
  });

});
