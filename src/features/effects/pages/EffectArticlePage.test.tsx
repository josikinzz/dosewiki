import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { EffectArticleModel } from "../articleSectionModel";
import { EffectArticlePage } from "./EffectArticlePage";

vi.mock("@/components/common/AppImage", () => ({
  AppImage: ({ src, alt, className }: { src: string; alt: string; className?: string }) => (
    <img src={src} alt={alt} className={className} />
  ),
}));

vi.mock("../vcode/VCodeRenderer", () => ({
  VCodeRenderer: ({ content }: { content: string }) => <div>{content}</div>,
}));

const article: EffectArticleModel = {
  hero: {
    name: "Patterning",
    icon: "lucide:eye",
  },
  sections: [
    {
      id: "overview",
      kind: "overview",
      content: "Overview content",
    },
    {
      id: "analysis",
      kind: "analysis",
      title: "Analysis",
      icon: "lucide:microscope",
      content: "Analysis content",
    },
    {
      id: "replications",
      kind: "replications",
      title: "Replications",
      icon: "lucide:image",
      state: { kind: "server", galleryOrder: ["visual"] },
    },
    {
      id: "audio-replications",
      kind: "audioReplications",
      title: "Audio Replications",
      icon: "lucide:volume-2",
      items: [{ title: "Tone", artist: "Artist", resource: "/tone.mp3" }],
    },
    {
      id: "commentary",
      kind: "personalCommentary",
      title: "Personal Commentary",
      icon: "lucide:quote",
      content: "Commentary content",
      attribution: { name: "Josie Kins", avatarSrc: "/profile-avatars/josie/avatar.webp" },
    },
    {
      id: "contributors",
      kind: "contributors",
      contributors: ["Ada Lovelace"],
    },
  ],
};

describe("EffectArticlePage", () => {
  it("renders a prepared effect article model with an injected replications section", () => {
    render(
      <EffectArticlePage
        article={article}
        replicationsSection={<section id="replications">Injected replications</section>}
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Patterning" })).toBeInTheDocument();
    expect(screen.getByText("Overview content")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Analysis" })).toBeInTheDocument();
    expect(screen.getByText("Injected replications")).toBeInTheDocument();
    expect(screen.queryByText("Loading replications")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Audio Replications" })).toBeInTheDocument();
    expect(screen.getByText("Tone")).toBeInTheDocument();
    expect(screen.getByText("Commentary content")).toBeInTheDocument();
    expect(screen.getByText("Josie Kins")).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  });
});
