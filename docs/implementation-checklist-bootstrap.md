# Implementation Checklist: Bootstrap Completion (Git-for-Intent Aligned)

## Document Metadata

| Field | Value |
|-------|-------|
| **Created** | 2026-02-02 |
| **Status** | Active |
| **Scope** | Bootstrap completion with Git-for-Intent alignment |
| **Related Docs** | [bootstrap-completion-plan.md](bootstrap-completion-plan.md), [analysis-git-for-intent.md](analysis-git-for-intent.md) |

---

## 1. Gap Analysis: Bootstrap Plan vs Git-for-Intent

The original bootstrap completion plan focused on 5 capabilities. Analysis against the Git-for-Intent framework reveals 8 key gaps:

| # | Gap | Bootstrap Plan Coverage | Git-for-Intent Requirement | Priority |
|---|-----|------------------------|---------------------------|----------|
| 1 | **Conflict Detection** | Not mentioned | ConflictRecord entity, 4 conflict types | High |
| 2 | **Intent Identity** | Not mentioned | `intentIdentity` field for version tracking | High |
| 3 | **Epistemic Stack Dashboard** | Coupling metrics only | PROVEN → COMMITTED → INFERRED → UNKNOWN visibility | High |
| 4 | **Change Set Molecules** | Not mentioned | `change_set` lens type for PR-equivalent | Medium |
| 5 | **Conflict Metrics** | Not mentioned | Organizational diagnostics from conflict patterns | Medium |
| 6 | **Semantic Diffing** | Not mentioned | Compare atom versions meaningfully | Low |
| 7 | **MCP Epistemic Tools** | Basic read/list tools | Expose epistemic status via MCP | Medium |
| 8 | **Invariant Visibility** | Not mentioned | Surface INV-001 through INV-009 in UI | Low |
 
---

## 2. Revised 5-Phase Implementation Plan

### Phase Overview

| Phase | Focus | Duration | Dependencies |
|-------|-------|----------|--------------|
| **Phase 8** | Foundation | 2 weeks | None |
| **Phase 9** | Visibility | 1 week | Phase 8 |
| **Phase 10** | External Access | 1 week | Phase 9 |
| **Phase 11** | Conversation | 2 weeks | Phase 9 |
| **Phase 12** | Polish | 1+ week | Phase 10, 4 |

---

## Phase 8: Foundation

**Goal**: Establish the data layer for Git-for-Intent concepts.

### 8.1 Conflict Detection Infrastructure

| Task | Priority | Effort | Dependencies | Files |
|------|----------|--------|--------------|-------|
| Create `ConflictRecord` entity | High | M | None | `src/modules/conflicts/conflict-record.entity.ts` |
| Create `ConflictsModule` with CRUD service | High | M | Entity | `src/modules/conflicts/conflicts.module.ts`, `conflicts.service.ts` |
| Add same-test conflict detection in reconciliation | High | M | Entity, Service | `src/modules/agents/graphs/nodes/reconciliation/verify.node.ts` |
| Add semantic overlap detection (LLM-based) | Medium | L | Entity, Service | `src/modules/conflicts/semantic-conflict.service.ts` |
| Create `POST /conflicts` endpoint for manual reporting | Medium | S | Service | `src/modules/conflicts/conflicts.controller.ts` |

**ConflictRecord Entity Schema**:

```typescript
@Entity('conflict_records')
export class ConflictRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: ['same_test', 'semantic_overlap', 'contradiction', 'cross_boundary'] })
  conflictType: ConflictType;

  @Column('uuid')
  atomIdA: string;

  @Column('uuid')
  atomIdB: string;

  @Column({ type: 'uuid', nullable: true })
  testRecordId: string | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  similarityScore: number | null;

  @Column('text')
  description: string;

  @Column({ type: 'enum', enum: ['open', 'resolved', 'escalated'], default: 'open' })
  status: ConflictStatus;

  @Column({ type: 'jsonb', nullable: true })
  resolution: ConflictResolution | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt: Date | null;
}
```

### 8.2 Coupling Metrics Backend

