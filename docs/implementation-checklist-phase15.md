# Implementation Checklist: Phase 15 — Pact Main Governance Model

## Document Metadata

| Field | Value |
|-------|-------|
| **Phase** | 15 |
| **Focus** | Introduce "Pact Main" — a governed subset of atoms promoted through change set governance |
| **Status** | Not Started |
| **Prerequisites** | Phase 14 (Test Quality & Coverage as Epistemic Intelligence) |
| **Related Docs** | [implementation-checklist-phase13.md](implementation-checklist-phase13.md), [ux.md](ux.md), [schema.md](schema.md) |

---

## Overview

Phase 15 introduces the concept of **Pact Main** — the authoritative intent surface. Pact Main is the set of atoms that have been formally promoted through governed change sets. The key behavioral shift: atoms created by reconciliation enter a `proposed` status (within a change set) rather than being directly available as `draft`. The `?scope=main` query parameter filters API responses to show only promoted atoms.

**Conceptual model:**

```
Current:  draft ──(commit)──> committed ──(supersede)──> superseded

Phase 15: proposed ──(change set approval)──> draft ──(commit)──> committed ──(supersede)──> superseded
                                                                       │
                                                               promotedToMainAt set
```

"Pact Main" = all atoms where `promotedToMainAt IS NOT NULL`.

**Key principles:**

1. **Backward compatible** — existing committed atoms are grandfathered as "on Main" via data migration
2. **Governance is additive** — the direct commit path still works; governance is opt-in via change sets
3. **Scope filtering is read-only** — `?scope=main` is a filter, not a separate data store
4. **Proposed atoms are mutable** — same rules as draft (can update, delete) until change set is committed

**Existing infrastructure leveraged:**

- `ChangeSetStatus`: draft → review → approved → committed → rejected (already implemented)
- `ChangeSetMetadata` on molecules with `lensType: 'change_set'` (already implemented)
- Multi-user approval workflow with `ChangeSetApproval[]` (already implemented)
- `intentIdentity` + `intentVersion` for atom versioning chain (already implemented)

---

## 15A: Schema Changes and Data Migration

### Context

Add `proposed` to the atom state machine, add `promotedToMainAt` timestamp, and backfill existing committed atoms as "on Main."

### Tasks

- [ ] **15A.1** Extend AtomStatus type with `proposed`
  - **File**: `src/modules/atoms/atom.entity.ts`
  - **Priority**: High | **Effort**: S
  - **Details**:
    - Change `AtomStatus` from `'draft' | 'committed' | 'superseded'` to `'proposed' | 'draft' | 'committed' | 'superseded'`
    - Add column `promotedToMainAt` (timestamp, nullable)
    - Add column `changeSetId` (uuid, nullable, FK to `molecules.id`)

- [ ] **15A.2** Create database migration
  - **File**: `src/migrations/XXXXXXXXXX-AddPactMainGovernance.ts`
  - **Priority**: High | **Effort**: M
  - **Details**:
    - Add `promotedToMainAt` timestamp column (nullable) to `atoms`
    - Add `changeSetId` uuid column (nullable) to `atoms` with FK to `molecules.id`
    - **Backfill**: `UPDATE atoms SET promotedToMainAt = committedAt WHERE status = 'committed'`
    - Add partial index: `CREATE INDEX idx_atoms_promoted ON atoms (promotedToMainAt) WHERE promotedToMainAt IS NOT NULL`
    - Add partial index: `CREATE INDEX idx_atoms_change_set ON atoms (changeSetId) WHERE changeSetId IS NOT NULL`

- [ ] **15A.3** Extend ChangeSetMetadata
  - **File**: `src/modules/molecules/change-set.types.ts`
  - **Priority**: Medium | **Effort**: S
  - **Details**:
    - Add `source?: 'manual' | 'reconciliation' | 'import'`
    - Add `reconciliationRunId?: string`
    - Add `autoPromote?: boolean`
    - Add `promotedAtomIds?: string[]`

- [ ] **15A.4** Update search DTO enums
  - **File**: `src/modules/atoms/dto/atom-search.dto.ts`
  - **Priority**: Medium | **Effort**: S
  - **Details**:
    - Add `proposed` to status enum validation
    - Add `scope` field: `'all' | 'main' | 'proposed'` (default: `'all'`)

### Verification

