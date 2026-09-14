export {
  ArticleEditProvider,
  ArticleFieldCommitError,
  ARTICLE_FIELD_CONFLICT_CODE,
  isArticleFieldConflict,
  useArticleEdit,
  type ArticleEditContextValue,
  type EditableFieldValue,
  type EditableValueInput,
} from "./ArticleEditContext";
export { EditableValue } from "./EditableValue";
export { EditableSlot } from "./EditableSlot";
// Record keys inside a field path come from article data, so a wiring call site
// must encode them rather than interpolate them raw.
export { buildFieldPath, encodeFieldPathKey } from "@/data/schema/fieldPath";
