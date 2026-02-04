# Implementation Checklist: Phase 8 — Foundation

## Document Metadata

| Field | Value |
|-------|-------|
| **Phase** | 8 |
| **Focus** | Data layer for Git-for-Intent concepts |
| **Status** | Not Started |
| **Prerequisites** | Phase 5-7 complete (Reconciliation Agent functional) |
| **Related Docs** | [implementation-checklist-bootstrap.md](implementation-checklist-bootstrap.md), [analysis-git-for-intent.md](analysis-git-for-intent.md) |

---

## Overview

Phase 8 establishes the data layer for the Git-for-Intent conceptual framework. It introduces four new subsystems:

1. **Conflict Detection** — The ConflictRecord entity and detection service
2. **Coupling Metrics** — Backend calculations for atom-test-code coupling
3. **Conversation Persistence** — Durable chat history with entity storage
4. **Intent Identity** — Schema extensions for tracking "same intent, different version"

All four are foundation-layer work: entities, services, and API endpoints. No frontend components in this phase.

---

## 8.1 Conflict Detection Infrastructure

### Context

The [analysis-git-for-intent.md](analysis-git-for-intent.md) Section 4 defines four conflict types:

- `same_test` — Two atoms claim the same test
- `semantic_overlap` — Two atoms describe overlapping behavior
- `contradiction` — Two atoms contradict each other
- `cross_boundary` — Teams define conflicting intent for shared functionality

Currently, no conflict detection exists. The [verify.node.ts](../src/modules/agents/graphs/nodes/reconciliation/verify.node.ts) performs quality scoring but does not check for inter-atom conflicts.

### Tasks

- [ ] **8.1.1** Create conflict type definitions
  - **File**: `src/modules/conflicts/conflict.types.ts`
  - **Priority**: High | **Effort**: S
  - **Details**:
    - Define `ConflictType = 'same_test' | 'semantic_overlap' | 'contradiction' | 'cross_boundary'`
    - Define `ConflictStatus = 'open' | 'resolved' | 'escalated'`
    - Define `ConflictResolution` interface with `action`, `resolvedBy`, `resolvedAt`, `clarificationArtifactId`
    - Define `ConflictResolutionAction = 'supersede_a' | 'supersede_b' | 'split_test' | 'reject_a' | 'reject_b' | 'clarify'`

- [ ] **8.1.2** Create `ConflictRecord` entity
  - **File**: `src/modules/conflicts/conflict-record.entity.ts`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 8.1.1
  - **Details**:
    - Fields: `id`, `conflictType`, `atomIdA`, `atomIdB`, `testRecordId` (nullable), `similarityScore` (nullable), `description`, `status`, `resolution` (JSONB, nullable), `createdAt`, `resolvedAt` (nullable)
    - ManyToOne relations to Atom for both atomIdA and atomIdB
    - Optional ManyToOne to TestRecord for same-test conflicts
    - Index on `[status]` for open conflict queries
    - Index on `[atomIdA, atomIdB]` for duplicate detection

- [ ] **8.1.3** Create `ConflictsModule` with CRUD service
  - **Files**: `src/modules/conflicts/conflicts.module.ts`, `src/modules/conflicts/conflicts.service.ts`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 8.1.2
  - **Details**:
    - `ConflictsService` methods:
      - `create(dto: CreateConflictDto): Promise<ConflictRecord>`
      - `findAll(filters?: ConflictFilters): Promise<ConflictRecord[]>`
      - `findById(id: string): Promise<ConflictRecord>`
      - `findByAtom(atomId: string): Promise<ConflictRecord[]>`
      - `resolve(id: string, resolution: ConflictResolution): Promise<ConflictRecord>`
      - `escalate(id: string): Promise<ConflictRecord>`
      - `getMetrics(): Promise<ConflictMetrics>`
    - Module imports: TypeOrmModule.forFeature([ConflictRecord]), AtomsModule
    - Export ConflictsService for use by other modules

- [ ] **8.1.4** Add same-test conflict detection in reconciliation verify node
  - **File**: `src/modules/agents/graphs/nodes/reconciliation/verify.node.ts`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 8.1.3
  - **Details**:
    - After quality scoring, check each atom recommendation's source test against:
      1. Existing atoms already linked to that test (via `@atom` annotations)
      2. Other atom recommendations in the same run targeting the same test
    - If conflict found, create ConflictRecord with type `same_test`
    - Add `conflictIds: string[]` to atom recommendation state
    - Flag conflicting recommendations in the verify output

