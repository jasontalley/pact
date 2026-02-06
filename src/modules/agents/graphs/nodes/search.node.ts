/**
 * Search Node
 *
 * Executes exploration tool calls to gather information.
 * Uses the plan (if available) to guide exploration.
 *
 * Discovery-First Pattern:
 * - On first iteration, automatically lists target directories from the plan
 * - Validates file reads against plan's filePatterns
 * - Provides strong guidance to follow the plan
 */

import { NodeConfig } from './types';
import { AgentTaskType, ToolDefinition } from '../../../../common/llm/providers/types';
import {
  BaseExplorationStateType,
  Finding,
  ToolHistoryEntry,
  ToolResultQuality,
  ToolResultSignals,
  ParseMetadata,
  EvidenceLevel,
} from '../types/base-state';
import { formatFindingsForPrompt } from '../utils/finding-compactor';
import { Plan } from '../types/schemas';
import { ToolRegistryService } from '../../tools/tool-registry.service';
import { HumanMessage, AIMessage, ToolMessage, BaseMessage } from '@langchain/core/messages';

/**
 * Options for customizing search node behavior
 */
export interface SearchNodeOptions {
  /** Tool categories to use (default: all) */
  toolCategories?: ('filesystem' | 'atom' | 'code' | 'all')[];
  /** Maximum tools per iteration */
  maxToolsPerIteration?: number;
  /** Custom search prompt */
  customPrompt?: string;
  /** Maximum characters per tool result (default: 10000) */
  maxToolResultChars?: number;
  /** Maximum total context characters (default: 100000) */
  maxContextChars?: number;
  /** Enable discovery-first pattern (default: true) */
  enableDiscoveryFirst?: boolean;
  /** Skip LLM call on first iteration if discovery provides results (default: false) */
  discoveryOnlyFirstIteration?: boolean;
}

/**
 * Extended state interface for search node
 */
export interface SearchNodeState extends BaseExplorationStateType {
  plan?: Plan | null;
}

/**
 * Collect tools from multiple categories (fixes single-category bug)
 */
function getToolsFromCategories(
  registry: ToolRegistryService,
  categories?: string[],
): ToolDefinition[] {
  if (!categories || categories.length === 0 || categories.includes('all')) {
    return registry.getAllTools();
  }

  // Collect tools from ALL specified categories, deduplicated by name
  const toolMap = new Map<string, ToolDefinition>();
  for (const category of categories) {
    const categoryTools = registry.getToolsByCategory(
      category as 'filesystem' | 'atom' | 'code' | 'all',
    );
    for (const tool of categoryTools) {
      if (!toolMap.has(tool.name)) {
        toolMap.set(tool.name, tool);
      }
    }
  }
  return Array.from(toolMap.values());
}

/**
 * Truncate content to prevent context overflow
 */
function truncateContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content;
  return content.slice(0, maxLength) + '\n... (truncated)';
}

/**
 * Get the size of a message's content
 */
function getMessageSize(m: BaseMessage): number {
  const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
  return content.length;
}

/**
 * Summarize a tool message by keeping only key info
 */
function summarizeToolMessage(msg: ToolMessage): ToolMessage {
  const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);

  // For short content, keep as-is
  if (content.length <= 500) {
    return msg;
  }

  // Extract key info: first line (often has the important data) + truncation notice
  const lines = content.split('\n');
  const firstLine = lines[0].slice(0, 200);
  const summary = `${firstLine}...\n[Truncated: ${content.length} chars total]`;

  return new ToolMessage({
    content: summary,
    tool_call_id: msg.tool_call_id,
  });
}

/**
 * Simple truncation: keep most recent messages that fit
 */
function simpleTruncation(
  messages: BaseMessage[],
  messageSizes: number[],
  maxChars: number,
): BaseMessage[] {
  const result: BaseMessage[] = [];
  let currentSize = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (currentSize + messageSizes[i] <= maxChars) {
      result.unshift(messages[i]);
      currentSize += messageSizes[i];
    } else {
      break;
    }
  }
  return result;
}

/**
 * Truncate messages to fit within context limit.
 *
 * Strategy:
 * 1. Always keep first message (task/question)
 * 2. Always keep last 3 messages (most recent context)
 * 3. Summarize tool messages in between when over budget
 */
