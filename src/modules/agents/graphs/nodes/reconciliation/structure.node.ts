/**
 * Structure Node
 *
 * First node in the reconciliation graph.
 * Lists all source and test files in the repository.
 *
 * Uses the `get_repo_structure` tool via ToolRegistryService for enhanced
 * dependency analysis and topological ordering.
 *
 * @see docs/implementation-checklist-phase5.md Section 1.4
 * @see docs/implementation-checklist-phase5.md Section 3.3 (dependency graph)
 */

import * as fs from 'fs';
import * as path from 'path';
import { NodeConfig } from '../types';
import {
  ReconciliationGraphStateType,
  RepoStructure,
} from '../../types/reconciliation-state';
import { RepoStructureResult } from '../../../tools/reconciliation-tools.service';

/**
 * Options for customizing structure node behavior
 */
export interface StructureNodeOptions {
  /** File patterns to include as test files (default: ['**\/*.spec.ts', '**\/*.test.ts']) */
  testPatterns?: string[];
  /** File patterns to include as source files (default: ['**\/*.ts']) */
  sourcePatterns?: string[];
  /** Directory patterns to exclude (default: ['node_modules', 'dist', '.git', 'coverage']) */
  excludePatterns?: string[];
  /** Maximum files to process (for large repos) */
  maxFiles?: number;
  /** Use tool-based structure analysis (default: true) */
  useTool?: boolean;
  /** Include dependency analysis (default: false, can be expensive) */
  includeDependencies?: boolean;
}

const DEFAULT_TEST_PATTERNS = ['**/*.spec.ts', '**/*.test.ts', '**/*.e2e-spec.ts'];
const DEFAULT_SOURCE_PATTERNS = ['**/*.ts', '**/*.tsx'];
const DEFAULT_EXCLUDE_PATTERNS = [
  'node_modules',
  'dist',
  '.git',
  'coverage',
  '.next',
  '.cache',
  'build',
];

/**
 * Check if a file path matches a glob pattern (simple implementation)
 */
function matchGlob(filePath: string, pattern: string): boolean {
  // Convert glob pattern to regex
  let regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '<<<GLOBSTAR>>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<<GLOBSTAR>>>/g, '.*');

  // Handle patterns like **/*.spec.ts - should match files in root too
  if (regexPattern.startsWith('.*/')) {
    regexPattern = `(${regexPattern}|${regexPattern.slice(3)})`;
  }

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filePath);
}

/**
 * Check if a path matches any of the patterns
 */
function matchesAnyPattern(filePath: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchGlob(filePath, pattern));
}

/**
 * Check if a path should be excluded
 */
function shouldExclude(filePath: string, excludePatterns: string[]): boolean {
  return excludePatterns.some((pattern) => filePath.includes(pattern));
}

/**
 * Walk directory recursively and collect files
 */
function walkDirectory(
  rootDir: string,
  excludePatterns: string[],
  maxFiles: number,
): string[] {
  const files: string[] = [];

  function walk(dir: string): void {
    if (files.length >= maxFiles) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      // Skip directories we can't read
      return;
    }

    for (const entry of entries) {
      if (files.length >= maxFiles) break;

      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(rootDir, fullPath);

      // Check exclusions
      if (shouldExclude(relativePath, excludePatterns)) {
        continue;
      }

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        files.push(relativePath);
      }
    }
  }

  walk(rootDir);
  return files;
}

/**
 * Creates the structure node for the reconciliation graph.
 *
 * This node:
 * 1. Lists all files in the repository
 * 2. Categorizes them into source and test files
 * 3. Optionally builds dependency graph and topological order
 * 4. Updates state with RepoStructure
 *
 * @param options - Optional customization options
 * @returns Node factory function
 */
export function createStructureNode(options: StructureNodeOptions = {}) {
  const testPatterns = options.testPatterns || DEFAULT_TEST_PATTERNS;
  const sourcePatterns = options.sourcePatterns || DEFAULT_SOURCE_PATTERNS;
  const excludePatterns = options.excludePatterns || DEFAULT_EXCLUDE_PATTERNS;
  const maxFiles = options.maxFiles || 10000;
  const useTool = options.useTool ?? true;
  const includeDependencies = options.includeDependencies ?? false;

  return (config: NodeConfig) =>
    async (state: ReconciliationGraphStateType): Promise<Partial<ReconciliationGraphStateType>> => {
      const rootDirectory = state.rootDirectory || state.input?.rootDirectory || process.cwd();
      const inputIncludeDeps = state.input?.options?.analyzeDocs ?? includeDependencies;

      config.logger?.log(
        `[StructureNode] Scanning repository: ${rootDirectory} (useTool=${useTool}, deps=${inputIncludeDeps})`,
      );

      // Check if tool is available
      const hasStructureTool = useTool && config.toolRegistry.hasTool('get_repo_structure');

      // Try tool-based structure analysis
      if (hasStructureTool) {
        try {
          config.logger?.log('[StructureNode] Using get_repo_structure tool');

          const result = await config.toolRegistry.executeTool(
            'get_repo_structure',
            {
              root_directory: rootDirectory,
              include_dependencies: inputIncludeDeps,
              max_files: maxFiles,
              exclude_patterns: excludePatterns.join(','),
            },
          ) as RepoStructureResult;

          const repoStructure: RepoStructure = {
            files: result.files,
            testFiles: result.testFiles,
            dependencyEdges: result.dependencyEdges,
            topologicalOrder: result.topologicalOrder,
          };

          config.logger?.log(
            `[StructureNode] Tool found ${result.totalFiles} files: ` +
            `${result.sourceFiles.length} source, ${result.testFiles.length} test`,
          );

          if (result.dependencyEdges) {
            config.logger?.log(
              `[StructureNode] Dependency analysis: ${result.dependencyEdges.length} edges, ` +
              `cycles: ${result.hasCycles || false}`,
            );
          }

          return {
            rootDirectory,
            repoStructure,
            currentPhase: 'discover',
            startTime: state.startTime || new Date(),
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          config.logger?.warn(
            `[StructureNode] Tool failed, falling back to direct implementation: ${errorMessage}`,
          );
        }
      }

      // Fallback: Direct implementation
      try {
        const allFiles = walkDirectory(rootDirectory, excludePatterns, maxFiles);

        const testFiles: string[] = [];
        const sourceFiles: string[] = [];

        for (const file of allFiles) {
          if (matchesAnyPattern(file, testPatterns)) {
            testFiles.push(file);
          } else if (matchesAnyPattern(file, sourcePatterns)) {
            sourceFiles.push(file);
          }
        }

        const repoStructure: RepoStructure = {
          files: [...sourceFiles, ...testFiles],
          testFiles,
          dependencyEdges: undefined,
          topologicalOrder: undefined,
        };

        config.logger?.log(
          `[StructureNode] Found ${allFiles.length} files: ${sourceFiles.length} source, ${testFiles.length} test`,
        );

        return {
          rootDirectory,
          repoStructure,
          currentPhase: 'discover',
          startTime: state.startTime || new Date(),
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        config.logger?.error(`[StructureNode] Failed: ${errorMessage}`);

        return {
          rootDirectory,
          repoStructure: {
            files: [],
            testFiles: [],
          },
          currentPhase: 'discover',
          errors: [errorMessage],
        };
      }
    };
}
