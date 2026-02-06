# Pact Implementation Checklist - Phase 3

**Created**: 2026-01-21
**Based on**: implementation-guide-2026-01-12.md + Phase 2 completion + stakeholder feedback
**Status**: In Progress (Parts 1-6 Complete)

---

## Phase 3: Commitment Boundary & Invariants

**Goal**: Implement the defining feature of Pact—the phase transition where ambiguity collapses and intent becomes immutable. Users commit atoms through agent chat interaction, with configurable invariant checking.

**Timeline**: Development Milestone 3 (Weeks 7-10 relative to project start)

**Dependencies**: Phase 2 complete (Validators & Templates operational)

**Key Design Decisions** (from stakeholder feedback):

1. **Chat-based commitment**: Primary UI is agent conversation, not a separate ceremony wizard
2. **Molecular thinking**: Users describe features (molecules), agent proposes atoms, user approves
3. **Invariants as config**: Per-project configurable rules, not hardcoded
4. **No RBAC yet**: Simple implementation without user/role model

**Key Deliverables**:

- Project configuration system with invariant management
- Commitment Artifact data model (immutable)
- Invariant checking engine (pluggable validators)
- Agent-driven commitment flow via chat
- Immutability enforcement (database + API)
- Commitment UI for atom review and approval

---

## Part 1: Project Configuration System ✓

### 1.1 Project Entity (New) ✓

- [x] Create `Project` entity in `src/modules/projects/`
  - [x] `id` UUID (primary key)
  - [x] `name` VARCHAR(255) (project name)
  - [x] `description` TEXT (optional)
  - [x] `settings` JSONB (project-level settings)
  - [x] `created_at` TIMESTAMP
  - [x] `updated_at` TIMESTAMP
  - [x] `metadata` JSONB (extensible)
- [x] Create migration for projects table
- [x] Create `ProjectsModule` with service and controller
- [x] Write unit tests for project CRUD
- [x] Verify: Project table created successfully

### 1.2 Invariant Configuration Entity (New) ✓

- [x] Create `InvariantConfig` entity in `src/modules/invariants/`
  - [x] `id` UUID (primary key)
  - [x] `project_id` UUID (FK → projects, nullable for global defaults)
  - [x] `invariant_id` VARCHAR(20) (e.g., "INV-001")
  - [x] `name` VARCHAR(255) (human-readable name)
  - [x] `description` TEXT (what this invariant enforces)
  - [x] `is_enabled` BOOLEAN (can be disabled per-project)
  - [x] `is_blocking` BOOLEAN (blocks commit vs. warning only)
  - [x] `check_type` VARCHAR(50) (builtin, custom, llm)
  - [x] `check_config` JSONB (configuration for the checker)
  - [x] `error_message` TEXT (message shown on violation)
  - [x] `suggestion_prompt` TEXT (LLM prompt for fix suggestions)
  - [x] `is_builtin` BOOLEAN (system invariant vs. user-defined)
  - [x] `created_at` TIMESTAMP
  - [x] `updated_at` TIMESTAMP
- [x] Create migration for invariant_configs table
- [x] Write unit tests for invariant config entity
- [x] Verify: Invariant config table created successfully

### 1.3 Seed Built-in Invariants ✓

- [x] Create `InvariantSeedService` to populate default invariants (via InvariantsService.onModuleInit)
- [x] Implement 9 built-in invariants from `/ingest/invariants.md`:
  - [x] INV-001: Explicit Commitment Required
  - [x] INV-002: Intent Atoms Must Be Behaviorally Testable
  - [x] INV-003: No Ambiguity in Commitment Artifacts
  - [x] INV-004: Commitment Is Immutable
  - [x] INV-005: Traceability Is Mandatory
  - [x] INV-006: Agents May Not Commit Intent
  - [x] INV-007: Evidence Is First-Class and Immutable
  - [x] INV-008: Rejection Is Limited to Invariants
  - [x] INV-009: Post-Commitment Ambiguity Must Be Resolved Explicitly
- [x] Create `builtin-invariants.ts` with invariant definitions
- [x] Run seed on application startup
- [x] Write tests verifying all 9 invariants are seeded
- [x] Verify: Built-in invariants available on startup

