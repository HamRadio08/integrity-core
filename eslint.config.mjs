import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Destructure-to-omit is load-bearing here, not dead code:
      //   const { barsByCandidate: _bars, ...run } = bundle;
      // drops a key from the public payload. Without ignoreRestSiblings the binding
      // reads as an unused variable, and "delete the unused var" would silently leak
      // barsByCandidate back into publicRun(). Underscore prefix stays the signal for
      // a deliberately-unused binding.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          ignoreRestSiblings: true,
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
]);

export default eslintConfig;
