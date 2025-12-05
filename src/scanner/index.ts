import { glob } from "glob";
import { readFileSync } from "node:fs";
import { resolve, relative, dirname } from "node:path";
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