### 1.4 Invariant Configuration API ✓

- [x] Create `InvariantsController` with endpoints:
  - [x] `GET /invariants` - List all invariants (with project filter)
  - [x] `GET /invariants/:id` - Get single invariant
  - [x] `POST /invariants` - Create custom invariant
  - [x] `PATCH /invariants/:id` - Update invariant (custom only)
  - [x] `DELETE /invariants/:id` - Delete invariant (custom only)
  - [x] `PATCH /invariants/:id/enable` - Enable invariant
  - [x] `PATCH /invariants/:id/disable` - Disable invariant
  - [ ] `GET /invariants/check/:atomId` - Preview invariant check for atom (Part 3)
- [x] Add Swagger documentation for all endpoints
- [x] Write unit tests for InvariantsService
- [ ] Write E2E tests for invariant API (Part 7)
- [x] Verify: Invariant configuration API operational

### 1.5 Project Configuration DTOs ✓

- [x] Create `CreateProjectDto` with validation
- [x] Create `UpdateProjectDto` (partial)
- [x] Create `ProjectResponseDto`
- [x] Create `CreateInvariantDto` with validation
- [x] Create `UpdateInvariantDto` (partial)
- [x] Create `InvariantResponseDto`
- [x] Create `InvariantCheckResultDto`
- [x] Verify: All DTOs validate correctly

---

## Part 2: Commitment Data Model ✓

### 2.1 CommitmentArtifact Entity (New) ✓

- [x] Create `CommitmentArtifact` entity in `src/modules/commitments/`
  - [x] `id` UUID (primary key)
  - [x] `commitment_id` VARCHAR(20) (human-readable, e.g., "COM-001")
  - [x] `project_id` UUID (FK → projects, nullable)
  - [x] `molecule_id` UUID (FK → molecules, nullable - the feature being committed)
  - [x] `canonical_json` JSONB (immutable snapshot of committed atoms)
  - [x] `committed_by` VARCHAR(255) (human identifier)
  - [x] `committed_at` TIMESTAMP (immutable)
  - [x] `invariant_checks` JSONB (record of all checks performed)
  - [x] `override_justification` TEXT (if any invariants were overridden)
  - [x] `supersedes` UUID (FK → commitments, if this supersedes another)
  - [x] `superseded_by` UUID (FK → commitments, if superseded)
  - [x] `status` VARCHAR(20) (active, superseded)
  - [x] `metadata` JSONB (extensible)
- [x] Create migration for commitments table
- [x] Add database constraint: canonical_json cannot be modified after creation
- [x] Write unit tests for commitment entity
- [x] Verify: Commitments table created with immutability constraints

### 2.2 Commitment-Atom Association ✓

- [x] Create `commitment_atoms` join table
  - [x] `commitment_id` UUID (FK → commitments)
  - [x] `atom_id` UUID (FK → atoms)
  - [x] `position` INTEGER (order within commitment)
  - [x] Composite primary key on (commitment_id, atom_id)
- [x] Update `Atom` entity with commitment relation
  - [x] Add `commitment_id` UUID (FK, nullable) - via ManyToMany relation
  - [x] Add `committed_at` TIMESTAMP (set when committed)
- [x] Create migration for schema changes
- [x] Write tests for commitment-atom association
- [x] Verify: Atoms can be linked to commitments

### 2.3 Commitment DTOs ✓

- [x] Create `CreateCommitmentDto`
  - [x] `atomIds` (required, array of UUIDs)
  - [x] `moleculeId` (optional, UUID)
  - [x] `projectId` (optional, UUID)
  - [x] `overrideJustification` (optional, for invariant overrides)
  - [x] `committedBy` (required, human identifier for INV-006)
- [x] Create `CommitmentResponseDto`
  - [x] Full commitment details
  - [x] Nested atom summaries
  - [x] Invariant check results
- [x] Create `CommitmentPreviewDto` (dry-run result)
- [x] Create `SupersedeCommitmentDto`
- [x] Create `CommitmentSearchDto` with pagination
- [x] Verify: All DTOs validate correctly

