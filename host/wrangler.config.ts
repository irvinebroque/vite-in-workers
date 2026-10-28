import { defineWranglerConfig } from "wrangler/experimental-config";
export default defineWranglerConfig({
  noBundle: true,
  findAdditionalModules: true,
  rules: [
    { type: "Text", globs: ["**/*.txt"], fallthrough: false },
    { type: "Data", globs: ["**/*.bin"], fallthrough: false }
  ]
});
