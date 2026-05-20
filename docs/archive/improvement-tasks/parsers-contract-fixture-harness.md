# Parsers Contract Fixture Harness

## Files

- `lib/parserContracts.test.ts`
- `scripts/parsers/contracts.ts`
- `scripts/parsers/types.ts`
- `scripts/parsers/base.ts`
- `scripts/parsers/*`
- `scripts/parsers/*/*`

## Problem

Parser contract tests currently mix base helper tests, registry lookup tests, and hand-written parser examples in one file. The tests are valuable, but the contract Interface is implicit: each parser is expected to return the empty result shape, canonical source values, section extraction metadata, normalized dose/duration units, and source-attributed records, yet those invariants are not enforced uniformly across every parser Adapter.

This keeps the test Module shallow. Adding or changing a parser requires knowing which expectations are conventions, which are contract requirements, and which are just examples in a specific fixture.

## Proposed Deepening Opportunity

Build a parser contract fixture harness that treats `SourceParser` as the test surface. Define reusable contract assertions for:

- empty input returns a complete empty `ParserResult`
- emitted records use the parser's canonical source identity
- `sectionsExtracted` reflects non-empty extracted fields
- narrative content always uses the shared `NarrativeContent` shape
- dose and duration units are normalized where structured records are emitted
- unsupported sections do not produce partial malformed records

Each parser Adapter should register a small fixture table: source ID, substance name, input content, expected extracted sections, and expected representative records. Keep parser-specific edge cases in parser-local tests only when they are not part of the shared contract.

## Benefits

- **Module**: parser contract testing becomes a deep Module around the `SourceParser` Interface.
- **Interface**: the contract harness makes parser obligations explicit and reusable.
- **Implementation**: source-specific parsing quirks stay in each parser Adapter, while shared invariants stay local to the harness.
- **Depth**: one fixture harness gives leverage over every parser and future source additions.
- **Seam**: the `SourceParser` Interface becomes the seam for parser behavior, instead of testing helper internals as a proxy.
- **Adapter**: every concrete source parser is tested as an Adapter satisfying the same contract.
- **Leverage**: new parser additions need a fixture table and immediately inherit all contract assertions.
- **Locality**: failures point to either a shared contract break or a source-specific fixture mismatch.

## Test Plan

- Introduce a `describeParserContract` helper used by TripSit, PsychonautWiki, Erowid, DrugBank, Wikipedia, and smaller source parsers.
- Move broad invariants from `lib/parserContracts.test.ts` into reusable contract assertions.
- Keep base helper tests separate from parser contract tests.
- Add negative fixtures for empty input and malformed sections.
- Run `npm run test -- parserContracts` or the repo's equivalent targeted Vitest command, then the full `npm run test`.

## Risk/Rollout Notes

- Do not rewrite parser implementations during the harness extraction; first codify current behavior.
- Expect some existing parsers to reveal inconsistent empty-result or `sectionsExtracted` behavior. Record those as follow-up parser fixes rather than silently changing behavior in the harness task.
- Keep fixtures small enough that parser contract failures remain readable.
