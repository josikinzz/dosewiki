import { memo, useState } from "react";
import { Icon, type IconName } from "../common/Icon";
import { SectionCard } from "../common/SectionCard";
import { IconBadge } from "../common/IconBadge";
import type { SubstanceArticle } from "../../schema";

/** Number of lines to show when collapsed */
const COLLAPSED_LINE_COUNT = 3;
/** Minimum lines before we bother truncating (if content is this short, just show it all) */
const MIN_LINES_TO_TRUNCATE = 6;
/** Approximate characters per line for truncation estimation */
const CHARS_PER_LINE = 100;

/** Renders text with 4-digit years automatically bolded */
function renderWithBoldYears(text: string): React.ReactNode {
  // Match 4-digit years (1000-2999 range to be reasonable)
  const yearPattern = /\b([12]\d{3})\b/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = yearPattern.exec(text)) !== null) {
    // Add text before the year
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    // Add the bolded year
    parts.push(<strong key={match.index} className="font-semibold text-fuchsia-300">{match[1]}</strong>);
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

/** Estimates the number of visual lines content will take (accounting for wrapping) */
function estimateVisualLines(content: string): number {
  const paragraphs = content.split('\n');
  let totalLines = 0;

  for (const para of paragraphs) {
    if (para.length === 0) {
      totalLines += 1; // Empty line between paragraphs
    } else {
      totalLines += Math.ceil(para.length / CHARS_PER_LINE);
    }
  }

  return totalLines;
}

/** Checks if content needs truncation (only if longer than 6 visual lines) */
function needsTruncation(content: string): boolean {
  return estimateVisualLines(content) > MIN_LINES_TO_TRUNCATE;
}

/** Truncates content to approximately 3 visual lines, returns text ending cleanly at a word */
function truncateContent(content: string): string {
  const paragraphs = content.split('\n');
  const resultParts: string[] = [];
  let linesUsed = 0;

  for (const para of paragraphs) {
    if (linesUsed >= COLLAPSED_LINE_COUNT) break;

    if (para.length === 0) {
      // Empty line (paragraph break)
      resultParts.push('');
      linesUsed += 1;
    } else {
      const paraVisualLines = Math.ceil(para.length / CHARS_PER_LINE);
      const linesRemaining = COLLAPSED_LINE_COUNT - linesUsed;

      if (paraVisualLines <= linesRemaining) {
        // Whole paragraph fits
        resultParts.push(para);
        linesUsed += paraVisualLines;
      } else {
        // Need to truncate this paragraph
        const charsToTake = linesRemaining * CHARS_PER_LINE;
        const truncated = para.slice(0, charsToTake);
        const lastSpace = truncated.lastIndexOf(' ');
        resultParts.push(lastSpace > charsToTake * 0.7 ? truncated.slice(0, lastSpace) : truncated);
        linesUsed = COLLAPSED_LINE_COUNT;
      }
    }
  }

  // Join and trim trailing whitespace/newlines so ellipsis appears right after last word
  return resultParts.join('\n').trimEnd();
}

// Exact heading to icon mapping for all known history/culture section headings
const EXACT_HEADING_ICONS: Record<string, IconName> = {
  // Discovery & Synthesis (lucide:flask-conical)
  "Discovery and Development": "lucide:flask-conical",
  "Discovery and Synthesis": "lucide:flask-conical",
  "Discovery and Early Research": "lucide:flask-conical",
  "Discovery and Early Development": "lucide:flask-conical",
  "Discovery and Scientific Development": "lucide:flask-conical",
  "Discovery and Early Synthesis": "lucide:flask-conical",
  "Discovery and Isolation": "lucide:flask-conical",
  "Discovery and Medical Development": "lucide:flask-conical",
  "Discovery and Significance": "lucide:flask-conical",
  "Discovery and Emergence": "lucide:flask-conical",
  "Discovery and Initial Research": "lucide:flask-conical",
  "Discovery and Early History": "lucide:flask-conical",
  "Discovery and Commercial Development": "lucide:flask-conical",
  "Discovery and Pharmaceutical Development": "lucide:flask-conical",
  "Discovery and Commercial Introduction": "lucide:flask-conical",
  "Synthesis and Early Research": "lucide:flask-conical",
  "Synthesis and Early Development": "lucide:flask-conical",
  "Synthesis and Isolation": "lucide:flask-conical",
  "Synthesis and Scientific Discovery": "lucide:flask-conical",
  "Synthesis and Commercial Development": "lucide:flask-conical",
  "Synthesis and Medical Development": "lucide:flask-conical",
  "Synthesis": "lucide:flask-conical",
  "Design and Synthesis": "lucide:flask-conical",
  "Chemical Identification and Synthesis": "lucide:flask-conical",
  "Chemical Isolation and Synthesis": "lucide:flask-conical",
  "Western Discovery and Synthesis": "lucide:flask-conical",
  "Scientific Discovery": "lucide:flask-conical",
  "Scientific Discovery and Early Medical Applications": "lucide:flask-conical",
  "Antidepressant Discovery": "lucide:flask-conical",
  "Discovery of Anti-Addiction Properties": "lucide:flask-conical",
  "Discovery of Anticonvulsant Properties": "lucide:flask-conical",
  "Modern Isolation": "lucide:flask-conical",
  "Isolation and Medical Development": "lucide:flask-conical",
  "Origins and Discovery": "lucide:flask-conical",

  // Research & Science (lucide:microscope)
  "Therapeutic Research": "lucide:microscope",
  "Clinical Research": "lucide:microscope",
  "Pharmaceutical Research": "lucide:microscope",
  "Scientific Research": "lucide:microscope",
  "Scientific Research Applications": "lucide:microscope",
  "Scientific Interest": "lucide:microscope",
  "Scientific Development": "lucide:microscope",
  "Research and Publication": "lucide:microscope",
  "Early Research and Commentary": "lucide:microscope",
  "Early Research and Medical Development": "lucide:microscope",
  "Therapeutic and Cognitive Research": "lucide:microscope",
  "Alcoholism Research": "lucide:microscope",
  "Research into Addiction Treatment Potential": "lucide:microscope",
  "Medical and Psychiatric Research": "lucide:microscope",
  "Intelligence Agency Research": "lucide:microscope",
  "Psychotherapeutic Research": "lucide:microscope",
  "Government Research Programs": "lucide:microscope",
  "Academic Research and the Prohibition Era": "lucide:microscope",
  "Research Renaissance": "lucide:microscope",
  "Modern Research Revival": "lucide:microscope",
  "Contemporary Research": "lucide:microscope",
  "Research and Cultural Expression": "lucide:microscope",
  "Development as a Research Tool": "lucide:microscope",
  "Medical Patent Research": "lucide:microscope",

  // Medical & Therapeutic (lucide:stethoscope)
  "Medical and Military Applications": "lucide:stethoscope",
  "Psychiatric Applications": "lucide:stethoscope",
  "Therapeutic Use": "lucide:stethoscope",
  "Early Medical Use and Research": "lucide:stethoscope",
  "Medical Use and Changing Perceptions": "lucide:stethoscope",
  "Medical Use and Discontinuation": "lucide:stethoscope",
  "Contemporary Medical Use": "lucide:stethoscope",
  "Early Medical Applications": "lucide:stethoscope",
  "Post-War Medical Applications": "lucide:stethoscope",
  "ADHD Treatment": "lucide:stethoscope",
  "Development as Addiction Treatment": "lucide:stethoscope",
  "End-of-Life Applications": "lucide:stethoscope",
  "Use in Medical-Assisted Dying": "lucide:stethoscope",
  "Specialized Applications": "lucide:stethoscope",
  "Medical Decline": "lucide:stethoscope",

  // Pharmaceutical & Development (lucide:pill)
  "Development and Approval": "lucide:pill",
  "Pharmaceutical Development": "lucide:pill",
  "Modern Pharmaceutical Development": "lucide:pill",
  "Medical Formulation Development": "lucide:pill",
  "Extended-Release Formulations": "lucide:pill",
  "Modern Formulations": "lucide:pill",
  "Development and Commercialization": "lucide:pill",
  "Development and Medical Approval": "lucide:pill",
  "Development and Initial Research": "lucide:pill",
  "Development and Regulatory Approval": "lucide:pill",
  "Development and Soviet Adoption": "lucide:pill",
  "Development of OxyContin": "lucide:pill",
  "Clinical Approval and Commercialization": "lucide:pill",
  "Influence on Antidepressant Development": "lucide:pill",
  "Commercial and Medical Development": "lucide:pill",
  "Commercial Development and Medical Applications": "lucide:pill",
  "Commercial Development and Medical Adoption": "lucide:pill",
  "Commercialization and Medical Use": "lucide:pill",
  "Medical Adoption and Regulatory Approvals": "lucide:pill",
  "Displacement by Benzodiazepines": "lucide:pill",

  // Commercial & Market (lucide:building-2)
  "Commercial History": "lucide:building-2",
  "Commercial Success": "lucide:building-2",
  "Commercial Availability": "lucide:building-2",
  "Commercial Marketing and Recreational Emergence": "lucide:building-2",
  "Commercial History and Supply Disruptions": "lucide:building-2",
  "Market Emergence": "lucide:building-2",
  "Market Withdrawal": "lucide:building-2",
  "Grey Market Availability": "lucide:building-2",
  "United States Market Dominance": "lucide:building-2",
  "Emergence in Consumer Markets": "lucide:building-2",
  "Rediscovery and Commercial Introduction": "lucide:building-2",

  // Regulatory & Legal (lucide:scale)
  "International Regulatory Response": "lucide:scale",
  "Regulatory Developments": "lucide:scale",
  "Regulatory Status and Documentation": "lucide:scale",
  "Regulatory Approvals": "lucide:scale",
  "Regulatory Changes and Reformulations": "lucide:scale",
  "Regulatory Approval and Commercialization": "lucide:scale",
  "Regulatory Approval and Market Entry": "lucide:scale",
  "United States Regulatory Approval": "lucide:scale",
  "European Market Authorization": "lucide:scale",
  "International Scheduling": "lucide:scale",
  "Historical Regulation Attempts": "lucide:scale",
  "Scheduling and Prohibition": "lucide:scale",
  "Prohibition and International Control": "lucide:scale",
  "Prohibition and Research Hiatus": "lucide:scale",
  "Post-Scheduling Era": "lucide:scale",
  "Illicit Use and Regulatory Response": "lucide:scale",
  "Recognition of Abuse Potential": "lucide:scale",

  // Traditional & Indigenous (lucide:leaf)
  "Traditional Use": "lucide:leaf",
  "Traditional Use in Southern Africa": "lucide:leaf",
  "Traditional Use in Central Africa": "lucide:leaf",
  "Traditional Use in Southeast Asia": "lucide:leaf",
  "Traditional Use in the Americas": "lucide:leaf",
  "Traditional Use and Etymology": "lucide:leaf",
  "Traditional Ceremonial Practice": "lucide:leaf",
  "Traditional Cultural Practices": "lucide:leaf",
  "Traditional Medicine": "lucide:leaf",
  "Traditional Ayurvedic Uses": "lucide:leaf",
  "Traditional and Spiritual Use": "lucide:leaf",
  "Traditional Religious and Spiritual Use": "lucide:leaf",
  "Ancient Origins and Traditional Use": "lucide:leaf",
  "Ancient and Indigenous Use": "lucide:leaf",
  "Ancient and Early Use": "lucide:leaf",
  "Ancient Use and Archaeological Evidence": "lucide:leaf",
  "Indigenous Origins and Archaeological Evidence": "lucide:leaf",
  "Mesoamerican Traditions and Colonial Suppression": "lucide:leaf",

  // Religious & Spiritual (lucide:sun)
  "Religious Perspectives": "lucide:sun",
  "Religious and Spiritual Traditions": "lucide:sun",
  "Brazilian Syncretic Religions": "lucide:sun",
  "Temple of the True Inner Light": "lucide:sun",
  "Entity Encounters": "lucide:sun",

  // Cultural (lucide:sparkles)
  "Cultural Significance": "lucide:sparkles",
  "Cultural References": "lucide:sparkles",
  "Cultural Emergence": "lucide:sparkles",
  "Cultural Associations": "lucide:sparkles",
  "Cultural Reception and Decline": "lucide:sparkles",
  "Cultural Representations and Industry Marketing": "lucide:sparkles",
  "Contemporary Cultural Status": "lucide:sparkles",
  "Prevalence and Cultural Significance": "lucide:sparkles",
  "Society and Culture": "lucide:sparkles",
  "Subcultural Associations": "lucide:sparkles",
  "Counterculture Movement": "lucide:sparkles",
  "The Summer of Love and STP Crisis": "lucide:sparkles",
  "Influence on Art and Music": "lucide:sparkles",

  // Recreational (lucide:party-popper)
  "Recreational Use": "lucide:party-popper",
  "Emergence as a Recreational Drug": "lucide:party-popper",
  "Emergence in Recreational Markets": "lucide:party-popper",
  "Recreational Emergence and Distribution": "lucide:party-popper",
  "Recreational Emergence and Cultural Impact": "lucide:party-popper",
  "Emergence of Recreational Use and Abuse Concerns": "lucide:party-popper",
  "Recreational Use and Research Chemical Era": "lucide:party-popper",
  "Recreational Use and 'Purple Drank' Culture": "lucide:party-popper",
  "Recreational Use and the Romilar Era": "lucide:party-popper",
  "Recreational Use and Popular Culture": "lucide:party-popper",
  "Recreational Use and Decline": "lucide:party-popper",
  "Recreational and Non-Medical Use": "lucide:party-popper",
  "Recreational Culture": "lucide:party-popper",
  "Recreational Community Use": "lucide:party-popper",
  "Rise of Recreational Use": "lucide:party-popper",
  "Rise to Popularity": "lucide:party-popper",
  "Emergence as a Club Drug": "lucide:party-popper",
  "Non-Medical Use": "lucide:party-popper",
  "Emergence of Psychoactive Interest": "lucide:party-popper",

  // Research Chemical Market (lucide:test-tubes)
  "Emergence as a Research Chemical": "lucide:test-tubes",
  "Reemergence as a Research Chemical": "lucide:test-tubes",
  "Emergence as a Designer Drug": "lucide:test-tubes",
  "Emergence as a Street Drug": "lucide:test-tubes",
  "The Magical Half-Dozen": "lucide:test-tubes",
  "Operation Web Tryp": "lucide:test-tubes",

  // Military (lucide:shield)
  "Military Applications": "lucide:shield",
  "Military Experimentation": "lucide:shield",
  "Military Use in World War II": "lucide:shield",
  "Military Applications and Australian Industry": "lucide:shield",
  "Wartime Use and Post-War Proliferation": "lucide:shield",
  "Scophedal and Wartime Applications": "lucide:shield",
  "Post-War Transfer to the United States": "lucide:shield",
  "Use as Truth Serum": "lucide:shield",
  "\"Truth Serum\" and Popular Culture": "lucide:shield",

  // Notable People (lucide:users)
  "Notable Individuals": "lucide:users",
  "Corporate Accountability and the Sackler Family": "lucide:users",

  // Incidents & Crises (lucide:alert-triangle)
  "Notable Incidents": "lucide:alert-triangle",
  "Notable Deaths": "lucide:alert-triangle",
  "Media Attention and Deaths": "lucide:alert-triangle",
  "Public Health Crisis": "lucide:alert-triangle",
  "Illicit Production and the Overdose Crisis": "lucide:alert-triangle",
  "Reformulation and Public Health Crisis": "lucide:alert-triangle",
  "Krypton-Related Fatalities": "lucide:alert-triangle",
  "Contaminated Toy Recall": "lucide:alert-triangle",
  "Pearl Harbor Incident": "lucide:alert-triangle",

  // Abuse & Misuse (lucide:alert-circle)
  "Recreational Abuse": "lucide:alert-circle",
  "Recreational Abuse and Cultural Impact": "lucide:alert-circle",
  "Abuse Concerns in Hong Kong": "lucide:alert-circle",
  "Misuse and Public Health Concerns": "lucide:alert-circle",
  "Misuse and Cultural Notoriety": "lucide:alert-circle",
  "Association with Drug-Facilitated Sexual Assault": "lucide:alert-circle",
  "Criminal Misuse": "lucide:alert-circle",
  "Emergence as Krokodil": "lucide:alert-circle",
  "Widespread Use and the Emergence of Heroin": "lucide:alert-circle",

  // Capital Punishment & Euthanasia (lucide:gavel)
  "Use in Capital Punishment": "lucide:gavel",
  "Capital Punishment and Euthanasia": "lucide:gavel",
  "Use in Nazi Euthanasia Programs": "lucide:gavel",

  // Historical & Timeline (lucide:clock)
  "Modern History": "lucide:clock",
  "Origins and Early History": "lucide:clock",
  "United States History": "lucide:clock",
  "Social History in the United States": "lucide:clock",
  "Internet Era and Contemporary Use": "lucide:clock",
  "European Colonial Era": "lucide:clock",
  "Dietary Supplement and Bodybuilding Era": "lucide:clock",

  // Contemporary (lucide:calendar)
  "Contemporary Use": "lucide:calendar",
  "Contemporary Prevalence": "lucide:calendar",
  "Contemporary Use and Availability": "lucide:calendar",
  "Contemporary Internet Culture": "lucide:calendar",
  "Contemporary Developments": "lucide:calendar",
  "Contemporary Production and Trafficking": "lucide:calendar",
  "Reformulation and Contemporary Status": "lucide:calendar",
  "Modern Documentation and Use": "lucide:calendar",
  "Modern Expansion": "lucide:calendar",
  "Modern Popularization": "lucide:calendar",
  "Modern Rediscovery": "lucide:calendar",

  // Geographic & Spread (lucide:globe)
  "International Adoption": "lucide:globe",
  "International Introduction": "lucide:globe",
  "International Availability": "lucide:globe",
  "Introduction to Europe": "lucide:globe",
  "Introduction to the United States": "lucide:globe",
  "Popularity in the Netherlands": "lucide:globe",
  "South Africa": "lucide:globe",
  "Origins and Spread Through Oceania": "lucide:globe",
  "Western Contact and Global Spread": "lucide:globe",
  "Colonial Encounter": "lucide:globe",
  "Colonial Economic Impact": "lucide:globe",
  "European Documentation and Isolation": "lucide:globe",

  // Production & Trade (lucide:factory)
  "Global Production and Trade": "lucide:factory",
  "Global Production and Distribution": "lucide:factory",
  "Global Trafficking Networks": "lucide:factory",
  "Industrial Production and Applications": "lucide:factory",
  "Agricultural and Industrial Applications": "lucide:factory",
  "Alleged Clandestine Production": "lucide:factory",

  // Media & Controversy (lucide:newspaper)
  "Media Coverage and Misinformation": "lucide:newspaper",
  "Media Portrayal and the Violence Narrative": "lucide:newspaper",
  "Efficacy Controversy": "lucide:newspaper",
  "Off-Label Marketing Controversy": "lucide:newspaper",
  "Marketing Controversies": "lucide:newspaper",
  "Emerging Safety Concerns": "lucide:newspaper",

  // Miscellaneous (lucide:bookmark)
  "First Human Reports": "lucide:bookmark",
  "Documentation and Early Detection": "lucide:bookmark",
  "Etymology": "lucide:bookmark",
  "Nomenclature": "lucide:bookmark",
  "Street Terminology": "lucide:bookmark",
  "Historical Use as Poison": "lucide:bookmark",
  "Association with European Witchcraft": "lucide:bookmark",
  "Toad Venom": "lucide:bookmark",
  "Botanical Classification": "lucide:bookmark",
  "Botanical Classification and Chemical Investigation": "lucide:bookmark",
  "Other Notable Uses": "lucide:bookmark",
  "Origins and Ancient Trade": "lucide:bookmark",

  // Sports & Performance (lucide:trophy)
  "Doping Controversies in Sports": "lucide:trophy",
  "Dietary Supplements and Athletic Use": "lucide:trophy",
  "Use in Performance Settings": "lucide:trophy",
  "Cosmonautic Use": "lucide:rocket",

  // Specific Events
  "United States: 'Gas Station Heroin'": "lucide:store",
};

// Keyword fallback map for headings not in the exact match list
const KEYWORD_ICON_MAP: Record<string, IconName> = {
  // Discovery & synthesis
  discovery: "lucide:flask-conical",
  synthesis: "lucide:flask-conical",
  isolation: "lucide:flask-conical",
  // Research & science
  research: "lucide:microscope",
  scientific: "lucide:microscope",
  studies: "lucide:microscope",
  // Medical
  medical: "lucide:stethoscope",
  clinical: "lucide:stethoscope",
  therapeutic: "lucide:stethoscope",
  treatment: "lucide:stethoscope",
  psychiatric: "lucide:stethoscope",
  // Pharmaceutical
  pharmaceutical: "lucide:pill",
  formulation: "lucide:pill",
  approval: "lucide:pill",
  // Commercial
  commercial: "lucide:building-2",
  market: "lucide:building-2",
  // Regulatory
  regulatory: "lucide:scale",
  scheduling: "lucide:scale",
  prohibition: "lucide:scale",
  // Traditional
  traditional: "lucide:leaf",
  indigenous: "lucide:leaf",
  ancient: "lucide:leaf",
  ceremonial: "lucide:leaf",
  // Religious
  religious: "lucide:sun",
  spiritual: "lucide:sun",
  // Cultural
  cultural: "lucide:sparkles",
  counterculture: "lucide:sparkles",
  subcultural: "lucide:sparkles",
  // Recreational
  recreational: "lucide:party-popper",
  "club drug": "lucide:party-popper",
  // Research chemical
  "research chemical": "lucide:test-tubes",
  "designer drug": "lucide:test-tubes",
  // Military
  military: "lucide:shield",
  "truth serum": "lucide:shield",
  wartime: "lucide:shield",
  // Notable people
  notable: "lucide:users",
  individuals: "lucide:users",
  // Incidents
  incident: "lucide:alert-triangle",
  deaths: "lucide:alert-triangle",
  crisis: "lucide:alert-triangle",
  fatalities: "lucide:alert-triangle",
  // Abuse
  abuse: "lucide:alert-circle",
  misuse: "lucide:alert-circle",
  // Legal punishment
  "capital punishment": "lucide:gavel",
  euthanasia: "lucide:gavel",
  // Historical
  history: "lucide:clock",
  era: "lucide:clock",
  // Contemporary
  contemporary: "lucide:calendar",
  modern: "lucide:calendar",
  // Geographic
  international: "lucide:globe",
  colonial: "lucide:globe",
  global: "lucide:globe",
  // Production
  production: "lucide:factory",
  trafficking: "lucide:factory",
  // Media
  media: "lucide:newspaper",
  controversy: "lucide:newspaper",
  // Sports
  doping: "lucide:trophy",
  athletic: "lucide:trophy",
};

function getIconForHeading(heading: string): IconName {
  // Check exact match first
  if (EXACT_HEADING_ICONS[heading]) {
    return EXACT_HEADING_ICONS[heading];
  }

  // Fall back to keyword matching
  const lowerHeading = heading.toLowerCase();
  for (const [keyword, icon] of Object.entries(KEYWORD_ICON_MAP)) {
    if (lowerHeading.includes(keyword)) {
      return icon;
    }
  }

  // Default icon if no match
  return "lucide:book-open";
}

interface HistoryCultureSectionProps {
  article: SubstanceArticle;
}

/** Card component for individual notable people */
function NotableIndividualCard({
  name,
  content,
  isExpanded,
  onToggle,
}: {
  name: string;
  content: string;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full text-left rounded-lg border border-white/10 bg-white/[0.03] p-3 transition-colors hover:bg-white/[0.06] hover:border-white/15"
    >
      <div className="flex items-center gap-3">
        {/* Placeholder photo circle */}
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
          <Icon icon="lucide:user" size={20} className="text-white/40" />
        </div>

        {/* Name */}
        <div className="flex-1 min-w-0">
          <span className="font-medium text-white/90 truncate">{name}</span>
        </div>

        {/* Expand/collapse indicator */}
        <Icon
          icon="lucide:chevron-down"
          size={16}
          className={`flex-shrink-0 text-white/40 transition-transform ${isExpanded ? "rotate-180" : ""}`}
        />
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <p className="mt-3 pt-3 border-t border-white/10 text-sm text-white/70 leading-relaxed whitespace-pre-wrap">
          {renderWithBoldYears(content)}
        </p>
      )}
    </button>
  );
}

