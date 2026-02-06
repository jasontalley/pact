/**
 * Discover Fullscan Node
 *
 * Discovers all orphan tests (tests without @atom annotation) in the repository.
 * This is used for full-scan (brownfield) mode.
 *
 * Uses the `discover_orphans_fullscan` tool via ToolRegistryService.
 *
 * Phase 17: Refactored to use ContentProvider abstraction instead of direct fs calls.
 *
 * @see docs/implementation-checklist-phase5.md Section 1.5
 * @see docs/implementation-checklist-phase5.md Section 2.3 (refactored to use tools)
 * @see docs/implementation-checklist-phase17.md Section 17A.7
 */

import * as path from 'path';
import { minimatch } from 'minimatch';
import { NodeConfig } from '../types';
import { ReconciliationGraphStateType, OrphanTestInfo } from '../../types/reconciliation-state';
import { OrphanDiscoveryResult } from '../../../tools/reconciliation-tools.service';
import { ContentProvider, FilesystemContentProvider } from '../../../content';

/**
 * Filter options for test discovery
 */
interface FilterOptions {
  includePaths?: string[];
  excludePaths?: string[];
  includeFilePatterns?: string[];
  excludeFilePatterns?: string[];
}

/**
 * Check if a file path matches a path pattern (supports both prefix and glob)
 *
 * @param filePath - The file path to check
 * @param pattern - The pattern (can be a prefix like "src/modules" or a glob like "src/**")
 * @returns true if the file matches
 */
function matchesPathPattern(filePath: string, pattern: string): boolean {
  const normalizedFile = filePath.replaceAll('\\', '/');
  const normalizedPattern = pattern.replaceAll('\\', '/');

  // If pattern contains glob characters, use minimatch
  if (normalizedPattern.includes('*') || normalizedPattern.includes('?')) {
    return minimatch(normalizedFile, normalizedPattern, { matchBase: false });
  }

  // Otherwise, treat as a directory prefix
  return (
    normalizedFile.startsWith(normalizedPattern) ||
    normalizedFile.startsWith(normalizedPattern + '/')
  );
}

/**
 * Check if a file path matches the filter criteria
 *
 * @param filePath - The file path to check (relative to root)
 * @param filters - Filter options
 * @returns true if the file should be included
 */
function shouldIncludeFile(filePath: string, filters: FilterOptions): boolean {
  // Check includePaths - file must match one of these paths/patterns
  if (filters.includePaths && filters.includePaths.length > 0) {
    const matches = filters.includePaths.some((pattern) => matchesPathPattern(filePath, pattern));
    if (!matches) return false;
  }

  // Check excludePaths - file must NOT match any of these paths/patterns
  if (filters.excludePaths && filters.excludePaths.length > 0) {
    const excluded = filters.excludePaths.some((pattern) => matchesPathPattern(filePath, pattern));
    if (excluded) return false;
  }

  // Check includeFilePatterns - file must match one of these patterns
  if (filters.includeFilePatterns && filters.includeFilePatterns.length > 0) {
    const matches = filters.includeFilePatterns.some((pattern) =>
      minimatch(filePath, pattern, { matchBase: true }),
    );
    if (!matches) return false;
  }

  // Check excludeFilePatterns - file must NOT match any of these patterns
  if (filters.excludeFilePatterns && filters.excludeFilePatterns.length > 0) {
    const excluded = filters.excludeFilePatterns.some((pattern) =>
      minimatch(filePath, pattern, { matchBase: true }),
    );
    if (excluded) return false;
  }

  return true;
}

/**
 * Options for customizing discover fullscan node behavior
 */
export interface DiscoverFullscanNodeOptions {
  /** Maximum tests to process (for large repos) */
  maxTests?: number;
  /** Lines before test to look for @atom annotation */
  annotationLookback?: number;
  /** Use tool-based discovery (default: true) */
  useTool?: boolean;
}

/**
 * Get or create ContentProvider from config
 */
function getContentProvider(config: NodeConfig, basePath?: string): ContentProvider {
  return config.contentProvider || new FilesystemContentProvider(basePath);
}

/**
 * Parse a test file and extract orphan tests (tests without @atom annotation)
 * Uses provided content string (either from fixture or read via ContentProvider)
 */
