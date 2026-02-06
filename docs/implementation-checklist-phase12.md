# Implementation Checklist: Phase 12 — Polish

## Document Metadata

| Field | Value |
|-------|-------|
| **Phase** | 12 |
| **Focus** | UI integration, scheduling, semantic diffing, trends |
| **Status** | Not Started |
| **Prerequisites** | Phase 10 (External Access), Phase 11 (Conversation) |
| **Related Docs** | [implementation-checklist-bootstrap.md](implementation-checklist-bootstrap.md), [ui.md](ui.md), [ux.md](ux.md) |

---

## Overview

Phase 12 is the final bootstrap phase, focused on frontend integration and advanced features:

1. **Interview UI** — Frontend for the multi-turn interview agent
2. **Change Set UI** — Frontend for the PR-equivalent workflow
3. **Reconciliation Scheduling** — Automated cron-based reconciliation
4. **Semantic Diffing** — Compare atom versions meaningfully
5. **Trend Charts** — Historical metrics visualization

This phase transitions Pact from a technically capable system to a user-ready product.

---

## 12.1 Interview UI Integration

### Context

Phase 11.2 creates the interview agent backend. This section builds the frontend chat interface for multi-turn intent extraction. Per [ux.md](ux.md) Section 5.1-5.2, the creation flow should feel deliberate — "closer to signing a contract than writing a note."

### Tasks

- [ ] **12.1.1** Create `InterviewChat` component
  - **File**: `frontend/components/interview/InterviewChat.tsx`
  - **Priority**: High | **Effort**: L
  - **Dependencies**: Phase 11.2
  - **Details**:
    - Chat-style interface with message bubbles
    - User messages (right-aligned) and assistant messages (left-aligned)
    - Supports three message types:
      1. Text messages (user intent, assistant analysis)
      2. Clarification questions (rendered as interactive cards with input fields)
      3. Atom/molecule previews (rendered as structured cards)
    - Input area at bottom with send button
    - "New Interview" button to start fresh
    - Shows interview phase indicator (Analyzing → Clarifying → Extracting → Composing → Confirming)
    - Uses `useInterview` hook for API interaction

- [ ] **12.1.2** Create `useInterview` hook
  - **File**: `frontend/hooks/interview/use-interview.ts`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: Phase 11.2
  - **Details**:
    - `startInterview(rawIntent: string): Promise<InterviewResponse>`
    - `respond(threadId: string, responses: UserResponse[]): Promise<InterviewResponse>`
    - `confirm(threadId: string): Promise<CreateResult>`
    - Manages interview thread ID state
    - Integrates with conversation persistence for history

- [ ] **12.1.3** Create `ClarificationQuestionCard` component
  - **File**: `frontend/components/interview/ClarificationQuestionCard.tsx`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 12.1.1
  - **Details**:
    - Renders a single clarification question with:
      - Question text
      - Why this question matters (context from LLM)
      - Input field (text area for open questions, select for choice questions)
      - "Skip" option (mark as not applicable)
    - Collects user response and passes back to parent

- [ ] **12.1.4** Create `AtomPreview` component
  - **File**: `frontend/components/interview/AtomPreview.tsx`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 12.1.1
  - **Details**:
    - Card showing a draft atom before creation:
      - Description with syntax highlighting for behavioral language
      - Category badge
      - Quality score (if computed)
      - Observable outcomes list
      - Falsifiability criteria list
    - Actions: "Accept" / "Edit" / "Reject"
    - Edit mode: inline editing of description and outcomes
    - Visual indicator: draft state (blue border)

- [ ] **12.1.5** Create `MoleculePreview` component
  - **File**: `frontend/components/interview/MoleculePreview.tsx`
  - **Priority**: Medium | **Effort**: M
  - **Dependencies**: 12.1.4
  - **Details**:
    - Card showing suggested molecule grouping:
      - Name and description
      - Lens type badge
      - List of constituent atoms (as mini AtomPreview cards)
      - Option to change lens type
      - Option to create as Change Set (toggleable)
    - Actions: "Create Molecule" / "Create Change Set" / "Skip"

