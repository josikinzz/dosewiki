/**
 * ESLint Plugin: Vercel Policy Guardrails
 *
 * Custom lint rules to enforce Vercel best practices:
 * - No hardcoded secrets or API keys
 * - Proper environment variable access
 * - Safe API route patterns
 * - Function config validation
 */

const noHardcodedSecrets = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow hardcoded secrets, API keys, and credentials',
      category: 'Security',
    },
    messages: {
      hardcodedSecret: 'Potential hardcoded secret detected: "{{value}}". Use environment variables instead.',
      suspiciousAssignment: 'Suspicious credential assignment. Use process.env for secrets.',
    },
    schema: [],
  },
  create(context) {
    // Patterns that indicate secrets/credentials
    const secretPatterns = [
      /^sk[-_](?:live|test|or)[-_][a-zA-Z0-9]{20,}$/,  // Stripe, OpenRouter keys
      /^pk[-_](?:live|test)[-_][a-zA-Z0-9]{20,}$/,     // Public keys (still shouldn't be hardcoded)
      /^ghp_[a-zA-Z0-9]{36,}$/,                         // GitHub personal access tokens
      /^gho_[a-zA-Z0-9]{36,}$/,                         // GitHub OAuth tokens
      /^github_pat_[a-zA-Z0-9_]{22,}$/,                 // GitHub fine-grained PATs
      /^xox[baprs]-[a-zA-Z0-9-]{10,}$/,                 // Slack tokens
      /^AIza[a-zA-Z0-9_-]{35}$/,                        // Google API keys
      /^ya29\.[a-zA-Z0-9_-]+$/,                         // Google OAuth tokens
      /^AKIA[A-Z0-9]{16}$/,                             // AWS access key IDs
      /^[a-zA-Z0-9/+=]{40}$/,                           // AWS secret access keys (40 chars base64)
      /^eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\./,       // JWT tokens
      /^npm_[a-zA-Z0-9]{36,}$/,                         // npm tokens
      /^pypi-[a-zA-Z0-9_-]{60,}$/,                      // PyPI tokens
      /^-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/, // Private keys
      /^mongodb(?:\+srv)?:\/\/[^:]+:[^@]+@/,            // MongoDB connection strings with creds
      /^postgres(?:ql)?:\/\/[^:]+:[^@]+@/,              // PostgreSQL connection strings
      /^mysql:\/\/[^:]+:[^@]+@/,                        // MySQL connection strings
      /^redis:\/\/[^:]+:[^@]+@/,                        // Redis connection strings
    ];

    // Variable names that suggest secrets
    const secretVarPatterns = [
      /(?:api|auth|access|secret|private)[-_]?key/i,
      /(?:password|passwd|pwd)(?:[-_]?\w+)?$/i,
      /(?:auth|bearer)[-_]?token/i,
      /(?:client|app)[-_]?secret/i,
      /(?:db|database)[-_]?(?:password|pwd)/i,
      /encryption[-_]?key/i,
      /signing[-_]?(?:key|secret)/i,
    ];

    const isSecretLike = (value) => {
      if (typeof value !== 'string') return false;
      return secretPatterns.some(pattern => pattern.test(value));
    };

    const isSuspiciousVarName = (name) => {
      if (typeof name !== 'string') return false;
      return secretVarPatterns.some(pattern => pattern.test(name));
    };

    return {
      Literal(node) {
        if (typeof node.value === 'string' && isSecretLike(node.value)) {
          context.report({
            node,
            messageId: 'hardcodedSecret',
            data: { value: node.value.slice(0, 20) + '...' },
          });
        }
      },

      TemplateLiteral(node) {
        // Check if template literal contains secret-like patterns in its quasis
        const fullValue = node.quasis.map(q => q.value.raw).join('');
        if (isSecretLike(fullValue)) {
          context.report({
            node,
            messageId: 'hardcodedSecret',
            data: { value: fullValue.slice(0, 20) + '...' },
          });
        }
      },

      VariableDeclarator(node) {
        if (
          node.id.type === 'Identifier' &&
          isSuspiciousVarName(node.id.name) &&
          node.init?.type === 'Literal' &&
          typeof node.init.value === 'string' &&
          node.init.value.length > 8
        ) {
          context.report({
            node,
            messageId: 'suspiciousAssignment',
          });
        }
      },

      AssignmentExpression(node) {
        if (
          node.left.type === 'Identifier' &&
          isSuspiciousVarName(node.left.name) &&
          node.right?.type === 'Literal' &&
          typeof node.right.value === 'string' &&
          node.right.value.length > 8
        ) {
          context.report({
            node,
            messageId: 'suspiciousAssignment',
          });
        }
      },
    };
  },
};