function truncateMessagesToFit(messages: BaseMessage[], maxChars: number): BaseMessage[] {
  const messageSizes = messages.map(getMessageSize);
  const totalChars = messageSizes.reduce((a, b) => a + b, 0);

  if (totalChars <= maxChars) {
    return messages;
  }

  // Must keep: first message + last 3 messages
  const mustKeepLast = Math.min(3, messages.length - 1);
  const middleEnd = messages.length - mustKeepLast;

  // Calculate size of must-keep messages
  let mustKeepSize = messageSizes[0];
  for (let i = middleEnd; i < messages.length; i++) {
    mustKeepSize += messageSizes[i];
  }

  // Fall back to simple truncation if must-keep exceeds budget
  if (mustKeepSize > maxChars) {
    return simpleTruncation(messages, messageSizes, maxChars);
  }

  // Build result: first + processed middle + last 3
  const result: BaseMessage[] = [messages[0]];
  let currentSize = messageSizes[0];

  // Process middle messages, summarizing tool messages when over budget
  for (let i = 1; i < middleEnd; i++) {
    const msg = messages[i];
    const size = messageSizes[i];
    const wouldExceed = currentSize + size + (mustKeepSize - messageSizes[0]) > maxChars;

    if (wouldExceed && msg instanceof ToolMessage) {
      const summarized = summarizeToolMessage(msg);
      result.push(summarized);
      currentSize += getMessageSize(summarized);
    } else if (!wouldExceed) {
      result.push(msg);
      currentSize += size;
    }
  }

  // Add last 3 messages
  for (let i = middleEnd; i < messages.length; i++) {
    result.push(messages[i]);
  }

  return result;
}

/** Result type for tool classification */
interface ClassificationResult {
  quality: ToolResultQuality;
  signals: ToolResultSignals;
}

/** Classify read_file tool results */
function classifyReadFileResult(result: unknown, signals: ToolResultSignals): ClassificationResult {
  const fileResult = result as {
    content?: string;
    total_lines?: number;
    start_line?: number;
    end_line?: number;
    error?: string;
  };

  if (fileResult.error) {
    return { quality: 'error', signals };
  }

  if (fileResult.total_lines) {
    signals.totalLines = fileResult.total_lines;
  }

  if (fileResult.start_line && fileResult.end_line && fileResult.total_lines) {
    signals.linesRead = fileResult.end_line - fileResult.start_line + 1;
    if (fileResult.end_line < fileResult.total_lines) {
      signals.isTruncated = true;
      return { quality: 'partial', signals };
    }
  }

  // Check if content looks like JSON that should be parsed
  if (fileResult.content) {
    const content = fileResult.content.trim();
    if (content.startsWith('{') || content.startsWith('[')) {
      signals.mimeGuess = 'application/json';
      try {
        JSON.parse(content);
        signals.parseAttempted = true;
        signals.parseSuccess = true;
      } catch {
        signals.parseAttempted = true;
        signals.parseSuccess = false;
        if (signals.isTruncated) {
          return { quality: 'truncated', signals };
        }
      }
    }
  }

  if (!fileResult.content || fileResult.content.length === 0) {
    return { quality: 'unreadable', signals };
  }

  return { quality: 'ok', signals };
}

/** Classify read_json tool results */
function classifyReadJsonResult(result: unknown, signals: ToolResultSignals): ClassificationResult {
  const jsonResult = result as {
    parsed?: unknown;
    parseSuccess?: boolean;
    error?: string;
  };

  signals.parseAttempted = true;
  signals.parseSuccess = jsonResult.parseSuccess === true;

  if (jsonResult.error) {
    signals.parseError = jsonResult.error;
    return { quality: 'unreadable', signals };
  }

  if (jsonResult.parseSuccess) {
    signals.mimeGuess = 'application/json';
    return { quality: 'ok', signals };
  }

  return { quality: 'unreadable', signals };
}

/** Classify read_coverage_report tool results */
function classifyCoverageResult(result: unknown, signals: ToolResultSignals): ClassificationResult {
  const coverageResult = result as {
    parseSuccess?: boolean;
    error?: string;
  };

  signals.parseAttempted = true;
  signals.parseSuccess = coverageResult.parseSuccess === true;

  if (coverageResult.error) {
    signals.parseError = coverageResult.error;
    return { quality: 'unreadable', signals };
  }

  return coverageResult.parseSuccess
    ? { quality: 'ok', signals }
    : { quality: 'unreadable', signals };
}

/** Classify list_directory tool results */
function classifyListDirectoryResult(
  result: unknown,
  signals: ToolResultSignals,
): ClassificationResult {
  const dirResult = result as {
    items?: Array<{ name: string; type: string }>;
    error?: string;
  };

  if (dirResult.error) {
    return { quality: 'error', signals };
  }

  // Empty directory is still valid
  return { quality: 'ok', signals };
}

