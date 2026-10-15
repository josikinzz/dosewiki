import { EditorSection, type EditorSectionProps } from "../components/EditorSection";
import type { AppRole } from "@/lib/auth/roles";
import { getDevTabHeading, type DevModeTab } from "./devTabRegistry";

type DevToolSectionProps = Omit<EditorSectionProps, "icon"> & {
  tool: DevModeTab;
  viewerRole?: AppRole | null;
};

export function DevToolSection({ tool, viewerRole, title, ...props }: DevToolSectionProps) {
  const heading = getDevTabHeading(tool, viewerRole);
  return <EditorSection {...props} icon={heading.icon} title={title === undefined ? heading.title : title} />;
}
