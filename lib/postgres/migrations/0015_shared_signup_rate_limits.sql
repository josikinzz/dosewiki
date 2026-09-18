CREATE TABLE "subscribeRateLimitBuckets" (
	"name" text NOT NULL,
	"key" text NOT NULL,
	"value" double precision NOT NULL,
	"ts" double precision NOT NULL,
	"expires_at" bigint NOT NULL,
	CONSTRAINT "subscribeRateLimitBuckets_name_key_pk" PRIMARY KEY("name","key")
);
--> statement-breakpoint
CREATE INDEX "subscribeRateLimitBuckets_by_expiry" ON "subscribeRateLimitBuckets" USING btree ("expires_at");