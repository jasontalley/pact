# Pact Agents - Specification

**Purpose**: Define specialized agents needed to implement Pact consistently with the atom/molecule model and bootstrap scaffolding approach.

**Status**: Exploration phase - refining requirements before atomization

**Last Updated**: 2026-01-12

---

## Overview

Pact requires specialized agents to automate key transformations in the intent → code workflow. These agents ensure consistency, enforce quality, and prevent common failure modes.

**Critical Insight**: Agents are tools for humans, not autonomous decision-makers. Every agent surfaces options and asks for human approval at decision points. This aligns with INV-006: "Agents May Not Commit Intent."

---

## Priority Matrix

| Priority | Agent | Why Critical | Phase |
|----------|-------|--------------|-------|
| **P0** | Atomization Agent | Core transformation: ideas → atoms | Phase 0 |
| **P0** | Atom Quality Validator | Gate for commitment quality | Phase 0 |
| **P0** | Test-Atom Coupling Agent | Coupling mechanism enforcement | Phase 0 |
| **P1** | Test Quality Analyzer | Red phase gate enforcement | Phase 0 |
| **P1** | Bootstrap Scaffolding Agent | Prevents entrenchment | Phase 0-1 |
| **P2** | Molecule Composer | Human-facing groupings | Phase 1 |
| **P2** | Invariant Enforcement Agent | Automated checking | Phase 1 |
| **P3** | Evidence Collector | Closes the loop | Phase 2 |

---

## P0: Atomization Agent

**Skill Name**: `atomizing-intent`

**Purpose**: Convert ideas/requirements into properly-formed atoms

### Inputs

- Natural language intent statements
- Ideas from `/ideas/{topic}.md`
- Requirements from synthesis documents
- Conversation transcripts

### Outputs

- Candidate atoms in `/atoms` format:
  - `IA-{ID}-{slug}.md` (human-readable)
  - `IA-{ID}-{slug}.json` (machine-readable metadata)
- Atomicity analysis report
- Testability assessment
- Decomposition suggestions (if not atomic)

### Core Capabilities

#### 1. Atomicity Analysis

**Check**: Is the intent statement atomic (irreducible)?

**Questions**:
- Can this be split into smaller, independent behavioral primitives?
- Are there multiple observable outcomes bundled together?
- Is there implicit sequencing that should be made explicit?

**Output**:
```markdown
## Atomicity Analysis

**Statement**: "Users can save their work and receive confirmation"

**Assessment**: Not atomic - contains two distinct behaviors:
1. Save operation completes successfully
2. Confirmation is displayed to user

**Suggested Decomposition**:
- IA-050: "When user initiates save, work is persisted to database"
- IA-051: "When save completes, user receives visual confirmation within 1 second"
```

#### 2. Testability Analysis

**Check**: Is the intent observable and falsifiable?

**Questions**:
- Can we see this behavior happen?
- Can we prove it wrong (falsifiable)?
- Are success criteria clear and measurable?
- Are edge cases identifiable?

**Output**:
```markdown
## Testability Analysis

**Statement**: "System should be fast"

**Assessment**: Not testable - lacks observable criteria

**Issues**:
- "Fast" is subjective (no measurable threshold)
- No specific operation defined
- No failure condition specified

**Suggested Refinement**:
"When user submits search query, results display within 2 seconds for 95% of requests"
```

#### 3. Implementation-Agnostic Check

**Check**: Does the intent describe behavior without prescribing implementation?

**Questions**:
- Does it say "what" not "how"?
- Are there technology-specific terms (React, PostgreSQL, etc.)?
- Are there algorithm/architecture prescriptions?

**Output**:
```markdown
## Implementation-Agnostic Check

**Statement**: "Use bcrypt to hash passwords with 12 rounds"

**Assessment**: Too implementation-specific

**Issues**:
- Specifies algorithm (bcrypt) and configuration (12 rounds)
- This is "how", not "what"

**Suggested Refinement**:
"When user creates password, system stores it in non-reversible format that resists brute-force attacks"
```

### Workflow

1. **Parse Input**: Extract intent statements from natural language
2. **Analyze Atomicity**: Check if irreducible
3. **Analyze Testability**: Check if observable/falsifiable
4. **Check Implementation-Agnostic**: Ensure no "how"
5. **Generate Candidates**: Create atom files
6. **Present to Human**: Show analysis + candidates, ask for approval
7. **Create Files**: Write approved atoms to `/atoms`

### LLM Confidence Thresholds

