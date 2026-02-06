# Implementation Checklist: Phase 18 — Agent-Suggested Atoms & HITL Approval

## Document Metadata

| Field | Value |
|-------|-------|
| **Phase** | 18 |
| **Focus** | Agent atom suggestions, human-in-the-loop approval, reconciliation inference |
| **Status** | Not Started |
| **Prerequisites** | Phase 15 (Pact Main Governance), Phase 17 (Local/Remote Split), MCP server exists |
| **Related Docs** | [agents-overview.md](agents-overview.md), [implementation-checklist-phase15.md](implementation-checklist-phase15.md), [implementation-checklist-phase17.md](implementation-checklist-phase17.md) |

---

## Overview

Phase 18 enables coding agents (Claude Code, Cursor, etc.) to discover epistemic gaps during implementation and propose new atoms, while maintaining human authority over canonical truth through a human-in-the-loop (HITL) approval workflow.

**Core Principle**: **Agents propose, humans commit.**

### The Problem

When Claude Code implements an existing atom (e.g., IA-042: password reset), it may discover a missing related atom (e.g., rate limiting). Currently, Claude Code has two bad options:
1. **Implement without coupling** → Creates orphan test → CI fails or flags
2. **Skip the behavior** → Leaves security gap → Technical debt

### The Solution

Claude Code can **suggest** new atoms during implementation:
1. Agent discovers gap → calls `suggest_atom` MCP tool → atom created with `status: proposed`
2. Agent implements test with `@atom IA-NEW-xxx` annotation
3. Local reconciliation shows "proposed atom, pending approval"
4. CI detects proposed atom → blocks merge (policy-driven)
5. **Human reviews** in dashboard → approves/edits/rejects
6. If approved → atom promoted to `committed` → CI passes → PR merges

**Alternative path**: If agent commits without atom annotation, reconciliation agent detects orphan test and **infers** a proposed atom for human review.

### Key Capabilities

- **Agent Atom Suggestions**: Claude Code can propose atoms via MCP (`suggest_atom` tool)
- **Proposed Status**: New atoms start as `proposed` (plausible, not canonical)
- **HITL Approval Workflow**: Dashboard for reviewing, editing, approving, or rejecting proposed atoms
- **CI Policy Gates**: Configurable blocking on proposed atoms (`PACT_BLOCK_ON_PROPOSED_ATOMS`)
- **Reconciliation Inference**: Reconciliation agent suggests atoms for orphan tests
- **Scope-Aware Queries**: Local scope shows proposed atoms, main scope shows committed only

---

## 18.1 Database Schema Extensions

### Context

Support proposed atoms with metadata about source, confidence, and approval status.

### Tasks

- [ ] **18.1.1** Extend Atom entity for agent suggestions
  - **File**: `src/modules/atoms/atom.entity.ts`
  - **Priority**: High | **Effort**: M
  - **Details**:
    - Add `status` enum: `draft | proposed | committed | superseded | abandoned`
    - Add `source` enum: `human | interview_agent | agent_inference | reconciliation_inference`
    - Add `confidence: number` (nullable, 0.0-1.0) for agent-suggested atoms
    - Add `rationale: string` (nullable) - why this atom was suggested
    - Add `relatedAtomId: number` (nullable) - parent/related atom
    - Add `proposedBy: string` (nullable) - agent identifier or user ID
    - Add `approvedBy: string` (nullable) - user who approved (if committed)
    - Add `approvedAt: Date` (nullable) - when approved
    - Add index on `status` for fast filtering
    - Update existing atoms to have `source: 'human'` and `status: 'committed'` (migration)

- [ ] **18.1.2** Create atom status migration
  - **File**: `src/migrations/1739088000000-AddAtomProposedStatus.ts`
  - **Priority**: High | **Effort**: S
  - **Dependencies**: 18.1.1
  - **Details**:
    - Add new columns: `source`, `confidence`, `rationale`, `relatedAtomId`, `proposedBy`, `approvedBy`, `approvedAt`
    - Update existing atoms: set `source = 'human'` where null
    - Create index on `status` column
    - Add check constraint: `confidence` between 0 and 1 if not null
    - Idempotent (check if columns exist before adding)

