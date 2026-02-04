# Implementation Checklist: Phase 11 — Conversation

## Document Metadata

| Field | Value |
|-------|-------|
| **Phase** | 11 |
| **Focus** | Multi-turn interview agent and Change Set molecules |
| **Status** | Not Started |
| **Prerequisites** | Phase 8 (Foundation — specifically 8.3 Conversations, 8.4 Intent Identity) |
| **Related Docs** | [implementation-checklist-bootstrap.md](implementation-checklist-bootstrap.md), [analysis-git-for-intent.md](analysis-git-for-intent.md), [bootstrap-completion-plan.md](bootstrap-completion-plan.md) |

---

## Overview

Phase 11 introduces two major capabilities:

1. **Change Set Molecules** — The PR-equivalent for intent (from [analysis-git-for-intent.md](analysis-git-for-intent.md) Section 5), enabling batch review and commit of related atoms
2. **Interview Agent** — Multi-turn conversational intent extraction (from [bootstrap-completion-plan.md](bootstrap-completion-plan.md) Capability 2), using LangGraph for structured clarification
3. **Conversation Compaction** — Long conversation summarization (building on Phase 8.3 persistence)

This phase can run in parallel with Phase 10 (External Access) since they share Phase 8 as prerequisite but have no mutual dependencies.

---

## 11.1 Change Set Molecules

### Context

The [analysis-git-for-intent.md](analysis-git-for-intent.md) Section 5 defines Change Set Molecules as Pact's PR equivalent. Currently, the [molecule entity](../src/modules/molecules/molecule.entity.ts) supports 7 lens types: `user_story`, `feature`, `journey`, `epic`, `release`, `capability`, `custom`. Change sets add a `change_set` type with additional metadata for approval workflows.

### Tasks

- [ ] **11.1.1** Add `change_set` to LensType
  - **File**: `src/modules/molecules/molecule.entity.ts`
  - **Priority**: High | **Effort**: S
  - **Details**:
    - Extend `LensType` union: add `| 'change_set'`
    - Add to `LENS_TYPE_LABELS`: `change_set: 'Change Set'`
    - Add to `LENS_TYPE_DESCRIPTIONS`: `change_set: 'A group of draft atoms for batch review and commit, similar to a pull request'`

- [ ] **11.1.2** Create Change Set types
  - **File**: `src/modules/molecules/change-set.types.ts`
  - **Priority**: High | **Effort**: S
  - **Details**:
    ```typescript
    type ChangeSetStatus = 'draft' | 'pending_review' | 'approved' | 'committed' | 'abandoned';

    interface ChangeSetApproval {
      userId: string;
      approvedAt: Date;
      comment?: string;
    }

    interface ChangeSetChangeRequest {
      userId: string;
      atomId: string;
      comment: string;
      resolvedAt?: Date;
    }

    interface ChangeSetMetadata {
      status: ChangeSetStatus;
      reviewers: string[];
      approvals: ChangeSetApproval[];
      requestedChanges: ChangeSetChangeRequest[];
      committedAt?: Date;
      abandonedAt?: Date;
      abandonReason?: string;
    }
    ```

- [ ] **11.1.3** Add `changeSetMetadata` column to Molecule entity
  - **File**: `src/modules/molecules/molecule.entity.ts`
  - **Priority**: High | **Effort**: S
  - **Dependencies**: 11.1.2
  - **Details**:
    - Add JSONB column: `changeSetMetadata: ChangeSetMetadata | null` (nullable, only used when lensType is 'change_set')
    - Default: null for non-change-set molecules

- [ ] **11.1.4** Create database migration
  - **File**: `src/migrations/AddChangeSetToMolecules.ts`
  - **Priority**: High | **Effort**: S
  - **Dependencies**: 11.1.3

- [ ] **11.1.5** Implement `createChangeSet` service method
  - **File**: `src/modules/molecules/molecules.service.ts`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 11.1.4
  - **Details**:
    - Creates a molecule with lensType 'change_set'
    - Initializes changeSetMetadata with status 'draft', empty reviewers/approvals
    - Accepts optional initial atom IDs to include
    - Validates all atoms are in 'draft' status (cannot add committed atoms to change set)