/** Classify grep tool results */
function classifyGrepResult(result: unknown, signals: ToolResultSignals): ClassificationResult {
  const grepResult = result as {
    error?: string;
  };

  if (grepResult.error) {
    return { quality: 'error', signals };
  }

  // No results is still a valid answer (pattern not found)
  return { quality: 'ok', signals };
}

/**
 * Classify the quality of a tool result
 */
function classifyToolResult(
  toolName: string,
  _args: Record<string, unknown>,
  result: unknown,
  truncatedResult: string,
): ClassificationResult {
  const signals: ToolResultSignals = {
    isTruncated: false,
    bytesSeen: truncatedResult.length,
  };

  // Check for explicit truncation marker
  if (truncatedResult.includes('... (truncated)')) {
    signals.isTruncated = true;
    return { quality: 'truncated', signals };
  }

  // Route to specific classifier based on tool name
  switch (toolName) {
    case 'read_file':
      return classifyReadFileResult(result, signals);
    case 'read_json':
      return classifyReadJsonResult(result, signals);
    case 'read_coverage_report':
      return classifyCoverageResult(result, signals);
    case 'list_directory':
      return classifyListDirectoryResult(result, signals);
    case 'grep':
      return classifyGrepResult(result, signals);
    default:
      // Default: if we got something, it's ok
      if (!result || (typeof result === 'object' && Object.keys(result).length === 0)) {
        return { quality: 'unreadable', signals };
      }
      return { quality: 'ok', signals };
  }
}

/**
 * Suggest a better tool based on file path and result quality.
 * Returns a suggestion string if a better tool exists, null otherwise.
 */
function suggestBetterTool(
  toolName: string,
  args: Record<string, unknown>,
  quality: ToolResultQuality,
  signals: ToolResultSignals,
): string | null {
  const filePath = (args.file_path || args.path || '') as string;
  const coverageJsonPattern = /coverage.*\.json$/i;
  const lcovPattern = /lcov/i;
  const lcovFilePattern = /\.(lcov|info)$/i;

  // For truncated read_file results, suggest structured readers
  if (toolName === 'read_file' && (quality === 'truncated' || quality === 'partial')) {
    // Coverage files should use read_coverage_report
    if (coverageJsonPattern.test(filePath) || lcovPattern.test(filePath)) {
      return `Use read_coverage_report instead of read_file for ${filePath} - it parses coverage data and extracts metrics`;
    }
    // JSON files should use read_json
    if (filePath.endsWith('.json')) {
      return `Use read_json instead of read_file for ${filePath} - it parses JSON and can use json_pointer for specific fields`;
    }
  }

  // For parse failures on JSON files, suggest read_json
  if (
    toolName === 'read_file' &&
    signals.parseAttempted &&
    !signals.parseSuccess &&
    filePath.endsWith('.json')
  ) {
    return `Use read_json for ${filePath} - it handles JSON parsing more robustly`;
  }

  // For unreadable results, suggest checking file type
  if (quality === 'unreadable' && toolName === 'read_file') {
    if (lcovFilePattern.test(filePath)) {
      return `Use read_coverage_report for ${filePath} - LCOV format requires specialized parsing`;
    }
  }

  return null;
}

/**
 * Suggest the optimal tool for a given file path.
 * Used for proactive tool selection in prompts.
 */
function suggestToolForFile(filePath: string): string {
  const coverageJsonPattern = /coverage.*\.json$/i;
  const lcovFilePattern = /\.(lcov|info)$/i;

  if (coverageJsonPattern.test(filePath)) return 'read_coverage_report';
  if (lcovFilePattern.test(filePath)) return 'read_coverage_report';
  if (filePath.endsWith('.json')) return 'read_json';
  return 'read_file';
}

/**
 * Determine evidence level from a finding
 */
function getEvidenceLevelFromFinding(finding: Finding): EvidenceLevel {
  if (finding.computedFacts && Object.keys(finding.computedFacts).length > 0) {
    return 4; // Computed facts
  }
  if (finding.parseMetadata?.parseSuccess) {
    return 3; // Parsed structured data
  }
  if (
    finding.relevance === 'Directory listing' ||
    finding.relevance === 'Directory listing (discovery phase)'
  ) {
    return 1; // Directory listing
  }
  return 2; // Raw file read
}

/**
 * Try to parse JSON content and return metadata
 */
