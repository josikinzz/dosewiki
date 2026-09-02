import Link from "next/link";
import { SmartLink } from "@/components/common/SmartLink";
import { StateCard } from "@/components/common/StateCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { PublicContentShell } from "@/components/layout/PublicPagePrimitives";
import { Button } from "@/components/ui/button";
import type { PublicRouteEmptyState } from "@server/next/publicRouteOutcomes";
import { icons } from "@/utils/iconNames";
import { publicHref } from "@/utils/publicHref";
import { getPublicRoutePath } from "@/utils/publicRouteIdentity";
import { buildBlogPostExcerpt, type BlogPostViewModel } from "../domain/blogPostModel";

interface BlogIndexPageProps {
  posts: BlogPostViewModel[];
  emptyState?: PublicRouteEmptyState;
}

/**
 * The archived Effect Index blog index. The archive holds a handful of posts and will
 * never grow, so this is a plain reverse-chronological list of open rows rather than a
 * paginated or grouped explorer — grouping two posts would read as an empty scaffold.
 */
export function BlogIndexPage({ posts, emptyState }: BlogIndexPageProps) {
  return (
    <PublicContentShell width="standard" focusTarget>
      <PageHeader
        title="Blog"
        description="Announcements and site updates from the Effect Index archive."
        icon={icons.notebookText}
      />

      {emptyState ? (
        <StateCard
          badge={emptyState.badge}
          title={emptyState.title}
          description={emptyState.description}
          icon={emptyState.icon}
          footer={emptyState.footer}
          tone="neutral"
          actions={
            <>
              <Button asChild>
                <Link href={publicHref.effects()}>Browse the effect index</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/articles">Read the articles</Link>
              </Button>
            </>
          }
        />
      ) : (
        <ul className="mt-2">
          {posts.map((post) => (
            <BlogIndexRow key={post.slug} post={post} />
          ))}
        </ul>
      )}
    </PublicContentShell>
  );
}

function BlogIndexRow({ post }: { post: BlogPostViewModel }) {
  const excerpt = buildBlogPostExcerpt(post.body);
  const byline = [post.dateLabel, post.author || null].filter(
    (value): value is string => Boolean(value),
  );

  return (
    <li className="theme-index-row">
      <SmartLink
        href={getPublicRoutePath({ family: "blogPost", params: { slug: post.slug } })}
        className="theme-index-row-link group block rounded-xl px-3 py-4"
      >
        <h2 className="theme-accent-heading text-lg font-semibold leading-snug transition group-hover:opacity-90">
          {post.title}
        </h2>
        {byline.length > 0 ? (
          <p className="theme-text-faint mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {post.dateLabel && post.dateTime ? (
              <time dateTime={post.dateTime}>{post.dateLabel}</time>
            ) : null}
            {post.dateLabel && post.author ? <span aria-hidden>·</span> : null}
            {post.author ? <span>{post.author}</span> : null}
          </p>
        ) : null}
        {excerpt ? (
          <p className="theme-text-secondary mt-2 max-w-2xl text-sm leading-6">{excerpt}</p>
        ) : null}
      </SmartLink>
    </li>
  );
}
