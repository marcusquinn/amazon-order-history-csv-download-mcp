module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    project: "./tsconfig.json",
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier",
  ],
  env: {
    node: true,
    es2022: true,
  },
  rules: {
    // TypeScript handles these
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],

    // Allow explicit any in some cases (we use Zod for runtime validation)
    "@typescript-eslint/no-explicit-any": "warn",

    // Require return types on functions
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/explicit-module-boundary-types": "off",

    // Allow non-null assertions when we know better
    "@typescript-eslint/no-non-null-assertion": "warn",

    // Console is fine for MCP server logging
    "no-console": "off",
  },
  ignorePatterns: [
    "dist/",
    "node_modules/",
    "coverage/",
    "*.js",
    "!.eslintrc.js",
  ],
};