- [ ] **12.1.6** Create interview page
  - **File**: `frontend/app/interview/page.tsx`
  - **Priority**: Medium | **Effort**: S
  - **Dependencies**: 12.1.1
  - **Details**:
    - Full-page layout: InterviewChat (main content)
    - Sidebar: recent conversations list (from conversations API)
    - Header: "Create Intent" / "Interview" title
    - Resume previous interviews from conversation history

- [ ] **12.1.7** Add interview entry point to sidebar
  - **File**: `frontend/components/layout/Sidebar.tsx`
  - **Priority**: Medium | **Effort**: S
  - **Dependencies**: 12.1.6
  - **Details**:
    - Add "Create Intent" item to sidebar navigation
    - Icon: plus or lightbulb
    - Position: near top of sidebar (primary action)

---

## 12.2 Change Set UI

### Context

Phase 11.1 creates the Change Set backend. This section builds the frontend for the PR-equivalent workflow. Per [analysis-git-for-intent.md](analysis-git-for-intent.md) Section 5, batch commitment should feel like "signing a multi-clause contract."

### Tasks

- [ ] **12.2.1** Create `ChangeSetCard` component
  - **File**: `frontend/components/change-sets/ChangeSetCard.tsx`
  - **Priority**: Medium | **Effort**: M
  - **Dependencies**: Phase 11.1
  - **Details**:
    - Card showing change set summary:
      - Name
      - Status badge (draft / pending_review / approved / committed / abandoned)
      - Atom count
      - Reviewer avatars/names
      - Approval progress (e.g., "1/2 approved")
      - Created date
    - Click navigates to detail view
    - Compact variant for list display

- [ ] **12.2.2** Create `useChangeSets` hook
  - **File**: `frontend/hooks/change-sets/use-change-sets.ts`
  - **Priority**: Medium | **Effort**: S
  - **Dependencies**: Phase 11.1
  - **Details**:
    - `useChangeSets(filters?)` — list change sets
    - `useChangeSet(id)` — single change set detail
    - `useCreateChangeSet()` — creation mutation
    - `useCommitChangeSet()` — commit mutation with optimistic update
    - `useAbandonChangeSet()` — abandon mutation

- [ ] **12.2.3** Create `ChangeSetDetailView` component
  - **File**: `frontend/components/change-sets/ChangeSetDetailView.tsx`
  - **Priority**: Medium | **Effort**: L
  - **Dependencies**: 12.2.1
  - **Details**:
    - Full detail view of a change set:
      - Header: name, status, created date
      - Atom list: each atom shown as expandable card with full details
      - Reviewer section: assigned reviewers, approval status
      - Activity log: approvals, change requests, status transitions
    - Action bar (varies by status):
      - Draft: "Add Atom" / "Submit for Review" / "Abandon"
      - Pending Review: "Approve" / "Request Changes"
      - Approved: "Commit All" (with confirmation dialog)
    - Conflict warnings: if any atom has open conflicts, show warning

- [ ] **12.2.4** Create batch commit confirmation dialog
  - **File**: `frontend/components/change-sets/CommitChangeSetDialog.tsx`
  - **Priority**: Medium | **Effort**: M
  - **Dependencies**: 12.2.3
  - **Details**:
    - Per [ux.md](ux.md): "Pact must require explicit user acknowledgement when an atom is finalized"
    - Dialog shows:
      - List of all atoms being committed (with quality scores)
      - Warning if any atom has qualityScore < 80
      - Explicit checkbox: "I understand these atoms will become immutable"
      - "Commit All" button (disabled until checkbox checked)
    - On commit: calls batch commit API, shows success/failure

