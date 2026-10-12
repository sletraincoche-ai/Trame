import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // prototypes/ hold standalone experiments with their own tooling.
    ignores: ["**/dist/**", "**/node_modules/**", "prototypes/**"],
  }
);