function getContextFilename(context) {
  return context.filename || context.physicalFilename || context.getFilename?.() || '';
}

const enforceEnvPrefix = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce proper environment variable prefixes for client exposure',
      category: 'Best Practices',
    },
    messages: {
      missingPrefix: 'Environment variable "{{name}}" accessed in client code should use VITE_ prefix for Vite projects.',
      directProcessEnv: 'Avoid direct process.env access in client code. Use import.meta.env instead.',
      nextPrivateEnv: 'Environment variable "{{name}}" is not available in Next.js client/shared code. Use a static NEXT_PUBLIC_* variable.',
      nextDynamicEnv: 'Dynamic process.env access is not safe in Next.js client/shared code. Use a static NEXT_PUBLIC_* variable.',
      nextImportMetaEnv: 'Next.js client/shared code must use static process.env.NEXT_PUBLIC_* access instead of import.meta.env.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          framework: {
            enum: ['vite', 'next'],
          },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const filename = getContextFilename(context);
    const framework = context.options[0]?.framework ?? 'vite';
    const normalizedFilename = filename.replaceAll('\\', '/');
    const isSourceModule = normalizedFilename.includes('/src/');
    const isTestFixture =
      /(?:^|\/)__tests__\//.test(normalizedFilename) ||
      /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(normalizedFilename);
    const isConventionalServerModule =
      normalizedFilename.includes('/api/') ||
      normalizedFilename.includes('/server/') ||
      normalizedFilename.includes('.server.') ||
      /\/middleware\.[cm]?[jt]sx?$/.test(normalizedFilename);
    const isAppRouterHandler = /\/app\/(?:.*\/)?route\.[cm]?[jt]sx?$/.test(normalizedFilename);
    const isAppRouterPageOrLayout = /\/app\/(?:.*\/)?(?:page|layout)\.[cm]?[jt]sx?$/.test(normalizedFilename);
    let hasServerOnlyImport = false;
    let hasUseClientDirective = false;

    if (!isSourceModule || isTestFixture) return {};

    function staticMemberName(node) {
      if (!node.computed && node.property?.type === 'Identifier') return node.property.name;
      if (node.computed && node.property?.type === 'Literal' && typeof node.property.value === 'string') {
        return node.property.value;
      }
      return null;
    }

    function isProcessEnvMember(node) {
      return (
        node.object?.type === 'MemberExpression' &&
        node.object.object?.type === 'Identifier' &&
        node.object.object.name === 'process' &&
        staticMemberName(node.object) === 'env'
      );
    }

    function isImportMetaEnvMember(node) {
      return (
        node.object?.type === 'MemberExpression' &&
        node.object.object?.type === 'MetaProperty' &&
        staticMemberName(node.object) === 'env'
      );
    }

    return {
      Program(node) {
        hasUseClientDirective = node.body.some(
          statement => statement.type === 'ExpressionStatement' && statement.directive === 'use client',
        );
        hasServerOnlyImport = node.body.some(
          statement => statement.type === 'ImportDeclaration' && statement.source.value === 'server-only',
        );
      },

      MemberExpression(node) {
        const isServerBoundary =
          isConventionalServerModule ||
          (framework === 'next' &&
            (hasServerOnlyImport ||
              isAppRouterHandler ||
              (isAppRouterPageOrLayout && !hasUseClientDirective)));
        if (isServerBoundary) return;

        if (isProcessEnvMember(node)) {
          if (framework === 'vite') {
            context.report({
              node,
              messageId: 'directProcessEnv',
            });
            return;
          }

          const name = staticMemberName(node);
          if (name === null) {
            context.report({ node, messageId: 'nextDynamicEnv' });
          } else if (name !== 'NODE_ENV' && !name.startsWith('NEXT_PUBLIC_')) {
            context.report({
              node,
              messageId: 'nextPrivateEnv',
              data: { name },
            });
          }
          return;
        }

        if (isImportMetaEnvMember(node)) {
          if (framework === 'next') {
            context.report({ node, messageId: 'nextImportMetaEnv' });
            return;
          }

          const name = staticMemberName(node);
          if (
            name !== null &&
            !name.startsWith('VITE_') &&
            !['MODE', 'DEV', 'PROD', 'SSR', 'BASE_URL'].includes(name)
          ) {
            context.report({
              node,
              messageId: 'missingPrefix',
              data: { name },
            });
          }
        }
      },
    };
  },
};

