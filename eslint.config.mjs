// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', '.tsbuildinfo/**', 'client/**'],
  },

  // Base JS rules, then the full type-checked TypeScript rule sets.
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // Plain JS files (tooling configs) must not require type information.
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...tseslint.configs.disableTypeChecked,
  },

  // Type-aware linting is powered by the project's tsconfig.
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    rules: {
      'no-console': 'error',

      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],

      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowDirectConstAssertionInArrowFunctions: true,
        },
      ],

      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],

      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'class', format: ['PascalCase'] },
        {
          selector: 'interface',
          format: ['PascalCase'],
          custom: { regex: '^I[A-Z]', match: false },
        },
        { selector: 'typeLike', format: ['PascalCase'] },
        { selector: 'enumMember', format: ['PascalCase'] },
        // Imports keep the casing of the symbol they come from (Fastify, Redis…).
        { selector: 'import', format: ['camelCase', 'PascalCase', 'UPPER_CASE'] },
        // PascalCase covers zod schema constants such as IngestEventSchema.
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
          leadingUnderscore: 'allow',
        },
        { selector: 'function', format: ['camelCase'], leadingUnderscore: 'allow' },
        { selector: 'parameter', format: ['camelCase'], leadingUnderscore: 'allow' },
        // Property names mirror external contracts (env vars, JSON keys, generics).
        { selector: 'objectLiteralProperty', format: null },
        { selector: 'typeProperty', format: null },
        { selector: 'default', format: ['camelCase'], leadingUnderscore: 'allow' },
      ],
    },
  },

  // The bootstrap entry point may report fatal errors before pino exists.
  {
    files: ['src/main.ts'],
    rules: { 'no-console': 'off' },
  },

  // ErrorInfo must stay a type alias so it gains an implicit index signature
  // and can be passed wherever LogContext (Record<string, unknown>) is expected.
  {
    files: ['src/shared/errors.ts'],
    rules: { '@typescript-eslint/consistent-type-definitions': 'off' },
  },

  // Test doubles implement async ports synchronously; require-await is noise there.
  {
    files: ['tests/**/*.ts'],
    rules: { '@typescript-eslint/require-await': 'off' },
  },

  // Prettier must win every formatting dispute.
  prettier,
);
