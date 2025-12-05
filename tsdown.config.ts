import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "config/index": "src/config/index.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  // Don't bundle dependencies - they should be installed
  external: [
    "@langchain/openai",
    "@langchain/anthropic",
    "@langchain/google-genai",
    "@langchain/core",
    "langchain",
    "commander",
    "chalk",
    "glob",
    "zod",
    "jiti",
  ],
});
