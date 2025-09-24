#!/usr/bin/env python3
"""
Deduplicate variants within each synonym group.
"""

import re
from collections import defaultdict

def deduplicate_groups(input_file, output_file):
    """Read the effects-synonym-groups.md and remove duplicate variants within groups."""

    with open(input_file, 'r') as f:
        content = f.read()

    lines = content.split('\n')
    output_lines = []
    in_group = False
    current_variants = []
    group_header = ""
    canonical_term = ""

    i = 0
    while i < len(lines):
        line = lines[i]

        # Check if we're starting a new group
        if line.startswith('### Group'):
            # Process previous group if exists
            if in_group and current_variants:
                # Deduplicate variants
                seen = set()
                unique_variants = []
                for variant in current_variants:
                    # Clean variant for comparison
                    clean_variant = variant.strip()
                    if clean_variant.startswith('- '):
                        clean_variant = clean_variant[2:]
                    # Split on [from: if present
                    if ' [from: "' in clean_variant:
                        parts = clean_variant.split(' [from: "')
                        variant_text = parts[0]
                        original = parts[1].rstrip('"]')
                        variant_key = (variant_text, original)
                    else:
                        variant_key = (clean_variant, clean_variant)

                    if variant_key not in seen:
                        seen.add(variant_key)
                        unique_variants.append(variant)

                # Output the group with deduplicated variants
                output_lines.append(group_header)
                output_lines.append(f"**Canonical term**: {canonical_term}")
                output_lines.append(f"**Variants** ({len(unique_variants)}):")
                output_lines.extend(unique_variants)
                output_lines.append("")

            # Start new group
            in_group = True
            group_header = line
            current_variants = []
            i += 1

            # Get canonical term
            if i < len(lines) and lines[i].startswith('**Canonical term**:'):
                canonical_term = lines[i].split('**Canonical term**: ')[1]
                i += 1

            # Skip variants header
            if i < len(lines) and lines[i].startswith('**Variants**'):
                i += 1

        elif in_group and line.startswith('- '):
            # Collect variant
            current_variants.append(line)
            i += 1

        elif in_group and line == "":
            # End of group
            if current_variants:
                # Deduplicate variants
                seen = set()
                unique_variants = []
                for variant in current_variants:
                    # Clean variant for comparison
                    clean_variant = variant.strip()
                    if clean_variant.startswith('- '):
                        clean_variant = clean_variant[2:]
                    # Split on [from: if present
                    if ' [from: "' in clean_variant:
                        parts = clean_variant.split(' [from: "')
                        variant_text = parts[0]
                        original = parts[1].rstrip('"]')
                        variant_key = (variant_text, original)
                    else:
                        variant_key = (clean_variant, clean_variant)

                    if variant_key not in seen:
                        seen.add(variant_key)
                        unique_variants.append(variant)

                # Output the group with deduplicated variants
                output_lines.append(group_header)
                output_lines.append(f"**Canonical term**: {canonical_term}")
                output_lines.append(f"**Variants** ({len(unique_variants)}):")
                output_lines.extend(unique_variants)
                output_lines.append("")

            in_group = False
            current_variants = []
            i += 1

        else:
            # Not in a group, just copy the line
            output_lines.append(line)
            i += 1

    # Handle last group if file doesn't end with empty line
    if in_group and current_variants:
        # Deduplicate variants
        seen = set()
        unique_variants = []
        for variant in current_variants:
            # Clean variant for comparison
            clean_variant = variant.strip()
            if clean_variant.startswith('- '):
                clean_variant = clean_variant[2:]
            # Split on [from: if present
            if ' [from: "' in clean_variant:
                parts = clean_variant.split(' [from: "')
                variant_text = parts[0]
                original = parts[1].rstrip('"]')
                variant_key = (variant_text, original)
            else:
                variant_key = (clean_variant, clean_variant)

            if variant_key not in seen:
                seen.add(variant_key)
                unique_variants.append(variant)

        # Output the group with deduplicated variants
        output_lines.append(group_header)
        output_lines.append(f"**Canonical term**: {canonical_term}")
        output_lines.append(f"**Variants** ({len(unique_variants)}):")
        output_lines.extend(unique_variants)
        output_lines.append("")

    # Write output
    with open(output_file, 'w') as f:
        f.write('\n'.join(output_lines))

    print(f"Deduplicated groups written to {output_file}")

if __name__ == "__main__":
    input_file = "/Users/josie/Documents/Obsidian Vault/Utilities/dose.wiki/notes and plans/effects-standardization/effects-synonym-groups.md"
    output_file = "/Users/josie/Documents/Obsidian Vault/Utilities/dose.wiki/notes and plans/effects-standardization/effects-synonym-groups.md"

    deduplicate_groups(input_file, output_file)