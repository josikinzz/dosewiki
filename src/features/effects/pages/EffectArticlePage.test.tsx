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
      attribution: {
        name: "Josie Kins",
        avatarSrc: "/profile-avatars/josie/avatar.webp",
        era: "~2017–2021",
      },
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
        linkableSubstanceSlugs={[]}
        linkableEffectSlugs={[]}
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
    expect(screen.getByText("~2017–2021")).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  });

  it("links resolved contributors and leaves unresolved contributors unlinked", () => {
    render(
      <EffectArticlePage
        article={article}
        contributorDirectory={[{ key: "ADA", displayName: "Ada Lovelace", aliases: [] }]}
        linkableSubstanceSlugs={[]}
        linkableEffectSlugs={[]}
      />,
    );

    expect(screen.getByText("Ada Lovelace").closest("a")).toHaveAttribute(
      "href",
      "/contributors/ada",
    );
    expect(screen.getByText("Josie Kins").closest("a")).toBeNull();
  });

  it("offers the dissociative scale under the overview only for disconnective effects", () => {
    const { unmount } = render(
      <EffectArticlePage
        article={article}
        linkableSubstanceSlugs={[]}
        linkableEffectSlugs={[]}
      />,
    );

    // Patterning is a visual effect: no scale grades it.
    expect(
      screen.queryByRole("link", { name: /Dissociative Intensity Scale/ }),
    ).not.toBeInTheDocument();
    unmount();

    render(
      <EffectArticlePage
        article={{ ...article, hero: { ...article.hero, guideClass: "dissociative" } }}
        linkableSubstanceSlugs={[]}
        linkableEffectSlugs={[]}
      />,
    );

    expect(
      screen.getByRole("link", { name: /Dissociative Intensity Scale/ }),
    ).toHaveAttribute("href", "/articles/dissociative-intensity-scale");
    // A guide covers one substance end to end, so an effect page never offers
    // it: that is the DXM article's own page, not reading for every
    // dissociative effect.
    expect(screen.queryByRole("link", { name: /DXM/ })).not.toBeInTheDocument();
  });
});