- [ ] **11.1.6** Implement `addAtomToChangeSet` method
  - **File**: `src/modules/molecules/molecules.service.ts`
  - **Priority**: High | **Effort**: S
  - **Dependencies**: 11.1.5
  - **Details**:
    - Validates molecule is a change set (lensType === 'change_set')
    - Validates change set is in 'draft' or 'pending_review' status
    - Validates atom is in 'draft' status
    - Adds atom to molecule via MoleculeAtom junction

- [ ] **11.1.7** Implement `submitForReview` method
  - **File**: `src/modules/molecules/molecules.service.ts`
  - **Priority**: High | **Effort**: S
  - **Dependencies**: 11.1.5
  - **Details**:
    - Validates at least one atom in change set
    - Validates all atoms pass quality gate (qualityScore >= 80)
    - Transitions changeSetMetadata.status from 'draft' → 'pending_review'
    - Optionally assigns reviewers

- [ ] **11.1.8** Implement `approveChangeSet` method
  - **File**: `src/modules/molecules/molecules.service.ts`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 11.1.7
  - **Details**:
    - Validates change set is in 'pending_review' status
    - Records approval in changeSetMetadata.approvals array
    - If all required reviewers have approved → transition to 'approved'
    - If no reviewer requirement → single approval transitions to 'approved'

- [ ] **11.1.9** Implement `commitChangeSet` method (batch commit)
  - **File**: `src/modules/molecules/molecules.service.ts`
  - **Priority**: High | **Effort**: L
  - **Dependencies**: 11.1.8
  - **Details**:
    - Validates change set is in 'approved' status
    - Validates no unresolved conflicts exist for any atom in the set
    - **Transaction**: Commits all draft atoms in the change set simultaneously
      - For each atom: call `atomsService.commit(atomId)` within transaction
      - If any atom fails quality gate → rollback entire batch
    - Updates changeSetMetadata.status to 'committed'
    - Records committedAt timestamp
    - Logs batch operation in audit trail

- [ ] **11.1.10** Implement `abandonChangeSet` method
  - **File**: `src/modules/molecules/molecules.service.ts`
  - **Priority**: Medium | **Effort**: S
  - **Dependencies**: 11.1.5
  - **Details**:
    - Transitions status to 'abandoned'
    - Records abandonReason
    - Does NOT delete the change set (audit trail preservation)
    - Atoms remain in 'draft' status (they can be added to other change sets)

- [ ] **11.1.11** Create Change Set controller endpoints
  - **File**: `src/modules/molecules/molecules.controller.ts`
  - **Priority**: High | **Effort**: S
  - **Dependencies**: 11.1.5–11.1.10
  - **Details**:
    - `POST /api/change-sets` — Create change set
    - `GET /api/change-sets` — List change sets (with status filter)
    - `GET /api/change-sets/:id` — Get change set detail
    - `POST /api/change-sets/:id/atoms` — Add atom to change set
    - `DELETE /api/change-sets/:id/atoms/:atomId` — Remove atom
    - `POST /api/change-sets/:id/submit` — Submit for review
    - `POST /api/change-sets/:id/approve` — Approve
    - `POST /api/change-sets/:id/commit` — Batch commit
    - `POST /api/change-sets/:id/abandon` — Abandon

- [ ] **11.1.12** Write unit tests for Change Set workflow
  - **File**: `src/modules/molecules/change-set.service.spec.ts`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 11.1.9
  - **Details**:
    - Test create → add atoms → submit → approve → commit lifecycle
    - Test create → add atoms → submit → abandon lifecycle
    - Test cannot add committed atoms to change set
    - Test batch commit is atomic (all or nothing)
    - Test quality gate enforcement on submit
    - Test conflict detection blocks commit
    - Test approval workflow (single reviewer, multiple reviewers)

---

## 11.2 Interview Agent Graph

### Context

Currently, [chat-agent.service.ts](../src/modules/agents/chat-agent.service.ts) routes queries via pattern matching and delegates to the chat-exploration graph. There is no multi-turn interview capability for structured intent extraction. The [graph-registry.service.ts](../src/modules/agents/graphs/graph-registry.service.ts) supports registering new graphs with the `registerGraph` pattern.

