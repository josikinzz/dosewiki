export {
  TAG_FIELDS,
  TAG_FIELD_LABELS,
  normalizeTagLabel,
  toTagKey,
  type ArticleChange,
  type FieldChange,
  type TagArticleRef,
  type TagDeleteMutation,
  type TagField,
  type TagMoveMutation,
  type TagMutation,
  type TagMutationResult,
  type TagRegistry,
  type TagRegistryInput,
  type TagRenameMutation,
  type TagUsage,
} from "./tagRegistry.shared";

export { buildTagRegistry, getTagUsage, buildEmptyRegistry, sortUsagesByCount } from "./tagRegistry.read";
export { applyTagMutation, summarizeMutation } from "./tagRegistry.mutations";
