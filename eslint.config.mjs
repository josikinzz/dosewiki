import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';
import globals from 'globals';
import vercelGuardrails from './scripts/eslint-plugins/vercel-guardrails/index.js';
import editorGuardrails from './scripts/eslint-plugins/editor-guardrails/index.js';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'dist-inline/**',
      'coverage/**',
      'public/**',
      'scripts/**/archive/**',
      'node_modules/**',
      '*.config.js',
      '*.config.mjs',
      '*.config.ts',
      'scripts/eslint-plugins/**',
    ],
  },
  js.configs.recommended,
  {
    rules: {
      // Keep ESLint 10 from expanding this upgrade into unrelated existing-code cleanup.
      'no-useless-assignment': 'off',
      'preserve-caught-error': 'off',
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
      // Accessibility rules (WCAG AA compliance)
      ...jsxA11y.configs.recommended.rules,

      // Allow unused vars prefixed with underscore
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],

      // Relax some rules for existing codebase
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-empty-function': 'off',

      // Critical accessibility rules
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-role': 'error',
      'jsx-a11y/aria-unsupported-elements': 'error',
      'jsx-a11y/role-has-required-aria-props': 'error',
      'jsx-a11y/role-supports-aria-props': 'error',

      // Allow certain patterns common in this codebase
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
      'jsx-a11y/no-noninteractive-element-interactions': 'warn',
      // Named scroll regions must be keyboard-focusable for overflow navigation.
      'jsx-a11y/no-noninteractive-tabindex': ['error', { roles: ['tabpanel', 'region'] }],

      // Vercel security guardrails
      'vercel-guardrails/no-hardcoded-secrets': 'error',
      'vercel-guardrails/enforce-env-prefix': ['warn', { framework: 'next' }],
      'vercel-guardrails/no-unsafe-api-patterns': 'error',
    },
  },
  // Hook order and effect dependencies across client components. Only the two
  // classic rules: the React Compiler rules in the plugin's preset are not adopted.
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
  // Dev tools and in-page editors share one unsaved-work guard and one confirm
  // dialog. The shared implementations themselves are the only exemptions.
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
    // Page and document rules describe rendered routes, not unit test fixtures.
    ignores: ['src/**/*.test.{ts,tsx}'],
    ...nextPlugin.configs['core-web-vitals'],
    settings: {
      next: { rootDir: '.' },
    },
  },
  // Server-side JavaScript helpers under /lib run in Node.
  {
    files: ['lib/**/*.{js,mjs}'],
    languageOptions: {
      globals: {
        ...globals.node,
        fetch: 'readonly',
      },
    },
  },
  // Active workflow scripts run in Node or Bun and are linted through npm run lint:scripts.
  {
    files: ['scripts/**/*.{js,mjs,ts}'],
    ignores: ['scripts/**/archive/**'],
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
  // Active App Router API route guardrails.
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
      'vercel-guardrails/validate-function-config': 'warn',
    },
  },
);
