/**
 * Synthesize Node
 *
 * Generates the final output from accumulated findings.
 * Supports customizable formatting and citation options.
 *
 * Implements proof-carrying synthesis:
 * - Partitions findings by parse quality (parsed vs raw)
 * - Requires parse proofs for numeric claims
 * - Includes limitations discovered during exploration
 */

import { NodeConfig } from './types';
import { AgentTaskType } from '../../../../common/llm/providers/types';
import { BaseExplorationStateType, Finding, EvidenceLevel } from '../types/base-state';
import { compactFinding, deduplicateFindingsBySource } from '../utils/finding-compactor';

/**
 * Default timeout for synthesize operations (90 seconds)
 * Higher than default because synthesis aggregates large context
 */
export const SYNTHESIZE_TIMEOUT_MS = 90_000;

/**
 * Options for customizing synthesize node behavior
 */
export interface SynthesizeNodeOptions {
  /** Custom synthesis prompt */
  customPrompt?: string;
  /** Output format instructions */
  formatInstructions?: string;
  /** Include citations (default: true) */
  includeCitations?: boolean;
  /** Custom timeout in ms (default: 90s) */
  timeout?: number;
  /** Require parse proofs for numeric claims (default: true) */
  requireParseProofs?: boolean;
  /** Include limitations section (default: true) */
  includeLimitations?: boolean;
}

/**
 * Partitioned findings by parse quality
 */
interface PartitionedFindings {
  /** Findings with successful parse metadata (high confidence) */
  parsed: Finding[];
  /** Findings without parse metadata or failed parse (lower confidence) */
  raw: Finding[];
  /** Findings with computed facts (highest confidence) */
  computed: Finding[];
}

/**
 * Synthesize node that generates the final output from findings.
 *
 * @param options - Optional customization options
 * @returns Node factory function
 */
export function createSynthesizeNode<TState extends BaseExplorationStateType>(
  options: SynthesizeNodeOptions = {},
) {
  return (config: NodeConfig) =>
    async (state: TState): Promise<Partial<TState>> => {
      const prompt = options.customPrompt || getDefaultSynthesizePrompt(state, options);

      const response = await config.llmService.invoke({
        messages: [{ role: 'user', content: prompt }],
        tools: [], // No tools - force synthesis
        // Use ANALYSIS for better reasoning models (Sonnet, GPT-5.2)
        // SUMMARIZATION routes to cheap models (nano, haiku) which are too slow for synthesis
        taskType: AgentTaskType.ANALYSIS,
        agentName: 'synthesize-node',
        purpose: 'generate-output',
        // Synthesize needs longer timeout due to large accumulated context
        timeout: options.timeout || SYNTHESIZE_TIMEOUT_MS,
        // Skip retries - fail fast to fallback provider instead of wasting time
        skipRetries: true,
      });

      return {
        output: response.content,
        isComplete: true,
      } as Partial<TState>;
    };
}

/**
 * Partition findings by parse quality.
 * Deduplicates findings by source first to avoid redundant content.
 */
function partitionFindings(findings: Finding[]): PartitionedFindings {
  const result: PartitionedFindings = {
    parsed: [],
    raw: [],
    computed: [],
  };

  // Deduplicate by source, keeping highest evidence level
  const deduped = deduplicateFindingsBySource(findings);

  for (const finding of deduped) {
    if (finding.computedFacts && Object.keys(finding.computedFacts).length > 0) {
      result.computed.push(finding);
    } else if (finding.parseMetadata?.parseSuccess) {
      result.parsed.push(finding);
    } else {
      result.raw.push(finding);
    }
  }

  return result;
}

/**
 * Maximum content length to include in synthesis prompt.
 * Longer content is compacted to a summary.
 */
const MAX_CONTENT_LENGTH_FOR_SYNTHESIS = 500;

/**
 * Format facts as bullet points
 */
function formatFacts(facts: Record<string, unknown>, header: string): string[] {
  const lines = [header];
  for (const [key, value] of Object.entries(facts)) {
    lines.push(`- ${key}: ${JSON.stringify(value)}`);
  }
  return lines;
}

/**
 * Format parse metadata if available
 */
function formatParseMetadata(finding: Finding): string[] {
  const lines: string[] = [];
  const meta = finding.parseMetadata;
  if (!meta) return lines;

  if (meta.format) lines.push(`_Format: ${meta.format}_`);
  if (meta.topLevelKeys?.length) lines.push(`_Keys: ${meta.topLevelKeys.join(', ')}_`);
  return lines;
}

/**
 * Format finding content - full for short, compact for long
 */
function formatFindingContent(finding: Finding): string[] {
  const compact = compactFinding(finding);

  // For computed facts, always include the facts directly
  if (finding.computedFacts && Object.keys(finding.computedFacts).length > 0) {
    return formatFacts(finding.computedFacts, '\n**Computed Facts:**');
  }

  // Short content - include verbatim
  if (finding.content.length <= MAX_CONTENT_LENGTH_FOR_SYNTHESIS) {
    return [finding.content];
  }

  // Long content - use compact summary
  const lines = [`_Summary: ${compact.summary}_`];
  if (compact.facts && Object.keys(compact.facts).length > 0) {
    lines.push(...formatFacts(compact.facts, '\n**Extracted Facts:**'));
  }
  return lines;
}

/**
 * Format a single finding for the prompt.
 * Uses compacted format for large content to reduce token usage.
 */
