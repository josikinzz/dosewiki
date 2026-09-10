import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  devModePageMock,
  pushMock,
  usePathnameMock,
  useQueryMock,
  useLazyLibraryMock,
  useSubstanceLookupMock,
} = vi.hoisted(() => ({
  devModePageMock: vi.fn(() => <div>Dev mode page</div>),
  pushMock: vi.fn(),
  usePathnameMock: vi.fn(() => "/dev/articles"),
  useQueryMock: vi.fn(),
  useLazyLibraryMock: vi.fn(),
  useSubstanceLookupMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: usePathnameMock,
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/hooks/useEditorRead", () => ({
  useEditorRead: useQueryMock,
}));

vi.mock("@/data/SubstanceIndexProvider", () => ({
  SubstanceIndexProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/features/dev/context/DevModeContext", () => ({
  DevModeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/features/dev/pages/DevModePage", () => ({
  DevModePage: (props: Record<string, unknown>) => devModePageMock(props),
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
    useQueryMock.mockReturnValue(undefined);
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

  it("mounts the dev shell without issuing any editor read", () => {
    render(<NextDevRouteClient initialTab="articles" />);

    expect(screen.getByText("Dev mode page")).toBeInTheDocument();
    // The shell used to fetch categoryLayout:get and hard-fail on a null
    // answer; nothing under /dev reads the layout, so the query set is empty.
    expect(useQueryMock).not.toHaveBeenCalled();
  });

  it("mounts the same shell on Contributors for a contributor session", () => {
    usePathnameMock.mockReturnValue("/dev/contributors/me");

    render(
      <NextDevRouteClient
        initialTab="contributors"
        initialSlug="me"
        initialProfileKey="VIEWER"
      />,
    );

    expect(screen.getByText("Dev mode page")).toBeInTheDocument();
    expect(devModePageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        activeTab: "contributors",
        initialArticleSlug: "me",
        initialProfileKey: "VIEWER",
      }),
    );
    // No corpus drain for a tab that reads no library.
    expect(useLazyLibraryMock).toHaveBeenLastCalledWith(false);
  });
});
