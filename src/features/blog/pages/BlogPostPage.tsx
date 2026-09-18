import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { PublicContentShell } from "@/components/layout/PublicPagePrimitives";
import { PublicMarkdownBody } from "@/components/pages/PublicMarkdownBody";
import { icons } from "@/utils/iconNames";
import { getPublicRoutePath } from "@/utils/publicRouteIdentity";
import type { BlogPostViewModel } from "../domain/blogPostModel";

interface BlogPostPageProps {
  post: BlogPostViewModel;
}

/**
 * One archived Effect Index post. The bodies are plain Markdown (the archive predates
 * VCode) and are link-heavy, so they render through the shared public Markdown prose
 * component rather than the VCode renderer the articles pages use.
 */
export function BlogPostPage({ post }: BlogPostPageProps) {
  return (
    <PublicContentShell width="narrow" focusTarget>
      <PageHeader align="left" className="mb-0" title={post.title} icon={icons.notebookText} />

      {post.dateLabel || post.author ? (
        <p className="theme-text-faint mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {post.dateLabel && post.dateTime ? (
            <time dateTime={post.dateTime}>{post.dateLabel}</time>
          ) : null}
          {post.dateLabel && post.author ? <span aria-hidden>·</span> : null}
          {post.author ? <span>{post.author}</span> : null}
        </p>
      ) : null}

      <article className="mt-8">
        <PublicMarkdownBody content={post.body} />
      </article>

      <p className="mt-12">
        <Link
          href={getPublicRoutePath({ family: "blog" })}
          className="theme-link-muted text-sm font-medium transition hover:underline hover:underline-offset-2"
        >
          ← All posts
        </Link>
      </p>
    </PublicContentShell>
  );
}