const noUnsafeApiPatterns = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow unsafe patterns in Vercel API routes',
      category: 'Security',
    },
    messages: {
      noEval: 'Avoid eval() in API routes. Use safer alternatives.',
      noFunctionConstructor: 'Avoid Function constructor in API routes. Use safer alternatives.',
      unsafeRedirect: 'Validate redirect URLs to prevent open redirect vulnerabilities.',
      sqlInjection: 'Potential SQL injection. Use parameterized queries.',
      commandInjection: 'Potential command injection. Avoid dynamic shell commands.',
    },
    schema: [],
  },
  create(context) {
    const filename = getContextFilename(context);
    const isApiRoute = filename.includes('/api/');

    if (!isApiRoute) return {};

    return {
      CallExpression(node) {
        // Check for eval()
        if (node.callee.type === 'Identifier' && node.callee.name === 'eval') {
          context.report({ node, messageId: 'noEval' });
        }

        // Check for Function constructor
        if (node.callee.type === 'Identifier' && node.callee.name === 'Function') {
          context.report({ node, messageId: 'noFunctionConstructor' });
        }

        // Check for exec/spawn with template literals or concatenated strings
        if (
          node.callee.type === 'Identifier' &&
          ['exec', 'execSync', 'spawn', 'spawnSync'].includes(node.callee.name) &&
          node.arguments[0]?.type === 'TemplateLiteral'
        ) {
          context.report({ node, messageId: 'commandInjection' });
        }

        // Check for unsafe redirects
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.property?.name === 'redirect' &&
          node.arguments[0]?.type !== 'Literal'
        ) {
          context.report({ node, messageId: 'unsafeRedirect' });
        }
      },

      NewExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'Function') {
          context.report({ node, messageId: 'noFunctionConstructor' });
        }
      },

      TemplateLiteral(node) {
        // Check for SQL-like patterns with interpolation
        // Must have SQL keywords followed by typical SQL syntax
        const quasis = node.quasis.map(q => q.value.raw).join('');
        const sqlPatterns = [
          /SELECT\s+[\w*,\s]+\s+FROM\s+/i,           // SELECT ... FROM
          /INSERT\s+INTO\s+\w+/i,                     // INSERT INTO table
          /UPDATE\s+\w+\s+SET\s+/i,                   // UPDATE table SET
          /DELETE\s+FROM\s+\w+/i,                     // DELETE FROM table
          /DROP\s+(?:TABLE|DATABASE|INDEX)\s+/i,     // DROP TABLE/DATABASE/INDEX
          /CREATE\s+(?:TABLE|DATABASE|INDEX)\s+/i,   // CREATE TABLE/DATABASE/INDEX
          /ALTER\s+TABLE\s+\w+/i,                     // ALTER TABLE
        ];
        if (
          sqlPatterns.some(pattern => pattern.test(quasis)) &&
          node.expressions.length > 0
        ) {
          context.report({ node, messageId: 'sqlInjection' });
        }
      },
    };
  },
};

