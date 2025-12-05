import { createJiti } from "jiti";
import { existsSync, readFileSync } from "node:fs";
import { resolve, extname } from "node:path";
import { validateConfig, type LLMDocConfigSchema } from "./schema.js";
import type { Logger } from "../types.js";

/**
 * Default config file names to search for
 */
const CONFIG_FILES = ["llmdoc.config.ts", "llmdoc.config.js", "llmdoc.config.mjs", "llmdoc.config.json"];

/**
 * Load configuration from a TypeScript file using jiti
 */
async function loadTsConfig(configPath: string): Promise<unknown> {
  const jiti = createJiti(import.meta.url, {
    interopDefault: true,
  });

  const module = await jiti.import(configPath);

  // Handle default export
  if (module && typeof module === "object" && "default" in module) {
    return (module as { default: unknown }).default;
  }

  return module;
}

/**
 * Load configuration from a JSON file
 */
function loadJsonConfig(configPath: string): unknown {
  const content = readFileSync(configPath, "utf-8");
  return JSON.parse(content);
}

/**
 * Find the config file in the project root
 */
export function findConfigFile(rootDir: string, customPath?: string): string | null {
  // If custom path provided, use it
  if (customPath) {
    const fullPath = resolve(rootDir, customPath);
    if (existsSync(fullPath)) {
      return fullPath;
    }
    return null;
  }

  // Search for default config files
  for (const configFile of CONFIG_FILES) {
    const fullPath = resolve(rootDir, configFile);
    if (existsSync(fullPath)) {
      return fullPath;
    }
  }

  return null;
}

/**
 * Load and validate the configuration file
 */
export async function loadConfig(rootDir: string, customPath?: string, logger?: Logger): Promise<LLMDocConfigSchema> {
  const configPath = findConfigFile(rootDir, customPath);

  if (!configPath) {
    const searchedFiles = customPath ? [customPath] : CONFIG_FILES;
    throw new Error(
      `No config file found. Searched for: ${searchedFiles.join(", ")}\n` +
        `Create a llmdoc.config.ts file in your project root.`
    );
  }

  logger?.debug(`Loading config from: ${configPath}`);

  const ext = extname(configPath).toLowerCase();
  let rawConfig: unknown;

  try {
    if (ext === ".json") {
      rawConfig = loadJsonConfig(configPath);
    } else {
      // .ts, .js, .mjs files
      rawConfig = await loadTsConfig(configPath);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load config file: ${message}`);
  }

  try {
    const config = validateConfig(rawConfig);
    logger?.debug("Config validated successfully");
    return config;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid config: ${message}`);
  }
}

/**
 * Helper function to define config with type safety
 * This can be exported for users to use in their config files
 */
export function defineConfig(config: LLMDocConfigSchema): LLMDocConfigSchema {
  return config;
}
