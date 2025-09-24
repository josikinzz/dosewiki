#!/usr/bin/env python3
"""
Process and group 2247 effects from all-effects.md into synonym groups
with improved plural/singular normalization.
"""

import re
from collections import defaultdict
from typing import List, Dict, Set, Tuple

def read_effects(filepath: str) -> List[str]:
    """Read effects from markdown file."""
    effects = []
    with open(filepath, 'r') as f:
        lines = f.readlines()
        for line in lines:
            if line.startswith('- '):
                effect = line[2:].strip()
                if effect:
                    effects.append(effect)
    return effects

def standardize_effect(effect: str) -> Tuple[str, str]:
    """
    Standardize effect by moving qualifiers to parentheses at end.
    Returns (standardized_effect, original_effect)
    """
    original = effect
    standardized = effect

    # Handle quoted effects
    if standardized.startswith("'") and standardized.endswith("'"):
        standardized = standardized[1:-1]

    qualifiers = []

    # Extract existing parenthetical content first
    paren_pattern = r'\s*\([^)]+\)'
    paren_matches = re.findall(paren_pattern, standardized)
    for match in paren_matches:
        content = match.strip()[1:-1]  # Remove parentheses
        qualifiers.append(content)
        standardized = standardized.replace(match, '')

    # Intensity qualifiers at the beginning
    intensity_start = re.match(r'^(mild|moderate|intense|profound|strong|slight|heavy|marked|severe|subtle|minimal|extreme|mild to moderate|mild-moderate|mild–moderate)\s+(.+)$', standardized, re.IGNORECASE)
    if intensity_start:
        qualifiers.insert(0, intensity_start.group(1).lower())
        standardized = intensity_start.group(2)

    # Dose contexts
    dose_patterns = [
        (r'\s+at\s+(high|higher|low|lower|moderate|strong|overdose|very high)\s+dose[s]?', lambda m: m.group(0).strip()[3:]),
        (r'\s+at\s+≥?\s*[\d.]+\s*(mg|µg|mcg)', lambda m: m.group(0).strip()[3:]),
        (r'\s+above\s+[\d.]+\s*(mg|µg|mcg)', lambda m: m.group(0).strip()),
    ]

    for pattern, extractor in dose_patterns:
        match = re.search(pattern, standardized, re.IGNORECASE)
        if match:
            qualifiers.append(extractor(match))
            standardized = re.sub(pattern, '', standardized, flags=re.IGNORECASE).strip()

    # Timing contexts
    timing_patterns = [
        (r'\s+on\s+comedown', 'on comedown'),
        (r'\s+during\s+(peak|comedown|come-up|onset|emergence)', lambda m: f"during {m.group(1)}"),
        (r'\s+after\s+(use|peak|offset|binges)', lambda m: f"after {m.group(1)}"),
        (r'\s+post-experience', 'post-experience'),
        (r'\s+next day', 'next day'),
    ]

    for pattern, replacement in timing_patterns:
        match = re.search(pattern, standardized, re.IGNORECASE)
        if match:
            if callable(replacement):
                qualifiers.append(replacement(match))
            else:
                qualifiers.append(replacement)
            standardized = re.sub(pattern, '', standardized, flags=re.IGNORECASE).strip()

    # User/condition qualifiers
    user_patterns = [
        (r'\s+\(?\s*in\s+(some|depressed|dependent)\s+(?:users|individuals|patients)\s*\)?', lambda m: f"in {m.group(1)} users"),
        (r'\s+\(?\s*rare\s*\)?', 'rare'),
        (r'\s+\(?\s*occasional\s*\)?', 'occasional'),
        (r'\s+\(?\s*sometimes\s*\)?', 'sometimes'),
        (r'\s+\(?\s*common\s*\)?', 'common'),
        (r'\s+\(?\s*especially\s+.+?\s*\)?', lambda m: m.group(0).strip().strip('()')),
    ]

    for pattern, replacement in user_patterns:
        match = re.search(pattern, standardized, re.IGNORECASE)
        if match:
            if callable(replacement):
                qualifiers.append(replacement(match))
            else:
                qualifiers.append(replacement)
            standardized = re.sub(pattern, '', standardized, flags=re.IGNORECASE).strip()

    standardized = standardized.strip()

    # Reconstruct with qualifiers in parentheses
    if qualifiers:
        seen = set()
        unique_qualifiers = []
        for q in qualifiers:
            q_lower = q.lower()
            if q_lower not in seen:
                seen.add(q_lower)
                unique_qualifiers.append(q_lower)

        standardized = f"{standardized} ({'; '.join(unique_qualifiers)})"

    return (standardized, original)