- [ ] **18.1.3** Add reconciliation policy configuration table
  - **File**: `src/migrations/1739088100000-CreateReconciliationPolicies.ts`
  - **Priority**: Medium | **Effort**: M
  - **Dependencies**: None
  - **Details**:
    - Create `reconciliation_policies` table:
      ```typescript
      @Entity('reconciliation_policies')
      export class ReconciliationPolicy {
        @PrimaryGeneratedColumn() id: number;
        @Column({ unique: true }) projectId: number;
        @Column({ default: true }) allowAgentAtomSuggestions: boolean;
        @Column({ default: true }) ciBlockOnProposedAtoms: boolean;
        @Column({ default: false }) ciWarnOnProposedAtoms: boolean;
        @Column({ default: true }) ciFailOnOrphanTests: boolean;
        @Column({ default: true }) reconciliationInfersAtoms: boolean;
        @Column({ default: true }) requireHumanApproval: boolean;
        @Column({ default: false }) allowAutoCommit: boolean;
        @Column({ type: 'float', default: 0.75 }) minConfidenceForSuggestion: number;
        @CreateDateColumn() createdAt: Date;
        @UpdateDateColumn() updatedAt: Date;
      }
      ```
    - Create default policy for all projects

---

## 18.2 MCP Tools for Agent Atom Suggestions

### Context

Enable Claude Code to suggest atoms via MCP and query proposed/committed atoms with scope awareness.

### Tasks

- [ ] **18.2.1** Create `suggest_atom` MCP tool
  - **File**: `src/mcp/tools/suggest-atom.tool.ts`
  - **Priority**: High | **Effort**: M
  - **Details**:
    - Input schema:
      ```typescript
      {
        description: string;           // Clear, testable description
        category: 'functional' | 'security' | 'performance' | 'ux' | 'operational';
        rationale: string;             // Why this atom is needed
        relatedAtomId?: string;        // Parent/related atom ID
        validators?: string[];         // Observable outcomes
      }
      ```
    - Calls `POST /api/atoms` with `status: 'proposed'`, `source: 'agent_inference'`
    - Returns:
      ```typescript
      {
        atomId: string;                // e.g., "IA-NEW-001"
        status: "proposed",
        scope: "local",
        message: "Atom proposed. Use this ID in test annotations. Requires HITL approval to commit.",
        reviewUrl: string              // Link to review dashboard
      }
      ```
    - Validates that agent suggestions are allowed (check `reconciliation_policies`)

- [ ] **18.2.2** Update `list_atoms` MCP tool for scope awareness
  - **File**: `src/mcp/tools/list-atoms.tool.ts`
  - **Priority**: High | **Effort**: S
  - **Dependencies**: 18.2.1
  - **Details**:
    - Add `scope` parameter: `'main' | 'local' | 'all'` (default: `'all'`)
    - If `scope: 'main'`: filter to `status: 'committed'` only
    - If `scope: 'local'`: include `status: 'proposed'` and `status: 'committed'`
    - Update description to explain scope filtering

- [ ] **18.2.3** Update `search_atoms` MCP tool for scope awareness
  - **File**: `src/mcp/tools/search-atoms.tool.ts`
  - **Priority**: High | **Effort**: S
  - **Dependencies**: 18.2.1
  - **Details**:
    - Add `scope` parameter (same as 18.2.2)
    - Add `includeProposed: boolean` parameter (default: false)
    - Filter results based on scope and includeProposed flags

- [ ] **18.2.4** Create `get_implementable_atoms` MCP tool
  - **File**: `src/mcp/tools/get-implementable-atoms.tool.ts`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 18.2.1
  - **Details**:
    - Returns atoms ready to implement:
      - `status: 'committed'`
      - `coveragePercent < 80%` (configurable threshold)
      - Sorted by priority (quality score descending)
    - Input schema:
      ```typescript
      {
        limit?: number;                // Max results (default: 10)
        category?: string;             // Filter by category
        minCoverage?: number;          // Coverage threshold (default: 80)
        includeProposed?: boolean;     // Include proposed atoms (default: false)
      }
      ```
    - Returns:
      ```typescript
      {
        atoms: [
          {
            id: string;
            description: string;
            category: string;
            coverage: string;          // e.g., "45%"
            validators: string[];
            priority: "high" | "medium" | "low"
          }
        ],
        message: string
      }
      ```

- [ ] **18.2.5** Update MCP tool registry
  - **File**: `src/mcp/tools/index.ts`
  - **Priority**: High | **Effort**: S
  - **Dependencies**: 18.2.1, 18.2.4
  - **Details**:
    - Import and register `suggestAtomTool`
    - Import and register `getImplementableAtomsTool`
    - Update `allTools` array
    - Total tools: 10 (was 8, adding 2 new)

