/**
 * VCode AST node types from EffectIndex.
 * 
 * VCode is EffectIndex's custom markup language for rich text content.
 * Content can be either a raw string or a parsed AST array.
 */

export interface VCodeNode {
  name: string;
  properties: Record<string, string>;
  children: (string | VCodeNode)[];
}

export type VCodeContent = string | VCodeNode | (string | VCodeNode)[];

/**
 * Props passed to VCode component renderers.
 */
export interface VCodeComponentProps {
  node: VCodeNode;
  renderChildren: (children: (string | VCodeNode)[]) => React.ReactNode;
}

/**
 * Navigation handler for internal links.
 */
export type NavigateHandler = (path: string) => void;
