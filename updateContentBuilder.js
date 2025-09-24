const fs = require('fs');
const path = 'src/data/contentBuilder.ts';
let text = fs.readFileSync(path, 'utf8');
const oldBlock = unction buildCitations(citations?: RawCitation[]): CitationEntry[] {
  if (!Array.isArray(citations)) {
    return [];
  }

  return citations
    .map((citation) => {
      const label = cleanString(citation.name);
      if (!label) {
        return null;
      }
      const href = cleanString(citation.reference);
      return {
        label,
        href,
      };
    })
    .filter((entry): entry is CitationEntry => entry !== null);
}
;
const newBlock = unction buildSearchCitation(searchUrl?: string | null): CitationEntry | null {
  const href = cleanString(searchUrl ?? null);
  if (!href) {
    return null;
  }

  let label = "External reference";

  try {
    const url = new URL(href);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const hostLabelMap: Record<string, string> = {
      "knowdrugs.app": "KnowDrugs profile",
      "drugs.page.link": "KnowDrugs profile",
      "drugbank.com": "DrugBank entry",
      "drugs.com": "Drugs.com monograph",
      "drugusersbible.org": "Drug Users Bible entry",
      "psychonautwiki.net": "PsychonautWiki entry",
      "tripsit.me": "TripSit reference",
      "bluedark.org": "BlueDark profile",
      "bluelight.org": "Bluelight discussion",
      "thedrugclassroom.com": "The Drug Classroom article",
      "anodyne.wiki": "Anodyne wiki entry",
      "trippywiki.com": "TrippyWiki entry",
      "erowid.org": "Erowid vault",
      "substancesearch.org": "Substance Search entry",
      "reference.medscape.com": "Medscape reference",
      "accessdata.fda.gov": "FDA label",
      "fda.gov": "FDA reference",
      "frontiersin.org": "Frontiers article",
      "nature.com": "Nature article",
      "saferparty.ch": "Saferparty analysis",
      "drugwise.org.uk": "DrugWise briefing",
      "unodc.org": "UNODC reference",
      "sciencedirect.com": "ScienceDirect article",
      "talktofrank.com": "Talk to Frank article",
      "cfsre.org": "CFSRE report",
      "medchemexpress.com": "MedChemExpress data",
      "webmd.com": "WebMD article",
      "pubchem.ncbi.nlm.nih.gov": "PubChem record",
      "pubmed.ncbi.nlm.nih.gov": "PubMed record",
      "isomerdesign.com": "Isomer Design reference",
      "tripreport.net": "TripReport archive",
      "tripsitter.com": "Tripsitter guide",
      "tripsitter.substack.com": "Tripsitter article",
      "ivolabs.com": "IVO Labs report",
      "rechemco.to": "Rechemco reference"
    };
    const matched = Object.entries(hostLabelMap).find(([domain]) => host === domain || host.endsWith('.' + domain));
    if (matched) {
      label = matched[1];
    } else {
      const segments = host.split('.');
      const base = segments.length > 2 ? segments[segments.length - 2] : segments[0];
      label = ${titleize(base)} reference;
    }
  } catch {
    // keep default label
  }

  return {
    label,
    href,
  };
}

function buildCitations(citations?: RawCitation[], searchUrl?: string | null): CitationEntry[] {
  const entries: CitationEntry[] = [];

  if (Array.isArray(citations)) {
    citations.forEach((citation) => {
      const label = cleanString(citation.name);
      if (!label) {
        return;
      }

      const href = cleanString(citation.reference);
      entries.push({
        label,
        href,
      });
    });
  }

  const searchEntry = buildSearchCitation(searchUrl);
  if (searchEntry) {
    const duplicate = searchEntry.href
      ? entries.some((entry) => entry.href === searchEntry.href)
      : false;
    if (!duplicate) {
      entries.push(searchEntry);
    }
  }

  return entries;
}
;

const normalizedOld = oldBlock.replace(/\n/g, "\r\n");
const normalizedNew = newBlock.replace(/\n/g, "\r\n");
if (!text.includes(normalizedOld)) {
  throw new Error("target block not found");
}
text = text.replace(normalizedOld, normalizedNew);
fs.writeFileSync(path, text);
