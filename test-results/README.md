# Test Results Directory

This directory contains all test execution results and reports for the Pact project. Test files themselves remain collocated with source code, but all generated results are centralized here for easy discovery.

## Directory Structure

```
test-results/
├── backend/
│   ├── unit/
│   │   └── coverage/          # Backend unit test coverage reports
│   └── e2e/
│       ├── reports/           # Backend E2E test reports (HTML, JSON)
│       └── artifacts/          # Backend E2E test artifacts
├── frontend/
│   ├── unit/
│   │   └── coverage/          # Frontend unit test coverage reports
│   └── e2e/
│       ├── html-report/       # Playwright HTML test report
│       ├── results.json        # Playwright JSON test results
│       └── artifacts/          # Screenshots, videos, traces (on failure)
├── integration/
│   └── reports/               # Integration test reports
├── quality/
│   ├── quality-report.html     # Test quality analysis report
│   └── coupling-report.json    # Test-atom coupling analysis
└── analysis/
    └── brownfield-*.json       # Brownfield analysis reports
```

## Viewing Reports

### Backend Unit Test Coverage

```bash
# Open HTML coverage report
open test-results/backend/unit/coverage/lcov-report/index.html

# Or view in terminal
npm run test:cov
```

### Frontend Unit Test Coverage

```bash
# Open HTML coverage report
open test-results/frontend/unit/coverage/index.html

# Or view in terminal
cd frontend && npm run test:coverage
```

### Frontend E2E Test Results (Playwright)

```bash
# Open Playwright HTML report
npx playwright show-report test-results/frontend/e2e/html-report

# Or view JSON results
cat test-results/frontend/e2e/results.json
```

### Backend E2E Test Results

```bash
# View reports (if generated)
open test-results/backend/e2e/reports/index.html
```

### Test Quality Reports

```bash
# Open test quality analysis
open test-results/quality/quality-report.html

# View coupling analysis
cat test-results/quality/coupling-report.json
```

## Generating Reports

All reports are automatically generated when running tests:

```bash
# Backend unit tests with coverage
./scripts/test.sh --coverage

# Frontend unit tests with coverage
./scripts/test.sh --frontend-coverage

# Frontend E2E tests
./scripts/test.sh --frontend-e2e

# Test quality analysis
./scripts/test.sh --quality

# Full CI suite (generates all reports)
./scripts/test.sh --ci
```

## CI/CD Artifacts

In CI/CD pipelines, all test results are uploaded as artifacts from this directory. See `.github/workflows/test-quality-gate.yml` for artifact configuration.

## Notes

- This directory is gitignored (except this README)
- Results are overwritten on each test run
- Historical results are stored in CI/CD artifact storage
- Test quality snapshots are stored in the database (`test_quality_snapshots` table)

## Related Documentation

- [TESTING.md](../TESTING.md) - Testing guide and workflows
- [scripts/test.sh](../scripts/test.sh) - Test runner script
- [CLAUDE.md](../CLAUDE.md#testing-standards) - Testing standards
