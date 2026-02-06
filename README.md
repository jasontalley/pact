# Pact

> **Intent-Driven Software Development System**

Pact is a system for capturing product intent and translating it into code, designed specifically for AI-assisted, test-driven development. It helps teams move from unstructured requirements and conversations to fully-functional, tested systems through structured workflows and intelligent synthesis.

[![Test Coverage](https://img.shields.io/badge/coverage-88.46%25-brightgreen)](./coverage)
[![Phase](https://img.shields.io/badge/phase-0%20%28Weeks%201--4%29-yellow)](./docs/implementation-checklist.md)
[![License](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

---

## 🎯 What is Pact?

In an era where code execution is abundant and iteration is infinite, **intent becomes the scarce resource**. Pact provides a structured framework for:

- **Capturing Intent**: Convert ideas into irreducible behavioral primitives (Intent Atoms)
- **Validating Quality**: Ensure intent is observable, falsifiable, and implementation-agnostic
- **Committing Intent**: Explicit phase transition where ambiguity collapses and intent becomes immutable
- **Realizing Intent**: Generate code and tests from committed intent
- **Proving Intent**: Collect evidence that realization satisfies committed intent

### Core Philosophy

**Software is not code—software is realized intent.**

Pact recognizes that:

- Intent has an atomic unit (the smallest irreducible behavioral primitive)
- Validators are the substrate (tests are proof, not documentation)
- There is one semantic phase shift (the Commitment Boundary)
- Agents change execution, not responsibility (agents propose; humans decide)

---

## 🚀 Quick Start

### Prerequisites

- **Docker** and **Docker Compose** installed
- **Git**
- **Node.js 20+** (optional, for local development)

### Installation

1. **Clone the repository**:

   ```bash
   git clone <repository-url>
   cd pact
   ```

2. **Configure environment** (optional - defaults work for development):

   ```bash
   cp .env.example .env.development
   # Edit .env.development if needed (e.g., add your OPENAI_API_KEY)
   ```

3. **Start the development environment**:

   ```bash
   docker-compose up -d
   ```

4. **Verify services are running**:

   ```bash
   docker-compose ps
   # Should show: postgres (healthy), pact-app (running), pact-test (running), redis (running)
   ```

5. **Check application health**:

   ```bash
   curl http://localhost:3000/health
   # Should return: {"status":"ok","timestamp":"..."}
   ```

6. **View API documentation**:
   Open <http://localhost:3000/api> in your browser for Swagger documentation.

---

## 📦 Production Deployment

For production deployment, see the comprehensive [Deployment Guide](./docs/deployment-guide.md).

### Quick Production Setup

```bash
# 1. Copy production environment template
cp .env.production.example .env.production

# 2. Edit .env.production with your production values
nano .env.production

# 3. Start production services
docker-compose -f docker-compose.prod.yml --env-file .env.production up -d

# 4. Run database migrations
docker-compose -f docker-compose.prod.yml exec app npm run migration:run

# 5. Check application health
curl https://your-domain.com/health
```

### Deployment Options

- **Docker Compose** - Recommended for self-hosting ([guide](./docs/deployment-guide.md#production-deployment-with-docker-compose))
- **Manual Deployment** - Node.js + PostgreSQL ([guide](./docs/deployment-guide.md#manual-deployment-no-docker))
- **Cloud Platforms** - AWS, GCP, Heroku, Render ([guide](./docs/deployment-guide.md#cloud-platform-deployments))

See [docs/deployment-guide.md](./docs/deployment-guide.md) for detailed instructions, security considerations, backup strategies, and troubleshooting.

---

## 📖 Core Concepts

### Intent Atoms

**Intent Atoms** are the smallest unit of committed intent. They are:

- **Observable**: Can be seen in a running system
- **Falsifiable**: Can be proven wrong
- **Implementation-agnostic**: Describe WHAT, not HOW
- **Immutable after commitment**: Can only be superseded, never edited

**Example**:

```bash
IA-001: "User authentication must complete within 2 seconds"
```

### Molecules

**Molecules** are descriptive groupings of atoms that represent features or capabilities. They are:

- **Mutable**: Can be recomposed endlessly
- **Non-authoritative**: Atoms are truth; molecules are lenses
- **Human-facing**: For organization and understanding

**Example**:

```bash
M-001: Secure Checkout
  - IA-003: Payment processes securely
  - IA-004: Payment completes within 5 seconds
```

### Commitment Boundary

The **Commitment Boundary** is the explicit phase transition where:

- Ambiguity collapses
- Interpretation freezes
- Intent becomes immutable
- Global invariants are enforced

Only humans can authorize commitment (INV-006).

### Test-Atom Coupling

Tests explicitly reference atoms via `@atom` annotations:

```typescript
// @atom IA-003
it('processes payment securely using TLS 1.3', () => {
  // Test implementation
});
```

This creates traceable links between intent, validation, and evidence.

---

## 🚀 Recent Achievements (Phases 15-17)

### Phase 17: Local/Remote Split ✓

**The Problem**: Pact was tightly coupled to filesystem access, preventing remote deployment and limiting integration options.

**The Solution**: Decoupled content access via ContentProvider abstraction and created a standalone client SDK.

**What Was Built**:

1. **ContentProvider Abstraction Layer**
   - Refactored 40+ direct `fs.*` calls across 13 source files
   - Three implementations: Filesystem, PreRead (in-memory), WriteProvider
   - Zero behavioral changes — existing tests pass with no regressions

2. **@pact/client-sdk Package** (99 passing tests)
   - Zero NestJS dependencies (Node.js built-ins + fetch only)
   - Full TypeScript support with typed API clients
   - Modules: PactClient, FileReader, GitClient, CoverageCollector, PatchApplicator
   - Commands: `pull()` (cache Main state), `check()` (local plausibility report)

3. **Pre-Read Reconciliation API**
   - `POST /agents/reconciliation/analyze/pre-read` endpoint
   - Submit file contents as JSON payload (no filesystem required)
   - Creates PreReadContentProvider for reconciliation pipeline
   - Identical results to filesystem-based reconciliation

4. **Main State Caching** (Local = Plausible, Canonical = True)
   - Minimal local state: `.pact/main-cache.json` (read-only) + `.pact/local-report.json`
   - `pull()` replaces cache entirely (no merge, no conflicts)
   - Local reconciliation produces advisory plausibility reports
   - CI attestation is the single promotion gate from plausible to true

5. **Scope Middleware** (23 passing tests)
   - Extracts `x-pact-project-id` and `x-pact-scope` headers
   - Default scope: `'main'` (agents see Main by default)
   - Two scopes: `'main'` (canonical) and `'local'` (plausibility)

6. **Integration Examples**
   - VSCode extension pattern (pull, check, apply patches)
   - CLI tool pattern (pact pull, pact check, pact drift)
   - CI/CD pipeline pattern (CI-attested canonical updates)

**Deployment Models Enabled**:
- Co-located (current) - Same machine, direct filesystem
- Local Client + Remote - VSCode/CLI reads files, sends via API
- CI/CD Pipeline - GitHub Action uploads content, CI-attested updates
- PactHub (future) - Multi-tenant shared remote

### Phase 16: Drift Management ✓

**The Problem**: Gaps between committed intent and implementation reality were invisible and unbounded.

**The Solution**: Make drift visible, time-bounded, and actionable with CI attestation as the canonical truth gate.

**What Was Built**:

1. **Drift Debt Tracking**
   - DriftDebt entity with 4 types: `orphan_test`, `commitment_backlog`, `stale_coupling`, `uncovered_code`
   - Status: `open`, `acknowledged`, `resolved`, `waived`
   - Severity: `critical`, `high`, `medium`, `low` (auto-escalates with age)
   - Migration: `1738569600000-CreateDriftDebt.ts`

2. **CI Attestation Gate**
   - ReconciliationRun extended with `attestationType`: `'local'` (advisory) or `'ci-attested'` (canonical)
   - **Only CI-attested runs create/update drift debt records**
   - Local runs produce plausibility reports, no server state changes
   - Migration: `1738656000000-AddExceptionAndAttestation.ts`

3. **Exception Lanes & Convergence Policies**
   - Three lanes: `'normal'` (14d), `'hotfix-exception'` (3d), `'spike-exception'` (7d)
   - Justification required for hotfix/spike
   - Project-level policy overrides (configurable deadlines)
   - `blockOnOverdueDrift` - Optional build blocker

4. **Drift API & Metrics**
   - DriftController with 9 endpoints (list, summary, overdue, aging, convergence, acknowledge, waive, resolve)
   - DriftMetricsService for dashboard metrics
   - Integration with MetricsSnapshot (daily drift tracking)

5. **Dashboard Components**
   - DriftDebtCard (total, by type, overdue count, convergence score)
   - CommitmentBacklogCard (committed atoms needing tests)
   - DriftTrendChart (time-series: new, resolved, net)
   - Drift management page (`/drift`) with filters and bulk actions
   - Drift detail page (`/drift/[id]`) with timeline

### Phase 15: Pact Main Governance ✓

**The Problem**: All atoms were equally "canonical" — no distinction between experimental and production-ready intent.

**The Solution**: Introduce "Pact Main" — a governed subset promoted through change set approval.

**What Was Built**:

1. **Pact Main State Machine**
   - Extended atom lifecycle: `proposed` → (change set approval) → `draft` → `committed` → `superseded`
   - `promotedToMainAt` timestamp marks atoms "on Main"
   - `changeSetId` links atoms to governed change sets
   - Migration: `1738483200000-AddPactMainGovernance.ts` with backfill (existing committed atoms grandfathered)

2. **Governance Service Layer**
   - `propose(dto, changeSetId)` - Create proposed atom in change set
   - `convertToDraft(id)` - Escape hatch to remove from governance
   - Modified `commit()` - Sets `promotedToMainAt`, rejects proposed atoms
   - Proposed atoms are mutable (same as drafts) until change set commit

3. **Scope Filtering**
   - `?scope=main` - Only atoms where `promotedToMainAt IS NOT NULL`
   - `?scope=proposed` - Only `status='proposed'` atoms
   - `?scope=all` - All atoms (backward-compatible default)

4. **Reconciliation Integration**
   - `POST /agents/reconciliation/runs/:runId/create-change-set`
   - Route recommendations into governed change sets (atoms as `proposed`)
   - Direct apply path still works (atoms as `draft`)
   - Frontend offers both "Apply" and "Create Change Set" options

5. **API & Frontend**
   - `POST /atoms/propose`, `PATCH /atoms/:id/convert-to-draft`
   - Scope toggle on atoms page (All Atoms | Main | Proposed)
   - Proposed status badge (amber/orange styling)
   - WebSocket events: `atom:proposed`, `atom:promotedToMain`

**Architecture Decisions**:
- **Backward compatible** - Existing committed atoms grandfathered as "on Main"
- **Governance is additive** - Direct commit path still works; governance is opt-in
- **Scope filtering is read-only** - `?scope=main` is a filter, not a separate data store
- **Proposed atoms are mutable** - Same rules as draft until change set commit

---

## 🛠️ Development Workflow

### Running the Application

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop all services
docker-compose down
```

### Running Tests

```bash
# Run unit tests
docker-compose run --rm test npm run test

# Run tests in watch mode
docker-compose run --rm test npm run test:watch

# Run tests with coverage
docker-compose run --rm test npm run test:cov

# Run E2E tests
docker-compose run --rm test npm run test:e2e

# Run BDD/Cucumber tests
docker-compose run --rm test npm run test:bdd
```

### Database Operations

```bash
# Connect to database
docker-compose exec postgres psql -U pact -d pact_development

# View tables
docker-compose exec postgres psql -U pact -d pact_development -c "\dt"

# Run migrations
docker-compose run --rm app npm run migration:run

# Revert migration
docker-compose run --rm app npm run migration:revert
```

### Code Quality

```bash
# Lint code
docker-compose run --rm app npm run lint

# Format code
docker-compose run --rm app npm run format

# Run test quality analysis
docker-compose run --rm app npm run test:quality
```

---

## 📁 Project Structure

```bash
pact/
├── src/                    # NestJS application source
│   ├── modules/           # Feature modules (atoms, molecules, validators, etc.)
│   ├── common/            # Shared utilities, guards, interceptors
│   ├── config/            # Configuration files
│   └── main.ts            # Application entry point
├── test/                  # E2E and integration tests
├── atoms/                 # Committed intent atoms (DATA - persists)
├── molecules/             # Descriptive groupings of atoms (DATA - persists)
├── global/                # System-wide invariants (DATA - persists)
├── ideas/                 # Pre-commitment exploration (DATA - persists)
├── docs/                  # Documentation (DATA - persists)
├── bootstrap/             # Temporary scaffolding (CODE - will be demolished)
│   ├── seed/              # Initial atom/invariant creation tools
│   ├── migration/         # Import legacy tests, infer atoms
│   ├── tooling/           # CLI hacks, file generators
│   └── runtime/           # Permissive enforcement modes
└── docker/                # Docker configuration files
```

---

## 🏗️ Architecture

Pact follows a **self-hosting pattern** similar to compiler bootstrapping:

- **Atoms**: Irreducible behavioral primitives (immutable after commitment)
- **Molecules**: Descriptive groupings of atoms (mutable lenses for human understanding)
- **Validators**: Tests and validation rules linked to atoms
- **Evidence**: Immutable execution results proving correctness
- **Agents**: AI assistants that propose changes (humans decide and commit)

### Technology Stack

- **Backend**: NestJS + TypeScript
- **Database**: PostgreSQL (10 tables: 8 core + 2 LLM tracking)
- **Frontend**: React/Next.js (planned)
- **Infrastructure**: Docker, Docker Compose
- **AI/Agents**: LangChain, OpenAI, Model Context Protocol (MCP)
- **Testing**: Jest (unit), Cucumber/Gherkin (BDD), Supertest (API)

---

## 🔒 Global Invariants

Pact enforces 9 global invariants at the Commitment Boundary:

1. **INV-001**: Explicit commitment required
2. **INV-002**: Intent atoms must be behaviorally testable
3. **INV-003**: No ambiguity in commitment artifacts
4. **INV-004**: Commitment is immutable
5. **INV-005**: Traceability is mandatory
6. **INV-006**: Agents may not commit intent
7. **INV-007**: Evidence is first-class and immutable
8. **INV-008**: Rejection is limited to invariants
9. **INV-009**: Post-commitment ambiguity must be resolved explicitly

See [ingest/invariants.md](./ingest/invariants.md) for full definitions.

---

## 🤖 Agent System

Pact uses specialized AI agents to automate key transformations while maintaining human control.

### Current Agents

#### ✅ Atomization Agent

Converts ideas/requirements into properly-formed atoms with atomicity and testability analysis.

#### ✅ Atom Quality Validator

Reviews proposed atoms for quality (5 dimensions, 0-100 score) before commitment.

#### 🔨 Test-Atom Coupling Agent (In Progress)

Detects orphan tests, unrealized atoms, and test-atom mismatches (INV-009 violations).

#### ⏳ Test Quality Analyzer (Pending)

Enforces 7 quality dimensions on tests before implementation (Red phase gate).

**See**: [ideas/pact-agents.md](./ideas/pact-agents.md) for full agent specifications.

---

## 📊 Current Status

**Phase 17 (Local/Remote Split)**: ✅ **Complete** (2026-02-05)

- ✅ ContentProvider abstraction (40+ fs.* calls refactored)
- ✅ @pact/client-sdk npm package (99 passing tests)
- ✅ Pre-read reconciliation API
- ✅ Main state cache (Local = plausible, Canonical = true)
- ✅ Scope middleware (23 passing tests)
- ✅ Examples: VSCode, CLI, CI/CD integration

**Phase 16 (Drift Management)**: ✅ **Complete** (2026-02-05)

- ✅ Drift debt tracking (4 types: orphan_test, commitment_backlog, stale_coupling, uncovered_code)
- ✅ CI attestation gate (local = advisory, CI = canonical)
- ✅ Exception lanes (normal, hotfix, spike) with convergence policies
- ✅ Drift API & metrics (summary, overdue, aging, convergence)
- ✅ Dashboard components (DriftDebtCard, CommitmentBacklogCard, DriftTrendChart)

**Phase 15 (Pact Main Governance)**: ✅ **Complete** (2026-02-05)

- ✅ Pact Main state machine (proposed → draft → committed)
- ✅ Governance service layer (propose, convertToDraft, scope filtering)
- ✅ API endpoints (?scope=main|proposed|all)
- ✅ Reconciliation integration (create change sets from runs)
- ✅ Frontend scope toggle and proposed status badges

**Earlier Phases**: ✅ **Complete**

- ✅ Phase 14: Epistemic Intelligence (test quality + coverage)
- ✅ Phase 13: Molecule lens system
- ✅ Phase 8-12: Foundation (database, atoms, LLM, agents)

**Test Coverage**: 88%+ backend, 99 client SDK tests, 23 scope middleware tests

**See**: [CHANGELOG.md](./CHANGELOG.md) for complete release notes.

---

## 🗺️ Development Roadmap

### ✅ Phase 17: Local/Remote Split (Complete - 2026-02-05)

Decoupled Pact from filesystem, enabling remote deployment via client SDK.

**Key Achievements**:
- ContentProvider abstraction layer (40+ fs.* calls refactored)
- @pact/client-sdk npm package (99 tests passing)
- Pre-read reconciliation API (submit content via JSON payload)
- Main state caching (read-only pull, no push/pull sync)
- Scope middleware for project isolation
- Deployment models: Co-located, Local+Remote, CI/CD, PactHub (future)

### ✅ Phase 16: Drift Management (Complete - 2026-02-05)

Made drift between Pact Main and reality visible, time-bounded, and actionable.

**Key Achievements**:
- Drift debt tracking (4 types with severity auto-escalation)
- CI attestation gate (local = plausible, CI = canonical)
- Exception lanes (normal/hotfix/spike) with convergence policies
- Drift API & metrics (summary, overdue, aging, convergence score)
- Dashboard components for visualization

### ✅ Phase 15: Pact Main Governance (Complete - 2026-02-05)

Introduced "Pact Main" — governed subset of atoms promoted through change sets.

**Key Achievements**:
- Atom state machine extended with `proposed` status
- `promotedToMainAt` timestamp marking atoms "on Main"
- Scope filtering (?scope=main|proposed|all)
- Change set governance integration with reconciliation
- Frontend scope toggle and proposed status badges

### ✅ Phase 8-14: Foundation (Complete - 2026-01-XX)

Core infrastructure, atoms, molecules, epistemic intelligence.

**Key Achievements**:
- Database schema (21 tables across 5 categories)
- Atom CRUD with quality scoring (5 dimensions, 0-100)
- LLM service abstraction (OpenAI, Anthropic)
- Atomization agent + reconciliation pipeline
- Molecule lens system with hierarchical nesting
- Test quality as Red phase gate
- Coverage as epistemic intelligence

### 🔜 Phase 18: PactHub Multi-Tenant (Planned)

Multi-instance collaboration with bidirectional sync (deferred from Phase 17).

### 🔜 Phase 19: Advanced Analytics (Planned)

Epistemic certainty trends, drift correlation analysis, predictive quality scoring.

### 🔜 Phase 20: Self-Hosting Completion (Planned)

Pact validates Pact, bootstrap scaffolding demolished.

**See**: [CHANGELOG.md](./CHANGELOG.md) for detailed release notes and [docs/](./docs/) for implementation guides.

---

## 📚 Documentation

### For Users

- **[Quick Start](#-quick-start)** - Get started in 5 minutes
- **[Core Concepts](#-core-concepts)** - Understand Intent Atoms, Molecules, Commitment Boundary
- **[Development Workflow](#️-development-workflow)** - Daily development commands

### For Developers

- **[CLAUDE.md](./CLAUDE.md)** - Comprehensive developer documentation
- **[docs/index.md](./docs/index.md)** - Detailed system documentation
- **[docs/implementation-guide-2026-01-12.md](./docs/implementation-guide-2026-01-12.md)** - Implementation roadmap

### For Architects

- **[docs/architectural-review-response-2026-01-12.md](./docs/architectural-review-response-2026-01-12.md)** - Architectural decisions
- **[ingest/manifesto.md](./ingest/manifesto.md)** - The Intent-Centric Software Manifesto
- **[ingest/taxonomy.md](./ingest/taxonomy.md)** - ProdOS Canonical Taxonomy

### Key Documents

- **[Requirements Synthesis](./docs/requirements/requirements-synthesis-2026-01-12.md)** - Full requirements
- **[Acceptance Criteria](./docs/acceptance-criteria/pact-acceptance-criteria-2026-01-12.md)** - 90 test scenarios
- **[Test Quality Metrics](./ingest/test-quality.md)** - Test quality taxonomy
- **[Agent Specifications](./ideas/pact-agents.md)** - Agent capabilities

---

## 🎓 Development Philosophy

- **No Host Dependencies**: All development in Docker containers
- **Development Matches Production**: No inappropriate mocking
- **Test Quality as Red Phase Gate**: Tests must meet quality standards before implementation
- **Bootstrap Scaffolding**: Temporary code with explicit demolition charges
- **Agents Propose, Humans Decide**: INV-006 enforcement

---

## 🤝 Contributing

Pact is currently in active development. See [docs/implementation-checklist.md](./docs/implementation-checklist.md) for current status and next steps.

### Development Setup

1. Follow [Quick Start](#-quick-start) to set up the environment
2. Read [CLAUDE.md](./CLAUDE.md) for development guidelines
3. Check [docs/implementation-checklist.md](./docs/implementation-checklist.md) for current tasks
4. Follow test-driven development (TDD) workflow
5. Ensure all tests pass quality gates before committing

---

## 📝 License

UNLICENSED - Private project

---

## 🙋 Support

For issues or questions:

- See [docs/index.md](./docs/index.md) for system documentation
- Check [docs/implementation-checklist.md](./docs/implementation-checklist.md) for current status
- Review [CLAUDE.md](./CLAUDE.md) for developer guidelines

---

## 🌟 Why Pact?

Traditional software development suffers from:

- **Intent Loss**: Requirements drift from original vision
- **Ambiguity Accumulation**: Unclear specifications lead to implementation errors
- **Test-Intent Decoupling**: Tests become disconnected from original intent
- **Agent Confusion**: AI assistants lack clear boundaries for decision-making

Pact solves these problems by:

- **Preserving Intent**: Intent doesn't drift from original vision
- **Enforcing Quality**: Quality gates prevent poor intent from being committed
- **Tracing Decisions**: Every test, every line of code traces back to committed intent
- **Enabling Agents**: Clear boundaries allow AI assistants to help without confusion
- **Building Confidence**: Evidence proves that realization satisfies intent

**Pact is not just a tool—it's a new way of thinking about software as realized intent.**

---

**Ready to get started?** Follow the [Quick Start](#-quick-start) guide above!