- [ ] **18.2.6** Register Pact MCP server in Claude Code config
  - **File**: `.claude/mcp-servers.json` or project config
  - **Priority**: High | **Effort**: S (manual configuration)
  - **Details**:
    - Create or update `.claude/mcp-servers.json`:
      ```json
      {
        "pact": {
          "command": "node",
          "args": ["/Users/jasontalley/code/pact/dist/mcp/pact-mcp-server.js"],
          "env": {
            "PACT_API_URL": "http://localhost:3000"
          }
        }
      }
      ```
    - Or add to global `~/.claude/mcp-servers.json`
    - Document in MCP server README
    - Verify Claude Code can discover Pact tools

---

## 18.3 API Endpoints for Proposed Atoms

### Context

REST API endpoints for creating, querying, and managing proposed atoms.

### Tasks

- [ ] **18.3.1** Create proposed atom creation endpoint
  - **File**: `src/modules/atoms/atoms.controller.ts`
  - **Priority**: High | **Effort**: M
  - **Details**:
    - `POST /api/atoms` with body:
      ```typescript
      {
        description: string;
        category: string;
        status?: 'draft' | 'proposed' | 'committed';  // default: 'draft'
        source?: 'human' | 'agent_inference' | 'reconciliation_inference';
        confidence?: number;
        rationale?: string;
        relatedAtomId?: number;
        validators?: CreateValidatorDto[];
        tags?: string[];
      }
      ```
    - If `source: 'agent_inference'` and `status: 'proposed'`:
      - Check `reconciliation_policies.allowAgentAtomSuggestions`
      - Auto-set `proposedBy` to agent identifier (from auth or request context)
    - Generate `atomId` (e.g., `IA-NEW-001` for proposed, `IA-nnn` for committed)
    - Return created atom with `reviewUrl`

- [ ] **18.3.2** Add proposed atom filtering to list endpoint
  - **File**: `src/modules/atoms/atoms.controller.ts`
  - **Priority**: High | **Effort**: S
  - **Details**:
    - Extend `GET /api/atoms` query params:
      - `status?: 'draft' | 'proposed' | 'committed' | 'superseded' | 'abandoned'`
      - `source?: string`
      - `scope?: 'main' | 'local'` (maps to status filter)
      - `includeProposed?: boolean`
    - Update `AtomsService.findAll()` to support new filters
    - Document in API docs

- [ ] **18.3.3** Create atom approval endpoint
  - **File**: `src/modules/atoms/atoms.controller.ts`
  - **Priority**: High | **Effort**: M
  - **Details**:
    - `PATCH /api/atoms/:id/approve` (requires authentication)
    - Body (optional):
      ```typescript
      {
        description?: string;          // Optional edit before approval
        validators?: UpdateValidatorDto[];
      }
      ```
    - Logic:
      - Check atom `status === 'proposed'`
      - Update description/validators if provided
      - Set `status = 'committed'`
      - Set `approvedBy = currentUser.id`
      - Set `approvedAt = now()`
      - Generate permanent `atomId` (replace `IA-NEW-xxx` with `IA-nnn`)
      - Update all test links to use new `atomId`
      - Emit event for audit log
    - Return updated atom

- [ ] **18.3.4** Create atom rejection endpoint
  - **File**: `src/modules/atoms/atoms.controller.ts`
  - **Priority**: High | **Effort**: S
  - **Dependencies**: 18.3.3
  - **Details**:
    - `PATCH /api/atoms/:id/reject` (requires authentication)
    - Body:
      ```typescript
      {
        reason: string;                // Why rejected
      }
      ```
    - Logic:
      - Check atom `status === 'proposed'`
      - Set `status = 'abandoned'`
      - Store rejection reason in atom metadata
      - Emit event for audit log
    - Tests linked to this atom become orphans
    - Return updated atom

- [ ] **18.3.5** Create atom edit endpoint
  - **File**: `src/modules/atoms/atoms.controller.ts`
  - **Priority**: Medium | **Effort**: S
  - **Dependencies**: 18.3.3
  - **Details**:
    - `PATCH /api/atoms/:id/edit` (requires authentication)
    - Body:
      ```typescript
      {
        description?: string;
        category?: string;
        validators?: UpdateValidatorDto[];
        tags?: string[];
      }
      ```
    - Only allowed for `status: 'proposed'` or `status: 'draft'`
    - Committed atoms cannot be edited (must supersede)
    - Return updated atom

