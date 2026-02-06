# Pact Implementation Checklist - Phase 1

**Created**: 2026-01-16
**Based on**: implementation-guide-2026-01-12.md + Phase 0 completion
**Status**: ✅ Complete (2026-01-21)

---

## Phase 1: Core Intent System (MVP Foundation)

**Goal**: Users can create, refine, and organize Intent Atoms through a natural, AI-assisted workflow.

**Timeline**: Development Milestone 1 (Weeks 1-3 relative to Phase 1 start)

**Dependencies**: Phase 0 complete (all infrastructure operational)

**Key Deliverables**:

- Enhanced Intent Atom CRUD API
- AI-powered iterative refinement service
- Canvas UI for visual organization (React/Next.js)
- Atomicity checks with heuristics
- Tagging and filtering system

---

## Part 1: Intent Atom Data Model Enhancement ✅

### 1.1 Atom Entity Extensions

**Existing**: Basic Atom entity with id, description, status, quality_score

- [x] Add `observable_outcomes` JSONB field (array of observable effects)
- [x] Add `falsifiability_criteria` JSONB field (conditions that disprove the atom)
- [x] Add `tags` JSONB field (array of user-defined tags)
- [x] Add `canvas_position` JSONB field (x, y coordinates for Canvas UI)
- [x] Add `parent_intent` TEXT field (original user input that spawned this atom)
- [x] Add `refinement_history` JSONB field (tracks iterative refinements)
- [x] Create migration for schema changes
- [x] Update Atom entity TypeORM decorators
- [x] Verify: Migration runs successfully

### 1.2 DTO Enhancements

- [x] Create `CreateAtomDto` with validation decorators
  - [x] description (required, min 10 chars)
  - [x] category (required, enum validation)
  - [x] tags (optional, array)
  - [x] canvas_position (optional, {x: number, y: number})
- [x] Create `UpdateAtomDto` (partial of CreateAtomDto)
- [x] Create `AtomResponseDto` with transformed fields
- [x] Create `AtomSearchDto` for filtering/querying
- [x] Add class-validator decorators for all DTOs
- [x] Verify: DTOs validate correctly in tests

### 1.3 Atom Repository Layer

- [x] Create `AtomsRepository` extending TypeORM Repository
- [x] Implement `findByStatus(status: AtomStatus)` method
- [x] Implement `findByTags(tags: string[])` method
- [x] Implement `findByCategory(category: string)` method
- [x] Implement `search(criteria: AtomSearchDto)` method
- [x] Implement `findSupersessionChain(atomId: string)` method
- [x] Write unit tests for repository methods
- [x] Verify: All repository methods have test coverage

---

## Part 2: Enhanced CRUD API ✅

### 2.1 AtomsController Enhancement ✅

- [x] Implement `POST /atoms` - Create atom from raw intent
- [x] Implement `GET /atoms` - List atoms with filtering/pagination
- [x] Implement `GET /atoms/:id` - Get single atom with relations
- [x] Implement `PATCH /atoms/:id` - Update draft atom (validation: only drafts)
- [x] Implement `DELETE /atoms/:id` - Delete draft atom (validation: only drafts)
- [x] Implement `PATCH /atoms/:id/commit` - Commit atom (triggers quality validation)
- [x] Implement `PATCH /atoms/:id/supersede` - Mark atom as superseded
- [x] Add Swagger/OpenAPI documentation for all endpoints
- [x] Verify: All endpoints documented in Swagger UI

### 2.2 AtomsService Enhancement ✅

- [x] Implement `create(dto: CreateAtomDto)` with ID generation
- [x] Implement `findAll(options: AtomSearchDto)` with pagination
- [x] Implement `findOne(id: string)` with eager loading
- [x] Implement `update(id: string, dto: UpdateAtomDto)` with status validation
- [x] Implement `remove(id: string)` with status validation
- [x] Implement `commit(id: string)` with quality gate integration
- [x] Implement `supersede(id: string, newAtomId: string)`
- [x] Implement `generateAtomId()` helper (IA-XXX pattern)
- [x] Write unit tests for all service methods (target: 90%+ coverage)
- [x] Verify: Service tests pass with quality gate

### 2.3 API Validation Checklist ✅

- [x] Draft atoms can be created, updated, deleted
- [x] Committed atoms cannot be updated or deleted (INV-004)
- [x] Superseded atoms cannot be modified
- [x] Quality score must be >= 80 for commitment (gating)
- [x] Atom ID uniqueness is enforced
- [x] Invalid input returns appropriate 400 errors
- [x] Not found returns 404
- [x] Unauthorized operations return 403
- [x] Verify: E2E tests cover all validation scenarios

