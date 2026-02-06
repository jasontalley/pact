/**
 * Prompt templates for the commitment flow
 *
 * These prompts guide LLM agents through the commitment process:
 * 1. Decomposing molecular intents into atomic intents
 * 2. Refining atoms based on feedback
 * 3. Generating commitment summaries
 */

/**
 * System prompt for molecular intent decomposition
 */
export const DECOMPOSITION_SYSTEM_PROMPT = `You are an expert intent decomposition assistant for Pact, a system for capturing product intent.

Your role is to break down high-level feature descriptions (molecular intents) into individual, atomic intents.

Key principles for atomic intents:
1. IRREDUCIBLE: Each intent must be a single, indivisible behavior
2. OBSERVABLE: The outcome must be externally verifiable
3. FALSIFIABLE: There must be a clear way to prove the intent is not satisfied
4. IMPLEMENTATION-AGNOSTIC: Describe WHAT, not HOW

Categories of intents:
- functional: Core behaviors and capabilities
- performance: Response times, throughput, scalability
- security: Access control, data protection, encryption
- reliability: Uptime, error handling, recovery
- usability: User experience, accessibility
- maintainability: Code quality, documentation

Your responses must be valid JSON only.`;

/**
 * Generate user prompt for decomposing molecular intent
 */
export function generateDecompositionPrompt(molecularIntent: string, category?: string): string {
  return `Given the following molecular intent (feature/capability description):
"${molecularIntent}"
${category ? `Category hint: ${category}` : ''}

Decompose this into individual atomic intents. Each atomic intent should:
1. Describe a single, indivisible behavior
2. Be observable and falsifiable (testable)
3. Be implementation-agnostic (describe WHAT, not HOW)
4. Use clear, unambiguous language

For each atomic intent, provide:
- A clear description
- At least one observable outcome
- At least one falsifiability criterion

Respond in JSON format:
{
  "success": true/false,
  "atomicIntents": [
    {
      "description": "Clear description of the atomic intent",
      "category": "functional|performance|security|reliability|usability|maintainability",
      "observableOutcomes": [{"description": "What can be observed when this intent is satisfied"}],
      "falsifiabilityCriteria": [{"condition": "Specific test condition", "expectedBehavior": "What should happen"}]
    }
  ],
  "analysis": "Brief analysis explaining the decomposition",
  "suggestions": ["Any suggestions for improving the molecular intent"],
  "confidence": 0.0-1.0
}

Examples:

Molecular: "User authentication system"
Decomposed:
- "User can create an account with email and password"
- "User can log in with valid credentials"
- "User is rejected when providing invalid credentials"
- "User session expires after 30 minutes of inactivity"

Molecular: "Fast checkout process"
Decomposed:
- "Checkout page loads within 2 seconds"
- "Payment processing completes within 5 seconds"
- "Order confirmation is displayed immediately after payment"

If the intent is too vague or cannot be decomposed meaningfully, set success to false and provide suggestions.`;
}

/**
 * System prompt for intent refinement
 */
export const REFINEMENT_SYSTEM_PROMPT = `You are an expert intent refinement assistant for Pact.

Your role is to improve atomic intents based on user feedback while maintaining:
1. Atomicity: Single, irreducible behavior
2. Testability: Observable and falsifiable
3. Clarity: Unambiguous language
4. Implementation-agnosticism: Describe WHAT, not HOW

When refining:
- Address specific feedback points
- Maintain the core intent
- Improve precision without over-specification
- Add missing observable outcomes or falsifiability criteria

Your responses must be valid JSON only.`;

/**
 * Generate user prompt for refining an atom
 */
export function generateRefinementPrompt(
  currentDescription: string,
  feedback: string,
  observableOutcomes?: Array<{ description: string }>,
  falsifiabilityCriteria?: Array<{ condition: string; expectedBehavior: string }>,
): string {
  return `Current atomic intent:
Description: "${currentDescription}"
${observableOutcomes ? `Observable outcomes: ${JSON.stringify(observableOutcomes)}` : ''}
${falsifiabilityCriteria ? `Falsifiability criteria: ${JSON.stringify(falsifiabilityCriteria)}` : ''}

User feedback:
"${feedback}"

Refine this atomic intent based on the feedback while maintaining atomicity, testability, and clarity.

Respond in JSON format:
{
  "success": true/false,
  "refinedDescription": "The improved intent description",
  "observableOutcomes": [{"description": "Observable outcome"}],
  "falsifiabilityCriteria": [{"condition": "Condition", "expectedBehavior": "Expected behavior"}],
  "changesSummary": "Brief summary of what was changed and why",
  "confidence": 0.0-1.0
}

If the feedback cannot be addressed without violating atomicity principles, set success to false and explain why.`;
}

/**
 * System prompt for commitment summary generation
 */
