import { resolveDevRoute } from "@/features/dev/pages/devTabRegistry";
import type { AppView } from "@/types/navigation";
import { devHref } from "./devHref";

type DevView = Extract<AppView, { type: "dev" }>;

export default {
  path: devHref,
  parse(tab: string | undefined, slug: string | undefined, query: Record<string, string>): DevView | null {
    return { type: "dev", ...resolveDevRoute(tab, slug, query) };
  },
};
