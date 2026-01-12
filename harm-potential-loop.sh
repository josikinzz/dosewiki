#!/bin/bash
# harm-potential-loop.sh
# Runs /harm-potential for each substance, clearing context between each one.
# Progress is tracked in .claude/skills/harm-potential/SKILL.md

SKILL_FILE=".claude/skills/harm-potential/SKILL.md"

echo "=========================================="
echo "  Harm Potential Extraction Loop"
echo "=========================================="
echo ""

count=0

while true; do
  # Check if any unchecked items remain
  remaining=$(grep -c "^- \[ \]" "$SKILL_FILE" 2>/dev/null || echo "0")

  if [ "$remaining" -eq 0 ]; then
    echo ""
    echo "=========================================="
    echo "  ALL SUBSTANCES COMPLETE!"
    echo "  Total processed this session: $count"
    echo "=========================================="
    break
  fi

  # Get the next substance to process
  next_substance=$(grep "^- \[ \]" "$SKILL_FILE" | head -1 | sed 's/- \[ \] //')

  echo ""
  echo "------------------------------------------"
  echo "  Processing: $next_substance"
  echo "  Remaining: $remaining"
  echo "------------------------------------------"
  echo ""

  # Run claude with /harm-potential (fresh context each time)
  claude "/harm-potential"

  count=$((count + 1))

  echo ""
  echo "Completed: $next_substance"
  echo "Waiting 2 seconds before next substance..."
  sleep 2
done

echo ""
echo "Loop finished. Check harmpotential-quotes/ for output files."
