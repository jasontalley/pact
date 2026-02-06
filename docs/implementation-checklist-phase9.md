# Implementation Checklist: Phase 9 — Visibility

## Document Metadata

| Field | Value |
|-------|-------|
| **Phase** | 9 |
| **Focus** | Surface epistemic stack and coupling health in the UI |
| **Status** | Not Started |
| **Prerequisites** | Phase 8 (Foundation) complete |
| **Related Docs** | [implementation-checklist-bootstrap.md](implementation-checklist-bootstrap.md), [analysis-git-for-intent.md](analysis-git-for-intent.md) |

---

## Overview

Phase 9 makes the Git-for-Intent concepts visible in the frontend. The key insight from the analysis document is that Pact is an **epistemic system** — it tracks what is PROVEN, COMMITTED, INFERRED, and UNKNOWN. This phase surfaces that epistemic stack alongside coupling health and conflict awareness.

Three dashboard sections:

1. **Epistemic Stack** — The PROVEN/COMMITTED/INFERRED/UNKNOWN breakdown
2. **Coupling Health** — Atom↔Test↔Code coupling rates with orphan identification
3. **Conflict Awareness** — Open conflicts with resolution workflow

---

## 9.1 Epistemic Stack Dashboard

### Context

The epistemic stack (Section 0 of [analysis-git-for-intent.md](analysis-git-for-intent.md)) is the philosophical foundation of Pact. Each level represents a different confidence in what the system knows:

- **PROVEN**: Atoms with linked tests that pass (empirical evidence)
- **COMMITTED**: Atoms explicitly committed but not yet linked to passing tests
- **INFERRED**: Atom recommendations from reconciliation, pending human review
- **UNKNOWN**: Orphan tests + uncovered code (not yet examined)

### Backend Tasks

- [ ] **9.1.1** Create `EpistemicMetricsService`
  - **File**: `src/modules/metrics/epistemic-metrics.service.ts`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: Phase 8.2 (MetricsModule exists)
  - **Details**:
    - Inject: AtomRepository, TestRecordRepository, AtomRecommendationRepository
    - `getEpistemicMetrics(): Promise<EpistemicMetrics>`
    - PROVEN calculation:
      - Query committed atoms where at least one linked test exists and test status is 'accepted'
      - This represents atoms with evidence of realization
    - COMMITTED calculation:
      - Query committed atoms that are NOT in the PROVEN set
      - These are committed but unrealized atoms
    - INFERRED calculation:
      - Query AtomRecommendation with status 'pending'
      - These are awaiting human review
    - UNKNOWN calculation:
      - Count orphan tests (from coupling metrics)
      - Count source files without any atom linkage

- [ ] **9.1.2** Create epistemic metrics DTO
  - **File**: `src/modules/metrics/dto/epistemic-metrics.dto.ts`
  - **Priority**: High | **Effort**: S
  - **Dependencies**: 9.1.1
  - **Details**:
    ```typescript
    interface EpistemicMetrics {
      proven: { count: number; percentage: number };
      committed: { count: number; percentage: number };
      inferred: { count: number; percentage: number };
      unknown: {
        orphanTestsCount: number;
        uncoveredCodeFilesCount: number;
      };
      totalCertainty: number;  // (proven + committed) / total
      timestamp: Date;
    }
    ```

- [ ] **9.1.3** Add epistemic endpoint to metrics controller
  - **File**: `src/modules/metrics/metrics.controller.ts`
  - **Priority**: High | **Effort**: S
  - **Dependencies**: 9.1.1
  - **Details**:
    - `GET /api/metrics/epistemic` — Returns EpistemicMetrics
    - Add Swagger decorators

- [ ] **9.1.4** Write unit tests for EpistemicMetricsService
  - **File**: `src/modules/metrics/epistemic-metrics.service.spec.ts`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 9.1.1
  - **Details**:
    - Test empty database (all zero, 0% certainty)
    - Test atoms at each epistemic level
    - Test percentages are calculated correctly
    - Test totalCertainty computation
    - Test that proven + committed + inferred don't double-count

### Frontend Tasks

- [ ] **9.1.5** Create `EpistemicStackCard` component
  - **File**: `frontend/components/dashboard/EpistemicStackCard.tsx`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 9.1.3
  - **Details**:
    - Visual representation of the 4-level stack (top = PROVEN, bottom = UNKNOWN)
    - Each level shows: count, percentage, color-coded bar
    - Colors:
      - PROVEN: green (empirically verified)
      - COMMITTED: blue (explicitly committed)
      - INFERRED: yellow/amber (pending review)
      - UNKNOWN: gray (gaps)
    - `totalCertainty` shown as headline metric
    - Click on each level expands to show atom/test details
    - Use React Query to fetch from `/api/metrics/epistemic`

