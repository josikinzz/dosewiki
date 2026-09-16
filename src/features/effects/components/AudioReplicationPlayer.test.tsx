import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AudioReplicationPlayer } from "./AudioReplicationPlayer";

const SRC = "https://example.com/clip.mp3";

describe("AudioReplicationPlayer", () => {
  it("labels the transport and seek controls with the clip title", () => {
    render(<AudioReplicationPlayer src={SRC} label="Aural hallucination" />);

    expect(screen.getByRole("group", { name: "Audio player: Aural hallucination" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Play Aural hallucination" })).toBeTruthy();
    expect(screen.getByRole("slider", { name: "Seek within Aural hallucination" })).toBeTruthy();
  });

  it("attaches only the chosen clip after playback intent", () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    const load = vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    const { container, unmount } = render(
      <>
        <AudioReplicationPlayer src={SRC} label="First clip" />
        <AudioReplicationPlayer src="https://example.com/other.mp3" label="Other clip" />
      </>,
    );
    try {
      const [first, other] = container.querySelectorAll("audio");
      expect(first.hasAttribute("src")).toBe(false);
      expect(other.hasAttribute("src")).toBe(false);
      expect(screen.getByRole("group", { name: "Audio player: First clip" })).not.toHaveAttribute("aria-busy");

      fireEvent.click(screen.getByRole("button", { name: "Play First clip" }));
      expect(first.getAttribute("src")).toBe(SRC);
      expect(other.hasAttribute("src")).toBe(false);

      Object.defineProperty(first, "duration", { configurable: true, value: 60 });
      fireEvent.loadedMetadata(first);
      expect(screen.getByRole("slider", { name: "Seek within First clip" })).toHaveProperty("disabled", false);
      expect(screen.getByRole("slider", { name: "Seek within Other clip" })).toHaveProperty("disabled", true);
    } finally {
      unmount();
      play.mockRestore();
      pause.mockRestore();
      load.mockRestore();
    }
  });


  it("shows an unknown duration rather than a fake zero before metadata arrives", () => {
    render(<AudioReplicationPlayer src={SRC} label="Clip" />);

    expect(screen.getAllByText("--:--")).toHaveLength(1);
    expect(screen.getByRole("slider", { name: "Seek within Clip" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("fails visibly when the clip cannot be loaded", () => {
    const { container } = render(<AudioReplicationPlayer src={SRC} label="Clip" />);

    fireEvent.error(container.querySelector("audio") as HTMLAudioElement);

    expect(screen.getByRole("alert").textContent).toContain("could not be loaded");
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.getByRole("button", { name: "Clip could not be loaded" })).toHaveProperty(
      "disabled",
      true,
    );
  });
});
