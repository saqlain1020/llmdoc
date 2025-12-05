#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { resolve } from "node:path";
import { loadConfig } from "./config/index.js";
import { scanProject } from "./scanner/index.js";
import { createLLMService } from "./llm/index.js";
import { createGenerator } from "./generator/index.js";
import type { Logger, CLIOptions } from "./types.js";

// Re-export for programmatic API usage
export { defineConfig } from "./config/index.js";
export { loadConfig } from "./config/index.js";
export { scanProject } from "./scanner/index.js";
export { createLLMService, LLMService } from "./llm/index.js";
export { createGenerator, DocumentationGenerator } from "./generator/index.js";
export {
  estimateTokens,
  getTokenEstimate,
  formatTokenEstimate,
  aggregateEstimates,
  MODEL_PRICING,
} from "./utils/tokens.js";
export type {
  LLMDocConfig,
  LLMConfig,
  SubfolderConfig,
  CLIOptions,
  IndexedFile,
  ScanResult,
  GeneratedDoc,
} from "./types.js";
export type { TokenEstimate } from "./utils/tokens.js";

/**
 * Package version
 */
const VERSION = "0.1.0";

/**
 * Create a logger with optional verbose mode
 */
function createLogger(verbose: boolean): Logger {
  return {
    info: (message: string) => console.log(chalk.blue("ℹ"), message),
    success: (message: string) => console.log(chalk.green("✓"), message),
    warn: (message: string) => console.log(chalk.yellow("⚠"), message),
    error: (message: string) => console.error(chalk.red("✗"), message),
    debug: (message: string) => {
      if (verbose) {
        console.log(chalk.gray("⋮"), chalk.gray(message));
      }
    },
  };
}

/**
 * Main CLI execution
 */
async function run(options: CLIOptions): Promise<void> {
  const logger = createLogger(options.verbose ?? false);
  const rootDir = resolve(options.root ?? process.cwd());

  logger.info(`LLMDoc v${VERSION}`);
  logger.debug(`Root directory: ${rootDir}`);

  try {
    // Load configuration
    logger.info("Loading configuration...");
    const config = await loadConfig(rootDir, options.config, logger);
    logger.success("Configuration loaded");

    // Scan project files
    logger.info("Scanning project files...");
    const scanResult = await scanProject(rootDir, config.include!, config.exclude!, config.subfolders, logger);
    logger.success(`Found ${scanResult.files.length} files`);

    if (scanResult.files.length === 0) {
      logger.warn("No files found to process. Check your include/exclude patterns.");
      return;
    }

    // Create LLM service (skip in dry-run mode)
    let llmService: ReturnType<typeof createLLMService> | null = null;

    if (!options.dryRun) {
      logger.info(`Initializing ${config.llm.provider} LLM...`);
      llmService = createLLMService(config.llm, logger);
      logger.success("LLM service initialized");
    } else {
      logger.info(`[DRY RUN] Skipping LLM initialization`);
    }

    // Generate documentation
    const generator = createGenerator(llmService!, config, rootDir, logger, options.dryRun);

    logger.info("Generating documentation...");
    const docs = await generator.generate(scanResult);

    // Summary
    logger.success(`Generated ${docs.length} documentation file(s)`);

    if (options.dryRun) {
      logger.info(chalk.yellow("[DRY RUN] No files were written"));
    }

    for (const doc of docs) {
      logger.info(`  → ${doc.outputPath} (${doc.sourceFiles.length} source files)`);
    }

    logger.success("Documentation generation complete!");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(message);
    process.exit(1);
  }
}

/**
 * Initialize CLI
 */
function initCLI(): void {
  const program = new Command();

  program
    .name("llmdoc")
    .description("Generate documentation for your TypeScript project using LLMs")
    .version(VERSION)
    .option("-c, --config <path>", "Path to config file (default: llmdoc.config.ts)")
    .option("-r, --root <path>", "Project root directory (default: current directory)")
    .option("-d, --dry-run", "Preview without making LLM calls or writing files")
    .option("-v, --verbose", "Enable verbose logging")
    .action(async (opts) => {
      const options: CLIOptions = {
        config: opts.config,
        root: opts.root,
        dryRun: opts.dryRun,
        verbose: opts.verbose,
      };
      await run(options);
    });

  program
    .command("init")
    .description("Create a sample llmdoc.config.ts file")
    .action(() => {
      const logger = createLogger(false);
      const sampleConfig = `import { defineConfig } from 'llmdoc';

export default defineConfig({
  llm: {
    provider: 'openai',
    model: 'gpt-4o',
    // apiKey: 'your-api-key', // Or use OPENAI_API_KEY env var
  },
  
  // Custom prompt for documentation generation (optional - has good defaults with diagram generation)
  // prompt: \`Your custom prompt here...\`,
  
  // File patterns
  include: ['src/**/*.ts'],
  exclude: ['**/*.test.ts', '**/*.spec.ts', 'node_modules/**', 'dist/**'],
  
  // Subfolder configurations for separate LLM context
  subfolders: [
    // {
    //   path: 'src/api',
    //   prompt: 'Generate API documentation...',
    //   outputPath: 'src/api/README.md',
    //   existingDocs: 'src/api/README.md',
    //   
    //   // Include files imported by this subfolder for context (default: true)
    //   includeImports: true,
    //   
    //   // How deep to resolve nested imports (default: 2)
    //   importDepth: 2,
    //   
    //   // Additional files to include for context (glob patterns)
    //   additionalFiles: ['src/types/**/*.ts', 'src/utils/helpers.ts'],
    // },
  ],
  
  // Fallback output directory for ungrouped files
  outputDir: 'docs/',
});
`;

      const fs = require("node:fs");
      const path = require("node:path");
      const configPath = path.resolve(process.cwd(), "llmdoc.config.ts");

      if (fs.existsSync(configPath)) {
        logger.error("llmdoc.config.ts already exists");
        process.exit(1);
      }

      fs.writeFileSync(configPath, sampleConfig);
      logger.success("Created llmdoc.config.ts");
      logger.info("Edit the config file to customize your documentation generation");
    });

  program.parse();
}

// Run CLI if this is the main module
const isMain =
  process.argv[1]?.includes("llmdoc") ||
  process.argv[1]?.endsWith("index.mjs") ||
  process.argv[1]?.endsWith("index.js");

if (isMain) {
  initCLI();
}
