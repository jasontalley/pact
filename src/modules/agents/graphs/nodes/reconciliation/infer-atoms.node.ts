/**
 * Infer Atoms Node
 *
 * Uses the `infer_atom_from_test` tool to infer Intent Atoms from test context.
 * Enforces observable-outcomes-only semantics.
 *
 * **Dependency-Aware Inference (Phase 3.4)**:
 * - Considers file dependency relationships when inferring atoms
 * - Tests for heavily-depended-upon modules may receive confidence boost
 * - Dependency context is included in inference prompts for better LLM understanding
 *
 * @see docs/implementation-checklist-phase5.md Section 1.8
 * @see docs/implementation-checklist-phase5.md Section 2.3 (refactored to use tools)
 * @see docs/implementation-checklist-phase5.md Section 3.4 (dependency-aware processing)
 */

import { v4 as uuidv4 } from 'uuid';
import { NodeConfig } from '../types';
import { CancellationError } from '../../../../../common/cancellation.registry';
import { AgentTaskType } from '../../../../../common/llm/providers/types';
import {
  ReconciliationGraphStateType,
  InferredAtom,
  TestAnalysis,
  OrphanTestInfo,
  RepoStructure,
  DependencyEdge,
  EvidenceItem,
  EvidenceAnalysis,
  EvidenceSource,
  EvidenceType,
  cleanupPhaseState,
} from '../../types/reconciliation-state';
import { computeTextSimilarity } from './text-similarity';
import { parseJsonWithRecovery } from '../../../../../common/llm/json-recovery';

/**
 * Shared system prompt for all atom inference calls.
 * Extracted as a constant so Anthropic prompt caching can reuse it across calls.
 * Must be >= 1024 tokens for cache eligibility on Claude Sonnet.
 */
const ATOM_INFERENCE_SYSTEM_PROMPT = `You are an Intent Atom inference engine for a software product analysis system.

## What is an Intent Atom?
An Intent Atom is an irreducible behavioral specification — it describes WHAT a system does, not HOW it's implemented. Atoms are observable, falsifiable, and implementation-agnostic. They are the atomic unit of committed product intent.

## Critical Requirements

1. **Observable Outcomes Only**: Describe WHAT happens from a user or system perspective, not HOW it's implemented internally.
   - GOOD: "User receives email notification within 5 minutes of order placement"
   - GOOD: "Login with invalid credentials returns 401 Unauthorized"
   - BAD: "EmailService.send() is called with correct parameters"
   - BAD: "The function queries the database with a JOIN"

2. **Testable and Falsifiable**: The atom must describe a behavior that can be verified through testing or observation.
   - GOOD: "Passwords are stored securely with one-way hashing"
   - GOOD: "Cart total updates when items are added or removed"
   - BAD: "System handles authentication properly"
   - BAD: "The code is well-organized"

3. **Implementation Agnostic**: No mentions of specific classes, methods, functions, libraries, or internal technologies.
   - GOOD: "Users can search products by name, category, or price range"
   - BAD: "ProductService.search() uses Elasticsearch with fuzzy matching"
   - BAD: "The Prisma client queries the PostgreSQL database"

4. **Single Behavior**: One atom = one verifiable behavior. Do not combine multiple distinct behaviors.
   - GOOD: "User can reset password using email link"
   - BAD: "User authentication including login, logout, and password reset"

## Evidence Type Guidelines
You will analyze different types of evidence. Adapt your inference accordingly:
- **Test**: Infer the behavioral intent that the test validates. The test assertion reveals what behavior is expected.
- **Source export**: Infer what capability this exported function, class, or constant enables the system to provide.
- **UI component**: Infer what the user can DO with this component. Focus on user actions and observable outcomes.
- **API endpoint**: Infer what system capability this endpoint exposes to consumers.
- **Documentation**: Extract the behavioral intent described in the documentation section.
- **Code comment**: Extract behavioral intent from JSDoc documentation, task annotations, business rules, or atom references.
- **Coverage gap**: Infer what untested behavior this uncovered code likely implements. Use lower confidence.

## Confidence Scale (0-100)
- 90-100: Clear, unambiguous behavioral intent with strong evidence
- 70-89: Reasonable inference with minor ambiguity or interpretation
- 50-69: Moderate confidence, some interpretation required
- 30-49: Low confidence, speculative inference from limited evidence
- Below 30: Very speculative, mostly guesswork

## Response Format
Respond with JSON only. Do not include markdown fences, explanations, or any text outside the JSON object:
{
  "description": "Clear, behavior-focused description (1-2 sentences)",
  "category": "functional|security|performance|reliability|usability",
  "observableOutcomes": ["Outcome 1 that can be verified", "Outcome 2 if applicable"],
  "confidence": 0-100,
  "ambiguityReasons": ["Reason for uncertainty (if confidence < 80)"],
  "reasoning": "Brief explanation of how you derived this atom from the evidence"
}`;

