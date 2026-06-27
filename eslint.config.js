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
        // Node globals (used in api/ serverless functions)
        process: 'readonly',
        Buffer: 'readonly',
      },
    },
    rules: {
      // Errors
      'no-undef': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',               // console.log/error is fine in serverless
      'eqeqeq': ['error', 'always'],
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
