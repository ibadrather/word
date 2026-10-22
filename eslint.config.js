// ESLint for the page's JavaScript (web/) and the Node scripts the tests run (tests/*.mjs): `make lint`, and
// `make format` fixes what it can. The rules on top of the recommended ones are the javascript-pro skill's.

import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules/", ".venv/", "web/trystero.js"] }, // trystero.js is a bundled library, kept as built
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2024, sourceType: "module" },
    rules: {
      "no-var": "error",
      "prefer-const": "error",
      "no-param-reassign": "error", // a function never changes what it was given
      eqeqeq: ["error", "smart"], // == only against null
      "no-empty": ["error", { allowEmptyCatch: true }], // storage that can't be written is let go on purpose
    },
  },
  { files: ["web/**/*.js"], languageOptions: { globals: globals.browser } },
  { files: ["web/sw.js"], languageOptions: { globals: globals.serviceworker } },
  { files: ["tests/**/*.mjs", "eslint.config.js"], languageOptions: { globals: globals.node } },
];