| Task | Priority | Effort | Dependencies | Files |
|------|----------|--------|--------------|-------|
| Create `CouplingMetricsService` | High | M | None | `src/modules/metrics/coupling-metrics.service.ts` |
| Implement atom→test coupling calculation | High | M | Service | Same file |
| Implement test→atom coupling calculation | High | M | Service | Same file |
| Create `GET /api/metrics/coupling` endpoint | High | S | Service | `src/modules/metrics/metrics.controller.ts` |
| Add orphan atoms query | High | S | Service | Same file |
| Add orphan tests query | High | S | Service | Same file |

### 8.3 Conversation Persistence

| Task | Priority | Effort | Dependencies | Files |
|------|----------|--------|--------------|-------|
| Create `Conversation` entity | High | S | None | `src/modules/conversations/conversation.entity.ts` |
| Create `ConversationMessage` entity | High | S | None | `src/modules/conversations/conversation-message.entity.ts` |
| Create `ConversationsModule` | High | S | Entities | `src/modules/conversations/conversations.module.ts` |
| Implement `ConversationsService` | High | M | Module | `src/modules/conversations/conversations.service.ts` |
| Wire chat-agent to persist messages | High | M | Service | `src/modules/agents/chat-agent.service.ts` |
| Create `GET /conversations/:id/messages` endpoint | Medium | S | Service | `src/modules/conversations/conversations.controller.ts` |

### 8.4 Intent Identity Schema

| Task | Priority | Effort | Dependencies | Files |
|------|----------|--------|--------------|-------|
| Add `intentIdentity` field to Atom entity | High | S | None | `src/modules/atoms/atom.entity.ts` |
| Add `intentVersion` field to Atom entity | High | S | None | Same file |
| Create migration for new fields | High | S | Entity changes | `src/migrations/AddIntentIdentityToAtoms.ts` |
| Auto-generate intentIdentity on atom creation | Medium | S | Migration | `src/modules/atoms/atoms.service.ts` |
| Copy intentIdentity on supersession | Medium | S | Service | Same file |
| Add `GET /atoms/intent/:intentIdentity` for version history | Medium | S | Service | `src/modules/atoms/atoms.controller.ts` |

---

## Phase 9: Visibility

**Goal**: Surface epistemic stack and coupling health in the UI.

### 9.1 Epistemic Stack Dashboard

| Task | Priority | Effort | Dependencies | Files |
|------|----------|--------|--------------|-------|
| Create `EpistemicMetricsService` | High | M | Phase 8 | `src/modules/metrics/epistemic-metrics.service.ts` |
| Calculate PROVEN count (atoms with passing tests) | High | M | Service | Same file |
| Calculate COMMITTED count (atoms without linked tests) | High | S | Service | Same file |
| Calculate INFERRED count (pending recommendations) | High | S | Service | Same file |
| Calculate UNKNOWN count (orphan tests + uncovered code) | High | M | Service | Same file |
| Create `GET /api/metrics/epistemic` endpoint | High | S | Service | `src/modules/metrics/metrics.controller.ts` |
| Build `EpistemicStackCard` frontend component | High | M | Endpoint | `frontend/components/dashboard/EpistemicStackCard.tsx` |
| Add epistemic stack to dashboard page | High | S | Component | `frontend/app/page.tsx` |

**EpistemicMetrics Response Schema**:

```typescript
interface EpistemicMetrics {
  proven: {
    count: number;
    atoms: AtomSummary[];  // Atoms with linked, passing tests
  };
  committed: {
    count: number;
    atoms: AtomSummary[];  // Atoms without linked tests
  };
  inferred: {
    count: number;
    recommendations: RecommendationSummary[];  // Pending review
  };
  unknown: {
    orphanTestsCount: number;
    uncoveredCodeFilesCount: number;
    // No atoms yet - these are gaps
  };
  totalCertainty: number;  // proven + committed / (all)
}
```

### 9.2 Coupling Health Dashboard

