# Changelog

All notable changes to the Pact project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.7] - 2026-02-07

### Changed

- **Multi-arch Docker images**: Release workflow now builds native amd64 and arm64 images
  using GitHub's native ARM runners (`ubuntu-24.04-arm`) instead of QEMU emulation.
  Builds are fast and reliable on both architectures.
- **Digest-based manifest merge**: Each architecture pushes by digest, then a merge job
  combines them into a single multi-arch manifest tagged with `latest` and the version.
- **Removed platform workaround**: `docker-compose.prod.yml` no longer forces
  `platform: linux/amd64` — Docker now pulls the native architecture automatically.

## [0.1.6] - 2026-02-07

### Fixed

- **Postgres 18 volume mount**: Changed mount from `/var/lib/postgresql/data` to
  `/var/lib/postgresql` to match Postgres 18's new data directory layout
- **Apple Silicon support**: Added `platform: linux/amd64` to app and frontend services
  so Docker Desktop pulls the correct image automatically on ARM Macs
- **CI Postgres version**: Restored `postgres:18` in release workflow (was incorrectly
  downgraded to 16-alpine)

## [0.1.5] - 2026-02-07

### Fixed

- **CI build speed**: Removed arm64 from Docker build platforms; QEMU emulation on amd64 runners
  causes illegal instruction crashes and 30+ minute builds. amd64-only for now.

## [0.1.4] - 2026-02-07

### Fixed

- **Frontend CI build**: `.gitignore` rule `coverage` was matching `hooks/coverage/` source directory,
  causing `use-coverage.ts` to be excluded from git. Changed to `/coverage` (root-only match)
- **Missing hook**: Added `frontend/hooks/coverage/use-coverage.ts` to source control

## [0.1.3] - 2026-02-07

### Added

- **Frontend production Docker image** (`frontend/Dockerfile`) - multi-stage build using Next.js
  standalone output, published as `jasontalley/pact-frontend` on Docker Hub
- **Frontend service in docker-compose.prod.yml** - runs on port 3001, connects to backend API
- **Frontend CI/CD** - parallel image build in release workflow alongside backend
- **FRONTEND_PORT** env var in `.env.production.example`

## [0.1.2] - 2026-02-06

### Fixed

- **Production deployment stack**: `docker-compose.prod.yml` now uses published Docker Hub image
  instead of requiring source code to build
- **Database schema initialization**: Added `DATABASE_SYNCHRONIZE` env var to enable automatic
  schema creation on first deployment (defaults to `true`)
- **Postgres compatibility**: Downgraded from Postgres 18 to 16-alpine (18 has breaking data
  directory changes incompatible with standard volume mounts)
- **Redis healthcheck**: Added healthcheck and dependency ordering so app waits for Redis readiness
- **Removed deprecated `version` key** from docker-compose.prod.yml

## [0.1.1] - 2026-02-06

### Fixed
- **Docker container startup**: Corrected CMD path from `dist/main` to `dist/src/main`
  - NestJS build preserves source directory structure, so `src/main.ts` becomes `dist/src/main.js`
  - Resolves MODULE_NOT_FOUND error when starting Docker containers from v0.1.0

## [0.1.0] - 2026-02-06

### Phase 17: Local/Remote Split (2026-02-05)

#### Added - ContentProvider Abstraction
- **ContentProvider interface** (`src/modules/agents/content/content-provider.interface.ts`)
  - Abstracts all filesystem access for remote deployment support
  - Three implementations: Filesystem, PreRead (in-memory), and WriteProvider
- **FilesystemContentProvider** - Wraps existing fs.* calls with async Promise interface
- **PreReadContentProvider** - Memory-backed provider for remote API content submission
- **WriteProvider interface** - Abstraction for file writes (apply service)
  - `FilesystemWriteProvider` for co-located mode
  - `PatchInstructionProvider` for remote mode (returns patches vs writing)

#### Added - Client SDK (@pact/client-sdk)
- **New npm package** at `packages/client-sdk/` (zero NestJS dependencies)
- **99 passing tests** with comprehensive coverage
- **Core modules**:
  - `PactClient` - Main client API with typed endpoints
  - `FileReader` - Local file reading and manifest building
  - `GitClient` - Git operations (commit hash, changed files, diff)
  - `PactApiClient` - Typed HTTP client for all Pact REST endpoints
  - `CoverageCollector` - Istanbul/c8/lcov coverage collection
  - `PatchApplicator` - Apply @atom annotation patches locally
  - `MainCacheStore` - Persist Pact Main state to `.pact/main-cache.json`
