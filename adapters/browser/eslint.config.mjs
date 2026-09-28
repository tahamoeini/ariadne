import tseslint from '../../node_modules/@typescript-eslint/eslint-plugin/dist/index.js';
import tsparser from '../../node_modules/@typescript-eslint/parser/dist/index.js';

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' }
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-throw-literal': 'warn',
      semi: 'warn',
      curly: 'warn',
      eqeqeq: 'warn'
    }
  },
  { ignores: ['out/', 'node_modules/'] }
];