- [ ] **18.3.6** Create pending review endpoint
  - **File**: `src/modules/atoms/atoms.controller.ts`
  - **Priority**: Medium | **Effort**: S
  - **Dependencies**: 18.3.1
  - **Details**:
    - `GET /api/atoms/pending-review` (requires authentication)
    - Returns all atoms with `status: 'proposed'`
    - Includes full context:
      ```typescript
      {
        atoms: [
          {
            id: number;
            atomId: string;
            description: string;
            category: string;
            source: string;
            confidence?: number;
            rationale?: string;
            relatedAtom?: { id: string; description: string };
            linkedTests: { file: string; testName: string; lineNumber: number }[];
            coverage?: number;
            proposedBy: string;
            proposedAt: Date;
          }
        ],
        total: number
      }
      ```

- [ ] **18.3.7** Create review context endpoint
  - **File**: `src/modules/atoms/atoms.controller.ts`
  - **Priority**: Medium | **Effort**: M
  - **Dependencies**: 18.3.1
  - **Details**:
    - `GET /api/atoms/:id/review-context`
    - Returns full context for review decision:
      - Atom details
      - Related atom details (if `relatedAtomId` set)
      - Linked tests with full test code snippets
      - Coverage data
      - Suggestion confidence and rationale
      - Similar existing atoms (semantic search)
    - Used by review dashboard UI

---

## 18.4 HITL Approval Dashboard

### Context

Frontend UI for reviewing and managing proposed atoms.

### Tasks

- [ ] **18.4.1** Create `ProposedAtomCard` component
  - **File**: `frontend/components/atoms/ProposedAtomCard.tsx`
  - **Priority**: High | **Effort**: M
  - **Details**:
    - Card showing proposed atom summary:
      - Description with edit icon
      - Category badge
      - Source badge (agent_inference, reconciliation_inference)
      - Confidence indicator (if available)
      - Rationale text
      - Related atom link (if applicable)
      - Linked tests count
      - Coverage percentage (if available)
      - Proposed by + proposed date
    - Actions: "Review" button → opens detail modal
    - Visual indicator: blue border + "PROPOSED" badge

- [ ] **18.4.2** Create `AtomReviewModal` component
  - **File**: `frontend/components/atoms/AtomReviewModal.tsx`
  - **Priority**: High | **Effort**: L
  - **Dependencies**: 18.4.1
  - **Details**:
    - Full-screen or large modal for review:
      - **Left panel**: Atom details (editable)
        - Description (inline edit)
        - Category (dropdown)
        - Validators (list with add/remove)
        - Tags (editable)
      - **Right panel**: Context
        - Rationale
        - Related atom (if any)
        - Linked tests with code snippets
        - Coverage visualization
        - Similar existing atoms (semantic search results)
      - **Actions bar**:
        - "Approve" button (green) → calls `/api/atoms/:id/approve`
        - "Approve with Edits" button (green) → saves edits + approves
        - "Reject" button (red) → opens rejection reason dialog
        - "Save Draft" button (gray) → saves edits without approval
        - "Cancel" button
      - Confirmation dialogs for approve/reject

- [ ] **18.4.3** Create `PendingAtomsPage` component
  - **File**: `frontend/app/atoms/pending/page.tsx`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 18.4.1, 18.4.2
  - **Details**:
    - Full page showing all proposed atoms:
      - List of `ProposedAtomCard` components
      - Filter by source (agent_inference, reconciliation_inference)
      - Filter by category
      - Sort by confidence, date proposed
      - Batch actions: "Approve All", "Review Selected"
    - Empty state: "No atoms pending review"
    - Uses `useProposedAtoms()` hook

- [ ] **18.4.4** Create `useProposedAtoms` hook
  - **File**: `frontend/hooks/atoms/use-proposed-atoms.ts`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 18.3.6
  - **Details**:
    - `useProposedAtoms(filters?)` - list proposed atoms
    - `useApproveAtom()` - mutation for approval
    - `useRejectAtom()` - mutation for rejection
    - `useEditProposedAtom()` - mutation for edits
    - Uses React Query for caching and optimistic updates

- [ ] **18.4.5** Add pending atoms navigation
  - **File**: `frontend/components/layout/Sidebar.tsx`
  - **Priority**: Medium | **Effort**: S
  - **Dependencies**: 18.4.3
  - **Details**:
    - Add "Pending Review" item to sidebar under "Atoms"
    - Badge showing count of pending atoms
    - Icon: review/checklist icon
    - Link to `/atoms/pending`

