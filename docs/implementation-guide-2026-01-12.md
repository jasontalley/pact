# Pact - Implementation Guide

**Generated**: 2026-01-12
**Based on**: Requirements synthesis + stakeholder interviews + acceptance criteria
**Status**: Ready for development

---

## Overview

This guide provides a prioritized roadmap for implementing Pact MVP based on the comprehensive acceptance criteria generated from stakeholder interviews.

---

## Implementation Philosophy

**Test-Driven Development**: Implement each scenario by:

1. Writing the test first (from Gherkin scenario)
2. Running the test (verify it fails - Red)
3. Writing minimal code to pass the test (Green)
4. Refactoring while keeping tests green
5. Committing when tests pass

**Iterative Delivery**: Build in vertical slices (full stack for each feature) rather than horizontal layers.

---

## Priority Order for Implementation

### Phase 1: Core Intent System (MVP Foundation)

**Features**:

- Intent Atom creation & management
- Canvas metaphor for organization
- Natural language input with AI validation

**Scenarios**: 9 scenarios (see acceptance criteria doc)

**Why First**: Everything else depends on the ability to create and manage Intent Atoms

**Estimated Complexity**: Medium

- Natural language processing needs LLM integration
- Canvas UX requires thoughtful frontend design
- Data model is straightforward

**Dependencies**: None (foundational)

**Implementation Order**:

1. Intent Atom data model (schema, validation)
2. Basic CRUD API for Intent Atoms
3. AI validation service (iterative refinement prompts)
4. Canvas UI (React components)
5. Atomicity checks (AI analysis, heuristics)
6. Tagging & filtering

---

### Phase 2: Intent Validators (Meaning Constraint)

**Features**:

- Validator definition (natural language, Gherkin, templates)
- Configurable validator output formats
- Validator association with Intent Atoms

**Scenarios**: 5 scenarios

**Why Second**: Validators give Intent Atoms teeth; needed before commitment makes sense

**Estimated Complexity**: Medium

- Format adaptation (natural language → Gherkin → code) requires LLM
- Template library is straightforward
- Validator execution is deferred to Phase 4 (realization)

**Dependencies**: Phase 1 (Intent Atoms must exist)

**Implementation Order**:

1. Validator data model
2. Validator definition UI
3. Format translation service (LLM-based)
4. Template library (pre-built validators)
5. Validator-to-Atom association

---

### Phase 3: Commitment Boundary & Invariants (Critical Phase Shift)

**Features**:

- Explicit commitment ceremony
- Global invariant checks
- Commitment Artifact generation (immutable JSON)
- Override mechanism (with justification + logging)

**Scenarios**: 12 scenarios

**Why Third**: This is THE defining feature of Pact - the phase transition where ambiguity collapses

**Estimated Complexity**: High

- Ceremony UX must feel significant (multi-step flow)
- Invariant checking engine (pluggable architecture)
- Immutable storage with audit trail
- RBAC for overrides (future consideration, basic implementation first)

**Dependencies**: Phases 1-2 (Intent Atoms + Validators must exist)

**Implementation Order**:

1. Commitment Artifact data model (JSON schema)
2. Global invariant registry & checking engine
3. Commitment Ceremony UI (multi-step flow)
4. Invariant validation service
5. Override mechanism + logging
6. Auto-fix suggestions (LLM-based)
7. Immutability enforcement (database constraints, API guards)

---

### Phase 4: Agent-Driven Realization (Execution Automation)

**Features**:

- Agent reads Commitment Artifacts
- Agent generates tests from validators (Red phase)
- Agent generates code from Intent Atoms (Green phase)
- Agent cannot reinterpret intent (escalation on ambiguity)

**Scenarios**: 6 scenarios

**Why Fourth**: Now that intent is committed, we can automate execution

**Estimated Complexity**: Very High

- LLM-based code generation (quality is critical)
- Test generation from Gherkin (requires mapping to test framework)
- Realization Artifact tracking & traceability
- Agent proactivity & clarification logic

**Dependencies**: Phases 1-3 (complete intent → commitment flow)

**Implementation Order**:

1. Realization Artifact data model
2. Agent orchestration service (LangChain/LangGraph)
3. Test generation from Gherkin validators
4. Code generation from Intent Atoms
5. Traceability (link realizations back to commitments)
6. Ambiguity detection & escalation
7. Agent proactivity engine (exploration phase)

---

### Phase 5: Evidence Collection & Analysis (Validation Proof)

**Features**:

- Evidence Artifact generation (test results, coverage, security, quality)
- Real-time evidence stream
- Timeline/history view
- Dashboard aggregation
- AI failure analysis (bug vs. intent mismatch)

**Scenarios**: 11 scenarios

**Why Fifth**: Evidence closes the loop from intent → code → proof