- **Commands**:
  - `pull()` - Cache Pact Main state locally (read-only cache)
  - `check()` - Generate local reconciliation report (plausibility signal, not canonical truth)
- **Examples**:
  - `examples/vscode-extension/` - VSCode extension integration pattern
  - `examples/cli/` - CLI tool pattern (pact pull, pact check, pact apply)
  - `examples/ci/` - CI/CD pipeline pattern (CI-attested canonical updates)

#### Added - Pre-Read Reconciliation API
- **PreReadContentDto** (`src/modules/agents/dto/pre-read-reconciliation.dto.ts`)
  - Submit file contents via API instead of requiring filesystem access
- **POST /agents/reconciliation/analyze/pre-read** endpoint
  - Accepts manifest + file contents as JSON payload
  - Creates PreReadContentProvider for reconciliation pipeline
  - Produces identical results to filesystem-based reconciliation

#### Added - Main State Cache (Local = Plausible, Canonical = True)
- **Minimal local state model** - `.pact/main-cache.json` and `.pact/local-report.json`
- **MainStateCache data model** - Cached atoms, molecules, atom-test links from Pact Main
- **GET /agents/main-state** endpoint - Export Main state snapshot for client caching
- **Local reconciliation reports** - Advisory plausibility signals, not canonical truth
- **No push/pull sync** - Deferred to PactHub phase (multi-tenant collaboration)
- **CI attestation is the single promotion gate** - Plausible → True via CI only

#### Added - Scope Middleware
- **ScopeMiddleware** (`src/common/middleware/scope.middleware.ts`)
  - Extracts `x-pact-project-id` and `x-pact-scope` headers
  - Default scope: `'main'` (agents see Main by default)
- **@PactScope() decorator** - Inject scope context into controllers
- **23 passing tests** for scope isolation and filtering
- **Scope types**: `'main'` (canonical) and `'local'` (plausibility)
  - No `'merged'` scope - local is advisory only, never mixed into canonical queries

#### Changed - Refactored All Filesystem Access
- **40+ fs.* calls** replaced with ContentProvider across 13 source files:
  - `structure.node.ts`, `discover-fullscan.node.ts`, `discover-delta.node.ts`
  - `context.node.ts`, `reconciliation-tools.service.ts`
  - `apply.service.ts`, `context-builder.service.ts`
  - `brownfield-analysis.service.ts`, `test-atom-coupling.service.ts`
  - `dependency-analyzer.ts`, `test-quality.service.ts`
- **All pipeline nodes** now accept ContentProvider via NodeConfig
- **Reconciliation pipeline** works identically with filesystem or pre-read content
- **Zero behavioral changes** - existing tests pass with no regressions

#### Deployment Models Enabled
- **Model A: Co-located** (current) - Same machine, FilesystemContentProvider
- **Model B: Local Client + Remote** - VSCode/CLI reads files, sends via API
- **Model C: CI/CD Pipeline** - GitHub Action uploads content, CI-attested canonical updates
- **Model D: PactHub** (future) - Multi-tenant shared remote, CI pipelines submit attested runs

### Phase 16: Drift Management (2026-02-05)

#### Added - Drift Debt Tracking
- **DriftDebt entity** (`src/modules/drift/entities/drift-debt.entity.ts`)
  - Four drift types: `orphan_test`, `commitment_backlog`, `stale_coupling`, `uncovered_code`
  - Status: `open`, `acknowledged`, `resolved`, `waived`
  - Severity: `critical`, `high`, `medium`, `low` (auto-escalates with age)
  - Time-bounded convergence with `dueAt` deadlines
- **Migration** `1738569600000-CreateDriftDebt.ts` - drift_debt table + indexes
- **DriftDetectionService** - Detects drift from CI-attested reconciliation runs
  - **CI attestation gate** - Only CI-attested runs create/update drift records
  - Local runs produce advisory reports, no drift DB writes
  - Deduplication by `(filePath, testName, driftType)`
  - Auto-resolution when tests gain annotations or atoms gain tests

#### Added - Exception Lanes & CI Attestation
- **ReconciliationRun extensions**:
  - `exceptionLane`: `'normal'`, `'hotfix-exception'`, `'spike-exception'`
  - `attestationType`: `'local'` (advisory) or `'ci-attested'` (canonical)
  - `exceptionJustification`: Required for hotfix/spike exceptions