- **Atomicity analysis**: 0.7 (if lower, ask human)
- **Testability analysis**: 0.7 (if lower, ask human)
- **Decomposition suggestions**: 0.6 (if lower, say "unable to determine")

### Integration Points

- **After**: `synthesizing-requirements` skill
- **Before**: Atom commitment ceremony
- **Triggers**: Human invokes `/atomize` or agent suggests atomization

---

## P0: Atom Quality Validator

**Skill Name**: `validating-atom-quality`

**Purpose**: Review proposed atoms for quality before commitment

### Inputs

- Proposed atom files (`.md` + `.json`)
- Context: related atoms, molecules

### Outputs

- Quality score (0-100)
- Issue report categorized by severity
- Specific remediation suggestions
- Approval recommendation (approve/revise/reject)

### Quality Dimensions

#### 1. Observable (Weight: 25%)

**Check**: Can we see this behavior happen?

**Scoring**:
- 100: Clear, observable outcome with specific criteria
- 50: Observable but vague criteria
- 0: Not observable (internal state, "should", "must")

#### 2. Falsifiable (Weight: 25%)

**Check**: Can we prove it wrong?

**Scoring**:
- 100: Clear failure condition, testable assertion
- 50: Falsifiable but ambiguous failure criteria
- 0: Not falsifiable (aspirational, "better", "improved")

#### 3. Implementation-Agnostic (Weight: 20%)

**Check**: No "how", only "what"

**Scoring**:
- 100: Pure behavior, no technology/algorithm references
- 50: Minor implementation hints but mostly behavioral
- 0: Prescribes specific implementation approach

#### 4. Unambiguous Language (Weight: 15%)

**Check**: Clear, precise language

**Scoring**:
- 100: No ambiguous terms, quantified where needed
- 50: Minor ambiguities that don't affect testability
- 0: Vague language ("fast", "good", "appropriate")

#### 5. Clear Success Criteria (Weight: 15%)

**Check**: Explicit definition of "done"

**Scoring**:
- 100: Specific, measurable success criteria
- 50: Success criteria implied but not explicit
- 0: No clear success criteria

### Workflow

1. **Parse Atom**: Read `.md` and `.json`
2. **Score Each Dimension**: Apply scoring rubric
3. **Calculate Total**: Weighted average
4. **Generate Report**: Issues + suggestions
5. **Make Recommendation**:
   - Score ≥ 80: Approve
   - Score 60-79: Revise (provide suggestions)
   - Score < 60: Reject (fundamental issues)
6. **Present to Human**: Show report, ask for decision

### Output Format

```markdown
## Atom Quality Report: IA-123

**Overall Score**: 72/100 (Revise Recommended)

### Dimension Scores

- **Observable**: 90/100 ✓
- **Falsifiable**: 85/100 ✓
- **Implementation-Agnostic**: 40/100 ✗
- **Unambiguous Language**: 75/100 ~
- **Clear Success Criteria**: 70/100 ~

### Issues

**Critical** (blocks approval):
- [Implementation-Agnostic] Atom specifies "use Redis cache" - this is implementation detail

**Warnings** (should revise):
- [Unambiguous Language] "Quickly" is subjective - specify time threshold
- [Success Criteria] No explicit failure condition defined

### Recommendations

1. Remove Redis reference: "When user requests recently-viewed data, system returns cached result"
2. Quantify "quickly": Replace with "within 500ms"
3. Add failure criteria: "Cache miss falls back to database query"

**Recommendation**: Revise before commitment
```

### Integration Points

- **After**: Atom files created
- **Before**: Commitment ceremony
- **Triggers**: Automatic validation before any atom commitment

---

## P0: Test-Atom Coupling Agent

**Skill Name**: `coupling-tests-to-atoms`

**Purpose**: Ensure tests properly reference atoms and detect mismatches

### Inputs

- Test files (`.spec.ts`, `.test.ts`, `.e2e-spec.ts`)
- Atom files in `/atoms`
- Test execution results (optional)

### Outputs

- Coupling report:
  - Tests with `@atom` references (coupled)
  - Tests without references (orphans)
  - Atoms without tests (unrealized)
  - Mismatch detection (test contradicts atom)
- Suggested atom IDs for orphan tests
- Reverse-engineered atom candidates
- INV-009 violation alerts

### Core Capabilities

#### 1. Orphan Test Detection

**Check**: Tests without `@atom` references

