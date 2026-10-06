import js from '@eslint/js'
import typescript from '@typescript-eslint/eslint-plugin'
import typescriptParser from '@typescript-eslint/parser'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import prettier from 'eslint-plugin-prettier'

// Browser/runtime globals used by the app (kept explicit so no extra dependency is needed).
const browserGlobals = {
  console: 'readonly',
  process: 'readonly',
  Buffer: 'readonly',
  global: 'readonly',
  globalThis: 'readonly',
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  location: 'readonly',
  localStorage: 'readonly',
  sessionStorage: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  fetch: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  Blob: 'readonly',
  File: 'readonly',
  FileReader: 'readonly',
  FormData: 'readonly',
  Event: 'readonly',
  CustomEvent: 'readonly',
  AbortController: 'readonly',
  Intl: 'readonly',
  atob: 'readonly',
  btoa: 'readonly',
  alert: 'readonly',
  confirm: 'readonly',
  HTMLElement: 'readonly',
  getComputedStyle: 'readonly',
  ResizeObserver: 'readonly',
  IntersectionObserver: 'readonly',
  structuredClone: 'readonly',
}

// Vitest globals (src/setupTests.ts enables `globals: true` in vite.config.js)
const testGlobals = {
  describe: 'readonly',
  it: 'readonly',
  test: 'readonly',
  expect: 'readonly',
  vi: 'readonly',
  beforeAll: 'readonly',
  beforeEach: 'readonly',
  afterAll: 'readonly',
  afterEach: 'readonly',
}

// Shared by the TS and JS blocks: plugins, settings and the rules common to both.
const reactBase = {
  plugins: {
    react: react,
    'react-hooks': reactHooks,
    prettier: prettier,
  },
  rules: {
    ...react.configs.recommended.rules,
    ...reactHooks.configs.recommended.rules,

    // Prettier integration. The source was never run through prettier (printWidth 80 in
    // .prettierrc), so enforcing it reports ~16000 formatting errors and drowns the real
    // rules: it is off until a repo-wide "prettier --write" is done, then set it to
    // ['error', { endOfLine: 'auto' }] ('auto' keeps either line ending, so a Windows
    // autocrlf checkout is not reported as one error per line).
    'prettier/prettier': 'off',

    // React specific
    'react/react-in-jsx-scope': 'off', // Not needed in React 17+
    'react/prop-types': 'off', // Using TypeScript for prop validation
    'react/jsx-uses-react': 'off',
    'react/jsx-uses-vars': 'error',

    // General
    'no-console': 'warn',
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
}

export default [
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: { ...browserGlobals, ...testGlobals },
    },
    plugins: {
      ...reactBase.plugins,
      '@typescript-eslint': typescript,
    },
    rules: {
      ...typescript.configs.recommended.rules,
      ...reactBase.rules,

      // TypeScript already reports undefined identifiers (and knows the DOM types)
      'no-undef': 'off',

      // TypeScript specific
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',

      // General
      'no-debugger': 'error',
      'prefer-const': 'error',
    },
    settings: reactBase.settings,
  },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: { ...browserGlobals, ...testGlobals },
    },
    plugins: reactBase.plugins,
    rules: reactBase.rules,
    settings: reactBase.settings,
  },
  {
    ignores: [
      'dist/',
      'build/',
      'node_modules/',
      '*.config.js',
      '*.config.ts',
      'public/',
    ],
  },
]