function parseTestFileContent(
  filePath: string,
  content: string,
  annotationLookback: number,
): OrphanTestInfo[] {
  const orphanTests: OrphanTestInfo[] = [];
  const lines = content.split('\n');

  // Regex patterns
  const atomAnnotationRegex = /@atom\s+(IA-\d+)/;
  const testRegex = /^\s*(it|test)\s*\(\s*['"`](.+?)['"`]/;
  const describeRegex = /^\s*describe\s*\(\s*['"`](.+?)['"`]/;

  // Track state
  let currentDescribe = '';
  const describeStack: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Track describe blocks (simplified - doesn't handle nested perfectly)
    const describeMatch = line.match(describeRegex);
    if (describeMatch) {
      currentDescribe = describeMatch[1];
      describeStack.push(currentDescribe);
    }

    // Check for closing braces to pop describe stack
    // This is a simplification - a proper parser would be better
    if (line.includes('});') && describeStack.length > 0) {
      describeStack.pop();
      currentDescribe = describeStack[describeStack.length - 1] || '';
    }

    // Check for test declarations
    const testMatch = line.match(testRegex);
    if (testMatch) {
      const testName = testMatch[2];

      // Look for @atom annotation in the lines before this test
      let hasAnnotation = false;
      const lookbackStart = Math.max(0, i - annotationLookback);
      for (let j = lookbackStart; j < i; j++) {
        if (atomAnnotationRegex.test(lines[j])) {
          hasAnnotation = true;
          break;
        }
      }

      // Also check inline annotation
      if (!hasAnnotation && atomAnnotationRegex.test(line)) {
        hasAnnotation = true;
      }

      if (!hasAnnotation) {
        // Extract the test code
        const testCode = extractTestCode(lines, i);

        orphanTests.push({
          filePath,
          testName:
            describeStack.length > 0 ? `${describeStack.join(' > ')} > ${testName}` : testName,
          lineNumber,
          testCode,
          relatedSourceFiles: [], // Will be populated later
          // Phase 14: Ingestion Boundary — store full file source for quality analysis
          testSourceCode: content,
        });
      }
    }
  }

  return orphanTests;
}

/**
 * Extract the test code block starting at a given line
 */
function extractTestCode(lines: string[], startLine: number): string {
  const result: string[] = [];
  let braceDepth = 0;
  let started = false;

  for (let i = startLine; i < Math.min(lines.length, startLine + 100); i++) {
    const line = lines[i];
    result.push(line);

    for (const char of line) {
      if (char === '{') {
        braceDepth++;
        started = true;
      }
      if (char === '}') {
        braceDepth--;
      }
    }

    // End of test block
    if (started && braceDepth === 0) {
      break;
    }
  }

  return result.join('\n');
}

/**
 * Find source files that might be related to a test file
 * Uses ContentProvider for async file existence checks
 */
async function findRelatedSourceFiles(
  testFilePath: string,
  testContent: string,
  contentProvider: ContentProvider,
): Promise<string[]> {
  const relatedFiles: string[] = [];

  // The source file for this test (e.g., foo.spec.ts -> foo.ts)
  const sourcePath = testFilePath
    .replace(/\.spec\.ts$/, '.ts')
    .replace(/\.test\.ts$/, '.ts')
    .replace(/\.e2e-spec\.ts$/, '.ts');

  if (sourcePath !== testFilePath) {
    if (await contentProvider.exists(sourcePath)) {
      relatedFiles.push(sourcePath);
    }
  }

  // Extract imports to find other related files
  const importRegex =
    /import\s+(?:(?:\{[^}]+?\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"`]([^'"`]+)['"`]/g;
  let match;

  while ((match = importRegex.exec(testContent)) !== null) {
    const importPath = match[1];

    // Only consider relative imports
    if (importPath.startsWith('.')) {
      const testDir = path.dirname(testFilePath);
      const resolvedPath = path.normalize(path.join(testDir, importPath));

      // Try with .ts extension
      const withTs = resolvedPath + '.ts';
      if (await contentProvider.exists(withTs)) {
        relatedFiles.push(withTs);
      }
    }
  }

  return [...new Set(relatedFiles)]; // Deduplicate
}

/**
 * Creates the discover fullscan node for the reconciliation graph.
 *
 * This node:
 * 1. Calls the `discover_orphans_fullscan` tool via ToolRegistryService
 * 2. Falls back to direct implementation if tool is unavailable
 * 3. Updates state with orphan test list
 *
 * @param options - Optional customization options
 * @returns Node factory function
 */
export function createDiscoverFullscanNode(options: DiscoverFullscanNodeOptions = {}) {
  const maxTests = options.maxTests || 5000;
  const annotationLookback = options.annotationLookback || 5;
  const useTool = options.useTool ?? true;

  return (config: NodeConfig) =>
    async (state: ReconciliationGraphStateType): Promise<Partial<ReconciliationGraphStateType>> => {
      const rootDirectory = state.rootDirectory;
      const inputMaxTests = state.input?.options?.maxTests || maxTests;

      // Get filter options from input
      const filters: FilterOptions = {
        includePaths: state.input?.options?.includePaths,
        excludePaths: state.input?.options?.excludePaths,
        includeFilePatterns: state.input?.options?.includeFilePatterns,
        excludeFilePatterns: state.input?.options?.excludeFilePatterns,
      };

      const hasFilters =
        filters.includePaths?.length ||
        filters.excludePaths?.length ||
        filters.includeFilePatterns?.length ||
        filters.excludeFilePatterns?.length;

      config.logger?.log(
        `[DiscoverFullscanNode] Discovering orphan tests (useTool=${useTool}, hasFilters=${!!hasFilters})`,
      );

      if (hasFilters) {
        config.logger?.log(
          `[DiscoverFullscanNode] Filters: ` +
            `includePaths=${JSON.stringify(filters.includePaths || [])}, ` +
            `excludePaths=${JSON.stringify(filters.excludePaths || [])}, ` +
            `includeFilePatterns=${JSON.stringify(filters.includeFilePatterns || [])}, ` +
            `excludeFilePatterns=${JSON.stringify(filters.excludeFilePatterns || [])}`,
        );
      }

      // Check for fixture mode FIRST (before tool usage)
      // Fixture mode uses in-memory file contents instead of filesystem
      const fixtureFiles = state.fixtureFiles;
      const fixtureAnnotations = state.fixtureAnnotations;
      const isFixtureMode = state.fixtureMode || !!(fixtureFiles && Object.keys(fixtureFiles).length > 0);

      // Try to use the tool if available and enabled (only if no filters and NOT fixture mode)
      if (useTool && !hasFilters && !isFixtureMode && config.toolRegistry.hasTool('discover_orphans_fullscan')) {
        try {
          config.logger?.log('[DiscoverFullscanNode] Using discover_orphans_fullscan tool');

          const result = (await config.toolRegistry.executeTool('discover_orphans_fullscan', {
            root_directory: rootDirectory,
            max_orphans: inputMaxTests,
          })) as OrphanDiscoveryResult;

          config.logger?.log(
            `[DiscoverFullscanNode] Tool found ${result.totalOrphans} orphan tests (returning ${result.orphanTests.length})`,
          );

          // Convert tool result to node state format
          const orphanTests: OrphanTestInfo[] = result.orphanTests.map((orphan) => ({
            filePath: orphan.filePath,
            testName: orphan.testName,
            lineNumber: orphan.lineNumber,
            testCode: orphan.testCode || '',
            relatedSourceFiles: orphan.relatedSourceFiles,
          }));

          return {
            orphanTests,
            currentPhase: 'context',
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          config.logger?.warn(
            `[DiscoverFullscanNode] Tool execution failed, falling back to direct implementation: ${errorMessage}`,
          );
        }
      }

      // Fallback: Direct implementation (also used when filters are specified or fixture mode)
      let testFiles = state.repoStructure?.testFiles || [];

      // Apply path filters to test files
      if (hasFilters) {
        const originalCount = testFiles.length;
        testFiles = testFiles.filter((file) => shouldIncludeFile(file, filters));
        config.logger?.log(
          `[DiscoverFullscanNode] Filtered test files: ${originalCount} -> ${testFiles.length}`,
        );
      }

      if (isFixtureMode) {
        config.logger?.log(
          `[DiscoverFullscanNode] Fixture mode: scanning ${testFiles.length} test files`,
        );
      } else {
        config.logger?.log(
          `[DiscoverFullscanNode] Scanning ${testFiles.length} test files for orphan tests`,
        );
      }

      // Get ContentProvider for non-fixture mode file operations
      const contentProvider = getContentProvider(config, rootDirectory);

      const allOrphanTests: OrphanTestInfo[] = [];

      for (const testFile of testFiles) {
        if (allOrphanTests.length >= maxTests) {
          config.logger?.warn(
            `[DiscoverFullscanNode] Reached max tests limit (${maxTests}), stopping scan`,
          );
          break;
        }

        try {
          // Get file content - either from fixture or via ContentProvider
          let content: string;
          if (isFixtureMode && fixtureFiles?.[testFile] !== undefined) {
            content = fixtureFiles[testFile];
          } else {
            const readContent = await contentProvider.readFileOrNull(testFile);
            if (readContent === null) {
              config.logger?.warn(`[DiscoverFullscanNode] Could not read ${testFile}, skipping`);
              continue;
            }
            content = readContent;
          }

          // Parse the test file content
          const orphans = parseTestFileContent(testFile, content, annotationLookback);

          // Find related source files (only in non-fixture mode)
          if (!isFixtureMode) {
            for (const orphan of orphans) {
              orphan.relatedSourceFiles = await findRelatedSourceFiles(
                testFile,
                content,
                contentProvider,
              );
            }
          }

          // In fixture mode, filter out tests that have annotations in the fixture registry
          if (isFixtureMode && fixtureAnnotations) {
            const filteredOrphans = orphans.filter((orphan) => {
              const annotationKey = `${orphan.filePath}:${orphan.testName}`;
              return !fixtureAnnotations[annotationKey];
            });
            allOrphanTests.push(...filteredOrphans);
          } else {
            allOrphanTests.push(...orphans);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          config.logger?.warn(
            `[DiscoverFullscanNode] Failed to parse ${testFile}: ${errorMessage}`,
          );
        }
      }

      config.logger?.log(`[DiscoverFullscanNode] Found ${allOrphanTests.length} orphan tests`);

      // Apply maxTests limit from input options
      const effectiveMaxTests = inputMaxTests
        ? Math.min(inputMaxTests, allOrphanTests.length)
        : allOrphanTests.length;

      const limitedOrphanTests = allOrphanTests.slice(0, effectiveMaxTests);

      if (limitedOrphanTests.length < allOrphanTests.length) {
        config.logger?.log(
          `[DiscoverFullscanNode] Limited to ${limitedOrphanTests.length} tests per input options`,
        );
      }

      return {
        orphanTests: limitedOrphanTests,
        currentPhase: 'context',
      };
    };
}
