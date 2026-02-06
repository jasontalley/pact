/**
 * Base State Definitions
 *
 * Provides base state annotations that all exploration-type graphs can extend.
 * Uses LangGraph's Annotation system for type-safe state management.
 */

import { Annotation } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';

// Forward declaration for deduplication - actual implementation in utils/finding-compactor.ts
// to avoid circular dependency, we inline the evidence level logic here
function getEvidenceLevel(finding: {
  computedFacts?: Record<string, unknown>;
  parseMetadata?: { parseSuccess?: boolean };
  relevance?: string;
}): number {
  if (finding.computedFacts && Object.keys(finding.computedFacts).length > 0) return 4;
  if (finding.parseMetadata?.parseSuccess) return 3;
  if (
    finding.relevance === 'Directory listing' ||
    finding.relevance === 'Directory listing (discovery phase)'
  )
    return 1;
  return 2;
}

/**
 * Tool result quality classification
 * Used to determine if a tool call actually succeeded in a meaningful way
 */
export type ToolResultQuality =
  | 'ok' // Result is complete and usable
  | 'partial' // Result is truncated or incomplete
  | 'truncated' // Explicitly truncated due to size limits
  | 'wrong_target' // Got a result but for wrong scope (e.g., backend when wanted frontend)
  | 'unreadable' // Could not parse or understand the result
  | 'error'; // Tool execution failed

/**
 * Signals about the tool result for debugging and decision-making
 */
export interface ToolResultSignals {
  /** Whether the result was truncated */
  isTruncated: boolean;
  /** Number of bytes/characters actually seen */
  bytesSeen: number;
  /** Expected total bytes if known */
  expectedBytes?: number;
  /** Guessed MIME type of content */
  mimeGuess?: string;
  /** Whether a parse was attempted */
  parseAttempted?: boolean;
  /** Whether the parse succeeded */
  parseSuccess?: boolean;
  /** Parse error message if failed */
  parseError?: string;
  /** For partial reads: lines read vs total */
  linesRead?: number;
  /** For partial reads: total lines in file */
  totalLines?: number;
}

/**
 * Parse metadata for structured content
 */
export interface ParseMetadata {
  /** Whether content was successfully parsed */
  parseSuccess: boolean;
  /** Format that was parsed (json, yaml, coverage, etc.) */
  format?: string;
  /** Schema summary for large structured data */
  schemaSummary?: string;
  /** Keys found at top level */
  topLevelKeys?: string[];
  /** Parse error if failed */
  parseError?: string;
}

/**
 * Finding from a tool execution (file read, search, etc.)
 */
export interface Finding {
  /** Source of the finding (file path, tool name, etc.) */
  source: string;
  /** The actual content/data found */
  content: string;
  /** Brief description of relevance to the task */
  relevance: string;
  /** Parse metadata for structured content */
  parseMetadata?: ParseMetadata;
  /** Whether the content was truncated */
  truncated?: boolean;
  /** Computed/extracted facts from parsed content */
  computedFacts?: Record<string, unknown>;
  /** Confidence in the finding (0-1) */
  confidence?: number;
}

/**
 * Compacted finding for context efficiency.
 * Used after iteration 2 to reduce token usage while preserving key information.
 */
export interface CompactFinding {
  /** Source of the finding (file path, tool name, etc.) */
  source: string;
  /** Type of finding for appropriate handling */
  type: 'directory' | 'file' | 'search' | 'computed';
  /** Brief summary (max 200 chars) */
  summary: string;
  /** Extracted data points from parsed content */
  facts?: Record<string, unknown>;
  /** Confidence in the finding (0-1) */
  confidence: number;
}

/**
 * Record of a tool call for transparency and debugging
 */
export interface ToolHistoryEntry {
  /** Name of the tool called */
  tool: string;
  /** Arguments passed to the tool */
  args: Record<string, unknown>;
  /** Result from the tool (truncated if large) */
  result: string;
  /** When the tool was called */
  timestamp: Date;
  /** Quality classification of the result */
  quality?: ToolResultQuality;
  /** Signals about the result */
  signals?: ToolResultSignals;
}

/**
 * Evidence levels for the evidence ladder
 * Each level represents increasing quality of gathered information
 */
export type EvidenceLevel =
  | 0 // Nothing gathered
  | 1 // Directory listings only
  | 2 // File reads (raw text)
  | 3 // Parsed structured data
  | 4; // Computed/aggregated facts

/**
 * Base state that all exploration-type graphs can extend.
 * Provides common fields for iteration tracking, findings, and messages.
 */
export const BaseExplorationState = Annotation.Root({
  // The original question/task
  input: Annotation<string>({
    reducer: (_, update) => update,
    default: () => '',
  }),

  // Accumulated findings from tool calls
  // Deduplicates by source, keeping the finding with higher evidence level
  findings: Annotation<Finding[]>({
    reducer: (current, update) => {
      const map = new Map<string, Finding>();
      for (const f of [...current, ...update]) {
        const existing = map.get(f.source);
        if (!existing || getEvidenceLevel(f) > getEvidenceLevel(existing)) {
          map.set(f.source, f);
        }
      }
      return Array.from(map.values());
    },
    default: () => [],
  }),

  // Tool call history for transparency
  toolHistory: Annotation<ToolHistoryEntry[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  // Iteration tracking
  iteration: Annotation<number>({
    reducer: (_, update) => update,
    default: () => 0,
  }),

  maxIterations: Annotation<number>({
    reducer: (_, update) => update,
    default: () => 5,
  }),

  // Completion flag
  isComplete: Annotation<boolean>({
    reducer: (_, update) => update,
    default: () => false,
  }),

  // Final output
  output: Annotation<string | null>({
    reducer: (_, update) => update,
    default: () => null,
  }),

  // LLM message history
  messages: Annotation<BaseMessage[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  // Error tracking
  errors: Annotation<string[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  // Evidence level tracking (for evidence ladder)
  evidenceLevel: Annotation<EvidenceLevel>({
    reducer: (current, update) => Math.max(current, update) as EvidenceLevel,
    default: () => 0 as EvidenceLevel,
  }),

  // Limitations discovered during exploration
  limitations: Annotation<string[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
});

export type BaseExplorationStateType = typeof BaseExplorationState.State;
