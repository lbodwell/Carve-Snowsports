import { tanstackConfig } from "@tanstack/eslint-config";

export default [
  {
    ignores: [
      ".output/**",
      ".nitro/**",
      "coverage/**",
      "node_modules/**",
      ".tmp/**",
      ".local-imports/**",
      "eslint.config.js",
      "prettier.config.js",
    ],
  },
  ...tanstackConfig,
];
