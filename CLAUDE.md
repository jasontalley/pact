# Pact

## Project Overview

Pact is a system for capturing product intent and translating it into code, designed specifically for AI-assisted, test-driven development. It helps teams move from unstructured requirements and conversations to fully-functional, tested systems through structured workflows and intelligent synthesis.

**Core Mission**: Bridge the gap between product vision and implementation by leveraging AI to analyze requirements, generate acceptance criteria, and guide development.

**Key Technologies**:

- Backend: NestJS + TypeScript
- Database: PostgreSQL/MySQL
- Frontend: React/Next.js
- Infrastructure: Docker
- AI/Agents: MCP (Model Context Protocol), LangChain/LangGraph
- Development Approach: Test-driven development (TDD)

**Architecture**: Full-stack web application with microservices-ready design patterns.

---

## Directory Structure

```bash
pact/
├── src/
│   ├── modules/          # NestJS feature modules
│   ├── common/           # Shared utilities, guards, interceptors
│   ├── config/           # Configuration files
│   └── main.ts           # Application entry point
├── test/                 # E2E and integration tests
├── frontend/             # React/Next.js application
│   ├── components/       # Reusable UI components
│   ├── pages/            # Next.js pages
│   └── lib/              # Frontend utilities
├── .claude/
│   └── skills/           # Claude skills for Pact workflows
├── ideas/                # Pre-commitment exploration (DATA - persists)
├── atoms/                # Committed intent atoms (DATA - persists)
├── molecules/            # Descriptive groupings of atoms (DATA - persists)
├── global/               # System-wide invariants (DATA - persists)
├── docs/                 # Traditional wiki documentation (DATA - persists)
├── bootstrap/            # Temporary scaffolding (CODE - will be demolished)
│   ├── README.md         # Scaffold ledger (tracks demolition plan)
│   ├── seed/             # Initial atom/invariant creation tools
│   ├── migration/        # Import legacy tests, infer atoms
│   ├── tooling/          # CLI hacks, file generators
│   └── runtime/          # Permissive enforcement modes
├── CLAUDE.md             # This file - project context for Claude
└── README.md             # User-facing documentation
```

---

## Intent Artifact Management

**The Bootstrapping Problem**: Pact is a system for managing intent, but we need to capture intent for building Pact before Pact exists. This section defines conventions for managing pre-Pact intent artifacts using the atom/molecule model.

**Guiding Principle**: The system IS the composition of all atoms. Molecules are descriptive lenses for human understanding. Tests are the coupling mechanism between code and intent.

### Core Concepts

#### Atoms (Intent Atoms)

**What**: Irreducible behavioral primitives - the atomic unit of committed intent.

**Characteristics**:

- Observable and falsifiable (testable)
- Implementation-agnostic (describes behavior, not implementation)
- Individually replaceable without rewriting the universe
- **Immutable after commitment** (can only be superseded)
- Can be referenced by multiple molecules (reusable)

**Storage**: `/atoms/` - flat directory, no subdirectories needed

**Format**: Each atom consists of two files:

- `IA-{ID}.md` - Human-readable description
- `IA-{ID}.json` - Machine-readable metadata

**Example**:

```text
atoms/
├── IA-001-user-authenticates.md
├── IA-001-user-authenticates.json
├── IA-002-session-expires-after-timeout.md
├── IA-002-session-expires-after-timeout.json
├── IA-003-payment-processes-securely.md
└── IA-003-payment-processes-securely.json
```

#### Molecules (Commitment Artifacts)

**What**: Descriptive groupings of atoms that represent features, capabilities, or user-facing functionality. Molecules provide human-readable context for collections of atoms.

**Key Insight**: Molecules are **lenses**, not truth. The system is the composition of atoms; molecules help humans understand how atoms relate.

**Characteristics**:

- Contain description + links to constituent atoms
- **Mutability doesn't matter** (they're views, not commitments)
- Atoms can be shared across multiple molecules
- Users can endlessly recompose molecules to view atoms through different lenses

