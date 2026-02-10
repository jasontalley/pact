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
  EvidenceItem,
  EvidenceAnalysis,
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
function getContentProvider(
  config: NodeConfig,
  runId?: string,
  basePath?: string,
): ContentProvider {
  if (runId && config.contentProviderOverrides?.has(runId)) {
    return config.contentProviderOverrides.get(runId)!;
  }
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

// ============================================================================
// Evidence Analysis Builders (Phase 21C)
// ============================================================================

/**
 * Build EvidenceAnalysis for a non-test evidence item.
 * Pure static analysis — no LLM calls.
 */
function buildEvidenceAnalysis(evidence: EvidenceItem): EvidenceAnalysis {
  const evidenceId = `${evidence.filePath}:${evidence.name}`;

  switch (evidence.type) {
    case 'source_export':
      return buildSourceExportAnalysis(evidence, evidenceId);
    case 'ui_component':
      return buildUIComponentAnalysis(evidence, evidenceId);
    case 'api_endpoint':
      return buildAPIEndpointAnalysis(evidence, evidenceId);
    case 'documentation':
      return buildDocumentationAnalysis(evidence, evidenceId);
    case 'coverage_gap':
      return buildCoverageGapAnalysis(evidence, evidenceId);
    default:
      return {
        evidenceId,
        type: evidence.type,
        summary: `${evidence.type}: ${evidence.name}`,
        domainConcepts: [],
        rawContext: evidence.code,
      };
  }
}

function buildSourceExportAnalysis(evidence: EvidenceItem, evidenceId: string): EvidenceAnalysis {
  const code = evidence.code || '';
  const exportType = evidence.metadata?.exportType || 'unknown';
  const domainConcepts = extractDomainConceptsFromCode(evidence.name, code);

  return {
    evidenceId,
    type: 'source_export',
    summary: 'Exported ' + exportType + ' "' + evidence.name + '"' + (evidence.metadata?.isDefault ? ' (default)' : ''),
    domainConcepts,
    relatedCode: evidence.relatedFiles,
    rawContext: code,
  };
}

function buildUIComponentAnalysis(evidence: EvidenceItem, evidenceId: string): EvidenceAnalysis {
  const code = evidence.code || '';
  const framework = evidence.metadata?.framework || 'unknown';
  const traits: string[] = [];
  if (evidence.metadata?.hasForm) traits.push('form input');
  if (evidence.metadata?.hasNavigation) traits.push('navigation');

  const domainConcepts = extractDomainConceptsFromCode(evidence.name, code);

  return {
    evidenceId,
    type: 'ui_component',
    summary: `${framework} component "${evidence.name}"${traits.length > 0 ? ` (${traits.join(', ')})` : ''}`,
    domainConcepts,
    relatedCode: evidence.relatedFiles,
    rawContext: code,
  };
}

function buildAPIEndpointAnalysis(evidence: EvidenceItem, evidenceId: string): EvidenceAnalysis {
  const code = evidence.code || '';
  const method = evidence.metadata?.method || 'UNKNOWN';
  const routePath = evidence.metadata?.path || '/';
  const domainConcepts = extractDomainConceptsFromCode(evidence.name, code);

  // Add route segments as domain concepts
  const routeSegments = routePath
    .split('/')
    .filter((s) => s && !s.startsWith(':') && !s.startsWith('{'))
    .map((s) => s.toLowerCase());
  domainConcepts.push(...routeSegments);

  return {
    evidenceId,
    type: 'api_endpoint',
    summary: `${method} ${routePath} → ${evidence.name}()`,
    domainConcepts: [...new Set(domainConcepts)],
    relatedCode: evidence.relatedFiles,
    rawContext: code,
  };
}

function buildDocumentationAnalysis(evidence: EvidenceItem, evidenceId: string): EvidenceAnalysis {
  const content = evidence.code || '';
  const keywords = extractDocKeywords(content);

  return {
    evidenceId,
    type: 'documentation',
    summary: `Documentation: ${evidence.name}`,
    domainConcepts: keywords,
    rawContext: content,
  };
}

function buildCoverageGapAnalysis(evidence: EvidenceItem, evidenceId: string): EvidenceAnalysis {
  const pct = evidence.metadata?.coveragePercent?.toFixed(0) || '?';
  return {
    evidenceId,
    type: 'coverage_gap',
    summary: `Coverage gap in ${evidence.filePath} (${pct}% covered)`,
    domainConcepts: extractDomainConceptsFromCode(evidence.name, evidence.code || ''),
    rawContext: evidence.code,
  };
}

/**
 * Extract domain concepts from a name and code snippet.
 * Splits camelCase/PascalCase names and looks for common domain patterns.
 */
function extractDomainConceptsFromCode(name: string, code: string): string[] {
  const concepts = new Set<string>();

  // Split camelCase/PascalCase name into words
  const nameWords = name
    .replaceAll(/([a-z])([A-Z])/g, '$1 $2')
    .replaceAll(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter((w) => w.length > 2);
  nameWords.forEach((w) => concepts.add(w));

  // Scan code for common domain keywords
  const domainPatterns = [
    'user', 'auth', 'login', 'session', 'token', 'payment', 'order',
    'cart', 'checkout', 'create', 'update', 'delete', 'get', 'list',
    'validate', 'error', 'success', 'fail', 'submit', 'upload',
    'download', 'notification', 'email', 'search', 'filter', 'sort',
    'permission', 'role', 'admin', 'config', 'setting', 'profile',
  ];
  const codeLower = code.toLowerCase();
  for (const pattern of domainPatterns) {
    if (codeLower.includes(pattern)) {
      concepts.add(pattern);
    }
  }

  return Array.from(concepts).slice(0, 15);
}

/**
 * Extract keywords from documentation content.
 */
function extractDocKeywords(content: string): string[] {
  const keywords = new Set<string>();

  // Headings
  const headingRegex = /^#{1,3}\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(content)) !== null) {
    match[1]
      .toLowerCase()
      .split(/[\s\-_:/]+/)
      .forEach((w) => {
        if (w.length > 2) keywords.add(w);
      });
  }

  // Backtick code identifiers
  const codeRegex = /`([^`]+)`/g;
  while ((match = codeRegex.exec(content)) !== null) {
    const code = match[1].toLowerCase();
    if (code.length > 2 && code.length < 50) keywords.add(code);
  }

  // Bold terms
  const boldRegex = /\*\*([^*]+)\*\*/g;
  while ((match = boldRegex.exec(content)) !== null) {
    match[1]
      .toLowerCase()
      .split(/[\s\-_:/]+/)
      .forEach((w) => {
        if (w.length > 2) keywords.add(w);
      });
  }

  return Array.from(keywords).slice(0, 20);
}

/**
 * Creates the context node for the reconciliation graph.
 *
 * This node:
 * 1. Calls the `get_test_analysis` tool for each orphan test
 * 2. Falls back to direct implementation if tool is unavailable
 * 3. Builds EvidenceAnalysis for non-test evidence items (Phase 21C)
 * 4. Optionally indexes documentation
 * 5. Updates state with contextPerTest map and evidenceAnalysis map
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
      const contentProvider = getContentProvider(config, state.runId, rootDirectory);

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

      // Pre-read mode: a per-run ContentProvider override exists — skip filesystem tools
      const hasPreReadOverride = !!(
        state.runId && config.contentProviderOverrides?.has(state.runId)
      );

      // Check if tool is available (not in fixture mode or pre-read mode - no filesystem access)
      const hasTestAnalysisTool =
        !isFixtureMode &&
        !hasPreReadOverride &&
        useTool &&
        config.toolRegistry.hasTool('get_test_analysis');
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

      // ================================================================
      // Phase 21C: Build EvidenceAnalysis for all evidence items
      // ================================================================
      const evidenceAnalysis = new Map<string, EvidenceAnalysis>();
      const evidenceItems = state.evidenceItems || [];
      const testQualityScores = state.testQualityScores;

      if (evidenceItems.length > 0) {
        config.logger?.log(
          `[ContextNode] Building evidence analysis for ${evidenceItems.length} items`,
        );

        for (const evidence of evidenceItems) {
          const evidenceId = `${evidence.filePath}:${evidence.name}`;

          if (evidence.type === 'test') {
            // For test evidence, mirror the test analysis into evidence analysis
            const testKey = evidenceId;
            const testAnalysis = contextPerTest.get(testKey);
            const qualityScore = testQualityScores?.get(testKey);

            evidenceAnalysis.set(evidenceId, {
              evidenceId,
              type: 'test',
              summary: testAnalysis?.summary || `Test: ${evidence.name}`,
              domainConcepts: testAnalysis?.domainConcepts || [],
              relatedCode: testAnalysis?.relatedCode,
              relatedDocs: testAnalysis?.relatedDocs,
              rawContext: testAnalysis?.rawContext || evidence.code,
              qualityScore: qualityScore?.overallScore,
            });
          } else {
            // Non-test evidence: build analysis from static analysis
            const analysis = buildEvidenceAnalysis(evidence);
            evidenceAnalysis.set(evidenceId, analysis);
          }
        }

        // Count by type for logging
        const typeCounts = new Map<string, number>();
        for (const analysis of evidenceAnalysis.values()) {
          typeCounts.set(analysis.type, (typeCounts.get(analysis.type) || 0) + 1);
        }
        const typeStr = Array.from(typeCounts.entries())
          .map(([t, c]) => `${c} ${t}`)
          .join(', ');
        config.logger?.log(`[ContextNode] Evidence analysis complete: ${typeStr}`);
      }

      return {
        contextPerTest,
        evidenceAnalysis,
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
