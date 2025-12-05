import { glob } from "glob";
import { existsSync, readFileSync } from "node:fs";
import { resolve, relative, dirname, join } from "node:path";
import type { IndexedFile, ScanResult, SubfolderConfig, Logger } from "../types.js";

/**
 * Normalize path separators to forward slashes for consistent matching
 */
function normalizePath(filePath: string): string {
  return filePath.split("\\").join("/");
}

/**
 * Check if a file path belongs to a subfolder
 */
function belongsToSubfolder(filePath: string, subfolderPath: string): boolean {
  const normalizedFile = normalizePath(filePath);
  const normalizedSubfolder = normalizePath(subfolderPath);

  // Ensure subfolder path ends without trailing slash for consistent comparison
  const cleanSubfolder = normalizedSubfolder.replace(/\/$/, "");

  return normalizedFile.startsWith(cleanSubfolder + "/") || normalizedFile === cleanSubfolder;
}

/**
 * Scan a directory for TypeScript files matching the include/exclude patterns
 */
export async function scanFiles(
  rootDir: string,
  include: string[],
  exclude: string[],
  logger?: Logger
): Promise<IndexedFile[]> {
  const files: IndexedFile[] = [];

  logger?.debug(`Scanning directory: ${rootDir}`);
  logger?.debug(`Include patterns: ${include.join(", ")}`);
  logger?.debug(`Exclude patterns: ${exclude.join(", ")}`);

  for (const pattern of include) {
    const matches = await glob(pattern, {
      cwd: rootDir,
      ignore: exclude,
      nodir: true,
      absolute: false,
    });

    for (const match of matches) {
      const absolutePath = resolve(rootDir, match);
      const relativePath = relative(rootDir, absolutePath);

      try {
        const content = readFileSync(absolutePath, "utf-8");
        const directory = dirname(relativePath);

        files.push({
          path: normalizePath(relativePath),
          content,
          directory: normalizePath(directory === "." ? "" : directory),
        });

        logger?.debug(`Indexed: ${relativePath}`);
      } catch (error) {
        logger?.warn(`Failed to read file: ${relativePath}`);
      }
    }
  }

  // Remove duplicates (in case patterns overlap)
  const uniqueFiles = Array.from(new Map(files.map((f) => [f.path, f])).values());

  logger?.info(`Found ${uniqueFiles.length} files to process`);

  return uniqueFiles;
}

/**
 * Group files by subfolder configuration
 */
export function groupFilesBySubfolder(
  files: IndexedFile[],
  subfolders: SubfolderConfig[],
  logger?: Logger
): { grouped: Map<SubfolderConfig, IndexedFile[]>; ungrouped: IndexedFile[] } {
  const grouped = new Map<SubfolderConfig, IndexedFile[]>();
  const assignedFiles = new Set<string>();

  // Initialize empty arrays for each subfolder
  for (const subfolder of subfolders) {
    grouped.set(subfolder, []);
  }

  // Sort subfolders by path length (longest first) for most specific matching
  const sortedSubfolders = [...subfolders].sort((a, b) => b.path.length - a.path.length);

  // Assign files to subfolders
  for (const file of files) {
    for (const subfolder of sortedSubfolders) {
      if (belongsToSubfolder(file.path, subfolder.path)) {
        grouped.get(subfolder)!.push(file);
        assignedFiles.add(file.path);
        logger?.debug(`Assigned ${file.path} to subfolder: ${subfolder.path}`);
        break; // File belongs to the most specific subfolder only
      }
    }
  }

  // Collect ungrouped files
  const ungrouped = files.filter((f) => !assignedFiles.has(f.path));

  logger?.debug(`Grouped files into ${subfolders.length} subfolders`);
  logger?.debug(`Ungrouped files: ${ungrouped.length}`);

  return { grouped, ungrouped };
}

/**
 * Extract import paths from TypeScript file content
 */
