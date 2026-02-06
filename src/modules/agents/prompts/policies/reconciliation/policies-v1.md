# Reconciliation Agent Policies — v1

Node-local policies for the reconciliation pipeline. Each node references the policies relevant to its operation.

## Version

- Policy version: 1.0
- Last updated: 2026-02-04
- Applicable to: reconciliation graph (structure → discover → context → infer_atoms → synthesize_molecules → verify → persist)

---

## General Policies

### GP-01: Evidence-First
Every claim about the repository must cite evidence. File paths, test names, line numbers, and code snippets are evidence. Prose assertions without evidence are not acceptable.

### GP-02: Behavioral Intent
Inferred atoms must describe what the system does (behavior), not how it does it (implementation). "User can authenticate" is behavioral. "System uses bcrypt with 12 rounds" is implementation.

### GP-03: Single Responsibility
Each atom must describe exactly one behavioral primitive. If an atom contains "and" connecting two distinct behaviors, it should be split into two atoms.

### GP-04: Observable Outcomes
Every atom must have at least one observable outcome that could be used to write a failing test. Outcomes like "system works correctly" are not observable.

---

## Node-Specific Policies

### Structure Node
- Walk all directories; do not skip hidden directories unless they match ignore patterns.
- Identify test files by naming convention (`.spec.ts`, `.test.ts`, `__tests__/`).
- Track file dependencies for context enrichment.

### Discover Node
- Parse `@atom` annotations (format: `// @atom IA-NNN` or `// @atom <id>`).
- Tests with `@atom` are linked tests — NEVER send to inference (INV-R001).
- Tests without `@atom` are orphan tests — candidates for atom inference.
- In delta mode: only process files in the change set.

### Context Node
- Gather source code that the test imports or references.
- Gather relevant documentation (README files, inline comments).
- Context is transient — used for LLM inference, then cleared (INV-R005).

### Infer Atoms Node
- For each orphan test, infer a behavioral atom.
- The atom description must match the test's behavioral intent, not its implementation.
- Confidence scoring: 90+ = clear behavioral intent; 70-89 = plausible inference; <70 = ambiguous.
- Include reasoning for the inference.
- Do not infer atoms for utility/helper tests that don't validate business behavior.

### Synthesize Molecules Node
- Group related atoms into molecules.
- A molecule must contain 2+ atoms (single-atom molecules are prohibited).
- Use appropriate lens type (feature, capability, user_story, etc.).
- Atoms may appear in multiple molecules.

### Verify Node
- Score each atom on quality dimensions.
- Flag atoms below the quality threshold (default: 80).
- When `requireReview` is true, interrupt for human review.
- Quality failures must include specific, actionable reasons.

### Persist Node
- Write results to database.
- Store test source code in TestRecord (Ingestion Boundary pattern).
- Accumulate errors; never silently drop errors.
