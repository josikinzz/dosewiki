import { findDevTab, type DevModeTab } from "@/features/dev/pages/devTabRegistry";
import { canAccessDev, roleMeetsFloor, type AppRole } from "@/lib/auth/roles";
import type { EditorTarget } from "./context";

export type EditorLauncherAction = { label: string; href: string };

/** Only links to existing tools; their server-side authorization remains authoritative. */
export function getEditorLauncherActions(
  target: EditorTarget | undefined,
  role: AppRole | null | undefined,
): EditorLauncherAction[] {
  if (!canAccessDev(role)) return [];
  const actions: EditorLauncherAction[] = [];
  const add = (tab: DevModeTab, label: string, href: string) => {
    if (roleMeetsFloor(role, findDevTab(tab).role)) actions.push({ label, href });
  };
  if (target && target.kind !== "generic") {
    const slug = encodeURIComponent(target.slug);
    switch (target.kind) {
      case "substance":
        add("articles", "Open article editor", `/dev/articles/${slug}`);
        add("molecule-editor", "Open molecule editor", `/dev/molecule-editor/${slug}`);
        add("citation-review", "Review citations", `/dev/citation-review/${slug}`);
        break;
      case "writing":
        add("writing", "Open page editor", target.slug === "about" && target.writingKind === "article"
          ? "/dev/about"
          : `/dev/writing/${slug}?kind=${target.writingKind}`);
        break;
      case "replications":
        add("replications", "Open replication editor", `/dev/replications/${slug}`);
        break;
    }
  }
  actions.push({ label: "All dev tools", href: "/dev" });
  return actions;
}
