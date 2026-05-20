#!/usr/bin/env sh
# Secret Detection Script for Pre-commit Hook
# Scans staged files for potential secrets and credentials

STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -v '^\.husky/')

if [ -z "$STAGED_FILES" ]; then
  exit 0
fi

# Patterns that indicate secrets (regex)
SECRET_PATTERNS=(
  # API Keys
  'sk[-_](live|test|or)[-_][a-zA-Z0-9]{20,}'
  'pk[-_](live|test)[-_][a-zA-Z0-9]{20,}'
  'ghp_[a-zA-Z0-9]{36,}'
  'gho_[a-zA-Z0-9]{36,}'
  'github_pat_[a-zA-Z0-9_]{22,}'
  'xox[baprs]-[a-zA-Z0-9-]{10,}'
  'AIza[a-zA-Z0-9_-]{35}'
  'ya29\.[a-zA-Z0-9_-]+'
  'AKIA[A-Z0-9]{16}'
  'npm_[a-zA-Z0-9]{36,}'

  # AWS Credentials
  'aws_access_key_id\s*=\s*[A-Z0-9]{20}'
  'aws_secret_access_key\s*=\s*[a-zA-Z0-9/+=]{40}'

  # Private Keys
  '-----BEGIN\s+(RSA\s+|EC\s+|DSA\s+|OPENSSH\s+)?PRIVATE\s+KEY-----'

  # Connection Strings with credentials
  'mongodb(\+srv)?://[^:]+:[^@]+@'
  'postgres(ql)?://[^:]+:[^@]+@'
  'mysql://[^:]+:[^@]+@'
  'redis://[^:]+:[^@]+@'

  # Generic patterns
  'password\s*[:=]\s*["\x27][^"\x27]{8,}["\x27]'
  'api[_-]?key\s*[:=]\s*["\x27][^"\x27]{16,}["\x27]'
  'secret[_-]?key\s*[:=]\s*["\x27][^"\x27]{16,}["\x27]'
  'auth[_-]?token\s*[:=]\s*["\x27][^"\x27]{16,}["\x27]'
)

FOUND_SECRETS=0

for pattern in "${SECRET_PATTERNS[@]}"; do
  # Check staged content for each pattern
  MATCHES=$(git diff --cached -U0 --diff-filter=ACM | grep '^+' | grep -v '^+++' | grep -iE -- "$pattern" | head -5)

  if [ -n "$MATCHES" ]; then
    if [ $FOUND_SECRETS -eq 0 ]; then
      echo ""
      echo "⚠️  Potential secrets detected in staged changes:"
      echo "=================================================="
    fi
    FOUND_SECRETS=1
    echo ""
    echo "Pattern: $pattern"
    echo "$MATCHES"
  fi
done

if [ $FOUND_SECRETS -ne 0 ]; then
  echo ""
  echo "=================================================="
  echo "❌ Please remove secrets before committing."
  echo "   Use environment variables instead."
  echo ""
  echo "   Tips:"
  echo "   - Add secrets to .env.local (gitignored)"
  echo "   - Use process.env.VAR_NAME in code"
  echo "   - For client code, prefix with VITE_"
  echo ""
  exit 1
fi

exit 0