| Task | Priority | Effort | Dependencies | Files |
|------|----------|--------|--------------|-------|
| Build `CouplingHealthCard` component | High | M | Phase 8.2 | `frontend/components/dashboard/CouplingHealthCard.tsx` |
| Add progress bars for coupling rates | High | S | Component | Same file |
| Add orphan counts display | High | S | Component | Same file |
| Create `OrphansList` modal/drawer | Medium | M | API | `frontend/components/dashboard/OrphansList.tsx` |
| Add click-through to orphan details | Medium | S | Modal | Same file |

### 9.3 Conflict Dashboard

| Task | Priority | Effort | Dependencies | Files |
|------|----------|--------|--------------|-------|
| Create `GET /api/conflicts` endpoint with filtering | High | S | Phase 8.1 | `src/modules/conflicts/conflicts.controller.ts` |
| Build `ConflictsList` component | High | M | Endpoint | `frontend/components/conflicts/ConflictsList.tsx` |
| Build `ConflictDetailPanel` component | Medium | M | List | `frontend/components/conflicts/ConflictDetailPanel.tsx` |
| Add conflict resolution actions | Medium | M | Panel | Same file |
| Create conflicts page | Medium | S | Components | `frontend/app/conflicts/page.tsx` |
| Add conflict badge to header/nav | Low | S | API | `frontend/components/layout/Header.tsx` |

---

## Phase 10: External Access

**Goal**: Enable external agents to query Pact via MCP.

### 10.1 MCP Server Scaffolding

| Task | Priority | Effort | Dependencies | Files |
|------|----------|--------|--------------|-------|
| Install `@modelcontextprotocol/sdk` | High | S | None | `package.json` |
| Create MCP server entry point | High | M | SDK | `src/mcp/pact-mcp-server.ts` |
| Configure stdio transport | High | S | Entry | Same file |
| Add build script for MCP server | High | S | Server | `package.json` |
| Create MCP server Docker image | Medium | M | Build | `Dockerfile.mcp` |

### 10.2 Core MCP Tools

| Task | Priority | Effort | Dependencies | Files |
|------|----------|--------|--------------|-------|
| Implement `read_atom` tool | High | S | Server | `src/mcp/tools/read-atom.tool.ts` |
| Implement `list_atoms` tool | High | S | Server | `src/mcp/tools/list-atoms.tool.ts` |
| Implement `get_atom_for_test` tool | High | M | Server | `src/mcp/tools/get-atom-for-test.tool.ts` |
| Implement `get_coupling_status` tool | High | S | Phase 8.2 | `src/mcp/tools/get-coupling-status.tool.ts` |
| Implement `search_atoms` tool | Medium | M | Server | `src/mcp/tools/search-atoms.tool.ts` |

### 10.3 Epistemic MCP Tools

| Task | Priority | Effort | Dependencies | Files |
|------|----------|--------|--------------|-------|
| Implement `get_epistemic_status` tool | Medium | S | Phase 9.1 | `src/mcp/tools/get-epistemic-status.tool.ts` |
| Implement `get_intent_history` tool | Medium | M | Phase 8.4 | `src/mcp/tools/get-intent-history.tool.ts` |
| Implement `get_conflicts` tool | Medium | S | Phase 8.1 | `src/mcp/tools/get-conflicts.tool.ts` |
| Add tool documentation | Medium | S | Tools | `src/mcp/README.md` |
| Create MCP integration test suite | Medium | M | Tools | `test/mcp/mcp-tools.e2e-spec.ts` |

---

## Phase 11: Conversation

**Goal**: Multi-turn interview agent and Change Set molecules.

### 11.1 Change Set Molecules