### 2.4 CommitmentsService ✓

- [x] Implement `create(dto: CreateCommitmentDto)` - Main commitment flow
  - [x] Validate all atoms exist and are in draft status
  - [x] Run invariant checks (basic implementation for Part 3 integration)
  - [x] Block if any blocking invariants fail (unless override)
  - [x] Generate canonical JSON snapshot
  - [x] Create commitment record
  - [x] Update atom statuses to 'committed'
  - [ ] Create molecule if not provided (deferred - molecules not yet implemented)
  - [x] Return commitment with check results
- [x] Implement `preview(dto: CreateCommitmentDto)` - Dry-run without committing
  - [x] Run all checks
  - [x] Return what would happen
  - [x] Identify blocking vs. warning issues
- [x] Implement `findAll(options)` - List commitments with filtering
- [x] Implement `findOne(id)` - Get commitment with full details
- [x] Implement `findByCommitmentId(commitmentId)` - Get by human-readable ID
- [x] Implement `supersede(id, dto)` - Create superseding commitment
  - [x] Mark original as superseded
  - [x] Create new commitment
  - [x] Link via supersedes/superseded_by
- [x] Implement `getHistory(id)` - Get supersession chain
- [x] Implement `getAtoms(id)` - Get atoms for a commitment
- [x] Write comprehensive unit tests (29 tests)
- [x] Verify: Commitment service handles all flows correctly

### 2.5 CommitmentsController ✓

- [x] Implement `POST /commitments` - Create commitment
- [x] Implement `POST /commitments/preview` - Preview commitment (dry-run)
- [x] Implement `GET /commitments` - List commitments
- [x] Implement `GET /commitments/:id` - Get commitment details
- [x] Implement `POST /commitments/:id/supersede` - Supersede commitment
- [x] Implement `GET /commitments/:id/history` - Get supersession history
- [x] Implement `GET /commitments/:id/atoms` - Get atoms in commitment
- [x] Add Swagger documentation for all endpoints
- [ ] Write E2E tests for commitment API (Part 7)
- [x] Verify: Commitment API operational

---

## Part 3: Invariant Checking Engine ✓

### 3.1 InvariantChecker Interface ✓

- [x] Create `InvariantChecker` interface (`src/modules/invariants/checkers/interfaces.ts`)

  ```typescript
  interface InvariantChecker {
    invariantId: string;
    check(atoms: Atom[], context: CheckContext): Promise<InvariantCheckResult>;
  }

  interface InvariantCheckResult {
    invariantId: string;
    passed: boolean;
    severity: 'error' | 'warning';
    message: string;
    affectedAtomIds: string[];
    suggestions: string[];
  }
  ```

- [x] Create `CheckContext` interface (project settings, etc.)
- [x] Create base `AbstractInvariantChecker` class (`src/modules/invariants/checkers/abstract-checker.ts`)
- [x] Verify: Interface is clean and extensible

### 3.2 Built-in Invariant Checkers ✓

- [x] Implement `ExplicitCommitmentChecker` (INV-001)
  - [x] Verify commitment is explicit human action
  - [x] Check for agent-initiated commits (should fail)
- [x] Implement `BehavioralTestabilityChecker` (INV-002)
  - [x] Use quality validator to check observable/falsifiable
  - [x] Require minimum quality score
- [x] Implement `NoAmbiguityChecker` (INV-003)
  - [x] Rule-based ambiguity detection (pattern matching)
  - [x] Check for vague language patterns
- [x] Implement `ImmutabilityChecker` (INV-004)
  - [x] Verify atoms being committed are in draft status
  - [x] Check no committed atoms are being modified
- [x] Implement `TraceabilityChecker` (INV-005)
  - [x] Verify atoms have parent_intent or source
  - [x] Check refinement history exists
- [x] Implement `HumanCommitChecker` (INV-006)
  - [x] Verify committed_by is human identifier
  - [x] Reject agent-initiated commits
- [x] Implement `EvidenceImmutabilityChecker` (INV-007)
  - [x] Placeholder for future evidence checks