### 2.4 WebSocket Gateway (Real-time Updates) ✅

- [x] Install dependencies: `@nestjs/websockets @nestjs/platform-socket.io socket.io`
- [x] Create `src/gateways/atoms.gateway.ts` with:
  - [x] `@WebSocketGateway({ cors: true })` decorator
  - [x] `emitAtomCreated(atom: Atom)` method
  - [x] `emitAtomCommitted(atom: Atom)` method
  - [x] `emitAtomSuperseded(atomId: string, newAtomId: string)` method
  - [x] `emitAtomUpdated(atom: Atom)` method (bonus)
  - [x] `emitAtomDeleted(atomId: string)` method (bonus)
- [x] Create `GatewaysModule` and add to AppModule
- [x] Inject `AtomsGateway` into `AtomsService`
- [x] Emit events on create, commit, supersede, update, delete operations
- [x] Write unit tests for gateway (14 tests)
- [x] Verify: WebSocket events emit correctly on atom operations

---

## Part 3: AI-Powered Iterative Refinement ✅

### 3.1 Intent Refinement Service ✅

- [x] Create `IntentRefinementService` in agents module
- [x] Implement `analyzeIntent(rawIntent: string)` method
  - [x] Returns atomicity assessment (atomic / non-atomic / ambiguous)
  - [x] Returns confidence score (0-1)
  - [x] Returns suggested refinements if non-atomic
- [x] Implement `suggestRefinements(intent: string)` method
  - [x] Returns clarifying questions
  - [x] Returns decomposition suggestions (if compound)
  - [x] Returns precision improvements (if vague)
- [x] Implement `refineAtom(atomId: string, feedback: string)` method
  - [x] Applies user feedback to refine description
  - [x] Tracks refinement in history
  - [x] Re-evaluates quality score
- [x] Create LLM prompts for refinement tasks
- [x] Implement heuristic fallbacks when LLM unavailable
- [x] Write comprehensive unit tests (28 tests)
- [x] Verify: Refinement service achieves <3 avg iterations to quality

### 3.2 Atomicity Checker ✅

- [x] Create `AtomicityCheckerService`
- [x] Implement heuristic checks:
  - [x] Single responsibility (no "and", "or" in description)
  - [x] Observable outcome present
  - [x] Implementation-agnostic (no technical terms)
  - [x] Measurable criteria
  - [x] Reasonable scope (not too broad, not too narrow)
- [x] Implement LLM-powered deep analysis:
  - [x] Behavioral completeness check
  - [x] Testability assessment
  - [x] Ambiguity detection
- [x] Return `AtomicityResult` with:
  - [x] isAtomic: boolean
  - [x] confidence: number
  - [x] violations: string[]
  - [x] suggestions: string[]
- [x] Write unit tests for all heuristics (67 tests)
- [x] Verify: 90%+ of test atoms correctly classified

### 3.3 Refinement API Endpoints ✅

- [x] Implement `POST /atoms/analyze` - Analyze raw intent
- [x] Implement `POST /atoms/:id/refine` - Refine existing atom
- [x] Implement `GET /atoms/:id/refinement-history` - Get refinement timeline
- [x] Implement `POST /atoms/:id/accept-suggestion` - Apply AI suggestion
- [x] Implement `POST /atoms/:id/suggest-refinements` - Get AI suggestions (bonus)
- [ ] Add rate limiting for LLM-heavy endpoints (deferred to Phase 2)
- [x] Add Swagger documentation
- [x] Verify: API endpoints work end-to-end

---

## Part 4: Tagging and Filtering ✅

### 4.1 Tag Management ✅

- [x] Implement `addTag(atomId: string, tag: string)` in AtomsService
- [x] Implement `removeTag(atomId: string, tag: string)` in AtomsService
- [x] Implement `getPopularTags(limit: number)` for autocomplete
- [x] Create `POST /atoms/:id/tags` endpoint
- [x] Create `DELETE /atoms/:id/tags/:tag` endpoint
- [x] Create `GET /tags` endpoint (list all unique tags with counts)
- [x] Verify: Tag operations work correctly (139 atom tests passing)

### 4.2 Advanced Filtering ✅

- [x] Implement filtering by status (draft, committed, superseded)
- [x] Implement filtering by category
- [x] Implement filtering by tags (any/all match)
- [x] Implement filtering by quality score range
- [x] Implement filtering by date range (created, committed)
- [x] Implement full-text search on description
- [x] Implement sorting (created, quality, atomId, committedAt)
- [x] Implement pagination with cursor-based option
- [x] Add `GET /atoms?filter=...` query parameter support
- [x] Verify: All filters work correctly and efficiently

