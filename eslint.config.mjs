import { builtinModules } from 'node:module';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';
import globals from 'globals';
import codeHygiene from './scripts/eslint-plugins/code-hygiene/index.js';
import { codeCommentFiles, commentExclusions, generatedCommentPaths } from './scripts/lib/comment-scope.mjs';
import vercelGuardrails from './scripts/eslint-plugins/vercel-guardrails/index.js';
import editorGuardrails from './scripts/eslint-plugins/editor-guardrails/index.js';

const nodeBuiltinImport = `^(?:node:|(?:${builtinModules.filter((name) => !name.startsWith('_')).join('|')})(?:/|$))`;

const pureFreezeImports = [
  {
    regex: '(?:^|/)writeFreeze(?:\\.[cm]?[jt]sx?)?$',
    message: 'Import the pure classifier from writeFreezeRefusal instead of the React hook wrapper.',
  },
  {
    regex: '(?:^|/)(?:features/dev/)?components(?:/index)?(?:\\.[cm]?[jt]sx?)?/?$',
    message: 'Import the pure classifier directly from writeFreezeRefusal instead of the components barrel.',
  },
];

const apiRoute = (route, methods, access) => ({ route: `src/app/api/${route}/route.ts`, methods, access });
const routeAccessExceptions = [
  apiRoute('auth/[...nextauth]', ['GET', 'POST'], 'bootstrap'),
  apiRoute('invite/redeem', ['POST'], 'bootstrap'),
  apiRoute('reset-password', ['POST'], 'bootstrap'),
  apiRoute('dev/revalidate-article', ['POST'], 'service'),
  apiRoute('public-cache/revalidate', ['POST'], 'service'),
  apiRoute('dev/screenshot-viewer/session', ['GET'], 'local-fixture'),
  apiRoute('article-feedback', ['POST'], 'intake'),
  apiRoute('csp-report', ['POST'], 'intake'),
  apiRoute('glossary-feedback', ['POST'], 'intake'),
  apiRoute('glossary-feedback/identity', ['GET'], 'intake'),
  apiRoute('site-feedback', ['POST'], 'intake'),
  apiRoute('subscribe', ['OPTIONS', 'POST'], 'intake'),
  apiRoute('trip-report-submissions', ['POST'], 'intake'),
  apiRoute('glossary-usage', ['GET'], 'public'),
  apiRoute('history/[entryId]', ['GET'], 'public'),
  apiRoute('molecules/[slug]', ['GET'], 'public'),
  apiRoute('molecules/classes/[key]', ['GET'], 'public'),
  apiRoute('reagent-proxy', ['OPTIONS', 'GET'], 'public'),
  apiRoute('replications/embed', ['GET'], 'public'),
  apiRoute('replications/gallery', ['GET'], 'public'),
  apiRoute('replications/showcase', ['GET'], 'public'),
  apiRoute('reports', ['GET'], 'public'),
  apiRoute('search-manifest', ['GET'], 'public'),
  apiRoute('search-suggestions', ['GET'], 'public'),
  apiRoute('v1/effects/[slug]/replications', ['OPTIONS', 'GET'], 'public'),
  apiRoute('v1/meta', ['OPTIONS', 'GET'], 'public'),
  apiRoute('v1/molecules/[slug]', ['OPTIONS', 'GET'], 'public'),
  apiRoute('v1/openapi.json', ['OPTIONS', 'GET'], 'public'),
  apiRoute('v1/replications', ['OPTIONS', 'GET'], 'public'),
  apiRoute('v1/replications/[slug]', ['OPTIONS', 'GET'], 'public'),
  apiRoute('v1/substances', ['OPTIONS', 'GET'], 'public'),
  apiRoute('v1/substances/[slug]', ['OPTIONS', 'GET'], 'public'),
  apiRoute('v1/substances/[slug]/reagent-tests', ['OPTIONS', 'GET'], 'public'),
  apiRoute('v1/substances/[slug]/replications', ['OPTIONS', 'GET'], 'public'),
];