**Storage**: `/molecules/`

**Format**: Markdown files with frontmatter linking to atoms

**Example**:

```markdown
# M-001: Secure Checkout

**Description**: Users can complete payment transactions securely and quickly.

**Atoms**:
- [IA-003: Payment processes securely](../atoms/IA-003-payment-processes-securely.md)
- [IA-004: Payment completes within 5 seconds](../atoms/IA-004-payment-completes-within-5sec.md)

**Context**: This molecule represents the core checkout flow...
```

Later, atoms can be reused:

```markdown
# M-002: Authenticated Checkout

**Description**: Logged-in users complete purchases with saved payment info.

**Atoms**:
- [IA-001: User authenticates](../atoms/IA-001-user-authenticates.md)
- [IA-003: Payment processes securely](../atoms/IA-003-payment-processes-securely.md) ← Reused!
- [IA-004: Payment completes within 5 seconds](../atoms/IA-004-payment-completes-within-5sec.md) ← Reused!
```

#### Ideas (Pre-Commitment Exploration)

**What**: The working directory for unformed intent. Ideas are iterated on until they're ready to crystallize into atoms.

**Git Analogy**: `/ideas` = working directory + staging area

**Characteristics**:

- **Mutable**: Update freely as understanding evolves
- **Unstructured**: Natural language, sketches, questions, explorations
- **Informal**: No strict format required

**Storage**: `/ideas/`

**When to Move to Atoms**: When an idea is "sufficiently sound" - meaning:

- Behavioral intent is clear and testable
- Observable outcomes are defined
- Ambiguity has been resolved enough to commit

**Lifecycle**:

1. Start exploration in `/ideas/{topic}.md`
2. Refine through conversation and iteration
3. When ready, crystallize into atoms in `/atoms/`
4. Optionally create or update molecule(s) in `/molecules/`

#### Global Invariants

**What**: System-wide rules that apply to all atoms (meta-rules, not atoms themselves).

**Storage**: `/global/` (bootstrap location until Pact manages its own invariants)

**Examples**: INV-001 through INV-009 (commitment required, immutability, traceability, etc.)

**Characteristics**:

- Apply universally to the entire system
- Enforced at the Commitment Boundary
- Rarely change (foundational truths)

#### Docs (Traditional Wiki)

**What**: Long-form explanations, architectural decisions, implementation guides, analyses.

**Storage**: `/docs/`

**Purpose**: Traditional documentation that explains the "why" and "how" of the system.

**Relationship to Other Artifacts**:

- READMEs in each directory provide real-time, evolving context
- `/docs` provides eventual summarization and synthesis
- Compare READMEs to `/docs` periodically for eventual consistency

**When to Write**:

- Architectural decisions that need long-form explanation
- Implementation guides (like the 8-phase plan)
- Analyses and reviews
- Synthesis of requirements from conversations

### The Coupling Mechanism: Tests

**Critical Insight**: Tests are how code couples to atoms. This is the validator that makes intent enforceable.

**The Linkage**:

```text
Code → Tests → Atoms
```

**How It Works**:

1. **Test with atom reference** → Atom is realized ✓

   ```typescript
   // test/payment.spec.ts
   // @atom IA-003
   it('processes payment securely using TLS 1.3', () => { ... })
   ```

2. **Test without atom reference** → Atom needs generation (reverse engineering)

   ```typescript
   // test/legacy.spec.ts
   it('validates user input', () => { ... })
   // Missing @atom reference → Need to create atom retroactively
   ```

3. **Code without test** → Not validated (standard coverage catches this)

**Why This Matters**:

- **Pact works with existing codebases**: Tests can be analyzed to reverse-engineer atoms, even when original intent (molecules) can only be inferred
- **Tests become first-class**: They're not just validation, they're the binding contract between intent and realization
- **Coverage metrics get meaning**: "No test" now means "no committed intent", not just "uncovered code"

### Directory-Level READMEs

