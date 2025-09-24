#!/usr/bin/env python3
"""
Process effects to remove redundant modifiers like "increased", "elevated", etc.
These modifiers are redundant because the presence of the effect implies the change.
"""

import re
from collections import defaultdict
from typing import List, Dict, Set, Tuple

# Read the previous processing script functions
exec(open('/Users/josie/Documents/Obsidian Vault/Utilities/dose.wiki/notes and plans/effects-standardization/process_effects_v2.py').read())

def remove_redundant_modifiers(effect: str) -> str:
    """
    Remove redundant modifiers from effects.
    E.g., "Increased euphoria" -> "euphoria" because euphoria already implies an increase.
    """
    # List of redundant modifiers that can be removed for certain effects
    redundant_prefixes = [
        'increased', 'enhanced', 'elevated', 'improved', 'boosted', 'heightened',
        'decreased', 'reduced', 'lowered', 'diminished', 'suppressed'
    ]

    # Effects where the modifier is redundant
    # (the presence of the effect already implies the direction of change)
    redundant_modifier_effects = {
        # Positive effects (increase is implied)
        'euphoria', 'energy', 'alertness', 'focus', 'motivation', 'sociability',
        'libido', 'confidence', 'talkativeness', 'wakefulness', 'concentration',
        'creativity', 'empathy', 'mood', 'memory', 'attention', 'vigilance',
        'appetite', 'heart rate', 'blood pressure', 'perspiration', 'sweating',
        'heart-rate', 'blood-pressure', 'dream recall', 'brain activity',
        'penile firmness', 'risk-taking', 'verbal fluency', 'focus/attention',
        'focus/productivity', 'energy/alertness', 'tactile sensation',
        'tactile sensitivity', 'sensory perception', 'visual perception',
        'learning', 'mental clarity', 'appreciation of music',

        # Negative effects (reduction is implied when talking about symptoms)
        'anxiety', 'fatigue', 'pain', 'inhibition', 'inhibitions', 'appetite',
        'cravings', 'inflammation', 'muscle tension', 'reaction time',
        'sleep latency', 'social anxiety', 'suicidality', 'hyperactivity',
        'allergy symptoms', 'gastrointestinal motility', 'intra-ocular pressure',
        'seizure aura', 'physical symptoms of anxiety'
    }

    # Check if effect starts with a redundant modifier
    effect_lower = effect.lower()
    for prefix in redundant_prefixes:
        if effect_lower.startswith(prefix + ' '):
            # Extract the base effect
            base_effect = effect[len(prefix) + 1:]
            base_words = base_effect.lower().split()

            # Check if this is a redundant case
            for redundant in redundant_modifier_effects:
                if redundant in base_words or base_effect.lower().startswith(redundant):
                    return base_effect

    return effect

def update_groups_with_redundant_modifier_removal(groups: Dict[str, List[Tuple[str, str]]]) -> Dict[str, List[Tuple[str, str]]]:
    """
    Update groups by removing redundant modifiers and merging groups that become identical.
    """
    # Create new groups with redundant modifiers removed
    new_groups = defaultdict(list)

    for canonical, variants in groups.items():
        # Process canonical term
        new_canonical_base = remove_redundant_modifiers(re.sub(r'\s*\([^)]+\)$', '', canonical))

        # Keep qualifiers if present
        qualifiers_match = re.search(r'\s*\(([^)]+)\)$', canonical)
        if qualifiers_match:
            new_canonical = f"{new_canonical_base} ({qualifiers_match.group(1)})"
        else:
            new_canonical = new_canonical_base

        # Add all variants to the new canonical
        for std, orig in variants:
            new_groups[new_canonical].append((std, orig))

    # Also process ungrouped effects that might have redundant modifiers
    for canonical, variants in groups.items():
        if len(variants) == 1:
            std, orig = variants[0]
            base = remove_redundant_modifiers(re.sub(r'\s*\([^)]+\)$', '', std))
            qualifiers_match = re.search(r'\s*\(([^)]+)\)$', std)

            if qualifiers_match:
                new_std = f"{base} ({qualifiers_match.group(1)})"
            else:
                new_std = base

            if new_std != std:
                # This effect had a redundant modifier removed
                # Try to find if it should be grouped with an existing group
                for existing_canonical in list(new_groups.keys()):
                    if new_std.lower() == existing_canonical.lower():
                        new_groups[existing_canonical].append((std, orig))
                        break

    return dict(new_groups)

def main():
    """Main processing function."""
    input_file = "/Users/josie/Documents/Obsidian Vault/Utilities/dose.wiki/notes and plans/effects-standardization/all-effects.md"
    output_file = "/Users/josie/Documents/Obsidian Vault/Utilities/dose.wiki/notes and plans/effects-standardization/effects-synonym-groups.md"

    print("Reading effects from file...")
    effects = read_effects(input_file)
    print(f"Found {len(effects)} effects")

    print("Processing effects with redundant modifier removal...")

    # First standardize all effects
    standardized_effects = []
    for effect in effects:
        # Remove redundant modifiers first
        effect_cleaned = remove_redundant_modifiers(effect)
        # Then standardize
        std, orig = standardize_effect(effect_cleaned)
        standardized_effects.append((std, orig if orig != effect else effect))

    # Group effects
    groups = defaultdict(list)
    processed = set()

    for i, (std1, orig1) in enumerate(standardized_effects):
        if i in processed:
            continue

        group = [(std1, orig1)]
        processed.add(i)

        base1 = re.sub(r'\s*\([^)]+\)$', '', std1)
        qualifiers1 = re.search(r'\s*\(([^)]+)\)$', std1)
        qualifiers1 = qualifiers1.group(1) if qualifiers1 else ''

        norm1 = normalize_for_comparison(base1)

        for j, (std2, orig2) in enumerate(standardized_effects):
            if j <= i or j in processed:
                continue

            base2 = re.sub(r'\s*\([^)]+\)$', '', std2)
            qualifiers2 = re.search(r'\s*\(([^)]+)\)$', std2)
            qualifiers2 = qualifiers2.group(1) if qualifiers2 else ''

            norm2 = normalize_for_comparison(base2)

            should_group = False

            # Check for exact match or medical synonyms
            if norm1 == norm2 and qualifiers1 == qualifiers2:
                should_group = True
            elif qualifiers1 == qualifiers2:
                medical_syns = identify_medical_synonyms(base1.lower())
                if base2.lower() in medical_syns:
                    should_group = True
                medical_syns_norm = identify_medical_synonyms(norm1)
                if norm2 in medical_syns_norm:
                    should_group = True

            if should_group:
                group.append((std2, orig2))
                processed.add(j)

        canonical = select_canonical(group)
        groups[canonical] = group

    print(f"Created {len(groups)} synonym groups")

    print("Writing output file...")
    write_output(groups, len(effects), output_file)
    print(f"Output written to {output_file}")

if __name__ == "__main__":
    main()