- [ ] **8.1.5** Create semantic overlap detection service
  - **File**: `src/modules/conflicts/semantic-conflict.service.ts`
  - **Priority**: Medium | **Effort**: L
  - **Dependencies**: 8.1.3
  - **Details**:
    - `SemanticConflictService` methods:
      - `checkOverlap(atomA: Atom, atomB: Atom): Promise<{ isOverlap: boolean; score: number; reasoning: string }>`
      - `findOverlaps(atom: Atom, candidates: Atom[]): Promise<ConflictCandidate[]>`
      - `batchCheck(atoms: Atom[]): Promise<ConflictCandidate[]>`
    - Use LlmService for semantic similarity comparison
    - Threshold: >80% similarity triggers `semantic_overlap` conflict
    - Future optimization: Use embeddings for fast approximate matching before LLM confirmation

- [ ] **8.1.6** Create conflicts controller with REST endpoints
  - **File**: `src/modules/conflicts/conflicts.controller.ts`
  - **Priority**: Medium | **Effort**: S
  - **Dependencies**: 8.1.3
  - **Details**:
    - `GET /api/conflicts` — List conflicts with optional filters (status, type, atomId)
    - `GET /api/conflicts/:id` — Get single conflict detail
    - `POST /api/conflicts` — Manually report a conflict
    - `PATCH /api/conflicts/:id/resolve` — Resolve a conflict
    - `PATCH /api/conflicts/:id/escalate` — Escalate a conflict
    - `GET /api/conflicts/metrics` — Get conflict metrics summary

- [ ] **8.1.7** Create database migration for conflict_records table
  - **File**: `src/migrations/CreateConflictRecords.ts`
  - **Priority**: High | **Effort**: S
  - **Dependencies**: 8.1.2

### Verification

```bash
# Run unit tests
./scripts/test.sh --file conflicts

# Verify entity creation
docker-compose exec postgres psql -U pact -d pact_development -c "\d conflict_records"

# Test API endpoints
curl http://localhost:3000/api/conflicts
curl http://localhost:3000/api/conflicts/metrics
```

---

## 8.2 Coupling Metrics Backend

### Context

The [bootstrap-completion-plan.md](bootstrap-completion-plan.md) Section 3 defines `CouplingMetrics` with atom→test, test→atom, and code→atom rates. Currently, the only metrics exist in [reconciliation-metrics.service.spec.ts](../src/modules/agents/reconciliation-metrics.service.spec.ts) which calculates per-run metrics. There is no `src/modules/metrics/` module.

### Tasks

- [ ] **8.2.1** Create `MetricsModule` scaffolding
  - **Files**: `src/modules/metrics/metrics.module.ts`
  - **Priority**: High | **Effort**: S
  - **Details**:
    - Import TypeOrmModule for Atom, TestRecord, AtomRecommendation entities
    - Import AtomsModule, AgentsModule
    - Export CouplingMetricsService

- [ ] **8.2.2** Create `CouplingMetricsService`
  - **File**: `src/modules/metrics/coupling-metrics.service.ts`
  - **Priority**: High | **Effort**: M
  - **Details**:
    - `getAtomTestCoupling(): Promise<AtomTestCouplingMetrics>`
      - Count atoms with status 'committed' that have linked test records
      - Calculate rate (atomsWithTests / totalCommittedAtoms)
      - Return orphan atoms (committed, no test linkage)
    - `getTestAtomCoupling(): Promise<TestAtomCouplingMetrics>`
      - Count test records that have linked atoms (via atomRecommendationId or direct annotation)
      - Calculate rate (testsWithAtoms / totalTests)
      - Return orphan tests (no atom linkage)
    - `getCodeAtomCoverage(rootDir: string): Promise<CodeCoveragMetrics>`
      - Scan source files in rootDir
      - Identify files with test coverage
      - Cross-reference with atom coverage
      - Calculate rate (filesWithAtoms / totalSourceFiles)
    - `getAll(rootDir?: string): Promise<CouplingMetrics>`
      - Aggregates all three metrics

- [ ] **8.2.3** Create coupling metrics DTOs
  - **File**: `src/modules/metrics/dto/coupling-metrics.dto.ts`
  - **Priority**: High | **Effort**: S
  - **Dependencies**: 8.2.2
  - **Details**:
    ```typescript
    interface CouplingMetrics {
      atomTestCoupling: {
        totalAtoms: number;
        atomsWithTests: number;
        rate: number;
        orphanAtoms: AtomSummary[];
      };
      testAtomCoupling: {
        totalTests: number;
        testsWithAtoms: number;
        rate: number;
        orphanTests: TestSummary[];
      };
      codeAtomCoverage: {
        totalSourceFiles: number;
        filesWithAtoms: number;
        rate: number;
        uncoveredFiles: string[];
      };
    }
    ```