---

## Part 5: Canvas UI (Frontend) ✅

### 5.1 Next.js Project Setup ✅

- [x] Create `frontend/` directory in project root
- [x] Initialize Next.js project with TypeScript
- [x] Install dependencies:
  - [x] @tanstack/react-query (data fetching)
  - [x] reactflow (canvas/node visualization)
  - [x] tailwindcss (styling)
  - [x] shadcn/ui (component library)
  - [x] zod (schema validation)
  - [x] axios (HTTP client)
- [x] Configure API client for backend communication
- [x] Set up environment variables for API URL
- [x] Create Docker configuration for frontend
- [x] Update docker-compose.yml with frontend service
- [x] Verify: Frontend starts and connects to backend

### 5.2 Canvas Component ✅

- [x] Create `Canvas.tsx` using ReactFlow
- [x] Implement atom nodes with:
  - [x] Title (atom_id)
  - [x] Description preview
  - [x] Status indicator (draft/committed/superseded)
  - [x] Quality score badge
  - [x] Category color coding
- [x] Implement drag-and-drop positioning
- [x] Implement node selection (single and multi-select)
- [x] Implement zoom and pan controls
- [x] Implement minimap for navigation
- [x] Save canvas positions to backend on change
- [x] Verify: Canvas renders atoms correctly

### 5.3 Atom Creation Flow ✅

- [x] Create `CreateAtomDialog.tsx` component
- [x] Implement natural language input field
- [x] Show AI analysis results (atomicity, confidence)
- [x] Display refinement suggestions inline
- [x] Implement iterative refinement UI:
  - [x] Show clarifying questions
  - [x] Accept/reject suggestions
  - [x] Manual edit option
- [x] Show quality score preview before creation
- [x] Implement "Create & Add to Canvas" action
- [x] Verify: Full creation flow works end-to-end

### 5.4 Atom Detail Panel ✅

- [x] Create `AtomDetailPanel.tsx` component (as atoms/[id]/page.tsx)
- [x] Display full atom information:
  - [x] ID, description, category
  - [x] Observable outcomes
  - [x] Falsifiability criteria
  - [x] Quality score breakdown
  - [x] Tags (editable)
  - [x] Created/committed timestamps
  - [x] Refinement history
- [x] Implement edit mode for draft atoms
- [x] Implement commit action with confirmation
- [x] Implement supersede action
- [x] Implement delete action with confirmation
- [x] Verify: Detail panel shows correct data

### 5.5 Sidebar Navigation ✅

- [x] Create `Sidebar.tsx` component (integrated into atoms/page.tsx)
- [x] Implement atom list view (alternative to canvas)
- [x] Implement filtering controls:
  - [x] Status filter
  - [x] Category filter
  - [x] Tag filter
  - [x] Search box
- [x] Implement sorting controls
- [x] Show atom counts per filter
- [x] Verify: Sidebar filtering works correctly

### 5.6 Dashboard Page ✅

- [x] Create `pages/index.tsx` - Main dashboard (app/page.tsx with App Router)
- [x] Show summary statistics:
  - [x] Total atoms (by status)
  - [x] Average quality score
  - [x] Recent activity
- [x] Show quick actions:
  - [x] Create new atom
  - [x] View canvas
  - [x] Recent atoms list
- [x] Verify: Dashboard loads and displays correctly

---

## Part 6: Integration & Testing ✅

### 6.1 E2E Test Suite ✅

- [x] Create `frontend/e2e/atom-workflows.spec.ts`
- [x] Test create atom flow (New Atom button, dialog, analyze)
- [x] Test cancel/close dialog
- [x] Test edit dialog functionality
- [x] Test commit dialog functionality
- [x] Test delete dialog functionality
- [x] Test navigation and quick actions
- [x] Verify: All E2E tests pass (129 passed, 30 skipped, 1 flaky)

### 6.2 Integration Tests ✅

- [x] Test AtomizationService → AtomsService integration
- [x] Test AtomQualityService → commit flow integration
- [x] Test IntentRefinementService → LLMService integration
- [x] Test AtomicityChecker heuristics + LLM fallback
- [x] Verify: Integration tests pass (`test/service-integration.e2e-spec.ts`)

### 6.3 Cucumber/BDD Scenarios ✅

