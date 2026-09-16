import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getEffectShowcaseWorks: vi.fn(),
  getPublicReplicationsByEffect: vi.fn(),
}));

vi.mock("../../src/app/_components/public-routes/showcaseCollections", () => ({
  getEffectShowcaseWorks: mocks.getEffectShowcaseWorks,
}));
vi.mock("@server/data/publicData", () => ({
  getPublicReplicationsByEffect: mocks.getPublicReplicationsByEffect,
}));

import { EffectReplicationsSection } from "../../src/app/_components/public-routes/EffectReplicationsSection";

const audioRow = {
  _id: "rep-1",
  _creationTime: 0,
  slug: "tracer-hum",
  title: "Tracer hum",
  artist: "Chelsea Morgan",
  type: "audio" as const,
  format: "mp3",
  effect_slug: "tracers",
  created_at: "2024-01-01T00:00:00.000Z",
  url: "https://cdn.test/tracer-hum.mp3",
};

describe("EffectReplicationsSection", () => {
  beforeEach(() => {
    mocks.getEffectShowcaseWorks.mockReset().mockResolvedValue({
      works: [],
      effectName: "Tracers",
    });
    mocks.getPublicReplicationsByEffect.mockReset().mockResolvedValue([]);
  });

  it("plays a stored audio replication instead of handing it to the frame showcase", async () => {
    mocks.getPublicReplicationsByEffect.mockResolvedValue([audioRow]);

    const { container } = render(
      await EffectReplicationsSection({ effectSlug: "tracers" }),
    );

    expect(screen.getByRole("heading", { name: "Audio" })).toBeInTheDocument();
    // The player attaches `src` only inside the play gesture, so the clip URL
    // shows up as the download fallback inside the <audio> element.
    expect(container.querySelector("audio a")).toHaveAttribute(
      "href",
      "https://cdn.test/tracer-hum.mp3",
    );
    expect(screen.getByText("Tracer hum")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Browse all/ })).toBeNull();
  });

  it("renders no audio subsection when the effect has no audio rows", async () => {
    render(await EffectReplicationsSection({ effectSlug: "tracers" }));

    expect(screen.queryByRole("heading", { name: "Audio" })).toBeNull();
  });
});