- [ ] **8.2.4** Create metrics controller
  - **File**: `src/modules/metrics/metrics.controller.ts`
  - **Priority**: High | **Effort**: S
  - **Dependencies**: 8.2.2
  - **Details**:
    - `GET /api/metrics/coupling` — Returns full CouplingMetrics
    - `GET /api/metrics/coupling/atom-test` — Atom→Test rate only
    - `GET /api/metrics/coupling/orphans` — Combined orphan lists
    - Add Swagger decorators for API documentation

- [ ] **8.2.5** Write unit tests for CouplingMetricsService
  - **File**: `src/modules/metrics/coupling-metrics.service.spec.ts`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 8.2.2
  - **Details**:
    - Test with empty database (0/0 rates)
    - Test with all atoms coupled (100% rate)
    - Test with mixed coupling (orphans correctly identified)
    - Test orphan atom detection accuracy
    - Test orphan test detection accuracy

### Verification

```bash
# Run unit tests
./scripts/test.sh --file coupling-metrics

# Test API endpoint
curl http://localhost:3000/api/metrics/coupling | jq
```

---

## 8.3 Conversation Persistence

### Context

Currently, [chat-agent.service.ts](../src/modules/agents/chat-agent.service.ts) maintains in-memory `ChatSession` objects with a messages array. There is no persistence — conversations are lost on server restart. The bootstrap plan requires durable conversation history for the interview agent (Phase 11).

### Tasks

- [ ] **8.3.1** Create `Conversation` entity
  - **File**: `src/modules/conversations/conversation.entity.ts`
  - **Priority**: High | **Effort**: S
  - **Details**:
    - Fields: `id` (UUID), `title` (nullable, auto-generated from first message), `context` (JSONB, nullable — atoms discussed, current mode, etc.), `compactedSummary` (text, nullable — summarized history for long conversations), `messageCount` (int, default 0), `isArchived` (boolean, default false), `createdAt`, `lastMessageAt`
    - OneToMany relation to ConversationMessage
    - Index on `[isArchived, lastMessageAt]` for recent conversations query

- [ ] **8.3.2** Create `ConversationMessage` entity
  - **File**: `src/modules/conversations/conversation-message.entity.ts`
  - **Priority**: High | **Effort**: S
  - **Details**:
    - Fields: `id` (UUID), `conversationId` (UUID), `role` ('user' | 'assistant' | 'system'), `content` (text), `metadata` (JSONB, nullable — toolCalls, atomsReferenced, tokensUsed), `isCompacted` (boolean, default false — part of summary), `createdAt`
    - ManyToOne relation to Conversation
    - Index on `[conversationId, createdAt]` for message retrieval

- [ ] **8.3.3** Create `ConversationsModule`
  - **File**: `src/modules/conversations/conversations.module.ts`
  - **Priority**: High | **Effort**: S
  - **Dependencies**: 8.3.1, 8.3.2
  - **Details**:
    - Import TypeOrmModule.forFeature([Conversation, ConversationMessage])
    - Export ConversationsService

- [ ] **8.3.4** Implement `ConversationsService`
  - **File**: `src/modules/conversations/conversations.service.ts`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 8.3.3
  - **Details**:
    - `create(title?: string): Promise<Conversation>`
    - `addMessage(conversationId: string, role, content, metadata?): Promise<ConversationMessage>`
    - `getMessages(conversationId: string, options?: { limit, offset }): Promise<ConversationMessage[]>`
    - `getRecent(limit?: number): Promise<Conversation[]>`
    - `findById(id: string): Promise<Conversation>`
    - `archive(id: string): Promise<void>`
    - `updateTitle(id: string, title: string): Promise<void>`
    - Auto-generate title from first user message (truncate to 100 chars)
    - Increment messageCount on each addMessage call
    - Update lastMessageAt on each addMessage call

- [ ] **8.3.5** Wire chat-agent to persist messages
  - **File**: `src/modules/agents/chat-agent.service.ts`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 8.3.4
  - **Details**:
    - Inject ConversationsService into ChatAgentService
    - On new conversation: call `conversations.create()`
    - On each user message: call `conversations.addMessage(id, 'user', content)`
    - On each assistant response: call `conversations.addMessage(id, 'assistant', content, { toolCalls, atomsReferenced })`
    - Map existing `ChatSession.sessionId` to `Conversation.id`
    - On session resume: load messages from database instead of empty array

