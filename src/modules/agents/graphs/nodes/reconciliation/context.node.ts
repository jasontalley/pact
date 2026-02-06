/**
 * Context Node
 *
 * Builds rich context for each orphan test.
 * Uses the `get_test_analysis` tool via ToolRegistryService.
 *
 * Phase 17: Refactored to use ContentProvider abstraction instead of direct fs calls.
 *
 * **Dependency-Aware Processing (Phase 3.4)**:
 * - Tests are processed in topological order when available
 * - Base modules (fewer dependencies) are analyzed first
 * - Allows context from foundational modules to inform dependent analysis
 *
 * @see docs/implementation-checklist-phase5.md Section 1.7
 * @see docs/implementation-checklist-phase5.md Section 2.3 (refactored to use tools)
 * @see docs/implementation-checklist-phase5.md Section 3.4 (dependency-aware processing)
 * @see docs/implementation-checklist-phase17.md Section 17A.9
 */

import * as path from 'path';
import { NodeConfig } from '../types';
import {
  ReconciliationGraphStateType,
  TestAnalysis,
  OrphanTestInfo,
  DocChunk,
  RepoStructure,
} from '../../types/reconciliation-state';
import { ContextBuilderService } from '../../../context-builder.service';
import { ContentProvider, FilesystemContentProvider } from '../../../content';

/**
 * Options for customizing context node behavior
 */
export interface ContextNodeOptions {
  /** Batch size for processing tests (for progress tracking) */
  batchSize?: number;
  /** Whether to index documentation */
  indexDocs?: boolean;
  /** Maximum documentation chunks to include */
  maxDocChunks?: number;
  /** Optional injected ContextBuilderService (for testing) */
  contextBuilderService?: ContextBuilderService;
  /** Use tool-based analysis (default: true) */
  useTool?: boolean;
  /** Use topological ordering for test processing (default: true) */
  useTopologicalOrder?: boolean;
}

/**
 * Get or create ContentProvider from config
 */
function getContentProvider(config: NodeConfig, basePath?: string): ContentProvider {
  return config.contentProvider || new FilesystemContentProvider(basePath);
}

/**
 * Sort orphan tests by topological order of their related source files.
 *
 * Tests for files that appear earlier in the topological order (fewer dependencies)
 * are processed first, allowing their context to inform analysis of dependent tests.
 *
 * @param tests - Orphan tests to sort
 * @param repoStructure - Repository structure with topological order
 * @returns Sorted tests (original order preserved if no topological info)
 */
function sortTestsByTopologicalOrder(
  tests: OrphanTestInfo[],
  repoStructure: RepoStructure | null,
): OrphanTestInfo[] {
  // If no topological order available, return original order
  if (!repoStructure?.topologicalOrder || repoStructure.topologicalOrder.length === 0) {
    return tests;
  }

  const topoOrder = repoStructure.topologicalOrder;
  const orderIndex = new Map<string, number>();

  // Build index map for O(1) lookup
  topoOrder.forEach((file, index) => {
    orderIndex.set(file, index);
  });

  // Helper to get the minimum topological index for a test's related files
  const getTestOrder = (test: OrphanTestInfo): number => {
    // First try related source files
    if (test.relatedSourceFiles && test.relatedSourceFiles.length > 0) {
      let minIndex = Infinity;
      for (const sourceFile of test.relatedSourceFiles) {
        const index = orderIndex.get(sourceFile);
        if (index !== undefined && index < minIndex) {
          minIndex = index;
        }
      }
      if (minIndex !== Infinity) {
        return minIndex;
      }
    }

    // Fall back to test file's index
    const testIndex = orderIndex.get(test.filePath);
    if (testIndex !== undefined) {
      return testIndex;
    }

    // Unknown files go at the end
    return Infinity;
  };

  // Sort by topological order
  return [...tests].sort((a, b) => getTestOrder(a) - getTestOrder(b));
}

/**
 * Convert test key to unique identifier
 */
function getTestKey(test: OrphanTestInfo): string {
  return `${test.filePath}:${test.testName}`;
}

/**
 * Build simple documentation index by scanning docs directory
 * Uses ContentProvider for async file operations
 */
async function buildDocumentationIndex(
  rootDirectory: string,
  maxChunks: number,
  contentProvider: ContentProvider,
): Promise<DocChunk[]> {
  const chunks: DocChunk[] = [];
  const docsDir = path.join(rootDirectory, 'docs');

  // Check if docs directory exists
  if (!(await contentProvider.exists(docsDir))) {
    return chunks;
  }

  // Walk the docs directory
  const docFiles = await contentProvider.walkDirectory(docsDir, {
    excludePatterns: ['node_modules'],
    maxFiles: maxChunks * 2, // Get more files than needed for filtering
    includeExtensions: ['.md'],
  });

  for (const relativePath of docFiles) {
    if (chunks.length >= maxChunks) break;

    // Construct full path for reading
    const fullPath = path.join(docsDir, relativePath);
    const docRelativePath = path.join('docs', relativePath);

    const content = await contentProvider.readFileOrNull(fullPath);
    if (content === null) continue;

    const keywords = extractKeywords(content);

    chunks.push({
      filePath: docRelativePath,
      content: content.substring(0, 2000), // Limit content size
      keywords,
    });
  }

  return chunks;
}

