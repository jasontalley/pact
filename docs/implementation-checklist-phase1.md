# Pact Implementation Checklist - Phase 1

**Created**: 2026-01-16
**Based on**: implementation-guide-2026-01-12.md + Phase 0 completion
**Status**: Ready to begin

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
- [ ] Verify: E2E tests cover all validation scenarios

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
- [ ] Add rate limiting for LLM-heavy endpoints
- [x] Add Swagger documentation
- [x] Verify: API endpoints work end-to-end

---

## Part 4: Tagging and Filtering

### 4.1 Tag Management

- [ ] Implement `addTag(atomId: string, tag: string)` in AtomsService
- [ ] Implement `removeTag(atomId: string, tag: string)` in AtomsService
- [ ] Implement `getPopularTags(limit: number)` for autocomplete
- [ ] Create `POST /atoms/:id/tags` endpoint
- [ ] Create `DELETE /atoms/:id/tags/:tag` endpoint
- [ ] Create `GET /tags` endpoint (list all unique tags with counts)
- [ ] Verify: Tag operations work correctly

### 4.2 Advanced Filtering

- [ ] Implement filtering by status (draft, committed, superseded)
- [ ] Implement filtering by category
- [ ] Implement filtering by tags (any/all match)
- [ ] Implement filtering by quality score range
- [ ] Implement filtering by date range (created, committed)
- [ ] Implement full-text search on description
- [ ] Implement sorting (created, quality, name)
- [ ] Implement pagination with cursor-based option
- [ ] Add `GET /atoms?filter=...` query parameter support
- [ ] Verify: All filters work correctly and efficiently

---

## Part 5: Canvas UI (Frontend)

### 5.1 Next.js Project Setup

- [ ] Create `frontend/` directory in project root
- [ ] Initialize Next.js project with TypeScript
- [ ] Install dependencies:
  - [ ] @tanstack/react-query (data fetching)
  - [ ] reactflow (canvas/node visualization)
  - [ ] tailwindcss (styling)
  - [ ] shadcn/ui (component library)
  - [ ] zod (schema validation)
  - [ ] axios (HTTP client)
- [ ] Configure API client for backend communication
- [ ] Set up environment variables for API URL
- [ ] Create Docker configuration for frontend
- [ ] Update docker-compose.yml with frontend service
- [ ] Verify: Frontend starts and connects to backend

### 5.2 Canvas Component

- [ ] Create `Canvas.tsx` using ReactFlow
- [ ] Implement atom nodes with:
  - [ ] Title (atom_id)
  - [ ] Description preview
  - [ ] Status indicator (draft/committed/superseded)
  - [ ] Quality score badge
  - [ ] Category color coding
- [ ] Implement drag-and-drop positioning
- [ ] Implement node selection (single and multi-select)
- [ ] Implement zoom and pan controls
- [ ] Implement minimap for navigation
- [ ] Save canvas positions to backend on change
- [ ] Verify: Canvas renders atoms correctly

### 5.3 Atom Creation Flow

- [ ] Create `CreateAtomDialog.tsx` component
- [ ] Implement natural language input field
- [ ] Show AI analysis results (atomicity, confidence)
- [ ] Display refinement suggestions inline
- [ ] Implement iterative refinement UI:
  - [ ] Show clarifying questions
  - [ ] Accept/reject suggestions
  - [ ] Manual edit option
- [ ] Show quality score preview before creation
- [ ] Implement "Create & Add to Canvas" action
- [ ] Verify: Full creation flow works end-to-end

### 5.4 Atom Detail Panel

- [ ] Create `AtomDetailPanel.tsx` component
- [ ] Display full atom information:
  - [ ] ID, description, category
  - [ ] Observable outcomes
  - [ ] Falsifiability criteria
  - [ ] Quality score breakdown
  - [ ] Tags (editable)
  - [ ] Created/committed timestamps
  - [ ] Refinement history
- [ ] Implement edit mode for draft atoms
- [ ] Implement commit action with confirmation
- [ ] Implement supersede action
- [ ] Implement delete action with confirmation
- [ ] Verify: Detail panel shows correct data

### 5.5 Sidebar Navigation

- [ ] Create `Sidebar.tsx` component
- [ ] Implement atom list view (alternative to canvas)
- [ ] Implement filtering controls:
  - [ ] Status filter
  - [ ] Category filter
  - [ ] Tag filter
  - [ ] Search box
- [ ] Implement sorting controls
- [ ] Show atom counts per filter
- [ ] Verify: Sidebar filtering works correctly