def normalize_for_comparison(effect: str) -> str:
    """Normalize effect for comparison (case, punctuation, spacing, plurals)."""
    # Remove content in parentheses for base comparison
    base = re.sub(r'\s*\([^)]+\)$', '', effect)

    # Normalize case
    normalized = base.lower()

    # Normalize punctuation and spacing
    normalized = re.sub(r'[''`"]', '', normalized)  # Remove quotes
    normalized = re.sub(r'[-_]', ' ', normalized)  # Replace dashes, underscores with spaces
    normalized = re.sub(r'\s+&\s+', ' and ', normalized)  # Normalize ampersand
    normalized = re.sub(r'\s+', ' ', normalized)    # Collapse multiple spaces
    normalized = normalized.strip()

    # Normalize common plural forms to singular
    # Only handle the most common and relevant cases
    common_plurals = {
        # Visual effects
        'colours': 'color',
        'colors': 'color',
        'patterns': 'pattern',
        'visuals': 'visual',
        'hallucinations': 'hallucination',
        'distortions': 'distortion',
        'tracers': 'tracer',
        'fractals': 'fractal',

        # Physical sensations
        'sensations': 'sensation',
        'tremors': 'tremor',
        'twitches': 'twitch',
        'palpitations': 'palpitation',
        'vibrations': 'vibration',
        'tingles': 'tingle',

        # Body parts
        'pupils': 'pupil',
        'eyes': 'eye',
        'extremities': 'extremity',
        'hands': 'hand',
        'feet': 'foot',

        # Mental effects
        'thoughts': 'thought',
        'insights': 'insight',
        'delusions': 'delusion',
        'dreams': 'dream',
        'feelings': 'feeling',

        # Medical terms
        'seizures': 'seizure',
        'arrhythmias': 'arrhythmia',
        'symptoms': 'symptom',
        'effects': 'effect',

        # Other common plurals
        'episodes': 'episode',
        'attacks': 'attack',
        'headaches': 'headache',
        'cravings': 'craving',
        'changes': 'change',
        'disturbances': 'disturbance',
        'inhibitions': 'inhibition',
    }

    # Apply plural normalization word by word
    words = normalized.split()
    normalized_words = []
    for word in words:
        if word in common_plurals:
            normalized_words.append(common_plurals[word])
        else:
            normalized_words.append(word)
    normalized = ' '.join(normalized_words)

    return normalized

