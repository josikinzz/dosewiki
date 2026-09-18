import { fromMarkdown } from "mdast-util-from-markdown";
import type { Definition, Nodes } from "mdast";

type AboutSections = { introduction: string; sources: string; history: string };
type Section = keyof AboutSections;

/** Project one editable document into public sections without matching code or quotes. */
export function splitAboutMarkdown(content: string): AboutSections {
  const tree = fromMarkdown(content);
  const sections: AboutSections = { introduction: "", sources: "", history: "" };
  const definitions = new Map<string, Definition>();
  const localDefinitions: Record<Section, Map<string, Definition>> = {
    introduction: new Map(), sources: new Map(), history: new Map(),
  };
  let section: Section = "introduction";
  let offset = 0;
  let sectioned = false;

  const collectDefinitions = (node: Nodes) => {
    if (node.type === "definition") {
      if (!definitions.has(node.identifier)) definitions.set(node.identifier, node);
      if (!localDefinitions[section].has(node.identifier)) localDefinitions[section].set(node.identifier, node);
    }
    if ("children" in node) node.children.forEach(collectDefinitions);
  };

  for (const node of tree.children) {
    const label = node.type === "heading" && node.depth === 2 && node.children.every((child) => child.type === "text")
      ? node.children.map((child) => child.type === "text" ? child.value : "").join("").toLowerCase()
      : "";
    const nextSection = label === "sources and review" ? "sources" : label === "project history" ? "history" : null;
    if (nextSection) {
      sections[section] += content.slice(offset, node.position!.start.offset!);
      section = nextSection;
      offset = node.position!.end.offset!;
      sectioned = true;
    }
    collectDefinitions(node);
  }
  if (!sectioned) return { introduction: content, sources: "", history: "" };
  sections[section] += content.slice(offset);

  // Definitions have document-wide scope, including those nested in blockquotes.
  // Rebuild only copied definitions so quote/list prefixes cannot corrupt them.
  const definitionMarkdown = (definition: Definition) => {
    const label = definition.identifier.replace(/[\\&[\]]/g, "\\$&");
    const url = definition.url.replace(/[\\&<>]/g, "\\$&");
    const title = definition.title == null ? "" : ` "${definition.title.replace(/[\\&"]/g, "\\$&")}"`;
    return `[${label}]: <${url}>${title}`;
  };
  for (const key of Object.keys(sections) as Section[]) {
    sections[key] = sections[key].trim();
    if (!sections[key]) continue;
    const missing: string[] = [];
    const overrides: string[] = [];
    for (const [identifier, definition] of definitions) {
      const local = localDefinitions[key].get(identifier);
      if (!local) missing.push(definitionMarkdown(definition));
      else if (local !== definition) overrides.push(definitionMarkdown(definition));
    }
    // CommonMark resolves duplicate labels to the first document definition.
    if (overrides.length) sections[key] = `${overrides.join("\n")}\n\n${sections[key]}`;
    if (missing.length) sections[key] += `\n\n${missing.join("\n")}`;
  }
  return sections;
}
