-- Custom migration (drizzle-kit generate --custom). Before this column existed the
-- retranslate queue was browser state, so nothing on the server can say which
-- approved renderings were already pushed to segments. Treat every existing
-- approved row as pushed at its review time: the queue starts empty and only
-- reviews made after this migration wait for a retranslate. A reviewer who
-- knows a locale still owes one runs it from the tab as before.
UPDATE "translationGlossary"
SET "retranslated_at" = "reviewed_at"
WHERE "status" = 'approved' AND "retranslated_at" IS NULL AND "reviewed_at" IS NOT NULL;