- [ ] **12.2.5** Create change sets list page
  - **File**: `frontend/app/change-sets/page.tsx`
  - **Priority**: Medium | **Effort**: S
  - **Dependencies**: 12.2.1
  - **Details**:
    - Page layout: list of ChangeSetCards
    - Filters: by status (tabs: All / Active / Committed / Abandoned)
    - Sort: by created date (newest first)
    - "Create Change Set" button
    - Empty state: explain what change sets are and when to use them

- [ ] **12.2.6** Add change sets link to sidebar
  - **File**: `frontend/components/layout/Sidebar.tsx`
  - **Priority**: Medium | **Effort**: S
  - **Dependencies**: 12.2.5
  - **Details**:
    - Add "Change Sets" item to sidebar
    - Show badge with active (non-committed, non-abandoned) count
    - Icon: git-pull-request or similar

---

## 12.3 Reconciliation Scheduling

### Context

Currently, reconciliation runs are manually triggered via the UI wizard. The [bootstrap-completion-plan.md](bootstrap-completion-plan.md) lists scheduling as a remaining task. This enables automatic delta reconciliation on a schedule or CI hook.

### Tasks

- [ ] **12.3.1** Create `ReconciliationSchedulerService`
  - **File**: `src/modules/agents/reconciliation-scheduler.service.ts`
  - **Priority**: Low | **Effort**: M
  - **Details**:
    - Uses NestJS `@nestjs/schedule` package (ScheduleModule)
    - Methods:
      - `setSchedule(cron: string, config: ReconciliationConfig): void`
      - `clearSchedule(): void`
      - `getSchedule(): ScheduleInfo | null`
      - `isRunning(): boolean`
    - Default schedule: disabled
    - When active: runs delta reconciliation with configured options
    - Skip if a reconciliation is already running
    - Log results to reconciliation_runs table

- [ ] **12.3.2** Create schedule configuration
  - **File**: `src/config/reconciliation.config.ts`
  - **Priority**: Low | **Effort**: S
  - **Dependencies**: 12.3.1
  - **Details**:
    - Configuration options:
      - `enabled: boolean` (default: false)
      - `cron: string` (default: '0 */6 * * *' — every 6 hours)
      - `mode: 'delta'` (always delta for scheduled runs)
      - `rootDirectory: string`
      - `qualityThreshold: number` (default: 80)
      - `excludePaths: string[]`

- [ ] **12.3.3** Create schedule endpoints
  - **File**: `src/modules/agents/reconciliation.controller.ts`
  - **Priority**: Low | **Effort**: S
  - **Dependencies**: 12.3.1
  - **Details**:
    - `GET /api/reconciliation/schedule` — Get current schedule
    - `POST /api/reconciliation/schedule` — Set schedule
    - `DELETE /api/reconciliation/schedule` — Disable schedule

---

## 12.4 Semantic Diffing

### Context

The [analysis-git-for-intent.md](analysis-git-for-intent.md) Section 2.4 describes semantic diffing for atom versions. While atoms can't be textually diffed like code, they can be semantically compared across description changes, observable outcome changes, category changes, and quality score evolution.

### Tasks

- [ ] **12.4.1** Create `SemanticDiffService`
  - **File**: `src/modules/atoms/semantic-diff.service.ts`
  - **Priority**: Low | **Effort**: L
  - **Dependencies**: Phase 8.4
  - **Details**:
    - `diff(atomIdA: string, atomIdB: string): Promise<SemanticDiff>`
    - Compares:
      - Description: LLM-powered analysis of scope changes (expanded, narrowed, reframed)
      - Observable outcomes: added, removed, modified
      - Falsifiability criteria: added, removed, modified
      - Category: changed or same
      - Quality score: numeric delta with direction
      - Tags: added, removed
    - Output format:
      ```typescript
      interface SemanticDiff {
        atomA: AtomSummary;
        atomB: AtomSummary;
        descriptionDiff: {
          changeType: 'expanded' | 'narrowed' | 'reframed' | 'unchanged';
          summary: string;  // LLM-generated summary of change
        };
        outcomesDiff: {
          added: ObservableOutcome[];
          removed: ObservableOutcome[];
          modified: { old: ObservableOutcome; new: ObservableOutcome }[];
        };
        categoryDiff: { old: string; new: string } | null;
        qualityDiff: { old: number; new: number; delta: number } | null;
        tagsDiff: { added: string[]; removed: string[] };
        overallAssessment: string;  // LLM summary of the evolution
      }
      ```

