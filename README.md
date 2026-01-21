# Pact

> **Intent-Driven Software Development System**

Pact is a system for capturing product intent and translating it into code, designed specifically for AI-assisted, test-driven development. It helps teams move from unstructured requirements and conversations to fully-functional, tested systems through structured workflows and intelligent synthesis.

[![Test Coverage](https://img.shields.io/badge/coverage-88.46%25-brightgreen)](./coverage)
[![Phase](https://img.shields.io/badge/phase-0%20%28Weeks%201--4%29-yellow)](./docs/implementation-checklist.md)
[![License](https://img.shields.io/badge/license-UNLICENSED-red)](./LICENSE)

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

**Phase 0 (Weeks 1-4)**: Foundation infrastructure and core agents

- ✅ **Complete**: Development infrastructure (Docker, NestJS, PostgreSQL)
- ✅ **Complete**: Atomization Agent
- ✅ **Complete**: Atom Quality Validator
- 🔨 **In Progress**: Test-Atom Coupling Agent
- ⏳ **Pending**: Test Quality Analyzer Integration

**Test Coverage**: 88.46% (117 tests passing)

**See**: [docs/implementation-checklist.md](./docs/implementation-checklist.md) for detailed status.

---

## 🗺️ Development Roadmap

### Phase 0: Foundation (Weeks 1-4) - Current

Core infrastructure and first 4 agents operational.

### Phase 1: Core Intent System (Weeks 5-8)

Intent Atom CRUD API, Canvas UI, Commitment ceremony.

### Phase 2: Validators & Commitment (Weeks 9-12)

Validator definition, format translation, Commitment ceremony UI.

### Phase 3: Commitment Boundary (Weeks 13-16)

Explicit commitment ceremony, global invariant checking, Commitment Artifact generation.

### Phase 4: Agent-Driven Realization (Weeks 17-20)

Test generation from validators, code generation from Intent Atoms.

### Phase 5: Evidence Collection (Weeks 21-24)

Evidence Artifact generation, real-time stream, timeline view.

**See**: [docs/implementation-guide-2026-01-12.md](./docs/implementation-guide-2026-01-12.md) for full roadmap.

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
