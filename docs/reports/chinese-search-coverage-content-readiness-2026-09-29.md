# Chinese search coverage: content runtime readiness

Historical investigation from search commit `1d11809e6`, before the current production layout and the later local generation review. Runtime and account findings describe that investigation only; they are not current release evidence. Removed skill references are preserved as historical pointers.

Date: 2026-09-29. Scope: dossier tickets 06, 07, and 08. Work performed locally without inference, publication, production writes, visibility changes, grants, provider configuration changes, deployment, or commits.

The prescribed runtime is now installed. Native frozen article and prompt reads work against the intended production database. Drafting remains blocked by two independently verified prerequisites: the isolated worker has two inactive OAuth accounts and no approved account selection, and the linked production environment does not supply the exact native article-source scoped credential. Full-cohort ranking also prevents selecting Atomoxetine or MK-801 ahead of earlier eligible articles.

## Ticket outcomes

| Ticket | Actual outcome | Remaining prerequisite |
| --- | --- | --- |
| 06: reader and worker preflight | Runtime setup passed. Actual worker preflight failed closed at account selection. Serializer-only diagnostic passed. Native full-article/prompt reads passed. Native article-source read failed closed. Complete supplemental source-availability ranking recorded. | Approved current OAuth credential selection and functioning `DATA_ADMIN_TOKEN_ARTICLE_SOURCE_MIGRATION`; then complete actual worker preflight and native campaign input freeze. |
| 07: Atomoxetine candidates | No packets, inference, candidates, or reviews were created. Existing stored evidence readiness retained. | Ticket 06, then the actual native campaign's rank and active-drug rules must permit Atomoxetine. It is rank 71 in this fresh supplemental inventory. |
| 08: MK-801 candidates | No packets, inference, candidates, or reviews were created. Existing evidence limitations retained. | Ticket 06, the full-cohort order, and the previous active article's complete publication/site gate. MK-801 is rank 239 in the inventory. Publication remains separately closed. |

## Prescribed isolated runtime

Executed `npm run sectionmaxxing:setup`. It completed successfully with the runtime's pinned Bun **1.3.14**, frozen lockfile, and seven packages installed, including `@oh-my-pi/pi-ai@18.1.10` and `@oh-my-pi/pi-catalog@18.1.10`. The application dependency tree and tracked runtime package/lock files were not changed.

Executed the documented `npm run sectionmaxxing:worker -- preflight`. Its exit code was 1 with this exact refusal:

> Current OAuth account is ambiguous or missing; select its credential ID explicitly. No account fallback is allowed.

Metadata-only inspection through the same SDK's documented `listOAuthAccounts` API found two stored `openai-codex` credentials, opaque IDs **1** and **2**, both inactive. No `runs/section-generation/worker-account.json` exists. No raw credentials, tokens, account email addresses, or sibling-account secrets were inspected or printed, and no account was selected.

