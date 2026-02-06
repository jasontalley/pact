# Quality Module

Analyzes and reports on test quality across the codebase.

## Overview

The quality module evaluates test files against 7 quality dimensions to ensure tests properly encode and validate intent. This serves as a gate in the TDD Red phase - tests must meet quality standards before implementation begins.

## Quality Dimensions

| Dimension | Weight | Threshold | Description |
|-----------|--------|-----------|-------------|
| Intent Fidelity | 20% | 70% | Tests map to Intent Atoms via `@atom` annotations |
| No Vacuous Tests | 15% | 90% | Every test has meaningful assertions |
| No Brittle Tests | 15% | 80% | Tests don't couple to implementation details |
| Determinism | 10% | 95% | Test outcomes are fully repeatable |
| Failure Signal Quality | 15% | 70% | Failure messages explain why intent was violated |
| Integration Authenticity | 15% | 80% | Integration tests use real implementations |
| Boundary & Negative Coverage | 10% | 60% | Tests cover edge cases and error conditions |

## Entity: TestQualitySnapshot

Historical snapshots of quality analysis:

```typescript
interface TestQualitySnapshot {
  id: string;
  createdAt: Date;
  commitHash: string;
  branchName: string;

  // Summary
  totalFiles: number;
  passedFiles: number;
  failedFiles: number;
  overallScore: number;

  // Dimension scores
  intentFidelityScore: number;
  noVacuousTestsScore: number;
  noBrittleTestsScore: number;
  determinismScore: number;
  failureSignalQualityScore: number;
  integrationAuthenticityScore: number;
  boundaryCoverageScore: number;

  // Test counts
  totalTests: number;
  annotatedTests: number;
  orphanTests: number;

  // Details
  details: {
    fileResults: FileResultSummary[];
  };
}
```

## Quality Analysis Result

```typescript
interface QualityAnalysisResult {
  timestamp: Date;
  commitHash?: string;
  branchName?: string;

  summary: {
    totalFiles: number;
    passedFiles: number;
    failedFiles: number;
    overallScore: number;      // 0-100
    totalTests: number;
    annotatedTests: number;    // Tests with @atom annotation
    orphanTests: number;       // Tests without @atom
  };

  dimensionAverages: Record<string, number>;

  fileResults: TestFileQualityResult[];

  trends?: QualityTrend[];     // Historical data
}
```

## Detection Patterns

### Vacuous Tests (Bad)
```typescript
// These are flagged as vacuous:
expect(result).toBeDefined();
expect(result).toBeTruthy();
expect(true).toBe(true);
expect().pass();
```

### Brittle Tests (Warning)
```typescript
// These are flagged as potentially brittle:
.toHaveBeenCalledTimes(5)  // Couples to call count
.toMatchSnapshot()          // Snapshots break on any change
setTimeout(...)             // Timing-dependent
.only(...)                  // Focused test (should not be committed)
```

### Non-Deterministic (Warning)
```typescript
// Flagged unless mocked:
Math.random()
Date.now()
new Date()
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/quality/analyze` | Run quality analysis |
| GET | `/quality/analyze/:path` | Analyze specific file |
| GET | `/quality/snapshots` | Get historical snapshots |
| GET | `/quality/trends` | Get quality trends |
| GET | `/quality/report` | Get HTML report |
| POST | `/quality/gate` | Check quality gate (throws on failure) |

## Service Methods

```typescript
class TestQualityService {
  // Analysis
  analyzeQuality(options?: QualityCheckOptions): Promise<QualityAnalysisResult>;
  analyzeTestFile(filePath: string, baseDir?: string): TestFileQualityResult;

  // Quality gate
  checkQualityGate(options?: QualityCheckOptions): Promise<void>;  // Throws on failure

  // History
  saveSnapshot(result: QualityAnalysisResult): Promise<TestQualitySnapshot>;
  getRecentTrends(days?: number): Promise<QualityTrend[]>;

  // Reporting
  generateHtmlReport(result: QualityAnalysisResult): string;
}
```

## Usage

### Run Quality Analysis

```bash
# Via API
curl -X POST http://localhost:3000/quality/analyze

# Via test script
./scripts/test.sh --quality
```

### Check Quality Gate

```typescript
// In CI pipeline
await testQualityService.checkQualityGate({
  testDirectory: './src',
  saveSnapshot: true,
});
// Throws if any files fail quality thresholds
```

### Generate Report

```bash
# Reports saved to test-results/quality/quality-report.html
./scripts/test.sh --quality
open test-results/quality/quality-report.html
```

## File Structure

```
quality/
├── test-quality-snapshot.entity.ts  # TypeORM entity
├── quality.controller.ts            # REST API
├── test-quality.service.ts          # Analysis logic
├── quality.module.ts                # NestJS module
└── test-quality.service.spec.ts     # Unit tests
```

## @atom Annotation

Tests should link to atoms using the `@atom` annotation:

```typescript
// @atom IA-042
it('should validate email format', () => {
  expect(validateEmail('test@example.com')).toBe(true);
  expect(validateEmail('invalid')).toBe(false);
});
```

Tests without `@atom` are flagged as "orphan tests" and reduce the Intent Fidelity score.

## Related Modules

- **atoms** - Atoms that tests reference
- **validators** - Validator entities linked to tests
- **agents** - Reconciliation discovers orphan tests

## See Also

- [CLAUDE.md - Test Quality Standards](/CLAUDE.md#test-quality-standards-red-phase-gate)
- [ingest/test-quality.md](/ingest/test-quality.md) - Full taxonomy