**Purpose**: Living documentation for agent and human orientation.

**Location**: `{directory}/README.md` in each directory (`/ideas`, `/atoms`, `/molecules`, `/global`, `/docs`, `/src`)

**Content**:

- What this directory contains
- Current status and recent updates
- Conventions specific to this directory
- Links to related directories or key files

**Maintenance**:

- Update in real-time as system evolves
- Treat as source of truth for current state
- Compare to `/docs` periodically for eventual consistency summarization

### Git Analogy (Complete Model)

```text
/ideas       = git working directory + staging
Move to /atoms = git commit (concrete but local)
Create molecule = compose commits into feature branch
Write tests  = git push (makes it enforceable)
```

**Why This Works**:

- Developers already understand git's mental model
- Clear phase boundaries (working → committed → shared → enforced)
- Natural flow from exploration to enforcement

### Workflow Examples

#### Example 1: New Feature (Ideas → Atoms → Molecules → Tests)

1. **Exploration**: Draft initial thinking in `/ideas/user-notifications.md`
2. **Refinement**: Iterate with agent to clarify behavior
3. **Atomization**: Create atoms:
   - `IA-050-user-receives-email-notification.md`
   - `IA-051-notification-sent-within-1-minute.md`
4. **Molecule Creation**: Create `M-010-user-notifications.md` linking to IA-050, IA-051
5. **Realization**: Write code implementing atoms
6. **Validation**: Write tests referencing atoms:

   ```typescript
   // @atom IA-050
   it('sends email notification to user', () => { ... })
   ```

#### Example 2: Existing Codebase (Reverse Engineering)

1. **Discovery**: Find test without atom reference:

   ```typescript
   it('validates email format', () => { ... })
   ```

2. **Atom Generation**: Create `IA-100-email-must-be-valid-format.md`
3. **Test Annotation**: Add atom reference:

   ```typescript
   // @atom IA-100
   it('validates email format', () => { ... })
   ```

4. **Molecule Inference**: Optionally create molecule grouping related atoms

#### Example 3: Reusing Atoms Across Molecules

1. **Molecule M-001** uses atoms IA-003, IA-004 (secure, fast checkout)
2. **Molecule M-002** reuses IA-003, IA-004 + adds IA-001 (authenticated checkout)
3. **Molecule M-003** reuses IA-003 for a different feature (subscription renewal)
4. **Result**: Atoms are composed into different contexts without duplication

### Migration Path (Bootstrap to Production)

**Current State (Bootstrap)**:

- `/ideas`, `/atoms`, `/molecules`, `/global` are filesystem directories
- READMEs provide living context
- Manual process for moving ideas → atoms → molecules

**Future State (Pact-Managed)**:

1. **Phase 1**: Pact imports atoms from filesystem into database
2. **Phase 2**: Pact manages molecule composition via UI
3. **Phase 3**: Pact auto-detects test → atom linkage via `@atom` annotations
4. **Phase 4**: Pact generates Evidence Artifacts from test execution
5. **Phase 5**: Filesystem artifacts archived as historical context

**Until Then**: These directories are "proto-Pact" - manual version of what Pact will automate.

### AI Assistant Guidelines

When working with intent artifacts:

**Exploration Phase** (`/ideas`):

- Start new ideas in `/ideas/{topic}.md`
- Update freely as understanding evolves
- Ask clarifying questions to refine behavioral intent
- No formal structure required

**Commitment Phase** (`/atoms`, `/molecules`):

- Only create atoms when intent is testable and clear
- Use ID-based naming: `IA-{ID}-{slug}.md` and `.json`
- Create or update molecules to provide human context
- Remember: atoms are immutable; molecules are lenses

**Realization Phase** (code + tests):

- Write tests that reference atoms: `// @atom IA-{ID}`
- Ensure test assertions match committed atom behavior
- Flag mismatches between tests and atoms (INV-009 enforcement)

**Documentation** (`/docs`, READMEs):

