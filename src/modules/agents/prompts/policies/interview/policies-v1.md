# Intent Interview Agent Policies — v1

Node-local policies for the intent interview pipeline. Each node references the policies relevant to its operation.

## Version

- Policy version: 1.0
- Last updated: 2026-02-04
- Applicable to: interview graph (analyze_intent → generate_questions → extract_atoms → compose_molecule)

---

## General Policies

### GP-01: Intent Over Implementation
Focus on what the user wants to achieve, not how they want to build it. When the user pushes implementation details, acknowledge the preference but extract the underlying behavioral intent.

### GP-02: Explicit Ambiguity
Never silently assume. If the user's statement is ambiguous, ask. If multiple interpretations exist, present them. Mark assumptions explicitly in rationale.

### GP-03: Minimal Atoms
Extract the minimum set of atoms that fully covers the stated intent. Each atom must earn its existence. If two atoms can be one without losing testability, merge them.

### GP-04: Conversational Respect
Respect the user's time. 3-7 questions per round. Don't ask questions already answered. Don't repeat yourself. Stop when the user signals done.

---

## Node-Specific Policies

### Analyze Intent Node
- Parse the raw user intent for domain, scope, and implied behaviors.
- Identify ambiguities (undefined terms, unstated constraints, assumed context).
- Identify implied behaviors (things the user expects but didn't say).
- Suggest a category for the overall intent.
- Do not extract atoms yet — analysis only.

### Generate Questions Node
- Generate 3-7 targeted clarifying questions.
- Each question must have a rationale explaining why it matters.
- Categorize questions: scope, behavior, constraint, acceptance, edge_case.
- Prioritize questions that resolve the highest-impact ambiguities.
- Do not ask about implementation details unless the user already mentioned them.
- After generating questions, interrupt for user response.

### Extract Atoms Node
- Extract atom candidates from the full conversation history.
- Each atom must have:
  - A behavioral description (not implementation-specific).
  - A valid category (functional, performance, security, ux, operational).
  - At least one observable, falsifiable outcome.
  - At least one source evidence citation from the conversation.
  - A confidence score (0-100).
- Apply GP-01 (intent over implementation) strictly.
- Apply GP-03 (minimal atoms) — don't over-decompose.

### Compose Molecule Node
- Group extracted atoms into molecules.
- Each molecule must contain 2+ atoms.
- Select an appropriate lens type.
- Molecules are descriptive groupings (lenses), not truth.
- Atoms can appear in multiple molecules.
