import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import type { LLMDocConfigSchema } from "../config/schema.js";
import type { IndexedFile, SubfolderConfig, GeneratedDoc, Logger, ScanResult } from "../types.js";
import { LLMService } from "../llm/index.js";
import { formatFilesForLLM, getFilesSummary, resolveImportsForFiles, loadAdditionalFiles } from "../scanner/index.js";
import { getTokenEstimate, formatTokenEstimate, aggregateEstimates, type TokenEstimate } from "../utils/tokens.js";

/**
 * Read existing documentation file if it exists
 */
function readExistingDoc(rootDir: string, docPath: string): string | undefined {
  const fullPath = resolve(rootDir, docPath);
  if (existsSync(fullPath)) {
    return readFileSync(fullPath, "utf-8");
  }
  return undefined;
}

/**
 * Write documentation to file
 */
function writeDoc(rootDir: string, outputPath: string, content: string, logger?: Logger): void {
  const fullPath = resolve(rootDir, outputPath);
  const dir = dirname(fullPath);

  // Ensure directory exists
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    logger?.debug(`Created directory: ${dir}`);
  }

  writeFileSync(fullPath, content, "utf-8");
  logger?.success(`Written: ${outputPath}`);
}

/**
 * Format files with context separation for LLM
 */
function formatFilesWithContext(mainFiles: IndexedFile[], contextFiles: IndexedFile[]): string {
  let content = "";

  if (mainFiles.length > 0) {
    content += "# Main Source Files\n\nThese are the primary files to document:\n\n";
    content += formatFilesForLLM(mainFiles);
  }

  if (contextFiles.length > 0) {
    content += "\n\n---\n\n# Context Files (Imports & Dependencies)\n\n";
    content +=
      "These files are imported/used by the main files. Use them for context to understand types, interfaces, and dependencies:\n\n";
    content += formatFilesForLLM(contextFiles);
  }

  return content;
}

/**
 * Result of generating subfolder doc with estimates
 */
interface SubfolderDocResult {
  doc: GeneratedDoc | null;
  estimate?: TokenEstimate;
}

/**
 * Generate documentation for a subfolder
 */
async function generateSubfolderDoc(
  llmService: LLMService | null,
  rootDir: string,
  subfolder: SubfolderConfig,
  files: IndexedFile[],
  allFiles: IndexedFile[],
  globalPrompt: string,
  exclude: string[],
  model?: string,
  logger?: Logger,
  dryRun?: boolean
): Promise<SubfolderDocResult> {
  if (files.length === 0) {
    logger?.warn(`No files found in subfolder: ${subfolder.path}`);
    return { doc: null };
  }

  const prompt = subfolder.prompt ?? globalPrompt;
  const outputPath = subfolder.outputPath ?? `${subfolder.path}/README.md`;
  const existingDocs = subfolder.existingDocs
    ? readExistingDoc(rootDir, subfolder.existingDocs)
    : readExistingDoc(rootDir, outputPath);

  // Resolve imports if enabled (default: true)
  const includeImports = subfolder.includeImports !== false;
  const importDepth = subfolder.importDepth ?? 2;
  let contextFiles: IndexedFile[] = [];

  if (includeImports) {
    logger?.debug(`Resolving imports for subfolder: ${subfolder.path} (depth: ${importDepth})`);
    const importedFiles = resolveImportsForFiles(files, allFiles, rootDir, importDepth, logger);

    // Filter out files that are already in the main files
    const mainFilePaths = new Set(files.map((f) => f.path));
    contextFiles = importedFiles.filter((f) => !mainFilePaths.has(f.path));

    if (contextFiles.length > 0) {
      logger?.info(`Found ${contextFiles.length} imported files for context`);
    }
  }

  // Load additional files if specified
  if (subfolder.additionalFiles && subfolder.additionalFiles.length > 0) {
    const existingPaths = new Set([...files.map((f) => f.path), ...contextFiles.map((f) => f.path)]);
    const additionalFiles = await loadAdditionalFiles(
      rootDir,
      subfolder.additionalFiles,
      exclude,
      existingPaths,
      logger
    );

    if (additionalFiles.length > 0) {
      logger?.info(`Added ${additionalFiles.length} additional context files`);
      contextFiles = [...contextFiles, ...additionalFiles];
    }
  }

  const totalFiles = files.length + contextFiles.length;
  logger?.info(
    `Processing subfolder: ${subfolder.path} (${files.length} main + ${contextFiles.length} context = ${totalFiles} files)`
  );

  const filesContent = contextFiles.length > 0 ? formatFilesWithContext(files, contextFiles) : formatFilesForLLM(files);

  // Calculate full input content for token estimation
  const fullInput = prompt + "\n\n" + filesContent + (existingDocs ? "\n\n" + existingDocs : "");
  const estimate = getTokenEstimate(fullInput, model, true);

  if (dryRun) {
    logger?.info(`[DRY RUN] Would generate docs for:`);
    logger?.info("Main files:");
    logger?.info(getFilesSummary(files));
    if (contextFiles.length > 0) {
      logger?.info("Context files (imports & additional):");
      logger?.info(getFilesSummary(contextFiles));
    }
    logger?.info("Token estimate:");
    logger?.info(formatTokenEstimate(estimate, model));

    return {
      doc: {
        outputPath,
        content: "[DRY RUN - No content generated]",
        sourceFiles: [...files, ...contextFiles].map((f) => f.path),
      },
      estimate,
    };
  }

  const content = await llmService!.generateDocumentation(prompt, filesContent, existingDocs);

  return {
    doc: {
      outputPath,
      content,
      sourceFiles: [...files, ...contextFiles].map((f) => f.path),
    },
    estimate,
  };
}