- [ ] **18.4.6** Add proposed atom indicator to atom detail page
  - **File**: `frontend/app/atoms/[id]/page.tsx`
  - **Priority**: Medium | **Effort**: S
  - **Details**:
    - If atom `status === 'proposed'`:
      - Show "PROPOSED" badge prominently
      - Show "Review & Approve" button at top
      - Show rationale section
      - Show proposed by + date
      - Disable certain actions (e.g., supersede, create change set)

---

## 18.5 Reconciliation Inference for Orphan Tests

### Context

Extend reconciliation agent to infer proposed atoms when orphan tests are detected.

### Tasks

- [ ] **18.5.1** Create atom inference service
  - **File**: `src/modules/agents/atom-inference.service.ts`
  - **Priority**: High | **Effort**: L
  - **Details**:
    - `inferAtomFromTest(testFile, testName, testCode): Promise<InferredAtom>`
    - Logic:
      1. Extract test behavior from test code (analyze assertions, mocks)
      2. Search existing atoms for semantic match (embedding similarity or keyword match)
      3. If no match found (confidence < threshold), generate proposed atom:
         - Extract description from test name and assertions
         - Infer category from test context (auth tests → security, etc.)
         - Extract validators from test assertions
         - Calculate confidence score (0.0-1.0)
      4. Return inferred atom structure
    - Uses LLM service for inference:
      ```typescript
      const prompt = `
      Given this orphan test (no @atom annotation):

      Test file: ${testFile}
      Test name: ${testName}
      Test code:
      ${testCode}

      Infer the intent atom this test verifies. Provide:
      1. Clear, testable description
      2. Category (functional/security/performance/ux/operational)
      3. Observable outcomes (validators)
      4. Why this behavior is important (rationale)
      `;
      ```
    - Returns:
      ```typescript
      {
        description: string;
        category: string;
        validators: string[];
        rationale: string;
        confidence: number;     // 0.0-1.0
        evidence: string[];     // What test behavior suggests this atom
      }
      ```

- [ ] **18.5.2** Extend reconciliation persist node to create proposed atoms
  - **File**: `src/modules/agents/graphs/nodes/reconciliation/persist.node.ts`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 18.5.1
  - **Details**:
    - After saving reconciliation run results:
      1. Check `reconciliation_policies.reconciliationInfersAtoms`
      2. For each orphan test:
         - Call `atomInferenceService.inferAtomFromTest()`
         - If confidence >= `minConfidenceForSuggestion`:
           - Create proposed atom via `atomsService.create()`
           - Set `status: 'proposed'`, `source: 'reconciliation_inference'`
           - Link test to proposed atom (with flag `isProposedLink`)
      3. Add proposed atoms to reconciliation run output
    - Update reconciliation report to include:
      ```typescript
      {
        orphanTests: [...],
        proposedAtoms: [
          {
            atomId: string;
            testFile: string;
            testName: string;
            description: string;
            confidence: number;
            reviewUrl: string;
          }
        ]
      }
      ```

- [ ] **18.5.3** Create orphan resolution UI
  - **File**: `frontend/components/reconciliation/OrphanResolutionCard.tsx`
  - **Priority**: Medium | **Effort**: M
  - **Dependencies**: 18.5.2
  - **Details**:
    - Card showing orphan test with proposed atom:
      - **Top**: Orphan test info
        - Test file + line number
        - Test name
        - Test code snippet (first 5 lines)
      - **Middle**: Proposed atom
        - Description (editable)
        - Category badge
        - Confidence indicator
        - Rationale
        - Evidence from test
      - **Actions**:
        - "Approve & Link" → approves atom + links test
        - "Edit & Link" → opens edit modal + links test
        - "Link to Existing" → opens atom search + links test
        - "Mark as Technical Test" → exempts test from atom requirement
        - "Ignore" → skip for now
    - Used in reconciliation results view

- [ ] **18.5.4** Add orphan resolution to reconciliation wizard
  - **File**: `frontend/components/agents/ReconciliationWizard.tsx`
  - **Priority**: Medium | **Effort**: M
  - **Dependencies**: 18.5.3
  - **Details**:
    - Add "Resolve Orphans" step after "Review Results"
    - If `proposedAtoms.length > 0`:
      - Show list of `OrphanResolutionCard` components
      - Require user to resolve all orphans before completing
      - Options: approve, link to existing, mark as technical, or ignore
    - Track resolution actions:
      - Approved atoms → list of approved `atomId`s
      - Linked atoms → map of `{ testFile: atomId }`
      - Technical tests → list of test files
    - Submit resolutions via bulk API endpoint

