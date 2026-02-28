const prettier = require("eslint-plugin-prettier");

module.exports = [
  {
    ignores: ["node_modules/**", "files/**", "package-lock.json", "html/javascripts/**"],
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "commonjs",
      globals: {
        console: "readonly",
        process: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        require: "readonly",
        module: "readonly",
        exports: "readonly",
        __dirname: "readonly",
        Buffer: "readonly",
      },
    },
    rules: {
      "prettier/prettier": [
        "error",
        {
          singleQuote: false,
          tabWidth: 2,
          semi: true,
          trailingComma: "es5",
          printWidth: 100,
          endOfLine: "lf",
        },
      ],
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: ".*",
        },
      ],
      "no-console": "off",
    },
    plugins: {
      prettier: prettier,
    },
  },
];
