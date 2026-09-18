const STANDARD_SOURCE_PATTERNS = [
  'psychonautwiki.org',
  'psychonautwiki.net',
  'erowid.org',
  'tripsit.me',
  'tripbot.tripsit.me',
  'factsheet.tripsit.me',
  'benzos.tripsit.me',
  'drugbank.com',
  'go.drugbank.com',
  'isomerdesign.com',
  'tihkal.info',
  'disregardeverythingisay.com',
  'drugusersbible.org',
  'drugusersbible.com',
  'thedrugclassroom.com',
  'wikipedia.org',
  'wikimedia.org',
  'saferparty.ch',
  'dancesafe.org',
  'bluelight.org',
];

export function isStandardSource(url) {
  if (!url) return false;
  const lowerUrl = url.toLowerCase();
  return STANDARD_SOURCE_PATTERNS.some((pattern) => lowerUrl.includes(pattern));
}

export function getCitationSortKey(citation) {
  return (citation.name || '').toLowerCase();
}

export function normalizeCitationUrl(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed);
    const pathname = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.protocol.toLowerCase()}//${parsed.host.toLowerCase()}${pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return trimmed.replace(/\/+$/, '');
  }
}

export function isDuplicateCitation(citation, existingCitations) {
  const normalizedUrl = normalizeCitationUrl(citation?.url).toLowerCase();
  if (!normalizedUrl) return false;

  return existingCitations.some((existing) => {
    return normalizeCitationUrl(existing?.url).toLowerCase() === normalizedUrl;
  });
}
