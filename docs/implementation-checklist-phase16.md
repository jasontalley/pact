# Implementation Checklist: Phase 16 — Drift Management

## Document Metadata

| Field | Value |
|-------|-------|
| **Phase** | 16 |
| **Focus** | Make drift between Pact Main and implementation reality visible, time-bounded, and actionable |
| **Status** | Not Started |
| **Prerequisites** | Phase 15 (Pact Main Governance Model) |
| **Related Docs** | [implementation-checklist-phase15.md](implementation-checklist-phase15.md), [ux.md](ux.md) |

---

## Overview

Phase 16 introduces **Drift Management** — the system for tracking the gap between committed intent (Pact Main) and implementation reality. Drift is not a failure state; it is an expected consequence of development velocity. The goal is to ensure drift is always **visible** and always **converging**.

**Core concepts:**

- **Drift Debt**: A tracked gap between Pact Main and the codebase. Four types:
  - `orphan_test` — test without `@atom` link
  - `commitment_backlog` — committed atom without passing test evidence
  - `stale_coupling` — test changed but atom link may be stale
  - `uncovered_code` — source file without any atom coverage
- **Exception Lanes**: Reconciliation runs labeled `normal`, `hotfix-exception`, or `spike-exception` with justification
- **CI Attestation**: Reconciliation runs marked as `local` (advisory) or `ci-attested` (canonical)
- **Time-Bounded Convergence**: Configurable policies requiring drift to be addressed within N days

**How drift is detected:** During reconciliation, the persist node has a complete picture of orphan tests, commitment gaps, and stale links. After persistence, the DriftDetectionService creates or updates DriftDebt entries.

---

## 16A: Drift Debt Entity and Core Service

### Context

Create the `drift_debt` table and the service that detects and manages drift items after reconciliation.

### Tasks

- [ ] **16A.1** Create DriftDebt entity
  - **File**: `src/modules/drift/entities/drift-debt.entity.ts`
  - **Priority**: High | **Effort**: L
  - **Details**:
    - `id` (UUID PK)
    - `driftType` (varchar 30): `orphan_test | commitment_backlog | stale_coupling | uncovered_code`
    - `description` (text): human-readable summary
    - `status` (varchar 20, default `open`): `open | acknowledged | resolved | waived`
    - `severity` (varchar 10, default `medium`): `critical | high | medium | low`
    - Source references: `filePath`, `testName`, `atomId`, `atomDisplayId` (all nullable)
    - Run references: `detectedByRunId`, `lastConfirmedByRunId` (UUIDs)
    - `projectId` (UUID, nullable)
    - Timing: `detectedAt`, `lastConfirmedAt`, `resolvedAt`, `resolvedByRunId`, `dueAt`
    - Exception: `exceptionLane`, `exceptionJustification` (nullable)
    - Aging: `ageDays` (int), `confirmationCount` (int, default 1)
    - `metadata` (JSONB)
    - Indexes: `(projectId, status)`, `(driftType, status)`, `(dueAt)`, `(filePath, testName, driftType)` for dedup
  - Also define types in same file or separate `drift.types.ts`:
    - `DriftType`, `DriftDebtStatus`, `DriftDebtSeverity`, `ExceptionLane`

- [ ] **16A.2** Create database migration
  - **File**: `src/migrations/XXXXXXXXXX-CreateDriftDebt.ts`
  - **Priority**: High | **Effort**: M
  - **Details**:
    - Create `drift_debt` table with all columns from 16A.1
    - Create indexes for filtering and deduplication

- [ ] **16A.3** Create DriftDebt repository
  - **File**: `src/modules/drift/repositories/drift-debt.repository.ts`
  - **Priority**: High | **Effort**: M
  - **Details**:
    - `createDriftDebt(params)` — create new drift item
    - `findByFilePath(filePath, testName, driftType)` — for deduplication
    - `findByAtomId(atomId, driftType)` — for commitment backlog lookup
    - `updateConfirmation(id, runId)` — update lastConfirmedAt, increment confirmationCount
    - `resolveDrift(id, runId)` — mark resolved with timestamp
    - `bulkResolveDrift(ids, runId)` — batch resolve
    - `listOpenDrift(filters)` — paginated listing by project/type/severity
    - `getAgingSummary(projectId?)` — aggregate counts by age buckets (0-3d, 3-7d, 7-14d, 14+d)
    - `getOverdueDrift(projectId?)` — items past `dueAt`