- [ ] Migration applies and rolls back cleanly
- [ ] All existing committed atoms have `promotedToMainAt = committedAt` after migration
- [ ] `proposed` is accepted as a valid atom status
- [ ] Existing tests pass with no regressions

---

## 15B: Service Layer — Atom Lifecycle and Scope Filtering

### Context

Add governance-aware methods to AtomsService and scope filtering to the repository.

### Tasks

- [ ] **15B.1** Add `propose()` method to AtomsService
  - **File**: `src/modules/atoms/atoms.service.ts`
  - **Priority**: High | **Effort**: M
  - **Details**:
    - Signature: `async propose(createAtomDto: CreateAtomDto, changeSetId: string): Promise<Atom>`
    - Creates atom with `status: 'proposed'` and `changeSetId` set
    - Auto-generates `atomId` (IA-XXX) and `intentIdentity` as with `create()`
    - Emits `atom:proposed` event via gateway

- [ ] **15B.2** Modify `update()` and `remove()` to allow proposed atoms
  - **File**: `src/modules/atoms/atoms.service.ts`
  - **Priority**: High | **Effort**: S
  - **Details**:
    - Change guard from `atom.status !== 'draft'` to `atom.status !== 'draft' && atom.status !== 'proposed'`
    - Proposed atoms are mutable, same as draft

- [ ] **15B.3** Modify `commit()` to set `promotedToMainAt`
  - **File**: `src/modules/atoms/atoms.service.ts`
  - **Priority**: High | **Effort**: S
  - **Details**:
    - After setting `status = 'committed'` and `committedAt`, also set `promotedToMainAt = new Date()`
    - Reject proposed atoms: proposed atoms must go through change set commit, not individual commit
    - Throw `BadRequestException('Proposed atoms must be committed through their change set')`

- [ ] **15B.4** Add `convertToDraft()` method
  - **File**: `src/modules/atoms/atoms.service.ts`
  - **Priority**: Medium | **Effort**: S
  - **Details**:
    - Signature: `async convertToDraft(id: string): Promise<Atom>`
    - Only works on `proposed` atoms — escape hatch to remove from governance
    - Sets `status = 'draft'`, clears `changeSetId`

- [ ] **15B.5** Add scope filtering to repository search
  - **File**: `src/modules/atoms/atoms.service.ts` (or `atoms.repository.ts` if exists)
  - **Priority**: High | **Effort**: M
  - **Details**:
    - In `findAll()` / `applyFilters()`, add:
      - `scope === 'main'` → `WHERE promotedToMainAt IS NOT NULL`
      - `scope === 'proposed'` → `WHERE status = 'proposed'`
      - `scope === 'all'` or undefined → no additional filter (backward-compatible default)
    - Update `getStatistics()` to include `proposed` in status breakdown

- [ ] **15B.6** Modify `commitChangeSet()` to handle proposed atoms
  - **File**: `src/modules/molecules/molecules.service.ts`
  - **Priority**: High | **Effort**: M
  - **Details**:
    - Get atoms — filter for both `draft` and `proposed` statuses
    - Quality gate check on all uncommitted atoms (existing behavior)
    - For each uncommitted atom: set `status = 'committed'`, `committedAt`, `promotedToMainAt`
    - Update `changeSetMetadata.promotedAtomIds` with committed atom IDs

### Verification

- [ ] `?scope=main` returns only atoms where `promotedToMainAt IS NOT NULL`
- [ ] `?scope=all` returns all atoms (backward-compatible default)
- [ ] Proposed atoms can be updated and deleted like drafts
- [ ] Proposed atoms cannot be individually committed (must go through change set)
- [ ] `convertToDraft()` removes atom from governance
- [ ] Change set commit handles both draft and proposed atoms, sets `promotedToMainAt`
- [ ] Statistics include `proposed` count

---

## 15C: API Endpoints and Controller Changes

### Context

Expose scope filtering and governance endpoints via REST API.

### Tasks

- [ ] **15C.1** Add Swagger `scope` query parameter documentation
  - **File**: `src/modules/atoms/atoms.controller.ts`
  - **Priority**: Medium | **Effort**: S
  - **Details**:
    - Add `@ApiQuery({ name: 'scope', required: false, enum: ['all', 'main', 'proposed'] })` to `findAll()`

- [ ] **15C.2** Add `POST /atoms/propose` endpoint
  - **File**: `src/modules/atoms/atoms.controller.ts`
  - **Priority**: Medium | **Effort**: S
  - **Details**:
    - Accepts `CreateAtomDto` extended with `changeSetId: string`
    - Calls `atomsService.propose()`