/**
 * Result of generating ungrouped docs with estimates
 */
interface UngroupedDocResult {
  doc: GeneratedDoc | null;
  estimate?: TokenEstimate;
}

/**
 * Generate documentation for ungrouped files
 */
async function generateUngroupedDocs(
  llmService: LLMService | null,
  rootDir: string,
  files: IndexedFile[],
  outputDir: string,
  prompt: string,
  model?: string,
  logger?: Logger,
  dryRun?: boolean
): Promise<UngroupedDocResult> {
  if (files.length === 0) {
    logger?.debug("No ungrouped files to process");
    return { doc: null };
  }

  const outputPath = `${outputDir}/api-reference.md`;
  const existingDocs = readExistingDoc(rootDir, outputPath);
  const filesContent = formatFilesForLLM(files);

  // Calculate token estimate
  const fullInput = prompt + "\n\n" + filesContent + (existingDocs ? "\n\n" + existingDocs : "");
  const estimate = getTokenEstimate(fullInput, model, true);

  logger?.info(`Processing ungrouped files (${files.length} files)`);

  if (dryRun) {
    logger?.info(`[DRY RUN] Would generate API reference for:`);
    logger?.info(getFilesSummary(files));
    logger?.info("Token estimate:");
    logger?.info(formatTokenEstimate(estimate, model));
    return {
      doc: {
        outputPath,
        content: "[DRY RUN - No content generated]",
        sourceFiles: files.map((f) => f.path),
      },
      estimate,
    };
  }

  const content = await llmService!.generateApiReference(prompt, filesContent, existingDocs);
  return {
    doc: {
      outputPath,
      content,
      sourceFiles: files.map((f) => f.path),
    },
    estimate,
  };
}

/**
 * Result of generating README with estimates
 */
interface ReadmeDocResult {
  doc: GeneratedDoc;
  estimate: TokenEstimate;
}

/**
 * Generate or update the main README.md
 */
