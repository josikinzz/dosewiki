import { permanentRedirect } from "next/navigation";

import { publicHref } from "@/utils/publicHref";

type EffectPlaylistPageProps = {
  params: Promise<{ slug: string }>;
};

/** Former playlist URL retained as a permanent route-level redirect. */
export default async function ReplicationEffectPlaylistPage({
  params,
}: EffectPlaylistPageProps) {
  const { slug } = await params;
  permanentRedirect(publicHref.effect(slug));
}