- **Migration** `1738656000000-AddExceptionAndAttestation.ts`
- **Convergence policies** in ProjectSettings:
  - Normal: 14 days, Hotfix: 3 days, Spike: 7 days
  - High severity: 7 days, Critical severity: 14 days
  - `blockOnOverdueDrift` - Optional build blocker

#### Added - Drift API & Metrics
- **DriftController** (`src/modules/drift/drift.controller.ts`)
  - `GET /drift` - List open drift (paginated, filterable)
  - `GET /drift/summary` - Aggregate counts by type/severity
  - `GET /drift/overdue` - Past-deadline items
  - `GET /drift/aging` - Distribution: 0-3d, 3-7d, 7-14d, 14+d
  - `GET /drift/convergence` - On-track vs overdue report
  - `PATCH /drift/:id/acknowledge` - Mark acknowledged
  - `PATCH /drift/:id/waive` - Waive with justification (required)
  - `PATCH /drift/:id/resolve` - Manual resolution
- **DriftMetricsService** - Dashboard-ready metrics
  - Commitment backlog count
  - Drift debt summary by type/severity
  - Convergence score (0-100)
  - Drift trend over time
- **MetricsSnapshot integration** - Drift metrics in daily snapshots

#### Added - Dashboard Components
- **DriftDebtCard** - Total open drift, breakdown by type, overdue count
- **CommitmentBacklogCard** - Committed atoms needing tests
- **DriftTrendChart** - Time-series: new, resolved, net drift
- **Drift management page** (`frontend/app/drift/page.tsx`)
  - Summary cards, filterable table, aging distribution
  - Bulk actions (acknowledge, waive)
- **Drift detail page** (`frontend/app/drift/[id]/page.tsx`)
  - Full timeline: detected → confirmed → resolved
  - Related reconciliation runs
- **ReconciliationWizard enhancements**
  - Exception lane dropdown (Normal, Hotfix, Spike)
  - Conditional justification text area
  - Attestation type indicator

#### Changed - Reconciliation Persist Node
- **Drift detection hook** in `persist.node.ts`
  - After run persistence, calls `driftDetectionService.detectDriftFromRun(runId)`
  - Respects attestation gate internally (local runs → no-op)
  - Stores DriftDetectionResult in run metadata

### Phase 15: Pact Main Governance Model (2026-02-05)

#### Added - Pact Main State Machine
- **Atom status extended** with `proposed` state
  - New lifecycle: `proposed` → (change set approval) → `draft` → `committed` → `superseded`
  - `promotedToMainAt` timestamp - marks atoms "on Main"
  - `changeSetId` - FK to molecules.id for governed change set membership
- **Migration** `1738483200000-AddPactMainGovernance.ts`
  - Added `promotedToMainAt` and `changeSetId` columns
  - Backfilled existing committed atoms as "on Main" (`promotedToMainAt = committedAt`)
  - Partial indexes for efficient Main scope queries

#### Added - Governance Service Layer
- **AtomsService governance methods**:
  - `propose(dto, changeSetId)` - Create proposed atom in change set
  - `convertToDraft(id)` - Escape hatch to remove from governance
  - Modified `commit()` - Sets `promotedToMainAt`, rejects proposed atoms (must use change set)
  - Modified `update()`/`remove()` - Allow proposed atoms (mutable like drafts)
- **Scope filtering**:
  - `scope=main` - Only atoms where `promotedToMainAt IS NOT NULL`
  - `scope=proposed` - Only `status='proposed'` atoms
  - `scope=all` - All atoms (backward-compatible default)
- **MoleculesService change set commit**:
  - Handles both draft and proposed atoms
  - Batch-commits atoms and sets `promotedToMainAt`
  - Updates `changeSetMetadata.promotedAtomIds`

#### Added - API Endpoints & Frontend
- **Atoms API**:
  - `POST /atoms/propose` - Create proposed atom
  - `PATCH /atoms/:id/convert-to-draft` - Remove from governance
  - `?scope=main|proposed|all` query parameter on `GET /atoms`
- **Reconciliation integration**:
  - `POST /agents/reconciliation/runs/:runId/create-change-set`
  - Creates change set from reconciliation recommendations
  - Atoms created as `proposed` with `changeSetId`
