import { permanentRedirect } from "next/navigation";

import { publicHref } from "@/utils/publicHref";

type SubstancePlaylistPageProps = {
  params: Promise<{ slug: string }>;
};

/** Former playlist URL retained as a permanent route-level redirect. */
export default async function ReplicationSubstancePlaylistPage({
  params,
}: SubstancePlaylistPageProps) {
  const { slug } = await params;
  permanentRedirect(publicHref.substance(slug));
}
