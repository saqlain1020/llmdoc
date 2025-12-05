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
  includeImports: z.boolean().optional(),
  additionalFiles: z.array(z.string()).optional(),
  importDepth: z.number().min(0).max(5).optional(),
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
  prompt: `You are a technical documentation expert generating markdown documentation for TypeScript source files.

CRITICAL OUTPUT RULES:
- Output ONLY valid markdown content, nothing else
- Do NOT include any preamble like "Here is the documentation" or "Sure, here's..."
- Do NOT wrap the output in markdown code blocks (\`\`\`markdown)
- Start directly with the markdown content (e.g., start with # heading)
- The output will be saved directly to a .md file

Include in the documentation:
- Overview of the module/file purpose
- Exported functions, classes, and interfaces with descriptions
- Parameters and return types explained
- Usage examples where appropriate
- Any important notes or caveats

## Architecture & Flow Diagrams

Create ASCII/text-based diagrams inside code blocks to visualize the code structure:

1. **Architecture Diagram** - Show module structure:
\`\`\`
┌─────────────────────────────────────────┐
│              Module Name                │
├─────────────────────────────────────────┤
│  ┌──────────┐      ┌──────────┐        │
│  │Component │ ───► │Component │        │
│  └──────────┘      └──────────┘        │
└─────────────────────────────────────────┘
\`\`\`

2. **Data Flow Diagram** - Show how data moves:
\`\`\`
Input ──► [Process] ──► [Transform] ──► Output
              │
              ▼
         [Side Effect]
\`\`\`

3. **Dependency Tree** - Show file/module dependencies:
\`\`\`
src/
├── index.ts
│   ├── imports: config.ts
│   └── imports: utils.ts
└── utils.ts
    └── imports: types.ts
\`\`\`

4. **Flow Chart** - Show logic flow:
\`\`\`
    ┌─────────┐
    │  Start  │
    └────┬────┘
         │
    ┌────▼────┐
    │ Check   │──── No ────►┌─────────┐
    │Condition│             │ Handle  │
    └────┬────┘             └─────────┘
         │ Yes
    ┌────▼────┐
    │ Process │
    └────┬────┘
         │
    ┌────▼────┐
    │   End   │
    └─────────┘
\`\`\`

Format with clean markdown, proper headings, and include at least one diagram that helps visualize the code structure.`,
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