/**
 * Options for customizing infer atoms node behavior
 */
export interface InferAtomsNodeOptions {
  /** Batch size for LLM calls */
  batchSize?: number;
  /** Custom inference prompt template */
  customPrompt?: string;
  /** Minimum confidence threshold to include atom (0-100) */
  minConfidence?: number;
  /** Use tool-based inference (default: true) */
  useTool?: boolean;
  /** Use dependency information to enhance inference (default: true) */
  useDependencyContext?: boolean;
  /** Confidence boost for foundational modules (0-20, default: 10) */
  foundationalBoost?: number;
  /** Similarity threshold for pre-LLM evidence dedup (0-1, default: 0.6). Set to 0 to disable. */
  preLlmDedupThreshold?: number;
  /** Max evidence items to process per type. Uncapped types process all items. */
  evidenceCaps?: Partial<Record<EvidenceType, number>>;
}

/**
 * Dependency context for a test file.
 * Used to provide additional context to the LLM for better inference.
 */
interface DependencyContext {
  /** Number of files that depend on this file's source */
  dependentCount: number;
  /** Number of files this file's source depends on */
  dependencyCount: number;
  /** Whether this is a foundational module (many dependents, few dependencies) */
  isFoundational: boolean;
  /** List of direct dependents (files that import this) */
  directDependents: string[];
  /** List of direct dependencies (files this imports) */
  directDependencies: string[];
}

/**
 * Build dependency context for a test file.
 *
 * @param test - The orphan test
 * @param repoStructure - Repository structure with dependency edges
 * @returns Dependency context or null if not available
 */
function buildDependencyContext(
  test: OrphanTestInfo,
  repoStructure: RepoStructure | null,
): DependencyContext | null {
  if (!repoStructure?.dependencyEdges || repoStructure.dependencyEdges.length === 0) {
    return null;
  }

  const edges = repoStructure.dependencyEdges;

  // Get the source file(s) this test is likely testing
  const sourceFiles = test.relatedSourceFiles || [];
  if (sourceFiles.length === 0) {
    // Try to infer from test file path
    const testPath = test.filePath;
    const potentialSource = testPath
      .replace(/\.spec\.ts$/, '.ts')
      .replace(/\.test\.ts$/, '.ts')
      .replace(/\.e2e-spec\.ts$/, '.ts');
    if (potentialSource !== testPath) {
      sourceFiles.push(potentialSource);
    }
  }

  if (sourceFiles.length === 0) {
    return null;
  }

  // Count dependents and dependencies for all related source files
  const directDependents = new Set<string>();
  const directDependencies = new Set<string>();

  for (const sourceFile of sourceFiles) {
    for (const edge of edges) {
      // Files that import this source (dependents)
      if (edge.to === sourceFile) {
        directDependents.add(edge.from);
      }
      // Files that this source imports (dependencies)
      if (edge.from === sourceFile) {
        directDependencies.add(edge.to);
      }
    }
  }

  const dependentCount = directDependents.size;
  const dependencyCount = directDependencies.size;

  // A module is "foundational" if it has many dependents but few dependencies
  // This suggests it's a core utility or shared module
  const isFoundational = dependentCount >= 3 && dependencyCount <= 2;

  return {
    dependentCount,
    dependencyCount,
    isFoundational,
    directDependents: Array.from(directDependents).slice(0, 5), // Limit for prompt size
    directDependencies: Array.from(directDependencies).slice(0, 5),
  };
}

/**
 * Schema for LLM response
 */
interface InferenceResponse {
  description: string;
  category: string;
  observableOutcomes: string[];
  confidence: number;
  ambiguityReasons?: string[];
  reasoning: string;
}

/**
 * Default inference prompt that enforces observable-outcomes-only semantics
 */