- [ ] **16A.4** Create DriftDetectionService
  - **File**: `src/modules/drift/drift-detection.service.ts`
  - **Priority**: High | **Effort**: L
  - **Details**:
    - `detectDriftFromRun(runId)` — main entry point; returns `DriftDetectionResult`
    - `detectOrphanTestDrift(runUuid, orphanTests)` — create/update drift for each orphan test; dedup by `(filePath, testName, 'orphan_test')`
    - `detectCommitmentBacklog()` — query committed atoms without accepted test linkage; reuse logic from `CouplingMetricsService.getAtomTestCoupling()`
    - `detectStaleCoupling(changedAtomLinkedTests)` — for delta-mode tests that changed but have existing @atom links
    - `resolveMatchedDrift(runUuid)` — check if previously-open drift items are now resolved (test gained annotation, atom gained test)
    - `applyConvergencePolicies(projectId?)` — compute `dueAt` and update severity based on aging
    - Returns `DriftDetectionResult { newDriftCount, confirmedDriftCount, resolvedDriftCount, totalOpenDrift, byType, overdueDrift }`

- [ ] **16A.5** Integrate with reconciliation persist node
  - **File**: `src/modules/agents/graphs/nodes/reconciliation/persist.node.ts`
  - **Priority**: High | **Effort**: S
  - **Dependencies**: 16A.4
  - **Details**:
    - After run is persisted, optionally call `driftDetectionService.detectDriftFromRun(runId)`
    - Use optional dependency pattern (same as other optional services in persist node)
    - Store `DriftDetectionResult` in run summary or as separate metadata

- [ ] **16A.6** Create DriftModule
  - **File**: `src/modules/drift/drift.module.ts`
  - **Priority**: High | **Effort**: S
  - **Details**:
    - Import `TypeOrmModule.forFeature([DriftDebt])`
    - Import `AgentsModule` (forwardRef) for reconciliation data
    - Import `MetricsModule` for coupling/epistemic data
    - Providers: `DriftDetectionService`, `DriftDebtRepository`, `DriftPolicyService`, `DriftMetricsService`
    - Exports: `DriftDetectionService`, `DriftDebtRepository`, `DriftMetricsService`
  - Register in `src/app.module.ts`

### Verification

- [ ] DriftDebt entity migrates cleanly
- [ ] Detection identifies all four drift types from reconciliation run data
- [ ] Deduplication prevents duplicate entries for same `(filePath, testName, driftType)`
- [ ] Resolution correctly marks drift items resolved when tests gain annotations or atoms gain tests
- [ ] Age computation is accurate

---

## 16B: Exception Lanes and CI Attestation

### Context

Extend ReconciliationRun to support exception lanes and CI attestation. Add convergence policies to project settings.

### Tasks

- [ ] **16B.1** Extend ReconciliationRun entity
  - **File**: `src/modules/agents/entities/reconciliation-run.entity.ts`
  - **Priority**: High | **Effort**: S
  - **Details**:
    - Add `exceptionLane` (varchar 30, default `'normal'`): `'normal' | 'hotfix-exception' | 'spike-exception'`
    - Add `attestationType` (varchar 20, default `'local'`): `'local' | 'ci-attested'`
    - Add `exceptionJustification` (text, nullable)

- [ ] **16B.2** Create migration for ReconciliationRun extension
  - **File**: `src/migrations/XXXXXXXXXX-AddExceptionAndAttestation.ts`
  - **Priority**: High | **Effort**: S

- [ ] **16B.3** Extend ReconciliationOptions and DTOs
  - **Files**: `src/modules/agents/graphs/types/reconciliation-state.ts`, `src/modules/agents/reconciliation.controller.ts`
  - **Priority**: High | **Effort**: S
  - **Details**:
    - Add `exceptionLane`, `attestationType`, `exceptionJustification` to `ReconciliationOptions`
    - Add to `StartAnalysisDto` / `ReconciliationOptionsDto` in controller
    - Pass through in `reconciliation.service.ts`