- [ ] **8.3.6** Create conversations controller
  - **File**: `src/modules/conversations/conversations.controller.ts`
  - **Priority**: Medium | **Effort**: S
  - **Dependencies**: 8.3.4
  - **Details**:
    - `GET /api/conversations` — List recent conversations (paginated)
    - `GET /api/conversations/:id` — Get conversation with message count
    - `GET /api/conversations/:id/messages` — Get messages (paginated, newest first)
    - `DELETE /api/conversations/:id` — Archive a conversation
    - `PATCH /api/conversations/:id` — Update title

- [ ] **8.3.7** Create database migration for conversations tables
  - **File**: `src/migrations/CreateConversations.ts`
  - **Priority**: High | **Effort**: S
  - **Dependencies**: 8.3.1, 8.3.2

- [ ] **8.3.8** Write unit tests
  - **File**: `src/modules/conversations/conversations.service.spec.ts`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 8.3.4
  - **Details**:
    - Test conversation creation with/without title
    - Test message persistence and retrieval order
    - Test auto-title generation from first user message
    - Test messageCount increment
    - Test lastMessageAt update
    - Test pagination for messages

### Verification

```bash
# Run unit tests
./scripts/test.sh --file conversations

# Verify tables created
docker-compose exec postgres psql -U pact -d pact_development -c "\d conversations"
docker-compose exec postgres psql -U pact -d pact_development -c "\d conversation_messages"

# Test conversation flow
curl -X POST http://localhost:3000/api/conversations
curl http://localhost:3000/api/conversations
```

---

## 8.4 Intent Identity Schema

### Context

The [analysis-git-for-intent.md](analysis-git-for-intent.md) Section 2.4 defines atoms as "files" — the intent identity persists across versions (supersessions). Currently, the [Atom entity](../src/modules/atoms/atom.entity.ts) has a `supersededBy` field but no concept of "same intent, different version." The supersession chain provides lineage but requires traversal to find related atoms.

### Tasks

- [ ] **8.4.1** Add intent identity fields to Atom entity
  - **File**: `src/modules/atoms/atom.entity.ts`
  - **Priority**: High | **Effort**: S
  - **Details**:
    - Add `intentIdentity` field: `varchar(255)`, nullable initially for backward compatibility
      - Stable identifier for the conceptual intent across versions
      - Auto-generated as UUID on first atom creation
      - Inherited (copied) on supersession
    - Add `intentVersion` field: `int`, default 1
      - Incremented on each supersession within the same intent identity
    - Add index on `[intentIdentity, intentVersion]`

- [ ] **8.4.2** Create database migration
  - **File**: `src/migrations/AddIntentIdentityToAtoms.ts`
  - **Priority**: High | **Effort**: S
  - **Dependencies**: 8.4.1
  - **Details**:
    - Add nullable `intentIdentity` column (varchar 255)
    - Add `intentVersion` column (int, default 1)
    - Backfill: Generate unique intentIdentity for each existing atom
    - For supersession chains: Walk `supersededBy` chains and assign same intentIdentity with incrementing version
    - Add composite index on `[intentIdentity, intentVersion]`

- [ ] **8.4.3** Auto-generate intentIdentity on atom creation
  - **File**: `src/modules/atoms/atoms.service.ts`
  - **Priority**: Medium | **Effort**: S
  - **Dependencies**: 8.4.2
  - **Details**:
    - In `create()` method: If no intentIdentity provided, generate UUID
    - Set intentVersion = 1 for new atoms

- [ ] **8.4.4** Copy intentIdentity on supersession
  - **File**: `src/modules/atoms/atoms.service.ts`
  - **Priority**: Medium | **Effort**: S
  - **Dependencies**: 8.4.3
  - **Details**:
    - In `supersede()` method: Copy intentIdentity from old atom to new atom
    - Set intentVersion = oldAtom.intentVersion + 1
    - If old atom has no intentIdentity (pre-migration): Generate one for both

- [ ] **8.4.5** Add intent history endpoint
  - **File**: `src/modules/atoms/atoms.controller.ts`
  - **Priority**: Medium | **Effort**: S
  - **Dependencies**: 8.4.3
  - **Details**:
    - `GET /api/atoms/intent/:intentIdentity` — Returns all versions of an intent
      - Ordered by `intentVersion ASC`
      - Includes all atom fields
    - `GET /api/atoms/:id/versions` — Returns version history for a specific atom's intent
      - Lookup atom, get intentIdentity, return all versions

