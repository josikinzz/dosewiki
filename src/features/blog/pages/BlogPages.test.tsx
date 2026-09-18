import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { toBlogPostViewModel } from "../domain/blogPostModel";
import { BlogIndexPage } from "./BlogIndexPage";
import { BlogPostPage } from "./BlogPostPage";

// The two posts that actually exist in the archive, verbatim in shape.
const posts = [
  toBlogPostViewModel({
    slug: "site-updates",
    title: "Site updates",
    author: "josikinz",
    timestamp: "2019-01-30T23:07:19.231Z",
    body: "After a several month hiatus, the [SEI form system](https://example.org/form) is back.\n\nMore soon.",
  }),
  toBlogPostViewModel({
    slug: "welcome-to-the-effect-index",
    title: "Welcome to the Effect Index",
    author: "Viscid",
    timestamp: "2018-07-07T18:02:30.681Z",
    body: "We are pleased to announce the launch of [Effect Index](/), a new project.",
  }),
];

describe("blog pages", () => {
  it("lists every archived post with its byline and a link to the post", () => {
    render(<BlogIndexPage posts={posts} />);

    expect(screen.getByRole("link", { name: /Site updates/ })).toHaveAttribute(
      "href",
      "/blog/site-updates",
    );
    expect(screen.getByRole("link", { name: /Welcome to the Effect Index/ })).toHaveAttribute(
      "href",
      "/blog/welcome-to-the-effect-index",
    );
    // Dates are formatted from the unwrapped Mongo timestamp, not the raw ISO string.
    expect(screen.getByText("30 January 2019")).toBeInTheDocument();
    expect(screen.getByText("josikinz")).toBeInTheDocument();
    // The excerpt unwraps Markdown links so the index reads as prose.
    expect(screen.getByText(/the SEI form system is back/)).toBeInTheDocument();
  });

  it("falls back to the empty state when the archive read returns nothing", () => {
    render(
      <BlogIndexPage
        posts={[]}
        emptyState={{
          badge: "No posts yet",
          title: "No archived posts found",
          description: "Nothing here yet.",
          icon: "lucide:file-search",
        }}
      />,
    );

    expect(screen.getByText("No archived posts found")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Site updates/ })).not.toBeInTheDocument();
  });

  it("renders a post body as Markdown, including its links", () => {
    const { container } = render(<BlogPostPage post={posts[1]} />);

    expect(screen.getByRole("heading", { name: "Welcome to the Effect Index" })).toBeInTheDocument();
    expect(screen.getByText("7 July 2018")).toBeInTheDocument();

    // The archived bodies are link-heavy Markdown; a renderer that emitted the raw
    // `[label](href)` text would leave every post with dead links.
    const bodyLink = screen.getByRole("link", { name: "Effect Index" });
    expect(bodyLink).toHaveAttribute("href", "/");
    expect(bodyLink).not.toHaveAttribute("target");
    expect(container.textContent).not.toContain("](");

    expect(screen.getByRole("link", { name: /All posts/ })).toHaveAttribute("href", "/blog");
  });

  it("opens only true external links in a new tab", () => {
    render(<BlogPostPage post={posts[0]} />);

    const external = screen.getByRole("link", { name: "SEI form system" });
    expect(external).toHaveAttribute("target", "_blank");
    expect(external).toHaveAttribute("rel", "noopener noreferrer");
  });
});