const requireRateLimit = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Require rate limiting in API routes',
      category: 'Security',
    },
    messages: {
      missingRateLimit: 'API route should implement rate limiting to prevent abuse.',
    },
    schema: [],
  },
  create(context) {
    const filename = getContextFilename(context);
    const isApiRoute =
      filename.includes('/api/') &&
      /\/route\.tsx?$/.test(filename) &&
      !filename.includes('/api/auth/') &&
      !filename.includes('/_utils/') &&
      !filename.includes('.test.');

    if (!isApiRoute) return {};

    let hasRateLimitImport = false;
    let hasRateLimitCall = false;
    let hasDelegatedHandlerCall = false;
    const delegatedHandlerNames = new Set();
    const httpHandlerNames = new Set([
      'GET',
      'HEAD',
      'POST',
      'PUT',
      'DELETE',
      'PATCH',
      'OPTIONS',
    ]);
    const rateLimitAwareCallNames = new Set([
      'rateLimit',
      'enforceRateLimit',
      'protectedRouteOperation',
      'citationEvidenceRouteOperation',
      'feedbackStatusRoute',
      // Editor read routes wrap protectedRouteOperation with rateLimit: "editorPolledRead".
      'editorReadRoute',
      // /api/subscribe applies per-IP and global limits through this limiter's limit() calls.
      'createSubscribeRateLimiter',
      // Cron routes are gated by CRON_SECRET; the caller is Vercel's scheduler, not the public.
      'authorizeCronRequest',
    ]);

    return {
      ImportDeclaration(node) {
        const source = node.source.value;
        if (
          source.includes('rateLimit') ||
          source.includes('rate-limit') ||
          source.includes('protectedRouteOperation') ||
          source.includes('@upstash/ratelimit')
        ) {
          hasRateLimitImport = true;
        }

        for (const specifier of node.specifiers ?? []) {
          const importedName = specifier.imported?.name ?? specifier.local?.name ?? '';
          const localName = specifier.local?.name ?? '';
          if (rateLimitAwareCallNames.has(importedName) || rateLimitAwareCallNames.has(localName)) {
            hasRateLimitImport = true;
          }
        }

        const isRelativeRouteModule =
          typeof source === 'string' &&
          source.startsWith('.') &&
          /(?:^|\/)route(?:\.[cm]?[jt]sx?)?$/.test(source);
        if (isRelativeRouteModule) {
          for (const specifier of node.specifiers ?? []) {
            if (
              specifier.type === 'ImportSpecifier' &&
              httpHandlerNames.has(specifier.imported?.name) &&
              specifier.local?.name
            ) {
              delegatedHandlerNames.add(specifier.local.name);
            }
          }
        }
      },

      CallExpression(node) {
        if (
          (node.callee.type === 'Identifier' && rateLimitAwareCallNames.has(node.callee.name)) ||
          (node.callee.type === 'MemberExpression' &&
           node.callee.property?.name === 'limit')
        ) {
          hasRateLimitCall = true;
        }
        if (
          node.callee.type === 'Identifier' &&
          delegatedHandlerNames.has(node.callee.name)
        ) {
          hasDelegatedHandlerCall = true;
        }
      },

      'Program:exit'(node) {
        if ((!hasRateLimitImport || !hasRateLimitCall) && !hasDelegatedHandlerCall) {
          context.report({
            node,
            messageId: 'missingRateLimit',
          });
        }
      },
    };
  },
};

const validateFunctionConfig = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Validate Vercel function configuration',
      category: 'Best Practices',
    },
    messages: {
      excessiveMemory: 'Function memory ({{memory}}MB) exceeds recommended limit of 1024MB.',
      excessiveDuration: 'Function maxDuration ({{duration}}s) exceeds recommended limit of 30s for hobby plan.',
      missingConfig: 'Consider adding function configuration for performance optimization.',
    },
    schema: [],
  },
  create(context) {
    return {
      ExportNamedDeclaration(node) {
        if (node.declaration?.type !== 'VariableDeclaration') return;

        for (const decl of node.declaration.declarations) {
          if (decl.id?.name !== 'config') continue;
          if (decl.init?.type !== 'ObjectExpression') continue;

          for (const prop of decl.init.properties) {
            if (prop.key?.name === 'memory' && prop.value?.value > 1024) {
              context.report({
                node: prop,
                messageId: 'excessiveMemory',
                data: { memory: prop.value.value },
              });
            }
            if (prop.key?.name === 'maxDuration' && prop.value?.value > 30) {
              context.report({
                node: prop,
                messageId: 'excessiveDuration',
                data: { duration: prop.value.value },
              });
            }
          }
        }
      },
    };
  },
};

module.exports = {
  meta: {
    name: 'eslint-plugin-vercel-guardrails',
    version: '1.0.0',
  },
  rules: {
    'no-hardcoded-secrets': noHardcodedSecrets,
    'enforce-env-prefix': enforceEnvPrefix,
    'no-unsafe-api-patterns': noUnsafeApiPatterns,
    'require-rate-limit': requireRateLimit,
    'validate-function-config': validateFunctionConfig,
  },
  configs: {
    recommended: {
      plugins: ['vercel-guardrails'],
      rules: {
        'vercel-guardrails/no-hardcoded-secrets': 'error',
        'vercel-guardrails/enforce-env-prefix': 'warn',
        'vercel-guardrails/no-unsafe-api-patterns': 'error',
        'vercel-guardrails/require-rate-limit': 'warn',
        'vercel-guardrails/validate-function-config': 'warn',
      },
    },
  },
};