- Update directory READMEs in real-time
- Write `/docs` for long-form synthesis and analysis
- Compare READMEs to `/docs` periodically for consistency

**Guiding Principles**:

- **Atoms are truth** (system = composition of atoms)
- **Molecules are lenses** (descriptive, recomposable views)
- **Tests are coupling** (the link between code and atoms)
- **Ideas are exploration** (mutable working directory)

---

## Bootstrap Scaffolding

**The Self-Hosting Problem**: Eventually, an external instance of Pact will guide the development of future versions of Pact. Until then, we need temporary code to manipulate proto-Pact artifacts. This code must be explicitly demolished once Pact is self-hosting.

**Guiding Principle**: Scaffolding cannot create new truths. It can only help us arrive at truths that will eventually be represented as atoms + tests + invariants.

### What is Bootstrap Scaffolding?

**Bootstrap scaffolding** = any code, config, or workflow that exists only to get Pact to the point where Pact can enforce its own invariants.

**Key Distinction**:

```text
Proto-Pact (DATA - persists):
/ideas, /atoms, /molecules, /global = the WHAT
These are artifacts that will be imported into Pact once it's self-hosting

Bootstrap Scaffolding (CODE - demolished):
/bootstrap = the HOW (temporary)
This is code that manipulates proto-Pact artifacts
Once Pact is self-hosting, this code is deleted
```

### Non-Negotiable Constraints

#### A. Scaffolding Must Be Isolated by Construction

**One-Way Dependency Rule**: Bootstrap depends on pact-core; pact-core NEVER depends on bootstrap.

**Enforcement**:

- Separate namespace: `bootstrap/*`
- CI check fails if any non-bootstrap module imports bootstrap:

  ```bash
  if grep -r "from.*bootstrap" src/; then
    echo "ERROR: Core code depends on bootstrap"
    exit 1
  fi
  ```

**Why This Matters**: This single rule prevents the ProdOS/StoryLogic entanglement pattern where "temporary" mechanisms become permanent.

#### B. Scaffolding Must Be Non-Authoritative

Scaffolding may:

- **Generate** or **import** atoms (seed data)
- **Validate** in limited ways (early enforcement)

Scaffolding may NEVER:

- **Define semantics** that the runtime model depends on long-term
- **Become the source of truth** for atoms/molecules/invariants

#### C. Scaffolding Must Have Explicit Demolition Charges

Every scaffolded capability must have:

- **Owner ID**: Who removes it
- **Exit criterion**: When it can be removed (testable condition)
- **Removal task**: Tracked like real work, not a TODO comment
- **Dependency map**: What must be self-hosted first

### Four Scaffold Types

#### Type 1: Seed Scaffolding

**Purpose**: Create initial `/global` invariants and minimal atoms

**Location**: `/bootstrap/seed/`

**Exit Condition**: Pact can parse and enforce `/global` and `/atoms` without any seed step

**Examples**:

- Script to generate initial INV-001 through INV-009 in `/global`
- Tool to create first atom files from synthesis documents

#### Type 2: Migration Scaffolding

**Purpose**: Import legacy tests, infer atom refs, generate "needs atom" queues

**Location**: `/bootstrap/migration/`

**Exit Condition**: All imported artifacts are normalized into canonical Pact structures

**Examples**:

- Test analyzer that finds tests without `@atom` references
- Atom inference tool that reverse-engineers atoms from existing tests
- Migration reports showing coverage gaps

#### Type 3: Tooling Scaffolding

**Purpose**: Early CLI hacks, file generators, stub registries, temporary configs

**Location**: `/bootstrap/tooling/`

**Exit Condition**: Pact runtime provides canonical tooling interfaces and stable CLI

**Examples**:

- CLI for creating atom files: `bootstrap-cli create-atom IA-001 "description"`
- Molecule composition helper
- Temporary file generators before Pact UI exists

#### Type 4: Runtime Scaffolding

**Purpose**: Shortcuts in enforcement (e.g., "warn only" gates, permissive modes)