- [x] Implement `RejectionLimitedChecker` (INV-008)
  - [x] Ensure rejections only for invariant violations
- [x] Implement `AmbiguityResolutionChecker` (INV-009)
  - [x] Check for clarification artifacts if needed
- [x] Write unit tests for each checker (67 tests)
- [x] Verify: All 9 built-in checkers implemented

### 3.3 InvariantCheckingService ✓

- [x] Create `InvariantCheckingService` (`src/modules/invariants/invariant-checking.service.ts`)
- [x] Implement `checkAll(atoms: Atom[], context: CheckContext)` method
  - [x] Load enabled invariants for project
  - [x] Run all checkers in parallel
  - [x] Aggregate results
  - [x] Separate blocking vs. warning violations
- [x] Implement `checkSingle(atoms: Atom[], invariantId: string)` method
- [x] Implement via `InvariantsService.findEnabled(projectId)` method
- [ ] Implement `getSuggestions(violations: InvariantCheckResult[])` method (deferred - LLM integration)
- [ ] Add caching for repeated checks (optimization, not required for Phase 3)
- [x] Write comprehensive unit tests
- [x] Verify: Checking service runs all enabled invariants

### 3.4 Custom Invariant Support (Partial)

- [ ] Implement `CustomInvariantChecker` class (deferred to Phase 4)
  - [ ] Supports JSON-based rule definitions
  - [ ] Supports LLM-based checks via prompts
- [x] Create schema for custom invariant definitions (via InvariantConfig.checkConfig)
- [x] Implement validation of custom invariant configs (via DTO validation)
- [ ] Write tests for custom invariants (deferred)
- [x] Verify: Foundation for custom invariants in place

### 3.5 Integration with CommitmentsService ✓

- [x] Update `CommitmentsModule` to import `InvariantsModule`
- [x] Inject `InvariantCheckingService` into `CommitmentsService`
- [x] Update `runInvariantChecks()` to use `InvariantCheckingService.checkAll()`
- [x] Maintain backward compatibility with basic checks fallback
- [x] All 694 tests passing

---

## Part 4: Agent Commitment Flow ✓

### 4.1 Commitment Agent Service ✓

- [x] Create `CommitmentAgentService` in `src/modules/agents/`
- [x] Implement `proposeAtomsFromIntent(molecularIntent: string)` method
  - [x] Use atomization agent to break down intent
  - [x] Return proposed atoms with analysis
  - [x] Include quality scores for each atom
- [x] Implement `reviewAndRefine(atoms: Atom[], feedback: string)` method
  - [x] Refine atoms based on user feedback
  - [x] Re-run quality validation
- [x] Implement `prepareCommitment(atomIds: string[])` method
  - [x] Run invariant preview
  - [x] Generate commitment summary
  - [x] Identify any issues
- [x] Implement `executeCommitment(atomIds: string[], humanApproval: boolean)` method
  - [x] Verify human approval (INV-006)
  - [x] Execute commitment
  - [x] Return result with molecule
- [x] Write unit tests for agent flow
- [x] Verify: Agent can guide user through commitment

### 4.2 Chat-Based Commitment Prompts ✓

- [x] Create commitment flow prompts in `src/modules/agents/prompts/`
  - [x] `commitment-flow.prompts.ts` - Decomposition, refinement, summary, quality analysis prompts
  - [x] `DECOMPOSITION_SYSTEM_PROMPT` - Analyze feature description
  - [x] `generateDecompositionPrompt()` - Propose atoms from analysis
  - [x] `generateCommitmentSummaryPrompt()` - Summarize what will be committed
  - [x] `generateRefinementPrompt()` - Refine atoms based on feedback
  - [x] `generateQualityAnalysisPrompt()` - Quality scoring
- [x] Prompts integrated into service
- [x] Verify: Prompts produce quality outputs

### 4.3 Commitment WebSocket Events ✓

- [x] Create `CommitmentsGateway` with namespace `/commitments`
- [x] Implement events:
  - [x] `commitment:proposed` - Atoms proposed for commitment
  - [x] `commitment:preview` - Preview results ready
  - [x] `commitment:created` - Commitment successful
  - [x] `commitment:failed` - Commitment failed (with reasons)
  - [x] `commitment:superseded` - Commitment was superseded
  - [x] `invariant:checking` - Progress during invariant checks
