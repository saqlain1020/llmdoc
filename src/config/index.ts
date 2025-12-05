// Re-export config utilities for public API
export { loadConfig, findConfigFile, defineConfig } from "./loader.js";
export { validateConfig, defaultConfig, llmDocConfigSchema } from "./schema.js";
export type { LLMDocConfigSchema } from "./schema.js";