- [ ] **12.4.2** Create diff endpoint
  - **File**: `src/modules/atoms/atoms.controller.ts`
  - **Priority**: Low | **Effort**: S
  - **Dependencies**: 12.4.1
  - **Details**:
    - `GET /api/atoms/:id/diff/:compareId` — Compare two atoms
    - Returns SemanticDiff object

- [ ] **12.4.3** Create `AtomDiffViewer` component
  - **File**: `frontend/components/atoms/AtomDiffViewer.tsx`
  - **Priority**: Low | **Effort**: M
  - **Dependencies**: 12.4.2
  - **Details**:
    - Side-by-side or inline view of two atom versions
    - Color-coded changes:
      - Green: additions (new outcomes, expanded scope)
      - Red: removals (removed criteria)
      - Yellow: modifications (changed wording)
    - LLM assessment summary at top
    - Quality score trend indicator
    - Accessible from atom detail page when viewing superseded atoms

---

## 12.5 Trend Charts

### Context

Historical metrics enable users to track progress over time. This section adds time-series storage and visualization for epistemic and coupling metrics.

### Tasks

- [ ] **12.5.1** Create `MetricsHistoryService`
  - **File**: `src/modules/metrics/metrics-history.service.ts`
  - **Priority**: Low | **Effort**: M
  - **Details**:
    - `recordSnapshot(): Promise<void>` — Captures current metrics as daily snapshot
    - `getTrends(period: 'week' | 'month' | 'quarter'): Promise<MetricsTrend[]>`
    - Stores snapshots in `metrics_snapshots` table:
      ```typescript
      @Entity('metrics_snapshots')
      export class MetricsSnapshot {
        @PrimaryGeneratedColumn('uuid') id: string;
        @Column('date') snapshotDate: Date;
        @Column('jsonb') epistemicMetrics: EpistemicMetrics;
        @Column('jsonb') couplingMetrics: CouplingMetrics;
        @Column('jsonb') conflictMetrics: ConflictMetrics;
        @CreateDateColumn() createdAt: Date;
      }
      ```
    - Cron job: record snapshot daily at midnight

- [ ] **12.5.2** Create metrics snapshot migration
  - **File**: `src/migrations/CreateMetricsSnapshots.ts`
  - **Priority**: Low | **Effort**: S
  - **Dependencies**: 12.5.1

- [ ] **12.5.3** Create trends endpoint
  - **File**: `src/modules/metrics/metrics.controller.ts`
  - **Priority**: Low | **Effort**: S
  - **Dependencies**: 12.5.1
  - **Details**:
    - `GET /api/metrics/trends?period=month` — Returns daily snapshots for the period

- [ ] **12.5.4** Create `TrendChart` component
  - **File**: `frontend/components/dashboard/TrendChart.tsx`
  - **Priority**: Low | **Effort**: M
  - **Dependencies**: 12.5.3
  - **Details**:
    - Line chart showing metric values over time
    - Configurable metric selection (epistemic levels, coupling rates, conflict counts)
    - Time period selector (week / month / quarter)
    - Use chart library (recharts or chart.js)
    - Responsive design

- [ ] **12.5.5** Add trend charts to dashboard
  - **File**: `frontend/app/page.tsx`
  - **Priority**: Low | **Effort**: S
  - **Dependencies**: 12.5.4
  - **Details**:
    - Place below coupling health card
    - Default view: epistemic certainty trend (last 30 days)
    - Collapsible section

---

## Phase 12 Completion Criteria