- [ ] **16B.4** Extend ProjectSettings with convergence policies
  - **File**: `src/modules/projects/project.entity.ts`
  - **Priority**: Medium | **Effort**: S
  - **Details**:
    - Add to `ProjectSettings` interface:
      ```typescript
      driftPolicies?: {
        normalConvergenceDays?: number;      // default: 14
        hotfixConvergenceDays?: number;      // default: 3
        spikeConvergenceDays?: number;       // default: 7
        highSeverityDays?: number;           // default: 7
        criticalSeverityDays?: number;       // default: 14
        blockOnOverdueDrift?: boolean;       // default: false
      }
      ```

- [ ] **16B.5** Create DriftPolicyService
  - **File**: `src/modules/drift/drift-policy.service.ts`
  - **Priority**: Medium | **Effort**: M
  - **Details**:
    - `computeDeadline(driftItem, projectSettings)` — calculate `dueAt` based on type, exception lane, and policy
    - `computeSeverity(driftItem, projectSettings)` — severity from age + thresholds
    - `getConvergencePolicy(projectId?)` — load project settings, return effective policy with defaults
    - `evaluateConvergence(projectId?)` — check all open drift against deadlines, return violation report
    - `isBlocking(projectId?)` — true if overdue drift exists and `blockOnOverdueDrift` is true

### Verification

- [ ] ReconciliationRun entity gains exceptionLane, attestationType, exceptionJustification
- [ ] API accepts exception lane and attestation in start/analyze requests
- [ ] Convergence deadlines computed correctly per lane (normal: 14d, hotfix: 3d, spike: 7d)
- [ ] Severity auto-escalates: medium at 0d, high at 7d, critical at 14d
- [ ] Custom project policies override defaults
- [ ] ProjectSettings backward compatible (existing projects unaffected)

---

## 16C: API Endpoints and Drift Metrics

### Context

Expose drift data through REST APIs and integrate with the metrics system.

### Tasks

- [ ] **16C.1** Create DriftController
  - **File**: `src/modules/drift/drift.controller.ts`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 16A
  - **Details**:
    - `GET /drift` — list open drift items (paginated, filterable by projectId, driftType, status, severity)
    - `GET /drift/summary` — aggregate: counts by type, severity, overdue total
    - `GET /drift/:id` — single drift item details
    - `PATCH /drift/:id/acknowledge` — mark as acknowledged (optional comment)
    - `PATCH /drift/:id/waive` — waive with justification (required)
    - `PATCH /drift/:id/resolve` — manually resolve
    - `GET /drift/overdue` — list overdue items (past `dueAt`)
    - `GET /drift/aging` — aging distribution: 0-3d, 3-7d, 7-14d, 14+d
    - `GET /drift/convergence` — convergence report (on-track vs overdue counts)
    - `POST /drift/detect/:runId` — manually trigger drift detection for a run

- [ ] **16C.2** Create drift DTOs
  - **File**: `src/modules/drift/dto/drift.dto.ts`
  - **Priority**: High | **Effort**: M
  - **Details**:
    - `ListDriftDto` — query params: projectId?, driftType?, status?, severity?, limit, offset
    - `DriftSummaryResponse` — aggregated counts
    - `AcknowledgeDriftDto` — optional comment
    - `WaiveDriftDto` — requires justification
    - `DriftAgingResponse` — buckets with counts
    - `ConvergenceReportResponse` — on-track, at-risk, overdue counts

- [ ] **16C.3** Create DriftMetricsService
  - **File**: `src/modules/drift/drift-metrics.service.ts`
  - **Priority**: Medium | **Effort**: M
  - **Details**:
    - `getCommitmentBacklog()` — count/list of committed atoms without test evidence
    - `getDriftDebtSummary()` — total open drift by type, severity
    - `getConvergenceScore()` — percentage of drift items on-track (0-100)
    - `getDriftTrend(period)` — time series of drift counts (new, resolved, net)