- [ ] **15C.3** Add `PATCH /atoms/:id/convert-to-draft` endpoint
  - **File**: `src/modules/atoms/atoms.controller.ts`
  - **Priority**: Medium | **Effort**: S
  - **Details**:
    - Calls `atomsService.convertToDraft(id)`

- [ ] **15C.4** Extend change set creation with source metadata
  - **File**: `src/modules/molecules/molecules.controller.ts`
  - **Priority**: Low | **Effort**: S
  - **Details**:
    - Accept optional `source` and `reconciliationRunId` in `POST /change-sets`

### Verification

- [ ] `GET /atoms?scope=main` returns only promoted atoms
- [ ] `GET /atoms` (no scope) returns all atoms (backward-compatible)
- [ ] `POST /atoms/propose` creates atom with `proposed` status
- [ ] `PATCH /atoms/:id/convert-to-draft` transitions proposed → draft
- [ ] Swagger docs reflect all new parameters and endpoints

---

## 15D: Reconciliation Integration

### Context

Enable reconciliation results to flow through governed change sets instead of direct application.

### Tasks

- [ ] **15D.1** Add `createChangeSetFromRun()` to ApplyService
  - **File**: `src/modules/agents/apply.service.ts`
  - **Priority**: High | **Effort**: L
  - **Dependencies**: 15A, 15B
  - **Details**:
    - Signature: `async createChangeSetFromRun(runId, options): Promise<{ changeSetId, atomCount, moleculeId }>`
    - Find run and its recommendations
    - Create change set molecule with `source: 'reconciliation'`, `reconciliationRunId`
    - For each selected atom recommendation: create atom with `status: 'proposed'` and `changeSetId`
    - Add atoms to change set molecule
    - Update recommendation's `atomId` and `status`
    - Create molecule recommendations as normal
    - All within a transaction (same atomicity pattern as `applyPatch()`)

- [ ] **15D.2** Add `POST /agents/reconciliation/runs/:runId/create-change-set` endpoint
  - **File**: `src/modules/agents/reconciliation.controller.ts`
  - **Priority**: High | **Effort**: S
  - **Dependencies**: 15D.1
  - **Details**:
    - Accepts `{ selections?: string[]; name?: string; description?: string }`
    - Returns `{ changeSetId, atomCount }`

- [ ] **15D.3** Add "Create Change Set" action to ReconciliationWizard
  - **File**: `frontend/components/agents/ReconciliationWizard.tsx`
  - **Priority**: Medium | **Effort**: M
  - **Dependencies**: 15D.2
  - **Details**:
    - Add button alongside existing "Apply" on review/results screen
    - "Apply Directly" → existing behavior (atoms as `draft`)
    - "Create Change Set" → governed path (atoms as `proposed`)

- [ ] **15D.4** Add frontend API method and hook
  - **Files**: `frontend/lib/api/reconciliation.ts`, `frontend/hooks/reconciliation/use-reconciliation.ts`
  - **Priority**: Medium | **Effort**: S
  - **Dependencies**: 15D.2
  - **Details**:
    - API: `reconciliationApi.createChangeSet(runId, body)`
    - Hook: `useCreateChangeSetFromRun()` mutation with cache invalidation

### Verification

- [ ] Reconciliation recommendations can be routed into a governed change set
- [ ] Proposed atoms are created with `status: 'proposed'` and `changeSetId`
- [ ] Change set commit batch-commits proposed atoms and sets `promotedToMainAt`
- [ ] Direct apply path still works without governance
- [ ] Frontend offers both "Apply" and "Create Change Set" options
- [ ] Full flow: reconciliation → create change set → submit → approve → commit → atoms on Main

---

## 15E: Guards, Invariants, and Edge Cases

### Context

Ensure the governance model is properly guarded and edge cases are handled.

### Tasks

- [ ] **15E.1** Update CommittedAtomGuard for proposed status
  - **File**: `src/common/guards/committed-atom.guard.ts`
  - **Priority**: Medium | **Effort**: S
  - **Details**:
    - Proposed atoms should be treated like draft for update/delete purposes

- [ ] **15E.2** Add WebSocket events for governance lifecycle
  - **File**: `src/gateways/atoms.gateway.ts`
  - **Priority**: Low | **Effort**: S
  - **Details**:
    - `atom:proposed` — when atom enters proposed status
    - `atom:promotedToMain` — when atom is promoted to Main