| Task | Priority | Effort | Dependencies | Files |
|------|----------|--------|--------------|-------|
| Add `change_set` to `MoleculeLensType` enum | High | S | None | `src/modules/molecules/molecule.entity.ts` |
| Create `ChangeSetMetadata` interface | High | S | None | `src/modules/molecules/change-set.types.ts` |
| Add `changeSetMetadata` JSONB column to Molecule | High | S | Interface | `src/modules/molecules/molecule.entity.ts` |
| Create migration | High | S | Entity | `src/migrations/AddChangeSetToMolecules.ts` |
| Implement `createChangeSet` service method | High | M | Migration | `src/modules/molecules/molecules.service.ts` |
| Implement `addAtomToChangeSet` method | High | S | Service | Same file |
| Implement `approveChangeSet` method | High | M | Service | Same file |
| Implement `commitChangeSet` method (batch commit) | High | L | Service | Same file |
| Create `POST /change-sets` endpoint | High | S | Service | `src/modules/molecules/molecules.controller.ts` |
| Create `POST /change-sets/:id/commit` endpoint | High | S | Service | Same file |

### 11.2 Interview Agent Graph

| Task | Priority | Effort | Dependencies | Files |
|------|----------|--------|--------------|-------|
| Design interview state schema | High | M | None | `src/modules/agents/graphs/types/interview-state.ts` |
| Create `analyze-intent.node.ts` | High | M | State | `src/modules/agents/graphs/nodes/interview/analyze-intent.node.ts` |
| Create `generate-questions.node.ts` | High | M | State | `src/modules/agents/graphs/nodes/interview/generate-questions.node.ts` |
| Create `extract-atoms.node.ts` | High | M | State | `src/modules/agents/graphs/nodes/interview/extract-atoms.node.ts` |
| Create `compose-molecule.node.ts` | High | M | State | `src/modules/agents/graphs/nodes/interview/compose-molecule.node.ts` |
| Assemble `interview.graph.ts` | High | M | Nodes | `src/modules/agents/graphs/graphs/interview.graph.ts` |
| Register graph in `GraphRegistryService` | High | S | Graph | `src/modules/agents/graphs/graph-registry.service.ts` |
| Create `InterviewService` | High | M | Graph | `src/modules/agents/interview.service.ts` |
| Wire to chat-agent routing | High | M | Service | `src/modules/agents/chat-agent.service.ts` |

### 11 .3 Conversation Compaction

| Task | Priority | Effort | Dependencies | Files |
|------|----------|--------|--------------|-------|
| Implement `summarizeConversation` method | High | L | Phase 8.3 | `src/modules/conversations/conversations.service.ts` |
| Add `compactedSummary` handling on load | High | M | Method | Same file |
| Set compaction threshold (default: 50 messages) | Medium | S | Method | Same file |
| Add `isCompacted` marking to old messages | Medium | S | Method | Same file |
| Create conversation search endpoint | Medium | M | Service | `src/modules/conversations/conversations.controller.ts` |

---

## Phase 12: Polish

**Goal**: UI refinements and advanced features.

### 12.1 Interview UI Integration

| Task | Priority | Effort | Dependencies | Files |
|------|----------|--------|--------------|-------|
| Build `InterviewChat` component | High | L | Phase 11.2 | `frontend/components/interview/InterviewChat.tsx` |
| Add clarification question display | High | M | Component | Same file |
| Add atom preview before commit | High | M | Component | `frontend/components/interview/AtomPreview.tsx` |
| Add molecule preview before commit | Medium | M | Component | `frontend/components/interview/MoleculePreview.tsx` |
| Create interview page | Medium | S | Components | `frontend/app/interview/page.tsx` |
| Add interview entry point to sidebar | Medium | S | Page | `frontend/components/layout/Sidebar.tsx` |

### 12.2 Change Set UI

| Task | Priority | Effort | Dependencies | Files |
|------|----------|--------|--------------|-------|
| Build `ChangeSetCard` component | Medium | M | Phase 11.1 | `frontend/components/change-sets/ChangeSetCard.tsx` |
| Build `ChangeSetDetailView` component | Medium | L | Card | `frontend/components/change-sets/ChangeSetDetailView.tsx` |
| Add approval workflow UI | Medium | M | Detail | Same file |
| Add batch commit confirmation | Medium | M | Detail | Same file |
| Create change sets list page | Medium | S | Components | `frontend/app/change-sets/page.tsx` |

### 12.3 Reconciliation Scheduling

