import { mutation as baseMutation, internalMutation as baseInternalMutation, type MutationCtx } from "../../lib/postgres/runtime/server";
import type { Id } from "../../lib/postgres/runtime/dataModel";
import { syncArticleHistory, syncGalleryCandidates, syncReviewedArticle } from "./publicReadIndexes";
import { deleteTripReportSubstanceRows, syncTripReportSubstanceRows } from "./tripReportSubstanceIndex";
import { withReplicationEditJournal } from "./replicationEditJournal";
import { withPublicationOutbox } from "./publicationOutbox";

/** Preserve the complete DatabaseWriter API. Derived writes use the original
 * context in the same transaction, so they cannot recurse. Both overloads of
 * patch/replace/delete (with and without an explicit table) are supported.
 */
export function withPublicReadIndexes(ctx: MutationCtx, onIndexFailure?: (error: unknown) => void): MutationCtx {
  const db = new Proxy(ctx.db, {
    get(target, property, receiver) {
      const method = Reflect.get(target, property, receiver);
      if (property === "table") {
        return (table: string) => {
          const scoped = Reflect.apply(method, target, [table]) as object;
          return new Proxy(scoped, {
            get(scopedTarget, operation, scopedReceiver) {
              const member = Reflect.get(scopedTarget, operation, scopedReceiver);
              if (operation === "insert" || operation === "patch" || operation === "replace" || operation === "delete") {
                return (...values: unknown[]) => Reflect.apply(Reflect.get(db, operation), db, [table, ...values]);
              }
              return typeof member === "function" ? member.bind(scopedTarget) : member;
            },
          });
        };
      }
      if (property !== "insert" && property !== "patch" && property !== "replace" && property !== "delete") {
        return typeof method === "function" ? method.bind(target) : method;
      }
      return async (...args: unknown[]) => {
        const inserted = property === "insert";
        const hasTable = inserted || args.length === (property === "delete" ? 2 : 3);
        const table = hasTable ? args[0] : null;
        const id = inserted ? null : args[hasTable ? 1 : 0] as string;
        const replicationId = !inserted && (table === null || table === "replications") ? target.normalizeId("replications", id!) : null;
        const historyId = !inserted && !replicationId && (table === null || table === "changelog") ? target.normalizeId("changelog", id!) : null;
        const articleId = !inserted && !replicationId && !historyId && (table === null || table === "substanceIndex") ? target.normalizeId("substanceIndex", id!) : null;
        const reportId = !inserted && !replicationId && !historyId && !articleId && (table === null || table === "tripReports") ? target.normalizeId("tripReports", id!) : null;
        const result = await Reflect.apply(method, target, args);
        // URL/evidence-only changes and article citation repairs cannot change
        // membership. Avoid rehydrating a heavy source for unrelated patches.
        if (property === "patch") {
          const patch = args[hasTable ? 2 : 1] as Record<string, unknown>;
          const fields = replicationId
            ? ["slug", "title", "type", "role", "effect_slug", "title_drugs", "title_class_mentions", "showcase_excluded", "replication_status", "publication_state", "_creationTime"]
            : historyId ? ["articles", "createdAt", "_creationTime"]
            : articleId ? ["editorial_review", "title", "slug", "id", "_creationTime"]
            : reportId ? ["substances"] : [];
          if (!fields.some((field) => Object.prototype.hasOwnProperty.call(patch, field))) return result;
        }
        try {
          if (table === "replications" || replicationId) {
            const sourceId = replicationId ?? result as Id<"replications">;
            await syncGalleryCandidates(ctx, sourceId, property === "delete" ? null : await target.get(sourceId));
          } else if (table === "changelog" || historyId) {
            const sourceId = historyId ?? result as Id<"changelog">;
            await syncArticleHistory(ctx, sourceId, property === "delete" ? null : await target.get(sourceId));
          } else if (table === "substanceIndex" || articleId) {
            const sourceId = articleId ?? result as Id<"substanceIndex">;
            await syncReviewedArticle(ctx, sourceId, property === "delete" ? null : await target.get(sourceId));
          } else if (table === "tripReports" || reportId) {
            const sourceId = reportId ?? result as Id<"tripReports">;
            const row = property === "delete" ? null : await target.get(sourceId);
            if (row) await syncTripReportSubstanceRows(ctx, sourceId, row.substances);
            else await deleteTripReportSubstanceRows(ctx, sourceId);
          }
        } catch (error) {
          // Row-level catches in bulk imports must not commit half a relation.
          onIndexFailure?.(error);
          throw error;
        }
        return result;
      };
    },
  });
  return { ...ctx, db };
}

/** Preserve owned builder validators/types and existing handler role gates.
 * Imported handlers inherit this context; runMutation enters its own boundary.
 */
function indexedBuilder<T extends typeof baseMutation | typeof baseInternalMutation>(builder: T): T {
  return new Proxy(builder, {
    apply(target, thisArg, [definition]) {
      const handler = definition.handler;
      const indexedHandler = async (ctx: MutationCtx, ...args: unknown[]) => {
        const failure: { caught: boolean; error?: unknown } = { caught: false };
        const publication = withPublicationOutbox(ctx);
        const journal = withReplicationEditJournal(publication.ctx);
        const result = await handler(withPublicReadIndexes(journal.ctx, (error) => {
          failure.caught = true;
          failure.error = error;
        }), ...args);
        if (failure.caught) throw failure.error;
        await journal.commit(args[0]);
        await publication.commit();
        return result;
      };
      return Reflect.apply(target, thisArg, [{ ...definition, handler: indexedHandler }]);
    },
  });
}

export const mutation = indexedBuilder(baseMutation);
export const internalMutation = indexedBuilder(baseInternalMutation);
