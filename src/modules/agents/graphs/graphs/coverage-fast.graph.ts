/**
 * Coverage Fast-Path Graph
 *
 * Specialized graph for answering coverage questions efficiently.
 * Bypasses the full ReAct loop by using deterministic file discovery
 * and structured coverage readers.
 *
 * Expected performance: ~5K tokens instead of ~100K tokens for coverage questions.
 */

import { StateGraph, END, START, Annotation } from '@langchain/langgraph';
import { NodeConfig } from '../nodes/types';
import { Finding, EvidenceLevel } from '../types/base-state';

/**
 * State for coverage fast-path graph
 */
export const CoverageFastState = Annotation.Root({
  // The original question
  input: Annotation<string>({
    reducer: (_, update) => update,
    default: () => '',
  }),

  // Discovered coverage files
  coverageFiles: Annotation<string[]>({
    reducer: (_, update) => update,
    default: () => [],
  }),

  // Extracted coverage metrics
  metrics: Annotation<Record<string, unknown> | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  // Findings from file reads
  findings: Annotation<Finding[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  // Final output
  output: Annotation<string | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  // Error message if something failed
  error: Annotation<string | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),
});

export type CoverageFastStateType = typeof CoverageFastState.State;

/**
 * Common locations for coverage files
 */
const COVERAGE_LOCATIONS = [
  'test-results',
  'coverage',
  'test-results/backend/unit/coverage',
  'test-results/frontend/unit/coverage',
];

/**
 * Coverage file patterns
 */
const COVERAGE_FILE_PATTERNS = [
  /coverage-summary\.json$/i,
  /coverage-final\.json$/i,
  /lcov\.info$/i,
  /coverage\.json$/i,
];

/**
 * Discover coverage files by listing common directories
 */
async function discoverCoverageFiles(
  config: NodeConfig,
): Promise<{ files: string[]; findings: Finding[] }> {
  const files: string[] = [];
  const findings: Finding[] = [];

  for (const location of COVERAGE_LOCATIONS) {
    try {
      const result = await config.toolRegistry.executeTool('list_directory', {
        directory_path: location,
      });

      // Tool returns { path, items, count } - check for 'items' property
      if (result && typeof result === 'object' && 'items' in result) {
        const items = (result as { items: Array<{ name: string; type: string }> }).items;

        for (const item of items) {
          const fullPath = `${location}/${item.name}`;

          // Check if it matches coverage file patterns
          if (COVERAGE_FILE_PATTERNS.some((p) => p.test(item.name))) {
            files.push(fullPath);
          }

          // Also check subdirectories for coverage files
          if (item.type === 'directory' && item.name.includes('coverage')) {
            try {
              const subResult = await config.toolRegistry.executeTool('list_directory', {
                directory_path: fullPath,
              });
              if (subResult && typeof subResult === 'object' && 'items' in subResult) {
                const subItems = (subResult as { items: Array<{ name: string; type: string }> })
                  .items;
                for (const subItem of subItems) {
                  if (COVERAGE_FILE_PATTERNS.some((p) => p.test(subItem.name))) {
                    files.push(`${fullPath}/${subItem.name}`);
                  }
                }
              }
            } catch {
              // Subdirectory doesn't exist or isn't readable
            }
          }
        }

        findings.push({
          source: location,
          content: items.map((e) => e.name).join('\n'),
          relevance: 'Directory listing (coverage discovery)',
        });
      }
    } catch {
      // Directory doesn't exist or isn't readable
    }
  }

  return { files, findings };
}

/**
 * Extract coverage metrics from a coverage file
 */
async function extractCoverageMetrics(
  config: NodeConfig,
  filePath: string,
): Promise<{ metrics: Record<string, unknown> | null; finding: Finding | null }> {
  try {
    // Use read_coverage_report for coverage files
    const result = await config.toolRegistry.executeTool('read_coverage_report', {
      file_path: filePath,
    });

    if (result && typeof result === 'object') {
      const coverageResult = result as {
        metrics?: Record<string, { total: number; covered: number; pct: number }>;
        content?: string;
        error?: string;
      };

      if (coverageResult.error) {
        return { metrics: null, finding: null };
      }

      if (coverageResult.metrics) {
        const finding: Finding = {
          source: filePath,
          content: JSON.stringify(coverageResult.metrics, null, 2),
          relevance: 'Coverage metrics',
          computedFacts: coverageResult.metrics,
          confidence: 1,
        };
        return { metrics: coverageResult.metrics, finding };
      }
    }

    return { metrics: null, finding: null };
  } catch (error) {
    config.logger?.warn(`Failed to read coverage file ${filePath}: ${error}`);
    return { metrics: null, finding: null };
  }
}