- [x] Gateway registered in GatewaysModule
- [x] Write unit tests for gateway events (26 tests)
- [x] Verify: Real-time updates work correctly

### 4.4 Agent Action Logging ✓

- [x] AgentAction entity supports commitment actions
- [x] Log all commitment-related agent actions:
  - [x] Intent analysis (via logAgentAction)
  - [x] Atom proposal (via logAgentAction)
  - [x] Invariant checks (via logAgentAction)
  - [x] Commitment execution (via logAgentAction)
- [x] Include confidence scores (via metadata)
- [x] Track human approvals (via metadata)
- [x] Verify: Full audit trail of commitment process

---

## Part 5: Immutability Enforcement ✓

### 5.1 Database Constraints ✓

- [x] Add CHECK constraint on atoms table:
  - [x] `committed_at` cannot be changed once set
  - [x] `status` cannot change from 'committed' to 'draft'
- [x] Add CHECK constraint on commitments table:
  - [x] `canonical_json` cannot be modified
  - [x] `committed_at` cannot be modified
- [x] Add TRIGGER to prevent updates on committed atoms
- [x] Create migration for constraints (`1737590400000-AddImmutabilityConstraints.ts`)
  - [x] `atom_immutability_trigger` - Prevents updates to committed atoms
  - [x] `atom_committed_at_trigger` - Prevents changes to committedAt
  - [x] `atom_status_regression_trigger` - Prevents status from going backward
  - [x] `atom_deletion_trigger` - Prevents deletion of committed/superseded atoms
  - [x] `commitment_metadata_trigger` - Prevents changes to commitment metadata
  - [x] `commitment_deletion_trigger` - Prevents commitment deletion
- [x] Test constraint enforcement
- [x] Verify: Database prevents unauthorized modifications

### 5.2 API Guards ✓

- [x] Create `CommittedAtomGuard` for atom endpoints
  - [x] Block updates to committed atoms
  - [x] Block deletion of committed atoms
  - [x] Allow only supersession via `@AllowCommittedAtomOperation()` decorator
- [x] Create `CommitmentImmutabilityGuard` for commitment endpoints
  - [x] Block any modifications to committed artifacts
- [x] Apply guards to relevant controllers
  - [x] AtomsController uses CommittedAtomGuard
  - [x] CommitmentsController uses CommitmentImmutabilityGuard
- [x] Return appropriate error messages (reference INV-004)
- [x] Write tests for guard enforcement (23 tests)
- [x] Verify: API rejects modifications to committed content

### 5.3 Supersession Mechanics ✓

- [x] Implement atom supersession in AtomsService
  - [x] `supersede(atomId: string, newAtomId: string)` method (existing)
  - [x] `supersedeWithNewAtom(atomId: string, dto: SupersedeAtomDto)` method (new convenience method)
  - [x] Creates new atom with supersedes reference
  - [x] Marks original as superseded
  - [x] Inherits tags, outcomes, criteria from original unless overridden
- [x] Implement commitment supersession in CommitmentsService (completed in Part 2)
  - [x] Creates new commitment with updated atoms
  - [x] Links via supersedes/superseded_by
  - [x] Preserves full history chain
- [x] Create supersession history API
  - [x] `GET /atoms/:id/supersession-chain` endpoint
  - [x] `GET /commitments/:id/history` endpoint
- [x] Write comprehensive tests (7 new tests for supersedeWithNewAtom)
- [x] Verify: Supersession preserves full audit trail

---

## Part 6: Commitment UI (Frontend) ✓

### 6.1 Commitment Types and API ✓

- [x] Create types in `frontend/types/commitment.ts`
  - [x] `Commitment` interface
  - [x] `CommitmentPreview` interface
  - [x] `InvariantCheckResult` interface
  - [x] `CommitmentStatus` type
  - [x] `CanonicalAtomSnapshot` interface
  - [x] `StoredInvariantCheckResult` interface
  - [x] `AtomSummary` interface
  - [x] `CreateCommitmentDto`, `SupersedeCommitmentDto`, `CommitmentFilters` DTOs
