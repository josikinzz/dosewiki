import fs from "node:fs";
import path from "node:path";

export function isEditorOnly(resource) {
  const file = resource.replaceAll("\\", "/");
  if (/\.public\.[cm]?[jt]sx?$/.test(file)) return false;
  return (
    /\.editor\.[cm]?[jt]sx?$/.test(file) ||
    /\/src\/features\/dev\//.test(file) ||
    /\/src\/features\/replications\/viewer\/editor\//.test(file) ||
    /\/src\/features\/contextual-editing\/(?!context\.tsx$)/.test(file) ||
    /\/src\/features\/[^/]+\/editing\/(?!index\.ts$|ArticleEditContext\.tsx$)/.test(
      file,
    ) ||
    /\/src\/features\/editor-launcher\/(?:EditorLauncherSession|EditorLauncherMenu)/.test(
      file,
    )
  );
}

/**
 * Reject accidental reintroduction of a browser Convex client into the public
 * artifact. Public reads use the server-owned Postgres path; reader bundles
 * must never establish their own database query or subscription channel.
 */
export function isDataBrowserClient(resource) {
  const file = resource.replaceAll("\\", "/");
  return /\/node_modules\/convex\/(?:dist\/[^/]+\/)?react(?:-[^/]+)?(?:\/|\.)/.test(
    file,
  );
}

/** Runs before SWC, so protected source never enters the public dependency graph. */
export default function publicEditorBoundary(source) {
  const file = this.resourcePath.replaceAll("\\", "/");
  const options = this.getOptions();
  if (
    /\/src\/app\/(?:dev|review)\/(?:.*\/)?(?:page|layout|loading)\.tsx$/.test(
      file,
    )
  ) {
    this._module.buildInfo.publicEditorReplacement = true;
    if (file.endsWith("/layout.tsx"))
      return "export default function PublicLayout({children}) { return children; }";
    return 'import { notFound } from "next/navigation"; export default function UnavailableEditorPage() { notFound(); }';
  }
  if (/\.editor\.tsx$/.test(file)) {
    this._module.buildInfo.publicEditorReplacement = true;
    const publicFile = this.resourcePath.replace(
      /\.editor\.tsx$/,
      ".public.tsx",
    );
    this.addMissingDependency(publicFile);
    if (fs.existsSync(publicFile)) {
      this.addDependency(publicFile);
      const target = JSON.stringify(`./${path.basename(publicFile)}`);
      return `export { default } from ${target}; export * from ${target};`;
    }
    return "export default function PublicEditorBoundary() { return null; }";
  }
  if (
    /\/src\/features\/article\/editing\/Editable(?:Value|Slot)\.tsx$/.test(file)
  ) {
    this._module.buildInfo.publicEditorReplacement = true;
    return file.endsWith("/EditableValue.tsx")
      ? "export function EditableValue({children}) { return children; }"
      : "export function EditableSlot() { return null; }";
  }
  if (options.client && isEditorOnly(file)) {
    throw new Error(
      `Editor-only module reached the public browser build: ${file}. Import a default-export *.editor.tsx bridge from the public renderer instead.`,
    );
  }
  return source;
}
