import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  pushMock,
  usePathnameMock,
  useQueryMock,
  useLazyLibraryMock,
  useSubstanceLookupMock,
} = vi.hoisted(() => ({
  pushMock: vi.fn(),
  usePathnameMock: vi.fn(() => "/dev/articles"),
  useQueryMock: vi.fn(),
  useLazyLibraryMock: vi.fn(),
  useSubstanceLookupMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: usePathnameMock,
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("convex/react", () => ({
  ConvexProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  ConvexReactClient: vi.fn(),
  useQuery: useQueryMock,
}));

vi.mock("@tanstack/react-query", () => ({
  QueryClient: vi.fn(),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../../../../convex/_generated/api", () => ({
  api: {
    categoryLayout: { get: "categoryLayout.get" },
    substanceIndex: {},
  },
}));

vi.mock("@/data/LightweightDataProvider", () => ({
  LightweightDataProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/data/SubstanceIndexProvider", () => ({
  SubstanceIndexProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/features/dev/context/DevModeContext", () => ({
  DevModeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/features/dev/pages/DevModePage", () => ({
  DevModePage: () => <div>Dev mode page</div>,
}));

vi.mock("@/hooks/useLazyLibrary", () => ({
  useLazyLibrary: useLazyLibraryMock,
}));

vi.mock("@/hooks/useSubstanceLookup", () => ({
  useSubstanceLookup: useSubstanceLookupMock,
}));

import { NextDevRouteClient } from "./NextDevRouteClient";

describe("NextDevRouteClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePathnameMock.mockReturnValue("/dev/articles");
    useQueryMock.mockImplementation((query: string) => {
      if (query === "categoryLayout.get") {
        return { version: 1, categories: [] };
      }
      return undefined;
    });
    useSubstanceLookupMock.mockReturnValue({
      lookup: [],
      isLoading: false,
      status: "Exhausted",
    });
    useLazyLibraryMock.mockReturnValue({
      isLoading: false,
      library: {
        articles: [],
      },
    });
  });

  it("mounts the dev shell without the legacy direct Convex sync provider", () => {
    render(<NextDevRouteClient convexUrl="https://convex.test" initialTab="articles" />);

    expect(screen.getByText("Dev mode page")).toBeInTheDocument();
    const source = readFileSync(
      path.join(process.cwd(), "src/app/dev/_components/NextDevRouteClient.tsx"),
      "utf8",
    );
    expect(source).not.toContain("ConvexSyncContext");
    expect(source).not.toContain("ConvexSyncProvider");
  });
});