- [ ] **9.1.6** Create `useEpistemicMetrics` hook
  - **File**: `frontend/hooks/metrics/use-epistemic-metrics.ts`
  - **Priority**: High | **Effort**: S
  - **Dependencies**: 9.1.3
  - **Details**:
    - React Query wrapper for `GET /api/metrics/epistemic`
    - Auto-refresh interval: 30 seconds
    - Return typed EpistemicMetrics

- [ ] **9.1.7** Add EpistemicStackCard to dashboard page
  - **File**: `frontend/app/page.tsx`
  - **Priority**: High | **Effort**: S
  - **Dependencies**: 9.1.5
  - **Details**:
    - Place prominently at top of dashboard
    - Full-width card above existing atom counts
    - Responsive: stack vertically on mobile

---

## 9.2 Coupling Health Dashboard

### Context

The coupling metrics backend (Phase 8.2) provides atom→test, test→atom, and code→atom rates. This section creates the UI to visualize these metrics and make orphans actionable.

### Tasks

- [ ] **9.2.1** Create `CouplingHealthCard` component
  - **File**: `frontend/components/dashboard/CouplingHealthCard.tsx`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: Phase 8.2 complete
  - **Details**:
    - Three horizontal progress bars:
      - Atom → Test Coupling (e.g., "78% of atoms have linked tests")
      - Test → Atom Coupling (e.g., "85% of tests reference atoms")
      - Code → Atom Coverage (e.g., "45% of source files have atom coverage")
    - Color coding: <60% red, 60-79% yellow, >=80% green
    - Summary line: "Orphan Atoms: 12 | Orphan Tests: 41 | Uncovered: 156"
    - Click on any metric opens orphan detail drawer

- [ ] **9.2.2** Create `useCouplingMetrics` hook
  - **File**: `frontend/hooks/metrics/use-coupling-metrics.ts`
  - **Priority**: High | **Effort**: S
  - **Dependencies**: Phase 8.2
  - **Details**:
    - React Query wrapper for `GET /api/metrics/coupling`
    - Typed response matching CouplingMetrics interface
    - Stale time: 60 seconds

- [ ] **9.2.3** Create `OrphansList` drawer component
  - **File**: `frontend/components/dashboard/OrphansList.tsx`
  - **Priority**: Medium | **Effort**: M
  - **Dependencies**: 9.2.1
  - **Details**:
    - Slide-out drawer (shadcn/ui Sheet component)
    - Three tabs: "Orphan Atoms" | "Orphan Tests" | "Uncovered Code"
    - Each tab shows list with:
      - Item name/path
      - Created date
      - Quick action buttons (e.g., "Create Atom" for orphan tests, "Run Reconciliation" for uncovered code)
    - Pagination for large lists

- [ ] **9.2.4** Add CouplingHealthCard to dashboard page
  - **File**: `frontend/app/page.tsx`
  - **Priority**: High | **Effort**: S
  - **Dependencies**: 9.2.1
  - **Details**:
    - Place below EpistemicStackCard
    - Full-width card
    - Include OrphansList drawer trigger

---

## 9.3 Conflict Dashboard

### Context

Phase 8.1 creates the ConflictRecord entity and detection service. This section creates the UI for viewing and resolving conflicts. Per [analysis-git-for-intent.md](analysis-git-for-intent.md) Section 4.4, conflicts are organizational diagnostics — not just bugs to fix.

### Tasks

- [ ] **9.3.1** Create `useConflicts` hook
  - **File**: `frontend/hooks/conflicts/use-conflicts.ts`
  - **Priority**: High | **Effort**: S
  - **Dependencies**: Phase 8.1
  - **Details**:
    - React Query wrapper for `GET /api/conflicts`
    - Support filters: status, type, atomId
    - Mutation hooks for resolve and escalate

- [ ] **9.3.2** Create `ConflictsList` component
  - **File**: `frontend/components/conflicts/ConflictsList.tsx`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 9.3.1
  - **Details**:
    - Table/list view of conflicts
    - Columns: Type (badge), Atoms Involved, Description, Status, Created
    - Filters: by type (same_test, semantic_overlap, etc.), by status
    - Sort by: created date (default newest), status
    - Empty state: "No conflicts detected" with positive messaging

- [ ] **9.3.3** Create `ConflictDetailPanel` component
  - **File**: `frontend/components/conflicts/ConflictDetailPanel.tsx`
  - **Priority**: Medium | **Effort**: M
  - **Dependencies**: 9.3.2
  - **Details**:
    - Side panel or dialog showing full conflict details
    - Atom A details (description, status, quality score)
    - Atom B details (same)
    - If same-test: show test file path and content
    - If semantic overlap: show similarity score
    - LLM reasoning (if available)
    - Resolution actions:
      - "Supersede A" / "Supersede B" (for overlaps)
      - "Split Test" (for same-test conflicts)
      - "Reject A" / "Reject B" (for contradictions)
      - "Clarify" (create clarification artifact)
      - "Escalate" (mark for product owner review)
    - Resolution reason text field