function tryParseJson(content: string): ParseMetadata {
  try {
    const parsed = JSON.parse(content);
    const topLevelKeys =
      typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
        ? Object.keys(parsed).slice(0, 20)
        : undefined;

    return {
      parseSuccess: true,
      format: 'json',
      topLevelKeys,
      schemaSummary: Array.isArray(parsed)
        ? `Array with ${parsed.length} items`
        : `Object with ${Object.keys(parsed).length} keys`,
    };
  } catch (e) {
    return {
      parseSuccess: false,
      parseError: e instanceof Error ? e.message : 'Unknown parse error',
    };
  }
}

/**
 * Extract a finding from read_file result
 */
function extractReadFileFinding(
  args: Record<string, unknown>,
  result: unknown,
  quality: ToolResultQuality,
  signals: ToolResultSignals,
): Finding | null {
  const fileResult = result as { content?: string };
  if (!fileResult.content) return null;

  const content = truncateContent(fileResult.content, 2000);
  const isTruncated = quality === 'truncated' || quality === 'partial' || signals.isTruncated;

  // Try to parse if it looks like JSON
  let parseMetadata: ParseMetadata | undefined;
  if (signals.mimeGuess === 'application/json' || fileResult.content.trim().startsWith('{')) {
    parseMetadata = tryParseJson(fileResult.content);
  }

  // Determine confidence based on quality
  let confidence = 0.4;
  if (quality === 'ok') {
    confidence = 0.9;
  } else if (quality === 'partial') {
    confidence = 0.6;
  }

  return {
    source: args.file_path as string,
    content,
    relevance: 'File contents',
    truncated: isTruncated,
    parseMetadata,
    confidence,
  };
}

/**
 * Extract a finding from read_json result
 */
function extractReadJsonFinding(
  args: Record<string, unknown>,
  result: unknown,
  quality: ToolResultQuality,
): Finding | null {
  const jsonResult = result as {
    parsed?: unknown;
    parseSuccess?: boolean;
    schema?: { topLevelKeys?: string[]; schemaSummary?: string };
    computedFacts?: Record<string, unknown>;
  };

  if (!jsonResult.parseSuccess) return null;

  const content = jsonResult.schema
    ? `Schema: ${jsonResult.schema.schemaSummary || 'unknown'}\nKeys: ${(jsonResult.schema.topLevelKeys || []).join(', ')}`
    : JSON.stringify(jsonResult.parsed, null, 2).slice(0, 2000);

  return {
    source: args.file_path as string,
    content,
    relevance: 'Parsed JSON',
    parseMetadata: {
      parseSuccess: true,
      format: 'json',
      topLevelKeys: jsonResult.schema?.topLevelKeys,
      schemaSummary: jsonResult.schema?.schemaSummary,
    },
    computedFacts: jsonResult.computedFacts,
    confidence: quality === 'ok' ? 1 : 0.8,
  };
}

/**
 * Extract a finding from read_coverage_report result
 */
function extractCoverageReportFinding(
  args: Record<string, unknown>,
  result: unknown,
  quality: ToolResultQuality,
): Finding | null {
  const coverageResult = result as {
    parseSuccess?: boolean;
    format?: string;
    summary?: Record<string, unknown>;
    metrics?: Record<string, unknown>;
  };

  if (!coverageResult.parseSuccess) return null;

  const content = coverageResult.summary
    ? JSON.stringify(coverageResult.summary, null, 2)
    : JSON.stringify(coverageResult.metrics || result, null, 2).slice(0, 2000);

  return {
    source: args.file_path as string,
    content,
    relevance: 'Coverage report',
    parseMetadata: {
      parseSuccess: true,
      format: coverageResult.format || 'coverage',
    },
    computedFacts: coverageResult.metrics,
    confidence: quality === 'ok' ? 1 : 0.7,
  };
}

/**
 * Extract a finding from list_directory result
 */
function extractListDirectoryFinding(result: unknown): Finding | null {
  const dirResult = result as {
    path?: string;
    items?: Array<{ name: string; type: string }>;
  };

  if (!dirResult.items) return null;

  return {
    source: dirResult.path || 'directory',
    content: dirResult.items.map((i) => `${i.type}: ${i.name}`).join('\n'),
    relevance: 'Directory listing',
    confidence: 1,
  };
}

/**
 * Extract a finding from grep result
 */
function extractGrepFinding(args: Record<string, unknown>, result: unknown): Finding | null {
  const grepResult = result as {
    results?: Array<{ file: string; line: number; content: string }>;
  };

  if (!grepResult.results || grepResult.results.length === 0) return null;

  return {
    source: `grep: ${args.pattern}`,
    content: grepResult.results
      .slice(0, 10)
      .map((r) => `${r.file}:${r.line}: ${r.content}`)
      .join('\n'),
    relevance: 'Search results',
    confidence: 1,
  };
}