- [x] Create API methods in `frontend/lib/api/commitments.ts`
  - [x] `create(dto)` - Create commitment
  - [x] `preview(dto)` - Preview commitment
  - [x] `list(filters)` - List commitments
  - [x] `get(id)` - Get commitment details
  - [x] `supersede(id, data)` - Supersede commitment
  - [x] `getHistory(id)` - Get supersession history
  - [x] `getAtoms(id)` - Get atoms for a commitment
- [x] Create React Query hooks in `frontend/hooks/commitments/`
  - [x] `useCommitments` - List commitments
  - [x] `useCommitment` - Single commitment
  - [x] `useCreateCommitment` - Create mutation
  - [x] `usePreviewCommitment` - Preview mutation
  - [x] `useSupersedeCommitment` - Supersede mutation
  - [x] `useCommitmentHistory` - Supersession history
  - [x] `useCommitmentAtoms` - Atoms in commitment
- [x] Verify: Frontend API layer complete

### 6.2 Commitment Review Dialog ✓

- [x] Create `CommitmentReviewDialog.tsx` component
  - [x] Display atoms being committed
  - [x] Show quality scores for each atom
  - [x] Show invariant check results
  - [x] Highlight blocking vs. warning issues
  - [x] Provide approve/reject actions
  - [x] Explicit acknowledgment checkbox (commitment ceremony)
  - [x] Override justification input for warnings
- [x] InvariantCheckResult display built into dialog
  - [x] Display pass/fail status
  - [x] Show violation details
  - [x] Color-coded severity (error/warning)
- [x] AtomSummaryCard built into dialog
  - [x] Compact atom display for review
  - [x] Quality score badge
  - [x] Category indicator
- [ ] Write component tests (deferred to Part 7)
- [x] Verify: Review dialog fully functional

### 6.3 Commitment List View ✓

- [x] Create `CommitmentList.tsx` component
  - [x] Display commitments with filtering
  - [x] Show status (active/superseded)
  - [x] Show atom count per commitment
  - [x] Link to details
  - [x] Pagination controls
- [x] CommitmentRow built into list component
  - [x] Commitment summary
  - [x] Created by / date
  - [x] Quick view link
- [x] Create `app/commitments/page.tsx` - Commitments list page
- [x] Verify: Commitment list renders correctly

### 6.4 Commitment Detail Page ✓

- [x] Create `app/commitments/[id]/page.tsx`
  - [x] Full commitment details
  - [x] List of committed atoms (canonical snapshot)
  - [x] Invariant check results display
  - [x] Supersession info (supersedes/supersededBy links)
  - [x] Expandable history view
  - [x] Current atom state links
  - [x] Override justification display
- [x] Supersession history built into detail page
  - [x] Expandable history list
  - [x] Links between commitments
- [x] Verify: Detail page shows all information

### 6.5 Agent Chat Commitment Flow

- [ ] Create `CommitmentChatFlow.tsx` component (deferred to Phase 4)
  - [ ] Input for molecular intent
  - [ ] Display proposed atoms
  - [ ] Allow refinement feedback
  - [ ] Show preview results
  - [ ] Commit approval button
- [ ] Integrate with existing chat UI (if exists) or create placeholder
- [ ] Handle commitment flow states
- [ ] Verify: Chat-based commitment works end-to-end

### 6.6 Invariant Configuration UI ✓

- [x] Create `frontend/types/invariant.ts`
  - [x] `InvariantConfig` interface
  - [x] `InvariantCheckType` type
  - [x] `InvariantCheckConfig` interface
  - [x] `CreateInvariantDto`, `UpdateInvariantDto` DTOs
- [x] Create `frontend/lib/api/invariants.ts`
  - [x] Full CRUD operations
  - [x] Enable/disable endpoints
- [x] Create React Query hooks in `frontend/hooks/invariants/`
  - [x] `useInvariants`, `useEnabledInvariants`, `useInvariant`
  - [x] `useCreateInvariant`, `useUpdateInvariant`, `useDeleteInvariant`
  - [x] `useEnableInvariant`, `useDisableInvariant`