def identify_medical_synonyms(effect: str) -> List[str]:
    """Identify medical/common terminology synonyms."""
    medical_map = {
        # Pupil effects
        'mydriasis': ['dilated pupils', 'pupil dilation', 'dilated pupil', 'large pupils', 'large pupil'],
        'dilated pupils': ['mydriasis', 'pupil dilation', 'dilated pupil', 'large pupils'],
        'dilated pupil': ['mydriasis', 'pupil dilation', 'dilated pupils', 'large pupil'],
        'pupil dilation': ['mydriasis', 'dilated pupils', 'dilated pupil', 'large pupils'],

        'miosis': ['constricted pupils', 'pupil constriction', 'constricted pupil', 'pinpoint pupils', 'pin-point pupils', 'pinpoint pupil'],
        'constricted pupils': ['miosis', 'pupil constriction', 'constricted pupil', 'pinpoint pupils'],
        'constricted pupil': ['miosis', 'pupil constriction', 'constricted pupils', 'pinpoint pupil'],
        'pupil constriction': ['miosis', 'constricted pupils', 'constricted pupil', 'pinpoint pupils'],
        'pinpoint pupils': ['miosis', 'constricted pupils', 'pupil constriction', 'pin-point pupils', 'pinpoint pupil'],
        'pinpoint pupil': ['miosis', 'constricted pupil', 'pupil constriction', 'pin-point pupil', 'pinpoint pupils'],
        'pin-point pupils': ['miosis', 'constricted pupils', 'pupil constriction', 'pinpoint pupils'],
        'pin point pupils': ['miosis', 'constricted pupils', 'pupil constriction', 'pinpoint pupils'],

        # Jaw/teeth effects
        'bruxism': ['teeth grinding', 'jaw clenching'],
        'teeth grinding': ['bruxism', 'jaw clenching'],
        'jaw clenching': ['bruxism', 'teeth grinding'],

        # Pain/relief
        'analgesia': ['pain relief', 'pain reduction'],
        'pain relief': ['analgesia', 'pain reduction'],
        'pain reduction': ['analgesia', 'pain relief'],

        # Anxiety effects
        'anxiolysis': ['anxiety reduction', 'reduced anxiety', 'anxiety relief', 'anxiety suppression'],
        'anxiety reduction': ['anxiolysis', 'reduced anxiety', 'anxiety relief'],
        'reduced anxiety': ['anxiolysis', 'anxiety reduction', 'anxiety relief'],
        'anxiety relief': ['anxiolysis', 'anxiety reduction', 'reduced anxiety'],
        'anxiety suppression': ['anxiolysis', 'anxiety reduction', 'reduced anxiety'],

        # Heart rate
        'tachycardia': ['increased heart rate', 'elevated heart rate', 'increased heart-rate', 'elevated heart-rate'],
        'increased heart rate': ['tachycardia', 'elevated heart rate'],
        'elevated heart rate': ['tachycardia', 'increased heart rate'],
        'increased heart-rate': ['tachycardia', 'elevated heart-rate'],
        'elevated heart-rate': ['tachycardia', 'increased heart-rate'],

        'bradycardia': ['decreased heart rate', 'slowed heart rate', 'reduced heart rate'],
        'decreased heart rate': ['bradycardia', 'slowed heart rate', 'reduced heart rate'],
        'slowed heart rate': ['bradycardia', 'decreased heart rate', 'reduced heart rate'],
        'reduced heart rate': ['bradycardia', 'decreased heart rate', 'slowed heart rate'],

        # Sweating
        'diaphoresis': ['sweating', 'perspiration'],
        'sweating': ['diaphoresis', 'perspiration'],
        'perspiration': ['diaphoresis', 'sweating'],

        # Itching
        'pruritus': ['itching', 'itchiness', 'itch'],
        'itching': ['pruritus', 'itchiness', 'itch'],
        'itchiness': ['pruritus', 'itching', 'itch'],
        'itch': ['pruritus', 'itching', 'itchiness'],

        # Sleepiness
        'somnolence': ['drowsiness', 'sleepiness'],
        'drowsiness': ['somnolence', 'sleepiness'],
        'sleepiness': ['somnolence', 'drowsiness'],

        # Temperature
        'hyperthermia': ['elevated body temperature', 'increased body temperature'],
        'elevated body temperature': ['hyperthermia', 'increased body temperature'],
        'increased body temperature': ['hyperthermia', 'elevated body temperature'],

        # Blood pressure
        'hypertension': ['elevated blood pressure', 'increased blood pressure'],
        'elevated blood pressure': ['hypertension', 'increased blood pressure'],
        'increased blood pressure': ['hypertension', 'elevated blood pressure'],

        'hypotension': ['lowered blood pressure', 'decreased blood pressure', 'reduced blood pressure'],
        'lowered blood pressure': ['hypotension', 'decreased blood pressure'],
        'decreased blood pressure': ['hypotension', 'lowered blood pressure'],
        'reduced blood pressure': ['hypotension', 'lowered blood pressure'],

        # Nausea/vomiting
        'emesis': ['vomiting'],
        'vomiting': ['emesis'],

        # Other medical terms
        'dyspepsia': ['indigestion', 'stomach upset'],
        'indigestion': ['dyspepsia', 'stomach upset'],
        'stomach upset': ['dyspepsia', 'indigestion'],

        'vertigo': ['dizziness'],
        'dizziness': ['vertigo'],

        'diplopia': ['double vision'],
        'double vision': ['diplopia'],

        'nystagmus': ['eye movements', 'involuntary eye movements', 'eye movement'],

        'ataxia': ['loss of coordination', 'poor coordination', 'motor incoordination', 'incoordination'],
        'loss of coordination': ['ataxia', 'poor coordination', 'motor incoordination'],
        'poor coordination': ['ataxia', 'loss of coordination', 'motor incoordination'],
        'motor incoordination': ['ataxia', 'loss of coordination', 'poor coordination'],
        'incoordination': ['ataxia', 'loss of coordination', 'poor coordination'],
    }

    # Extract base effect without qualifiers
    base = re.sub(r'\s*\([^)]+\)$', '', effect).lower()

    synonyms = []
    if base in medical_map:
        synonyms = medical_map[base]

    return synonyms

