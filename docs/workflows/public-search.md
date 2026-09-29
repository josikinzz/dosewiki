# Public search identity and locale contract

The server search index owns matching. The browser manifest projects the same
identities and uses the shared matcher, omitting prose and taxonomy keywords.
API suggestions and server-rendered search select from the requested locale's
index before projecting results. English names and canonical App Paths remain
available alongside approved localized labels.

## Chinese substance names

Substance names are canonical identities, not translated display copy. Reviewed
Chinese names belong in `identification.alternative_names` through the existing
editorial article workflow. They reach the native library projection, server
index and browser manifest without a new registry. A glossary rendering does
not automatically become an identity alias.

Record an inspectable name source and a human editorial decision before applying
an alias. Accept Simplified and Traditional variants explicitly when supported.
The matcher does not transliterate Chinese or infer pinyin. Ambiguous slang such
as `晚安` requires separate evidence and ambiguity review.

Priority and index-category exclusions continue to apply. Adding aliases or
generating narrative sections does not promote a URL-only or hidden substance.

## Unicode matching

Text matching uses NFKD and lowercase folding. Compatibility forms such as
full-width Latin letters and digits match their ordinary forms. Common combining
accents in U+0300 to U+036F are folded; letters, numbers and other marks remain in compact
identity keys. Removing punctuation never discards a Han prefix to produce an
unrelated Latin or numeric query. Report-to-substance keys use the same policy.

Script variants must exist as actual labels or aliases. Unsupported names remain
unmatched rather than acquiring an inferred translation.

## CAS lookup

CAS identifiers are separate typed search data derived from the article's stored
scalar `identification.cas_number`. Complete registry-number queries require
two to seven digits, two digits and one check digit, separated by hyphens, with a
valid CAS checksum. Outer whitespace, whitespace around hyphens, compatibility
digits and accepted Unicode hyphen variants are normalized. Hyphenless, partial
and malformed registry-number queries do not use fuzzy identifier matching.

A valid query returns every matching publicly eligible substance, subject to the
normal result limit. Duplicate numbers do not select a redirect winner. Missing
or invalid stored numbers are omitted from identifier lookup. A checksum verifies
transcription only; it does not prove the chemical assignment. No salt, free-base,
hydrate or stereoisomer equivalence is inferred.

Identifiers survive locale projection and manifest serialization. A change to a
stored identifier changes the index input hash and manifest version. The manifest
payload shape is versioned separately. Do not hand-edit generated corpus data.

## Navigation and freshness

An ordinary same-tab link activation revokes the outgoing search draft before
its destination commits. Arrival at another route also clears that draft. A late
timer or suggestion response cannot reclaim navigation. Background taps still
settle drafts, and explicit submit, clear and fresh typing retain their behavior.
Modifier clicks, other browsing contexts, downloads and same-page anchors do not
cancel the current tab's pending search.

Browser manifests and suggestion responses are shared per locale/query for the
lifetime of the document. This implementation keeps that policy: an already-open
document needs a full reload to obtain editorial alias or identifier changes.
There is no polling or promised bounded in-document refresh. A reload uses the
existing HTTP cache contract and locale-qualified manifest ETag. Server derived
data retains its revision-aware cache and existing publication invalidation path.

Verify manifest, API and SSR together when changing identity or localization.
Use a production-shaped build for route behavior and record deployment evidence
before claiming a fix is live. Editorial application, visibility promotion and
application deployment remain separate operations.