- [x] Create `test/features/atom-creation.feature`
  - [x] Scenario: User creates an Intent Atom with natural language
  - [x] Scenario: System validates atomicity of intent
  - [x] Scenario: User iteratively refines non-atomic intent
  - [x] Scenario: User commits a quality-validated atom
  - [x] Scenario: System blocks commitment of low-quality atom
- [x] Feature: Intent Atom management scenarios covered by E2E tests
- [x] Verify: All Cucumber scenarios pass (5 scenarios, 36 steps)

### 6.4 Frontend Tests ✅

- [x] Set up Vitest for frontend testing
- [x] Write tests for Canvas component (canvas-ui store tests)
- [x] Write tests for CreateAtomDialog
- [x] Write tests for AppLayout
- [x] Write tests for API hooks (use-atoms, use-create-atom, etc.)
- [x] Verify: Frontend test coverage >= 70% (37/37 files pass quality gate)

---

## Part 7: Documentation & Polish ✅

### 7.1 API Documentation ✅

- [x] Complete Swagger/OpenAPI specs for all endpoints
- [x] Add request/response examples (via DTOs and decorators)
- [x] Document error codes and messages
- [x] Verify: Swagger UI shows all endpoints at `/api`

### 7.2 User Documentation ✅

- [x] Create `docs/ux.md` - Canonical UX specification
- [x] Create `docs/ui.md` - UI architecture specification
- [x] Document intent atom workflow
- [x] Document canvas UI interaction model
- [x] Verify: Documentation covers core workflows

### 7.3 Developer Documentation ✅

- [x] Document IntentRefinementService in code comments
- [x] Document AtomicityChecker heuristics in code
- [x] Document frontend architecture in `docs/ui.md`
- [x] Verify: Developer docs are up-to-date

---

## Phase 1 Success Criteria ✅

- [x] Users can create Intent Atoms from natural language input
- [x] AI validates atomicity and suggests refinements
- [x] Average refinement iterations < 3 per atom
- [x] Quality gate enforces 80+ score for commitment
- [x] Canvas UI allows visual organization
- [x] Drag-and-drop positions persist
- [x] Tagging and filtering operational
- [x] 90%+ of Intent Atoms pass atomicity checks on first AI analysis
- [x] Cucumber/Gherkin scenarios pass (5 scenarios, 36 steps)
- [x] E2E test suite passes (129 passed)
- [x] API documented in Swagger
- [x] Frontend deployed and operational

---

## Validation Checklist (End of Phase 1)

Run these commands to validate Phase 1 completion:

```bash
# Backend tests
./scripts/test.sh --ci

# Frontend tests
cd frontend && npm test

# E2E tests
./scripts/test.sh --e2e

# BDD tests
npm run test:bdd

# Quality checks
npm run test:quality
npm run test:coupling

# API docs accessible
curl http://localhost:3000/api/docs

# Frontend accessible
curl http://localhost:3001
```

Expected results:

- All tests pass
- Coverage >= 80% backend, >= 70% frontend
- Quality score >= 90% (test quality)
- Coupling score >= 90% (test-atom)
- API docs render correctly
- Frontend canvas loads with atoms

---

## Current Status Summary

**Phase 0 Complete** (Prerequisites met):

- Docker infrastructure operational
- PostgreSQL database with 10 tables
- Jest + Cucumber testing framework
- Atomization Agent with LLM-powered intent analysis
- Atom Quality Validator with 5 quality dimensions
- Test-Atom Coupling Agent
- Test Quality Analyzer with 7 dimensions
- CI/CD pipeline enforcing all quality gates

**Phase 1 Complete** ✅:

- **Part 1**: Intent Atom Data Model Enhancement ✅
- **Part 2**: Enhanced CRUD API ✅
- **Part 3**: AI-Powered Iterative Refinement ✅
- **Part 4**: Tagging and Filtering ✅
- **Part 5**: Canvas UI (Frontend) ✅
- **Part 6**: Integration & Testing ✅
- **Part 7**: Documentation & Polish ✅

**Test Status**: 380+ backend tests, 129 E2E tests, 37/37 frontend test files pass quality gates

**Frontend Status**:

- Next.js 14 project with App Router
- ReactFlow canvas with custom AtomNode component
- Zustand stores for UI state management
- React Query hooks for server state
- WebSocket integration for real-time updates
- Docker container configured on port 3001
- Comprehensive E2E test coverage with Playwright

**Next Phase**: See [implementation-checklist-phase2.md](implementation-checklist-phase2.md) for Phase 2: Intent Validators

---

**Last Updated**: 2026-01-21
