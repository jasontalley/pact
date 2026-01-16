# Testing Guide

Quick reference for running tests in Pact.

## TL;DR

```bash
# Recommended (Docker-based)
./scripts/test.sh                  # Run all tests
./scripts/test.sh --watch          # TDD mode
./scripts/test.sh --file <name>    # Specific test

# Fast iteration (host-based, requires npm install)
npm test                           # Run all tests
npm run test:watch                 # Watch mode
```

## Docker-Based Testing (Recommended)

The test runner script handles all container orchestration:

```bash
./scripts/test.sh                  # All unit tests
./scripts/test.sh --watch          # Watch mode for TDD
./scripts/test.sh --file atomization  # Specific test file
./scripts/test.sh --coverage       # With coverage report
./scripts/test.sh --e2e            # End-to-end tests
./scripts/test.sh --ci             # Full CI suite
./scripts/test.sh --quality        # Test quality analysis
./scripts/test.sh --coupling       # Test-atom coupling check
./scripts/test.sh --help           # All options
```

### Benefits

- ✅ No host dependencies needed
- ✅ Consistent across all environments
- ✅ Matches CI/CD exactly
- ✅ Isolated test database
- ✅ Automatic service startup (postgres, redis)

## Host-Based Testing (Fast Iteration)

For rapid development cycles:

```bash
npm install                        # One-time setup
npm test                           # Run all tests
npm run test:watch                 # Watch mode
npm run test:cov                   # With coverage
npm test -- --testPathPattern=name # Specific test
```

### When to Use

- Quick feedback during development
- IDE integration and debugging
- Single test file iteration

## Test Types

### Unit Tests (`.spec.ts`)

Located alongside source files in `src/`:

```
src/modules/agents/
├── atomization.service.ts
└── atomization.service.spec.ts
```

**Run**:
```bash
./scripts/test.sh                          # Docker
npm test                                   # Host
```

### E2E Tests (`.e2e-spec.ts`)

Located in `test/` directory:

```
test/
└── agents.e2e-spec.ts
```

**Run**:
```bash
./scripts/test.sh --e2e                    # Docker
npm run test:e2e                           # Host
```

### Test Quality Analysis

Validates tests against quality standards (see [ingest/test-quality.md](ingest/test-quality.md)):

```bash
./scripts/test.sh --quality
npm run test:quality
```

### Test-Atom Coupling

Verifies tests map one-to-one with Intent Atoms:

```bash
./scripts/test.sh --coupling
npm run test:coupling
```

## Coverage Requirements

Minimum thresholds (enforced by CI):

- **Branches**: 80%
- **Functions**: 80%
- **Lines**: 80%
- **Statements**: 80%

**Generate coverage report**:
```bash
./scripts/test.sh --coverage
npm run test:cov
```

Report location: `./coverage/lcov-report/index.html`

## CI/CD Integration

For continuous integration pipelines:

```bash
./scripts/test.sh --ci
```

This runs:
1. Unit tests with coverage
2. E2E tests
3. Fails if coverage < 80%
4. Returns exit code for pipeline

## Test Quality Standards

All tests must meet these criteria (enforced at Red phase):

1. **Intent Fidelity** - Maps to Intent Atoms
2. **No Vacuous Tests** - Meaningful assertions
3. **No Brittle Tests** - Tests behavior, not implementation
4. **Determinism** - Repeatable outcomes
5. **Failure Signal Quality** - Clear error messages
6. **Integration Authenticity** - Real dependencies (Docker), not mocks
7. **Boundary Coverage** - Edge cases and negative tests

See [ingest/test-quality.md](ingest/test-quality.md) for full details.

## Common Workflows

### TDD Workflow

```bash
# Start watch mode
./scripts/test.sh --watch

# Write failing test (Red)
# Validate test quality
# Implement feature (Green)
# Refactor
# Commit when green
```

### Pre-Commit

```bash
# Run all tests with coverage
./scripts/test.sh --coverage

# Or full CI suite
./scripts/test.sh --ci
```

### Debugging

Host-based testing is better for debugging:

```bash
# Run with debugger
npm run test:debug

# Or use IDE debugger with Jest integration
```

## Troubleshooting

### "Docker is not running"

Start Docker Desktop or Docker service:
```bash
docker info  # Verify Docker is running
```

### "Container failed to start"

Check container logs:
```bash
docker-compose logs postgres
docker-compose logs test
```

### Tests fail in Docker but pass on host

Environment difference - check:
- Database connection (use `redis`, not `localhost`)
- Environment variables in docker-compose.yml
- Volume mounts in docker-compose.yml

### "Jest did not exit one second after test run"

Common with Redis/database connections. This is a warning, not an error. To investigate:
```bash
npm test -- --detectOpenHandles
```

## More Information

- [CLAUDE.md](CLAUDE.md#testing-standards) - Full testing standards
- [scripts/README.md](scripts/README.md) - Script documentation
- [ingest/test-quality.md](ingest/test-quality.md) - Quality standards taxonomy
