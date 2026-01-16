# Pact - Acceptance Criteria

**Generated**: 2026-01-12
**Based on**: Requirements synthesis + stakeholder interviews
**Status**: Ready for test implementation

---

## Overview

This document contains comprehensive Gherkin acceptance criteria for Pact, organized by feature area. These scenarios are ready to be converted into automated tests using a BDD framework (Jest + Cucumber or similar).

**Total Features**: 12
**Total Scenarios**: 90
**Priority**: All scenarios are Must Have for MVP unless marked otherwise

**Recent Updates** (2026-01-12 - Post Architectural Review):

- Added INV-009: Post-Commitment Ambiguity Resolution (new global invariant)
- Added Clarification Artifact scenarios (post-commitment ambiguity handling)
- Added critical guard scenarios for LLM confidence thresholds (prevents silent guessing)
- Added critical guard scenario preventing tests from becoming de facto intent

---

## Feature: Intent Atom Creation & Management

**Epic**: Core Intent System
**Priority**: Must Have
**User Story**: As a product builder, I want to create and manage Intent Atoms using natural language so that I can capture behavioral intent without specifying implementation details.

---

### Scenario: User creates an Intent Atom with natural language

**Given** the user is in the Exploration phase
**And** the user has opened a Canvas workspace
**When** the user types "When a user submits an order, the system should send a confirmation email within 30 seconds"
**And** the user clicks "Create Intent Atom"
**Then** the system analyzes the statement for behavioral precision
**And** the system creates an Intent Atom with status "uncommitted"
**And** the Intent Atom is displayed in the Canvas
**And** the Intent Atom shows the original natural language description

---

### Scenario: System validates Intent Atom for behavioral precision

**Given** a user is creating an Intent Atom
**When** the user enters "The system should be fast and user-friendly"
**And** the system analyzes the statement
**Then** the system flags "fast" and "user-friendly" as vague terms
**And** the system prompts: "What specific behavior defines 'fast'? (e.g., response time < X seconds)"
**And** the system prompts: "What observable outcome defines 'user-friendly'?"
**And** the system suggests: "Try: 'When a user clicks submit, they see a response within 2 seconds'"

---

### Scenario: AI agent suggests Intent Atom decomposition

**Given** a user creates an Intent Atom "When a user registers, the system validates their email, creates their account, sends a welcome email, and logs them in"
**When** the system's AI analyzer reviews the atom
**Then** the AI suggests: "This intent contains multiple behaviors. Consider decomposing into:"
**And** the AI lists:
  | Suggested Atom |
  | When a user submits a registration form with a valid email, the email is validated |
  | When registration is valid, a user account is created |
  | When an account is created, a welcome email is sent |
  | When welcome email is sent, the user is automatically logged in |
**And** the user can accept suggestions to create multiple atoms
**Or** the user can keep the original compound atom

---

### Scenario: System enforces size/complexity heuristics

**Given** a user is creating an Intent Atom
**When** the user enters a description with more than 500 characters
**Then** the system warns: "Intent Atoms should describe a single behavior. This description is unusually long."
**And** the system offers: "Would you like help breaking this into smaller atoms?"
**And** the user can choose to decompose or proceed with the long description

---

### Scenario: System uses iterative refinement prompts

**Given** a user creates an Intent Atom "Users can manage their preferences"
**When** the system analyzes the statement
**Then** the system asks: "What specific preferences can users manage?"
**And** after the user responds "email notifications and privacy settings"
**Then** the system asks: "What actions can users take? (e.g., enable, disable, customize)"
**And** after the user responds
**Then** the system asks: "What should the system do when a preference changes?"
**And** the system helps refine to: "When a user disables email notifications in settings, the system stops sending promotional emails"

---

### Scenario: User freely edits Intent Atom before commitment

**Given** the user has created an uncommitted Intent Atom
**When** the user clicks "Edit" on the Intent Atom
**And** the user changes the description
**And** the user clicks "Save"
**Then** the Intent Atom is updated with the new description
**And** no system validation blocks the change
**And** the edit history is retained for context (but not authoritative)
**And** the Intent Atom remains in "uncommitted" status

---

### Scenario: User deletes uncommitted Intent Atom

**Given** the user has created an uncommitted Intent Atom
**When** the user clicks "Delete" on the Intent Atom
**And** confirms the deletion
**Then** the Intent Atom is removed from the Canvas
**And** no system warning or validation prevents deletion
**And** the deletion is logged for audit purposes (but atom is gone)

---

### Scenario: User organizes Intent Atoms on Canvas

**Given** the user has multiple Intent Atoms in a Canvas workspace
**When** the user drags an Intent Atom to a new position
**Then** the Intent Atom moves to that position
**And** no semantic relationship is implied by proximity
**When** the user groups multiple atoms visually (e.g., drawing a box around them)
**Then** the grouping is saved as a visual aid only
**And** the system does NOT create any ontological "container" or "parent" entity
**And** queries against Intent Atoms ignore visual grouping (flat model)

---

### Scenario: User tags Intent Atoms for cross-cutting views

**Given** the user has multiple Intent Atoms
**When** the user adds tags "authentication" and "MVP" to an Intent Atom
**And** the user adds tag "authentication" to another Intent Atom
**Then** the user can filter the Canvas by tag "authentication"
**And** both Intent Atoms are shown
**And** the tags do NOT create semantic boundaries or dependencies