**Estimated Complexity**: High

- Multiple evidence types (tests, coverage, security, quality)
- Real-time streaming (WebSockets or SSE)
- Timeline visualization
- AI failure analysis (requires sophisticated LLM prompting)

**Dependencies**: Phase 4 (realizations must execute to produce evidence)

**Implementation Order**:

1. Evidence Artifact data model (multiple types)
2. Test result capture (CI/CD integration)
3. Code coverage capture
4. Security scan integration (Semgrep, npm audit)
5. Test quality analysis (vacuous/brittle test detection)
6. Real-time evidence stream (WebSockets)
7. Timeline visualization (frontend)
8. Dashboard aggregation (metrics, trending)
9. AI failure analyzer

---

### Phase 6: Cross-Commit Dependencies & Supersession (System Evolution)

**Features**:

- Explicit dependency graph between Commitments
- Circular dependency detection
- Dependency visualization
- Commitment supersession (intent evolution)
- Realization archival

**Scenarios**: 6 scenarios

**Why Sixth**: Now that core flow works, enable composition and evolution

**Estimated Complexity**: Medium

- Dependency graph (data structure + algorithms)
- Cycle detection (standard graph algorithm)
- Visualization (force-directed graph or similar)
- Supersession mechanics (status updates, linking)

**Dependencies**: Phases 1-5 (full intent→commit→realize→evidence flow)

**Implementation Order**:

1. Commitment dependency data model
2. Dependency validation (cycle detection)
3. Dependency graph API
4. Visualization UI
5. Supersession mechanics
6. Realization archival logic
7. Evidence timeline showing supersession history

---

### Phase 7: External Integrations (Workflow Fit)

**Features**:

- Git branch integration (Commitment ID in commits)
- CI/CD pipeline hooks (Evidence generation from pipeline)
- Sprint/milestone metadata
- External failure handling (retry, escalation)

**Scenarios**: 6 scenarios

**Why Seventh**: Integrate with existing developer workflows

**Estimated Complexity**: Medium

- Git integration (commit message generation, traceability)
- CI/CD webhooks (GitHub Actions, GitLab CI, etc.)
- Metadata tagging (simple addition to Commitment schema)
- Retry logic with exponential backoff

**Dependencies**: Phases 1-6 (full system operational)

**Implementation Order**:

1. Git commit message generation
2. Git branch naming convention
3. CI/CD webhook receivers
4. Evidence posting from CI/CD
5. Sprint/milestone tagging UI & API
6. External failure retry logic
7. Escalation notifications

---

### Phase 8: Completeness Analysis (Emergent Validation)

**Features**:

- Emergent validator checks (gap detection)
- Coverage analysis across system areas
- Contradiction detection

**Scenarios**: 3 scenarios

**Why Eighth**: Advisory features that improve quality but aren't blocking

**Estimated Complexity**: High

- Gap detection requires understanding common patterns (LLM)
- Coverage analysis needs system area modeling
- Contradiction detection is non-trivial NLP problem

**Dependencies**: Phases 1-7 (needs committed intent and realizations)

**Implementation Order**:

1. Gap detection service (LLM-based pattern analysis)
2. System area modeling (user-defined or inferred)
3. Coverage dashboard
4. Contradiction detection (semantic similarity + conflict analysis)
5. Completeness suggestions UI

---

## Future Enhancements (Post-MVP)

### Phase 9: Multi-User Collaboration

- Real-time co-editing on Canvas
- Comment threads on Intent Atoms
- Commit approval workflows (RBAC)
- Team roles (Product Owner, Developer, etc.)

### Phase 10: Advanced Analytics

- Retrospective/learning loop
- Intent velocity metrics
- Commitment success rates
- Agent performance analytics

### Phase 11: Advanced Search & Query

- Full-text search across Intent Atoms
- Query language for Evidence (SQL-like?)
- Saved searches/views
- Alerts based on Evidence conditions

---

## Technical Stack Recommendations

### Backend

- **Framework**: NestJS (TypeScript)
- **Database**: PostgreSQL (JSON columns for artifacts)
- **ORM**: TypeORM
- **API**: RESTful + GraphQL (for flexible queries)
- **Real-time**: WebSockets or Server-Sent Events

### Frontend

- **Framework**: Next.js (React)
- **UI Library**: Shadcn/ui or similar (Tailwind-based)
- **State Management**: React Context + hooks (start simple)
- **Canvas**: React Flow or similar for visual organization
- **Charting**: Recharts or D3.js for Evidence visualizations

### AI/Agent Layer

- **Orchestration**: LangChain / LangGraph
- **LLM**: Anthropic Claude (via API)
- **Vector DB**: Pinecone or pgvector (if semantic search needed)
- **MCP Integration**: Model Context Protocol for context management