export function extractImports(content: string): string[] {
  const imports: string[] = [];

  // Match ES6 imports: import ... from "path" or import ... from 'path'
  const es6ImportRegex =
    /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+)?["']([^"']+)["']/g;

  // Match dynamic imports: import("path") or import('path')
  const dynamicImportRegex = /import\s*\(\s*["']([^"']+)["']\s*\)/g;

  // Match require: require("path") or require('path')
  const requireRegex = /require\s*\(\s*["']([^"']+)["']\s*\)/g;

  // Match export from: export ... from "path"
  const exportFromRegex = /export\s+(?:\{[^}]*\}|\*)\s+from\s+["']([^"']+)["']/g;

  let match;
  while ((match = es6ImportRegex.exec(content)) !== null) {
    if (match[1]) imports.push(match[1]);
  }
  while ((match = dynamicImportRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  while ((match = requireRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  while ((match = exportFromRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  return imports;
}

/**
 * Resolve an import path to an actual file path
 */
export function resolveImportPath(importPath: string, fromFile: string, rootDir: string): string | null {
  // Skip node_modules and external packages
  if (!importPath.startsWith(".") && !importPath.startsWith("/")) {
    return null;
  }

  const fromDir = dirname(resolve(rootDir, fromFile));
  let resolvedPath = resolve(fromDir, importPath);

  // Remove .js extension if present (TypeScript often imports .js but source is .ts)
  resolvedPath = resolvedPath.replace(/\.js$/, "");

  // Try different extensions
  const extensions = [".ts", ".tsx", ".js", ".jsx", ""];
  const indexFiles = ["index.ts", "index.tsx", "index.js", "index.jsx"];

  for (const ext of extensions) {
    const tryPath = resolvedPath + ext;
    if (existsSync(tryPath)) {
      return relative(rootDir, tryPath);
    }
  }

  // Try as directory with index file
  for (const indexFile of indexFiles) {
    const tryPath = join(resolvedPath, indexFile);
    if (existsSync(tryPath)) {
      return relative(rootDir, tryPath);
    }
  }

  return null;
}

/**
 * Resolve imports for a set of files recursively
 */
export function resolveImportsForFiles(
  files: IndexedFile[],
  allFiles: IndexedFile[],
  rootDir: string,
  depth: number = 2,
  logger?: Logger
): IndexedFile[] {
  if (depth <= 0) return [];

  const allFilePaths = new Set(allFiles.map((f) => normalizePath(f.path)));
  const currentFilePaths = new Set(files.map((f) => normalizePath(f.path)));
  const importedFiles: IndexedFile[] = [];
  const processedImports = new Set<string>();

  for (const file of files) {
    const imports = extractImports(file.content);

    for (const importPath of imports) {
      const resolvedPath = resolveImportPath(importPath, file.path, rootDir);

      if (!resolvedPath) continue;

      const normalizedResolved = normalizePath(resolvedPath);

      // Skip if already in current files or already processed
      if (currentFilePaths.has(normalizedResolved) || processedImports.has(normalizedResolved)) {
        continue;
      }

      processedImports.add(normalizedResolved);

      // Find the file in allFiles
      const importedFile = allFiles.find((f) => normalizePath(f.path) === normalizedResolved);

      if (importedFile) {
        importedFiles.push(importedFile);
        logger?.debug(`Resolved import: ${file.path} -> ${resolvedPath}`);
      } else if (allFilePaths.has(normalizedResolved)) {
        // File exists but wasn't in allFiles, try to read it
        try {
          const absolutePath = resolve(rootDir, resolvedPath);
          const content = readFileSync(absolutePath, "utf-8");
          const newFile: IndexedFile = {
            path: normalizedResolved,
            content,
            directory: normalizePath(dirname(resolvedPath)),
          };
          importedFiles.push(newFile);
          logger?.debug(`Loaded imported file: ${resolvedPath}`);
        } catch {
          logger?.debug(`Could not load imported file: ${resolvedPath}`);
        }
      }
    }
  }

  // Recursively resolve imports from the newly found files
  if (importedFiles.length > 0 && depth > 1) {
    const nestedImports = resolveImportsForFiles(
      importedFiles,
      [...allFiles, ...importedFiles],
      rootDir,
      depth - 1,
      logger
    );
    return [...importedFiles, ...nestedImports];
  }

  return importedFiles;
}

/**
 * Load additional files by glob patterns
 */
export async function loadAdditionalFiles(
  rootDir: string,
  patterns: string[],
  exclude: string[],
  existingFiles: Set<string>,
  logger?: Logger
): Promise<IndexedFile[]> {
  const additionalFiles: IndexedFile[] = [];

  for (const pattern of patterns) {
    const matches = await glob(pattern, {
      cwd: rootDir,
      ignore: exclude,
      nodir: true,
      absolute: false,
    });

    for (const match of matches) {
      const normalizedPath = normalizePath(match);

      if (existingFiles.has(normalizedPath)) {
        continue;
      }

      try {
        const absolutePath = resolve(rootDir, match);
        const content = readFileSync(absolutePath, "utf-8");
        const directory = dirname(match);

        additionalFiles.push({
          path: normalizedPath,
          content,
          directory: normalizePath(directory === "." ? "" : directory),
        });

        logger?.debug(`Added additional file: ${match}`);
      } catch {
        logger?.warn(`Failed to read additional file: ${match}`);
      }
    }
  }

  return additionalFiles;
}

/**
 * Scan project and organize files by configuration
 */
export async function scanProject(
  rootDir: string,
  include: string[],
  exclude: string[],
  subfolders: SubfolderConfig[] = [],
  logger?: Logger
): Promise<ScanResult> {
  const files = await scanFiles(rootDir, include, exclude, logger);
  const { grouped, ungrouped } = groupFilesBySubfolder(files, subfolders, logger);

  return {
    files,
    grouped,
    ungrouped,
  };
}

/**
 * Format files as a string for LLM context
 */
export function formatFilesForLLM(files: IndexedFile[]): string {
  if (files.length === 0) {
    return "No files found.";
  }

  return files
    .map((file) => {
      return `## File: ${file.path}\n\n\`\`\`typescript\n${file.content}\n\`\`\``;
    })
    .join("\n\n---\n\n");
}

/**
 * Get a summary of files (paths only) for preview
 */
export function getFilesSummary(files: IndexedFile[]): string {
  if (files.length === 0) {
    return "No files found.";
  }

  const byDirectory = new Map<string, string[]>();

  for (const file of files) {
    const dir = file.directory || "(root)";
    if (!byDirectory.has(dir)) {
      byDirectory.set(dir, []);
    }
    byDirectory.get(dir)!.push(file.path);
  }

  const lines: string[] = [];
  for (const [dir, filePaths] of byDirectory) {
    lines.push(`${dir}/`);
    for (const filePath of filePaths) {
      lines.push(`  - ${filePath}`);
    }
  }

  return lines.join("\n");
}