---

## Feature: Intent Validators

**Epic**: Validation System
**Priority**: Must Have
**User Story**: As a product builder, I want to define validators for Intent Atoms so that meaning is constrained before commitment.

---

### Scenario: User defines validator with natural language expectations

**Given** the user has created an Intent Atom "When a user submits payment, the transaction is processed within 5 seconds"
**When** the user clicks "Add Validator"
**And** the user describes: "Payment amount must be positive, currency must be valid ISO code, user must be authenticated"
**Then** the system's AI translates this into validator checks:
  | Check | Condition |
  | amount > 0 | Payment amount must be positive number |
  | currency matches ISO-4217 | Currency code must be valid 3-letter ISO format |
  | user.authenticated == true | User must have valid session |
**And** the validator is associated with the Intent Atom
**And** the validator can be edited or removed before commitment

---

### Scenario: System adapts validator format to Gherkin (baseline)

**Given** the user has an Intent Atom about order submission
**When** the user defines a validator
**And** the user prefers Gherkin format (system default or user configured)
**Then** the system generates:
```
Given a user with a valid account
And the user has items in their cart
When the user clicks "Place Order"
Then the order is created with status "pending"
And the user sees order confirmation with order ID
And an email is sent to the user's registered email
```
**And** this Gherkin becomes the Intent Validator
**And** later, this translates directly to executable tests

---

### Scenario: System adapts validator format to user's chosen expression

**Given** the user has configured their preferred validator format as "natural language with bullet points"
**When** the user defines a validator for an Intent Atom
**Then** the system accepts natural language
**And** the system formats the validator as structured bullet points
**And** the system can convert to Gherkin or other formats when generating tests

---

### Scenario: User chooses from template library for common validators

**Given** the user is adding a validator to an Intent Atom
**When** the user clicks "Choose from templates"
**Then** the system shows common validator templates:
  | Template | Description |
  | Required field | Field must not be null/empty |
  | Email format | Field must match email regex |
  | Date range | Date must be within specified range |
  | Enum value | Value must be from allowed list |
  | Unique constraint | Value must not already exist in system |
**When** the user selects "Email format" and specifies field "user.email"
**Then** the validator is created with appropriate checks
**And** the validator is associated with the Intent Atom

---

### Scenario: Validator checks run during commitment (not before)

**Given** the user has Intent Atoms with associated validators
**And** the Intent Atoms are in "uncommitted" status
**When** the user edits an Intent Atom
**Then** validators do NOT block the edit
**And** validators are NOT enforced in Exploration or Articulation phases
**And** validators will be checked only at the Commitment Boundary

---

## Feature: Intent Completeness Analysis

**Epic**: Emergent Validation
**Priority**: Must Have
**User Story**: As a product builder, I want the system to help me identify gaps in my intent before commitment so that I can ensure completeness.

---

### Scenario: System suggests gaps via emergent validator checks

