module.exports = {
  root: true,
  env: {
    node: true,
    es2021: true,
  },
  extends: ['airbnb-base'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
    'import/extensions': 'off',
    'import/prefer-default-export': 'off',
    'class-methods-use-this': 'off',
    'no-param-reassign': 'off',
    'no-underscore-dangle': 'off',
    'no-bitwise': 'off',
    'no-plusplus': 'off',
    camelcase: 'off',
  },
  overrides: [
    {
      files: ['*.js', '*.ts'],
      rules: {
        'max-len': [
          'error',
          {
            code: 100, // Keep inherited setting (adjust if different)
            comments: 200, // Override ONLY for comments
            ignoreUrls: true, // Keep other inherited settings
            ignoreStrings: true, // Keep inherited behavior
            ignoreTemplateLiterals: true, // Keep inherited behavior
          },
        ],
      },
    },
  ],
};
