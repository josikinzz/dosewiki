CREATE UNIQUE INDEX "generatedPublicationOperations_by_proposal_id_unique" ON "generatedPublicationOperations" USING btree ("proposalId");--> statement-breakpoint
CREATE UNIQUE INDEX "publicCachePublications_by_key_unique" ON "publicCachePublications" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "reviewedArticles_by_article_unique" ON "reviewedArticles" USING btree ("article_id");--> statement-breakpoint
CREATE UNIQUE INDEX "substanceIndex_by_slug_unique" ON "substanceIndex" USING btree ("slug");