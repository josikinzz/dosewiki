import communitySource from "@content/about/community.json";

export type CommunityLogo = {
  src: string;
  fit?: "contain" | "cover" | "wide";
};

export type CommunityLink = {
  key: string;
  name: string;
  href: string;
  logo: CommunityLogo;
};

export const ABOUT_COMMUNITY_LINKS: readonly CommunityLink[] = communitySource as CommunityLink[];
