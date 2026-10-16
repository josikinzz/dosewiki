export interface VCodeNode {
  name: string;
  properties: Record<string, string>;
  children: (string | VCodeNode)[];
}

export type VCodeContent = string | VCodeNode | (string | VCodeNode)[];

