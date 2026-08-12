import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { PublicContentShell } from "@/components/layout/PublicPagePrimitives";
import { PublicMarkdownBody } from "@/components/pages/PublicMarkdownBody";
import { icons } from "@/utils/iconNames";
import { getPublicRoutePath } from "@/utils/publicRouteIdentity";
import type { WritingBlogPost } from "../domain/writingBlogModel";

interface WritingBlogPostPageProps {
  post: WritingBlogPost;
}

/**
 * One dose.wiki blog post. Bodies are Markdown by construction — the Blog tab
 * writes nothing else — so they render through the shared public Markdown prose
 * component, without heading ids: a post has no contents rail pointing into it.
 */
export function WritingBlogPostPage({ post }: WritingBlogPostPageProps) {
  return (
    <PublicContentShell width="narrow" focusTarget>
      <PageHeader
        align="left"
        className="mb-0"
        title={post.title}
        description={post.teaser}
        descriptionClassName="type-deck theme-accent-emphasis-scope theme-text-secondary"
        icon={icons.notebookText}
      />

      {post.dateLabel || post.bylineAuthors.length > 0 ? (
        <p className="theme-text-faint mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {post.dateLabel && post.dateTime ? (
            <time dateTime={post.dateTime}>{post.dateLabel}</time>
          ) : null}
          {post.dateLabel && post.bylineAuthors.length > 0 ? <span aria-hidden>·</span> : null}
          {post.bylineAuthors.map((author, index) => (
            <span key={author.key}>
              {index > 0 ? <span aria-hidden>, </span> : null}
              <Link href={author.href} className="theme-text-secondary underline-offset-2 hover:underline">
                {author.name}
              </Link>
            </span>
          ))}
        </p>
      ) : null}

      {post.coverImageUrl ? (
        <img
          src={post.coverImageUrl}
          alt=""
          className="mt-6 w-full rounded-2xl object-cover"
        />
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
