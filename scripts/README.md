# Pact Scripts

This directory contains utility scripts for development and CI/CD workflows.

## test.sh

Docker-based test runner that ensures consistent test execution across all environments.

### Usage

```bash
# Basic usage
./scripts/test.sh                    # Run all unit tests
./scripts/test.sh --help             # Show all options

# Development workflows
./scripts/test.sh --watch            # TDD watch mode
./scripts/test.sh --file <pattern>   # Run specific test file

# Verification
./scripts/test.sh --coverage         # Generate coverage report
./scripts/test.sh --e2e              # Run end-to-end tests
./scripts/test.sh --quality          # Run test quality analyzer
./scripts/test.sh --coupling         # Run test-atom coupling analyzer

# CI/CD
./scripts/test.sh --ci               # Full test suite (unit + e2e + coverage + quality + coupling)
```

### Features

- **Automatic container management**: Ensures PostgreSQL, Redis, and test containers are running
- **Exit code propagation**: Returns test exit codes for CI/CD integration
- **Flexible execution**: Supports unit, E2E, quality, and coupling tests
- **Watch mode**: Interactive TDD workflow with auto-rerun

### Architecture

The script follows the "No Host Dependencies" philosophy:

1. Verifies Docker is running
2. Starts required services (postgres, redis)
3. Selects appropriate container:
   - **Watch mode**: Uses dedicated test container (`docker-compose run` for interactivity)
   - **All other modes**: Uses app container (stays running reliably)
4. Executes tests via `docker exec` or `docker-compose run`
5. Returns results with proper exit codes

**Container Strategy**: The test container is designed for interactive watch mode and exits when run in detached mode. For one-off test runs (CI, coverage, specific files), the app container is used as it stays running reliably with the development server.

### Environment

Tests run in isolated Docker containers with:
- **Test database**: `pact_test` (separate from development)
- **Redis**: Available for LLM caching tests
- **PostgreSQL 18**: Latest stable (Debian-based for compatibility)
- **Node 24**: Current LTS (Debian slim for better npm package support)

### Examples

```bash
# TDD workflow - watch mode
./scripts/test.sh --watch

# Test specific service
./scripts/test.sh --file atomization

# Pre-commit check
./scripts/test.sh --coverage

# CI pipeline
./scripts/test.sh --ci
```

## Future Scripts

Planned additions:
- `build.sh` - Docker-based build with multi-stage optimization
- `migrate.sh` - Database migration runner
- `seed.sh` - Test data seeding
- `lint.sh` - Linting and formatting checks
