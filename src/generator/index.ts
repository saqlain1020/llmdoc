import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import type { LLMDocConfigSchema } from "../config/schema.js";
import type { IndexedFile, SubfolderConfig, GeneratedDoc, Logger, ScanResult } from "../types.js";
import { LLMService } from "../llm/index.js";
import { formatFilesForLLM, getFilesSummary } from "../scanner/index.js";

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
 * Generate documentation for a subfolder
 */
async function generateSubfolderDoc(
  llmService: LLMService | null,
  rootDir: string,
  subfolder: SubfolderConfig,
  files: IndexedFile[],
  globalPrompt: string,
  logger?: Logger,
  dryRun?: boolean
): Promise<GeneratedDoc | null> {
  if (files.length === 0) {
    logger?.warn(`No files found in subfolder: ${subfolder.path}`);
    return null;
  }

  const prompt = subfolder.prompt ?? globalPrompt;
  const outputPath = subfolder.outputPath ?? `${subfolder.path}/README.md`;
  const existingDocs = subfolder.existingDocs
    ? readExistingDoc(rootDir, subfolder.existingDocs)
    : readExistingDoc(rootDir, outputPath);

  logger?.info(`Processing subfolder: ${subfolder.path} (${files.length} files)`);

  if (dryRun) {
    logger?.info(`[DRY RUN] Would generate docs for:`);
    logger?.info(getFilesSummary(files));
    return {
      outputPath,
      content: "[DRY RUN - No content generated]",
      sourceFiles: files.map((f) => f.path),
    };
  }

  const filesContent = formatFilesForLLM(files);
  const content = await llmService!.generateDocumentation(prompt, filesContent, existingDocs);

  return {
    outputPath,
    content,
    sourceFiles: files.map((f) => f.path),
  };
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
  logger?: Logger,
  dryRun?: boolean
): Promise<GeneratedDoc | null> {
  if (files.length === 0) {
    logger?.debug("No ungrouped files to process");
    return null;
  }

  const outputPath = `${outputDir}/api-reference.md`;
  const existingDocs = readExistingDoc(rootDir, outputPath);

  logger?.info(`Processing ungrouped files (${files.length} files)`);

  if (dryRun) {
    logger?.info(`[DRY RUN] Would generate API reference for:`);
    logger?.info(getFilesSummary(files));
    return {
      outputPath,
      content: "[DRY RUN - No content generated]",
      sourceFiles: files.map((f) => f.path),
    };
  }

  const filesContent = formatFilesForLLM(files);
  const content = await llmService!.generateApiReference(prompt, filesContent, existingDocs);
  return {
    outputPath,
    content,
    sourceFiles: files.map((f) => f.path),
  };
}

/**
 * Generate or update the main README.md
 */
async function generateReadme(
  llmService: LLMService | null,
  rootDir: string,
  allFiles: IndexedFile[],
  prompt: string,
  logger?: Logger,
  dryRun?: boolean
): Promise<GeneratedDoc> {
  const projectName = basename(rootDir);
  const outputPath = "README.md";
  const existingReadme = readExistingDoc(rootDir, outputPath);

  logger?.info("Generating README.md...");

  if (dryRun) {
    logger?.info(`[DRY RUN] Would update README.md based on ${allFiles.length} files`);
    return {
      outputPath,
      content: "[DRY RUN - No content generated]",
      sourceFiles: allFiles.map((f) => f.path),
    };
  }

  const filesContent = formatFilesForLLM(allFiles);
  const content = await llmService!.generateReadme(prompt, filesContent, projectName, existingReadme);

  return {
    outputPath,
    content,
    sourceFiles: allFiles.map((f) => f.path),
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
    const prompt = this.config.prompt!;
    const outputDir = this.config.outputDir!;

    // In dry-run mode, we don't need the LLM service
    if (!this.dryRun && !this.llmService) {
      throw new Error("LLM service is required when not in dry-run mode");
    }

    // Process each subfolder
    for (const [subfolder, files] of scanResult.grouped) {
      const doc = await generateSubfolderDoc(
        this.llmService,
        this.rootDir,
        subfolder,
        files,
        prompt,
        this.logger,
        this.dryRun
      );

      if (doc) {
        docs.push(doc);
        if (!this.dryRun) {
          writeDoc(this.rootDir, doc.outputPath, doc.content, this.logger);
        }
      }
    }

    // Process ungrouped files
    const ungroupedDoc = await generateUngroupedDocs(
      this.llmService,
      this.rootDir,
      scanResult.ungrouped,
      outputDir,
      prompt,
      this.logger,
      this.dryRun
    );

    if (ungroupedDoc) {
      docs.push(ungroupedDoc);
      if (!this.dryRun) {
        writeDoc(this.rootDir, ungroupedDoc.outputPath, ungroupedDoc.content, this.logger);
      }
    }

    // Generate main README
    const readmeDoc = await generateReadme(
      this.llmService,
      this.rootDir,
      scanResult.files,
      prompt,
      this.logger,
      this.dryRun
    );

    docs.push(readmeDoc);
    if (!this.dryRun) {
      writeDoc(this.rootDir, readmeDoc.outputPath, readmeDoc.content, this.logger);
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