def group_effects(effects: List[str]) -> Dict[str, List[Tuple[str, str]]]:
    """
    Group effects by synonyms following ultra-conservative rules.
    Returns dict of canonical_term -> list of (standardized, original) tuples.
    """
    # First, standardize all effects
    standardized_effects = []
    for effect in effects:
        std, orig = standardize_effect(effect)
        standardized_effects.append((std, orig))

    # Create groups
    groups = defaultdict(list)
    processed = set()

    for i, (std1, orig1) in enumerate(standardized_effects):
        if i in processed:
            continue

        # Start a new group with this effect
        group = [(std1, orig1)]
        processed.add(i)

        # Extract base and qualifiers for comparison
        base1 = re.sub(r'\s*\([^)]+\)$', '', std1)
        qualifiers1 = re.search(r'\s*\(([^)]+)\)$', std1)
        qualifiers1 = qualifiers1.group(1) if qualifiers1 else ''

        norm1 = normalize_for_comparison(base1)

        # Find exact duplicates and medical synonyms
        for j, (std2, orig2) in enumerate(standardized_effects):
            if j <= i or j in processed:
                continue

            base2 = re.sub(r'\s*\([^)]+\)$', '', std2)
            qualifiers2 = re.search(r'\s*\(([^)]+)\)$', std2)
            qualifiers2 = qualifiers2.group(1) if qualifiers2 else ''

            norm2 = normalize_for_comparison(base2)

            # Check if they should be grouped together
            should_group = False

            # Rule 1: Exact match after normalization (with same qualifiers)
            if norm1 == norm2 and qualifiers1 == qualifiers2:
                should_group = True

            # Rule 2: Medical/common synonyms (with same qualifiers)
            elif qualifiers1 == qualifiers2:
                medical_syns = identify_medical_synonyms(base1.lower())
                if base2.lower() in medical_syns:
                    should_group = True
                # Also check if the normalized versions are medical synonyms
                medical_syns_norm = identify_medical_synonyms(norm1)
                if norm2 in medical_syns_norm:
                    should_group = True

            if should_group:
                group.append((std2, orig2))
                processed.add(j)

        # Select canonical term (prefer most common/accessible variant)
        canonical = select_canonical(group)
        groups[canonical] = group

    return dict(groups)

def select_canonical(group: List[Tuple[str, str]]) -> str:
    """Select the most appropriate canonical term from a group."""
    if not group:
        return ""

    # Extract just the standardized forms
    standardized = [std for std, _ in group]

    # Prefer terms without medical jargon
    medical_terms = ['mydriasis', 'miosis', 'bruxism', 'anxiolysis', 'tachycardia',
                     'bradycardia', 'diaphoresis', 'pruritus', 'somnolence', 'hyperthermia',
                     'hypertension', 'hypotension', 'emesis', 'dyspepsia', 'vertigo',
                     'diplopia', 'nystagmus', 'ataxia']

    non_medical = []
    for term in standardized:
        base = re.sub(r'\s*\([^)]+\)$', '', term).lower()
        if not any(med in base for med in medical_terms):
            non_medical.append(term)

    if non_medical:
        # Prefer singular over plural
        singular_preferred = []
        for term in non_medical:
            base = re.sub(r'\s*\([^)]+\)$', '', term).lower()
            if not base.endswith('s') or base in ['analysis', 'pruritus', 'nystagmus']:
                singular_preferred.append(term)

        if singular_preferred:
            return min(singular_preferred, key=len)
        return min(non_medical, key=len)

    # Otherwise, return the shortest term
    return min(standardized, key=len)