- [ ] **18.5.5** Create bulk orphan resolution endpoint
  - **File**: `src/modules/agents/reconciliation.controller.ts`
  - **Priority**: Medium | **Effort**: M
  - **Dependencies**: 18.5.2
  - **Details**:
    - `POST /api/reconciliation/:runId/resolve-orphans`
    - Body:
      ```typescript
      {
        approvals: [
          { atomId: string; edits?: { description?: string; ... } }
        ],
        links: [
          { testFile: string; atomId: string }
        ],
        technicalTests: string[];      // Test files to exempt
      }
      ```
    - Logic:
      1. Approve atoms (with optional edits)
      2. Create test-atom links
      3. Mark tests as technical (add metadata)
      4. Update reconciliation run status
    - Returns summary of actions taken

---

## 18.6 CI Policy Enforcement

### Context

Configure CI to block, warn, or allow proposed atoms based on policy.

### Tasks

- [ ] **18.6.1** Add policy check to reconciliation service
  - **File**: `src/modules/agents/reconciliation.service.ts`
  - **Priority**: High | **Effort**: M
  - **Details**:
    - After reconciliation completes, check for proposed atoms:
      ```typescript
      const proposedAtoms = await this.atomsRepo.find({
        where: { status: 'proposed', projectId: run.projectId }
      });

      const policy = await this.policiesRepo.findOne({
        where: { projectId: run.projectId }
      });

      if (proposedAtoms.length > 0) {
        if (policy.ciBlockOnProposedAtoms) {
          return {
            status: 'blocked',
            message: `${proposedAtoms.length} proposed atoms require approval`,
            proposedAtoms: proposedAtoms.map(a => ({
              atomId: a.atomId,
              description: a.description,
              reviewUrl: `${baseUrl}/atoms/${a.id}/review`
            }))
          };
        } else if (policy.ciWarnOnProposedAtoms) {
          return {
            status: 'warning',
            message: `${proposedAtoms.length} proposed atoms pending review`,
            proposedAtoms: [...]
          };
        }
      }
      ```
    - Return status in reconciliation result

- [ ] **18.6.2** Update CI example to handle policy blocks
  - **File**: `packages/client-sdk/examples/ci/example.ts`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 18.6.1
  - **Details**:
    - After reconciliation completes:
      ```typescript
      if (result.status === 'blocked') {
        console.error('BLOCKED: Proposed atoms require approval');
        console.error(`Review at: ${result.proposedAtoms[0].reviewUrl}`);
        for (const atom of result.proposedAtoms) {
          console.error(`  - ${atom.atomId}: ${atom.description}`);
        }
        return 1;  // Fail CI
      }

      if (result.status === 'warning') {
        console.warn('WARNING: Proposed atoms pending review');
        for (const atom of result.proposedAtoms) {
          console.warn(`  - ${atom.atomId}: ${atom.description}`);
        }
        // Continue (CI passes)
      }
      ```

- [ ] **18.6.3** Add policy configuration to CI workflow
  - **File**: `.github/workflows/pact-reconciliation.yml` (example in docs)
  - **Priority**: Medium | **Effort**: S
  - **Details**:
    - Add environment variable:
      ```yaml
      env:
        PACT_BLOCK_ON_PROPOSED_ATOMS: 'true'  # or 'false'
      ```
    - Document policy options in workflow comments
    - Recommend `true` for main branch, `false` for feature branches

- [ ] **18.6.4** Create policy configuration endpoint
  - **File**: `src/modules/agents/reconciliation.controller.ts`
  - **Priority**: Low | **Effort**: S
  - **Details**:
    - `GET /api/reconciliation/policies/:projectId` - get policy
    - `PATCH /api/reconciliation/policies/:projectId` - update policy
    - Requires admin permissions
    - Used by settings UI (future)

---

## 18.7 Testing & Documentation

### Context

Comprehensive testing and documentation for new workflows.

### Tasks

- [ ] **18.7.1** Unit tests for atom inference service
  - **File**: `src/modules/agents/atom-inference.service.spec.ts`
  - **Priority**: High | **Effort**: M
  - **Details**:
    - Test: Infer atom from orphan test
    - Test: Confidence calculation
    - Test: Category inference from test context
    - Test: Validator extraction from assertions
    - Test: Semantic search for existing atoms
    - Use mocked LLM responses for consistency

