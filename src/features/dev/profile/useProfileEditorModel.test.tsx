import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NormalizedUserProfile } from "@/data/userProfiles";

import { useProfileEditorModel } from "./useProfileEditorModel";
import type { AvatarBrowserFileAdapter } from "./avatarUploadModel";

const baseProfile = (overrides: Partial<NormalizedUserProfile> = {}): NormalizedUserProfile => ({
  key: "EDITOR",
  displayName: "Editor",
  aliases: ["editor"],
  avatarUrl: "https://example.com/avatar.png",
  bio: "Existing bio",
  links: [{ label: "Site", url: "https://example.com" }],
  hasCustomBio: true,
  ...overrides,
});

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function createFileAdapter(): AvatarBrowserFileAdapter<File> {
  return {
    inferMimeType: vi.fn((file) => file.type || "image/png"),
    readAsBase64: vi.fn(async () => "base64-avatar"),
    createObjectUrl: vi.fn(() => "blob:avatar"),
    revokeObjectUrl: vi.fn(),
  };
}

function renderModel(overrides: Partial<Parameters<typeof useProfileEditorModel>[0]> = {}) {
  const fileAdapter = createFileAdapter();
  const verifyCredentials = vi.fn(async () => ({ username: "editor", password: "secret", key: "EDITOR" }));
  const saveProfile = vi.fn(async () => ({
    success: true,
    profile: baseProfile({ displayName: "Saved Editor", bio: "Updated bio" }),
  }));
  const onProfileUpdated = vi.fn();
  const profile = baseProfile();

  const hook = renderHook(
    () =>
      useProfileEditorModel({
        profile,
        verifyCredentials,
        onProfileUpdated,
        hasStoredCredentials: true,
        fileAdapter,
        saveProfile,
        ...overrides,
      }),
    { wrapper: createWrapper() },
  );

  return {
    ...hook,
    fileAdapter,
    verifyCredentials,
    saveProfile,
    onProfileUpdated,
    profile,
  };
}

describe("useProfileEditorModel", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resets edited state back to the current profile", () => {
    const { result } = renderModel();

    act(() => {
      result.current.commands.changeDisplayName("Changed");
    });
    expect(result.current.isDirty).toBe(true);

    act(() => {
      result.current.commands.reset();
    });

    expect(result.current.form.displayName).toBe("Editor");
    expect(result.current.isDirty).toBe(false);
    expect(result.current.notice).toEqual({ type: "success", message: "Profile form reset." });
  });

  it("selects valid avatar files and creates a preview through the file adapter", async () => {
    const { result, fileAdapter } = renderModel();
    const file = new File(["avatar"], "avatar.png", { type: "image/png" });

    act(() => {
      result.current.commands.selectAvatarFile(file);
    });

    await waitFor(() => {
      expect(result.current.avatarPreviewSource).toBe("blob:avatar");
    });
    expect(result.current.isDirty).toBe(true);
    expect(fileAdapter.createObjectUrl).toHaveBeenCalledWith(file);

    act(() => {
      result.current.commands.clearAvatarSelection();
    });
    expect(fileAdapter.revokeObjectUrl).toHaveBeenCalledWith("blob:avatar");
  });

  it("rejects invalid avatar selections before they become dirty state", () => {
    const { result } = renderModel();

    act(() => {
      result.current.commands.selectAvatarFile(new File(["bad"], "avatar.gif", { type: "image/gif" }));
    });

    expect(result.current.avatarFile).toBeNull();
    expect(result.current.isDirty).toBe(false);
    expect(result.current.notice).toEqual({
      type: "error",
      message: "Avatar must be a PNG, JPG, or WebP image.",
    });
  });

  it("saves normalized profile changes through verified credentials", async () => {
    const { result, verifyCredentials, saveProfile, onProfileUpdated } = renderModel();

    act(() => {
      result.current.commands.changeDisplayName(" Updated Editor ");
      result.current.commands.changeBio("Updated bio\r\n");
    });
    await act(async () => {
      await result.current.commands.save();
    });

    expect(verifyCredentials).toHaveBeenCalled();
    expect(saveProfile).toHaveBeenCalledWith({
      username: "editor",
      password: "secret",
      profile: {
        key: "EDITOR",
        displayName: "Updated Editor",
        bio: "Updated bio\n",
        links: [{ label: "Site", url: "https://example.com" }],
        avatarUrl: "https://example.com/avatar.png",
      },
      avatarUpload: undefined,
    });
    expect(onProfileUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: "Saved Editor", bio: "Updated bio" }),
      "EDITOR",
    );
    expect(result.current.notice).toEqual({ type: "success", message: "Profile saved successfully." });
  });

  it("sends avatar removal as a null avatarUrl payload", async () => {
    const saveProfile = vi.fn(async () => ({ success: true, unchanged: true }));
    const { result } = renderModel({
      saveProfile,
    });

    act(() => {
      result.current.commands.removeAvatar();
    });
    await act(async () => {
      await result.current.commands.save();
    });

    expect(saveProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: expect.objectContaining({
          avatarUrl: null,
        }),
      }),
    );
    expect(result.current.notice).toEqual({ type: "success", message: "Profile already up to date." });
  });

  it("short-circuits unchanged saves before credential verification", async () => {
    const { result, verifyCredentials, saveProfile } = renderModel();

    await act(async () => {
      await result.current.commands.save();
    });

    expect(verifyCredentials).not.toHaveBeenCalled();
    expect(saveProfile).not.toHaveBeenCalled();
    expect(result.current.notice).toEqual({ type: "success", message: "No changes to save." });
  });

  it("surfaces save mutation errors as profile notices", async () => {
    const { result, onProfileUpdated } = renderModel({
      saveProfile: vi.fn(async () => {
        throw new Error("Convex rejected the profile");
      }),
    });

    act(() => {
      result.current.commands.changeBio("Updated bio");
    });
    await act(async () => {
      await result.current.commands.save();
    });

    expect(onProfileUpdated).not.toHaveBeenCalled();
    expect(result.current.notice).toEqual({ type: "error", message: "Convex rejected the profile" });
  });
});
