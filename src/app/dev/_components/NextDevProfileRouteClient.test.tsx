import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  devModeProviderMock,
  substanceIndexProviderMock,
  useContributorProfilesMock,
  useSessionMock,
} = vi.hoisted(() => ({
  devModeProviderMock: vi.fn(({ children }: { children: React.ReactNode }) => <>{children}</>),
  substanceIndexProviderMock: vi.fn(({ children }: { children: React.ReactNode }) => <>{children}</>),
  useContributorProfilesMock: vi.fn(),
  useSessionMock: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
  useSession: useSessionMock,
}));

vi.mock("@/data/SubstanceIndexProvider", () => ({
  SubstanceIndexProvider: substanceIndexProviderMock,
}));

vi.mock("@/features/dev/context/DevModeContext", () => ({
  DevModeProvider: devModeProviderMock,
}));

vi.mock("@/hooks/useContributorProfiles", () => ({
  useContributorProfiles: useContributorProfilesMock,
}));

vi.mock("@/features/dev/profile", () => ({
  ProfileEditorTab: ({ profile }: { profile: { displayName: string } }) => (
    <div data-testid="profile-editor">{profile.displayName}</div>
  ),
}));

import { NextDevProfileRouteClient } from "./NextDevProfileRouteClient";

describe("NextDevProfileRouteClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionMock.mockReturnValue({
      status: "authenticated",
      data: {
        user: {
          email: "viewer@example.com",
          image: null,
          name: "Profile Viewer",
        },
      },
    });
    useContributorProfilesMock.mockReturnValue({
      isLoading: false,
      profiles: [
        {
          key: "VIEWER",
          displayName: "Profile Viewer",
          aliases: [],
          avatarUrl: null,
          bio: "",
          links: [],
          hasCustomBio: false,
        },
      ],
    });
  });

  it("renders profile editing without mounting editor document providers", () => {
    render(<NextDevProfileRouteClient initialProfileKey="VIEWER" />);

    expect(screen.getByTestId("profile-editor")).toHaveTextContent("Profile Viewer");
    expect(devModeProviderMock).not.toHaveBeenCalled();
    expect(substanceIndexProviderMock).not.toHaveBeenCalled();
  });
});