**Output**:
```markdown
## Orphan Tests (No Atom Reference)

### test/payment.spec.ts:42
```typescript
it('validates credit card number format', () => {
  // No @atom reference
})
```

**Suggested Atom**: IA-105
**Reason**: Appears to test input validation behavior
**Confidence**: 0.72

**Action**: Add `// @atom IA-105` or create new atom
```

#### 2. Unrealized Atom Detection

**Check**: Atoms without corresponding tests

**Output**:
```markdown
## Unrealized Atoms (No Tests Found)

### IA-050: User receives email notification

**Status**: Committed but not realized
**Impact**: High (core feature)
**Suggested Action**: Create test in `test/notifications.spec.ts`

**Skeleton Test**:
```typescript
// @atom IA-050
describe('Email Notifications', () => {
  it('sends email notification to user when event occurs', () => {
    // Arrange: Set up user and event
    // Act: Trigger event
    // Assert: Email sent to user
  });
});
```
```

#### 3. Test-Atom Mismatch Detection

**Check**: Test assertions contradict atom behavior (INV-009 violation)

**Output**:
```markdown
## Test-Atom Mismatches (CRITICAL)

### test/payment.spec.ts:67

**Atom IA-003**: "Payment processes within 5 seconds"
**Test Assertion**: `expect(duration).toBeLessThan(2000)` (2 seconds)

**Issue**: Test tightens requirement without superseding atom

**INV-009 Violation**: Tests cannot redefine intent

**Options**:
1. Accept test as invalid (remove or mark skipped)
2. Create superseding atom: IA-003-v2 with 2-second requirement
3. Fix test to match atom: `expect(duration).toBeLessThan(5000)`

**Recommended**: Option 3 (fix test to match atom)
```

#### 4. Reverse Engineering

**Check**: Infer atom from test behavior

**Output**:
```markdown
## Reverse-Engineered Atoms

### test/auth.spec.ts:23-45

**Test Behavior Analysis**:
- Tests session expiration after 30 minutes
- Tests refresh token extends session
- Tests logout invalidates session

**Suggested Atoms**:

**IA-120**: "User session expires after 30 minutes of inactivity"
- **Observable**: Session becomes invalid after timeout
- **Falsifiable**: User action before 30 minutes prevents expiration
- **Confidence**: 0.81

**IA-121**: "Refresh token extends session by 30 minutes"
- **Observable**: Session timeout resets on refresh
- **Falsifiable**: Expired session cannot be refreshed
- **Confidence**: 0.76
```

### Workflow

1. **Scan Test Files**: Parse all test files for `@atom` references
2. **Scan Atom Files**: Load all committed atoms
3. **Match Tests to Atoms**: Build coupling map
4. **Detect Orphans**: Tests without `@atom` references
5. **Detect Unrealized**: Atoms without tests
6. **Detect Mismatches**: Test assertions vs atom behavior
7. **Reverse Engineer**: Suggest atoms for orphan tests
8. **Generate Report**: Present findings to human
9. **Execute Actions**: Based on human decisions

### Integration Points

- **After**: Tests written
- **Before**: Git commit (pre-commit hook)
- **Part of**: CI pipeline (blocking check)
- **Triggers**: `npm run test:coupling` or automatic on test changes

---

## P1: Test Quality Analyzer

**Skill Name**: `analyzing-test-quality`

**Purpose**: Review tests against 7 quality dimensions from `test-quality.md`

### Inputs

- Test file(s)
- Referenced atom(s)
- Test execution results

### Outputs

- Quality report per test
- Issues categorized by dimension and severity
- Specific remediation steps
- Quality score (0-100)

### Quality Dimensions

#### 1. Intent Fidelity (Weight: 20%)

**Check**: One-to-one mapping with atoms

**Scoring**:
- 100: Each test maps to exactly one atom, all atoms have tests
- 50: Some tests map to multiple atoms or some atoms lack tests
- 0: No clear atom mapping

#### 2. No Vacuous Tests (Weight: 15%)

**Check**: Meaningful assertions

**Detects**:
- Tests with no assertions
- Trivial assertions (`expect(x).toBeDefined()`)
- Assertions that always pass

**Scoring**:
- 100: All tests have meaningful, specific assertions
- 50: Some weak assertions but test is useful
- 0: Vacuous tests (no assertions or trivial only)

#### 3. No Brittle Tests (Weight: 15%)

**Check**: Not coupled to implementation

**Detects**:
- Testing private methods
- Assertions on internal structure
- Mocking implementation details

**Scoring**:
- 100: Tests public contracts only
- 50: Minor implementation coupling
- 0: Tests deeply coupled to implementation

#### 4. Determinism (Weight: 10%)

**Check**: Repeatable outcomes

**Detects**:
- Unseeded randomness
- Clock dependencies without freezing
- Network calls in unit tests
- Race conditions

**Scoring**:
- 100: Fully deterministic
- 50: Mostly deterministic with minor variability
- 0: Non-deterministic outcomes

#### 5. Failure Signal Quality (Weight: 15%)

**Check**: Failures isolate single cause

**Detects**:
- "God tests" (many assertions in one test)
- Unclear error messages
- Missing atom reference in failure message

**Scoring**:
- 100: Each test isolates one behavior, clear failure messages
- 50: Some overlap but generally clear
- 0: Failures don't identify root cause

#### 6. Integration Test Authenticity (Weight: 15%)

**Check**: No inappropriate mocking

**Detects**:
- Mocked internal services (should be real)
- Mocked external services without approval
- Mocked database (should use Docker)

**Scoring**:
- 100: Uses real, Dockerized dependencies
- 50: Some mocking but documented and approved
- 0: Extensive mocking of things that should be real

#### 7. Boundary & Negative Coverage (Weight: 10%)

**Check**: Validates edges and forbidden behaviors

**Detects**:
- Missing edge cases (empty, null, max, min)
- Missing negative tests (unauthorized, invalid, etc.)
- No boundary validation

**Scoring**:
- 100: Comprehensive edge and negative coverage
- 50: Some coverage but gaps exist
- 0: Only happy path tested

### Output Format

```markdown
## Test Quality Report: test/payment.spec.ts