| Task | Priority | Effort | Dependencies | Files |
|------|----------|--------|--------------|-------|
| Create `ReconciliationSchedulerService` | Low | M | None | `src/modules/agents/reconciliation-scheduler.service.ts` |
| Implement cron-based scheduling | Low | M | Service | Same file |
| Add schedule configuration to settings | Low | S | Service | `src/config/reconciliation.config.ts` |
| Create `GET /reconciliation/schedule` endpoint | Low | S | Service | `src/modules/agents/reconciliation.controller.ts` |
| Create `POST /reconciliation/schedule` endpoint | Low | S | Service | Same file |

### 12.4 Semantic Diffing

| Task | Priority | Effort | Dependencies | Files |
|------|----------|--------|--------------|-------|
| Create `SemanticDiffService` | Low | L | Phase 8.4 | `src/modules/atoms/semantic-diff.service.ts` |
| Implement description diff | Low | M | Service | Same file |
| Implement observable outcomes diff | Low | M | Service | Same file |
| Create `GET /atoms/:id/diff/:compareId` endpoint | Low | S | Service | `src/modules/atoms/atoms.controller.ts` |
| Build `AtomDiffViewer` component | Low | M | Endpoint | `frontend/components/atoms/AtomDiffViewer.tsx` |

### 12.5 Trend Charts

| Task | Priority | Effort | Dependencies | Files |
|------|----------|--------|--------------|-------|
| Add time-series data to metrics | Low | M | Phase 9 | `src/modules/metrics/metrics-history.service.ts` |
| Implement daily snapshot recording | Low | M | Service | Same file |
| Create `GET /api/metrics/trends` endpoint | Low | S | Service | `src/modules/metrics/metrics.controller.ts` |
| Build `TrendChart` component | Low | M | Endpoint | `frontend/components/dashboard/TrendChart.tsx` |
| Add trend charts to dashboard | Low | S | Component | `frontend/app/page.tsx` |

---

## 3. Success Metrics (Revised)

Bootstrap is complete when:

| Metric | Target | Git-for-Intent Alignment |
|--------|--------|--------------------------|
| Atom → Test coupling rate | > 90% | Epistemic: COMMITTED → PROVEN |
| Test → Atom coupling rate | > 95% | Epistemic: Reduces UNKNOWN |
| Reconciliation on Pact repo | Yes | Compiler for intent works |
| External agent via MCP | Yes | External access to truth |
| Conversation history persists | Yes | Foundation for interview |
| Can create molecule via interview | Yes | Multi-turn intent refinement |
| **Conflict detection active** | Yes | Semantic conflicts surfaced |
| **Epistemic dashboard shows all 4 levels** | Yes | PROVEN/COMMITTED/INFERRED/UNKNOWN |
| **Change Set workflow functional** | Yes | PR-equivalent for intent |
| **Intent version history queryable** | Yes | "Same intent, different version" |

---

## 4. File Inventory

### New Files to Create