### Tasks

- [ ] **11.2.1** Design interview state schema
  - **File**: `src/modules/agents/graphs/types/interview-state.ts`
  - **Priority**: High | **Effort**: M
  - **Details**:
    ```typescript
    const InterviewState = Annotation.Root({
      // Session tracking
      conversationId: Annotation<string>(),
      sessionPhase: Annotation<'analyze' | 'clarify' | 'extract' | 'compose' | 'confirm' | 'complete'>(),

      // User input
      rawIntent: Annotation<string>(),
      userResponses: Annotation<UserResponse[]>({ reducer: (a, b) => [...a, ...b] }),

      // Analysis output
      intentAnalysis: Annotation<IntentAnalysis | null>(),
      clarificationQuestions: Annotation<ClarificationQuestion[]>(),
      pendingQuestions: Annotation<ClarificationQuestion[]>(),

      // Extraction output
      extractedAtoms: Annotation<DraftAtom[]>({ reducer: (a, b) => [...a, ...b] }),
      qualityResults: Annotation<QualityResult[]>(),

      // Composition output
      suggestedMolecule: Annotation<MoleculeSuggestion | null>(),
      suggestedChangeSet: Annotation<boolean>({ default: false }),

      // Control flow
      needsClarification: Annotation<boolean>({ default: true }),
      isConfirmed: Annotation<boolean>({ default: false }),
      iteration: Annotation<number>({ default: 0 }),
      maxIterations: Annotation<number>({ default: 5 }),
    });
    ```