- [ ] **16C.4** Extend MetricsSnapshot with drift data
  - **File**: `src/modules/metrics/metrics-history.service.ts`
  - **Priority**: Medium | **Effort**: S
  - **Dependencies**: 16C.3
  - **Details**:
    - In `recordSnapshot()`, include drift summary in `additionalMetrics`:
      ```typescript
      additionalMetrics.drift = {
        totalOpen, byType, bySeverity, overdueCount, convergenceScore
      }
      ```

- [ ] **16C.5** Extend metrics API
  - **File**: `src/modules/metrics/metrics.controller.ts`
  - **Priority**: Low | **Effort**: S
  - **Details**:
    - `GET /metrics/drift` — current drift metrics summary
    - `GET /metrics/drift/trend` — drift trend over time

- [ ] **16C.6** Create frontend API client
  - **File**: `frontend/lib/api/drift.ts`
  - **Priority**: Medium | **Effort**: S
  - **Details**:
    - `driftApi.list(params?)`, `getSummary()`, `getItem(id)`, `acknowledge(id, comment?)`, `waive(id, justification)`, `resolve(id)`, `getOverdue()`, `getAging()`, `getConvergence()`

- [ ] **16C.7** Create frontend hooks
  - **File**: `frontend/hooks/drift/use-drift.ts`
  - **Priority**: Medium | **Effort**: M
  - **Details**:
    - Query hooks: `useDriftSummary()`, `useDriftList(filters?)`, `useDriftAging()`, `useDriftConvergence()`
    - Mutation hooks: `useAcknowledgeDrift()`, `useWaiveDrift()`, `useResolveDrift()`
    - Query keys: `driftKeys.all`, `.list()`, `.summary()`, `.item(id)`, `.overdue()`, `.aging()`, `.convergence()`

### Verification

- [ ] All API endpoints return correct data shapes
- [ ] Pagination and filtering work across list endpoints
- [ ] Waive requires justification (validation fails without it)
- [ ] Drift metrics recorded in daily MetricsSnapshot
- [ ] Frontend API client and hooks match backend contract

---

## 16D: Dashboard Components

### Context

Build frontend dashboard components for drift visibility.

### Tasks

- [ ] **16D.1** Create DriftDebtCard
  - **File**: `frontend/components/dashboard/DriftDebtCard.tsx`
  - **Priority**: High | **Effort**: M
  - **Details**:
    - Total open drift count (large number)
    - Breakdown by type (bar or list)
    - Overdue count highlighted in red/warning
    - Convergence score as percentage
    - Link to `/drift` management page

- [ ] **16D.2** Create CommitmentBacklogCard
  - **File**: `frontend/components/dashboard/CommitmentBacklogCard.tsx`
  - **Priority**: Medium | **Effort**: M
  - **Details**:
    - Count of committed atoms without test evidence
    - Top 5 atoms needing tests
    - Link to reconciliation wizard

- [ ] **16D.3** Create DriftTrendChart
  - **File**: `frontend/components/dashboard/DriftTrendChart.tsx`
  - **Priority**: Medium | **Effort**: M
  - **Details**:
    - Line chart: drift count over time (week/month/quarter)
    - Lines: new, resolved, net drift
    - Optional overlay: epistemic certainty trend for correlation

- [ ] **16D.4** Create drift management page
  - **File**: `frontend/app/drift/page.tsx`
  - **Priority**: High | **Effort**: L
  - **Details**:
    - Summary cards row (total, by type, by severity, overdue)
    - Filterable/sortable table of drift items
    - Aging distribution visualization
    - Bulk actions (acknowledge, waive)
    - Exception lane filter

- [ ] **16D.5** Create drift detail page
  - **File**: `frontend/app/drift/[id]/page.tsx`
  - **Priority**: Medium | **Effort**: M
  - **Details**:
    - Full description and source references
    - Timeline: detected → confirmed → acknowledged → resolved
    - Related reconciliation runs
    - Action buttons: acknowledge, waive, resolve

- [ ] **16D.6** Update dashboard page
  - **File**: `frontend/app/page.tsx`
  - **Priority**: Medium | **Effort**: S
  - **Details**:
    - Add DriftDebtCard and CommitmentBacklogCard to layout (new row after Epistemic + Coupling)

