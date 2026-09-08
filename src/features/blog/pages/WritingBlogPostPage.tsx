import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { PublicContentShell } from "@/components/layout/PublicPagePrimitives";
import { PublicMarkdownBody } from "@/components/pages/PublicMarkdownBody";
import { icons } from "@/utils/iconNames";
import { getPublicRoutePath } from "@/utils/publicRouteIdentity";
import type { WritingBlogPost } from "../domain/writingBlogModel";
import { VCodeRenderer } from "@/features/effects/vcode/VCodeRenderer";
import { normalizeVCodeContent } from "@/features/effects/vcode/normalize";

interface WritingBlogPostPageProps {
  post: WritingBlogPost;
}

/** One writing-system blog post, rendered in its stored language. */
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
        {post.bodyFormat === "vcode" ? <VCodeRenderer content={normalizeVCodeContent(post.body_ast, post.body) ?? ""} citations={post.citations} /> : <PublicMarkdownBody content={post.body} />}
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
