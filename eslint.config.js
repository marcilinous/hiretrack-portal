/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  {
    files: ['api/**/*.js', 'js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Browser globals (used in js/ modules)
        window: 'readonly',
        document: 'readonly',
        fetch: 'readonly',
        sessionStorage: 'readonly',
        localStorage: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        AbortController: 'readonly',
        FormData: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        // Browser APIs used in js/ modules
        IntersectionObserver: 'readonly',
        atob: 'readonly',
        location: 'readonly',
        // Global helpers defined in app.js and used across modules
        showToast: 'readonly',
        // Node globals (used in api/ serverless functions)
        process: 'readonly',
        Buffer: 'readonly',
      },
    },
    rules: {
      // Errors
      'no-undef': 'error',
      // caughtErrors:'none' so catch(e) clauses are never flagged for unused e
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-console': 'off',               // console.log/error is fine in serverless
      // null:'ignore' allows the idiomatic `x == null` (checks null AND undefined)
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',

      // Security
      'no-script-url': 'error',

      // Style (non-blocking — formatter handles these, but lint catches drift)
      'prefer-const': 'warn',
      'no-var': 'warn',
      'object-shorthand': 'warn',
    },
  },
];