### Testing

- **Unit Tests**: Jest
- **BDD Tests**: Cucumber (for Gherkin scenarios)
- **E2E Tests**: Playwright
- **API Tests**: Supertest

### Infrastructure

- **Containerization**: Docker + Docker Compose
- **CI/CD**: GitHub Actions
- **Deployment**: Vercel (frontend) + Railway/Render (backend)

---

## Data Model Quick Reference

### Core Entities

1. **IntentAtom**
   - id (UUID)
   - description (text)
   - status (uncommitted | committed | superseded)
   - created_by, created_at
   - validators (array)
   - tags (array)

2. **IntentValidator**
   - id (UUID)
   - intent_atom_id (foreign key)
   - format (natural_language | gherkin | custom)
   - content (text or JSON)
   - created_at

3. **CommitmentArtifact**
   - id (UUID)
   - intent_atoms (array of IDs)
   - committed_by, committed_at
   - invariant_checks (JSON)
   - dependencies (array of Commitment IDs)
   - metadata (JSON - tags, sprint, milestone)
   - supersedes (Commitment ID, nullable)
   - canonical_json (JSON - immutable)

4. **RealizationArtifact**
   - id (UUID)
   - commitment_ref (foreign key)
   - type (code | test | plan | infrastructure)
   - content (text or reference to file)
   - status (pending | executed | validated | failed)
   - created_by (agent or human)
   - created_at

5. **EvidenceArtifact**
   - id (UUID)
   - realization_ref (foreign key)
   - commitment_ref (foreign key)
   - type (test_result | coverage | security | quality | external_failure)
   - outcome (pass | fail | partial | inconclusive)
   - data (JSON - type-specific)
   - timestamp
   - immutable_hash (SHA-256)

6. **GlobalInvariant**
   - id (string - e.g., INV-001)
   - statement (text)
   - rationale (text)
   - enforced_at (commitment_boundary | runtime)
   - check_function (code reference or service endpoint)
   - automatable (boolean)

---

## Development Milestones

### Milestone 1: Intent Creation (Weeks 1-3)

**Goal**: Users can create and organize Intent Atoms

**Deliverables**:

- Backend API for Intent Atom CRUD
- Canvas UI for visual organization
- AI-powered validation and refinement
- Tagging and filtering

**Demo**: Create 10 Intent Atoms for a sample feature, organize on Canvas, iterate with AI feedback

---

### Milestone 2: Validators & Commitment (Weeks 4-6)

**Goal**: Users can add validators and commit intent

**Deliverables**:

- Validator creation and association
- Format translation (natural language → Gherkin)
- Commitment Ceremony UI
- Invariant checking engine
- Immutable Commitment Artifacts

**Demo**: Add validators to Intent Atoms, go through commitment ceremony, see immutable Commitment Artifact created

---

### Milestone 3: Agent Realization (Weeks 7-10)

**Goal**: Agents generate tests and code from committed intent

**Deliverables**:

- Agent orchestration with LangChain/LangGraph
- Test generation from Gherkin
- Code generation from Intent Atoms
- Realization Artifact tracking

**Demo**: Commit intent, watch agent generate tests (failing), watch agent generate code (passing tests)

---

### Milestone 4: Evidence System (Weeks 11-13)

**Goal**: All execution results captured as Evidence, visible in real-time

**Deliverables**:

- Evidence capture (tests, coverage, security)
- Real-time stream
- Timeline visualization
- Dashboard

**Demo**: See Evidence stream as tests run, view timeline showing improvement over iterations, check dashboard metrics

---

### Milestone 5: System Composition (Weeks 14-15)

**Goal**: Multiple commitments can depend on each other, intent can evolve via supersession

**Deliverables**:

- Cross-commit dependencies
- Dependency visualization
- Supersession mechanics
- Realization archival

**Demo**: Create dependent commitments, visualize dependency graph, supersede a commitment and see realizations archived

---

### Milestone 6: Workflow Integration (Weeks 16-17)

**Goal**: Pact fits into Git + CI/CD workflows

**Deliverables**:

- Git commit message integration
- CI/CD webhooks
- Sprint/milestone tagging
- External failure handling

**Demo**: Realizations create Git commits with traceability, CI/CD runs post Evidence back to Pact, filter by sprint

---

### Milestone 7: Polish & MVP Launch (Weeks 18-20)

**Goal**: Production-ready MVP

**Deliverables**:

- Performance optimization
- Error handling and logging
- Documentation
- Deployment automation

**Demo**: Full end-to-end flow from intent creation → commitment → realization → evidence → supersession → Git integration

---

## Success Metrics

### For MVP Launch

**Intent Quality**:

- 90%+ of Intent Atoms pass atomicity checks without major revision
- Average refinement iterations < 3 per Intent Atom