**Location**: `/bootstrap/runtime/`

**Exit Condition**: CI/local gates enforce invariants by default

**Examples**:

- `--warn-only` mode for invariant violations
- Permissive test-atom coupling checker
- Temporary enforcement bypass flags

### Self-Hosting Milestones

#### Phase 0: "Pact Exists as a Tool" (Current Target)

- Can read atoms from `/atoms`
- Can run test audits
- Can produce reports
- **Bootstrap status**: All four types active

#### Phase 1: "Pact Can Validate Pact"

- Pact's own repo described by atoms
- Pact's build pipeline is described by atoms
- Pact's CI gate is enforced by Pact
- **Bootstrap status**: Seed/migration demolished; tooling/runtime remain

#### Phase 2: "Pact Is Authoritative"

- Any change to atoms/tests/invariants blocked unless Pact approves
- All atoms/tests/invariants managed by Pact database
- Bootstrap code is either removed or inert
- **Bootstrap status**: All scaffolding demolished

### Version Stamps in Scaffold Code

Every bootstrap file must have a header:

```typescript
/**
 * BOOTSTRAP SCAFFOLDING - DO NOT DEPEND ON THIS
 * Scaffold ID: BS-002
 * Type: Tooling
 * Purpose: CLI for creating atom files
 * Exit Criterion: Pact UI provides atom creation interface
 * Target Removal: Phase 1
 * Owner: TBD
 */
```

### The Scaffold Ledger

**Location**: `/bootstrap/README.md`

**Purpose**: Forcing function for explicit exit criteria. If you can't add a scaffold to this ledger with a clear exit condition, it's probably a design smell.

**Structure**: Tracks active and demolished scaffolds with:

- ID, Type, Purpose
- Exit criterion (testable)
- Owner, Removal ticket
- Demolition date (once removed)

### Git Analogy for Developers

Think of bootstrap like the C compiler used to bootstrap a Rust compiler:

- You use C to build the first Rust compiler
- Once Rust can compile itself, you delete the C bootstrapping code
- Rust is now self-hosting

Similarly:

- You use `/bootstrap` to build Pact
- Once Pact can manage its own atoms, you delete `/bootstrap`
- Pact is now self-hosting

### Anti-Entrenchment Mechanisms

**Hard Mechanisms** (enforced by CI):

- One-way dependencies (pact-core never imports bootstrap)
- Build-time flags (`--bootstrap-mode` only in bootstrap binary)
- CI check prevents bootstrap imports

**Soft Mechanisms** (require discipline):

- Scaffold ledger (tracks all scaffolds with exit criteria)
- Version stamps (every file labeled as scaffolding)
- Regular audits (check if exit criteria are met)

### When to Add Scaffolding

**Add to `/bootstrap` when**:

- You need temporary code to manipulate proto-Pact artifacts
- There's a clear exit criterion (when Pact can do this itself)
- The code doesn't define long-term semantics

**Add to `/src` when**:

- The code is part of Pact's permanent runtime
- The feature will exist after self-hosting
- The code defines semantic behavior that persists

**If unclear**: Ask "Will this exist after Phase 2?" If no → `/bootstrap`. If yes → `/src`.

---

## Development Workflow

### Essential Commands

- **Install dependencies**: `npm install`
- **Start development server**: `npm run start:dev`
- **Build for production**: `npm run build`
- **Run tests**: `npm run test`
- **Run tests with coverage**: `npm run test:cov`
- **Run E2E tests**: `npm run test:e2e`
- **Lint code**: `npm run lint`
- **Format code**: `npm run format`

### Docker Commands

- **Build containers**: `docker-compose build`
- **Start services**: `docker-compose up`
- **Stop services**: `docker-compose down`

### Development Environment Philosophy

**No Host Dependencies**: All development tools, test runners, and build processes must run in Docker containers. This ensures:

- Consistent environments across all developer machines
- No "works on my machine" issues
- New developers can start contributing immediately after `docker-compose up`
- CI/CD pipeline matches local development exactly

**Development Matches Production**: Development environment should mirror production as closely as possible:

- Same database versions (PostgreSQL in Docker, not SQLite)
- Same Node.js versions
- Same external service configurations
- Real integration tests, not mocked unless explicitly approved

**Implementation**:

- Test runners execute inside Docker containers
- Database migrations run in Docker
- External service dependencies use Docker Compose services (Redis, message queues, etc.)
- Local development uses `docker-compose` for all services

### Test-Driven Development Workflow

1. **Write the test first** - Define expected behavior before implementation
2. **Run the test** - Verify it fails (Red phase)
3. **Validate test quality** - Before proceeding to Green phase, ensure the test meets quality standards (see Test Quality Standards below)
4. **Write minimal code** - Make the test pass (Green phase)
5. **Refactor** - Improve code while keeping tests green
6. **Commit** - Once tests pass, code is clean, and test quality is validated

**Critical**: Test quality validation is a **gate** for the Red phase. A failing test that is vacuous, brittle, or doesn't properly encode intent must be improved before implementation begins.

Always run the full test suite before committing changes.

---

## Code Conventions

### File Naming

- **Controllers**: `*.controller.ts` (e.g., `users.controller.ts`)
- **Services**: `*.service.ts` (e.g., `users.service.ts`)
- **Modules**: `*.module.ts` (e.g., `users.module.ts`)
- **DTOs**: `*.dto.ts` (e.g., `create-user.dto.ts`)
- **Entities**: `*.entity.ts` (e.g., `user.entity.ts`)
- **Tests**: `*.spec.ts` for unit tests, `*.e2e-spec.ts` for E2E tests

### TypeScript Standards

- Use **strict mode** enabled in `tsconfig.json`
- Prefer **interfaces** over types for object shapes
- Use **explicit return types** for functions
- Avoid `any` - use `unknown` if type is truly unknown
- Use **async/await** over promises `.then()` chains

### NestJS Patterns

- **One concern per service** - Keep services focused and single-purpose
- **Use dependency injection** - Inject services via constructor
- **Validate DTOs** - Use `class-validator` decorators on all DTOs
- **Use pipes** for transformation and validation
- **Use guards** for authentication/authorization
- **Use interceptors** for cross-cutting concerns (logging, caching)

### Module Organization

Each feature module should contain:

- Controller (HTTP endpoints)
- Service (business logic)
- Module definition
- DTOs (data transfer objects)
- Entities (database models)
- Tests (both unit and E2E)

### Frontend Conventions

- **Component naming**: PascalCase (e.g., `UserProfile.tsx`)
- **File organization**: Colocate components with their tests and styles
- **State management**: Use React hooks and context for shared state
- **API calls**: Abstract into service functions in `lib/api/`

---

## Testing Standards

### Test Coverage Requirements

- **Minimum coverage**: 80% for all new code
- **Critical paths**: 100% coverage for authentication, payment, data integrity
- **Test types**: Unit tests, integration tests, E2E tests

### Test File Organization

```bash
src/
└── users/
    ├── users.controller.ts
    ├── users.controller.spec.ts    # Unit tests for controller
    ├── users.service.ts
    ├── users.service.spec.ts       # Unit tests for service
    └── users.module.ts

test/
└── users.e2e-spec.ts               # E2E tests for users feature
```

### Writing Good Tests

- **Descriptive test names**: Use `describe()` and `it()` with clear descriptions
- **AAA pattern**: Arrange, Act, Assert structure
- **One assertion per test**: Keep tests focused
- **Test behavior, not implementation**: Focus on outcomes, not internal details

### Test Quality Standards (Red Phase Gate)

Pact enforces test quality as a **gate** in the TDD Red phase. Tests must meet these standards before implementation begins. See [ingest/test-quality.md](ingest/test-quality.md) for full taxonomy.

**Critical Quality Dimensions**:

