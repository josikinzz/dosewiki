#!/usr/bin/env python3
"""
Process and group 2247 effects from all-effects.md into synonym groups
following ultra-conservative rules.
"""

import re
from collections import defaultdict
from typing import List, Dict, Set, Tuple

def read_effects(filepath: str) -> List[str]:
    """Read effects from markdown file."""
    effects = []
    with open(filepath, 'r') as f:
        lines = f.readlines()
        in_list = False
        for line in lines:
            if line.startswith('- '):
                in_list = True
                # Extract effect text, removing the dash and leading/trailing whitespace
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
        (r'\s+at\s+(high|higher|low|lower|moderate|strong|overdose|very high)\s+dose[s]?', lambda m: m.group(0).strip()[3:]),  # Remove 'at '
        (r'\s+at\s+≥?\s*[\d.]+\s*(mg|µg|mcg)', lambda m: m.group(0).strip()[3:]),  # Remove 'at '
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

    # Clean up the standardized form
    standardized = standardized.strip()

    # Reconstruct with qualifiers in parentheses
    if qualifiers:
        # Remove duplicates while preserving order
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
    # Be careful not to change words that aren't actually plurals
    plural_replacements = [
        # Specific terms that appear in the effects list
        (r'\bcolou?rs\b', 'color'),
        (r'\bcolors\b', 'color'),
        (r'\bpatterns\b', 'pattern'),
        (r'\bvisuals\b', 'visual'),
        (r'\bgeometrics\b', 'geometric'),
        (r'\bhallucinations\b', 'hallucination'),
        (r'\bdistortions\b', 'distortion'),
        (r'\bsensations\b', 'sensation'),
        (r'\beffects\b', 'effect'),
        (r'\bfeelings\b', 'feeling'),
        (r'\bexperiences\b', 'experience'),
        (r'\bthoughts\b', 'thought'),
        (r'\binsights\b', 'insight'),
        (r'\btracers\b', 'tracer'),
        (r'\bpupils\b', 'pupil'),
        (r'\beyes\b', 'eye'),
        (r'\bcramps\b', 'cramp'),
        (r'\btremors\b', 'tremor'),
        (r'\btwitches\b', 'twitch'),
        (r'\bconvulsions\b', 'convulsion'),
        (r'\bseizures\b', 'seizure'),
        (r'\bpalpitations\b', 'palpitation'),
        (r'\barrhythmias\b', 'arrhythmia'),
        (r'\bdreams\b', 'dream'),
        (r'\bnightmares\b', 'nightmare'),
        (r'\bflashes\b', 'flash'),
        (r'\bsweats\b', 'sweat'),
        (r'\bchills\b', 'chill'),
        (r'\bspasms\b', 'spasm'),
        (r'\bdelusions\b', 'delusion'),
        (r'\billusions\b', 'illusion'),
        (r'\bfractals\b', 'fractal'),
        (r'\bechoes\b', 'echo'),
        (r'\bsounds\b', 'sound'),
        (r'\bvoices\b', 'voice'),
        (r'\bimages\b', 'image'),
        (r'\bscenes\b', 'scene'),
        (r'\bstates\b', 'state'),
        (r'\bshifts\b', 'shift'),
        (r'\bchanges\b', 'change'),
        (r'\bfluctuations\b', 'fluctuation'),
        (r'\bdisturbances\b', 'disturbance'),
        (r'\bproblems\b', 'problem'),
        (r'\bissues\b', 'issue'),
        (r'\bsymptoms\b', 'symptom'),
        (r'\binhibitions\b', 'inhibition'),
        (r'\bbehaviors\b', 'behavior'),
        (r'\bbehaviours\b', 'behaviour'),
        (r'\bmovements\b', 'movement'),
        (r'\bcontractions\b', 'contraction'),
        (r'\bvibrations\b', 'vibration'),
        (r'\btingles\b', 'tingle'),
        (r'\brusshes\b', 'rush'),
        (r'\bwaves\b', 'wave'),
        (r'\bepisodes\b', 'episode'),
        (r'\battacks\b', 'attack'),
        (r'\bheadaches\b', 'headache'),
        (r'\beaches\b', 'ache'),
        (r'\bpains\b', 'pain'),
        (r'\bcraving[s]?\b', 'craving'),
        (r'\burges\b', 'urge'),
        (r'\bdesires\b', 'desire'),
        (r'\bimpulses\b', 'impulse'),
        (r'\btendencies\b', 'tendency'),
        (r'\bproperties\b', 'property'),
        (r'\bqualities\b', 'quality'),
        (r'\baspects\b', 'aspect'),
        (r'\belements\b', 'element'),
        (r'\bfeatures\b', 'feature'),
        (r'\btraits\b', 'trait'),
        (r'\bcharacteristics\b', 'characteristic'),
        (r'\battributes\b', 'attribute'),
        (r'\bprocesses\b', 'process'),
        (r'\bfunctions\b', 'function'),
        (r'\bactivities\b', 'activity'),
        (r'\breactions\b', 'reaction'),
        (r'\bresponses\b', 'response'),
        (r'\bperceptions\b', 'perception'),
        (r'\bsensitivities\b', 'sensitivity'),
        (r'\bcapabilities\b', 'capability'),
        (r'\babilities\b', 'ability'),
        (r'\bcapacities\b', 'capacity'),
        (r'\benhancement[s]?\b', 'enhancement'),
        (r'\bimpairment[s]?\b', 'impairment'),
        (r'\bdifficulties\b', 'difficulty'),
        (r'\bchallenges\b', 'challenge'),
        (r'\bobstacles\b', 'obstacle'),
        (r'\bbarriers\b', 'barrier'),
        (r'\blimitations\b', 'limitation'),
        (r'\brestrictions\b', 'restriction'),
        (r'\bconstraints\b', 'constraint'),
        (r'\bboundaries\b', 'boundary'),
        (r'\blimits\b', 'limit'),
        (r'\bthresholds\b', 'threshold'),
        (r'\blevels\b', 'level'),
        (r'\bdegrees\b', 'degree'),
        (r'\bamounts\b', 'amount'),
        (r'\bquantities\b', 'quantity'),
        (r'\bdoses\b', 'dose'),
        (r'\bconcentrations\b', 'concentration'),
        (r'\bintensities\b', 'intensity'),
        (r'\bfrequencies\b', 'frequency'),
        (r'\bdurations\b', 'duration'),
        (r'\bperiods\b', 'period'),
        (r'\bintervals\b', 'interval'),
        (r'\bcycles\b', 'cycle'),
        (r'\bphases\b', 'phase'),
        (r'\bstages\b', 'stage'),
        (r'\bsteps\b', 'step'),
        (r'\bgrades\b', 'grade'),
        (r'\btypes\b', 'type'),
        (r'\bkinds\b', 'kind'),
        (r'\bforms\b', 'form'),
        (r'\bvariants\b', 'variant'),
        (r'\bvariations\b', 'variation'),
        (r'\bversions\b', 'version'),
        (r'\bmodalities\b', 'modality'),
        (r'\bmodes\b', 'mode'),
        (r'\bmethods\b', 'method'),
        (r'\bways\b', 'way'),
        (r'\bmeans\b', 'mean'),
        (r'\bapproaches\b', 'approach'),
        (r'\btechniques\b', 'technique'),
        (r'\bstrategies\b', 'strategy'),
        (r'\btactics\b', 'tactic'),
        (r'\bprocedures\b', 'procedure'),
        (r'\bprotocols\b', 'protocol'),
        (r'\bguidelines\b', 'guideline'),
        (r'\brules\b', 'rule'),
        (r'\bregulations\b', 'regulation'),
        (r'\bstandards\b', 'standard'),
        (r'\brequirements\b', 'requirement'),
        (r'\bcriteria\b', 'criterion'),
        (r'\bparameters\b', 'parameter'),
        (r'\bvariables\b', 'variable'),
        (r'\bfactors\b', 'factor'),
        (r'\bcomponents\b', 'component'),
        (r'\belements\b', 'element'),
        (r'\bingredients\b', 'ingredient'),
        (r'\bconstituents\b', 'constituent'),
        (r'\bparts\b', 'part'),
        (r'\bpieces\b', 'piece'),
        (r'\bportions\b', 'portion'),
        (r'\bsegments\b', 'segment'),
        (r'\bsections\b', 'section'),
        (r'\bdivisions\b', 'division'),
        (r'\bcategories\b', 'category'),
        (r'\bgroups\b', 'group'),
        (r'\bclasses\b', 'class'),
        (r'\bsets\b', 'set'),
        (r'\bcollections\b', 'collection'),
        (r'\bseries\b', 'series'),
        (r'\bsequences\b', 'sequence'),
        (r'\bchains\b', 'chain'),
        (r'\blinks\b', 'link'),
        (r'\bconnections\b', 'connection'),
        (r'\brelationships\b', 'relationship'),
        (r'\bassociations\b', 'association'),
        (r'\bcorrelations\b', 'correlation'),
        (r'\binteractions\b', 'interaction'),
        (r'\bextremities\b', 'extremity'),
        (r'\blimbs\b', 'limb'),
        (r'\bfingers\b', 'finger'),
        (r'\btoes\b', 'toe'),
        (r'\bhands\b', 'hand'),
        (r'\bfeet\b', 'foot'),
        (r'\blegs\b', 'leg'),
        (r'\barms\b', 'arm'),
        (r'\bmuscles\b', 'muscle'),
        (r'\bnerves\b', 'nerve'),
        (r'\bjoints\b', 'joint'),
        (r'\bbones\b', 'bone'),
        (r'\borgans\b', 'organ'),
        (r'\btissues\b', 'tissue'),
        (r'\bcells\b', 'cell'),
        (r'\bglands\b', 'gland'),
        (r'\bvessels\b', 'vessel'),
        (r'\barteries\b', 'artery'),
        (r'\bveins\b', 'vein'),
        (r'\bcapillaries\b', 'capillary'),
    ]

    for pattern, replacement in plural_replacements:
        normalized = re.sub(pattern, replacement, normalized)

    return normalized