def write_output(groups: Dict[str, List[Tuple[str, str]]], total_effects: int, output_path: str):
    """Write the grouped effects to markdown file."""
    # Sort groups by canonical term
    sorted_groups = sorted(groups.items())

    # Calculate statistics
    total_groups = len(groups)
    effects_grouped = sum(len(variants) for variants in groups.values())
    avg_per_group = effects_grouped / total_groups if total_groups > 0 else 0

    # Find ungrouped effects (those appearing alone in their group)
    ungrouped = [canonical for canonical, variants in sorted_groups if len(variants) == 1]

    with open(output_path, 'w') as f:
        f.write("# Effects Synonym Groups\n\n")
        f.write("## Summary Statistics\n")
        f.write(f"- **Total original effects**: {total_effects}\n")
        f.write(f"- **Total synonym groups**: {total_groups}\n")
        f.write(f"- **Effects successfully grouped**: {effects_grouped}\n")
        f.write(f"- **Average effects per group**: {avg_per_group:.2f}\n")
        f.write(f"- **Groups with multiple variants**: {total_groups - len(ungrouped)}\n")
        f.write(f"- **Ungrouped (unique) effects**: {len(ungrouped)}\n\n")

        f.write("## Standardization Rules Applied\n")
        f.write("- All intensity qualifiers moved to end in parentheses\n")
        f.write("- All dose contexts moved to end in parentheses\n")
        f.write("- All timing contexts moved to end in parentheses\n")
        f.write("- Multiple qualifiers combined with semicolons\n")
        f.write("- Medical terms mapped to common equivalents where applicable\n")
        f.write("- Plural forms normalized to singular where appropriate\n\n")

        f.write("## Synonym Groups\n\n")

        group_num = 0
        for canonical, variants in sorted_groups:
            if len(variants) > 1:  # Only show groups with multiple variants
                group_num += 1
                f.write(f"### Group {group_num}: {canonical}\n")
                f.write(f"**Canonical term**: {canonical}\n")
                f.write(f"**Variants** ({len(variants)}):\n")
                for std, orig in variants:
                    if std != orig:
                        f.write(f"- {std} [from: \"{orig}\"]\n")
                    else:
                        f.write(f"- {std}\n")
                f.write("\n")

        f.write("## Ungrouped Effects\n")
        f.write("Effects that appear to be unique with no synonyms:\n\n")
        for effect in ungrouped:
            f.write(f"- {effect}\n")

        f.write("\n## Verification\n")
        f.write(f"- **Total effects in original list**: {total_effects}\n")
        f.write(f"- **Total effects accounted for in groups**: {effects_grouped}\n")
        f.write(f"- **Verification status**: {'✓ Complete - all effects mapped' if effects_grouped == total_effects else '⚠ Mismatch - recount needed'}\n")

def main():
    """Main processing function."""
    input_file = "/Users/josie/Documents/Obsidian Vault/Utilities/dose.wiki/notes and plans/effects-standardization/all-effects.md"
    output_file = "/Users/josie/Documents/Obsidian Vault/Utilities/dose.wiki/notes and plans/effects-standardization/effects-synonym-groups.md"

    print("Reading effects from file...")
    effects = read_effects(input_file)
    print(f"Found {len(effects)} effects")

    print("Grouping effects by synonyms...")
    groups = group_effects(effects)
    print(f"Created {len(groups)} synonym groups")

    print("Writing output file...")
    write_output(groups, len(effects), output_file)
    print(f"Output written to {output_file}")

if __name__ == "__main__":
    main()