| File | Phase | Purpose |
|------|-------|---------|
| `src/modules/conflicts/conflict-record.entity.ts` | 1.1 | Conflict storage |
| `src/modules/conflicts/conflicts.module.ts` | 1.1 | Conflict module |
| `src/modules/conflicts/conflicts.service.ts` | 1.1 | Conflict business logic |
| `src/modules/conflicts/conflicts.controller.ts` | 1.1 | Conflict API |
| `src/modules/conflicts/semantic-conflict.service.ts` | 1.1 | LLM-based overlap detection |
| `src/modules/metrics/coupling-metrics.service.ts` | 1.2 | Coupling calculations |
| `src/modules/metrics/epistemic-metrics.service.ts` | 2.1 | Epistemic stack calculations |
| `src/modules/metrics/metrics.controller.ts` | 1.2 | Metrics API |
| `src/modules/conversations/conversation.entity.ts` | 1.3 | Chat persistence |
| `src/modules/conversations/conversation-message.entity.ts` | 1.3 | Message storage |
| `src/modules/conversations/conversations.module.ts` | 1.3 | Conversation module |
| `src/modules/conversations/conversations.service.ts` | 1.3 | Conversation logic |
| `src/modules/conversations/conversations.controller.ts` | 1.3 | Conversation API |
| `src/modules/molecules/change-set.types.ts` | 4.1 | Change set interfaces |
| `src/mcp/pact-mcp-server.ts` | 3.1 | MCP server entry |
| `src/mcp/tools/*.ts` | 3.2, 3.3 | MCP tool implementations |
| `src/modules/agents/graphs/types/interview-state.ts` | 4.2 | Interview state schema |
| `src/modules/agents/graphs/graphs/interview.graph.ts` | 4.2 | Interview graph |
| `src/modules/agents/graphs/nodes/interview/*.ts` | 4.2 | Interview nodes |
| `src/modules/agents/interview.service.ts` | 4.2 | Interview orchestration |
| `frontend/components/dashboard/EpistemicStackCard.tsx` | 2.1 | Epistemic UI |
| `frontend/components/dashboard/CouplingHealthCard.tsx` | 2.2 | Coupling UI |
| `frontend/components/conflicts/*.tsx` | 2.3 | Conflict UI |
| `frontend/components/interview/*.tsx` | 5.1 | Interview UI |
| `frontend/components/change-sets/*.tsx` | 5.2 | Change set UI |
| `frontend/app/conflicts/page.tsx` | 2.3 | Conflicts page |
| `frontend/app/interview/page.tsx` | 5.1 | Interview page |
| `frontend/app/change-sets/page.tsx` | 5.2 | Change sets page |

### Files to Modify

| File | Phase | Changes |
|------|-------|---------|
| `src/modules/atoms/atom.entity.ts` | 1.4 | Add `intentIdentity`, `intentVersion` |
| `src/modules/atoms/atoms.service.ts` | 1.4 | Handle intent identity on create/supersede |
| `src/modules/atoms/atoms.controller.ts` | 1.4 | Add intent history endpoint |
| `src/modules/molecules/molecule.entity.ts` | 4.1 | Add `change_set` lens type, metadata |
| `src/modules/molecules/molecules.service.ts` | 4.1 | Add change set methods |
| `src/modules/molecules/molecules.controller.ts` | 4.1 | Add change set endpoints |
| `src/modules/agents/graphs/nodes/reconciliation/verify.node.ts` | 1.1 | Add conflict detection |
| `src/modules/agents/chat-agent.service.ts` | 1.3, 4.2 | Persist messages, route to interview |
| `src/modules/agents/graphs/graph-registry.service.ts` | 4.2 | Register interview graph |
| `frontend/app/page.tsx` | 2.1, 2.2 | Add epistemic/coupling cards |
| `frontend/components/layout/Sidebar.tsx` | 5.1 | Add interview entry |
| `frontend/components/layout/Header.tsx` | 2.3 | Add conflict badge |

---

## 5. Cross-References

### Phase Checklists

- [Phase 8: Foundation](implementation-checklist-phase8.md) - Conflict detection, coupling metrics, conversations, intent identity
- [Phase 9: Visibility](implementation-checklist-phase9.md) - Epistemic stack dashboard, coupling health UI, conflict dashboard
- [Phase 10: External Access](implementation-checklist-phase10.md) - MCP server and tools
- [Phase 11: Conversation](implementation-checklist-phase11.md) - Change set molecules, interview agent, compaction
- [Phase 12: Polish](implementation-checklist-phase12.md) - Interview UI, change set UI, scheduling, semantic diffing, trends

### Related Documents

- [bootstrap-completion-plan.md](bootstrap-completion-plan.md) - Original bootstrap plan (superseded by this)
- [analysis-git-for-intent.md](analysis-git-for-intent.md) - Conceptual framework driving these decisions
- [ux.md](ux.md) - UX principles for new components
- [ui.md](ui.md) - Frontend architecture patterns
- [schema.md](schema.md) - Database schema reference

---

*This checklist is the authoritative implementation guide for bootstrap completion. Updates should align with the Git-for-Intent framework.*