**Commitment Success**:

- 95%+ of commitments pass invariant checks on first attempt
- 0 accidental invariant overrides (overrides should be rare and justified)

**Realization Accuracy**:

- 80%+ of agent-generated tests accurately reflect intent
- 70%+ of agent-generated code passes tests on first attempt
- <10% of failures classified as "intent mismatch" (should be mostly implementation bugs)

**Evidence Completeness**:

- 100% of test executions produce Evidence Artifacts
- 95%+ of realizations have security scan Evidence
- 90%+ of realizations have test quality Evidence

**Developer Experience**:

- Time from "idea" to "working code" reduced by 50% vs. traditional workflow
- Developers rate Pact UX as 7+/10 for clarity and ease of use
- 90%+ of developers can complete intent → commitment → realization cycle within first week

---

## Risk Mitigation

### Risk: LLM quality/reliability

**Mitigation**:

- Extensive prompt engineering and testing
- Fallback to templates when LLM fails
- Human-in-the-loop for critical decisions
- Monitor LLM outputs and iterate prompts

### Risk: Canvas UX complexity

**Mitigation**:

- Start with simple drag-and-drop (no fancy grouping)
- Iterate based on user feedback
- Provide alternative list view for users who don't want visual organization

### Risk: Agent-generated code quality

**Mitigation**:

- Focus on test generation first (easier to validate)
- Use conservative, well-tested code patterns
- Human review before merging to main
- Iterate based on Evidence (test failures indicate gaps)

### Risk: Performance at scale

**Mitigation**:

- Start with PostgreSQL JSON columns (flexible, fast for < 10K atoms)
- Add indexing when needed
- Consider read replicas or caching layer if query load grows
- Archive old Evidence to separate storage

### Risk: Scope creep

**Mitigation**:

- Stick to MVP feature list (Phases 1-8)
- Defer collaboration, advanced analytics, advanced search to post-MVP
- Say "no" to features that don't support core intent → commitment → realization → evidence flow

---

## Getting Started (Day 1)

1. **Set up repository**:

   ```bash
   mkdir pact-app
   cd pact-app
   git init
   ```

2. **Create backend (NestJS)**:

   ```bash
   npx @nestjs/cli new pact-backend
   cd pact-backend
   npm install @nestjs/typeorm typeorm pg
   ```

3. **Create frontend (Next.js)**:

   ```bash
   npx create-next-app@latest pact-frontend
   cd pact-frontend
   npm install @anthropic-ai/sdk langchain
   ```

4. **Set up database**:

   ```bash
   docker-compose up -d postgres
   ```

5. **Create first entity (IntentAtom)**:
   - Define TypeORM entity
   - Create CRUD service
   - Create REST controller
   - Write unit tests (from Gherkin scenarios)

6. **Implement first scenario**:
   - Pick: "User creates an Intent Atom with natural language"
   - Write Cucumber feature file
   - Write step definitions
   - Run test (Red)
   - Implement (Green)
   - Refactor

7. **Iterate**!

---

## Key Design Decisions Captured from Interview

1. **Intent format**: Hybrid natural language + AI validation (not pure Gherkin, not pure free text)
2. **Atomicity guidance**: AI analysis + complexity heuristics + iterative refinement prompts
3. **Grouping**: Canvas metaphor (visual, non-semantic)
4. **Completeness**: Emergent validators + coverage analysis
5. **Commitment UX**: Explicit ceremony (multi-step, significant)
6. **Invariant failures**: Block + override with justification + suggestions + logging (RBAC future)
7. **Validators**: System adapts to user expression, Gherkin baseline, configurable
8. **Supersession**: Archived with reference (full audit trail)
9. **Agent proactivity**: Highly proactive (suggests, asks, proposes)
10. **Failure analysis**: AI classifies as bug vs. intent mismatch
11. **Evidence priority**: Test results + coverage + security scans + test quality
12. **Evidence UX**: Real-time stream + timeline + dashboard
13. **Circular dependencies**: Block commitment
14. **Cross-commit deps**: Explicit dependency graph
15. **External failures**: Capture as evidence, retry with backoff
16. **Workflow integration**: Sprint/milestone tagging + Git branch + CI/CD hooks

---

## Questions for Initial Development

Before starting implementation, confirm:

1. **Hosting preferences**: Self-hosted vs. cloud-hosted?
2. **LLM provider**: Anthropic Claude (default) or allow configuration for others?
3. **Authentication**: Start with simple username/password or integrate with OAuth providers?
4. **Single vs. multi-tenant**: Build for single user first or plan for teams from the start?
5. **Deployment target**: Local development? Staging environment? Production?

---

**Ready to build!** Follow the phase-by-phase implementation order, write tests first, and iterate based on Evidence. Pact will build itself using its own principles.