1. **Intent Fidelity**
   - Tests must map one-to-one with Intent Atoms (no orphan tests, no orphan intents)
   - Tests assert specific behavior claimed by intent, not proxies or side effects
   - Tests explicitly encode system invariants (idempotency, authorization, integrity)

2. **No Vacuous Tests**
   - Every test must have meaningful assertions
   - Tests that always pass (no assertions or trivial assertions) are **rejected**
   - Example of vacuous test to avoid:

     ```typescript
     it('should work', () => {
       const result = doSomething();
       expect(result).toBeDefined(); // Too weak - always passes
     });
     ```

3. **No Brittle Tests**
   - Tests must not couple to implementation details
   - Avoid testing private methods or internal structure
   - Focus on public contracts and observable behavior
   - Tests should survive refactoring without changes

4. **Determinism**
   - Test outcomes must be fully repeatable
   - No unseeded randomness, clock dependencies, or network calls in unit tests
   - Use fixtures, mocks, or test doubles for non-deterministic dependencies

5. **Failure Signal Quality**
   - Test failures must isolate a single, identifiable cause (no "god tests")
   - Error messages must explain **why** the intent was violated (not just "expected X, got Y")
   - Reference Intent Atom IDs in failure messages for traceability

6. **Integration Test Authenticity**
   - **Do NOT mock internal services** - use real implementations
   - **Do NOT mock external services** unless explicitly approved (use Docker containers for DBs, APIs, etc.)
   - **Mocking is only permitted for**:
     - Third-party APIs with cost/rate limits (and only with approval)
     - External systems outside our control (and only when Docker equivalent unavailable)
   - When in doubt: **use real, Dockerized dependencies**

7. **Boundary & Negative Coverage**
   - Tests must explicitly validate domain boundaries (off-by-one, empty vs null, min/max)
   - Tests must prove what the system must **not** do (unauthorized access rejected, invalid transitions blocked)

**Enforcement**:

- Test quality checks run automatically during Red phase
- Low-quality tests are flagged before Green phase begins
- Agents generating tests are evaluated on test quality metrics (not just coverage)
- Test quality Evidence Artifacts are generated for every test suite

**Guiding Principle** (from test-quality.md):
> Traditional test metrics ask: "Does this test execute code?"
> Intent-native metrics ask: "Does this test prove intent in a way that resists drift, deception, and automation error?"

### Test Examples

```typescript
describe('UsersService', () => {
  it('should create a new user with valid data', async () => {
    // Arrange
    const createUserDto = { email: 'test@example.com', name: 'Test User' };

    // Act
    const user = await service.create(createUserDto);

    // Assert
    expect(user).toHaveProperty('id');
    expect(user.email).toBe(createUserDto.email);
  });
});
```

### Running Tests

**Philosophy**: Hybrid approach combining fast local iteration with rigorous Docker-based CI testing.

#### Docker-Based Testing (Recommended)

Use the test runner script for all test execution:

```bash
# Run all unit tests
./scripts/test.sh

# Run in watch mode (for TDD workflow)
./scripts/test.sh --watch

# Run specific test file
./scripts/test.sh --file atomization

# Run with coverage report
./scripts/test.sh --coverage

# Run end-to-end tests
./scripts/test.sh --e2e

# Run full CI test suite (unit + e2e + coverage)
./scripts/test.sh --ci

# Run test quality analyzer
./scripts/test.sh --quality

# Run test-atom coupling analysis
./scripts/test.sh --coupling
```

**How it works**:

1. Script ensures PostgreSQL and Redis containers are running
2. Starts the test container (or app container for E2E/integration tests)
3. Executes tests inside the container using `docker exec`
4. Returns exit code for CI/CD integration

**Benefits**:

- No host dependencies required
- Consistent environment across all developers
- Matches CI/CD pipeline exactly
- Isolated test database (pact_test)

#### Host-Based Testing (Fast Iteration)

For rapid development, you can run tests directly on the host:

