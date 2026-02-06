import { InvariantCheckConfig, InvariantCheckType } from './invariant-config.entity';

/**
 * Definition of a built-in invariant
 */
export interface BuiltinInvariantDefinition {
  invariantId: string;
  name: string;
  description: string;
  checkType: InvariantCheckType;
  checkConfig: InvariantCheckConfig;
  errorMessage: string;
  suggestionPrompt: string;
}

/**
 * Built-in invariants from ProdOS Global Invariants specification
 *
 * These invariants are seeded on application startup and cannot be deleted.
 * They can be enabled/disabled and their blocking status can be changed per project.
 *
 * @see ingest/invariants.md
 */
export const BUILTIN_INVARIANTS: BuiltinInvariantDefinition[] = [
  {
    invariantId: 'INV-001',
    name: 'Explicit Commitment Required',
    description: 'No intent may become enforceable without an explicit human commitment action.',
    checkType: 'builtin',
    checkConfig: { checkerName: 'ExplicitCommitmentChecker' },
    errorMessage:
      'Intent cannot be committed without explicit human action. Please confirm commitment through the UI or API.',
    suggestionPrompt:
      'The user is trying to commit intent without explicit confirmation. Explain why explicit commitment is required and how to properly commit.',
  },
  {
    invariantId: 'INV-002',
    name: 'Intent Atoms Must Be Behaviorally Testable',
    description:
      'Every committed Intent Atom must describe behavior that is observable and falsifiable.',
    checkType: 'builtin',
    checkConfig: {
      checkerName: 'BehavioralTestabilityChecker',
      minQualityScore: 60,
    },
    errorMessage:
      'Atom does not meet testability requirements. It must describe observable, falsifiable behavior.',
    suggestionPrompt:
      'This atom failed the behavioral testability check. Analyze the atom description and suggest specific improvements to make it more observable and falsifiable.',
  },
  {
    invariantId: 'INV-003',
    name: 'No Ambiguity in Commitment Artifacts',
    description:
      'Commitment Artifacts must not contain unresolved ambiguity or implementation directives.',
    checkType: 'llm',
    checkConfig: {
      checkerName: 'NoAmbiguityChecker',
      prompt: `Analyze the following intent atom for ambiguity. Check for:
1. Vague terms (e.g., "fast", "user-friendly", "appropriate")
2. Implementation directives (e.g., "use React", "implement with SQL")
3. Unresolved questions (e.g., "TBD", "to be determined")
4. Conditional language without clear conditions

Respond with JSON: { "hasAmbiguity": boolean, "issues": string[] }`,
    },
    errorMessage:
      'Atom contains ambiguous language or implementation directives that must be resolved before commitment.',
    suggestionPrompt:
      'This atom contains ambiguity. Identify the specific ambiguous terms or directives and suggest clearer alternatives that maintain intent without prescribing implementation.',
  },
  {
    invariantId: 'INV-004',
    name: 'Commitment Is Immutable',
    description:
      'Committed intent may not be edited. It may only be superseded by a new commitment.',
    checkType: 'builtin',
    checkConfig: { checkerName: 'ImmutabilityChecker' },
    errorMessage:
      'Committed atoms cannot be modified. Create a new atom that supersedes this one instead.',
    suggestionPrompt:
      'The user is trying to modify a committed atom. Explain the immutability principle and guide them through creating a superseding atom instead.',
  },
  {
    invariantId: 'INV-005',
    name: 'Traceability Is Mandatory',
    description:
      'All Realization and Evidence Artifacts must reference the Commitment Artifact they satisfy.',
    checkType: 'builtin',
    checkConfig: { checkerName: 'TraceabilityChecker' },
    errorMessage:
      'Atom lacks proper traceability. It must have a parent intent or refinement history.',
    suggestionPrompt:
      'This atom lacks traceability information. Explain what traceability means in the context of intent atoms and suggest how to establish proper lineage.',
  },
  {
    invariantId: 'INV-006',
    name: 'Agents May Not Commit Intent',
    description: 'Only humans may authorize commitment across the Commitment Boundary.',
    checkType: 'builtin',
    checkConfig: { checkerName: 'HumanCommitChecker' },
    errorMessage:
      'Commitment must be authorized by a human. Agent-initiated commits are not allowed.',
    suggestionPrompt:
      'An agent is attempting to commit intent without human authorization. Explain why human oversight is required and how to properly request human approval.',
  },
  {
    invariantId: 'INV-007',
    name: 'Evidence Is First-Class and Immutable',
    description: 'Evidence Artifacts may not be altered, suppressed, or discarded.',
    checkType: 'builtin',
    checkConfig: { checkerName: 'EvidenceImmutabilityChecker' },
    errorMessage:
      'Evidence artifacts cannot be modified or deleted. All evidence must be preserved.',
    suggestionPrompt:
      'Someone is trying to alter or remove evidence. Explain why evidence immutability is critical for auditability and trust.',
  },
  {
    invariantId: 'INV-008',
    name: 'Rejection Is Limited to Invariants',
    description:
      'The system may reject intent only due to violations of declared global invariants.',
    checkType: 'builtin',
    checkConfig: { checkerName: 'RejectionLimitedChecker' },
    errorMessage:
      'System rejection must be due to invariant violations. Arbitrary rejection is not permitted.',
    suggestionPrompt:
      'The system rejected content for a reason other than invariant violation. Review whether this rejection is valid and suggest alternatives.',
  },
  {
    invariantId: 'INV-009',
    name: 'Post-Commitment Ambiguity Must Be Resolved Explicitly',
    description:
      'Ambiguity discovered after commitment may never be resolved in place. It must result in either a superseding commitment or an explicit Clarification Artifact.',
    checkType: 'builtin',
    checkConfig: { checkerName: 'AmbiguityResolutionChecker' },
    errorMessage:
      'Post-commitment ambiguity cannot be resolved silently. Create a superseding commitment or explicit clarification artifact.',
    suggestionPrompt:
      'Ambiguity was discovered in a committed atom. Explain the options: creating a superseding commitment or adding an explicit clarification artifact. Guide the user through the appropriate process.',
  },
];

/**
 * Get a built-in invariant definition by ID
 */
export function getBuiltinInvariant(invariantId: string): BuiltinInvariantDefinition | undefined {
  return BUILTIN_INVARIANTS.find((inv) => inv.invariantId === invariantId);
}

/**
 * Check if an invariant ID is a built-in invariant
 */
export function isBuiltinInvariantId(invariantId: string): boolean {
  return BUILTIN_INVARIANTS.some((inv) => inv.invariantId === invariantId);
}
