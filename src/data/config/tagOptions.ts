export interface TagOption {
  value: string;
  label: string;
  count: number;
}

export interface MechanismEntryOption extends TagOption {
  base: string;
  qualifier?: string;
}

export interface MechanismQualifierOption {
  qualifier: string | null;
  label: string;
  count: number;
}
