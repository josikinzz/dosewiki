const pad = (value, width = 3) => String(value).padStart(width, "0");

const buildSubstance = (index) => {
  const id = pad(index);
  return {
    slug: `fixture-substance-${id}`,
    name: `Fixture Substance ${id}`,
    aliases: index % 11 === 0 ? [`Fixture Alias ${id}`] : [],
    summary: `Sanitized synthetic summary for fixture substance ${id}.`,
    priority: index <= 248 ? "normal" : "low",
  };
};

const buildEffect = (index) => {
  const id = pad(index);
  return {
    slug: `fixture-effect-${id}`,
    name: `Fixture Effect ${id}`,
    summary: `Sanitized synthetic summary for fixture effect ${id}.`,
    tags: index % 2 === 0 ? ["visual"] : ["cognitive"],
    featured: index <= 8,
  };
};

const buildReport = (index) => {
  const id = pad(index);
  return {
    slug: `fixture-report-${id}`,
    title: `Fixture Report ${id}`,
    author: `Fixture Contributor ${pad(((index - 1) % 8) + 1, 2)}`,
    substances: [`Fixture Substance ${pad(((index - 1) % 577) + 1)}`],
    summary: `Sanitized synthetic report summary ${id}.`,
  };
};

export const createPublicFixtureCorpus = () => ({
  substances: Array.from({ length: 577 }, (_, index) => buildSubstance(index + 1)),
  effects: Array.from({ length: 233 }, (_, index) => buildEffect(index + 1)),
  reports: Array.from({ length: 163 }, (_, index) => buildReport(index + 1)),
});