async function generateReadme(
  llmService: LLMService | null,
  rootDir: string,
  allFiles: IndexedFile[],
  prompt: string,
  model?: string,
  logger?: Logger,
  dryRun?: boolean
): Promise<ReadmeDocResult> {
  const projectName = basename(rootDir);
  const outputPath = "README.md";
  const existingReadme = readExistingDoc(rootDir, outputPath);
  const filesContent = formatFilesForLLM(allFiles);

  // Calculate token estimate
  const fullInput = prompt + "\n\n" + filesContent + (existingReadme ? "\n\n" + existingReadme : "");
  const estimate = getTokenEstimate(fullInput, model, true);

  logger?.info("Generating README.md...");

  if (dryRun) {
    logger?.info(`[DRY RUN] Would update README.md based on ${allFiles.length} files`);
    logger?.info("Token estimate:");
    logger?.info(formatTokenEstimate(estimate, model));
    return {
      doc: {
        outputPath,
        content: "[DRY RUN - No content generated]",
        sourceFiles: allFiles.map((f) => f.path),
      },
      estimate,
    };
  }

  const content = await llmService!.generateReadme(prompt, filesContent, projectName, existingReadme);

  return {
    doc: {
      outputPath,
      content,
      sourceFiles: allFiles.map((f) => f.path),
    },
    estimate,
  };
}

/**
 * Main documentation generator
 */
export class DocumentationGenerator {
  private llmService: LLMService | null;
  private config: LLMDocConfigSchema;
  private rootDir: string;
  private logger?: Logger;
  private dryRun: boolean;

  constructor(
    llmService: LLMService | null,
    config: LLMDocConfigSchema,
    rootDir: string,
    logger?: Logger,
    dryRun = false
  ) {
    this.llmService = llmService;
    this.config = config;
    this.rootDir = rootDir;
    this.logger = logger;
    this.dryRun = dryRun;
  }

  /**
   * Generate all documentation based on scan results
   */
  async generate(scanResult: ScanResult): Promise<GeneratedDoc[]> {
    const docs: GeneratedDoc[] = [];
    const estimates: TokenEstimate[] = [];
    const prompt = this.config.prompt!;
    const outputDir = this.config.outputDir!;
    const model = this.config.llm.model;

    // In dry-run mode, we don't need the LLM service
    if (!this.dryRun && !this.llmService) {
      throw new Error("LLM service is required when not in dry-run mode");
    }

    // Process each subfolder
    for (const [subfolder, files] of scanResult.grouped) {
      const result = await generateSubfolderDoc(
        this.llmService,
        this.rootDir,
        subfolder,
        files,
        scanResult.files,
        prompt,
        this.config.exclude ?? [],
        model,
        this.logger,
        this.dryRun
      );

      if (result.doc) {
        docs.push(result.doc);
        if (result.estimate) estimates.push(result.estimate);
        if (!this.dryRun) {
          writeDoc(this.rootDir, result.doc.outputPath, result.doc.content, this.logger);
        }
      }
    }

    // Process ungrouped files
    const ungroupedResult = await generateUngroupedDocs(
      this.llmService,
      this.rootDir,
      scanResult.ungrouped,
      outputDir,
      prompt,
      model,
      this.logger,
      this.dryRun
    );

    if (ungroupedResult.doc) {
      docs.push(ungroupedResult.doc);
      if (ungroupedResult.estimate) estimates.push(ungroupedResult.estimate);
      if (!this.dryRun) {
        writeDoc(this.rootDir, ungroupedResult.doc.outputPath, ungroupedResult.doc.content, this.logger);
      }
    }

    // Generate main README
    const readmeResult = await generateReadme(
      this.llmService,
      this.rootDir,
      scanResult.files,
      prompt,
      model,
      this.logger,
      this.dryRun
    );

    docs.push(readmeResult.doc);
    estimates.push(readmeResult.estimate);
    if (!this.dryRun) {
      writeDoc(this.rootDir, readmeResult.doc.outputPath, readmeResult.doc.content, this.logger);
    }

    // Show total estimates in dry-run mode
    if (this.dryRun && estimates.length > 0) {
      this.logger?.info("─".repeat(50));
      this.logger?.info("TOTAL ESTIMATES (all LLM calls combined):");
      const total = aggregateEstimates(estimates);
      this.logger?.info(formatTokenEstimate(total, model));
    }

    return docs;
  }
}

/**
 * Create a documentation generator instance
 */
export function createGenerator(
  llmService: LLMService | null,
  config: LLMDocConfigSchema,
  rootDir: string,
  logger?: Logger,
  dryRun = false
): DocumentationGenerator {
  return new DocumentationGenerator(llmService, config, rootDir, logger, dryRun);
}