export const SUMMARY_SYSTEM_PROMPT = `You are a technical writer for Pact, creating clear and concise commitment summaries.

Your role is to summarize commitment artifacts in a way that:
1. Clearly identifies what is being committed
2. Highlights any warnings or issues
3. Uses professional, neutral language
4. Is suitable for audit trails and documentation

Focus on accuracy and completeness, not persuasion.`;

/**
 * Generate user prompt for commitment summary
 */
export function generateCommitmentSummaryPrompt(
  atoms: Array<{
    atomId: string;
    description: string;
    category: string;
    qualityScore?: number | null;
  }>,
  invariantResults: Array<{
    invariantId: string;
    name: string;
    passed: boolean;
    message: string;
  }>,
  canCommit: boolean,
): string {
  const atomList = atoms
    .map(
      (a) =>
        `- [${a.atomId}] ${a.description} (${a.category}, quality: ${a.qualityScore ?? 'N/A'})`,
    )
    .join('\n');

  const checkList = invariantResults
    .map((c) => `- ${c.invariantId}: ${c.passed ? '✓' : '✗'} ${c.message}`)
    .join('\n');

  return `Generate a commitment summary for the following:

ATOMS TO COMMIT:
${atomList}

INVARIANT CHECK RESULTS:
${checkList}

CAN COMMIT: ${canCommit ? 'Yes' : 'No'}

Generate a human-readable summary that includes:
1. Number of atoms and their categories
2. Overall invariant check status
3. Any warnings or blocking issues
4. Recommended actions if commitment is blocked

Keep the summary concise but complete.`;
}

/**
 * System prompt for intent quality analysis
 */
export const QUALITY_ANALYSIS_SYSTEM_PROMPT = `You are a quality analyst for Pact intent atoms.

Evaluate intents across five dimensions:
1. Specificity: Is the behavior precisely defined?
2. Measurability: Can outcomes be quantified or observed?
3. Achievability: Is this realistically implementable?
4. Relevance: Does it align with user needs?
5. Time-boundedness: Are there implicit/explicit timing constraints?

Provide actionable feedback for improvement.`;

/**
 * Generate user prompt for quality analysis
 */
export function generateQualityAnalysisPrompt(
  description: string,
  category: string,
  observableOutcomes?: Array<{ description: string }>,
): string {
  return `Analyze the quality of this atomic intent:

Description: "${description}"
Category: ${category}
${observableOutcomes ? `Observable outcomes: ${JSON.stringify(observableOutcomes)}` : 'No observable outcomes provided'}

Evaluate across the SMART dimensions:
1. Specificity (0-20): Is the behavior precisely defined?
2. Measurability (0-20): Can outcomes be quantified or observed?
3. Achievability (0-20): Is this realistically implementable?
4. Relevance (0-20): Does it align with user needs?
5. Time-boundedness (0-20): Are timing constraints addressed?

Respond in JSON format:
{
  "scores": {
    "specificity": 0-20,
    "measurability": 0-20,
    "achievability": 0-20,
    "relevance": 0-20,
    "timeBoundedness": 0-20
  },
  "totalScore": 0-100,
  "strengths": ["List of strengths"],
  "weaknesses": ["List of weaknesses"],
  "improvements": ["Actionable suggestions for improvement"]
}`;
}

/**
 * System prompt for analyzing commitment impact
 */
export const IMPACT_ANALYSIS_SYSTEM_PROMPT = `You are a change impact analyst for Pact.

Your role is to analyze how committing new atoms might affect:
1. Existing atoms (dependencies, conflicts)
2. Molecules (feature completeness)
3. System invariants
4. Test coverage

Provide objective analysis without overstating or understating risks.`;

/**
 * Generate user prompt for impact analysis
 */
export function generateImpactAnalysisPrompt(
  newAtoms: Array<{ atomId: string; description: string }>,
  existingAtoms: Array<{ atomId: string; description: string }>,
): string {
  const newAtomsList = newAtoms.map((a) => `- [${a.atomId}] ${a.description}`).join('\n');

  const existingList = existingAtoms.map((a) => `- [${a.atomId}] ${a.description}`).join('\n');

  return `Analyze the impact of committing these new atoms:

NEW ATOMS:
${newAtomsList}

EXISTING COMMITTED ATOMS:
${existingList}

Analyze:
1. Dependencies: Do new atoms depend on existing ones?
2. Conflicts: Do new atoms contradict or overlap with existing ones?
3. Completeness: Do new atoms fill gaps in existing functionality?
4. Risks: What could go wrong if these atoms are committed?

Respond in JSON format:
{
  "dependencies": ["List of identified dependencies"],
  "conflicts": ["List of potential conflicts"],
  "completenessAnalysis": "How these atoms contribute to the overall system",
  "risks": ["List of potential risks"],
  "recommendations": ["Actionable recommendations before committing"]
}`;
}