The [execution reference](../../.agents/skills/sectionmaxxing/reference/execution.md#runtime-and-account) explicitly states: "Without either, one unambiguous active/stored account is accepted; multiple accounts fail closed until the user chooses." That account-selection gate applies to this observed two-account state. The skill's example credential ID is not authorization to select an account here.

A separate, non-inference diagnostic exercised the actual pinned SDK request serializer with the exact production worker's `contextForPacket` and `assertIsolatedPayload` guards. It verified `gpt-5.6-sol`, `low` reasoning, zero tools, one user input, exact system/user bytes, `store: false`, and `stream: true`. This proves the serializer's isolation properties. It does **not** turn the failed account-aware worker preflight into a success, prove account entitlement, or authorize inference.

## Native source reader configuration and actual reads

Local environment metadata had no native Postgres target, native source token, or media-base configuration. Instead of treating this as a terminal conclusion, the existing authorized Vercel CLI read the linked **dosewiki-admin production** environment into a temporary file with mode `0600`. It did not modify `.env.local` or provider variables.

The linked configuration supplies `DATA_BACKEND`, `POSTGRES_POOLED_URL`, and `REPLICATION_MEDIA_BASE_URL`. The selected pooled target has the expected credential-free identity:

```text
aws-us-east-1-2.pg.psdb.cloud/postgres
```

The exact `DATA_ADMIN_TOKEN_ARTICLE_SOURCE_MIGRATION` is absent. `DATA_ADMIN_KEY` is also absent. Legacy credential names and general-key fallbacks were not substituted.

Native checks used `createDataClient` and `createCampaignReader`, with `DATA_BACKEND=postgres`, `DATA_WRITES_FROZEN=1`, explicit `TARGET_POSTGRES_URL`, `allowRemote`, and matching `POSTGRES_IMPORT_CONFIRM`. The runtime's query path uses read-only transactions. Ambient native admin and legacy credential names were removed from that process before reads, and only the intended target/media/read variables were supplied.

The actual native unfiltered audit read **577 articles**, of which the exact executable `isRegenerationEligible` contract selected **310 articles**, corresponding to **1,550 owned section tasks**. This is cohort membership, not created campaign-task state.

All five native generation prompts were present and populated:

| Section prompt | Content characters |
| --- | ---: |
| `section_summary` | 3,429 |
| `section_pharmacology` | 16,621 |
| `section_tolerance` | 4,860 |
| `section_harm_potential` | 15,332 |
| `section_history_culture` | 5,831 |

An actual native `reader.sources('atomoxetine')` call was attempted without substituting a credential. It failed with `AuthError`:

> Authentication required: Please sign in or provide an API key

That result records a denied source read, not a missing source document. The earlier and supplemental OAuth SQL reads independently confirm stored source availability. SQL access does not satisfy the scoped native campaign source-read boundary.

## Exact supplemental cohort ranking

An independent SELECT-only OAuth reader query inspected all 577 article identity/eligibility inputs and metadata/text-availability metrics for all **679** source documents. Its eligible slugs exactly matched the native audit. The resulting inventory applies the canonical fixed list of 15 registered source IDs and the campaign's sort: descending nonempty registered source count, English title comparison, then slug comparison. The SQL nonempty test uses the ECMAScript `String.trim` whitespace set explicitly, rather than SQL's narrower default space-only trim. Its contract-source hash and the complete ordered 310-record list are archived.

| Supplemental rank | Article | Populated registered sources |
| --- | --- | ---: |
| 1 | MDAI (`mdai`) | 7/15 |
| 71 | Atomoxetine (`atomoxetine`) | 3/15 |
| 239 | MK-801 (`mk-801`) | 2/15 |

This is a complete source-availability inventory with the current ordering rule, **not** a native frozen campaign or a `verify` result. Its task status is explicitly `not_created`. Sources and prompts were not rebound into canonical campaign snapshots. There is no canonical `runs/section-generation/cite-pi/state.json` in this checkout. Future `init`/`verify` must read scoped source documents and create or resume the actual engine-owned task ledger before dispatch.

The [execution reference](../../.agents/skills/sectionmaxxing/reference/execution.md#initialize-or-resume) says: "Use the unfiltered production reader for these commands." It also assigns task tracking to the live verifier's `articleTodos`. The supplemental inventory was not used to bypass that requirement. No higher-ranked unrequested drug was dispatched, and no named drug was moved ahead of the cohort.

## Named evidence readiness retained

Atomoxetine and MK-801 both have `priority: low`, empty index categories, and editorial status `needed`. They are URL-only records, not hidden-tag records. The five owned narrative fields remain summary, pharmacology, tolerance, harm potential, and history/culture. Generation preserves identity, dosage/duration, legality, reference pools, priority, index categories, layout placement, and editorial metadata.

| Drug | Valid populated source text | Existing substantive section excerpt | Other four quote records |
| --- | --- | --- | --- |
| Atomoxetine | DrugBank about 2,523 words; Wikipedia 2,267; TripSit 45 | Harm potential: 5,222 characters, about 625 substantive words | Absent |
| MK-801 | Wikipedia about 1,422 words; TripSit 72 | Harm potential: 4,157 characters, about 507 substantive words | Absent |

The exact `substantiveExcerpt`, `sourceBlocks`, and eligibility helpers were evaluated on the inspected live source documents. Initial evidence classification is `pending` for all five sections of each drug because stored source text is substantive. Neither currently has a source-poor-marker initial classification. These are readiness simulations, not created tasks, accepted candidates, or guarantees that every section should be replaced.

Atomoxetine's stored evidence contains material relevant to summary, pharmacology, harm, history, and discontinuation-related discussion. MK-801's stored preclinical reinforcement/dependence material does not establish a reliable human tolerance/reset timeline. A future isolated extraction must preserve a section when the relevant evidence is silent or insufficient, and parent review must reject unsupported human timelines or clinical instructions.

Sertraline remains normal priority and human reviewed with all five sections present, so it is outside the current eligibility contract. Amantadine and Venlafaxine remain missing canonical records/source documents in the inspected dataset; their separate intake work is not solved by this readiness task.

## Publication and transition gate

The [publication reference](../../.agents/skills/sectionmaxxing/reference/publication.md#current-backend-gate) states: "Publication remains closed for this workflow pending separate authorization under the current operator-write allowlist."

The [sectionmaxxing skill](../../.agents/skills/sectionmaxxing/SKILL.md#4-publish-and-verify-this-substance) requires all five tasks to be terminal and the article completion gate to pass before another substance is generated. That gate includes matching database and canonical-site evidence for replacements and preservation of non-owned fields. This user-authorized local implementation work does not open production publication or allow jumping that per-drug gate. Ticket 08 therefore retains an external publication/site-verification dependency even after native reads and worker account selection are repaired.

## Local evidence and next executable steps

Artifacts are under `runs/section-generation/readiness-2026-09-29/`, outside Git through the existing `/runs/` ignore rule:

- `runtime-setup.json`: successful prescribed setup and pinned versions.
- `worker-preflight.json`: actual failed non-inference preflight, exit code, and exact refusal.
- `safe-oauth-account-metadata.json`: opaque account count/active-state metadata only.
- `serializer-diagnostic.json`: actual serializer isolation proof, explicitly not full worker readiness.
- `provider-env-read.json` and `native-reader-config.json`: provider-read outcome and token-free presence/target metadata.
- `native-reader-check.json`: actual frozen native read results and source-auth refusal.
- `native-eligible-audit.json`: complete native 310-article eligible cohort.
- `sql-source-availability-raw.json` and `supplemental-cohort-ranking.json`: full supplemental source availability and ordering.
- `named-substance-evidence-metrics.json` and `named-substance-live-routes.json`: prior source metrics and direct-route evidence.
- `artifact-digests.json`: SHA-256 integrity record for these local artifacts.

The private provider environment file is retained temporarily for the coordinator's authorized frozen public-build verification and subsequent deletion. Its contents are not included in the artifacts, this report, or Git.

The remaining executable path is concrete: use a deliberately approved current OAuth credential selection, provide functioning exact native scoped article-source access through existing authorized configuration, rerun the documented worker preflight, and initialize/resume plus verify the canonical full-cohort campaign. Inspect its actual active article and `articleTodos` before any packet reservation. Dispatch Atomoxetine only if that engine state and the authorized scope permit it. Preserve MK-801 undispatched until the preceding active article's complete publication/site gate is satisfied. No command or source code was changed to evade these prerequisites.
