// ESLint for the page's JavaScript (web/) and the Node scripts the tests run (tests/*.mjs).

import js from "@eslint/js";
import globals from "globals";

export default [
  // Trystero, bundled and minified as it came (see the top of the file)
  { ignores: ["web/trystero.js"] },
  js.configs.recommended,
  {
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules: {
      eqeqeq: ["error", "always", { null: "ignore" }], // `== null` is the one loose check: null or undefined
      "no-empty": ["error", { allowEmptyCatch: true }], // a storage that throws (private mode) is ignored on purpose
      "no-implicit-coercion": "error",
      "no-lonely-if": "error",
      "no-param-reassign": "error",
      "no-shadow": ["error", { hoist: "never" }],
      "no-unused-expressions": ["error", { allowShortCircuit: true }],
      "no-useless-concat": "error",
      "no-useless-return": "error",
      "no-var": "error",
      "object-shorthand": "error",
      "prefer-arrow-callback": "error",
      "prefer-const": "error",
      "prefer-object-has-own": "error",
      "prefer-template": "error",
    },
  },
  // The page's modules, in the browser
  { files: ["web/**/*.js"], languageOptions: { globals: globals.browser } },
  // The service worker is a classic script, not a module
  { files: ["web/sw.js"], languageOptions: { sourceType: "script", globals: globals.serviceworker } },
  { files: ["tests/**/*.mjs", "eslint.config.js"], languageOptions: { globals: globals.node } },
];
