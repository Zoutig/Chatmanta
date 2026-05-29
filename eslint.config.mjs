import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // lib/errors is fundamenteel en mag NIET afhangen van de admin/v0-laag —
  // capture loopt via de observability-sink (getSink), niet via een directe
  // import van error-capture/controlroom (zou een layering-inversie zijn).
  {
    files: ['lib/errors/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/lib/controlroom/*', '@/lib/controlroom/**', '@/lib/v0/server/error-capture'],
              message:
                'lib/errors mag niet afhangen van de admin/v0-laag — gebruik @/lib/observability/sink (getSink).',
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