- [ ] **8.4.6** Write unit tests
  - **File**: `src/modules/atoms/atoms.service.spec.ts` (extend existing)
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 8.4.4
  - **Details**:
    - Test intentIdentity auto-generation on create
    - Test intentIdentity inheritance on supersede
    - Test intentVersion increment on supersede
    - Test backfill migration logic (if separate script)
    - Test version history query returns correct order

### Verification

```bash
# Run unit tests
./scripts/test.sh --file atoms.service

# Verify migration
docker-compose exec postgres psql -U pact -d pact_development -c "SELECT id, \"atomId\", \"intentIdentity\", \"intentVersion\" FROM atoms LIMIT 10"

# Test version history
curl http://localhost:3000/api/atoms/intent/<intentIdentity>
```

---

## Phase 8 Completion Criteria

Phase 8 is complete when:

| Criterion | Validation |
|-----------|------------|
| ConflictRecord entity exists and is migrated | `\d conflict_records` shows table |
| ConflictsService CRUD operations work | Unit tests pass |
| Same-test conflicts detected during reconciliation | Run reconciliation on test repo with duplicate annotations |
| CouplingMetrics endpoint returns valid data | `GET /api/metrics/coupling` returns JSON with rates |
| Orphan atoms and tests identified correctly | Compare API output to manual count |
| Conversations persist across server restarts | Create conversation, restart Docker, verify data |
| Chat-agent wires to conversation persistence | Chat via UI, check database for messages |
| Atom entity has intentIdentity field | `SELECT "intentIdentity" FROM atoms` works |
| Supersession copies intentIdentity | Create atom, supersede it, verify same intentIdentity |
| Intent history endpoint works | `GET /api/atoms/intent/:id` returns version chain |

---

## File Inventory

### New Files

| File | Task | Purpose |
|------|------|---------|
| `src/modules/conflicts/conflict.types.ts` | 8.1.1 | Type definitions |
| `src/modules/conflicts/conflict-record.entity.ts` | 8.1.2 | Entity |
| `src/modules/conflicts/conflicts.module.ts` | 8.1.3 | Module |
| `src/modules/conflicts/conflicts.service.ts` | 8.1.3 | Business logic |
| `src/modules/conflicts/conflicts.controller.ts` | 8.1.6 | REST API |
| `src/modules/conflicts/semantic-conflict.service.ts` | 8.1.5 | LLM-based detection |
| `src/modules/conflicts/conflicts.service.spec.ts` | 8.1.3 | Tests |
| `src/modules/metrics/metrics.module.ts` | 8.2.1 | Module |
| `src/modules/metrics/coupling-metrics.service.ts` | 8.2.2 | Coupling calculations |
| `src/modules/metrics/dto/coupling-metrics.dto.ts` | 8.2.3 | DTOs |
| `src/modules/metrics/metrics.controller.ts` | 8.2.4 | REST API |
| `src/modules/metrics/coupling-metrics.service.spec.ts` | 8.2.5 | Tests |
| `src/modules/conversations/conversation.entity.ts` | 8.3.1 | Entity |
| `src/modules/conversations/conversation-message.entity.ts` | 8.3.2 | Entity |
| `src/modules/conversations/conversations.module.ts` | 8.3.3 | Module |
| `src/modules/conversations/conversations.service.ts` | 8.3.4 | Business logic |
| `src/modules/conversations/conversations.controller.ts` | 8.3.6 | REST API |
| `src/modules/conversations/conversations.service.spec.ts` | 8.3.8 | Tests |
| `src/migrations/CreateConflictRecords.ts` | 8.1.7 | Migration |
| `src/migrations/CreateConversations.ts` | 8.3.7 | Migration |
| `src/migrations/AddIntentIdentityToAtoms.ts` | 8.4.2 | Migration |

### Modified Files

| File | Task | Changes |
|------|------|---------|
| `src/modules/atoms/atom.entity.ts` | 8.4.1 | Add intentIdentity, intentVersion fields |
| `src/modules/atoms/atoms.service.ts` | 8.4.3, 8.4.4 | Handle identity on create/supersede |
| `src/modules/atoms/atoms.controller.ts` | 8.4.5 | Add intent history endpoints |
| `src/modules/agents/graphs/nodes/reconciliation/verify.node.ts` | 8.1.4 | Add same-test conflict detection |
| `src/modules/agents/chat-agent.service.ts` | 8.3.5 | Wire to conversation persistence |
| `src/app.module.ts` | — | Import ConflictsModule, MetricsModule, ConversationsModule |

---

*Phase 8 is prerequisite for Phase 9 (Visibility) and Phase 11 (Conversation).*
