import assert from "node:assert/strict";
import test from "node:test";

import { mentionsTerm, termFinder, termFragments, termMatcher } from "./term-match.mjs";

test("a term matches its plural and its -ing, -ed, and -ion forms, and nothing longer", () => {
  assert.equal(mentionsTerm("The phenidates are a class.", "Phenidate"), true);
  assert.equal(mentionsTerm("Replicating a visual effect.", "Replication"), true);
  assert.equal(mentionsTerm("Replications of the effect.", "Replication"), true);
  assert.equal(mentionsTerm("The artist replicated it.", "Replication"), true);
  assert.equal(mentionsTerm("recreations of the effect", "Replication"), false, "a synonym is not an inflection");
  assert.equal(mentionsTerm("Users felt lightheaded.", "Light"), false, "a longer word is not the term");
  assert.equal(mentionsTerm("A light dose.", "Light"), true);
  assert.equal(mentionsTerm("The comedowns vary.", "comedown"), true);
  assert.equal(mentionsTerm("Heavy toxicities.", "Toxicity"), true);
  assert.equal(mentionsTerm("Tripping alone.", "Trip"), true);
  assert.equal(mentionsTerm("Stripped down.", "Trip"), false);
  assert.equal(mentionsTerm("Entactogenic effects.", "Entactogen"), false);
});

test("each word of a multi-word term inflects, and separators stay literal", () => {
  assert.equal(mentionsTerm("Visual distortions occur.", "visual distortion"), true);
  assert.equal(mentionsTerm("The come-ups were fast.", "come-up"), true);
  assert.equal(mentionsTerm("The come up was fast.", "come-up"), false);
  assert.equal(mentionsTerm("The comeXup now.", "come.up"), false, "the dot is not a wildcard");
  assert.equal(mentionsTerm("2C-B is short.", "2C-B"), true);
  assert.equal(mentionsTerm("2C-Bs are short.", "2C-B"), false, "identifiers with digits or single letters never inflect");
});

test("the matcher is case-insensitive and cached", () => {
  assert.equal(termMatcher("Entactogen").test("CLASSIC ENTACTOGENS"), true);
  assert.equal(termMatcher("Entactogen"), termMatcher("Entactogen"));
});

test("every match contains the term's fragments in order, so a substring prefilter never drops one", () => {
  const cases = [
    ["Replication", ["Replicating a visual effect.", "Replications."]],
    ["come-up", ["The come-ups were fast."]],
    ["Toxicity", ["Heavy toxicities."]],
    ["Trip", ["Tripping alone."]],
    ["visual distortion", ["Visual distortions occur."]],
  ];
  for (const [term, texts] of cases) {
    const fragments = termFragments(term);
    for (const text of texts) {
      assert.equal(mentionsTerm(text, term), true, `${term} matches ${text}`);
      let from = 0;
      for (const fragment of fragments) {
        const at = text.toLowerCase().indexOf(fragment.toLowerCase(), from);
        assert.ok(at >= 0, `${term}: fragment ${fragment} in ${text}`);
        from = at + fragment.length;
      }
    }
  }
});

test("a term finder answers exactly what mentionsTerm answers, in the order given", () => {
  const terms = ["Replication", "come-up", "2C-B", "5-HT2A", "Trip", "visual distortion", "Light", "Toxicity", "Phenidate", "be", "-ish", "→"];
  const texts = [
    "Replicating a visual effect.", "The come-ups were fast.", "The come up was fast.", "2C-B is short.", "2C-Bs are short.",
    "5-HT2A agonists", "Tripping alone.", "Stripped down.", "Visual distortions occur.", "Users felt lightheaded.",
    "A LIGHT dose.", "Heavy toxicities.", "The phenidates.", "To be or not.", "Greenish-ish.", "a → b",
    "_replication", "éreplication", "Kreplication", "replication_", "x2C-B", "", "no terms at all",
  ];
  const find = termFinder(terms);
  for (const text of texts) {
    assert.deepEqual(find(text), terms.filter((term) => mentionsTerm(text, term)), text);
  }
});

test("a term finder keeps the caller's items", () => {
  const items = [{ term: "Trip", target: "a" }, { term: "Light", target: "b" }];
  assert.deepEqual(termFinder(items, (item) => item.term)("light trips"), items);
});
