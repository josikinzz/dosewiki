const fs = require('node:fs');
const path = require('node:path');

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
    const secretPatterns = [
      /^sk[-_](?:live|test|or)[-_][a-zA-Z0-9]{20,}$/,
      /^pk[-_](?:live|test)[-_][a-zA-Z0-9]{20,}$/,
      /^ghp_[a-zA-Z0-9]{36,}$/,
      /^gho_[a-zA-Z0-9]{36,}$/,
      /^github_pat_[a-zA-Z0-9_]{22,}$/,
      /^xox[baprs]-[a-zA-Z0-9-]{10,}$/,
      /^AIza[a-zA-Z0-9_-]{35}$/,
      /^ya29\.[a-zA-Z0-9_-]+$/,
      /^AKIA[A-Z0-9]{16}$/,
      /^[a-zA-Z0-9/+=]{40}$/,
      /^eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\./,
      /^npm_[a-zA-Z0-9]{36,}$/,
      /^pypi-[a-zA-Z0-9_-]{60,}$/,
      /^-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
      /^mongodb(?:\+srv)?:\/\/[^:]+:[^@]+@/,
      /^postgres(?:ql)?:\/\/[^:]+:[^@]+@/,
      /^mysql:\/\/[^:]+:[^@]+@/,
      /^redis:\/\/[^:]+:[^@]+@/,
    ];

    const secretVarPatterns = [
      /(?:api|auth|access|secret|private)[-_]?key/i,
      /(?:password|passwd|pwd)(?:[-_]?\w+)?$/i,
      /(?:auth|bearer)[-_]?token/i,
      /(?:client|app)[-_]?secret/i,
      /(?:db|database)[-_]?(?:password|pwd)/i,
      /encryption[-_]?key/i,
      /signing[-_]?(?:key|secret)/i,
    ];

    const filename = getContextFilename(context).replaceAll('\\', '/');
    const isTestFixture =
      /(?:^|\/)__tests__\//.test(filename) ||
      /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(filename);

    const isPlaceholderConnectionString = (value) => {
      const host = /^[a-z][a-z0-9+.-]*:\/\/[^@/]*@(\[[^\]]+\]|[^:/?#]+)/i.exec(value)?.[1]?.toLowerCase();
      if (!host) return false;
      if (/(?:^|\.)(?:example|test|invalid)$/.test(host)) return true;
      if (/(?:^|\.)example\.(?:com|net|org)$/.test(host)) return true;
      return isTestFixture && (host === 'localhost' || host === '127.0.0.1' || host === '[::1]');
    };

    const isSecretLike = (value) => {
      if (typeof value !== 'string') return false;
      if (isPlaceholderConnectionString(value)) return false;
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
        if (node.callee.type === 'Identifier' && node.callee.name === 'eval') {
          context.report({ node, messageId: 'noEval' });
        }

        if (node.callee.type === 'Identifier' && node.callee.name === 'Function') {
          context.report({ node, messageId: 'noFunctionConstructor' });
        }

        if (
          node.callee.type === 'Identifier' &&
          ['exec', 'execSync', 'spawn', 'spawnSync'].includes(node.callee.name) &&
          node.arguments[0]?.type === 'TemplateLiteral'
        ) {
          context.report({ node, messageId: 'commandInjection' });
        }

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
        const quasis = node.quasis.map(q => q.value.raw).join('');
        const sqlPatterns = [
          /SELECT\s+[\w*,\s]+\s+FROM\s+/i,
          /INSERT\s+INTO\s+\w+/i,
          /UPDATE\s+\w+\s+SET\s+/i,
          /DELETE\s+FROM\s+\w+/i,
          /DROP\s+(?:TABLE|DATABASE|INDEX)\s+/i,
          /CREATE\s+(?:TABLE|DATABASE|INDEX)\s+/i,
          /ALTER\s+TABLE\s+\w+/i,
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
      'feedbackQueueRoute',
      'feedbackItemRoute',
      'editorReadRoute',
      'createSubscribeRateLimiter',
      'authorizeCronRequest',
      'cronRoute',
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

const HTTP_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']);

const ROUTE_GUARD_FACTORIES = new Map([
  ['src/lib/http/protectedRouteOperation#protectedRouteOperation', 'authOption'],
  ['src/app/api/editor/editorReadRoute#editorReadRoute', 'authOption'],
  ['src/app/api/citation-evidence/_shared#citationEvidenceRouteOperation', 'fixedFloor'],
  ['src/lib/http/feedbackItemRoute#feedbackItemRoute', 'fixedFloor'],
  ['src/lib/http/feedbackQueueRoute#feedbackQueueRoute', 'fixedFloor'],
  ['src/lib/http/feedbackStatusRoute#feedbackStatusRoute', 'fixedFloor'],
  ['src/app/api/glossary-feedback/reviewRoutes#glossaryReviewRead', 'fixedFloor'],
  ['lib/http/cronAuthorization#cronRoute', 'fixedFloor'],
  ['lib/next/replicationViewerEditorPolicy#replicationViewerEditorRoute', 'wrapsHandler'],
  ['src/app/api/test-env/testEnvRoute#testEnvRoute', 'wrapsHandler'],
]);

const MODULE_ALIASES = [
  ['@/', 'src/'],
  ['@server/', 'lib/'],
  ['@lib/', 'lib/'],
];

const ROUTE_ACCESS_KINDS = ['public', 'intake', 'bootstrap', 'service', 'local-fixture'];

const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const TYPE_ONLY_WRAPPERS = new Set(['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression']);
const TYPE_ONLY_DECLARATIONS = new Set(['TSTypeAliasDeclaration', 'TSInterfaceDeclaration', 'TSDeclareFunction']);
const unsupportedBinding = { kind: 'unsupported' };

function collectPatternNames(pattern, names = []) {
  if (!pattern) return names;
  if (TYPE_ONLY_WRAPPERS.has(pattern.type)) return collectPatternNames(pattern.expression, names);
  if (pattern.type === 'Identifier') names.push(pattern.name);
  if (pattern.type === 'ObjectPattern') {
    for (const property of pattern.properties) collectPatternNames(property.type === 'RestElement' ? property : property.value, names);
  }
  if (pattern.type === 'ArrayPattern') for (const element of pattern.elements) collectPatternNames(element, names);
  if (pattern.type === 'RestElement') collectPatternNames(pattern.argument, names);
  if (pattern.type === 'AssignmentPattern') collectPatternNames(pattern.left, names);
  return names;
}

function collectWrittenNames(node, written = new Set()) {
  if (!node || typeof node.type !== 'string') return written;
  const target =
    node.type === 'AssignmentExpression' ? node.left
      : node.type === 'UpdateExpression' ? node.argument
        : ['ForInStatement', 'ForOfStatement'].includes(node.type) && node.left.type !== 'VariableDeclaration' ? node.left
          : null;
  for (const name of collectPatternNames(target)) written.add(name);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent' || !value || typeof value !== 'object') continue;
    for (const child of Array.isArray(value) ? value : [value]) collectWrittenNames(child, written);
  }
  return written;
}

function declaredBindings(declaration) {
  if (!declaration || TYPE_ONLY_DECLARATIONS.has(declaration.type)) return [];
  if (declaration.type === 'FunctionDeclaration') {
    return declaration.id ? [[declaration.id.name, { kind: 'value', node: declaration }, declaration]] : [];
  }
  if (declaration.type === 'VariableDeclaration') {
    return declaration.declarations.flatMap(declarator => {
      const isConstValue = declaration.kind === 'const' && !declaration.declare && declarator.id.type === 'Identifier' && declarator.init;
      return isConstValue
        ? [[declarator.id.name, { kind: 'value', node: declarator.init }, declarator]]
        : collectPatternNames(declarator.id).map(name => [name, unsupportedBinding, declarator]);
    });
  }
  return declaration.id?.type === 'Identifier' ? [[declaration.id.name, unsupportedBinding, declaration]] : [];
}

function readModuleBindings(program) {
  const locals = new Map();
  const exports = new Map();
  let hasStarExport = false;
  const declareLocal = (name, binding) => locals.set(name, locals.has(name) ? unsupportedBinding : binding);
  const declareExport = (name, binding) => exports.set(name, exports.has(name) ? unsupportedBinding : binding);

  for (const statement of program.body) {
    if (statement.type === 'ImportDeclaration') {
      for (const specifier of statement.specifiers) {
        declareLocal(specifier.local.name, {
          kind: 'import',
          source: statement.source.value,
          imported: specifier.type === 'ImportSpecifier' ? specifier.imported.name : 'default',
        });
      }
      continue;
    }
    if (statement.type === 'ExportAllDeclaration') {
      hasStarExport = true;
      continue;
    }

    const exported = statement.type === 'ExportNamedDeclaration';
    for (const [name, binding, node] of declaredBindings(exported ? statement.declaration : statement)) {
      declareLocal(name, binding);
      if (exported) declareExport(name, { kind: 'local', name, node });
    }
    if (exported && !statement.declaration) {
      for (const specifier of statement.specifiers) {
        declareExport(
          specifier.exported.name ?? specifier.exported.value,
          statement.source
            ? { kind: 'import', source: statement.source.value, imported: specifier.local.name, node: specifier }
            : { kind: 'local', name: specifier.local.name, node: specifier },
        );
      }
    }
  }

  return { locals, exports, hasStarExport, written: collectWrittenNames(program) };
}

function resolveRelativeModule(fromFile, source) {
  if (!source.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), source);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')];
  return candidates.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? null;
}

function hasInlineAuthFloor(optionsNode) {
  if (optionsNode?.type !== 'ObjectExpression') return false;
  const authIndex = optionsNode.properties.findLastIndex(property =>
    property.type === 'Property' &&
    property.kind === 'init' &&
    !property.computed &&
    (property.key.name === 'auth' || property.key.value === 'auth'),
  );
  return authIndex !== -1 && !optionsNode.properties.slice(authIndex + 1).some(property => property.type === 'SpreadElement');
}

function hasDeferredAccessor(node) {
  if (!node || typeof node.type !== 'string') return false;
  if (TYPE_ONLY_WRAPPERS.has(node.type)) return hasDeferredAccessor(node.expression);
  if (node.type === 'ObjectExpression') {
    return node.properties.some(property =>
      property.type === 'Property' && (property.kind !== 'init' || hasDeferredAccessor(property.value)),
    );
  }
  if (node.type === 'ArrayExpression') return node.elements.some(hasDeferredAccessor);
  return false;
}

function resolveModuleId(root, fromFile, source) {
  const alias = MODULE_ALIASES.find(([prefix]) => source.startsWith(prefix));
  const absolute = source.startsWith('.')
    ? path.resolve(path.dirname(fromFile), source)
    : alias
      ? path.resolve(root, alias[1], source.slice(alias[0].length))
      : null;
  if (!absolute) return null;
  return path.relative(root, absolute).replaceAll('\\', '/').replace(/\.tsx?$/, '');
}

function isInertExpression(node) {
  if (TYPE_ONLY_WRAPPERS.has(node.type)) return isInertExpression(node.expression);
  switch (node.type) {
    case 'Literal':
    case 'Identifier':
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
      return true;
    case 'TemplateLiteral':
      return node.expressions.length === 0;
    case 'ArrayExpression':
      return node.elements.every(element => element !== null && isInertExpression(element));
    case 'ObjectExpression':
      return node.properties.every(property =>
        property.type === 'Property' && property.kind === 'init' && !property.computed && isInertExpression(property.value),
      );
    default:
      return false;
  }
}

function forwardsRouteArguments(params, args) {
  return (
    params.every(param => param.type === 'Identifier') &&
    args.length > 0 &&
    args.length <= params.length &&
    args.every((arg, index) => arg.type === 'Identifier' && arg.name === params[index].name)
  );
}

function createRouteGuardClassifier(root, parseModule) {
  const unguarded = { guarded: false };
  const unsupported = { guarded: false, unsupported: true };

  function classifyBinding(module, binding, canFollowImport) {
    if (!binding) return unguarded;
    if (binding.kind === 'unsupported') return unsupported;
    if (binding.kind === 'value') return classifyHandler(module, binding.node, { canFollowImport });
    if (binding.kind === 'local') {
      return module.written.has(binding.name) ? unsupported : classifyBinding(module, module.locals.get(binding.name), canFollowImport);
    }
    if (!canFollowImport) return unguarded;
    const target = parseModule(module.file, binding.source);
    if (!target) return unguarded;
    return classifyBinding(target, target.exports.get(binding.imported), false);
  }

  function classifyFactoryCall(module, node, scope) {
    const calleeName = node.callee.type === 'Identifier' ? node.callee.name : null;
    const callee = calleeName && !scope.shadowed?.has(calleeName) ? module.locals.get(calleeName) : null;
    const moduleId = callee?.kind === 'import' ? resolveModuleId(root, module.file, callee.source) : null;
    const factory = moduleId ? callee.imported : null;
    const kind = ROUTE_GUARD_FACTORIES.get(`${moduleId}#${factory}`);
    if (kind === 'wrapsHandler') {
      return node.arguments.length === 1 ? classifyHandler(module, node.arguments[0], scope) : unguarded;
    }
    if (!kind || node.arguments.some(hasDeferredAccessor) || (scope.perRequest && !node.arguments.every(isInertExpression))) return unguarded;
    if (kind === 'fixedFloor') return { guarded: true };
    return hasInlineAuthFloor(node.arguments[0]) ? { guarded: true } : { guarded: false, missingFloor: factory };
  }

  function classifyForwardingFunction(module, node, scope) {
    const body = node.body;
    const delegated = body.type !== 'BlockStatement'
      ? body
      : body.body.length === 1 && body.body[0].type === 'ReturnStatement'
        ? body.body[0].argument
        : null;
    if (node.generator || delegated?.type !== 'CallExpression') return unguarded;
    if (!forwardsRouteArguments(node.params, delegated.arguments)) return unguarded;
    return classifyHandler(module, delegated.callee, {
      canFollowImport: scope.canFollowImport,
      perRequest: true,
      shadowed: new Set(node.params.map(param => param.name)),
    });
  }

  function classifyHandler(module, node, scope) {
    if (!node) return unguarded;
    if (node.type === 'Identifier') {
      return scope.shadowed?.has(node.name) ? unguarded : classifyBinding(module, { kind: 'local', name: node.name }, scope.canFollowImport);
    }
    if (node.type === 'CallExpression') return classifyFactoryCall(module, node, scope);
    if (!scope.perRequest && FUNCTION_TYPES.has(node.type)) return classifyForwardingFunction(module, node, scope);
    return unguarded;
  }

  return { classifyBinding };
}

const requireRouteAccess = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require every exported API route handler to reach protectedRouteOperation, a recognized guard factory, or a named exception',
      category: 'Security',
    },
    messages: {
      unguardedHandler:
        'Exported {{method}} handler does not reach protectedRouteOperation({ auth, ... }) or a recognized guard factory. Wrap it in protectedRouteOperation. The route access exceptions in eslint.config.mjs name only handlers that predate this rule.',
      unsupportedBinding:
        'Exported {{method}} handler goes through a binding the rule cannot check. Export a single const initialized to the guard, or a function whose only statement returns one, and never reassign it.',
      missingFloor: '{{factory}} needs an inline `auth` floor in its options object.',
      staleException:
        'The route access exceptions list {{method}} for this file, but that handler is guarded or no longer exported. Remove the exception.',
      starExport: 'API route modules must export handlers by name so route access can be checked.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          exceptions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                route: { type: 'string' },
                methods: { type: 'array', items: { enum: [...HTTP_METHODS] }, minItems: 1 },
                access: { enum: ROUTE_ACCESS_KINDS },
              },
              required: ['route', 'methods', 'access'],
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const filename = getContextFilename(context);
    const route = path.relative(context.cwd, filename).replaceAll('\\', '/');
    const exceptedMethods = new Set(
      (context.options[0]?.exceptions ?? [])
        .filter(exception => exception.route === route)
        .flatMap(exception => exception.methods),
    );
    const parser = context.languageOptions.parser;
    const parsedModules = new Map();

    function parseModule(fromFile, source) {
      const file = resolveRelativeModule(fromFile, source);
      if (!file) return null;
      if (!parsedModules.has(file)) {
        const code = fs.readFileSync(file, 'utf8');
        const options = { ecmaVersion: 'latest', sourceType: 'module', filePath: file, jsx: file.endsWith('.tsx') };
        const program = parser.parseForESLint ? parser.parseForESLint(code, options).ast : parser.parse(code, options);
        parsedModules.set(file, { file, ...readModuleBindings(program) });
      }
      return parsedModules.get(file);
    }

    const { classifyBinding } = createRouteGuardClassifier(context.cwd, parseModule);

    return {
      Program(program) {
        const module = { file: filename, ...readModuleBindings(program) };
        if (module.hasStarExport) context.report({ node: program, messageId: 'starExport' });

        const handlerMethods = new Set();
        for (const [method, binding] of module.exports) {
          if (!HTTP_METHODS.has(method)) continue;
          handlerMethods.add(method);
          const verdict = classifyBinding(module, binding, true);
          const reportNode = binding.node ?? program;
          if (verdict.guarded) {
            if (exceptedMethods.has(method)) context.report({ node: reportNode, messageId: 'staleException', data: { method } });
          } else if (verdict.missingFloor) {
            context.report({ node: reportNode, messageId: 'missingFloor', data: { factory: verdict.missingFloor } });
          } else if (!exceptedMethods.has(method)) {
            context.report({ node: reportNode, messageId: verdict.unsupported ? 'unsupportedBinding' : 'unguardedHandler', data: { method } });
          }
        }
        for (const method of exceptedMethods) {
          if (!handlerMethods.has(method)) context.report({ node: program, messageId: 'staleException', data: { method } });
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
    'require-route-access': requireRouteAccess,
  },
  configs: {
    recommended: {
      plugins: ['vercel-guardrails'],
      rules: {
        'vercel-guardrails/no-hardcoded-secrets': 'error',
        'vercel-guardrails/enforce-env-prefix': 'warn',
        'vercel-guardrails/no-unsafe-api-patterns': 'error',
        'vercel-guardrails/require-rate-limit': 'warn',
      },
    },
  },
};