**Overall Score**: 68/100 (Needs Improvement)

### Test: "processes payment securely using TLS 1.3"

**Score**: 68/100

**Dimension Scores**:
- Intent Fidelity: 95/100 ✓ (Maps to IA-003)
- No Vacuous Tests: 85/100 ✓ (Meaningful assertions)
- No Brittle Tests: 40/100 ✗ (CRITICAL)
- Determinism: 90/100 ✓ (Fully deterministic)
- Failure Signal Quality: 60/100 ~ (Could be clearer)
- Integration Test Authenticity: 30/100 ✗ (CRITICAL)
- Boundary & Negative Coverage: 75/100 ~ (Missing some edges)

### Issues

**CRITICAL** (must fix before Green phase):
1. [Brittle] Line 42: Testing internal `_validateCardNumber()` private method
2. [Authenticity] Line 56: Mocking payment gateway - should use Docker test instance

**WARNING** (should fix):
1. [Failure Signal] Error message doesn't reference IA-003
2. [Boundary Coverage] Missing test for expired card edge case

### Remediation Steps

1. **Remove private method test** (Line 42):
   - Test public `processPayment()` method instead
   - Trust that validation happens, don't test internal implementation

2. **Replace mock with real gateway** (Line 56):
   ```typescript
   // Before (mocked):
   const mockGateway = jest.fn().mockResolvedValue({ success: true });

   // After (real Dockerized gateway):
   const gateway = new PaymentGateway(process.env.TEST_GATEWAY_URL);
   ```

3. **Improve failure message**:
   ```typescript
   expect(result.encrypted).toBeTruthy();
   // Add: , `IA-003: Payment must use TLS 1.3 encryption`
   ```

4. **Add expired card test**:
   ```typescript
   // @atom IA-003
   it('rejects expired card', () => { ... });
   ```

**Status**: BLOCKED - Fix critical issues before proceeding to Green phase
```

### Integration Points

- **After**: Test written (Red phase)
- **Before**: Implementation (Green phase) - acts as gate
- **Part of**: CI pipeline
- **Triggers**: Automatic on test file changes

---

## P1: Bootstrap Scaffolding Agent

**Skill Name**: `creating-bootstrap-scaffold`

**Purpose**: Create temporary tools with explicit exit criteria and proper tracking

### Inputs

- Need for temporary tooling
- Scaffold type (seed/migration/tooling/runtime)
- Purpose description
- Exit criterion

### Outputs

- Scaffold file(s) with proper header
- Entry in `/bootstrap/README.md` ledger
- CI check configuration (one-way dependency enforcement)
- Removal ticket (GitHub issue)

### Core Capabilities

#### 1. Scaffold Validation

**Checks**:
- Is exit criterion testable?
- Is it truly temporary (not permanent runtime code)?
- Is purpose clear and scoped?
- Is scaffold type correct?

#### 2. Scaffold Creation

**Generates**:
- File with version stamp header
- Entry in scaffold ledger
- CI check for one-way dependencies
- GitHub issue for removal tracking

#### 3. Dependency Direction Check

**Ensures**:
- Bootstrap code can import from `/src`
- `/src` code NEVER imports from `/bootstrap`
- CI enforces this rule

### Output Format

**File**: `/bootstrap/tooling/atom-cli.ts`

```typescript
/**
 * BOOTSTRAP SCAFFOLDING - DO NOT DEPEND ON THIS
 * Scaffold ID: BS-001
 * Type: Tooling
 * Purpose: CLI for creating atom files from natural language
 * Exit Criterion: Pact UI provides atom creation interface with validation
 * Target Removal: Phase 1
 * Owner: @jasontalley
 * Removal Ticket: #TBD
 */

