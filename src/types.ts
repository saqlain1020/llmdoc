/**
 * LLM Provider types supported by llmdoc
 */
export type LLMProvider = "openai" | "anthropic" | "google-genai";

/**
 * LLM configuration options
 */
export interface LLMConfig {
  /** The LLM provider to use */
  provider: LLMProvider;
  /** Model name (e.g., 'gpt-4', 'claude-3-opus', 'gemini-pro') */
  model: string;
  /** API key - falls back to environment variables if not provided */
  apiKey?: string;
  /** Custom base URL for API endpoint */
  baseUrl?: string;
  /** Temperature for generation (0-1) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
}

/**
 * Subfolder configuration for separate LLM context management
 */
export interface SubfolderConfig {
  /** Path to the subfolder relative to project root */
  path: string;
  /** Custom prompt override for this subfolder */
  prompt?: string;
  /** Output path for generated docs - defaults to the subfolder itself */
  outputPath?: string;
  /** Path to existing documentation to update */
  existingDocs?: string;
  /** Whether to include files that are imported by files in this subfolder (default: true) */
  includeImports?: boolean;
  /** Additional file paths or glob patterns to include for context */
  additionalFiles?: string[];
  /** Maximum depth for resolving nested imports (default: 2) */
  importDepth?: number;
}

/**
 * Main configuration interface for llmdoc
 */
export interface LLMDocConfig {
  /** LLM provider configuration */
  llm: LLMConfig;
  /** Global prompt template for documentation generation */
  prompt?: string;
  /** Glob patterns for files to include (default: ['**\/*.ts', '**\/*.tsx']) */
  include?: string[];
  /** Glob patterns for files to exclude (default: ['node_modules/**', 'dist/**', '**\/*.test.ts', '**\/*.spec.ts']) */
  exclude?: string[];
  /** Subfolder configurations for separate LLM calls */
  subfolders?: SubfolderConfig[];
  /** Fallback output directory (default: 'docs/') */
  outputDir?: string;
}

/**
 * Indexed file with path and content
 */
export interface IndexedFile {
  /** Relative path from project root */
  path: string;
  /** File content */
  content: string;
  /** Directory the file belongs to */
  directory: string;
}

/**
 * Result of scanning a project
 */
export interface ScanResult {
  /** All indexed files */
  files: IndexedFile[];
  /** Files grouped by subfolder config */
  grouped: Map<SubfolderConfig, IndexedFile[]>;
  /** Files not belonging to any configured subfolder */
  ungrouped: IndexedFile[];
}

/**
 * Generated documentation result
 */
export interface GeneratedDoc {
  /** Path where the doc should be saved */
  outputPath: string;
  /** Generated markdown content */
  content: string;
  /** Source files that were used to generate this doc */
  sourceFiles: string[];
}

/**
 * CLI options passed from command line
 */
export interface CLIOptions {
  /** Path to config file */
  config?: string;
  /** Dry run mode - preview without LLM calls */
  dryRun?: boolean;
  /** Verbose logging */
  verbose?: boolean;
  /** Project root directory */
  root?: string;
}

/**
 * Logger interface for consistent logging
 */
export interface Logger {
  info: (message: string) => void;
  success: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
  debug: (message: string) => void;
}
