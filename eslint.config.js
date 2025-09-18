// Monitor App ESLint Config
// Extends root config with forensics-specific rules

import rootConfig from "../../eslint.config.js";

export default [
  ...rootConfig,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      // FORENSICS/MONITORING TOOL - Relaxed rules for dynamic data
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off", 
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/consistent-type-assertions": "off",
      
      // Next.js specific
      "@next/next/no-img-element": "warn",
      
      // Allow console for monitoring
      "no-console": "off",
    }
  }
];
