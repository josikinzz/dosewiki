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