### 5.6 Dashboard Page

- [ ] Create `pages/index.tsx` - Main dashboard
- [ ] Show summary statistics:
  - [ ] Total atoms (by status)
  - [ ] Average quality score
  - [ ] Recent activity
- [ ] Show quick actions:
  - [ ] Create new atom
  - [ ] View canvas
  - [ ] Recent atoms list
- [ ] Verify: Dashboard loads and displays correctly

---

## Part 6: Integration & Testing

### 6.1 E2E Test Suite

- [ ] Create `test/atoms-crud.e2e-spec.ts`
- [ ] Test create atom flow
- [ ] Test update draft atom
- [ ] Test delete draft atom
- [ ] Test commit atom (with quality gate)
- [ ] Test supersede atom
- [ ] Test cannot modify committed atom
- [ ] Test filtering and pagination
- [ ] Test tagging operations
- [ ] Verify: All E2E tests pass

### 6.2 Integration Tests

- [ ] Test AtomizationService → AtomsService integration
- [ ] Test AtomQualityService → commit flow integration
- [ ] Test IntentRefinementService → LLMService integration
- [ ] Test AtomicityChecker heuristics + LLM fallback
- [ ] Verify: Integration tests pass

### 6.3 Cucumber/BDD Scenarios

- [ ] Create `test/features/intent-atom-creation.feature`
  - [ ] Scenario: User creates an Intent Atom with natural language
  - [ ] Scenario: System validates atomicity of intent
  - [ ] Scenario: User iteratively refines non-atomic intent
  - [ ] Scenario: User commits a quality-validated atom
  - [ ] Scenario: System blocks commitment of low-quality atom
- [ ] Create `test/features/intent-atom-management.feature`
  - [ ] Scenario: User updates draft atom
  - [ ] Scenario: User cannot update committed atom
  - [ ] Scenario: User supersedes committed atom
  - [ ] Scenario: User filters atoms by status
  - [ ] Scenario: User searches atoms by description
- [ ] Create step definitions for all scenarios
- [ ] Verify: All Cucumber scenarios pass (9 scenarios minimum)

### 6.4 Frontend Tests

- [ ] Set up Jest for frontend testing
- [ ] Write tests for Canvas component
- [ ] Write tests for CreateAtomDialog
- [ ] Write tests for AtomDetailPanel
- [ ] Write tests for API client
- [ ] Verify: Frontend test coverage >= 70%

---

## Part 7: Documentation & Polish

### 7.1 API Documentation

- [ ] Complete Swagger/OpenAPI specs for all endpoints
- [ ] Add request/response examples
- [ ] Document error codes and messages
- [ ] Create API changelog
- [ ] Verify: Swagger UI shows all endpoints with examples

### 7.2 User Documentation

- [ ] Create `docs/user-guide/creating-atoms.md`
- [ ] Create `docs/user-guide/canvas-navigation.md`
- [ ] Create `docs/user-guide/refinement-workflow.md`
- [ ] Add screenshots and examples
- [ ] Verify: Documentation is complete and accurate

### 7.3 Developer Documentation

- [ ] Update `docs/schema.md` with new fields
- [ ] Document IntentRefinementService architecture
- [ ] Document AtomicityChecker heuristics
- [ ] Document frontend architecture
- [ ] Verify: Developer docs are up-to-date

---

## Phase 1 Success Criteria

- [ ] Users can create Intent Atoms from natural language input
- [ ] AI validates atomicity and suggests refinements
- [ ] Average refinement iterations < 3 per atom
- [ ] Quality gate enforces 80+ score for commitment
- [ ] Canvas UI allows visual organization
- [ ] Drag-and-drop positions persist
- [ ] Tagging and filtering operational
- [ ] 90%+ of Intent Atoms pass atomicity checks on first AI analysis
- [ ] All 9 Gherkin scenarios pass
- [ ] E2E test suite passes
- [ ] API documented in Swagger
- [ ] Frontend deployed and operational

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

**Phase 1 Progress**:

- **Part 1**: Intent Atom Data Model Enhancement ✅
- **Part 2**: Enhanced CRUD API ✅
- **Part 3**: AI-Powered Iterative Refinement ✅
- **Part 4**: Tagging and Filtering (next)
- **Part 5**: Canvas UI (Frontend)
- **Part 6**: Integration & Testing
- **Part 7**: Documentation & Polish

**Test Status**: 380 tests passing, 13/13 test files pass quality gates

---

**Last Updated**: 2026-01-16