- **Frontend**:
  - Scope toggle on atoms page (All Atoms | Main | Proposed)
  - Proposed status badge styling (amber/orange)
  - "Create Change Set" action in ReconciliationWizard
  - Both "Apply Directly" (draft) and "Create Change Set" (proposed) paths

#### Added - Guards & Events
- **CommittedAtomGuard** - Proposed atoms treated like drafts for update/delete
- **WebSocket events**:
  - `atom:proposed` - When atom enters proposed status
  - `atom:promotedToMain` - When atom is promoted to Main

#### Changed - ChangeSetMetadata
- **Extended metadata**:
  - `source?: 'manual' | 'reconciliation' | 'import'`
  - `reconciliationRunId?: string`
  - `autoPromote?: boolean`
  - `promotedAtomIds?: string[]`

---

## Project Milestones

### Phase 14: Epistemic Intelligence (2026-01-XX) ✓
- Test quality as Red phase gate
- Coverage as epistemic intelligence
- Quality scoring (5 dimensions, 0-100 scale)

### Phase 13: Molecule Lens System (2026-01-XX) ✓
- Molecule CRUD with lens types
- Hierarchical nesting (max depth 10)
- Many-to-many atom relationships

### Phase 8-12: Foundation (2026-01-XX) ✓
- Database schema (21 tables across 5 categories)
- Atom CRUD with quality scoring
- LLM service abstraction (OpenAI, Anthropic)
- Atomization agent for intent decomposition

---

## Core System Stats (as of 2026-02-05)

### Test Coverage
- **Client SDK**: 99 tests passing
- **Scope Middleware**: 23 tests passing
- **Overall backend coverage**: 88%+ (from git status context)

### Database Schema
- **21 tables** across 5 categories
- **3 new migrations** in Phases 15-17:
  - `1738483200000-AddPactMainGovernance.ts` (Phase 15)
  - `1738569600000-CreateDriftDebt.ts` (Phase 16)
  - `1738656000000-AddExceptionAndAttestation.ts` (Phase 16)

### Architecture
- **Backend**: NestJS + TypeScript, PostgreSQL
- **Frontend**: Next.js 16, React 19, @xyflow/react 12
- **State Management**: React Query 5 (server), Zustand 5 (client), nuqs 2.8+ (URL)
- **Agents**: LangGraph state machines, LLM service abstraction
- **Client SDK**: Zero NestJS dependencies, Node.js built-ins + fetch only

---

## Migration Guide

### For Existing Atoms (Phase 15)
All existing committed atoms are automatically grandfathered as "on Main" via migration backfill. No action required.

### For Local Development (Phase 17)
1. **Pull Main state**: Cache canonical commitments locally
   ```bash
   pact pull
   ```
2. **Run local checks**: Generate plausibility reports (advisory only)
   ```bash
   pact check
   ```
3. **Canonical updates**: Only via CI-attested reconciliation runs

### For CI/CD Integration (Phase 16 & 17)
1. **Set attestationType**: `'ci-attested'` for canonical runs
2. **Choose exception lane**: `'normal'`, `'hotfix-exception'`, or `'spike-exception'`
3. **Monitor drift**: Convergence policies enforce time-bounded drift resolution

---

## Breaking Changes

### Phase 17
- **Filesystem access refactored**: All agents now use ContentProvider abstraction
  - Existing code using direct `fs.*` calls in agent context must be updated
  - See `src/modules/agents/content/` for migration patterns

### Phase 16
- **Reconciliation runs**: Default `attestationType` is `'local'` (advisory)
  - CI pipelines must explicitly set `attestationType: 'ci-attested'` for canonical updates
  - Drift debt only created/updated from CI-attested runs

### Phase 15
- **Atom status enum**: Extended with `'proposed'` state
  - Database migration adds columns, backward compatible
  - Default scope is `'all'` (no filtering) to maintain existing behavior

---

## Roadmap

### Completed ✓
- [x] Phase 15: Pact Main Governance Model
- [x] Phase 16: Drift Management
- [x] Phase 17: Local/Remote Split

### In Progress
- [ ] Phase 18: PactHub Multi-Tenant Collaboration (deferred push/pull sync from Phase 17)

### Planned
- [ ] Phase 19: Advanced Analytics & Reporting
- [ ] Phase 20: Self-Hosting Completion

---

## Contributors

Jason Talley - Project Lead

---

## License

UNLICENSED - Private project