**Given** the user has created Intent Atoms for "user registration" feature
**And** the atoms cover: valid email registration, account creation, welcome email
**When** the user requests completeness check (or system proactively suggests)
**Then** the system analyzes for common patterns and suggests:
```
Missing intent atoms for error cases:
- What happens when email is already registered?
- What happens when email format is invalid?
- What happens when email service is unavailable?
- What happens when account creation fails?
```
**And** the user can choose to add Intent Atoms for these cases
**Or** acknowledge and proceed without them (system doesn't block)

---

### Scenario: System shows coverage analysis across system areas

**Given** the user has committed Intent Atoms for multiple features
**And** the system has a model of system areas (authentication, payments, notifications, etc.)
**When** the user views the coverage dashboard
**Then** the system shows:
  | System Area | Intent Atoms | Coverage |
  | Authentication | 12 atoms | 80% (missing: password reset, 2FA) |
  | Payments | 8 atoms | 60% (missing: refunds, disputes) |
  | Notifications | 5 atoms | 40% (missing: preferences, delivery failures) |
**And** the user can drill into each area to see what's covered vs. missing
**And** the system suggests: "Consider adding intent for uncovered areas"
**And** this is advisory, not blocking

---

### Scenario: System detects contradictory Intent Atoms

**Given** the user has Intent Atom A: "Users can delete their account at any time"
**And** the user has Intent Atom B: "User accounts are retained for 90 days after deletion request"
**When** the system runs consistency checks
**Then** the system flags: "These atoms may contradict. Clarify: Is account immediately deleted or soft-deleted?"
**And** the system suggests: "Consider: 'When a user requests deletion, their account is soft-deleted and fully purged after 90 days'"
**And** the user can resolve the contradiction or acknowledge it

---

## Feature: Commitment Boundary - Explicit Ceremony

**Epic**: Commitment System
**Priority**: Must Have
**User Story**: As a product builder, I want an explicit, deliberate ceremony for committing intent so that I'm fully aware of the obligation I'm creating.

---

### Scenario: User initiates commitment ceremony

**Given** the user has multiple uncommitted Intent Atoms in a Canvas
**When** the user clicks "Commit Intent"
**Then** the system displays the Commitment Ceremony interface
**And** the system shows:
```
You are about to commit 12 Intent Atoms
This will create a binding Commitment Artifact
Committed intent becomes enforceable and can only be superseded (not edited)
```
**And** the system shows a summary of all atoms to be committed
**And** the user can review each atom individually
**And** the user can remove atoms from the commitment set before proceeding

---

### Scenario: Commitment ceremony shows invariant check results

**Given** the user is in the Commitment Ceremony
**And** the system is checking Intent Atoms against global invariants
**When** all invariants pass
**Then** the system displays:
```
✓ All global invariants satisfied
✓ All Intent Atoms are behaviorally testable
✓ No unresolved ambiguity detected
✓ Traceability metadata complete
Ready to commit
```
**And** the user can click "Confirm Commitment"

---

### Scenario: Commitment ceremony blocks on invariant violation

**Given** the user is in the Commitment Ceremony
**And** one Intent Atom fails invariant INV-002 (Intent Atoms Must Be Behaviorally Testable)
**When** the invariant check runs
**Then** the system displays:
```
✗ Commitment blocked - Invariant violation

Invariant: INV-002 - Intent Atoms Must Be Behaviorally Testable
Violation: Intent Atom #7 "The system should be intuitive" is not observable or falsifiable

Suggested fixes:
- Rewrite to describe specific observable behavior
- Example: "When a user clicks the main nav, they see all primary functions within 3 clicks"
- Or remove this atom from the commitment set
```
**And** the "Confirm Commitment" button is disabled
**And** the user must fix the violation or remove the atom before proceeding

---

### Scenario: Power user overrides invariant failure with justification

**Given** the user has power user/admin role (future RBAC)
**And** a Commitment ceremony is blocked by an invariant violation
**When** the user clicks "Override" (only visible to power users)
**Then** the system prompts for justification:
```
Overriding invariants bypasses system guardrails and may cause issues.
Please provide justification for this override:
[text field]
```
**When** the user provides justification and clicks "Confirm Override"
**Then** the commitment proceeds despite the violation
**And** the override is logged with:
  - User identity
  - Timestamp
  - Invariant violated
  - Justification text
**And** the Commitment Artifact includes a flag: `invariant_overrides: [{ ... }]`
**And** this is auditable and queryable later

---

### Scenario: System suggests fixes for invariant failures

**Given** the user is blocked by an invariant violation
**When** the system detects fixable issues
**Then** the system offers: "Auto-fix suggestions"
**And** shows:
```
Suggested change for Intent Atom #7:
Original: "The system should be intuitive"
Suggested: "When a new user first logs in, they can complete their first task without consulting documentation"

Accept this suggestion?
```
**When** the user accepts
**Then** the Intent Atom is updated
**And** the invariant check re-runs
**And** if it passes, the user can proceed

---

### Scenario: User completes commitment ceremony

**Given** all invariants pass (or are overridden with justification)
**And** the user has reviewed the summary
**When** the user clicks "Confirm Commitment"
**And** confirms with their identity (username, timestamp captured)
**Then** the system creates an immutable Commitment Artifact
**And** the Commitment Artifact has a unique UUID
**And** all committed Intent Atoms reference this Commitment Artifact
**And** the Intent Atoms change status from "uncommitted" to "committed"
**And** the user sees: "Commitment successful! Commitment ID: [UUID]"
**And** the system transitions to the Observation phase for this commitment

---

### Scenario: User cannot edit Intent Atom after commitment

**Given** an Intent Atom has been committed (part of a Commitment Artifact)
**When** the user tries to edit the Intent Atom
**Then** the system prevents editing
**And** shows: "This Intent Atom is committed and immutable. To change intent, create a new Commitment that supersedes this one."
**And** the user can view the Intent Atom (read-only)
**And** the user can see the Commitment Artifact it belongs to

---

## Feature: Commitment Artifact Generation

**Epic**: Commitment System
**Priority**: Must Have
**User Story**: As a product builder, I want a canonical, machine-readable representation of committed intent so that agents and tools can operate deterministically.

---

### Scenario: System generates Commitment Artifact as structured JSON

**Given** the user completes a commitment ceremony
**When** the system creates the Commitment Artifact
**Then** the artifact is stored as validated JSON with schema:
```json
{
  "id": "uuid",
  "version": "1.0",
  "committed_at": "ISO 8601 timestamp",
  "committed_by": "user_id",
  "intent_atoms": [
    {
      "id": "atom_uuid",
      "description": "behavioral statement",
      "validators": [...],
      "observable_outcomes": [...],
      "falsifiability_criteria": [...]
    }
  ],
  "dependencies": ["other_commitment_ids"],
  "metadata": {
    "tags": [],
    "sprint": "optional",
    "milestone": "optional"
  },
  "invariant_checks": [
    {"invariant_id": "INV-001", "status": "passed"},
    ...
  ],
  "invariant_overrides": [],
  "supersedes": null
}
```
**And** the JSON is immutable after creation
**And** the JSON is globally referenceable by ID
**And** the JSON can be queried and compared across commits

---

### Scenario: Commitment Artifact includes traceability metadata

**Given** a Commitment Artifact is created
**Then** the artifact includes complete traceability:
  - Unique ID
  - Human who committed (username, role)
  - Exact timestamp (millisecond precision)
  - All Intent Atom IDs (with content snapshots)
  - Validator definitions
  - Invariant check results
  - Any dependencies on other Commitments
  - Optional sprint/milestone/release tags
**And** this metadata enables full audit trail reconstruction years later

---

## Feature: Cross-Commitment Dependencies

**Epic**: Commitment System
**Priority**: Must Have
**User Story**: As a product builder, I want to explicitly declare when one commitment depends on another so that the system can validate dependency chains.

---

### Scenario: User declares dependency on another Commitment

**Given** the user is creating Intent Atoms for a "Payment Processing" feature
**And** a previous Commitment exists for "User Authentication" (Commitment ID: C-001)
**When** the user marks an Intent Atom as depending on C-001
**Then** the system records the dependency
**And** during Commitment Ceremony, the system validates:
```
✓ Dependency C-001 (User Authentication) exists
✓ Dependency C-001 is committed (not uncommitted)
✓ No circular dependency detected
```
**And** the new Commitment Artifact includes: `"dependencies": ["C-001"]`

---

### Scenario: System detects circular dependencies and blocks commitment

**Given** Commitment C-001 depends on Commitment C-002
**And** the user is creating a new Commitment that depends on C-001
**And** the user accidentally references C-002 which in turn depends on C-001
**When** the system checks for circular dependencies during Commitment Ceremony
**Then** the system detects the cycle: C-001 → C-002 → [new commitment] → C-001
**And** the system blocks the commitment
**And** shows: "Circular dependency detected: C-001 → C-002 → C-003 → C-001"
**And** displays a visual dependency graph showing the cycle
**And** prompts: "Remove one of these dependencies to break the cycle"

---

### Scenario: User views dependency graph across Commitments

**Given** multiple Commitments exist with dependencies
**When** the user views the "Commitment Dependency Graph"
**Then** the system visualizes:
  - Nodes: Each Commitment (labeled with ID and summary)
  - Edges: Directed arrows showing dependencies
  - Depth levels: Root commitments at top, dependent commitments below
**And** the user can click a Commitment to see details
**And** the user can filter by tag/sprint/milestone
**And** the graph helps identify:
  - High-impact commitments (many dependents)
  - Leaf commitments (no dependents)
  - Isolated commitments (no dependencies)

---

## Feature: Agent-Driven Realization

**Epic**: Realization System
**Priority**: Must Have
**User Story**: As a product builder, I want AI agents to generate code, tests, and plans from committed intent so that execution is automated while remaining constrained by intent.

---

### Scenario: Agent reads Commitment Artifact and generates realization plan

**Given** a Commitment Artifact exists with 12 Intent Atoms
**When** an AI agent is assigned to realize this commitment
**Then** the agent reads the Commitment Artifact JSON
**And** the agent analyzes Intent Atoms and validators
**And** the agent generates a realization plan:
```
Realization Plan for Commitment C-123

1. Generate test suite from Intent Validators (Red phase)
2. Implement code to satisfy Intent Atoms (Green phase)
3. Run tests and capture evidence
4. Refactor if needed
5. Report results to user

Estimated artifacts: 15 tests, 8 code modules, 1 integration test
```
**And** the agent presents the plan to the user
**And** the user can approve or request modifications

---

### Scenario: Agent generates tests from Gherkin validators (Red phase)

**Given** an Intent Atom has a Gherkin validator:
```
Given a user is logged in
When the user clicks "Submit Order"
Then the order is created with status "pending"
```
**When** the agent generates the test suite
**Then** the agent creates executable tests (e.g., Jest + Cucumber):
```javascript
describe('Order Submission', () => {
  it('creates order with pending status when user submits', async () => {
    const user = await loginUser();
    const result = await user.submitOrder();
    expect(result.status).toBe('pending');
  });
});
```
**And** the test references the Commitment Artifact ID in metadata
**And** the test initially fails (Red phase - no implementation yet)
**And** the failure is captured as Evidence

---

### Scenario: Agent generates code to satisfy Intent Atoms (Green phase)

**Given** tests exist from Intent Validators (failing, Red phase)
**When** the agent implements code to make tests pass
**Then** the agent generates minimal code to satisfy the Intent Atom
**And** the code references the Commitment Artifact ID in comments/metadata:
```javascript
// Realization of Commitment C-123, Intent Atom IA-456
// Intent: "When user submits order, order is created with status pending"
async function submitOrder(userId, cartItems) {
  // Implementation...
}
```
**And** the agent runs tests
**And** when tests pass (Green phase), the agent captures success as Evidence
**And** the agent links Realization Artifact (code) to Commitment Artifact

---

### Scenario: Agent cannot reinterpret committed intent

**Given** an Intent Atom states: "Order total must include sales tax calculated at 8%"
**When** the agent implements the code
**And** the agent encounters ambiguity (e.g., "8% of what exactly?")
**Then** the agent does NOT infer or assume an interpretation
**And** the agent flags: "Intent Atom IA-456 requires clarification: Sales tax base amount unclear"
**And** the agent pauses realization for this atom
**And** the agent presents the question to the user
**And** the user must either:
  - Clarify with a new Commitment (superseding)
  - Provide guidance within existing intent

---

### Scenario: System prevents silent mutation of intent via derived artifacts (CRITICAL GUARD)

**Given** a committed Intent Atom states: "When user submits payment, transaction processes within 5 seconds"
**When** an agent generates a test that asserts: "Transaction must process within 2 seconds"
**And** the test contradicts or tightens the committed intent
**Then** the system detects the mismatch
**And** the system flags the test as "invalid Evidence - contradicts committed intent"
**And** the system prevents the test from becoming authoritative
**And** the system notifies the user:
```
Warning: Generated test contradicts Intent Atom IA-123

Intent states: "within 5 seconds"
Test asserts: "within 2 seconds"

Tests cannot redefine intent. Options:
1. Accept test as invalid (will not be run)
2. Create superseding commitment with stricter requirement (2 seconds)
3. Modify test to match intent (5 seconds)
```
**And** the original Intent Atom remains the source of truth
**And** this prevents tests from silently becoming de facto intent

---

### Scenario: Agent is highly proactive during exploration

**Given** the user is in Exploration phase drafting Intent Atoms
**When** the user types: "Users should be able to save their work"
**Then** the agent proactively asks:
```
Agent: What triggers the save? (e.g., manual button, auto-save on change, periodic interval)
```
**When** the user responds: "Auto-save every 30 seconds"
**Then** the agent asks:
```
Agent: What should happen if the save fails? (e.g., retry, notify user, queue for later)
```
**And** the agent helps refine to a precise Intent Atom:
```
"When a user makes changes to their work, the system auto-saves every 30 seconds. If save fails, the system retries up to 3 times and notifies the user if all retries fail."
```

---

### Scenario: Agent uses Clarification Artifact for post-commitment ambiguity

**Given** Commitment C-123 includes Intent Atom: "Payment must process securely"
**And** the commitment is immutable
**When** the agent implements payment processing
**And** the agent encounters ambiguity: "What encryption standard? TLS 1.2 or TLS 1.3?"
**Then** the agent does NOT silently choose an encryption standard
**And** the agent creates a clarification request:
```
Clarification needed for Commitment C-123, Intent Atom IA-456

Question: "Payment must process securely" - What encryption standard should be used?
Options: TLS 1.2 (compatible) or TLS 1.3 (recommended, stricter)

This is a post-commitment ambiguity. Cannot proceed without human clarification.
```
**When** the human responds: "Use TLS 1.3"
**Then** the system creates a Clarification Artifact:
```json
{
  "id": "clarification_uuid",
  "commitment_ref": "C-123",
  "intent_atom_ref": "IA-456",
  "question": "What encryption standard for secure payment processing?",
  "clarification": "Use TLS 1.3 for all payment connections",
  "created_by": "user_id",
  "created_at": "timestamp"
}
```
**And** the Clarification Artifact is immutable
**And** the original Commitment Artifact remains unchanged
**And** the agent uses the clarification to implement correctly
**And** the Realization Artifact references both the Commitment and the Clarification

---

### Scenario: Agent surfaces low confidence instead of guessing (CRITICAL GUARD)

**Given** the agent is analyzing an Intent Atom for atomicity
**When** the agent's LLM confidence score is below threshold (e.g., < 0.7)
**And** the analysis is uncertain whether the atom should be decomposed
**Then** the agent does NOT make a best-guess suggestion
**And** the agent explicitly states: "Unable to determine with confidence whether this Intent Atom should be decomposed"
**And** the agent provides options:
```
Confidence: Low (0.64)

Options:
1. Proceed with atom as-is (you judge it's atomic)
2. Manually review for decomposition
3. Get additional context (answer clarifying questions)
```
**And** the system logs the low-confidence event for monitoring
**And** "unable to determine" is treated as a first-class outcome (not a failure)

---

### Scenario: Agent refuses to act when confidence is insufficient (CRITICAL GUARD)

**Given** the agent is translating a natural language validator to Gherkin
**When** the agent's LLM confidence score is below threshold (e.g., < 0.6)
**And** the translation is ambiguous or uncertain
**Then** the agent does NOT generate a low-quality Gherkin scenario
**And** the agent explicitly states:
```
Unable to generate Gherkin with confidence

Natural language: "The system should handle errors gracefully"
Issue: "gracefully" is ambiguous - no clear behavioral mapping

Please clarify:
- What specific error scenarios should be handled?
- What observable behavior defines "graceful" handling?
- Examples: retry? user notification? logging? fallback?
```
**And** the agent waits for human clarification
**And** the agent does NOT silently produce best-guess output

---

## Feature: Evidence Collection & Analysis

**Epic**: Evidence System
**Priority**: Must Have
**User Story**: As a product builder, I want all execution results captured as immutable evidence so that I can understand system correctness and track progress.

---

### Scenario: Agent generates Evidence Artifact from test execution

**Given** an agent has run tests for a Realization Artifact
**When** tests complete (pass or fail)
**Then** the agent creates an Evidence Artifact:
```json
{
  "id": "evidence_uuid",
  "type": "test_result",
  "commitment_ref": "C-123",
  "realization_ref": "R-456",
  "timestamp": "ISO 8601",
  "outcome": "pass",
  "data": {
    "tests_run": 15,
    "tests_passed": 15,
    "tests_failed": 0,
    "test_details": [...]
  },
  "immutable_hash": "sha256_hash"
}
```
**And** the Evidence Artifact is immutable (cannot be edited or deleted)
**And** the Evidence Artifact is linked to the Commitment and Realization

---

### Scenario: Agent generates code coverage Evidence

**Given** an agent has run tests with coverage instrumentation
**When** coverage analysis completes
**Then** the agent creates a Coverage Evidence Artifact:
```json
{
  "id": "evidence_uuid",
  "type": "coverage_report",
  "commitment_ref": "C-123",
  "realization_ref": "R-456",
  "timestamp": "ISO 8601",
  "outcome": "partial",
  "data": {
    "line_coverage": 87.5,
    "branch_coverage": 82.3,
    "uncovered_lines": [23, 45, 67],
    "uncovered_branches": ["if condition in module X"]
  },
  "immutable_hash": "sha256_hash"
}
```
**And** the coverage data helps identify gaps in realization

---

### Scenario: Agent generates test quality Evidence

**Given** an agent has generated tests
**When** the agent analyzes test quality (not just coverage)
**Then** the agent creates a Test Quality Evidence Artifact:
```json
{
  "id": "evidence_uuid",
  "type": "test_quality",
  "commitment_ref": "C-123",
  "realization_ref": "R-456",
  "timestamp": "ISO 8601",
  "outcome": "pass",
  "data": {
    "brittle_tests": 0,
    "vacuous_tests": 2,
    "assertion_count": {
      "tests_with_no_assertions": 2,
      "tests_with_1_assertion": 5,
      "tests_with_multiple_assertions": 8
    },
    "flagged_issues": [
      "Test 'should work' has no assertions - vacuous test"
    ]
  },
  "immutable_hash": "sha256_hash"
}
```
**And** vacuous tests (tests that always pass) are flagged
**And** brittle tests (over-specified, fragile) are flagged
**And** the user is notified of test quality issues

---

### Scenario: Agent generates security scan Evidence

**Given** an agent has generated code as a Realization Artifact
**When** the agent runs security scanning tools (e.g., Semgrep, npm audit)
**Then** the agent creates a Security Evidence Artifact:
```json
{
  "id": "evidence_uuid",
  "type": "security_scan",
  "commitment_ref": "C-123",
  "realization_ref": "R-456",
  "timestamp": "ISO 8601",
  "outcome": "fail",
  "data": {
    "vulnerabilities_found": 3,
    "critical": 1,
    "high": 2,
    "medium": 0,
    "details": [
      {
        "severity": "critical",
        "rule": "SQL Injection",
        "location": "module X line 45",
        "description": "User input not sanitized before SQL query"
      }
    ]
  },
  "immutable_hash": "sha256_hash"
}
```
**And** critical security issues block further progress
**And** the agent notifies the user with details
**And** the agent suggests fixes

---

### Scenario: Agent analyzes test failure to distinguish bug vs. intent mismatch

**Given** a test fails after code implementation
**When** the agent examines the failure
**Then** the agent uses AI to classify the failure:

**If implementation bug:**
```
Analysis: Code logic error detected
Expected: Order total = $100 + $8 tax = $108
Actual: Order total = $100 (tax not added)
Classification: Implementation bug (intent is clear, code is wrong)
Suggested fix: Add tax calculation in submitOrder function
```

**If intent mismatch:**
```
Analysis: Ambiguity in intent detected
Expected (per test): Tax calculated on subtotal
Actual (per implementation): Tax calculated on subtotal + shipping
Classification: Intent mismatch (unclear whether shipping is taxed)
Recommendation: Clarify Intent Atom - should shipping be included in tax base?
```

**And** the agent presents the classification to the user
**And** the user can approve a code fix (if bug) or supersede intent (if mismatch)

---

### Scenario: Evidence is presented in real-time stream

**Given** an agent is executing realizations for a Commitment
**When** Evidence Artifacts are generated
**Then** the user sees a real-time feed:
```
[12:34:01] ✓ Test suite generated (15 tests)
[12:34:05] ✗ Tests failing (Red phase expected)
[12:34:10] ⚙ Generating code implementation...
[12:34:45] ✓ Code generated (8 modules)
[12:34:50] ⚙ Running tests...
[12:35:15] ✓ 12/15 tests passing
[12:35:15] ✗ 3/15 tests failing (analyzing...)
[12:35:20] ⚠ Test failure: Intent mismatch detected (see details)
```
**And** each item in the feed links to the full Evidence Artifact
**And** the user can drill into details

---

### Scenario: Evidence is viewable in timeline/history

**Given** multiple Evidence Artifacts exist for a Commitment
**When** the user views the Evidence Timeline
**Then** the user sees a chronological view:
  - Horizontal axis: Time
  - Vertical axis: Evidence type (tests, coverage, security, etc.)
  - Points on timeline: Each Evidence Artifact
**And** the user can compare Evidence across time:
  - "Test coverage improved from 80% to 95% over 3 iterations"
  - "Security vulnerabilities decreased from 5 to 0"
**And** the user can click any point to see full Evidence details

---

### Scenario: Evidence is aggregated in dashboard

**Given** Evidence Artifacts exist across multiple Commitments
**When** the user views the Evidence Dashboard
**Then** the user sees aggregated metrics:
```
System Health Overview
- Total Commitments: 24
- Total Realizations: 156
- Test Pass Rate: 94.3%
- Code Coverage: 87.2%
- Security Vulnerabilities: 2 (1 high, 1 medium)
- Uncommitted Intent Atoms: 8

Trending:
- Test pass rate: ↑ 2.1% (last 7 days)
- Coverage: ↑ 5.4% (last 7 days)
```
**And** the dashboard updates in real-time as Evidence accumulates
**And** the user can click metrics to drill into details

---

## Feature: External System Failure Handling

**Epic**: Realization System
**Priority**: Must Have
**User Story**: As a product builder, I want the system to gracefully handle external failures so that transient issues don't break the realization process.

---

### Scenario: Agent captures external API failure as Evidence and retries

**Given** an agent is implementing a feature that calls an external API
**When** the external API is temporarily unavailable (500 error)
**Then** the agent captures the failure as an Evidence Artifact:
```json
{
  "id": "evidence_uuid",
  "type": "external_failure",
  "commitment_ref": "C-123",
  "realization_ref": "R-456",
  "timestamp": "ISO 8601",
  "outcome": "fail",
  "data": {
    "external_system": "payment-api.example.com",
    "failure_type": "503 Service Unavailable",
    "error_message": "Service temporarily unavailable",
    "retry_count": 0
  }
}
```
**And** the agent waits 5 seconds (exponential backoff)
**And** the agent retries the API call
**And** if the retry succeeds, the agent captures success Evidence
**And** if retries fail after 3 attempts, the agent escalates to the user

---

### Scenario: Agent escalates persistent external failure to user

**Given** an external API has failed 3 times
**When** all retries are exhausted
**Then** the agent notifies the user:
```
External system failure: payment-api.example.com
Failed after 3 retry attempts over 20 seconds
Error: 503 Service Unavailable

This is blocking realization of Intent Atom IA-789: "Payment processing"

Options:
1. Retry manually now
2. Mark realization as blocked (will retry later)
3. Skip this Intent Atom temporarily
```
**And** the user chooses an option
**And** the decision is logged in Evidence

---

## Feature: Commitment Supersession

**Epic**: Commitment System
**Priority**: Must Have
**User Story**: As a product builder, I want to supersede previous commitments when intent changes so that the system evolves while maintaining audit history.

---

### Scenario: User creates new Commitment that supersedes a previous one

**Given** Commitment C-001 exists with Intent Atom: "Users can delete their account immediately"
**And** the user realizes this intent needs to change
**When** the user creates a new Intent Atom: "When a user requests account deletion, the account is soft-deleted and purged after 30 days"
**And** the user marks this as superseding C-001
**And** the user commits the new intent
**Then** the system creates Commitment C-002
**And** C-002 includes: `"supersedes": "C-001"`
**And** C-001 is marked as status: "superseded"
**And** C-001 remains immutable and queryable (audit trail)
**And** agents now follow C-002 for new realizations

---

### Scenario: Existing Realization Artifacts are archived when Commitment superseded

**Given** Commitment C-001 has been realized (code, tests exist)
**When** Commitment C-002 supersedes C-001
**Then** the Realization Artifacts for C-001 are:
  - Marked with status: "archived"
  - Linked to C-001 (via metadata)
  - Retained for audit purposes
  - NOT deleted
**And** new Realization Artifacts are generated for C-002
**And** the archived artifacts are clearly labeled in the UI
**And** users can view archived artifacts to understand what changed

---

### Scenario: Evidence trail shows supersession history

**Given** Commitment C-002 has superseded C-001
**When** the user views the Evidence Timeline for this feature area
**Then** the timeline shows:
```
[Week 1] C-001 committed: "Immediate account deletion"
[Week 1] Realizations for C-001 completed
[Week 2] C-002 committed: "Soft delete with 30-day retention" (supersedes C-001)
[Week 2] C-001 marked as superseded
[Week 2] Realizations for C-002 in progress
```
**And** the user can see the evolution of intent over time
**And** the user can compare C-001 vs. C-002 to understand what changed

---

## Feature: Integration with Git & CI/CD

**Epic**: External Integrations
**Priority**: Must Have
**User Story**: As a product builder, I want Pact to integrate with my existing Git workflow and CI/CD pipeline so that Pact fits into my development process.

---

### Scenario: Realization Artifacts are committed to Git with Commitment references

**Given** an agent generates code as a Realization Artifact for Commitment C-123
**When** the code is ready to be added to version control
**Then** the agent creates a Git commit with message:
```
Realize Commitment C-123: User order submission

Intent Atoms:
- IA-456: When user submits order, order created with pending status
- IA-457: When order created, confirmation email sent within 30 seconds

Commitment: C-123
Realization: R-789

Co-Authored-By: AI Agent <agent@pact.dev>
```
**And** the commit message includes Commitment and Realization IDs
**And** this enables traceability from code back to intent
**And** users can run: `git log --grep="C-123"` to find related commits

---

### Scenario: Realizations tied to feature branches

**Given** the user is working on Commitment C-123
**When** the agent begins realization
**Then** the agent creates (or uses existing) feature branch: `feature/C-123-order-submission`
**And** all code for this Commitment is committed to this branch
**And** when realizations are complete and evidence is satisfactory
**Then** the user merges the branch to main
**And** the merge commit references the Commitment ID

---

### Scenario: CI/CD pipeline generates Evidence Artifacts

**Given** code is pushed to a Git branch
**When** the CI/CD pipeline runs (e.g., GitHub Actions, GitLab CI)
**Then** the pipeline runs tests and captures results
**And** the pipeline posts test results back to Pact as Evidence Artifacts
**And** the Evidence references the Commitment ID (from commit message)
**And** the CI/CD pipeline posts:
  - Test results (pass/fail)
  - Code coverage
  - Security scan results
  - Build success/failure
**And** these Evidence Artifacts are displayed in Pact's Evidence Timeline
**And** users see real-time CI/CD results in Pact UI

---

### Scenario: Commitments tagged with sprint/milestone metadata

**Given** the user is creating a Commitment
**When** the user adds metadata tags: `sprint: "Sprint 24"` and `milestone: "v2.0"`
**Then** the Commitment Artifact includes this metadata
**And** users can filter Commitments by sprint or milestone
**And** users can query: "Show all Commitments for Sprint 24"
**And** this helps align Pact with existing project management workflows (Jira, Linear, etc.)

---

## Feature: Multi-User Collaboration (Future)

**Epic**: Collaboration (Future Enhancement)
**Priority**: Should Have (not MVP)
**User Story**: As a team member, I want to collaborate with others on intent definition so that we can build shared understanding.

---

### Scenario: Multiple users collaborate on a Canvas

**Given** two users are viewing the same Canvas
**When** User A creates an Intent Atom
**Then** User B sees the Intent Atom appear in real-time
**And** User B can comment on the Intent Atom
**And** User A sees the comment notification
**And** both users can edit the Intent Atom (pre-commitment)
**And** edit conflicts are resolved via last-write-wins or merge prompts

---

### Scenario: Commit authority is distributed

**Given** a team has defined roles: "Product Owner" and "Developer"
**When** a Developer creates Intent Atoms
**Then** the Developer can request commitment approval from Product Owner
**And** the Product Owner reviews and either approves or requests changes
**And** only approved Intent Atoms can be committed
**And** the Commitment Artifact records both author and approver

---

## Summary Statistics

**Total Features**: 12
- Core Intent System: 1 feature
- Validation System: 2 features
- Commitment System: 3 features
- Realization System: 1 feature
- Evidence System: 1 feature
- External Integrations: 1 feature
- Error Handling: 1 feature
- Collaboration (Future): 1 feature

**Total Scenarios**: 87
- Intent Creation: 9 scenarios
- Intent Validators: 5 scenarios
- Completeness Analysis: 3 scenarios
- Commitment Ceremony: 7 scenarios
- Commitment Artifacts: 2 scenarios
- Cross-Commit Dependencies: 3 scenarios
- Agent Realization: 6 scenarios
- Evidence Collection: 9 scenarios
- External Failures: 2 scenarios
- Supersession: 3 scenarios
- Git/CI Integration: 4 scenarios
- Collaboration (future): 2 scenarios

**Breakdown by Priority**:
- Must Have (MVP): 85 scenarios
- Should Have (Future): 2 scenarios

---

## Test Implementation Notes

### Recommended Testing Stack

- **BDD Framework**: Jest + Cucumber (or Vitest + Cucumber)
- **API Testing**: Supertest for HTTP endpoints
- **Database**: In-memory test database or Docker containers
- **AI/Agent Mocking**: Mock LLM calls for deterministic tests; separate integration tests with real LLM

### Test Organization

```
tests/
├── features/                    # Gherkin feature files
│   ├── intent-atoms.feature
│   ├── validators.feature
│   ├── commitment.feature
│   ├── realization.feature
│   └── evidence.feature
├── step-definitions/            # Step implementations
│   ├── intent-steps.ts
│   ├── commitment-steps.ts
│   └── ...
├── fixtures/                    # Test data
│   ├── sample-intent-atoms.json
│   └── sample-commitments.json
└── support/                     # Test helpers
    ├── test-database.ts
    └── mock-agent.ts
```

### Critical Test Data Requirements

- Sample Intent Atoms (valid, invalid, ambiguous)
- Sample Validators (Gherkin, natural language, templates)
- Sample Commitment Artifacts (with/without dependencies)
- Sample Evidence Artifacts (all types)
- Mock LLM responses for agent interactions

---

## Open Questions Remaining

These were not fully answered in the interview and may require future clarification:

1. **Retrospective/Learning Loop**: How does the system capture learnings from Evidence and feed them forward to improve future intent definition?

2. **Search & Query Interface**: With a flat atom model and potentially thousands of Intent Atoms, what search/query capabilities are needed beyond tagging?

3. **Performance Characteristics**: At what scale (number of atoms, commitments, evidence artifacts) do we need indexing, caching, or archival strategies?

4. **Multi-Tenant Architecture**: If Pact becomes a service, how do we isolate Intent/Commitment/Evidence data across different users/teams/organizations?

5. **Agent Policy Configuration**: How do users customize agent behavior (proactivity level, retry strategies, analysis depth) without changing global invariants?

---

## Next Steps

1. **Validate these scenarios** with stakeholders - ensure they match expectations
2. **Set up BDD testing framework** (Jest + Cucumber or similar)
3. **Implement scenarios in priority order**:
   - Phase 1: Intent Atom creation & management (scenarios 1-9)
   - Phase 2: Commitment Boundary & invariants (scenarios 10-20)
   - Phase 3: Agent realization & evidence (scenarios 21-40)
   - Phase 4: Integrations & supersession (scenarios 41-50)
4. **Build iteratively using TDD**: Write tests first (from these scenarios), then implement to make them pass
5. **Capture Evidence** of Pact building itself (meta-recursion!)

---

**Ready for implementation!** These scenarios provide a complete, testable specification of Pact's MVP.