/**
 * Extract keywords from documentation content
 */
function extractKeywords(content: string): string[] {
  const keywords = new Set<string>();

  // Extract headings as keywords
  const headingRegex = /^#+\s+(.+)$/gm;
  let match;
  while ((match = headingRegex.exec(content)) !== null) {
    const heading = match[1].toLowerCase();
    // Split on common separators and add each word
    heading.split(/[\s\-_:/]+/).forEach((word) => {
      if (word.length > 2) {
        keywords.add(word);
      }
    });
  }

  // Extract code identifiers
  const codeRegex = /`([^`]+)`/g;
  while ((match = codeRegex.exec(content)) !== null) {
    const code = match[1].toLowerCase();
    if (code.length > 2 && code.length < 50) {
      keywords.add(code);
    }
  }

  return Array.from(keywords).slice(0, 20);
}

/**
 * Fallback test analysis when ContextBuilderService is not available
 */
function createFallbackAnalysis(test: OrphanTestInfo, _rootDirectory: string): TestAnalysis {
  // Extract basic info from test code
  const testCode = test.testCode || '';

  // Extract assertions
  const assertionMatches = testCode.match(/expect\([^)]+\)\.[^;]+/g) || [];
  const assertions = assertionMatches
    .slice(0, 5)
    .map((a) => a.replace(/expect\([^)]+\)\./, '').substring(0, 100));

  // Extract domain concepts from test name and assertions
  const domainPatterns = [
    'user',
    'auth',
    'login',
    'session',
    'token',
    'payment',
    'order',
    'cart',
    'checkout',
    'create',
    'update',
    'delete',
    'get',
    'list',
    'validate',
    'error',
    'success',
    'fail',
  ];

  const testNameLower = test.testName.toLowerCase();
  const domainConcepts = domainPatterns.filter(
    (p) => testNameLower.includes(p) || testCode.toLowerCase().includes(p),
  );

  return {
    testId: getTestKey(test),
    summary: `Test: ${test.testName}`,
    domainConcepts,
    relatedCode: test.relatedSourceFiles?.map((f) => path.basename(f)),
    relatedDocs: [],
    rawContext: testCode, // Will be cleared after infer phase per INV-R005
  };
}

/**
 * Creates the context node for the reconciliation graph.
 *
 * This node:
 * 1. Calls the `get_test_analysis` tool for each orphan test
 * 2. Falls back to direct implementation if tool is unavailable
 * 3. Optionally indexes documentation
 * 4. Updates state with contextPerTest map
 *
 * @param options - Optional customization options
 * @returns Node factory function
 */
export function createContextNode(options: ContextNodeOptions = {}) {
  const batchSize = options.batchSize || 10;
  const indexDocs = options.indexDocs ?? true;
  const maxDocChunks = options.maxDocChunks || 50;
  const useTool = options.useTool ?? true;
  const useTopologicalOrder = options.useTopologicalOrder ?? true;

  return (config: NodeConfig) =>
    async (state: ReconciliationGraphStateType): Promise<Partial<ReconciliationGraphStateType>> => {
      const rootDirectory = state.rootDirectory;
      const repoStructure = state.repoStructure;
      const rawOrphanTests = state.orphanTests || [];
      const shouldAnalyzeDocs = state.input?.options?.analyzeDocs ?? indexDocs;
      const isFixtureMode = state.fixtureMode === true;

      // Sort tests by topological order if available (Phase 3.4)
      const orphanTests = useTopologicalOrder
        ? sortTestsByTopologicalOrder(rawOrphanTests, repoStructure)
        : rawOrphanTests;

      const hasTopoOrder =
        repoStructure?.topologicalOrder && repoStructure.topologicalOrder.length > 0;
      config.logger?.log(
        `[ContextNode] Building context for ${orphanTests.length} orphan tests ` +
          `(useTool=${useTool}, topologicalOrder=${hasTopoOrder && useTopologicalOrder})`,
      );

      // Get ContentProvider for non-fixture mode file operations
      const contentProvider = getContentProvider(config, rootDirectory);

      // Build documentation index if requested (skip in fixture mode - use ContentProvider)
      let documentationIndex: DocChunk[] | null = null;
      if (shouldAnalyzeDocs && !isFixtureMode) {
        config.logger?.log('[ContextNode] Building documentation index...');
        documentationIndex = await buildDocumentationIndex(
          rootDirectory,
          maxDocChunks,
          contentProvider,
        );
        config.logger?.log(
          `[ContextNode] Indexed ${documentationIndex.length} documentation chunks`,
        );
      } else if (isFixtureMode) {
        config.logger?.log('[ContextNode] Fixture mode: skipping documentation index');
      }

      // Check if tool is available (not in fixture mode - no filesystem access)
      const hasTestAnalysisTool =
        !isFixtureMode && useTool && config.toolRegistry.hasTool('get_test_analysis');
      const contextBuilderService = isFixtureMode ? undefined : options.contextBuilderService;
      const contextPerTest = new Map<string, TestAnalysis>();
      let processedCount = 0;

      if (isFixtureMode) {
        config.logger?.log(
          '[ContextNode] Fixture mode: using fallback analysis (no filesystem access)',
        );
      }

      for (const test of orphanTests) {
        const testKey = getTestKey(test);

        try {
          let analysis: TestAnalysis;

          // In fixture mode, always use fallback analysis (no filesystem access)
          if (isFixtureMode) {
            analysis = createFallbackAnalysis(test, rootDirectory);
          } else if (hasTestAnalysisTool) {
            // Try tool-based analysis first
            try {
              const toolResult = (await config.toolRegistry.executeTool('get_test_analysis', {
                test_file_path: test.filePath,
                test_name: test.testName,
                test_line_number: test.lineNumber,
                root_directory: rootDirectory,
              })) as {
                testId: string;
                summary: string;
                domainConcepts: string[];
                relatedCode?: string[];
                relatedDocs?: string[];
                rawContext?: string;
              };

              analysis = {
                testId: testKey,
                summary: toolResult.summary || `Test: ${test.testName}`,
                domainConcepts: toolResult.domainConcepts || [],
                relatedCode: toolResult.relatedCode,
                relatedDocs: toolResult.relatedDocs,
                rawContext: toolResult.rawContext,
              };
            } catch (toolError) {
              const toolErrorMessage =
                toolError instanceof Error ? toolError.message : String(toolError);
              config.logger?.warn(
                `[ContextNode] Tool failed for ${testKey}, falling back: ${toolErrorMessage}`,
              );
              // Fall through to service or fallback
              analysis = await analyzeWithServiceOrFallback(
                test,
                testKey,
                rootDirectory,
                contextBuilderService,
              );
            }
          } else if (contextBuilderService) {
            // Use real ContextBuilderService if available
            analysis = await analyzeWithService(
              test,
              testKey,
              rootDirectory,
              contextBuilderService,
            );
          } else {
            // Use fallback analysis
            analysis = createFallbackAnalysis(test, rootDirectory);
          }

          contextPerTest.set(testKey, analysis);
          processedCount++;

          // Log progress at batch boundaries
          if (processedCount % batchSize === 0) {
            config.logger?.log(
              `[ContextNode] Processed ${processedCount}/${orphanTests.length} tests`,
            );
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          config.logger?.warn(`[ContextNode] Failed to analyze ${testKey}: ${errorMessage}`);

          // Add minimal analysis even on error
          contextPerTest.set(testKey, {
            testId: testKey,
            summary: `Test: ${test.testName}`,
            domainConcepts: [],
            relatedCode: [],
            relatedDocs: [],
          });
        }
      }

      config.logger?.log(`[ContextNode] Context built for ${contextPerTest.size} tests`);

      return {
        contextPerTest,
        documentationIndex,
        currentPhase: 'infer',
      };
    };
}

/**
 * Helper to analyze test using ContextBuilderService
 */
async function analyzeWithService(
  test: OrphanTestInfo,
  testKey: string,
  rootDirectory: string,
  contextBuilderService: ContextBuilderService,
): Promise<TestAnalysis> {
  const fullPath = path.join(rootDirectory, test.filePath);
  const serviceAnalysis = await contextBuilderService.analyzeTest(
    fullPath,
    test.testName,
    test.lineNumber,
    rootDirectory,
  );

  return {
    testId: testKey,
    summary: serviceAnalysis.expectedBehavior || `Test: ${test.testName}`,
    domainConcepts: serviceAnalysis.domainConcepts,
    relatedCode: serviceAnalysis.relatedSourceFiles?.map((f) => path.relative(rootDirectory, f)),
    relatedDocs: serviceAnalysis.documentationSnippets,
    rawContext: serviceAnalysis.isolatedTestCode,
  };
}

/**
 * Helper to analyze with service or fallback
 */
async function analyzeWithServiceOrFallback(
  test: OrphanTestInfo,
  testKey: string,
  rootDirectory: string,
  contextBuilderService?: ContextBuilderService,
): Promise<TestAnalysis> {
  if (contextBuilderService) {
    return analyzeWithService(test, testKey, rootDirectory, contextBuilderService);
  }
  return createFallbackAnalysis(test, rootDirectory);
}