- [ ] **16D.7** Add exception lane UI to ReconciliationWizard
  - **File**: `frontend/components/agents/ReconciliationWizard.tsx`
  - **Priority**: Medium | **Effort**: M
  - **Details**:
    - Exception lane dropdown: Normal, Hotfix Exception, Spike Exception
    - Conditional justification text area (required for hotfix/spike)
    - Attestation type indicator

### Verification

- [ ] Dashboard loads without errors with new drift cards
- [ ] Drift management page accessible at `/drift`
- [ ] All cards handle empty/loading/error states gracefully
- [ ] Exception lane UI validates justification requirement
- [ ] Drift trend chart renders time-series data

---

## Files Inventory

### New Files (24 files)

| File | Purpose |
|------|---------|
| `src/modules/drift/entities/drift-debt.entity.ts` | DriftDebt entity + types |
| `src/modules/drift/repositories/drift-debt.repository.ts` | Repository for drift CRUD |
| `src/modules/drift/drift-detection.service.ts` | Core detection logic |
| `src/modules/drift/drift-policy.service.ts` | Convergence policy computation |
| `src/modules/drift/drift-metrics.service.ts` | Dashboard-ready metrics |
| `src/modules/drift/drift.controller.ts` | REST endpoints |
| `src/modules/drift/dto/drift.dto.ts` | Request/response DTOs |
| `src/modules/drift/drift.module.ts` | NestJS module |
| `src/migrations/XXXXXXXXXX-CreateDriftDebt.ts` | drift_debt table migration |
| `src/migrations/XXXXXXXXXX-AddExceptionAndAttestation.ts` | ReconciliationRun extension |
| `frontend/lib/api/drift.ts` | API client |
| `frontend/hooks/drift/use-drift.ts` | React Query hooks |
| `frontend/types/drift.ts` | Frontend type definitions |
| `frontend/app/drift/page.tsx` | Drift management page |
| `frontend/app/drift/[id]/page.tsx` | Drift detail page |
| `frontend/components/dashboard/DriftDebtCard.tsx` | Dashboard card |
| `frontend/components/dashboard/CommitmentBacklogCard.tsx` | Dashboard card |
| `frontend/components/dashboard/DriftTrendChart.tsx` | Trend chart |

### Modified Files (10 files)

| File | Changes |
|------|---------|
| `src/modules/agents/entities/reconciliation-run.entity.ts` | Add exceptionLane, attestationType, exceptionJustification |
| `src/modules/agents/graphs/types/reconciliation-state.ts` | Add exception/attestation to ReconciliationOptions |
| `src/modules/agents/reconciliation.controller.ts` | Add exception/attestation to DTOs |
| `src/modules/agents/reconciliation.service.ts` | Pass through new fields |
| `src/modules/agents/graphs/nodes/reconciliation/persist.node.ts` | Add drift detection hook |
| `src/modules/projects/project.entity.ts` | Add driftPolicies to ProjectSettings |
| `src/modules/metrics/metrics-history.service.ts` | Record drift in snapshots |
| `src/modules/metrics/metrics.controller.ts` | Add drift metrics endpoints |
| `src/app.module.ts` | Register DriftModule |
| `frontend/app/page.tsx` | Add drift cards to dashboard |
| `frontend/components/agents/ReconciliationWizard.tsx` | Add exception lane UI |

### Test Files

| File | Purpose |
|------|---------|
| `src/modules/drift/drift-detection.service.spec.ts` | Detection logic tests |
| `src/modules/drift/drift-policy.service.spec.ts` | Convergence policy tests |
| `src/modules/drift/drift-metrics.service.spec.ts` | Metrics computation tests |
| `src/modules/drift/drift.controller.spec.ts` | Controller endpoint tests |
| `src/modules/drift/repositories/drift-debt.repository.spec.ts` | Repository tests |
| `frontend/components/dashboard/DriftDebtCard.test.tsx` | Card component tests |
| `frontend/components/dashboard/CommitmentBacklogCard.test.tsx` | Card component tests |

---

## Implementation Order

```
16A (Entity + Detection) → 16B (Exception Lanes + Attestation) → 16C (API + Metrics) → 16D (Dashboard)
```

16A and 16B can be developed in parallel. 16C depends on both 16A and 16B. 16D depends on 16C (API must exist for frontend to call).