```bash
npm test                              # Run all tests
npm test -- --testPathPattern=name    # Run specific test
npm run test:watch                    # Watch mode
npm run test:cov                      # With coverage
```

**Requirements**:

- Must run `npm install` first
- Postgres must be accessible (Docker or local)

**When to use**:

- Quick feedback during development
- IDE integration and debugging
- Single test file iteration

#### CI/CD Testing

For continuous integration, use the Docker-based approach:

```bash
# In your CI pipeline
./scripts/test.sh --ci
```

This runs the complete test suite with coverage and fails the build if tests fail or coverage drops below 80%.

---

## Important Patterns & Guidelines

### AI-Assisted Development

This project is designed to work seamlessly with AI assistants. When implementing features:

1. **Start with intent** - Describe what you want to build and why
2. **Use Pact skills** - Leverage `synthesizing-requirements` and `interviewing-stakeholders` skills
3. **Generate acceptance criteria** - Create Gherkin scenarios before coding
4. **Write tests from criteria** - Convert Given/When/Then to test cases
5. **Implement incrementally** - Build features in small, testable chunks

### Working with LangChain/LangGraph Agents

- **Agent configuration**: Store in `src/config/agents/`
- **Prompt templates**: Keep templates in version control
- **Chain definitions**: Document chain logic clearly in code comments
- **Error handling**: Always handle agent failures gracefully
- **Testing agents**: Mock LLM calls in tests, use integration tests for real calls

### MCP (Model Context Protocol) Integration

- **Server definitions**: Define MCP servers in `.claude/config/`
- **Context management**: Be explicit about what context is shared with models
- **Security**: Never expose sensitive data through MCP contexts
- **Tool registration**: Register custom tools in a centralized registry

### Database Patterns

- **Use TypeORM entities** with proper decorators
- **Migrations**: Always create migrations for schema changes
- **Transactions**: Use transactions for multi-step database operations
- **Indexing**: Add indexes for frequently queried fields
- **Soft deletes**: Use `deletedAt` timestamp instead of hard deletes

### API Design

- **RESTful endpoints**: Follow REST conventions (`GET /users`, `POST /users/:id`)
- **Versioning**: Version APIs (`/api/v1/users`)
- **Response format**: Consistent JSON structure with `data`, `error`, `meta` fields
- **Pagination**: Use limit/offset or cursor-based pagination
- **Error responses**: Return appropriate HTTP status codes with clear error messages

### Security Considerations

- **Authentication**: Use JWT tokens with refresh token rotation
- **Authorization**: Implement role-based access control (RBAC)
- **Input validation**: Validate all inputs with class-validator
- **SQL injection**: Use parameterized queries (TypeORM handles this)
- **XSS protection**: Sanitize user inputs, use Content Security Policy headers
- **Rate limiting**: Apply rate limiting to all public endpoints
- **Environment variables**: Never commit secrets - use `.env` files (gitignored)

### Performance Guidelines

- **Lazy loading**: Load modules and data only when needed
- **Caching**: Cache frequently accessed data (use Redis for distributed cache)
- **Database queries**: Optimize N+1 queries with eager loading or DataLoader
- **API responses**: Compress responses with gzip
- **Bundle size**: Keep frontend bundle size under 200KB (gzipped)

---

## Git Workflow

- **Branch naming**: `feature/description`, `fix/description`, `refactor/description`
- **Commit messages**: Use conventional commits format (`feat:`, `fix:`, `docs:`, `test:`)
- **Pull requests**: Require at least one review before merging
- **Main branch**: `develop` is the primary branch - all features merge here
- **CI/CD**: Tests must pass before merging

---

## Additional Resources

- **NestJS Documentation**: <https://docs.nestjs.com>
- **TypeORM Documentation**: <https://typeorm.io>
- **LangChain Documentation**: <https://js.langchain.com>
- **Testing with Jest**: <https://jestjs.io/docs/getting-started>

---

**Last Updated**: 2026-01-12