const commentOnlyFiles =['*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}', 'scripts/eslint-plugins/**', 'tools/**'];
const existingConfig = tseslint.config(
  {
    ignores: [
      'dist/**',
      'dist-inline/**',
      'coverage/**',
      'public/**',
      'node_modules/**',
      'vendor/**',
      '.next/**',
      '.next-*/**',
      '.local-worktrees/**',
      '.claude/**',
      '.vercel/**',
      'output/**',
      'outputs/**',
      'runs/**',
    ],
  },
  js.configs.recommended,
  {
    rules: {
      'no-useless-assignment': 'off',
      'preserve-caught-error': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'jsx-a11y': jsxA11y,
      'vercel-guardrails': vercelGuardrails,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2020,
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      ...jsxA11y.configs.recommended.rules,

      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],

      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-function': 'off',

      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-role': 'error',
      'jsx-a11y/aria-unsupported-elements': 'error',
      'jsx-a11y/role-has-required-aria-props': 'error',
      'jsx-a11y/role-supports-aria-props': 'error',

      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
      'jsx-a11y/no-noninteractive-element-interactions': 'warn',
      'jsx-a11y/no-noninteractive-tabindex': ['error', { roles: ['tabpanel', 'region'] }],

      'vercel-guardrails/no-hardcoded-secrets': 'error',
      'vercel-guardrails/enforce-env-prefix': ['warn', { framework: 'next' }],
      'vercel-guardrails/no-unsafe-api-patterns': 'error',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: [
      'src/features/dev/**/*.{ts,tsx}',
      'src/features/*/editing/**/*.{ts,tsx}',
      'src/features/contextual-editing/**/*.{ts,tsx}',
      'src/features/editor-launcher/**/*.{ts,tsx}',
      'src/features/replications/viewer/editor/**/*.{ts,tsx}',
      'src/**/*.editor.{ts,tsx}',
    ],
    ignores: [
      'src/**/*.test.{ts,tsx}',
      'src/features/dev/components/ConfirmDialog.tsx',
      'src/features/dev/components/unsavedWork.tsx',
      'src/features/dev/components/useDirtyGuard.tsx',
    ],
    plugins: {
      'editor-guardrails': editorGuardrails,
    },
    rules: {
      'editor-guardrails/use-shared-guard-and-confirm': 'error',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.{ts,tsx}'],
    ...nextPlugin.configs['core-web-vitals'],
    settings: {
      next: { rootDir: '.' },
    },
  },
  {
    files: ['lib/**/*.{js,mjs}'],
    languageOptions: {
      globals: {
        ...globals.node,
        fetch: 'readonly',
      },
    },
  },
  {
    files: ['scripts/**/*.{js,mjs,ts}'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2020,
        fetch: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      'no-control-regex': 'warn',
      'no-empty': 'warn',
      'no-undef': 'off',
      'no-useless-catch': 'warn',
      'no-useless-escape': 'warn',
    },
  },
  {
    files: ['src/app/api/**/*.{ts,tsx}'],
    plugins: {
      'vercel-guardrails': vercelGuardrails,
    },
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2020,
      },
    },
    rules: {
      'vercel-guardrails/no-hardcoded-secrets': 'error',
      'vercel-guardrails/no-unsafe-api-patterns': 'error',
      'vercel-guardrails/require-rate-limit': 'warn',
    },
  },
  {
    files: ['src/app/api/**/route.ts'],
    rules: {
      'vercel-guardrails/require-route-access': ['error', { exceptions: routeAccessExceptions }],
    },
  },
  {
    files: [
      'server/**/*.ts',
      'lib/**/*.ts',
      'src/app/api/**/*.ts',
      'src/features/dev/tools/glossary/glossaryModel.ts',
    ],
    rules: {
      'no-restricted-imports': ['error', { patterns: pureFreezeImports }],
    },
  },
  {
    files: [
      'lib/article/**/*.{ts,mjs}',
      'lib/citations/**/*.{ts,mjs}',
      'lib/generatedPublication/**/*.{ts,mjs}',
      'lib/proposals/**/*.ts',
      'lib/auth/passwordPolicy.ts',
      'lib/auth/usernamePolicy.ts',
      'lib/contributorDirectory.ts',
      'lib/contributorProfileIdentity.ts',
      'lib/curatedOrder.ts',
      'lib/data/publicData.cacheTags.ts',
      'lib/next/analyticsHostPolicy.ts',
      'lib/next/effectIndexLegacyRedirects.ts',
      'lib/next/localeHostPolicy.ts',
      'lib/next/publicCacheContract.ts',
      'lib/next/publicHostPolicy.ts',
      'lib/next/publicationWire.ts',
      'lib/next/r2ImagePolicy.ts',
      'lib/next/replicationEmbedPolicy.ts',
      'lib/next/routeLoadingPolicy.ts',
      'lib/next/statusRecoveryLinks.ts',
      'lib/postgres/runtime/values.ts',
      'lib/translation/coverageReport.ts',
      'lib/translation/glossaryConflicts.ts',
      'lib/translation/reviewInboxTypes.ts',
      'lib/translation/reviewReason.ts',
      'lib/translation/reviewTypes.ts',
      'lib/translation/styleGuideTypes.ts',
      'lib/translation/translatorNoteTypes.ts',
      'lib/translation/uiTranslationTypes.ts',
      'src/features/dev/components/writeFreezeRefusal.ts',
    ],
    ignores: ['**/*.test.{ts,mjs}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          ...pureFreezeImports,
          {
            regex: '^\\.(?:/index(?:\\.[cm]?[jt]sx?)?)?$',
            importNames: ['WRITE_FREEZE_CODE', 'isWriteFreezeRefusal'],
            message: 'Import the pure classifier directly from writeFreezeRefusal instead of the components barrel.',
          },
          {
            regex: '(?:^|/)publicData\\.cache(?:\\.[cm]?[jt]s)?$',
            message: 'Import pure cache tags from publicData.cacheTags instead of the Next cache adapter.',
          },
          {
            regex: '^(?:next|next-auth|@auth)(?:/|$)',
            message: 'Keep Next and Auth.js adapters outside pure contracts. Cache tag imports belong in publicData.cacheTags.',
          },
          {
            regex: '^(?:pg|drizzle-orm)(?:/|$)|(?:^|/)postgres/(?!runtime/values(?:\\.[cm]?[jt]s)?$)',
            message: 'Keep database clients and Postgres runtime adapters outside pure contracts.',
          },
          {
            regex: '(?:^|/)(?:auth/authOptions|server/lib/auth|lib/auth/requireEditorSession)(?:\\.[cm]?[jt]s)?$',
            message: 'Keep session and role checks outside pure contracts. Browser code imports pure contracts.',
          },
          {
            regex: '^server-only$',
            message: 'Pure contracts are imported by browser code. Keep server-only modules out of them.',
          },
          {
            regex: nodeBuiltinImport,
            message: 'Pure contracts are imported by browser code. Keep Node built-ins out of them.',
          },
          {
            regex: '^react(?:/|$)',
            message: 'Keep pure contracts React-free. The write-freeze classifier belongs in writeFreezeRefusal.',
          },
        ],
      }],
    },
  },
);

export default [
  ...existingConfig.map((config) => config.ignores && Object.keys(config).length === 1
    ? config
    : { ...config, ignores: [...(config.ignores ?? []), ...commentOnlyFiles] }),
  {
    files: codeCommentFiles,
    ignores: [...commentExclusions, ...generatedCommentPaths(import.meta.dirname)],
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { 'code-hygiene': codeHygiene },
    rules: { 'code-hygiene/no-comments': 'error' },
  },
];