def identify_medical_synonyms(effect: str) -> List[str]:
    """Identify medical/common terminology synonyms."""
    medical_map = {
        # Pupil effects
        'mydriasis': ['dilated pupils', 'pupil dilation', 'large pupils'],
        'dilated pupils': ['mydriasis', 'pupil dilation', 'large pupils'],
        'pupil dilation': ['mydriasis', 'dilated pupils', 'large pupils'],
        'large pupils': ['mydriasis', 'dilated pupils', 'pupil dilation'],

        'miosis': ['constricted pupils', 'pupil constriction', 'pinpoint pupils', 'pin-point pupils', 'pin point pupils'],
        'constricted pupils': ['miosis', 'pupil constriction', 'pinpoint pupils', 'pin-point pupils'],
        'pupil constriction': ['miosis', 'constricted pupils', 'pinpoint pupils', 'pin-point pupils'],
        'pinpoint pupils': ['miosis', 'constricted pupils', 'pupil constriction', 'pin-point pupils'],
        'pin-point pupils': ['miosis', 'constricted pupils', 'pupil constriction', 'pinpoint pupils'],
        'pin point pupils': ['miosis', 'constricted pupils', 'pupil constriction', 'pinpoint pupils'],

        # Jaw/teeth effects
        'bruxism': ['teeth grinding', 'jaw clenching', 'teeth clench'],
        'teeth grinding': ['bruxism', 'jaw clenching', 'teeth clench'],
        'jaw clenching': ['bruxism', 'teeth grinding', 'teeth clench'],
        'teeth clench': ['bruxism', 'teeth grinding', 'jaw clenching'],

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
        'tachycardia': ['increased heart rate', 'elevated heart rate', 'increased heart-rate', 'elevated heart-rate', 'rapid heart rate'],
        'increased heart rate': ['tachycardia', 'elevated heart rate', 'rapid heart rate'],
        'elevated heart rate': ['tachycardia', 'increased heart rate', 'rapid heart rate'],
        'increased heart-rate': ['tachycardia', 'elevated heart-rate', 'rapid heart rate'],
        'elevated heart-rate': ['tachycardia', 'increased heart-rate', 'rapid heart rate'],
        'rapid heart rate': ['tachycardia', 'increased heart rate', 'elevated heart rate'],

        'bradycardia': ['decreased heart rate', 'slowed heart rate', 'reduced heart rate', 'lowered heart rate'],
        'decreased heart rate': ['bradycardia', 'slowed heart rate', 'reduced heart rate'],
        'slowed heart rate': ['bradycardia', 'decreased heart rate', 'reduced heart rate'],
        'reduced heart rate': ['bradycardia', 'decreased heart rate', 'slowed heart rate'],
        'lowered heart rate': ['bradycardia', 'decreased heart rate', 'slowed heart rate'],

        # Sweating
        'diaphoresis': ['sweating', 'perspiration', 'increased sweating', 'profuse sweating'],
        'sweating': ['diaphoresis', 'perspiration'],
        'perspiration': ['diaphoresis', 'sweating'],
        'increased sweating': ['diaphoresis', 'sweating', 'perspiration'],
        'profuse sweating': ['diaphoresis', 'sweating', 'perspiration'],

        # Itching
        'pruritus': ['itching', 'itchiness', 'itch', 'itchy skin'],
        'itching': ['pruritus', 'itchiness', 'itch'],
        'itchiness': ['pruritus', 'itching', 'itch'],
        'itch': ['pruritus', 'itching', 'itchiness'],
        'itchy skin': ['pruritus', 'itching', 'itchiness'],

        # Sleepiness
        'somnolence': ['drowsiness', 'sleepiness', 'sedation'],
        'drowsiness': ['somnolence', 'sleepiness'],
        'sleepiness': ['somnolence', 'drowsiness'],

        # Temperature
        'hyperthermia': ['elevated body temperature', 'increased body temperature', 'body temperature elevation'],
        'elevated body temperature': ['hyperthermia', 'increased body temperature'],
        'increased body temperature': ['hyperthermia', 'elevated body temperature'],
        'body temperature elevation': ['hyperthermia', 'elevated body temperature'],

        # Blood pressure
        'hypertension': ['elevated blood pressure', 'increased blood pressure', 'high blood pressure'],
        'elevated blood pressure': ['hypertension', 'increased blood pressure', 'high blood pressure'],
        'increased blood pressure': ['hypertension', 'elevated blood pressure', 'high blood pressure'],
        'high blood pressure': ['hypertension', 'elevated blood pressure', 'increased blood pressure'],

        'hypotension': ['lowered blood pressure', 'decreased blood pressure', 'reduced blood pressure'],
        'lowered blood pressure': ['hypotension', 'decreased blood pressure', 'reduced blood pressure'],
        'decreased blood pressure': ['hypotension', 'lowered blood pressure', 'reduced blood pressure'],
        'reduced blood pressure': ['hypotension', 'lowered blood pressure', 'decreased blood pressure'],

        # Nausea/vomiting
        'emesis': ['vomiting', 'throwing up'],
        'vomiting': ['emesis', 'throwing up'],
        'throwing up': ['emesis', 'vomiting'],

        # Other medical terms
        'dyspepsia': ['indigestion', 'stomach upset'],
        'indigestion': ['dyspepsia', 'stomach upset'],
        'stomach upset': ['dyspepsia', 'indigestion'],

        'vertigo': ['dizziness', 'spinning sensation'],
        'dizziness': ['vertigo', 'spinning sensation'],

        'diplopia': ['double vision'],
        'double vision': ['diplopia'],

        'nystagmus': ['eye movements', 'involuntary eye movements'],

        'ataxia': ['loss of coordination', 'poor coordination', 'motor incoordination', 'incoordination'],
        'loss of coordination': ['ataxia', 'poor coordination', 'motor incoordination'],
        'poor coordination': ['ataxia', 'loss of coordination', 'motor incoordination'],
        'motor incoordination': ['ataxia', 'loss of coordination', 'poor coordination'],
        'incoordination': ['ataxia', 'loss of coordination', 'poor coordination'],

        # Mood
        'euphoria': ['euphoric feeling', 'euphoric state'],
        'dysphoria': ['dysphoric feeling', 'dysphoric state'],
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
                     'bradycardia', 'diaphoresis', 'pruritus', 'somnolence', 'hyperthermia']

    non_medical = []
    for term in standardized:
        base = re.sub(r'\s*\([^)]+\)$', '', term).lower()
        if not any(med in base for med in medical_terms):
            non_medical.append(term)

    if non_medical:
        # Prefer the shortest non-medical term
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
        f.write("- Medical terms mapped to common equivalents where applicable\n\n")

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