| Criterion | Validation |
|-----------|------------|
| Interview UI completes full cycle | Start interview → answer questions → review atoms → create |
| Interview shows atom previews | Verify atom cards render with quality scores |
| Interview suggests molecule | Extract 3+ atoms, verify molecule suggestion |
| Change set list page shows sets | Create change sets, verify list display |
| Change set commit dialog works | Approve and commit, verify immutability warning |
| Batch commit is atomic | Commit set, verify all atoms committed |
| Reconciliation scheduling works | Set cron, verify delta runs automatically |
| Semantic diff renders | Compare two atom versions, verify diff view |
| Trend chart displays metrics | Wait for snapshots, verify chart renders |
| All sidebar navigation items work | Click each item, verify correct page |

---

## File Inventory

### New Files

| File | Task | Purpose |
|------|------|---------|
| `frontend/components/interview/InterviewChat.tsx` | 12.1.1 | Interview UI |
| `frontend/components/interview/ClarificationQuestionCard.tsx` | 12.1.3 | Question card |
| `frontend/components/interview/AtomPreview.tsx` | 12.1.4 | Atom preview |
| `frontend/components/interview/MoleculePreview.tsx` | 12.1.5 | Molecule preview |
| `frontend/hooks/interview/use-interview.ts` | 12.1.2 | Hook |
| `frontend/app/interview/page.tsx` | 12.1.6 | Page |
| `frontend/components/change-sets/ChangeSetCard.tsx` | 12.2.1 | Card |
| `frontend/components/change-sets/ChangeSetDetailView.tsx` | 12.2.3 | Detail view |
| `frontend/components/change-sets/CommitChangeSetDialog.tsx` | 12.2.4 | Commit dialog |
| `frontend/hooks/change-sets/use-change-sets.ts` | 12.2.2 | Hooks |
| `frontend/app/change-sets/page.tsx` | 12.2.5 | Page |
| `src/modules/agents/reconciliation-scheduler.service.ts` | 12.3.1 | Scheduler |
| `src/config/reconciliation.config.ts` | 12.3.2 | Config |
| `src/modules/atoms/semantic-diff.service.ts` | 12.4.1 | Diff engine |
| `frontend/components/atoms/AtomDiffViewer.tsx` | 12.4.3 | Diff viewer |
| `src/modules/metrics/metrics-history.service.ts` | 12.5.1 | History service |
| `src/migrations/CreateMetricsSnapshots.ts` | 12.5.2 | Migration |
| `frontend/components/dashboard/TrendChart.tsx` | 12.5.4 | Chart |

### Modified Files

| File | Task | Changes |
|------|------|---------|
| `frontend/components/layout/Sidebar.tsx` | 12.1.7, 12.2.6 | Add interview, change sets nav |
| `frontend/app/page.tsx` | 12.5.5 | Add trend charts |
| `src/modules/atoms/atoms.controller.ts` | 12.4.2 | Add diff endpoint |
| `src/modules/agents/reconciliation.controller.ts` | 12.3.3 | Add schedule endpoints |
| `src/modules/metrics/metrics.controller.ts` | 12.5.3 | Add trends endpoint |
| `src/modules/metrics/metrics.module.ts` | 12.5.1 | Register history service |

---

## Bootstrap Completion

When Phase 12 is complete, **bootstrap is done**. The system should meet all success metrics from [implementation-checklist-bootstrap.md](implementation-checklist-bootstrap.md):

| Metric | Target |
|--------|--------|
| Atom → Test coupling rate | > 90% |
| Test → Atom coupling rate | > 95% |
| Reconciliation on Pact repo | Yes |
| External agent via MCP | Yes |
| Conversation history persists | Yes |
| Can create molecule via interview | Yes |
| Conflict detection active | Yes |
| Epistemic dashboard shows all 4 levels | Yes |
| Change Set workflow functional | Yes |
| Intent version history queryable | Yes |

At this point, Pact is self-hosting: it can manage its own development through its own tools.

---

*Phase 12 is the final bootstrap phase. After completion, Pact transitions to self-hosting mode.*