- [ ] **18.7.2** Unit tests for MCP tools
  - **File**: `src/mcp/tools/suggest-atom.tool.spec.ts`, `get-implementable-atoms.tool.spec.ts`
  - **Priority**: High | **Effort**: M
  - **Details**:
    - Test `suggest_atom`: creates proposed atom with correct status
    - Test `get_implementable_atoms`: filters by coverage and status
    - Test scope-aware queries: main vs local filtering
    - Test policy enforcement: blocks when `allowAgentAtomSuggestions: false`

- [ ] **18.7.3** Integration tests for approval workflow
  - **File**: `test/agents/atom-approval.e2e-spec.ts`
  - **Priority**: High | **Effort**: L
  - **Details**:
    - Test full workflow:
      1. Create proposed atom via MCP
      2. Link test to proposed atom
      3. Run reconciliation → detects proposed atom
      4. Approve atom via API
      5. Verify atom promoted to committed
      6. Verify test link updated with permanent atomId
    - Test rejection workflow:
      1. Create proposed atom
      2. Reject via API
      3. Verify atom marked as abandoned
      4. Verify test becomes orphan

- [ ] **18.7.4** Update MCP server README
  - **File**: `src/mcp/README.md`
  - **Priority**: Medium | **Effort**: S
  - **Details**:
    - Document new tools: `suggest_atom`, `get_implementable_atoms`
    - Document scope-aware queries
    - Add examples of agent-suggested atom workflow
    - Document MCP server registration in Claude Code

- [ ] **18.7.5** Create agent workflows documentation
  - **File**: `docs/agent-workflows.md`
  - **Priority**: Medium | **Effort**: M
  - **Details**:
    - Document two primary workflows:
      1. **Proactive suggestion**: Agent discovers gap → suggests atom → HITL approves
      2. **Reactive inference**: Agent commits orphan → reconciliation infers atom → HITL approves
    - Include sequence diagrams
    - Include code examples for Claude Code integration
    - Document policy configuration options
    - Link to Phase 15 governance model

- [ ] **18.7.6** Update agents-overview.md
  - **File**: `docs/agents-overview.md`
  - **Priority**: Medium | **Effort**: S
  - **Dependencies**: 18.7.5
  - **Details**:
    - Add Phase 18 section: "Agent-Suggested Atoms"
    - Link to new `agent-workflows.md`
    - Update MCP tools list (now 10 tools)
    - Update epistemic authority diagram to show proposed status

---

## Phase 18 Completion Criteria

| Criterion | Validation |
|-----------|------------|
| MCP server has `suggest_atom` tool | Claude Code can call tool successfully |
| Proposed atoms can be created | POST /api/atoms with status=proposed works |
| HITL approval workflow functional | Dashboard shows proposed atoms, approve/reject works |
| CI blocks on proposed atoms | CI fails when proposed atoms exist (policy=block) |
| Reconciliation infers atoms for orphans | Orphan test triggers proposed atom creation |
| Scope-aware queries work | Main scope excludes proposed, local includes proposed |
| Database migration successful | All existing atoms have source='human' |
| End-to-end workflow tested | Claude Code suggests atom → HITL approves → canonical |
| Documentation complete | Agent workflows documented with examples |
| MCP server registered | Claude Code can discover Pact tools |

---

## File Inventory

### New Files (20)

| File | Task | Purpose |
|------|------|---------|
| `src/migrations/1739088000000-AddAtomProposedStatus.ts` | 18.1.2 | Database migration for proposed atoms |
| `src/migrations/1739088100000-CreateReconciliationPolicies.ts` | 18.1.3 | Reconciliation policies table |
| `src/mcp/tools/suggest-atom.tool.ts` | 18.2.1 | MCP tool for suggesting atoms |
| `src/mcp/tools/get-implementable-atoms.tool.ts` | 18.2.4 | MCP tool for finding implementable atoms |
| `.claude/mcp-servers.json` | 18.2.6 | MCP server registration |
| `src/modules/agents/atom-inference.service.ts` | 18.5.1 | Infer atoms from orphan tests |
| `src/modules/agents/atom-inference.service.spec.ts` | 18.7.1 | Unit tests |
| `src/mcp/tools/suggest-atom.tool.spec.ts` | 18.7.2 | MCP tool unit tests |
| `src/mcp/tools/get-implementable-atoms.tool.spec.ts` | 18.7.2 | MCP tool unit tests |
| `test/agents/atom-approval.e2e-spec.ts` | 18.7.3 | E2E tests for approval |
| `docs/agent-workflows.md` | 18.7.5 | Agent workflow documentation |
| `frontend/components/atoms/ProposedAtomCard.tsx` | 18.4.1 | Proposed atom card component |
| `frontend/components/atoms/AtomReviewModal.tsx` | 18.4.2 | Review modal component |
| `frontend/app/atoms/pending/page.tsx` | 18.4.3 | Pending atoms page |
| `frontend/hooks/atoms/use-proposed-atoms.ts` | 18.4.4 | React Query hooks |
| `frontend/components/reconciliation/OrphanResolutionCard.tsx` | 18.5.3 | Orphan resolution component |

