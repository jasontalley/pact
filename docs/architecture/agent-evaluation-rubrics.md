# Agent Evaluation Rubrics

Repeatable scoring rubrics for Pact's LangGraph agents. Each dimension is scored 0-2. Critical failures auto-fail the run regardless of total score.

---

## 1. Reconciliation Agent Rubric

**Total: /12** (6 dimensions x 2 points each)

### Dimensions

| Dimension | 0 (Fail) | 1 (Weak) | 2 (Pass) |
|-----------|----------|----------|----------|
| **Classification Correctness** | Misclassifies tests (e.g., treats linked test as orphan, violates INV-R001) | Correct classification but misses edge cases (partial file matches, unusual annotations) | All tests correctly classified; delta vs full-scan routing correct |
| **Evidence Grounding** | Claims reference nonexistent files, symbols, or lines | All claims reference real entities, but some evidence is irrelevant or too broad | Every claim cites precise, relevant evidence (file:line, test name, code snippet) |
| **Actionability** | Recommendations are vague ("improve tests"), not executable | Recommendations are specific but missing detail (which file, which atom) | Each recommendation is a concrete next step: file path, test name, proposed atom description |
| **Minimality** | Excessive output (redundant atoms, single-atom molecules, noise) | Mostly minimal with minor redundancy | Each recommendation is necessary; no duplicates, no single-atom molecules, bounded count |
| **Stability** | Small input changes (comments, renames) cause major output changes | Mostly stable but some unnecessary classification churn | Output stable under irrelevant input noise; changes proportional to actual test changes |
| **Safety** | Suggests destructive actions without warning (delete tests, remove atoms) | All actions are constructive but lacks caution flags | Constructive actions only; any potentially disruptive suggestion includes explicit caution |

### Critical Failures (Auto-Fail)

Any of the following causes the run to fail regardless of dimension scores:

- **Hallucinated repo fact**: Evidence references a file, test name, or symbol that does not exist in the input snapshot (contract C-REC-02).
- **INV-R001 violation**: A test with `@atom` annotation flows to `infer_atoms` for new atom creation.
- **Silent error**: An error occurs during a node but is not recorded in `state.errors[]`.

---

## 2. Intent Interview Agent Rubric

**Total: /12** (6 dimensions x 2 points each)

### Dimensions

| Dimension | 0 (Fail) | 1 (Weak) | 2 (Pass) |
|-----------|----------|----------|----------|
| **Atom Clarity** | Atoms are vague, compound, or untestable ("system works well") | Atoms describe behavior but some are compound or hard to falsify | Each atom is a single falsifiable behavioral primitive with clear observable outcomes |
| **Validator Testability** | Observable outcomes are prose-only with no testable structure | Some outcomes are testable but others are vague or compound | Every outcome is independently testable; a developer could write a failing test from it |
| **Edge-Case Coverage** | Only happy path; no boundary or negative conditions addressed | Some edge cases but misses obvious boundaries (empty input, max limits, auth failures) | Proactively identifies boundary conditions, negative cases, and error states |
| **Ambiguity Discipline** | Silently assumes meaning; invents requirements the user didn't state | Asks some questions but makes unstated assumptions elsewhere | Explicitly surfaces every ambiguity; never silently assumes; questions are well-categorized |
| **Invariant Alignment** | Extracted atoms contradict declared invariants | Atoms don't contradict invariants but don't reference them either | Atoms reference applicable invariants; no contradictions; relevant invariants cited |
| **Compression** | Atom spam (10+ atoms for a simple feature) or atom starvation (0-1 for a complex one) | Reasonable count but some atoms could be merged or split | Minimal atom set that fully covers the intent; each atom earns its existence |

### Critical Failures (Auto-Fail)

Any of the following causes the run to fail regardless of dimension scores:

- **Vacuous atom**: An atom with zero observable outcomes or outcomes that cannot fail (contract C-INT-01).
- **Hallucinated constraint**: The agent states a requirement the user never mentioned and didn't ask about (contract C-INT-03).
- **Implementation leakage**: Atoms specify technology choices (database, framework, protocol) unless the user explicitly stated them (contract C-INT-05).

---

## 3. Scoring Process

### Layer 1 (Automated)

Dimensions with clear structural checks are scored automatically by the evaluation harness:

- **Classification Correctness**: Compare discovered orphan set against expected.
- **Evidence Grounding**: Verify all file paths and symbols exist in fixture.
- **Atom Schema**: Validate required fields, non-empty outcomes.
- **Minimality**: Check no single-atom molecules, bounded recommendation count.

### Layer 2 (LLM-in-the-Loop)

Snapshot comparison against pinned baselines. Score dimensions by diffing:

- New run output vs. baseline snapshot (structural + key field comparison).
- Dimensions scored as: match (2), partial match (1), diverged (0).

### Layer 3 (Human Calibration)

For dimensions that require judgment (e.g., "is this a good validator?"):

1. Sample 5-10 runs per release.
2. Label each dimension as pass (2), weak (1), fail (0) with brief reason.
3. Track scores over time to detect regression.
4. Feed labels back into prompts and few-shot examples.

### Trend Tracking

Store rubric scores per run in Run Artifacts. Track:

- Average total score over time (should trend upward).
- Critical failure rate (should trend toward zero).
- Per-dimension trends (identify weakest dimensions for prompt refinement).
- Failure tag distribution (guide investment: prompt vs tooling vs model).

---

## 4. Cost and Latency Budgets

In addition to quality rubrics, each run must stay within resource budgets:

| Agent | Max Tokens (total) | Max Duration | Max LLM Calls |
|-------|-------------------|-------------|---------------|
| Reconciliation (10 tests) | 50,000 | 120s | 25 |
| Reconciliation (50 tests) | 200,000 | 600s | 100 |
| Interview (3 rounds) | 30,000 | 60s | 15 |
| Interview (5 rounds) | 50,000 | 120s | 25 |

Budget violations are warnings (not auto-fails) unless they exceed 2x the budget, which is a fail.