- [ ] **11.2.2** Create `analyze-intent` node
  - **File**: `src/modules/agents/graphs/nodes/interview/analyze-intent.node.ts`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 11.2.1
  - **Details**:
    - Input: rawIntent (user's initial statement)
    - Uses LLM to analyze:
      - Is the intent clear enough to extract atoms? (needsClarification flag)
      - What category does it fall into?
      - What domains/areas does it touch?
      - Are there ambiguous terms?
    - Output: IntentAnalysis object and initial clarification questions
    - If intent is clear enough → skip to extract phase
    - Prompt should reference Pact's atom requirements (observable, falsifiable, implementation-agnostic)

- [ ] **11.2.3** Create `generate-questions` node
  - **File**: `src/modules/agents/graphs/nodes/interview/generate-questions.node.ts`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 11.2.1
  - **Details**:
    - Input: intentAnalysis + previous userResponses
    - Generates targeted clarification questions based on:
      - Missing observable outcomes
      - Ambiguous scope boundaries
      - Unclear behavioral expectations
      - Missing falsifiability criteria
    - Questions should be specific, not open-ended
    - Limit: 3 questions per round to avoid overwhelming user
    - Uses NodeInterrupt to pause for user input

- [ ] **11.2.4** Create `extract-atoms` node
  - **File**: `src/modules/agents/graphs/nodes/interview/extract-atoms.node.ts`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 11.2.1
  - **Details**:
    - Input: rawIntent + intentAnalysis + all userResponses
    - Uses LLM to decompose clarified intent into draft atoms
    - Each atom includes:
      - Description (behavioral, implementation-agnostic)
      - Category
      - Observable outcomes
      - Falsifiability criteria
    - Runs quality validation on each extracted atom
    - May integrate with existing `atomization.service.ts` for consistency

- [ ] **11.2.5** Create `compose-molecule` node
  - **File**: `src/modules/agents/graphs/nodes/interview/compose-molecule.node.ts`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 11.2.4
  - **Details**:
    - Input: extractedAtoms
    - If multiple atoms extracted → suggest a molecule grouping
    - Determine appropriate lensType (feature, user_story, capability, etc.)
    - Generate molecule name and description
    - Optionally suggest creating a Change Set for batch review
    - Uses NodeInterrupt for user confirmation before creating

- [ ] **11.2.6** Assemble interview graph
  - **File**: `src/modules/agents/graphs/graphs/interview.graph.ts`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 11.2.2–11.2.5
  - **Details**:
    - Graph edges:
      ```
      START → analyze_intent
      analyze_intent → [conditional]
        if needsClarification → generate_questions
        else → extract_atoms
      generate_questions → [interrupt for user input]
      [resume] → analyze_intent (with updated responses)
      extract_atoms → compose_molecule
      compose_molecule → [interrupt for confirmation]
      [resume with confirmation] → END
      ```
    - Max iterations guard: if iteration > maxIterations → force extract
    - Thread persistence for conversation continuity

- [ ] **11.2.7** Register interview graph in GraphRegistryService
  - **File**: `src/modules/agents/graphs/graph-registry.service.ts`
  - **Priority**: High | **Effort**: S
  - **Dependencies**: 11.2.6
  - **Details**:
    - Add 'interview' to registered graphs
    - Configure thread persistence (same as reconciliation)
    - Add LangSmith tracing metadata

- [ ] **11.2.8** Create `InterviewService`
  - **File**: `src/modules/agents/interview.service.ts`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 11.2.7
  - **Details**:
    - `startInterview(rawIntent: string, conversationId?: string): Promise<InterviewResponse>`
      - Creates new graph thread
      - Invokes interview graph with initial state
      - Returns first set of clarification questions (or extracted atoms if clear)
    - `respondToQuestions(threadId: string, responses: UserResponse[]): Promise<InterviewResponse>`
      - Resumes graph with user responses
      - Returns next questions or extracted atoms
    - `confirmAndCreate(threadId: string, confirmed: boolean): Promise<CreateResult>`
      - On confirm: creates atoms and optionally molecule/change set
      - On reject: returns to clarification phase or abandons
    - Integrates with ConversationsService for persistence

- [ ] **11.2.9** Wire interview to chat-agent routing
  - **File**: `src/modules/agents/chat-agent.service.ts`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 11.2.8
  - **Details**:
    - Add INTERVIEW_PATTERNS for detecting interview intent:
      - "I want to create", "I need a feature", "let's define", "new atom", "new feature"
    - Route matching queries to InterviewService.startInterview()
    - Handle multi-turn: detect active interview thread and route responses accordingly
    - Add conversation context tracking (which thread is active)

- [ ] **11.2.10** Write unit tests for interview graph
  - **File**: `src/modules/agents/graphs/graphs/interview.graph.spec.ts`
  - **Priority**: High | **Effort**: L
  - **Dependencies**: 11.2.6
  - **Details**:
    - Test full lifecycle: raw intent → questions → responses → atoms → molecule
    - Test clear intent skips clarification
    - Test max iteration guard
    - Test NodeInterrupt/resume cycle
    - Test quality validation on extracted atoms
    - Mock LLM responses for deterministic testing

---

## 11.3 Conversation Compaction

### Context

Phase 8.3 establishes conversation persistence. This section adds compaction — summarizing long conversations to manage token usage when conversations exceed a threshold.

### Tasks

- [ ] **11.3.1** Implement `summarizeConversation` method
  - **File**: `src/modules/conversations/conversations.service.ts`
  - **Priority**: High | **Effort**: L
  - **Dependencies**: Phase 8.3
  - **Details**:
    - Triggered when messageCount exceeds compaction threshold (default: 50)
    - Uses LLM to generate a structured summary of older messages:
      - Key topics discussed
      - Atoms referenced or created
      - Decisions made
      - Outstanding questions
    - Summary stored in `conversation.compactedSummary`
    - Older messages marked with `isCompacted: true`

- [ ] **11.3.2** Add compacted summary handling on load
  - **File**: `src/modules/conversations/conversations.service.ts`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 11.3.1
  - **Details**:
    - `getConversationContext(id: string): Promise<ConversationContext>`
    - If conversation has compactedSummary:
      - Return summary as system message + recent non-compacted messages
    - If no summary:
      - Return all messages
    - This method is used by chat-agent to load conversation state

- [ ] **11.3.3** Configure compaction threshold
  - **File**: `src/modules/conversations/conversations.service.ts`
  - **Priority**: Medium | **Effort**: S
  - **Dependencies**: 11.3.1
  - **Details**:
    - Default threshold: 50 messages
    - Configurable via environment variable: `CONVERSATION_COMPACTION_THRESHOLD`
    - Keep most recent N messages intact (default: 10)

- [ ] **11.3.4** Create conversation search endpoint
  - **File**: `src/modules/conversations/conversations.controller.ts`
  - **Priority**: Medium | **Effort**: M
  - **Dependencies**: Phase 8.3
  - **Details**:
    - `GET /api/conversations/search?q=<query>` — Search across conversation messages
    - Full-text search on message content
    - Return matching conversations with relevant message snippets
    - Filter by date range, archived status

- [ ] **11.3.5** Write compaction tests
  - **File**: `src/modules/conversations/compaction.spec.ts`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 11.3.1
  - **Details**:
    - Test compaction triggers at threshold
    - Test summary includes key context (atoms, decisions)
    - Test recent messages are preserved
    - Test getConversationContext returns summary + recent
    - Test compaction is idempotent (doesn't double-compact)

---

## Phase 11 Completion Criteria

| Criterion | Validation |
|-----------|------------|
| Change set can be created with draft atoms | API test: create + add atoms |
| Change set submit enforces quality gate | Attempt submit with low-quality atom |
| Change set batch commit is atomic | Commit set, verify all atoms committed |
| Abandoned change set preserves audit trail | Abandon, verify record exists |
| Interview graph generates clarification questions | Start interview with vague intent |
| Interview graph extracts atoms from clarified intent | Complete interview cycle |
| Interview graph suggests molecule grouping | Extract multiple atoms, verify suggestion |
| Chat routing detects interview intent | Send "I want to create a new feature" |
| Conversation compaction triggers at threshold | Add 50+ messages, verify summary |
| Compacted conversation loads correctly | Load conversation with summary |

---

## File Inventory

### New Files

| File | Task | Purpose |
|------|------|---------|
| `src/modules/molecules/change-set.types.ts` | 11.1.2 | Type definitions |
| `src/modules/molecules/change-set.service.spec.ts` | 11.1.12 | Tests |
| `src/migrations/AddChangeSetToMolecules.ts` | 11.1.4 | Migration |
| `src/modules/agents/graphs/types/interview-state.ts` | 11.2.1 | State schema |
| `src/modules/agents/graphs/nodes/interview/analyze-intent.node.ts` | 11.2.2 | Node |
| `src/modules/agents/graphs/nodes/interview/generate-questions.node.ts` | 11.2.3 | Node |
| `src/modules/agents/graphs/nodes/interview/extract-atoms.node.ts` | 11.2.4 | Node |
| `src/modules/agents/graphs/nodes/interview/compose-molecule.node.ts` | 11.2.5 | Node |
| `src/modules/agents/graphs/graphs/interview.graph.ts` | 11.2.6 | Graph |
| `src/modules/agents/graphs/graphs/interview.graph.spec.ts` | 11.2.10 | Tests |
| `src/modules/agents/interview.service.ts` | 11.2.8 | Service |
| `src/modules/conversations/compaction.spec.ts` | 11.3.5 | Tests |

### Modified Files

| File | Task | Changes |
|------|------|---------|
| `src/modules/molecules/molecule.entity.ts` | 11.1.1, 11.1.3 | Add change_set lens type, changeSetMetadata column |
| `src/modules/molecules/molecules.service.ts` | 11.1.5–11.1.10 | Add change set methods |
| `src/modules/molecules/molecules.controller.ts` | 11.1.11 | Add change set endpoints |
| `src/modules/agents/graphs/graph-registry.service.ts` | 11.2.7 | Register interview graph |
| `src/modules/agents/chat-agent.service.ts` | 11.2.9 | Add interview routing |
| `src/modules/conversations/conversations.service.ts` | 11.3.1–11.3.3 | Add compaction |
| `src/modules/conversations/conversations.controller.ts` | 11.3.4 | Add search endpoint |

---

*Phase 11 depends on Phase 8. It can run in parallel with Phase 10. Phase 12 (Polish) depends on Phase 11 for UI components.*
