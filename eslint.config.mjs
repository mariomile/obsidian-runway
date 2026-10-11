import eslint from '@eslint/js';
import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const obsidianRecommended = obsidianmd.configs.recommended;

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...(Array.isArray(obsidianRecommended) ? obsidianRecommended : [obsidianRecommended]),
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      obsidianmd,
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['error', { allow: ['error', 'warn'] }],
    },
  },
  {
    // node:test suites: top-level test() calls and Node built-ins are expected here.
    files: ['src/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
      'obsidianmd/no-nodejs-modules': 'off',
      'obsidianmd/no-tfile-tfolder-cast': 'off',
    },
  },
  {
    ignores: ['main.js', 'node_modules/**'],
  },
);