export const HistoryCultureSection = memo(function HistoryCultureSection({
  article,
}: HistoryCultureSectionProps) {
  const { history_culture } = article;
  // Track whether the entire section is expanded
  const [isExpanded, setIsExpanded] = useState(false);
  // Track which individual cards are expanded (by "sectionIdx-subIdx" key) - only used when section is expanded
  const [expandedIndividuals, setExpandedIndividuals] = useState<Set<string>>(new Set());

  // Return null if history_culture is not present (optional field)
  if (!history_culture) {
    return null;
  }

  const hasContent = history_culture.content?.trim().length > 0;

  // Filter out empty sections (a section is valid if it has content OR has subsections)
  const sections = history_culture.sections?.filter(
    (section) => {
      const hasHeading = section.heading.trim().length > 0;
      const hasSectionContent = section.content.trim().length > 0;
      const hasSubsections = section.subsections && section.subsections.length > 0;
      return hasHeading && (hasSectionContent || hasSubsections);
    }
  ) ?? [];

  // Nothing to show
  if (!hasContent && sections.length === 0) {
    return null;
  }

  // Determine if we need truncation for the sections view
  // We truncate based on the first section's content
  const firstSection = sections[0];
  const needsSectionsTruncation = sections.length > 0 && (
    sections.length > 1 || // Multiple sections always truncate
    (firstSection && needsTruncation(firstSection.content)) || // First section content is long
    (firstSection?.subsections && firstSection.subsections.length > 0) // Has subsections
  );

  const toggleIndividual = (key: string) => {
    setExpandedIndividuals(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <SectionCard delay={0}>
      <h2 className="mb-4 flex items-center gap-3 text-lg font-semibold text-fuchsia-300">
        <IconBadge icon="lucide:book-open" label="History & Culture" />
        History & Culture
      </h2>

      {/* Freeform content (no subsections) */}
      {hasContent && sections.length === 0 && (() => {
        const content = history_culture.content!;
        const canTruncateFreeform = needsTruncation(content);
        const displayFreeformContent = canTruncateFreeform && !isExpanded
          ? truncateContent(content)
          : content;

        return (
          <>
            <p className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">
              {renderWithBoldYears(displayFreeformContent)}
              {canTruncateFreeform && !isExpanded && "…"}
            </p>
            {canTruncateFreeform && (
              <div className="flex justify-center mt-1.5 -mb-4">
                <button
                  type="button"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-white/60 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white/80"
                >
                  <Icon icon="lucide:ellipsis" size={14} />
                  <Icon icon="lucide:chevron-down" size={14} className={`transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                </button>
              </div>
            )}
          </>
        );
      })()}

      {/* Subsections as stacked cards */}
      {sections.length > 0 && (() => {
        // When collapsed, only show first section with truncated content
        const sectionsToShow = isExpanded ? sections : [firstSection];

        // For collapsed view, truncate the first section's content
        const getDisplayContent = (section: typeof firstSection, idx: number) => {
          if (!section.content.trim()) return "";
          // When collapsed and it's the first section, truncate
          if (!isExpanded && idx === 0) {
            return truncateContent(section.content);
          }
          return section.content;
        };

        return (
          <>
            <div className="flex flex-col">
              {sectionsToShow.map((section, idx) => {
                const sectionIcon = getIconForHeading(section.heading);
                const hasSubsections = section.subsections && section.subsections.length > 0;
                const sectionHasContent = section.content.trim().length > 0;
                const displayContent = getDisplayContent(section, idx);
                const isTruncated = !isExpanded && idx === 0 && sectionHasContent && needsTruncation(section.content);
                const isFirst = idx === 0;

                return (
                  <div key={idx}>
                    {/* Fading divider line between sections */}
                    {!isFirst && (
                      <div className="my-5 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                    )}
                    <div>
                      <h3 className="mb-3 flex items-center gap-2 font-semibold text-white">
                        <Icon icon={sectionIcon} size={20} className="text-fuchsia-200" />
                        {section.heading}
                      </h3>
                      {sectionHasContent && (
                        <div className="relative">
                          <p className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">
                            {renderWithBoldYears(displayContent)}
                            {isTruncated && "…"}
                          </p>
                        </div>
                      )}

                      {/* Nested subsections - only show when expanded */}
                      {isExpanded && hasSubsections && (
                        section.heading === "Notable Individuals" ? (
                          // Special card-based layout for Notable Individuals
                          <div className={`flex flex-col gap-2 ${sectionHasContent ? 'mt-4' : ''}`}>
                            {section.subsections!.map((sub, subIdx) => {
                              const key = `${idx}-${subIdx}`;
                              return (
                                <NotableIndividualCard
                                  key={subIdx}
                                  name={sub.heading}
                                  content={sub.content}
                                  isExpanded={expandedIndividuals.has(key)}
                                  onToggle={() => toggleIndividual(key)}
                                />
                              );
                            })}
                          </div>
                        ) : (
                          // Default nested subsection layout
                          <div className={`flex flex-col gap-3 ${sectionHasContent ? 'mt-4' : ''} pl-4 border-l-2 border-white/10`}>
                            {section.subsections!.map((sub, subIdx) => (
                              <div key={subIdx}>
                                <h4 className="font-medium text-white/90 mb-1">
                                  {sub.heading}
                                </h4>
                                <p className="text-sm text-white/70 whitespace-pre-wrap leading-relaxed">{renderWithBoldYears(sub.content)}</p>
                              </div>
                            ))}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Central See More button - same style as freeform content */}
            {needsSectionsTruncation && (
              <div className="flex justify-center mt-1.5 -mb-4">
                <button
                  type="button"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-white/60 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white/80"
                >
                  <Icon icon="lucide:ellipsis" size={14} />
                  <Icon icon="lucide:chevron-down" size={14} className={`transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                </button>
              </div>
            )}
          </>
        );
      })()}
    </SectionCard>
  );
});