function getInferencePrompt(
  testName: string,
  testCode: string,
  context: TestAnalysis,
  dependencyContext?: DependencyContext | null,
): string {
  // Build dependency section if available
  let dependencySection = '';
  if (dependencyContext) {
    dependencySection = `
## Dependency Analysis
- This module is ${dependencyContext.isFoundational ? '**foundational** (core utility used by many other modules)' : 'a regular module'}
- Dependents (files that use this): ${dependencyContext.dependentCount} ${dependencyContext.directDependents.length > 0 ? `(e.g., ${dependencyContext.directDependents.slice(0, 3).join(', ')})` : ''}
- Dependencies (files this uses): ${dependencyContext.dependencyCount} ${dependencyContext.directDependencies.length > 0 ? `(e.g., ${dependencyContext.directDependencies.slice(0, 3).join(', ')})` : ''}

${dependencyContext.isFoundational ? '**Note**: As a foundational module, this behavior is likely critical to multiple features. Ensure the atom description is sufficiently general to apply across all use cases.' : ''}
`;
  }

  return `You are analyzing a test to infer an Intent Atom - a description of WHAT the system should do, not HOW.

## Test Name
${testName}

## Test Code
\`\`\`typescript
${testCode}
\`\`\`

## Context
${context.summary}

Domain Concepts: ${context.domainConcepts.join(', ') || 'None identified'}
${context.relatedDocs?.length ? `\nRelated Documentation:\n${context.relatedDocs.slice(0, 2).join('\n')}` : ''}
${dependencySection}
## Instructions

Infer an Intent Atom that describes the behavioral intent this test validates.

CRITICAL REQUIREMENTS:
1. **Observable Outcomes Only**: Describe WHAT happens, not HOW it's implemented
   - GOOD: "User receives email notification within 5 minutes of order placement"
   - BAD: "EmailService.send() is called with correct parameters"

2. **Testable and Falsifiable**: The atom must be verifiable through this test
   - GOOD: "Login with invalid credentials returns 401 Unauthorized"
   - BAD: "System handles authentication properly"

3. **Implementation Agnostic**: No mentions of specific classes, methods, or technologies
   - GOOD: "Passwords are stored securely with one-way hashing"
   - BAD: "bcrypt.hash() is used with salt rounds of 10"

4. **Single Behavior**: One atom = one verifiable behavior
   - GOOD: "User can reset password using email link"
   - BAD: "User authentication including login, logout, and password reset"

## Response Format

Respond with JSON only (no markdown, no explanation):
{
  "description": "Clear, behavior-focused description (1-2 sentences)",
  "category": "functional|security|performance|reliability|usability",
  "observableOutcomes": ["Outcome 1 that can be verified", "Outcome 2 if applicable"],
  "confidence": 0-100,
  "ambiguityReasons": ["Reason for uncertainty (if confidence < 80)"],
  "reasoning": "Brief explanation of how you derived this atom from the test"
}`;
}

/**
 * Parse LLM response with fallback handling
 */
