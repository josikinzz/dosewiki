# AGENTS.md

## About dose.wiki

**dose.wiki** synthesizes factual knowledge about psychoactive substances from harm-reduction and reference sources into a single open dataset. It aims to establish an open standard for psychopharmacology datasets, supporting research and education.

- **[Substance articles](https://dose.wiki/substances):** dose, duration, effects, interactions, chemistry, and legality by country.
- **[Subjective effect articles](https://dose.wiki/effects):** individual components of altered states, from [visual drifting](https://dose.wiki/effects/drifting) to [ego death](https://dose.wiki/effects/ego-death).
- **[Replications](https://dose.wiki/replications):** images, videos, and audio that recreate subjective effects.
- **[Trip reports](https://dose.wiki/reports):** first-person accounts of individual experiences.

### Sources and review

The factual knowledge within substance articles draw on decades of documentation by scientists, psychonauts, and the harm-reduction community, gathered from [ten harm-reduction and reference resources](https://dose.wiki/docs/how#sources). Each article links to the source pages that informed it.

Substance articles were drafted by LLMs, with dosage information transcribed by software from online tables. Real life human beings then reviewed and carefully edited each output over the course of months. The [how articles are made](https://dose.wiki/docs/how) explains the process in depth.

So, why did we use LLMs as part of this process? This was done for several reasons, but primarily speed, practicality, and reproducibility. Josie Kins, a co-founder of this project, the founder of PsychonautWiki, and numerous other similar projects, has real-world experience hand-crafting substance encyclopedias with teams of human beings. We know what it takes. It is an incredibly arduous and long term process. For example, the first draft of psychonautwiki took an entire community of people from 2011-2016. With incredibly few people reliably sticking around, and their workflows always leaving with them. Our community doesn't need a modern and open platform in 5 years from now. We need one yesterday.

This is why factual knowledge from across the internet was carefully scraped from online resources, assembled into either mechanistic parsers or an LLM synthesis pipeline, and aggregated into a single beautifully machine readable dataset, for anybody to download. A process that was followed by months of human review before we felt comfortable publishing it, and in total took about a year to complete. We deeply care about what we are doing here, and are now building as humans on top of this new open standard.

**dose.wiki is in beta.** Each article's **Article Status** section tracks its progress and identifies whether it has been human-reviewed. Review is essential to trustworthiness: reviewers verify pharmacology, check dosage and interactions for potentially harmful errors, and add corrections, references, and their own explanations. Errors can have serious real-world consequences, so we welcome anyone able to submit feedback via the forms at the bottom of each substance article!

The other collections are entirely human-created:

- **Effect articles** form the [Subjective Effect Index](https://dose.wiki/effects), written over more than a decade across several websites.
- **Replications** depict the subjective appearance of experiences through artwork, mostly by members of Reddit's [r/replications](https://reddit.com/r/replications) community.
- **Trip reports** are written by their authors and reviewed by an editor before publication.

The site and dataset continue to evolve toward 1.0. Check back for updates, or [send questions, comments, and corrections](https://dose.wiki/about#contact).

## Rules

1. PlanetScale Postgres is the only runtime and the source of truth; files under `data/` and `content/` are seeds and exports, never the live record.
2. Production writes need `DATA_BACKEND=postgres`, an explicit `--target` or `TARGET_POSTGRES_URL`, and every guard the command names; a dry run is not authorization.
3. `DATA_WRITES_FROZEN=1` fails closed at every write boundary; never weaken the freeze, target checks, confirmation phrases, or role checks.
4. Public, editor, and Effect Index builds are separate artifacts; only the editor build carries write credentials or editorial browser modules.
5. Never commit credentials; `.env.example` documents every variable and `.env.local` stays untracked.
6. Never hand-edit a file that `data/lineage.json` names as generated; change the producer input and run its recorded command.
7. Article shape is owned by `src/schema/substance.schema.ts`; runtime types and schema files under `lib/postgres/` derive from it.
8. Preserve Auth.js identity, database-backed roles, human editorial authority, and revision checks; never infer authorization from a credential alone.
9. Write links as App Paths; a local source change is not a deployed change, so never claim production state without deployment evidence.
10. Em dashes are banned in all text.

## Where to read next

- Before any non-trivial change, read [docs/glossary.md](docs/glossary.md) for the vocabulary and [ARCHITECTURE.md](ARCHITECTURE.md) for the layout.
- For install, dev, and verification commands, read [CONTRIBUTING.md](CONTRIBUTING.md); `package.json` is the command catalog.
- For deployment, credentials, or the write ceremony, read [docs/operations/deployment.md](docs/operations/deployment.md) and [docs/operations/data-credentials.md](docs/operations/data-credentials.md).
- For citations, legality drafts, replication intake, or trip-report timelines, read the matching runbook in [docs/workflows/](docs/README.md#workflows).
- For UI work, read [docs/design/ui-kit.md](docs/design/ui-kit.md) and [docs/design/visual-style-guide.md](docs/design/visual-style-guide.md).
- For molecule editing or rendering, read [docs/design/molecule-editor.md](docs/design/molecule-editor.md) and [docs/architecture/openchemlib-fork.md](docs/architecture/openchemlib-fork.md).
- For datasets and prose, read [data/README.md](data/README.md) and [content/README.md](content/README.md).
