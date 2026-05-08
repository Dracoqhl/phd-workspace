module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  env: {
    node: true,
    es2022: true,
    browser: true
  },
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module"
  },
  ignorePatterns: [
    ".next/",
    "node_modules/",
    "coverage/",
    "dist/",
    "build/",
    "next-env.d.ts",
    "tsconfig.tsbuildinfo"
  ]
};