### Modified Files (15)

| File | Task | Changes |
|------|------|---------|
| `src/modules/atoms/atom.entity.ts` | 18.1.1 | Add status, source, confidence, etc. |
| `src/mcp/tools/list-atoms.tool.ts` | 18.2.2 | Add scope parameter |
| `src/mcp/tools/search-atoms.tool.ts` | 18.2.3 | Add scope parameter |
| `src/mcp/tools/index.ts` | 18.2.5 | Register new tools |
| `src/modules/atoms/atoms.controller.ts` | 18.3.1-18.3.7 | Add proposed atom endpoints |
| `src/modules/atoms/atoms.service.ts` | 18.3.1 | Support proposed status in create/findAll |
| `src/modules/agents/graphs/nodes/reconciliation/persist.node.ts` | 18.5.2 | Create proposed atoms for orphans |
| `src/modules/agents/reconciliation.service.ts` | 18.6.1 | Add policy enforcement |
| `packages/client-sdk/examples/ci/example.ts` | 18.6.2 | Handle policy blocks |
| `.github/workflows/pact-reconciliation.yml` | 18.6.3 | Add policy env vars |
| `src/modules/agents/reconciliation.controller.ts` | 18.5.5, 18.6.4 | Bulk resolution + policy endpoints |
| `frontend/components/layout/Sidebar.tsx` | 18.4.5 | Add "Pending Review" link |
| `frontend/app/atoms/[id]/page.tsx` | 18.4.6 | Show proposed indicator |
| `frontend/components/agents/ReconciliationWizard.tsx` | 18.5.4 | Add orphan resolution step |
| `src/mcp/README.md` | 18.7.4 | Document new tools |
| `docs/agents-overview.md` | 18.7.6 | Add Phase 18 section |

---

## Dependencies and Ordering

### Phase 18A: Database & MCP Foundation (Days 1-2)
- 18.1.1 → 18.1.2 → 18.1.3 (Database schema)
- 18.2.1 → 18.2.5 → 18.2.6 (MCP tools)
- 18.2.2, 18.2.3, 18.2.4 (Parallel with 18.2.1)

### Phase 18B: API & Approval (Days 3-4)
- 18.3.1 → 18.3.2 → 18.3.3 → 18.3.4 → 18.3.5 → 18.3.6 → 18.3.7 (API endpoints)
- 18.4.1 → 18.4.2 → 18.4.3 → 18.4.4 → 18.4.5 → 18.4.6 (UI components)

### Phase 18C: Reconciliation Inference (Days 5-6)
- 18.5.1 → 18.5.2 (Inference service + reconciliation)
- 18.5.3 → 18.5.4 → 18.5.5 (Orphan resolution UI)

### Phase 18D: CI & Testing (Days 7-8)
- 18.6.1 → 18.6.2 → 18.6.3 → 18.6.4 (CI policy)
- 18.7.1 → 18.7.2 → 18.7.3 (Testing)
- 18.7.4 → 18.7.5 → 18.7.6 (Documentation)

**Total estimated time: 8-10 days**

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Agent-suggested atoms created | > 0 | Count proposed atoms with source='agent_inference' |
| HITL approval rate | > 80% | approved / (approved + rejected) |
| Orphan test reduction | < 5% | orphan tests / total tests after inference |
| CI policy enforcement | 100% | CI blocks on proposed atoms when policy=block |
| MCP tool availability | 10 tools | Claude Code can list all tools |
| End-to-end workflow success | 1 demo | Complete Claude Code → HITL → canonical flow |

---

*Phase 18 enables agents to discover epistemic gaps and propose atoms, while maintaining human authority over canonical truth through systematic approval workflows.*