function parseInferenceResponse(response: string, testName: string): InferenceResponse | null {
  try {
    const parsed = parseJsonWithRecovery(response) as InferenceResponse | null;
    if (!parsed) {
      return null;
    }

    // Validate required fields
    if (!parsed.description || !parsed.category || !parsed.observableOutcomes) {
      return null;
    }

    // Normalize confidence to 0-100 range
    if (parsed.confidence > 1 && parsed.confidence <= 100) {
      // Already in 0-100 range
    } else if (parsed.confidence >= 0 && parsed.confidence <= 1) {
      parsed.confidence = Math.round(parsed.confidence * 100);
    } else {
      parsed.confidence = 50; // Default to medium confidence
    }

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Create a fallback atom when LLM inference fails
 */
function createFallbackAtom(test: OrphanTestInfo, context: TestAnalysis | undefined): InferredAtom {
  return {
    tempId: `temp-${uuidv4()}`,
    description: `Behavior verified by test: ${test.testName}`,
    category: 'functional',
    sourceTest: {
      filePath: test.filePath,
      testName: test.testName,
      lineNumber: test.lineNumber,
    },
    observableOutcomes: ['Test passes as expected'],
    confidence: 30, // Low confidence for fallback
    ambiguityReasons: ['LLM inference failed, using fallback'],
    reasoning: 'Fallback atom - requires manual review',
    relatedDocs: context?.relatedDocs,
  };
}

/**
 * Creates the infer atoms node for the reconciliation graph.
 *
 * This node:
 * 1. Iterates over contextPerTest
 * 2. Calls LLM with inference prompt for each test
 * 3. Parses response into InferredAtom structure
 * 4. Implements state shedding (INV-R005) by clearing raw context
 * 5. Updates state with inferredAtoms array
 *
 * @param options - Optional customization options
 * @returns Node factory function
 */
/**
 * Tool result type for infer_atom_from_test
 */
interface InferAtomToolResult {
  temp_id: string;
  description: string;
  category: string;
  observable_outcomes: string[];
  confidence: number;
  ambiguity_reasons?: string[];
  reasoning: string;
}

/**
 * Infer atom using direct LLM call (fallback when tool unavailable)
 */
async function inferAtomWithLLM(
  test: OrphanTestInfo,
  context: TestAnalysis | undefined,
  config: NodeConfig,
  customPrompt?: string,
  minConfidence: number = 0,
  dependencyContext?: DependencyContext | null,
  foundationalBoost: number = 0,
): Promise<InferredAtom | null> {
  const testKey = `${test.filePath}:${test.testName}`;

  const prompt =
    customPrompt ||
    getInferencePrompt(
      test.testName,
      test.testCode || '',
      context || {
        testId: testKey,
        summary: '',
        domainConcepts: [],
      },
      dependencyContext,
    );

  const response = await config.llmService.invoke({
    messages: [
      { role: 'system', content: ATOM_INFERENCE_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    taskType: AgentTaskType.ANALYSIS,
    agentName: 'infer-atoms-node',
    purpose: 'infer-intent-atom',
    promptCaching: true,
  });

  const parsed = parseInferenceResponse(response.content, test.testName);

  if (parsed && parsed.confidence >= minConfidence) {
    // Apply foundational boost for core modules (Phase 3.4)
    let adjustedConfidence = parsed.confidence;
    if (dependencyContext?.isFoundational && foundationalBoost > 0) {
      adjustedConfidence = Math.min(100, parsed.confidence + foundationalBoost);
    }

    return {
      tempId: `temp-${uuidv4()}`,
      description: parsed.description,
      category: parsed.category,
      sourceTest: {
        filePath: test.filePath,
        testName: test.testName,
        lineNumber: test.lineNumber,
      },
      observableOutcomes: parsed.observableOutcomes,
      confidence: adjustedConfidence,
      ambiguityReasons: parsed.ambiguityReasons,
      reasoning: parsed.reasoning,
      relatedDocs: context?.relatedDocs,
    };
  } else if (!parsed) {
    return null; // Signal to use fallback
  } else {
    return undefined as unknown as null; // Below threshold, skip
  }
}

// ============================================================================
// Phase 21C: Type-Specific Inference Prompts
// ============================================================================

function getEvidenceInferencePrompt(evidence: EvidenceItem, analysis: EvidenceAnalysis): string {
  switch (evidence.type) {
    case 'source_export':
      return getSourceInferencePrompt(evidence, analysis);
    case 'ui_component':
      return getUIInferencePrompt(evidence, analysis);
    case 'api_endpoint':
      return getAPIInferencePrompt(evidence, analysis);
    case 'documentation':
      return getDocInferencePrompt(evidence, analysis);
    case 'code_comment':
      return getCodeCommentInferencePrompt(evidence, analysis);
    case 'coverage_gap':
      return getCoverageGapInferencePrompt(evidence, analysis);
    default:
      return getGenericEvidencePrompt(evidence, analysis);
  }
}

function getSourceInferencePrompt(evidence: EvidenceItem, analysis: EvidenceAnalysis): string {
  const exportType = evidence.metadata?.exportType || 'export';
  return `You are analyzing a source code export to infer an Intent Atom.
The atom should describe WHAT this code enables the system to do, not HOW it's implemented.

## Export: ${evidence.name} (${exportType})
## File: ${evidence.filePath}

## Code
\`\`\`typescript
${evidence.code || ''}
\`\`\`

## Context
${analysis.summary}
Domain Concepts: ${analysis.domainConcepts.join(', ') || 'None identified'}

## Instructions
Infer the behavioral intent that this code realizes. Focus on the user-facing or system-facing behavior, not internal mechanics.

CRITICAL: Describe WHAT the system can do, not HOW the code works.
- GOOD: "System can create new user accounts with email verification"
- BAD: "createUser function inserts a record into the users table"

Respond with JSON only:
{
  "description": "Clear, behavior-focused description (1-2 sentences)",
  "category": "functional|security|performance|reliability|usability",
  "observableOutcomes": ["Outcome 1", "Outcome 2"],
  "confidence": 0-100,
  "ambiguityReasons": ["Reason (if confidence < 80)"],
  "reasoning": "Brief explanation"
}`;
}

function getUIInferencePrompt(evidence: EvidenceItem, analysis: EvidenceAnalysis): string {
  const framework = evidence.metadata?.framework || 'unknown';
  const traits: string[] = [];
  if (evidence.metadata?.hasForm) traits.push('contains form inputs');
  if (evidence.metadata?.hasNavigation) traits.push('contains navigation');

  return `You are analyzing a UI component to infer user-facing Intent Atoms.
Each atom should describe a behavior that a USER can perform or observe.

## Component: ${evidence.name}
## Framework: ${framework}
## File: ${evidence.filePath}
${traits.length > 0 ? `## Detected Patterns: ${traits.join(', ')}` : ''}

## Code
\`\`\`
${evidence.code || ''}
\`\`\`

## Context
${analysis.summary}
Domain Concepts: ${analysis.domainConcepts.join(', ') || 'None identified'}

## Instructions
Infer one Intent Atom describing what the user can DO with this component.
Focus on observable user actions and outcomes, not implementation.

CRITICAL: Describe user-facing behavior only.
- GOOD: "User can submit a contact form with name, email, and message"
- BAD: "ContactForm component renders three input fields"

Respond with JSON only:
{
  "description": "Clear, user-action-focused description (1-2 sentences)",
  "category": "functional|security|performance|reliability|usability",
  "observableOutcomes": ["Outcome 1", "Outcome 2"],
  "confidence": 0-100,
  "ambiguityReasons": ["Reason (if confidence < 80)"],
  "reasoning": "Brief explanation"
}`;
}

function getAPIInferencePrompt(evidence: EvidenceItem, analysis: EvidenceAnalysis): string {
  const method = evidence.metadata?.method || 'UNKNOWN';
  const routePath = evidence.metadata?.path || '/';

  return `You are analyzing an API endpoint to infer an Intent Atom.
The atom should describe the capability this endpoint provides.

## Endpoint: ${method} ${routePath}
## Handler: ${evidence.name}
## File: ${evidence.filePath}

## Code
\`\`\`typescript
${evidence.code || ''}
\`\`\`

## Context
${analysis.summary}
Domain Concepts: ${analysis.domainConcepts.join(', ') || 'None identified'}

## Instructions
Infer the behavioral intent this API endpoint realizes.
Focus on what capability it exposes, not the HTTP mechanics.

CRITICAL: Describe the business capability, not the HTTP operation.
- GOOD: "System allows retrieving a user's order history with pagination"
- BAD: "GET /users/:id/orders returns a paginated JSON response"

Respond with JSON only:
{
  "description": "Clear, capability-focused description (1-2 sentences)",
  "category": "functional|security|performance|reliability|usability",
  "observableOutcomes": ["Outcome 1", "Outcome 2"],
  "confidence": 0-100,
  "ambiguityReasons": ["Reason (if confidence < 80)"],
  "reasoning": "Brief explanation"
}`;
}

function getDocInferencePrompt(evidence: EvidenceItem, analysis: EvidenceAnalysis): string {
  return `You are analyzing documentation to infer an Intent Atom.
The atom should describe a system behavior mentioned or implied by this documentation.

## Section: ${evidence.name}
## File: ${evidence.filePath}

## Content
${evidence.code || ''}

## Context
Domain Concepts: ${analysis.domainConcepts.join(', ') || 'None identified'}

## Instructions
Infer one Intent Atom from this documentation. Only infer atoms for concrete, testable behaviors — not aspirational statements or project metadata.

If the documentation describes a specific system behavior (e.g., "users can reset their password"), infer an atom for it.
If it's purely informational (e.g., "this project uses React"), set confidence below 30.

Respond with JSON only:
{
  "description": "Clear, behavior-focused description (1-2 sentences)",
  "category": "functional|security|performance|reliability|usability",
  "observableOutcomes": ["Outcome 1", "Outcome 2"],
  "confidence": 0-100,
  "ambiguityReasons": ["Reason (if confidence < 80)"],
  "reasoning": "Brief explanation"
}`;
}

function getCoverageGapInferencePrompt(evidence: EvidenceItem, analysis: EvidenceAnalysis): string {
  const pct = evidence.metadata?.coveragePercent?.toFixed(0) || '?';
  return `You are analyzing an untested source file to infer what Intent Atom it might realize.

## File: ${evidence.filePath} (${pct}% test coverage)

## Code
\`\`\`typescript
${evidence.code || ''}
\`\`\`

## Context
${analysis.summary}
Domain Concepts: ${analysis.domainConcepts.join(', ') || 'None identified'}

## Instructions
Infer what behavioral intent this untested code likely realizes.
Set confidence proportionally lower since there are no tests to confirm the behavior.

Respond with JSON only:
{
  "description": "Clear, behavior-focused description (1-2 sentences)",
  "category": "functional|security|performance|reliability|usability",
  "observableOutcomes": ["Outcome 1", "Outcome 2"],
  "confidence": 0-100,
  "ambiguityReasons": ["Reason"],
  "reasoning": "Brief explanation"
}`;
}

function getCodeCommentInferencePrompt(evidence: EvidenceItem, analysis: EvidenceAnalysis): string {
  const commentType = evidence.metadata?.commentType || 'comment';
  const commentTypeLabels: Record<string, string> = {
    jsdoc: 'JSDoc documentation',
    task_annotation: 'task annotation',
    atom_reference: '@atom reference',
    business_logic: 'business logic comment',
  };
  const typeLabel = commentTypeLabels[commentType] || 'business logic comment';

  return `You are analyzing an inline code comment to infer an Intent Atom.
The comment may describe behavioral intent, business rules, or system constraints.

## Comment Type: ${typeLabel}
## File: ${evidence.filePath}

## Comment
${evidence.code || ''}

## Context
${analysis.summary}
Domain Concepts: ${analysis.domainConcepts.join(', ') || 'None identified'}

## Instructions
Infer the behavioral intent described or implied by this comment.
- JSDoc: Extract the behavioral capability the documented code provides
- Task annotations: Infer what behavior is incomplete or needs attention
- Business logic: Extract the rule or constraint being enforced
- @atom references: Describe the behavior the referenced atom represents

Only infer an atom if the comment describes a concrete, testable behavior.
If the comment is purely technical (e.g., "increase buffer size") with no user-facing behavior, set confidence below 30.

Respond with JSON only:
{
  "description": "Clear, behavior-focused description (1-2 sentences)",
  "category": "functional|security|performance|reliability|usability",
  "observableOutcomes": ["Outcome 1", "Outcome 2"],
  "confidence": 0-100,
  "ambiguityReasons": ["Reason (if confidence < 80)"],
  "reasoning": "Brief explanation"
}`;
}

function getGenericEvidencePrompt(evidence: EvidenceItem, analysis: EvidenceAnalysis): string {
  return `You are analyzing code evidence to infer an Intent Atom.

## Evidence: ${evidence.name} (${evidence.type})
## File: ${evidence.filePath}

## Code
\`\`\`
${evidence.code || ''}
\`\`\`

## Context
${analysis.summary}
Domain Concepts: ${analysis.domainConcepts.join(', ') || 'None identified'}

Infer the behavioral intent. Respond with JSON only:
{
  "description": "Clear description (1-2 sentences)",
  "category": "functional|security|performance|reliability|usability",
  "observableOutcomes": ["Outcome 1"],
  "confidence": 0-100,
  "ambiguityReasons": ["Reason"],
  "reasoning": "Brief explanation"
}`;
}

/**
 * Infer atom from a non-test evidence item using LLM.
 */
async function inferAtomFromEvidence(
  evidence: EvidenceItem,
  analysis: EvidenceAnalysis,
  config: NodeConfig,
  minConfidence: number,
): Promise<InferredAtom | null> {
  const prompt = getEvidenceInferencePrompt(evidence, analysis);

  const response = await config.llmService.invoke({
    messages: [
      { role: 'system', content: ATOM_INFERENCE_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    taskType: AgentTaskType.ANALYSIS,
    agentName: 'infer-atoms-node',
    purpose: 'infer-intent-atom-evidence',
    promptCaching: true,
  });

  const parsed = parseInferenceResponse(response.content, evidence.name);
  if (!parsed || parsed.confidence < minConfidence) return null;

  const evidenceSource: EvidenceSource = {
    type: evidence.type,
    filePath: evidence.filePath,
    name: evidence.name,
    confidence: parsed.confidence,
  };

  return {
    tempId: `temp-${uuidv4()}`,
    description: parsed.description,
    category: parsed.category,
    sourceTest: {
      filePath: evidence.filePath,
      testName: evidence.name,
      lineNumber: evidence.lineNumber || 0,
    },
    observableOutcomes: parsed.observableOutcomes,
    confidence: parsed.confidence,
    ambiguityReasons: parsed.ambiguityReasons,
    reasoning: parsed.reasoning,
    evidenceSources: [evidenceSource],
    primaryEvidenceType: evidence.type,
  };
}

/**
 * Apply per-type caps to evidence items, keeping the highest-confidence items.
 */
function applyEvidenceCaps(
  evidenceByType: Map<string, EvidenceItem[]>,
  caps: Record<string, number>,
  logger?: NodeConfig['logger'],
): void {
  for (const [type, items] of evidenceByType) {
    const cap = caps[type];
    if (cap && items.length > cap) {
      items.sort((a, b) => b.baseConfidence - a.baseConfidence);
      const removed = items.length - cap;
      evidenceByType.set(type, items.slice(0, cap));
      logger?.log(`[InferAtomsNode] Capped ${type}: ${items.length} → ${cap} (removed ${removed})`);
    }
  }
}

/**
 * Deduplicate evidence items before sending to LLM.
 * Groups by file path for efficient comparison, then removes near-duplicates
 * within each file (e.g., a JSDoc comment and its associated export).
 */
function deduplicateEvidenceItems(
  items: EvidenceItem[],
  threshold: number,
  logger?: NodeConfig['logger'],
): EvidenceItem[] {
  if (threshold <= 0 || items.length <= 1) return items;

  const byFile = new Map<string, EvidenceItem[]>();
  for (const item of items) {
    const list = byFile.get(item.filePath) || [];
    list.push(item);
    byFile.set(item.filePath, list);
  }

  const kept: EvidenceItem[] = [];
  let deduped = 0;

  for (const [, fileItems] of byFile) {
    const representatives: EvidenceItem[] = [];
    for (const item of fileItems) {
      const itemText = `${item.name} ${item.code || ''}`;
      let isDuplicate = false;
      for (let r = 0; r < representatives.length; r++) {
        const repText = `${representatives[r].name} ${representatives[r].code || ''}`;
        if (computeTextSimilarity(itemText, repText) >= threshold) {
          // Keep the one with higher baseConfidence
          if (item.baseConfidence > representatives[r].baseConfidence) {
            representatives[r] = item;
          }
          isDuplicate = true;
          deduped++;
          break;
        }
      }
      if (!isDuplicate) representatives.push(item);
    }
    kept.push(...representatives);
  }

  if (deduped > 0) {
    logger?.log(
      `[InferAtomsNode] Pre-LLM dedup: removed ${deduped} duplicate evidence items (${items.length} → ${kept.length})`,
    );
  }
  return kept;
}

export function createInferAtomsNode(options: InferAtomsNodeOptions = {}) {
  const batchSize = options.batchSize || 5;
  const minConfidence = options.minConfidence || 0; // Include all by default
  const useTool = options.useTool ?? true;
  const useDependencyContext = options.useDependencyContext ?? true;
  const foundationalBoost = options.foundationalBoost ?? 10;
  const preLlmDedupThreshold = options.preLlmDedupThreshold ?? 0.6;
  const defaultCaps: Record<string, number> = {
    api_endpoint: 200,
    ui_component: 150,
    source_export: 150,
    code_comment: 100,
    documentation: 50,
    coverage_gap: 50,
  };
  const evidenceCaps = { ...defaultCaps, ...options.evidenceCaps };

  return (config: NodeConfig) =>
    async (state: ReconciliationGraphStateType): Promise<Partial<ReconciliationGraphStateType>> => {
      const orphanTests = state.orphanTests || [];
      const contextPerTest = state.contextPerTest || new Map();
      const repoStructure = state.repoStructure;

      // Check if dependency context is available
      const hasDependencyInfo =
        useDependencyContext &&
        repoStructure?.dependencyEdges &&
        repoStructure.dependencyEdges.length > 0;

      config.logger?.log(
        `[InferAtomsNode] Inferring atoms for ${orphanTests.length} tests ` +
          `(useTool=${useTool}, dependencyContext=${hasDependencyInfo})`,
      );

      // Check if tool is available
      const hasInferTool = useTool && config.toolRegistry.hasTool('infer_atom_from_test');

      const inferredAtoms: InferredAtom[] = [];
      let llmCallCount = 0;
      let processedCount = 0;

      // Process tests in batches
      for (let i = 0; i < orphanTests.length; i += batchSize) {
        // Check for cancellation between batches
        if (config.cancellationRegistry?.isCancelled(state.runId)) {
          config.logger?.log(
            `[InferAtomsNode] Cancelled after ${processedCount}/${orphanTests.length} tests`,
          );
          throw new CancellationError(state.runId);
        }

        const batch = orphanTests.slice(i, i + batchSize);

        // Process batch in parallel
        const batchPromises = batch.map(async (test) => {
          const testKey = `${test.filePath}:${test.testName}`;
          const context = contextPerTest.get(testKey);

          // Build dependency context for this test (Phase 3.4)
          const depContext = hasDependencyInfo ? buildDependencyContext(test, repoStructure) : null;

          try {
            // Try tool-based inference first
            if (hasInferTool) {
              try {
                const toolResult = (await config.toolRegistry.executeTool('infer_atom_from_test', {
                  test_file_path: test.filePath,
                  test_name: test.testName,
                  test_line_number: test.lineNumber,
                  test_code: test.testCode || '',
                  context_summary: context?.summary || '',
                  domain_concepts: context?.domainConcepts?.join(',') || '',
                  // Include dependency info if available
                  is_foundational: depContext?.isFoundational || false,
                  dependent_count: depContext?.dependentCount || 0,
                })) as InferAtomToolResult;

                llmCallCount++;

                // Apply foundational boost for core modules (Phase 3.4)
                let adjustedConfidence = toolResult.confidence;
                if (depContext?.isFoundational && foundationalBoost > 0) {
                  adjustedConfidence = Math.min(100, toolResult.confidence + foundationalBoost);
                  config.logger?.log(
                    `[InferAtomsNode] Applied foundational boost (+${foundationalBoost}) to ${testKey}`,
                  );
                }

                if (adjustedConfidence >= minConfidence) {
                  const atom: InferredAtom = {
                    tempId: toolResult.temp_id || `temp-${uuidv4()}`,
                    description: toolResult.description,
                    category: toolResult.category,
                    sourceTest: {
                      filePath: test.filePath,
                      testName: test.testName,
                      lineNumber: test.lineNumber,
                    },
                    observableOutcomes: toolResult.observable_outcomes,
                    confidence: adjustedConfidence,
                    ambiguityReasons: toolResult.ambiguity_reasons,
                    reasoning: toolResult.reasoning,
                    relatedDocs: context?.relatedDocs,
                  };
                  return atom;
                } else {
                  config.logger?.log(
                    `[InferAtomsNode] Skipping ${testKey} - confidence ${adjustedConfidence} below threshold ${minConfidence}`,
                  );
                  return null;
                }
              } catch (toolError) {
                const toolErrorMessage =
                  toolError instanceof Error ? toolError.message : String(toolError);
                config.logger?.warn(
                  `[InferAtomsNode] Tool failed for ${testKey}, falling back to LLM: ${toolErrorMessage}`,
                );
                // Fall through to LLM fallback
              }
            }

            // Fallback: Direct LLM call with dependency context
            const result = await inferAtomWithLLM(
              test,
              context,
              config,
              options.customPrompt,
              minConfidence,
              depContext,
              foundationalBoost,
            );
            llmCallCount++;

            if (result === null) {
              config.logger?.warn(
                `[InferAtomsNode] Failed to parse response for ${testKey}, using fallback`,
              );
              return createFallbackAtom(test, context);
            } else if (result === undefined) {
              // Below threshold
              return null;
            }
            return result;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            config.logger?.warn(
              `[InferAtomsNode] Inference failed for ${testKey}: ${errorMessage}`,
            );
            return createFallbackAtom(test, context);
          }
        });

        const batchResults = await Promise.all(batchPromises);

        // Collect non-null results
        for (const atom of batchResults) {
          if (atom) {
            inferredAtoms.push(atom);
          }
        }

        processedCount += batch.length;
        config.logger?.log(
          `[InferAtomsNode] Processed ${processedCount}/${orphanTests.length} tests, ${inferredAtoms.length} atoms inferred`,
        );
      }

      // Add evidence sources to test-inferred atoms
      for (const atom of inferredAtoms) {
        if (!atom.evidenceSources) {
          atom.evidenceSources = [{
            type: 'test',
            filePath: atom.sourceTest.filePath,
            name: atom.sourceTest.testName,
            confidence: atom.confidence,
          }];
          atom.primaryEvidenceType = 'test';
        }
      }

      config.logger?.log(
        `[InferAtomsNode] Test inference complete: ${inferredAtoms.length} atoms from ${orphanTests.length} tests (${llmCallCount} LLM calls)`,
      );

      // ================================================================
      // Phase 21C: Infer atoms from non-test evidence items
      // ================================================================
      const evidenceItems = state.evidenceItems || [];
      const evidenceAnalysis = state.evidenceAnalysis || new Map<string, EvidenceAnalysis>();
      const nonTestEvidence = evidenceItems.filter((e) => e.type !== 'test');

      if (nonTestEvidence.length > 0) {
        // Phase 22: Pre-LLM dedup removes near-duplicate evidence within the same file
        const dedupedEvidence = deduplicateEvidenceItems(nonTestEvidence, preLlmDedupThreshold, config.logger);

        config.logger?.log(
          `[InferAtomsNode] Processing ${dedupedEvidence.length} non-test evidence items`,
        );

        // Process in tiers by priority: api_endpoint → ui_component → source_export → code_comment → documentation → coverage_gap
        const tierOrder: Array<EvidenceItem['type']> = [
          'api_endpoint', 'ui_component', 'source_export', 'code_comment', 'documentation', 'coverage_gap',
        ];

        const evidenceByType = new Map<string, EvidenceItem[]>();
        for (const e of dedupedEvidence) {
          const list = evidenceByType.get(e.type) || [];
          list.push(e);
          evidenceByType.set(e.type, list);
        }

        // Phase 22: Apply per-type caps (sort by baseConfidence desc, keep top N)
        applyEvidenceCaps(evidenceByType, evidenceCaps, config.logger);

        let evidenceAtomCount = 0;

        for (const tier of tierOrder) {
          const tierItems = evidenceByType.get(tier) || [];
          if (tierItems.length === 0) continue;

          // Check for cancellation between tiers
          if (config.cancellationRegistry?.isCancelled(state.runId)) {
            config.logger?.log(`[InferAtomsNode] Cancelled during evidence inference`);
            throw new CancellationError(state.runId);
          }

          config.logger?.log(
            `[InferAtomsNode] Processing ${tierItems.length} ${tier} evidence items`,
          );

          // Process in batches
          for (let i = 0; i < tierItems.length; i += batchSize) {
            const batch = tierItems.slice(i, i + batchSize);

            const batchPromises = batch.map(async (evidence) => {
              const evidenceId = `${evidence.type}:${evidence.filePath}:${evidence.name}`;
              const analysis = evidenceAnalysis.get(evidenceId);

              if (!analysis) {
                config.logger?.warn(
                  `[InferAtomsNode] No analysis for evidence ${evidenceId}, skipping`,
                );
                return null;
              }

              try {
                return await inferAtomFromEvidence(evidence, analysis, config, minConfidence);
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                config.logger?.warn(
                  `[InferAtomsNode] Evidence inference failed for ${evidenceId}: ${errorMessage}`,
                );
                return null;
              }
            });

            const batchResults = await Promise.all(batchPromises);
            for (const atom of batchResults) {
              if (atom) {
                inferredAtoms.push(atom);
                evidenceAtomCount++;
              }
            }
            llmCallCount += batch.length;
          }
        }

        config.logger?.log(
          `[InferAtomsNode] Evidence inference: ${evidenceAtomCount} atoms from ${nonTestEvidence.length} evidence items`,
        );
      }

      config.logger?.log(
        `[InferAtomsNode] Total: ${inferredAtoms.length} atoms (${llmCallCount} LLM calls)`,
      );

      // INV-R005: State shedding - clear raw context from contextPerTest
      const cleanupUpdates = cleanupPhaseState(state, 'infer', 'synthesize');

      return {
        inferredAtoms,
        ...cleanupUpdates,
        currentPhase: 'synthesize',
        llmCallCount,
      };
    };
}
