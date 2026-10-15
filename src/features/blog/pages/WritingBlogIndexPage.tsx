import Link from "next/link";
import { SmartLink } from "@/components/common/SmartLink";
import { StateCard } from "@/components/common/StateCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { PublicContentShell } from "@/components/layout/PublicPagePrimitives";
import { Button } from "@/components/ui/button";
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
