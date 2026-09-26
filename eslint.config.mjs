import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // Reference archives & assets that are not part of the app source.
      "Asset/**",
      "Screenshot/**",
      "medbook-ai-opencode-starter/**",
      ".agents/**",
      ".opencode/**",
      ".kilo/**",
      ".kilocode/**",
      ".vscode/**",
    ],
  },
];

export default eslintConfig;