- [ ] **15E.3** Handle deletion of proposed atoms
  - **File**: `src/modules/atoms/atoms.service.ts`
  - **Priority**: Medium | **Effort**: S
  - **Details**:
    - When deleting a proposed atom, also remove it from the change set molecule (remove MoleculeAtom junction record)

### Verification

- [ ] Guard correctly allows mutation of proposed atoms
- [ ] WebSocket events fire for propose and promote actions
- [ ] Deleting a proposed atom cleans up change set membership

---

## 15F: Frontend Scope Filter UI

### Context

Let users filter atoms by scope (All, Main, Proposed) in the UI.

### Tasks

- [ ] **15F.1** Add scope toggle to atoms page
  - **File**: `frontend/app/atoms/page.tsx` (or atoms list component)
  - **Priority**: Medium | **Effort**: M
  - **Details**:
    - Scope toggle/dropdown: All Atoms | Main | Proposed
    - Persist selection in URL params via `nuqs`

- [ ] **15F.2** Update `useAtoms` hook with scope parameter
  - **File**: `frontend/hooks/atoms/use-atoms.ts`
  - **Priority**: Medium | **Effort**: S
  - **Details**:
    - Add `scope?: 'all' | 'main' | 'proposed'` to `AtomFilters`

- [ ] **15F.3** Add proposed status badge styling
  - **Priority**: Low | **Effort**: S
  - **Details**:
    - Amber/orange color to distinguish from draft (grey) and committed (green)

### Verification

- [ ] Users can filter atoms by scope in the UI
- [ ] "Main" view shows only promoted atoms
- [ ] "Proposed" view shows only atoms pending governance
- [ ] Proposed atoms have a visually distinct status badge

---

## Files Inventory

### New Files

| File | Purpose |
|------|---------|
| `src/migrations/XXXXXXXXXX-AddPactMainGovernance.ts` | Migration for new columns + backfill |

### Modified Files

| File | Changes |
|------|---------|
| `src/modules/atoms/atom.entity.ts` | Add `proposed` status, `promotedToMainAt`, `changeSetId` |
| `src/modules/atoms/atoms.service.ts` | Add `propose()`, `convertToDraft()`; modify `commit()`, `update()`, `remove()` |
| `src/modules/atoms/atoms.controller.ts` | Add propose, convert-to-draft endpoints; scope query docs |
| `src/modules/atoms/dto/atom-search.dto.ts` | Add `scope` field |
| `src/modules/molecules/change-set.types.ts` | Add source, reconciliationRunId, promotedAtomIds |
| `src/modules/molecules/molecules.service.ts` | Modify `commitChangeSet()` for proposed atoms |
| `src/modules/molecules/molecules.controller.ts` | Extend change set creation |
| `src/modules/agents/apply.service.ts` | Add `createChangeSetFromRun()` |
| `src/modules/agents/reconciliation.controller.ts` | Add create-change-set endpoint |
| `src/common/guards/committed-atom.guard.ts` | Handle proposed status |
| `src/gateways/atoms.gateway.ts` | Add governance events |
| `frontend/components/agents/ReconciliationWizard.tsx` | Add "Create Change Set" action |
| `frontend/hooks/atoms/use-atoms.ts` | Add scope to filters |
| `frontend/hooks/reconciliation/use-reconciliation.ts` | Add change set mutation |
| `frontend/lib/api/reconciliation.ts` | Add createChangeSet method |
| `frontend/app/atoms/page.tsx` | Add scope toggle |

### Test Files

| File | Purpose |
|------|---------|
| `src/modules/atoms/atoms.service.spec.ts` | Tests for propose, convertToDraft, updated commit |
| `src/modules/atoms/atoms.controller.spec.ts` | Tests for new endpoints and scope query |
| `src/modules/molecules/molecules.service.spec.ts` | Tests for commitChangeSet with proposed atoms |
| `src/modules/agents/apply.service.spec.ts` | Tests for createChangeSetFromRun |
| `test/governance.e2e-spec.ts` | E2E: full governance flow from reconciliation through Main |

---

## Implementation Order

```
15A (Schema) → 15B (Service) → 15C (API) → 15D (Reconciliation) → 15E (Guards) → 15F (Frontend)
```

15A must complete first (all sub-phases depend on schema changes). 15B and 15C can overlap. 15D depends on 15B+15C. 15E can begin after 15B. 15F depends on 15C.