- [ ] **9.3.4** Create `useResolveConflict` mutation hook
  - **File**: `frontend/hooks/conflicts/use-resolve-conflict.ts`
  - **Priority**: Medium | **Effort**: S
  - **Dependencies**: 9.3.1
  - **Details**:
    - Mutation for `PATCH /api/conflicts/:id/resolve`
    - Optimistic update: mark conflict as resolved in cache
    - Invalidate conflicts list query on success

- [ ] **9.3.5** Create conflicts page
  - **File**: `frontend/app/conflicts/page.tsx`
  - **Priority**: Medium | **Effort**: S
  - **Dependencies**: 9.3.2, 9.3.3
  - **Details**:
    - Page layout: ConflictsList (main) + ConflictDetailPanel (side)
    - Header with conflict count and filter controls
    - Navigation: accessible from sidebar

- [ ] **9.3.6** Add conflict badge to header/nav
  - **File**: `frontend/components/layout/Header.tsx`
  - **Priority**: Low | **Effort**: S
  - **Dependencies**: 9.3.1
  - **Details**:
    - Small badge showing open conflict count
    - Red dot if any conflicts are type `contradiction`
    - Click navigates to conflicts page
    - Badge hidden when count is 0

- [ ] **9.3.7** Add conflicts link to sidebar
  - **File**: `frontend/components/layout/Sidebar.tsx`
  - **Priority**: Low | **Effort**: S
  - **Dependencies**: 9.3.5
  - **Details**:
    - Add "Conflicts" item to sidebar navigation
    - Show count badge next to label
    - Icon: warning triangle or similar

---

## Phase 9 Completion Criteria

| Criterion | Validation |
|-----------|------------|
| Epistemic stack shows 4 levels on dashboard | Visual inspection of dashboard |
| PROVEN/COMMITTED/INFERRED/UNKNOWN counts are accurate | Compare to manual database query |
| totalCertainty percentage matches (proven+committed)/total | Manual calculation verification |
| Coupling health bars show correct rates | Compare to `/api/metrics/coupling` response |
| Orphan drawer opens and shows correct items | Click through, verify items |
| Conflicts page loads and shows conflicts | Create test conflict, verify display |
| Conflict resolution workflow works | Resolve a conflict, verify status change |
| Conflict badge in header updates | Create/resolve conflict, check badge |

---

## File Inventory

### New Files

| File | Task | Purpose |
|------|------|---------|
| `src/modules/metrics/epistemic-metrics.service.ts` | 9.1.1 | Epistemic calculations |
| `src/modules/metrics/dto/epistemic-metrics.dto.ts` | 9.1.2 | DTOs |
| `src/modules/metrics/epistemic-metrics.service.spec.ts` | 9.1.4 | Tests |
| `frontend/components/dashboard/EpistemicStackCard.tsx` | 9.1.5 | Epistemic UI |
| `frontend/hooks/metrics/use-epistemic-metrics.ts` | 9.1.6 | Hook |
| `frontend/components/dashboard/CouplingHealthCard.tsx` | 9.2.1 | Coupling UI |
| `frontend/hooks/metrics/use-coupling-metrics.ts` | 9.2.2 | Hook |
| `frontend/components/dashboard/OrphansList.tsx` | 9.2.3 | Orphan detail |
| `frontend/components/conflicts/ConflictsList.tsx` | 9.3.2 | Conflict list |
| `frontend/components/conflicts/ConflictDetailPanel.tsx` | 9.3.3 | Conflict detail |
| `frontend/hooks/conflicts/use-conflicts.ts` | 9.3.1 | Hook |
| `frontend/hooks/conflicts/use-resolve-conflict.ts` | 9.3.4 | Mutation hook |
| `frontend/app/conflicts/page.tsx` | 9.3.5 | Page |

### Modified Files

| File | Task | Changes |
|------|------|---------|
| `src/modules/metrics/metrics.controller.ts` | 9.1.3 | Add epistemic endpoint |
| `src/modules/metrics/metrics.module.ts` | 9.1.1 | Register EpistemicMetricsService |
| `frontend/app/page.tsx` | 9.1.7, 9.2.4 | Add dashboard cards |
| `frontend/components/layout/Header.tsx` | 9.3.6 | Add conflict badge |
| `frontend/components/layout/Sidebar.tsx` | 9.3.7 | Add conflicts nav item |

---

*Phase 9 is prerequisite for Phase 10 (External Access) and can run in parallel with Phase 11 (Conversation).*