/**
 * Format coverage metrics for human consumption
 */
function formatCoverageResponse(
  metrics: Record<string, unknown>,
  source: string,
): string {
  const lines: string[] = ['## Test Coverage Summary', ''];

  // Extract common coverage metrics
  const metricsObj = metrics as Record<
    string,
    { total?: number; covered?: number; pct?: number } | number
  >;

  for (const [key, value] of Object.entries(metricsObj)) {
    if (typeof value === 'object' && value !== null && 'pct' in value) {
      const pct = value.pct ?? 0;
      const covered = value.covered ?? 0;
      const total = value.total ?? 0;
      lines.push(`- **${key}**: ${pct.toFixed(1)}% (${covered}/${total})`);
    } else if (typeof value === 'number') {
      lines.push(`- **${key}**: ${value}%`);
    }
  }

  lines.push('');
  lines.push(`_Source: ${source}_`);

  return lines.join('\n');
}

/**
 * Create the discover node - finds coverage files
 */
function createDiscoverNode(config: NodeConfig) {
  return async (state: CoverageFastStateType): Promise<Partial<CoverageFastStateType>> => {
    config.logger?.log('Coverage fast-path: discovering coverage files');

    const { files, findings } = await discoverCoverageFiles(config);

    if (files.length === 0) {
      return {
        coverageFiles: [],
        findings,
        error: 'No coverage files found in standard locations',
      };
    }

    config.logger?.log(`Coverage fast-path: found ${files.length} coverage files`);
    return { coverageFiles: files, findings };
  };
}

/**
 * Create the extract node - reads coverage metrics
 */
function createExtractNode(config: NodeConfig) {
  return async (state: CoverageFastStateType): Promise<Partial<CoverageFastStateType>> => {
    if (state.error) {
      return {}; // Skip if discovery failed
    }

    config.logger?.log('Coverage fast-path: extracting metrics');

    // Try each coverage file until we get metrics
    for (const file of state.coverageFiles) {
      const { metrics, finding } = await extractCoverageMetrics(config, file);
      if (metrics && finding) {
        config.logger?.log(`Coverage fast-path: extracted metrics from ${file}`);
        return {
          metrics,
          findings: [finding],
        };
      }
    }

    return {
      error: 'Could not extract metrics from any coverage file',
    };
  };
}

/**
 * Create the format node - generates the response
 */
function createFormatNode(config: NodeConfig) {
  return async (state: CoverageFastStateType): Promise<Partial<CoverageFastStateType>> => {
    if (state.error) {
      // Return error message
      return {
        output: `I couldn't find coverage data. ${state.error}. You may need to run tests with coverage enabled first.`,
      };
    }

    if (!state.metrics) {
      return {
        output: 'No coverage metrics were found in the coverage files.',
      };
    }

    config.logger?.log('Coverage fast-path: formatting response');

    // Find the source file
    const source =
      state.findings.find((f) => f.computedFacts)?.source || state.coverageFiles[0] || 'unknown';

    const response = formatCoverageResponse(state.metrics, source);
    return { output: response };
  };
}

/**
 * Create the coverage fast-path graph
 *
 * Flow: START -> discover -> extract -> format -> END
 *
 * This graph is deterministic - no LLM calls needed.
 * It uses structured tools to find and parse coverage data.
 */
export function createCoverageFastGraph(config: NodeConfig) {
  const discoverNode = createDiscoverNode(config);
  const extractNode = createExtractNode(config);
  const formatNode = createFormatNode(config);

  const builder = new StateGraph(CoverageFastState)
    .addNode('discover', discoverNode)
    .addNode('extract', extractNode)
    .addNode('format', formatNode)
    .addEdge(START, 'discover')
    .addEdge('discover', 'extract')
    .addEdge('extract', 'format')
    .addEdge('format', END);

  return builder.compile();
}

/**
 * Graph name for registry
 */
export const COVERAGE_FAST_GRAPH_NAME = 'coverage-fast';

/**
 * Graph configuration for registry
 */
export const COVERAGE_FAST_GRAPH_CONFIG = {
  description: 'Fast-path agent for coverage questions (deterministic, no LLM calls)',
  stateType: 'CoverageFastState',
  pattern: 'fast-path' as const,
};
