---
name: vercel-policy-guardrails
description: |
  Implement Vercel lint rules, policy enforcement, and automated guardrails.
  Use when setting up code quality rules for Vercel integrations, implementing
  pre-commit hooks, or configuring CI policy checks for Vercel best practices.
  Trigger with phrases like "vercel policy", "vercel lint",
  "vercel guardrails", "vercel best practices check", "vercel eslint".
allowed-tools: Read, Write, Edit, Bash(npx:*)
version: 1.0.0
license: MIT
author: Jeremy Longshore <jeremy@intentsolutions.io>
---

# Vercel Policy Guardrails

Comprehensive security and best-practices enforcement for Vercel deployments.

## What's Included

### 1. ESLint Plugin (`eslint-plugins/vercel-guardrails/`)
Custom lint rules:
- **no-hardcoded-secrets**: Blocks API keys, tokens, credentials
- **enforce-env-prefix**: Ensures VITE_ prefix for client env vars
- **no-unsafe-api-patterns**: Catches eval, SQL injection, command injection
- **require-rate-limit**: Warns if API routes lack rate limiting
- **validate-function-config**: Checks memory/duration limits

### 2. Pre-commit Hooks (`.husky/`)
- **check-secrets.sh**: Scans staged changes for secret patterns
- **check-vercel-config.sh**: Validates vercel.json settings
- **pre-commit**: Orchestrates all checks before commit

### 3. CI/CD Pipeline (`.github/workflows/vercel-policy-checks.yml`)
- Security scanning on push/PR
- TypeScript type checking
- Build verification
- Secret detection in codebase

### 4. Environment Template (`.env.example`)
- Safe template for environment setup
- Documents required variables

## Quick Commands

```bash
# Run linting
npm run lint           # src/ only
npm run lint:api       # api/ only
npm run lint:all       # everything

# Manual security check
npm run security:check

# Install husky (runs automatically on npm install)
npm run prepare
```

## Files Created/Modified

| File | Purpose |
|------|---------|
| `eslint-plugins/vercel-guardrails/` | Custom ESLint plugin |
| `eslint.config.js` | Updated with guardrails rules |
| `.husky/pre-commit` | Pre-commit hook orchestrator |
| `.husky/check-secrets.sh` | Secret detection script |
| `.husky/check-vercel-config.sh` | Config validator |
| `.github/workflows/vercel-policy-checks.yml` | CI pipeline |
| `.env.example` | Environment template |
| `.gitignore` | Updated .env patterns |
| `package.json` | Added scripts and husky |

## References

- `{baseDir}/references/eslint-rules.md` - Detailed rule documentation
- `{baseDir}/references/errors.md` - Error troubleshooting
- `{baseDir}/references/examples.md` - Usage examples

## Setup After Installation

```bash
# 1. Install dependencies (includes husky)
bun install

# 2. Verify ESLint works
npm run lint

# 3. Test pre-commit hook
git add . && git commit -m "test" --dry-run
```