/**
 * Extract finding from tool result based on tool type
 */
function extractFindingFromToolResult(
  toolName: string,
  args: Record<string, unknown>,
  result: unknown,
  quality: ToolResultQuality,
  signals: ToolResultSignals,
): Finding | null {
  switch (toolName) {
    case 'read_file':
      return extractReadFileFinding(args, result, quality, signals);
    case 'read_json':
      return extractReadJsonFinding(args, result, quality);
    case 'read_coverage_report':
      return extractCoverageReportFinding(args, result, quality);
    case 'list_directory':
      return extractListDirectoryFinding(result);
    case 'grep':
      return extractGrepFinding(args, result);
    default:
      return null;
  }
}

/**
 * Extract potential file paths from text content.
 * Looks for common path patterns in config files, code, and output.
 */
function extractPathsFromContent(content: string): string[] {
  const paths = new Set<string>();

  // Pattern 1: Quoted paths (single or double quotes)
  // Matches: "path/to/file", './some/dir', '/absolute/path'
  const quotedPathRegex = /['"]([./][^'"]*?(?:\/[^'"]+)+)['"]/g;
  let match;
  while ((match = quotedPathRegex.exec(content)) !== null) {
    const path = match[1];
    // Filter out URL-like strings and very short paths
    if (!path.includes('://') && path.length > 3) {
      paths.add(path);
    }
  }

  // Pattern 2: coverageDirectory, outDir, and similar config patterns
  // Matches: coverageDirectory: './test-results/...'
  const configPathRegex =
    /(?:coverageDirectory|outDir|outputDir|reportDir|dir|path|directory)\s*[:=]\s*['"]?([./][^'",\s}]+)/gi;
  while ((match = configPathRegex.exec(content)) !== null) {
    const path = match[1];
    if (!path.includes('://') && path.length > 3) {
      paths.add(path);
    }
  }

  // Pattern 3: Relative paths starting with ./ or ../
  // Be more conservative - only match paths that look like real file paths
  const relativePathRegex = /(?:^|[\s,=:])(\.\.[/\\][^\s,'"{}[\]]+|\.[/][^\s,'"{}[\]]+)/gm;
  while ((match = relativePathRegex.exec(content)) !== null) {
    const path = match[1].trim();
    if (!path.includes('://') && path.length > 3 && !path.endsWith('.')) {
      paths.add(path);
    }
  }

  return Array.from(paths);
}

/**
 * Extract paths from all findings to suggest for exploration
 */
function extractDiscoveredPaths(findings: Finding[]): string[] {
  const allPaths = new Set<string>();

  for (const finding of findings) {
    const paths = extractPathsFromContent(finding.content);
    for (const path of paths) {
      allPaths.add(path);
    }
  }

  return Array.from(allPaths);
}

/**
 * Identify file types from directory listings to suggest appropriate tools
 */
function identifyFileTypesInFindings(findings: Finding[]): {
  jsonFiles: string[];
  coverageFiles: string[];
} {
  const jsonFiles: string[] = [];
  const coverageFiles: string[] = [];

  for (const finding of findings) {
    // Check directory listings for file types
    if (finding.relevance.includes('Directory listing')) {
      const lines = finding.content.split('\n');
      for (const line of lines) {
        const fileName = line.replace(/^file:\s*/i, '').trim();
        if (fileName.endsWith('.json')) {
          const fullPath = finding.source + '/' + fileName;
          jsonFiles.push(fullPath);

          // Check for coverage-specific files
          if (fileName.includes('coverage') || fileName === 'lcov.info') {
            coverageFiles.push(fullPath);
          }
        }
      }
    }
  }

  return { jsonFiles, coverageFiles };
}

/**
 * Discovery-first execution: automatically list directories from plan
 * before asking the LLM what to do. This prevents file name guessing.
 *
 * @returns Discovery results (findings, tool history, messages) or null if no plan
 */
async function executeDiscoveryFirst(
  state: SearchNodeState,
  config: NodeConfig,
  maxToolResultChars: number,
): Promise<{
  findings: Finding[];
  toolHistory: ToolHistoryEntry[];
  messages: BaseMessage[];
} | null> {
  const plan = state.plan;
  if (!plan) return null;

  // Get directories to discover from plan
  const targetDirs = plan.targetDirectories || [];
  if (targetDirs.length === 0) return null;

  const findings: Finding[] = [];
  const toolHistory: ToolHistoryEntry[] = [];
  const messages: BaseMessage[] = [];

  // Add AI message indicating discovery phase
  messages.push(
    new AIMessage(
      `Executing discovery phase: listing ${targetDirs.length} target director${targetDirs.length === 1 ? 'y' : 'ies'} from plan`,
    ),
  );

  for (const dir of targetDirs) {
    try {
      const result = await config.toolRegistry.executeTool('list_directory', {
        path: dir,
      });

      const dirResult = result as {
        path?: string;
        items?: Array<{ name: string; type: string }>;
        error?: string;
      };

      const resultString = JSON.stringify(result, null, 2);
      const truncatedResult = truncateContent(resultString, maxToolResultChars);

      toolHistory.push({
        tool: 'list_directory',
        args: { path: dir },
        result: truncatedResult,
        timestamp: new Date(),
      });

      // Add tool result to messages for LLM context
      messages.push(
        new ToolMessage({
          content: truncatedResult,
          tool_call_id: `discovery-${Date.now()}-${dir}`,
        }),
      );

      // Extract finding from directory listing
      if (dirResult.items && dirResult.items.length > 0) {
        findings.push({
          source: dirResult.path || dir,
          content: dirResult.items.map((i) => `${i.type}: ${i.name}`).join('\n'),
          relevance: 'Directory listing (discovery phase)',
        });

        config.logger?.log(`Discovery: Found ${dirResult.items.length} items in ${dir}`);
      } else if (dirResult.error) {
        config.logger?.warn(`Discovery: ${dir} - ${dirResult.error}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      config.logger?.warn(`Discovery failed for ${dir}: ${errorMessage}`);

      toolHistory.push({
        tool: 'list_directory',
        args: { path: dir },
        result: `Error: ${errorMessage}`,
        timestamp: new Date(),
      });

      messages.push(
        new ToolMessage({
          content: `Error listing ${dir}: ${errorMessage}`,
          tool_call_id: `discovery-error-${Date.now()}`,
        }),
      );
    }
  }

  return { findings, toolHistory, messages };
}

/**
 * Generic search/exploration node that executes tool calls.
 *
 * @param options - Optional customization options
 * @returns Node factory function
 */
export function createSearchNode<TState extends SearchNodeState>(options: SearchNodeOptions = {}) {
  // Configure limits with sensible defaults
  // Reduced from 100K to 50K to control token usage while still allowing thorough exploration
  const maxToolResultChars = options.maxToolResultChars ?? 10000;
  const maxContextChars = options.maxContextChars ?? 50000; // ~12.5K tokens
  const enableDiscoveryFirst = options.enableDiscoveryFirst ?? true;
  const discoveryOnlyFirstIteration = options.discoveryOnlyFirstIteration ?? false;

  return (config: NodeConfig) =>
    async (state: TState): Promise<Partial<TState>> => {
      const newFindings: Finding[] = [];
      const newToolHistory: ToolHistoryEntry[] = [];
      const newMessages: BaseMessage[] = [];

      // Discovery-first pattern: On first iteration, automatically list target directories
      // This prevents the LLM from guessing file names without knowing what exists
      const isFirstIteration = state.iteration === 0;
      let discoveryResults: Awaited<ReturnType<typeof executeDiscoveryFirst>> = null;

      if (enableDiscoveryFirst && isFirstIteration && state.plan) {
        config.logger?.log('Search node: Executing discovery-first pattern');
        discoveryResults = await executeDiscoveryFirst(state, config, maxToolResultChars);

        if (discoveryResults) {
          newFindings.push(...discoveryResults.findings);
          newToolHistory.push(...discoveryResults.toolHistory);
          newMessages.push(...discoveryResults.messages);

          // If discovery-only mode, return after discovery without LLM call
          if (discoveryOnlyFirstIteration && discoveryResults.findings.length > 0) {
            config.logger?.log(
              `Discovery-only mode: Found ${discoveryResults.findings.length} findings, skipping LLM call`,
            );
            return {
              findings: newFindings,
              toolHistory: newToolHistory,
              messages: newMessages,
              iteration: state.iteration + 1,
            } as Partial<TState>;
          }
        }
      }

      // Get tools from all specified categories
      const tools = getToolsFromCategories(config.toolRegistry, options.toolCategories);

      // Build prompt with discovery context if available
      const prompt =
        options.customPrompt || getDefaultSearchPrompt(state, discoveryResults?.findings || []);

      // Build message history for context, truncating if needed
      const allMessages: BaseMessage[] = [
        ...state.messages,
        ...newMessages, // Include discovery messages
        new HumanMessage(prompt),
      ];

      // Truncate message history to fit context limit
      const messages = truncateMessagesToFit(allMessages, maxContextChars);

      if (messages.length < allMessages.length) {
        config.logger?.warn(
          `Truncated message history from ${allMessages.length} to ${messages.length} messages to fit context limit`,
        );
      }

      const response = await config.llmService.invoke({
        messages: messages.map((m) => ({
          role: m._getType() === 'human' ? 'user' : 'assistant',
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        })),
        tools,
        taskType: AgentTaskType.CHAT,
        agentName: 'search-node',
        purpose: 'execute-exploration',
      });

      // Execute tool calls from LLM
      const toolCalls = response.toolCalls || [];
      const maxTools = options.maxToolsPerIteration || toolCalls.length;

      // Add AI message with tool calls
      if (response.content || toolCalls.length > 0) {
        newMessages.push(new AIMessage(response.content || 'Executing tools...'));
      }

      // Track highest evidence level achieved this iteration
      let maxEvidenceLevel: EvidenceLevel = 0;
      const newLimitations: string[] = [];

      for (const toolCall of toolCalls.slice(0, maxTools)) {
        try {
          const result = await config.toolRegistry.executeTool(toolCall.name, toolCall.arguments);

          const resultString =
            typeof result === 'string' ? result : JSON.stringify(result, null, 2);

          // Truncate tool results to prevent context explosion
          const truncatedResult = truncateContent(resultString, maxToolResultChars);

          // Classify the tool result quality
          const { quality, signals } = classifyToolResult(
            toolCall.name,
            toolCall.arguments,
            result,
            truncatedResult,
          );

          // Log quality issues and suggest better tools
          if (quality !== 'ok') {
            config.logger?.warn(`Tool ${toolCall.name} result quality: ${quality}`);
            if (quality === 'truncated' || quality === 'partial') {
              newLimitations.push(`${toolCall.name} result was ${quality} - may be missing data`);
            }

            // Suggest a better tool if available
            const suggestion = suggestBetterTool(
              toolCall.name,
              toolCall.arguments,
              quality,
              signals,
            );
            if (suggestion) {
              config.logger?.log(`Tool suggestion: ${suggestion}`);
              newLimitations.push(suggestion);
            }
          }

          newToolHistory.push({
            tool: toolCall.name,
            args: toolCall.arguments,
            result: truncatedResult,
            timestamp: new Date(),
            quality,
            signals,
          });

          // Add truncated tool result to message history for LLM context
          newMessages.push(
            new ToolMessage({
              content: truncatedResult,
              tool_call_id: toolCall.id || `tool-${Date.now()}`,
            }),
          );

          // Extract findings with parse metadata
          const finding = extractFindingFromToolResult(
            toolCall.name,
            toolCall.arguments,
            result,
            quality,
            signals,
          );

          if (finding) {
            newFindings.push(finding);
            const evidenceLevel = getEvidenceLevelFromFinding(finding);
            if (evidenceLevel > maxEvidenceLevel) {
              maxEvidenceLevel = evidenceLevel;
            }
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          config.logger?.warn(`Tool ${toolCall.name} failed: ${errorMessage}`);

          const errorResult = `Error: ${errorMessage}`;
          newToolHistory.push({
            tool: toolCall.name,
            args: toolCall.arguments,
            result: errorResult,
            timestamp: new Date(),
            quality: 'error',
            signals: { isTruncated: false, bytesSeen: errorResult.length },
          });

          // Add error as tool message for LLM awareness
          newMessages.push(
            new ToolMessage({
              content: errorResult,
              tool_call_id: toolCall.id || `tool-${Date.now()}`,
            }),
          );

          newLimitations.push(`Tool ${toolCall.name} failed: ${errorMessage}`);
        }
      }

      return {
        findings: newFindings,
        toolHistory: newToolHistory,
        messages: newMessages,
        iteration: state.iteration + 1,
        evidenceLevel: maxEvidenceLevel,
        limitations: newLimitations,
      } as Partial<TState>;
    };
}

/**
 * Default search prompt template
 *
 * @param state - Current search state
 * @param discoveryFindings - Findings from discovery-first phase (if any)
 */
function getDefaultSearchPrompt<TState extends SearchNodeState>(
  state: TState,
  discoveryFindings: Finding[] = [],
): string {
  const plan = state.plan;

  // Format plan information with emphasis on file patterns
  let planInfo = '';
  if (plan) {
    planInfo = `
## Search Plan (FOLLOW THIS)

Strategy: ${plan.strategy || 'Explore and gather information'}

Target Directories: ${(plan.targetDirectories || []).join(', ') || 'Not specified'}

File Patterns to Look For:
${(plan.filePatterns || []).map((p) => `- ${p}`).join('\n') || '- Not specified'}

Search Terms: ${(plan.searchTerms || []).join(', ') || 'Not specified'}

Actions:
${(plan.actions || []).map((a, i) => `${i + 1}. ${a}`).join('\n') || '- Not specified'}
`;
  }

  // Combine existing findings with discovery findings
  const allFindings = [...state.findings, ...discoveryFindings];
  // Use compact format after iteration 2 to reduce token usage
  const findingsInfo = formatFindingsForPrompt(allFindings, state.iteration);

  // Show what files were discovered (critical for avoiding guessing)
  let discoveredFilesInfo = '';
  if (discoveryFindings.length > 0) {
    discoveredFilesInfo = `
## Discovered Files (from directory listings above)
Use ONLY these file names - do NOT guess file names that weren't listed.
`;
  }

  // Extract paths mentioned in findings content - critical for knowledge chaining
  const discoveredPaths = extractDiscoveredPaths(allFindings);
  let pathsToExplore = '';
  if (discoveredPaths.length > 0) {
    // Add tool suggestions for each discovered path
    const pathsWithTools = discoveredPaths.map((p) => {
      const tool = suggestToolForFile(p);
      if (tool === 'read_file') {
        return `- ${p}`;
      }
      return `- ${p} (use ${tool})`;
    });
    pathsToExplore = `
## IMPORTANT: Paths Discovered in File Contents
The following paths were mentioned in files you've read. You MUST explore these to complete your task:
${pathsWithTools.join('\n')}

**ACTION REQUIRED**: If any of these paths are relevant to your task, use list_directory to see what files exist there, then read the relevant files.
`;
  }

  // Suggest appropriate tools based on discovered file types
  const { jsonFiles, coverageFiles } = identifyFileTypesInFindings(allFindings);
  let toolSuggestions = '';
  if (coverageFiles.length > 0) {
    toolSuggestions += `
## Tool Suggestion: Coverage Files Found
Use read_coverage_report for these files (parses coverage data properly):
${coverageFiles.map((f) => `- ${f}`).join('\n')}
`;
  } else if (jsonFiles.length > 0) {
    toolSuggestions += `
## Tool Suggestion: JSON Files Found
Use read_json for JSON files (parses and validates the data):
${jsonFiles
  .slice(0, 5)
  .map((f) => `- ${f}`)
  .join('\n')}${jsonFiles.length > 5 ? `\n... and ${jsonFiles.length - 5} more` : ''}
`;
  }

  // Build rules based on iteration
  const isFirstIteration = state.iteration === 0;
  const rules = isFirstIteration
    ? getFirstIterationRules(plan)
    : getSubsequentIterationRules(discoveredPaths.length > 0);

  return `You are exploring a codebase to complete a task.

## Task
${state.input}
${planInfo}
${discoveredFilesInfo}${pathsToExplore}${toolSuggestions}
## Previous Findings
${findingsInfo}

## Progress
Iteration: ${state.iteration + 1} of ${state.maxIterations}

## ${rules}

Based on the plan and discovered information, what tool calls should you make next?`;
}

/**
 * Rules for first iteration - focus on discovery
 */
function getFirstIterationRules(plan: Plan | null | undefined): string {
  return `CRITICAL RULES FOR FIRST ITERATION:
1. Directory listings have been provided above - USE THEM to find actual file names
2. Do NOT guess file names - only read files that appear in the directory listings
3. Match files against the plan's filePatterns: ${(plan?.filePatterns || []).join(', ') || 'any relevant files'}
4. Read the most relevant files that match the plan's patterns
5. Use read_json for .json files, read_coverage_report for coverage files`;
}

/**
 * Rules for subsequent iterations - focus on following discovered information
 */
function getSubsequentIterationRules(hasDiscoveredPaths: boolean): string {
  const baseRules = `RULES:
1. FOLLOW DISCOVERED PATHS: If you found a path reference in a config file, you MUST explore it
2. Use information from previous findings - don't re-read files already read
3. Only read files that appear in directory listings - never guess names
4. Use read_json for .json files, read_coverage_report for coverage files`;

  if (hasDiscoveredPaths) {
    return (
      baseRules +
      `
5. CRITICAL: Paths listed in "Paths Discovered in File Contents" must be explored if relevant to your task
6. If a config pointed to a directory, list that directory and read the files inside`
    );
  }

  return (
    baseRules +
    `
5. If you have enough information to answer the question, stop searching
6. Focus on completing the task with minimal additional tool calls`
  );
}