function formatFinding(finding: Finding, includeMetadata: boolean): string {
  const lines: string[] = [`### ${finding.source}`];
  const compact = compactFinding(finding);

  if (includeMetadata) {
    lines.push(...formatParseMetadata(finding));
  }

  lines.push(...formatFindingContent(finding));

  if (finding.truncated) {
    lines.push('\n_Note: This content was truncated_');
  }

  lines.push(`_Type: ${compact.type}, Confidence: ${Math.round(compact.confidence * 100)}%_`);

  return lines.join('\n');
}

/**
 * Format a section of findings
 */
function formatFindingsSection(
  title: string,
  description: string,
  findings: Finding[],
  includeMetadata: boolean,
): string[] {
  const formattedFindings = findings.map((f) => formatFinding(f, includeMetadata));
  return [title, description, ...formattedFindings];
}

/**
 * Format partitioned findings for the prompt
 */
function formatPartitionedFindings(
  partitioned: PartitionedFindings,
  requireParseProofs: boolean,
): string {
  const sections: string[] = [];

  // Computed facts section (highest trust)
  if (partitioned.computed.length > 0) {
    const computedSection = formatFindingsSection(
      '## COMPUTED FACTS (Highest Confidence)',
      '_These findings contain server-side computed values. Use these for any numeric claims._\n',
      partitioned.computed,
      true,
    );
    sections.push(...computedSection);
  }

  // Parsed data section (high trust)
  if (partitioned.parsed.length > 0) {
    const parsedSection = formatFindingsSection(
      '\n## PARSED DATA (High Confidence)',
      '_These findings were successfully parsed as structured data._\n',
      partitioned.parsed,
      true,
    );
    sections.push(...parsedSection);
  }

  // Raw data section (lower trust)
  if (partitioned.raw.length > 0) {
    const rawDescription = requireParseProofs
      ? '_These findings could not be parsed. Do NOT use for numeric claims without explicit caveats._\n'
      : '_These findings are raw text without parse metadata._\n';
    const rawSection = formatFindingsSection(
      '\n## RAW DATA (Lower Confidence)',
      rawDescription,
      partitioned.raw,
      false,
    );
    sections.push(...rawSection);
  }

  return sections.join('\n');
}

/**
 * Get evidence level description for the prompt
 */
function getEvidenceLevelDescription(level: EvidenceLevel): string {
  switch (level) {
    case 0:
      return 'None - No evidence gathered';
    case 1:
      return 'Directory listings only - File structure known but no content read';
    case 2:
      return 'Raw file reads - Text content gathered but not parsed';
    case 3:
      return 'Parsed structured data - JSON/YAML/etc successfully parsed';
    case 4:
      return 'Computed facts - Server-side aggregated values available';
  }
}

/**
 * Default synthesis prompt template with proof-carrying synthesis
 */
function getDefaultSynthesizePrompt<TState extends BaseExplorationStateType>(
  state: TState,
  options: SynthesizeNodeOptions,
): string {
  const formatInstructions = options.formatInstructions || '';
  const requireParseProofs = options.requireParseProofs !== false;
  const includeLimitations = options.includeLimitations !== false;

  const citationInstruction =
    options.includeCitations !== false ? '2. Cite sources (file paths) for key facts\n' : '';

  // Partition findings by quality
  const partitioned = partitionFindings(state.findings);
  const findingsContent = formatPartitionedFindings(partitioned, requireParseProofs);

  // Format tool history without nested templates
  let toolHistorySummary = '';
  if (state.toolHistory.length > 0) {
    const toolLines = state.toolHistory.map((t) => {
      const qualitySuffix = t.quality ? ' (' + t.quality + ')' : '';
      return '- ' + t.tool + qualitySuffix;
    });
    toolHistorySummary =
      '\n\nTools used (' + state.toolHistory.length + ' calls):\n' + toolLines.join('\n');
  }

  // Evidence level summary
  const evidenceDescription = getEvidenceLevelDescription(state.evidenceLevel);
  const evidenceLevelInfo =
    '\nEvidence Level: ' + state.evidenceLevel + ' - ' + evidenceDescription;

  // Limitations section
  let limitationsSection = '';
  if (includeLimitations && state.limitations && state.limitations.length > 0) {
    const limitationLines = state.limitations.map((l) => '- ' + l);
    limitationsSection = '\n\nKNOWN LIMITATIONS:\n' + limitationLines.join('\n');
  }

  // Proof requirements section
  const proofRequirements = requireParseProofs
    ? `
PROOF REQUIREMENTS:
- Numeric claims (percentages, counts, metrics) MUST come from COMPUTED FACTS or PARSED DATA sections
- If you cite a number from RAW DATA, explicitly state "based on unparsed text" or similar caveat
- When evidence level is below 3, acknowledge that values may be approximate
`
    : '';

  return `Based on your research, provide a comprehensive response.

Task: ${state.input}
${evidenceLevelInfo}${toolHistorySummary}${limitationsSection}

FINDINGS:
${findingsContent || 'No specific findings were gathered.'}
${proofRequirements}
REQUIREMENTS:
1. Include specific data from the findings (numbers, metrics, actual content)
${citationInstruction}3. If findings are incomplete, acknowledge what couldn't be determined
4. Be direct and informative
5. Acknowledge any limitations that affected the analysis
${formatInstructions}

Provide your final response:`;
}
