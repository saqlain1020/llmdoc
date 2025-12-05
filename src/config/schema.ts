import { z } from "zod";

/**
 * Zod schema for LLM provider validation
 */
export const llmProviderSchema = z.enum(["openai", "anthropic", "google-genai"]);

/**
 * Zod schema for LLM configuration
 */
export const llmConfigSchema = z.object({
  provider: llmProviderSchema,
  model: z.string().min(1, "Model name is required"),
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().optional(),
});

/**
 * Zod schema for subfolder configuration
 */
export const subfolderConfigSchema = z.object({
  path: z.string().min(1, "Subfolder path is required"),
  prompt: z.string().optional(),
  outputPath: z.string().optional(),
  existingDocs: z.string().optional(),
});

/**
 * Zod schema for the main llmdoc configuration
 */
export const llmDocConfigSchema = z.object({
  llm: llmConfigSchema,
  prompt: z.string().optional(),
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
  subfolders: z.array(subfolderConfigSchema).optional(),
  outputDir: z.string().optional(),
});

/**
 * Type inference from Zod schema
 */
export type LLMDocConfigSchema = z.infer<typeof llmDocConfigSchema>;

/**
 * Default configuration values
 */
export const defaultConfig = {
  include: ["**/*.ts", "**/*.tsx"],
  exclude: [
    "node_modules/**",
    "dist/**",
    "build/**",
    "**/*.test.ts",
    "**/*.spec.ts",
    "**/*.test.tsx",
    "**/*.spec.tsx",
    "**/*.d.ts",
  ],
  outputDir: "docs/",
  prompt: `You are a technical documentation expert. Analyze the following TypeScript source files and generate comprehensive markdown documentation.

Include:
- Overview of the module/file purpose
- Exported functions, classes, and interfaces with descriptions
- Parameters and return types explained
- Usage examples where appropriate
- Any important notes or caveats

Format the documentation in clean, readable markdown with proper headings and code blocks.`,
};

/**
 * Validate and merge config with defaults
 */
export function validateConfig(config: unknown): LLMDocConfigSchema {
  const parsed = llmDocConfigSchema.parse(config);
  return {
    ...parsed,
    include: parsed.include ?? defaultConfig.include,
    exclude: parsed.exclude ?? defaultConfig.exclude,
    outputDir: parsed.outputDir ?? defaultConfig.outputDir,
    prompt: parsed.prompt ?? defaultConfig.prompt,
  };
}
