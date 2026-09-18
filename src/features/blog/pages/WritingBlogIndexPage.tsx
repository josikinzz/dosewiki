import Link from "next/link";
import { SmartLink } from "@/components/common/SmartLink";
import { StateCard } from "@/components/common/StateCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { PublicContentShell } from "@/components/layout/PublicPagePrimitives";
import { Button } from "@/components/ui/button";
// Imported from the module rather than the `@/components/ui` barrel: the barrel
// is circular through the dialog/select primitives, and pulling it into this
// server-rendered page fails the build at module evaluation.
import { InteractiveContentCard } from "@/components/ui/surface";
import type { PublicRouteEmptyState } from "@server/next/publicRouteOutcomes";
import { icons } from "@/utils/iconNames";
import { publicHref } from "@/utils/publicHref";
import { getPublicRoutePath } from "@/utils/publicRouteIdentity";
import type { WritingBlogIndexPost } from "../domain/writingBlogModel";

interface WritingBlogIndexPageProps {
  posts: WritingBlogIndexPost[];
  emptyState?: PublicRouteEmptyState;
}

/**
 * The dose.wiki blog index.
 *
 * Cards rather than the archive's open rows: a post here is written with a cover
 * image and a teaser, and both are the point of the format — the index is meant
 * to be browsed by picture and standfirst, not scanned as a list of titles. The
 * Effect Index archive index (`BlogIndexPage`) stays exactly as it is.
 */
export function WritingBlogIndexPage({ posts, emptyState }: WritingBlogIndexPageProps) {
  return (
    <PublicContentShell width="standard" focusTarget>
      <PageHeader
        title="Blog"
        description="News, notes, and long-form writing from the dose.wiki editors."
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
                <Link href={publicHref.substances()}>Browse substances</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/articles">Read the articles</Link>
              </Button>
            </>
          }
        />
      ) : (
        <div className="mt-2 grid gap-5 sm:grid-cols-2">
          {posts.map((post) => (
            <WritingBlogCard key={post.slug} post={post} />
          ))}
        </div>
      )}
    </PublicContentShell>
  );
}

function WritingBlogCard({ post }: { post: WritingBlogIndexPost }) {
  const summary = post.summary;
  const href = getPublicRoutePath({ family: "blogPost", params: { slug: post.slug } });

  return (
    <InteractiveContentCard asChild padding="none" className="overflow-hidden">
      <SmartLink href={href} className="group block">
        {post.coverImageUrl ? (
          // Deliberately a plain <img>: cover URLs are editor-entered and can
          // point at any host, which `next/image` would need configured up front.
          <img
            src={post.coverImageUrl}
            alt=""
            className="aspect-[16/9] w-full object-cover"
            loading="lazy"
          />
        ) : null}
        <div className="p-5">
          <h2 className="theme-accent-heading text-lg font-semibold leading-snug transition group-hover:opacity-90">
            {post.title}
          </h2>
          {post.dateLabel && post.dateTime ? (
            <p className="theme-text-faint mt-1.5 text-xs">
              <time dateTime={post.dateTime}>{post.dateLabel}</time>
            </p>
          ) : null}
          {summary ? (
            <p className="theme-text-secondary mt-2 text-sm leading-6">{summary}</p>
          ) : null}
        </div>
      </SmartLink>
    </InteractiveContentCard>
  );
}
