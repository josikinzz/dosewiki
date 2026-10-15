CREATE TABLE "articleBatchReceipts" (
	"_id" text PRIMARY KEY NOT NULL,
	"_creationTime" double precision NOT NULL,
	"ownerEmail" text NOT NULL,
	"operationId" text NOT NULL,
	"fingerprintVersion" double precision NOT NULL,
	"fingerprint" text NOT NULL,
	"resultVersion" double precision NOT NULL,
	"result" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "articleBatchReceipts_by_creation_time" ON "articleBatchReceipts" USING btree ("_creationTime");--> statement-breakpoint
CREATE UNIQUE INDEX "articleBatchReceipts_by_owner_operation_unique" ON "articleBatchReceipts" USING btree ("ownerEmail" COLLATE "C","operationId" COLLATE "C");--> statement-breakpoint
CREATE INDEX "articleBatchReceipts_by_owner_operation" ON "articleBatchReceipts" USING btree ("ownerEmail" COLLATE "C","operationId" COLLATE "C","_creationTime");