import { AtomValidator } from '@/src/validators/atom-validator';

export class AtomCLI {
  // Temporary CLI implementation
}
```

**Ledger Entry**: `/bootstrap/README.md`

```markdown
| BS-001 | Tooling | CLI for creating atom files | Pact UI provides atom creation interface | @jasontalley | #TBD | Phase 1 |
```

**CI Check**: `.github/workflows/bootstrap-isolation.yml`

```yaml
name: Bootstrap Isolation Check
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Check for bootstrap imports in src
        run: |
          if grep -r "from.*bootstrap" src/; then
            echo "ERROR: Core code depends on bootstrap"
            exit 1
          fi
```

### Integration Points

- **When**: Creating any temporary tooling
- **Triggers**: Human invokes `/create-scaffold` or agent suggests scaffolding

---

## Agent Implementation Notes

### Common Patterns

All agents follow these patterns:

#### 1. Confidence Thresholds

Every LLM-based analysis must check confidence:

```typescript
if (confidence < threshold) {
  return {
    status: 'uncertain',
    message: 'Unable to determine with confidence',
    options: [/* human decision options */]
  };
}
```

#### 2. Human-in-the-Loop

Agents propose, humans decide:

```typescript
// BAD: Agent makes decision
await createAtom(analysisResult);

// GOOD: Agent proposes, human approves
const proposal = await analyzeIntent(input);
const approved = await askHumanForApproval(proposal);
if (approved) {
  await createAtom(proposal);
}
```

#### 3. Explicit Reasoning

Agents explain their thinking:

```markdown
**Analysis**: Not atomic
**Reasoning**: Contains two distinct behaviors (save + confirm)
**Suggested Action**: Decompose into IA-050 and IA-051
**Confidence**: 0.82
```

#### 4. Graceful Degradation

When uncertain, agents escalate:

```typescript
if (confidence < 0.6) {
  return {
    status: 'needs_human_input',
    message: 'Ambiguous intent - requires clarification',
    questions: [/* clarifying questions */]
  };
}
```

---

## Implementation Priority

### Phase 0 (Weeks 1-4) - Foundation

**Week 1-2**:
1. Atomization Agent (P0)
2. Atom Quality Validator (P0)

**Week 3-4**:
3. Test-Atom Coupling Agent (P0)
4. Test Quality Analyzer (P1)

### Phase 0-1 (Weeks 5-8) - Tooling

**Week 5-6**:
5. Bootstrap Scaffolding Agent (P1)

**Week 7-8**:
6. Update existing skills (synthesizing-requirements, interviewing-stakeholders)

### Phase 1 (Weeks 9-12) - Enhancement

**Week 9-10**:
7. Molecule Composer (P2)

**Week 11-12**:
8. Invariant Enforcement Agent (P2)

### Phase 2 (Weeks 13+) - Completion

**Week 13+**:
9. Evidence Collector (P3)

---

## Success Criteria

### Per-Agent Criteria

Each agent is considered "done" when:

1. **Functionality**: Performs core capability reliably
2. **Quality**: Meets confidence threshold requirements
3. **Integration**: Works in defined integration points
4. **Testing**: Has own test suite (tests for the test agents!)
5. **Documentation**: Usage guide in `.claude/skills/` or `/docs`

### Overall Success

Agents are successful when:

- **Ideas → Atoms**: Streamlined with quality gates
- **Tests → Atoms**: Coupling enforced automatically
- **Bootstrap**: Tracked and eventually demolished
- **Quality**: Red/Green phases have clear gates
- **Human Control**: Agents propose, humans approve

---

**Next Steps**:

1. Create detailed implementation plan
2. Set up development infrastructure
3. Implement P0 agents (weeks 1-4)
4. Integrate with existing skills
5. Track success metrics