- [x] Create `app/settings/invariants/page.tsx`
  - [x] List all invariants
  - [x] Summary statistics
  - [x] Info box explaining invariants
- [x] Create `InvariantConfigCard.tsx` component
  - [x] Invariant summary
  - [x] Enable/disable toggle
  - [x] Blocking/warning toggle
  - [x] Expandable details section
  - [x] Built-in vs custom indicator
- [x] Create `InvariantList.tsx` component
  - [x] List with filtering
  - [x] Grouped by type (builtin/custom)
- [ ] Create `CreateInvariantDialog.tsx` for custom invariants (deferred)
- [x] Verify: Invariant configuration UI operational

---

## Part 7: Integration & Testing

### 7.1 E2E Test Suite

- [ ] Create `test/commitments.e2e-spec.ts`
  - [ ] Test create commitment flow
  - [ ] Test preview functionality
  - [ ] Test invariant checking
  - [ ] Test blocking violations
  - [ ] Test override with justification
  - [ ] Test supersession
  - [ ] Test immutability enforcement
- [ ] Create `test/invariants.e2e-spec.ts`
  - [ ] Test invariant CRUD
  - [ ] Test enable/disable
  - [ ] Test custom invariants
  - [ ] Test project-specific config
- [ ] Verify: All E2E tests pass

### 7.2 Integration Tests

- [ ] Test CommitmentsService → InvariantCheckingService integration
- [ ] Test CommitmentAgentService → AtomizationService integration
- [ ] Test WebSocket events for commitment operations
- [ ] Test database constraint enforcement
- [ ] Verify: Integration tests pass

### 7.3 Invariant Checker Tests

- [ ] Create tests for each of 9 built-in checkers
- [ ] Test with passing atoms
- [ ] Test with failing atoms
- [ ] Test edge cases
- [ ] Verify: All checkers tested thoroughly

---

## Part 8: Documentation & Polish

### 8.1 API Documentation

- [ ] Complete Swagger specs for commitment endpoints
- [ ] Complete Swagger specs for invariant endpoints
- [ ] Add request/response examples
- [ ] Document error codes
- [ ] Verify: Swagger UI shows all endpoints

### 8.2 User Documentation

- [ ] Create `docs/user-guide/committing-atoms.md`
  - [ ] Understanding commitment
  - [ ] The commitment flow
  - [ ] Reviewing invariant checks
  - [ ] Handling violations
- [ ] Create `docs/user-guide/configuring-invariants.md`
  - [ ] Built-in invariants explained
  - [ ] Enabling/disabling invariants
  - [ ] Creating custom invariants
- [ ] Create `docs/user-guide/supersession.md`
  - [ ] When to supersede
  - [ ] How supersession works
  - [ ] Viewing history
- [ ] Verify: User documentation complete

### 8.3 Developer Documentation

- [ ] Document invariant checker architecture
- [ ] Document commitment flow internals
- [ ] Update `docs/schema.md` with new tables
- [ ] Update `docs/index.md` with Phase 3 status
- [ ] Verify: Developer docs up-to-date

---

## Phase 3 Success Criteria

- [ ] Users can commit atoms through API and UI
- [ ] Invariant checks run automatically before commitment
- [ ] Blocking invariants prevent commitment (unless overridden)
- [ ] Committed atoms cannot be modified (immutability enforced)
- [ ] Supersession creates new commitment while preserving history
- [ ] 9 built-in invariants available and configurable
- [ ] Custom invariants can be created
- [ ] Agent can propose atoms from molecular intent
- [ ] Human approval required for commitment (INV-006)
- [ ] Full audit trail of commitment process
- [ ] E2E test suite passes
- [ ] API documented in Swagger

---

## Validation Checklist (End of Phase 3)

Run these commands to validate Phase 3 completion:

```bash
# Backend tests
./scripts/test.sh --ci

# Frontend tests
cd frontend && npm test

# E2E tests
./scripts/test.sh --e2e

# API docs accessible
curl http://localhost:3000/api/docs

# Commitment endpoints work
curl http://localhost:3000/commitments
curl http://localhost:3000/invariants

# Frontend accessible
curl http://localhost:3001
```

