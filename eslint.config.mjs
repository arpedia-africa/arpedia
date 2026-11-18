// Shared flat config. Packages run `eslint .` and pick this up from the repo root.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.expo/**',
      '**/.wrangler/**',
      '**/.turbo/**',
      '**/android/**',
      '**/ios/**',
      '**/*.d.ts',
      '**/database.types.ts',
      'prototype/**',
      'admin/**',
      'tools/*.mjs',
      'tools/*.ps1',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['**/*.cjs', '**/*.config.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  prettier,
);
