// Auto-generated source favicon configuration
// Maps URL patterns to favicon files

export interface SourceConfig {
  id: string;
  patterns: string[];
  urlPatterns?: string[]; // Match against full URL (for archive.org links etc)
  favicon: string;
}

export const sourceConfigs: SourceConfig[] = [
  {
    "id": "psychonautwiki",
    "patterns": [
      "psychonautwiki.org",
      "psychonautwiki.net"
    ],
    "favicon": "/favicons/psychonautwiki.png"
  },
  {
    "id": "erowid",
    "patterns": [
      "erowid.org"
    ],
    "favicon": "/favicons/erowid.png"
  },
  {
    "id": "tripsit",
    "patterns": [
      "tripsit.me"
    ],
    "favicon": "/favicons/tripsit.png"
  },
  {
    "id": "wikipedia",
    "patterns": [
      "wikipedia.org",
      "wikimedia.org"
    ],
    "favicon": "/favicons/wikipedia.png"
  },
  {
    "id": "pubmed",
    "patterns": [
      "pubmed.ncbi.nlm.nih.gov",
      "ncbi.nlm.nih.gov",
      "nih.gov",
      "pmc.ncbi.nlm.nih.gov"
    ],
    "favicon": "/favicons/pubmed.png"
  },
  {
    "id": "bluelight",
    "patterns": [
      "bluelight.org"
    ],
    "favicon": "/favicons/bluelight.png"
  },
  {
    "id": "reddit",
    "patterns": [
      "reddit.com"
    ],
    "favicon": "/favicons/reddit.png"
  },
  {
    "id": "pubchem",
    "patterns": [
      "pubchem.ncbi.nlm.nih.gov"
    ],
    "favicon": "/favicons/pubchem.png"
  },
  {
    "id": "drugbank",
    "patterns": [
      "drugbank.com",
      "go.drugbank.com"
    ],
    "favicon": "/favicons/drugbank.png"
  },
  {
    "id": "isomerdesign",
    "patterns": [
      "isomerdesign.com",
      "tihkal.info"
    ],
    "favicon": "/favicons/isomerdesign.png"
  },
  {
    "id": "thedrugclassroom",
    "patterns": [
      "thedrugclassroom.com"
    ],
    "favicon": "/favicons/thedrugclassroom.png"
  },
  {
    "id": "drugusersbible",
    "patterns": [
      "drugusersbible.org",
      "drugusersbible.com"
    ],
    "urlPatterns": [
      "the-drug-users-bible"
    ],
    "favicon": "/favicons/drugusersbible.png"
  },
  {
    "id": "dancesafe",
    "patterns": [
      "dancesafe.org"
    ],
    "favicon": "/favicons/dancesafe.png"
  },
  {
    "id": "drugs-forum",
    "patterns": [
      "drugs-forum.com"
    ],
    "favicon": "/favicons/drugs-forum.png"
  },
  {
    "id": "disregardeverythingisay",
    "patterns": [
      "disregardeverythingisay.com"
    ],
    "favicon": "/favicons/disregardeverythingisay.png"
  }
];

/**
 * Get favicon path for a citation URL
 */
export function getFaviconForUrl(url: string): string | null {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname;
    const fullUrl = url.toLowerCase();

    for (const source of sourceConfigs) {
      // Check hostname patterns
      if (source.patterns.some(pattern => hostname.includes(pattern))) {
        return source.favicon;
      }
      // Check full URL patterns (for archive.org links etc)
      if (source.urlPatterns?.some(pattern => fullUrl.includes(pattern))) {
        return source.favicon;
      }
    }
  } catch {
    // Invalid URL
  }
  return null;
}