Expected results:

- All tests pass
- Coverage >= 80% backend
- Commitment API operational
- Invariant configuration works
- Immutability enforced
- Supersession works correctly

---

## Current Status Summary

**Phase 0 Complete**:

- Docker infrastructure operational
- PostgreSQL database with 11 tables
- Jest + testing framework
- Atomization Agent with LLM-powered intent analysis
- Atom Quality Validator with 5 quality dimensions

**Phase 1 Complete**:

- Intent Atom Data Model with refinement history
- Enhanced CRUD API with WebSocket events
- AI-Powered Iterative Refinement
- Tagging and Filtering
- Canvas UI (Frontend)

**Phase 2 Complete**:

- Validator CRUD with format translation
- AI-powered translation service (LLM + heuristics)
- Template library (21 built-in templates)
- Validator UI components
- 537+ tests passing

**Phase 3 Progress**:

- Part 1: Project Configuration System ✓
- Part 2: Commitment Data Model ✓
- Part 3: Invariant Checking Engine ✓
- Part 4: Agent Commitment Flow ✓
- Part 5: Immutability Enforcement ✓
- Part 6: Commitment UI (Frontend) ✓
- 759 backend tests passing

**Part 6 Deliverables**:

- `frontend/types/commitment.ts` - Commitment type definitions
- `frontend/types/invariant.ts` - Invariant type definitions
- `frontend/lib/api/commitments.ts` - Commitment API functions
- `frontend/lib/api/invariants.ts` - Invariant API functions
- `frontend/hooks/commitments/` - React Query hooks for commitments
- `frontend/hooks/invariants/` - React Query hooks for invariants
- `frontend/components/commitments/` - CommitmentReviewDialog, CommitmentList
- `frontend/components/invariants/` - InvariantConfigCard, InvariantList
- `frontend/app/commitments/` - Commitments list and detail pages
- `frontend/app/settings/invariants/` - Invariant settings page

---

## Notes for Implementation

### Commitment Flow Design

The commitment flow should follow this sequence:

```bash
1. User describes molecular intent (feature/capability)
   ↓
2. Agent atomizes into individual atoms
   ↓
3. User reviews proposed atoms
   ↓
4. User provides feedback / requests refinement
   ↓
5. Agent refines atoms based on feedback
   ↓
6. User approves atoms for commitment
   ↓
7. System runs invariant checks (preview)
   ↓
8. If violations: show issues + suggestions
   ↓
9. User resolves issues or provides override justification
   ↓
10. User confirms commitment (explicit human action)
    ↓
11. System creates CommitmentArtifact (immutable)
    ↓
12. Atoms marked as committed
    ↓
13. Molecule created/updated if applicable
```

### Invariant Checking Architecture

```bash
┌─────────────────────────────────────────────────────────────────┐
│                 InvariantCheckingService                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐    ┌──────────────────┐                   │
│  │  checkAll()      │───>│  InvariantConfig │                   │
│  │                  │    │  (from DB)       │                   │
│  └────────┬─────────┘    └──────────────────┘                   │
│           │                                                      │
│           ▼                                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Invariant Checker Registry                    │   │
│  │  ┌─────────┬─────────┬─────────┬─────────┬─────────────┐ │   │
│  │  │ INV-001 │ INV-002 │ INV-003 │   ...   │ Custom      │ │   │
│  │  │ Checker │ Checker │ Checker │         │ Checkers    │ │   │
│  │  └─────────┴─────────┴─────────┴─────────┴─────────────┘ │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────┐    ┌──────────────────┐                   │
│  │  Aggregate       │───>│  Check Results   │                   │
│  │  Results         │    │  (blocking/warn) │                   │
│  └──────────────────┘    └──────────────────┘                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Immutability Strategy

1. **Database Level**: PostgreSQL constraints and triggers
2. **API Level**: Guards that reject modifications
3. **Application Level**: Service methods that check status before operations
4. **Supersession**: Only way to "change" committed content

---

**Last Updated**: 2026-01-26
