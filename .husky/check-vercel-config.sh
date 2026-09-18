#!/usr/bin/env sh
# Vercel Configuration Validator
# Checks vercel.json for dangerous or suboptimal configurations

if [ ! -f "vercel.json" ]; then
  exit 0
fi

CONFIG=$(cat vercel.json)
ERRORS=0

# Check for excessive function memory (>1024MB hobby, >3008MB pro)
if echo "$CONFIG" | grep -q '"memory"'; then
  MEMORY=$(echo "$CONFIG" | grep -o '"memory"[[:space:]]*:[[:space:]]*[0-9]*' | grep -o '[0-9]*')
  if [ -n "$MEMORY" ] && [ "$MEMORY" -gt 1024 ]; then
    echo "⚠️  Function memory ($MEMORY MB) exceeds hobby plan limit (1024MB)"
    ERRORS=1
  fi
fi

# Check for excessive maxDuration (>30s hobby, >300s pro)
if echo "$CONFIG" | grep -q '"maxDuration"'; then
  DURATION=$(echo "$CONFIG" | grep -o '"maxDuration"[[:space:]]*:[[:space:]]*[0-9]*' | grep -o '[0-9]*')
  if [ -n "$DURATION" ] && [ "$DURATION" -gt 30 ]; then
    echo "⚠️  Function maxDuration ($DURATION s) exceeds hobby plan limit (30s)"
    echo "   Consider optimizing or upgrading your plan"
    ERRORS=1
  fi
fi

# Check for wildcard headers that could expose sensitive info
if echo "$CONFIG" | grep -q '"Access-Control-Allow-Origin"[[:space:]]*:[[:space:]]*"\*"'; then
  echo "⚠️  Wildcard CORS origin detected (Access-Control-Allow-Origin: *)"
  echo "   Consider restricting to specific domains"
  # This is a warning, not an error
fi

# Check for overly permissive rewrites
if echo "$CONFIG" | grep -q '"source"[[:space:]]*:[[:space:]]*"/\*\*"'; then
  echo "⚠️  Catch-all rewrite detected (/**)"
  echo "   Ensure this is intentional and secure"
fi

# Check for potential redirect loops
if echo "$CONFIG" | grep -q '"redirects"'; then
  REDIRECT_COUNT=$(echo "$CONFIG" | grep -c '"source"')
  if [ "$REDIRECT_COUNT" -gt 50 ]; then
    echo "⚠️  Large number of redirects ($REDIRECT_COUNT) detected"
    echo "   Consider using a redirect service or database"
  fi
fi

# Check for functions with dangerous runtime flags
if echo "$CONFIG" | grep -q '"runtime"[[:space:]]*:[[:space:]]*"edge"'; then
  echo "📝 Edge runtime detected - ensure compatibility with edge limitations"
fi

if [ $ERRORS -ne 0 ]; then
  echo ""
  echo "❌ Vercel configuration issues detected"
  echo "   Fix the above issues or use --no-verify to skip (not recommended)"
  exit 1
fi

echo "✅ Vercel configuration looks good"
exit 0
