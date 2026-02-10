# @pact/client-sdk

> Client SDK for Pact - Enables local development and remote deployment of the Pact intent management system

[![Tests](https://img.shields.io/badge/tests-99%20passing-brightgreen)](./src/__tests__)
[![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-blue)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-UNLICENSED-red)](../../LICENSE)

## Overview

`@pact/client-sdk` is a lightweight TypeScript client for interacting with Pact servers from local development environments, CI/CD pipelines, and VSCode extensions. It decouples Pact from direct filesystem access, enabling remote deployment while preserving the local developer experience.

### Core Philosophy: Local = Plausible, Canonical = True

- **Local reconciliation** produces advisory plausibility reports (not canonical truth)
- **CI-attested reconciliation** is the single promotion gate from plausible to true
- **Main state cache** is read-only and pull-only (no push/pull sync or conflict resolution)
- **Minimal local state**: `.pact/main-cache.json` (cached Main export) and `.pact/local-report.json` (last local check)

## Features

- **Zero NestJS dependencies** - Uses only Node.js built-ins and `fetch`
- **99 passing tests** - Comprehensive test coverage
- **Typed API client** - Full TypeScript support for all Pact endpoints
- **Local file reading** - Read test files, source files, and build manifests
- **Git integration** - Commit hashes, changed files, diff extraction
- **Coverage collection** - Istanbul/c8/lcov coverage parsing and upload
- **Patch application** - Apply @atom annotation patches locally
- **Main state caching** - Pull canonical Pact Main state for local tooling
- **Local reconciliation** - Generate plausibility reports without modifying server state

## Installation

```bash
npm install @pact/client-sdk
```

## Quick Start

### Basic Usage

```typescript
import { PactClient } from '@pact/client-sdk';

// Initialize client
const client = new PactClient({
  serverUrl: 'http://localhost:3000',
  projectId: 'my-project',
  projectRoot: process.cwd(),
});

// Pull Pact Main state (read-only cache)
await client.main.pull();

// Run local reconciliation (advisory plausibility report)
const report = await client.reconciliation.check();
console.log(`Orphan tests: ${report.orphanTests.length}`);
console.log(`Uncovered atoms: ${report.uncoveredAtoms.length}`);
```

### VSCode Extension Integration

```typescript
import { PactClient, FileReader, PatchApplicator } from '@pact/client-sdk';

// Read workspace files
const fileReader = new FileReader(workspaceRoot);
const { manifest, contents } = await fileReader.readForReconciliation({
  includeTests: true,
  includeSources: true,
});

// Submit to remote Pact server
const client = new PactClient({ serverUrl, projectId, projectRoot: workspaceRoot });
const result = await client.reconciliation.analyzeWithPreReadContent({
  rootDirectory: workspaceRoot,
  manifest,
  fileContents: contents,
});

// Apply recommended patches locally
const patchApplicator = new PatchApplicator(workspaceRoot);
await patchApplicator.applyAnnotationPatches(result.patches);
```

### CI/CD Pipeline Integration

```typescript
import { PactClient, FileReader, CoverageCollector } from '@pact/client-sdk';

// CI-attested reconciliation (canonical truth update)
const client = new PactClient({ serverUrl, authToken, projectId, projectRoot });
const fileReader = new FileReader(projectRoot);
const { manifest, contents } = await fileReader.readForReconciliation();

const result = await client.reconciliation.analyzeWithPreReadContent({
  rootDirectory: projectRoot,
  manifest,
  fileContents: contents,
  options: {
    mode: 'full',
    attestationType: 'ci-attested', // Canonical update
    exceptionLane: 'normal',
  },
});

// Upload coverage data
const coverageCollector = new CoverageCollector();
const coverage = await coverageCollector.collectFromFile('./coverage/lcov.info');
await coverageCollector.upload(client, coverage);

// Fail build on drift policy violations
const driftSummary = await client.drift.getSummary();
if (driftSummary.overdueCount > 0) {
  throw new Error(`Build blocked: ${driftSummary.overdueCount} overdue drift items`);
}
```

## API Reference

### PactClient

Main entry point for the SDK.

```typescript
interface PactClientConfig {
  serverUrl: string;        // Pact server URL
  projectId?: string;       // Project ID for multi-project instances
  authToken?: string;       // Authentication token
  projectRoot: string;      // Local project root directory
  timeout?: number;         // HTTP timeout in ms (default: 30000)
}

class PactClient {
  constructor(config: PactClientConfig);

  // Sub-clients
  get reconciliation(): ReconciliationClient;
  get atoms(): AtomsClient;
  get molecules(): MoleculesClient;
  get main(): MainStateClient;
  get drift(): DriftClient;
}
```

### ReconciliationClient

Manage reconciliation runs (local and CI-attested).

```typescript
interface ReconciliationClient {
  // Start reconciliation with pre-read content (remote mode)
  analyzeWithPreReadContent(dto: PreReadContentDto): Promise<AnalysisStartResult>;

  // Run local reconciliation check (advisory plausibility report)
  check(): Promise<LocalReconciliationReport>;

  // Get run details
  getRunDetails(runId: string): Promise<ReconciliationRun>;

  // Get recommendations
  getRecommendations(runId: string): Promise<AtomRecommendation[]>;

  // Apply recommendations (draft atoms)
  applyRecommendations(runId: string, selections?: string[]): Promise<ApplyResult>;

  // Create governed change set (proposed atoms)
  createChangeSet(runId: string, options: CreateChangeSetOptions): Promise<ChangeSetResult>;

  // Trigger GitHub-based reconciliation (requires API key auth)
  triggerReconciliation(params: GitHubTriggerParams): Promise<ReconciliationRunStart>;
}

interface GitHubTriggerParams {
  commitSha: string;
  branch: string;
  repo?: string;  // Override configured repo
}

interface ReconciliationRunStart {
  runId: string;
  threadId: string;
  completed: boolean;
}

interface PreReadContentDto {
  rootDirectory: string;
  manifest: {
    files: string[];
    testFiles: string[];
    sourceFiles: string[];
  };
  fileContents: Record<string, string>;  // path → content
  commitHash?: string;
  options?: ReconciliationOptions;
}

interface LocalReconciliationReport {
  plausibleLinks: { atomId: string; testFile: string; confidence: number }[];
  orphanTests: string[];
  uncoveredAtoms: string[];
  qualitySummary?: { averageScore: number; gradeDistribution: Record<string, number> };
  generatedAt: Date;
  commitHash?: string;
}
```

### AtomsClient

Query and manage atoms.

```typescript
interface AtomsClient {
  list(filters?: AtomFilters): Promise<Atom[]>;
  get(id: string): Promise<Atom>;
  commit(id: string): Promise<Atom>;
  propose(dto: CreateAtomDto, changeSetId: string): Promise<Atom>;
  convertToDraft(id: string): Promise<Atom>;
}

interface AtomFilters {
  status?: 'draft' | 'proposed' | 'committed' | 'superseded';
  scope?: 'all' | 'main' | 'proposed';  // Default: 'all'
  category?: string;
  tags?: string[];
  search?: string;
}
```

### MoleculesClient

Query and manage molecules.

```typescript
interface MoleculesClient {
  list(filters?: MoleculeFilters): Promise<Molecule[]>;
  get(id: string): Promise<Molecule>;
  create(dto: CreateMoleculeDto): Promise<Molecule>;
  commitChangeSet(id: string): Promise<ChangeSetCommitResult>;
}
```

### MainStateClient

Cache and query Pact Main state (read-only).

```typescript
interface MainStateClient {
  // Pull Main state from server (replaces local cache entirely)
  pull(): Promise<PullResult>;

  // Check if local cache is stale
  isStale(maxAgeMs?: number): Promise<boolean>;

  // Load cached Main state
  load(): Promise<MainStateCache | null>;
}

interface MainStateCache {
  atoms: AtomSummary[];
  molecules: MoleculeSummary[];
  atomTestLinks: AtomTestLinkSummary[];
  snapshotVersion: number;
  pulledAt: Date;
  serverUrl: string;
  projectId?: string;
}

interface PullResult {
  atomCount: number;
  moleculeCount: number;
  pulledAt: Date;
}
```

### DriftClient

Query drift debt and convergence metrics.

```typescript
interface DriftClient {
  list(filters?: DriftFilters): Promise<DriftDebt[]>;
  getSummary(): Promise<DriftSummary>;
  getOverdue(): Promise<DriftDebt[]>;
  getAging(): Promise<AgingDistribution>;
  getConvergence(): Promise<ConvergenceReport>;
  acknowledge(id: string, comment?: string): Promise<DriftDebt>;
  waive(id: string, justification: string): Promise<DriftDebt>;
  resolve(id: string): Promise<DriftDebt>;
}

interface DriftSummary {
  totalOpen: number;
  byType: Record<DriftType, number>;
  bySeverity: Record<DriftSeverity, number>;
  overdueCount: number;
  convergenceScore: number;  // 0-100
}
```

### FileReader

Read local files and build manifests.

```typescript
class FileReader {
  constructor(projectRoot: string);

  // Read all relevant files for reconciliation
  readForReconciliation(options?: ReadOptions): Promise<ReadResult>;

  // Read specific files by path
  readFiles(paths: string[]): Promise<Map<string, string>>;

  // Build file manifest
  buildManifest(options?: ManifestOptions): Promise<FileManifest>;
}

interface ReadOptions {
  includeTests?: boolean;        // Default: true
  includeSources?: boolean;      // Default: true
  includeDocs?: boolean;         // Default: true
  excludePatterns?: string[];    // Glob patterns
  maxFiles?: number;             // Default: 10000
}

interface ReadResult {
  manifest: FileManifest;
  contents: Map<string, string>;
  totalSize: number;
}

interface FileManifest {
  files: string[];        // All discovered files
  testFiles: string[];    // Test files (*.spec.ts, *.test.ts, etc.)
  sourceFiles: string[];  // Source files (*.ts, *.tsx, *.js, etc.)
}
```

### GitClient

Git operations.

```typescript
class GitClient {
  constructor(projectRoot: string);

  getCurrentCommitHash(): Promise<string | null>;
  getChangedFiles(since?: string): Promise<string[]>;
  isGitRepository(): Promise<boolean>;
  getDiff(base?: string): Promise<string>;
}
```

### CoverageCollector

Collect and upload test coverage data.

```typescript
class CoverageCollector {
  // Read coverage from file (Istanbul/c8/lcov format)
  collectFromFile(coveragePath: string): Promise<CoverageData>;

  // Upload coverage to Pact server
  upload(client: PactClient, data: CoverageData): Promise<void>;
}

interface CoverageData {
  format: 'lcov' | 'istanbul' | 'c8';
  files: FileCoverage[];
  summary: {
    linesCovered: number;
    linesTotal: number;
    branchesCovered: number;
    branchesTotal: number;
  };
}
```

### PatchApplicator

Apply @atom annotation patches to local files.

```typescript
class PatchApplicator {
  constructor(projectRoot: string);

  // Apply patches to local files
  applyAnnotationPatches(patches: AnnotationPatch[]): Promise<ApplyResult>;

  // Preview patches without applying
  previewPatches(patches: AnnotationPatch[]): Promise<PatchPreview[]>;
}

interface AnnotationPatch {
  filePath: string;
  lineNumber: number;
  insertLine: string;  // e.g., "// @atom IA-123"
}

interface ApplyResult {
  appliedCount: number;
  failedCount: number;
  errors: PatchError[];
}
```

### MainCacheStore

Persist Main state cache locally.

```typescript
class MainCacheStore {
  constructor(projectRoot: string);

  load(): Promise<MainStateCache | null>;
  save(cache: MainStateCache): Promise<void>;
  isStale(maxAgeMs?: number): Promise<boolean>;
  clear(): Promise<void>;
}
```

## CLI Commands (Examples)

The SDK can be used to build CLI tools. Common patterns:

```bash
# Pull Pact Main state (read-only cache)
pact pull

# Run local reconciliation check (advisory plausibility report)
pact check

# Apply patches from last reconciliation
pact apply

# View drift summary
pact drift

# View cached Main state
pact main
```

See `examples/cli/` for implementation details.

## Deployment Models

The SDK enables four deployment models:

### Model A: Co-located (Current)
- Client and server on same machine
- Server uses FilesystemContentProvider
- Direct filesystem access

### Model B: Local Client + Remote
- VSCode extension or CLI tool reads local files
- Submits content via `analyzeWithPreReadContent()`
- Server uses PreReadContentProvider
- Local reconciliation is advisory (plausibility)

### Model C: CI/CD Pipeline
- GitHub Action or CI script reads files
- Uploads via `analyzeWithPreReadContent()` with `attestationType: 'ci-attested'`
- **This is the canonical promotion gate** (plausible → true)
- Drift debt updated only from CI-attested runs

### Model D: GitHub Clone (Primary Production Model)
- Pact server clones configured GitHub repo via PAT
- Uses `GitHubContentProvider` (shallow clone → FilesystemContentProvider)
- Triggered from dashboard UI, CLI (`triggerReconciliation()`), or CI webhook
- **Canonical reconciliation against the default branch**
- Atoms are only fully realized against merged code

### Model E: PactHub (Future)
- Multi-tenant shared Pact server
- Multiple teams submit CI-attested runs
- Main state cached locally per developer
- Full collaboration features (deferred from Phase 17)

## File System Conventions

The SDK uses a minimal `.pact/` directory in your project root:

```
.pact/
├── main-cache.json       # Cached Pact Main state (read-only)
└── local-report.json     # Last local reconciliation report
```

Both files are gitignored and ephemeral (safe to delete). The cache is replaced entirely on each `pull()` (no merge logic).

## Local vs Canonical Truth

**Critical distinction**:

- **Local reconciliation** (`client.reconciliation.check()`)
  - Produces plausibility reports (advisory only)
  - No server state modification
  - Uses cached Main state + local files
  - Useful for IDE hints, pre-commit checks

- **CI-attested reconciliation** (`attestationType: 'ci-attested'`)
  - Updates canonical epistemic state
  - Creates/updates drift debt records
  - Proven test-atom coupling (not just plausible)
  - **This is the single promotion gate**

**Rule**: Local = plausible, Canonical = true. Only CI-attested runs prove reality.

## Examples

### Example 1: VSCode Extension

```typescript
import * as vscode from 'vscode';
import { PactClient, FileReader, MainCacheStore } from '@pact/client-sdk';

export async function activate(context: vscode.ExtensionContext) {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
  if (!workspaceRoot) return;

  const client = new PactClient({
    serverUrl: 'https://pact.example.com',
    projectId: 'my-project',
    projectRoot: workspaceRoot,
  });

  // Pull Main state on activation
  await client.main.pull();

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('pact.check', async () => {
      const report = await client.reconciliation.check();
      vscode.window.showInformationMessage(
        `Orphan tests: ${report.orphanTests.length}, Uncovered atoms: ${report.uncoveredAtoms.length}`
      );
    })
  );

  // Show diagnostics for orphan tests
  const diagnosticCollection = vscode.languages.createDiagnosticCollection('pact');
  context.subscriptions.push(diagnosticCollection);

  const report = await client.reconciliation.check();
  for (const testFile of report.orphanTests) {
    const uri = vscode.Uri.file(testFile);
    const diagnostics: vscode.Diagnostic[] = [{
      range: new vscode.Range(0, 0, 0, 0),
      message: 'Test not linked to any Intent Atom',
      severity: vscode.DiagnosticSeverity.Warning,
      source: 'pact',
    }];
    diagnosticCollection.set(uri, diagnostics);
  }
}
```

### Example 2: CLI Tool

```typescript
#!/usr/bin/env node
import { PactClient } from '@pact/client-sdk';
import { program } from 'commander';

const client = new PactClient({
  serverUrl: process.env.PACT_SERVER_URL || 'http://localhost:3000',
  projectId: process.env.PACT_PROJECT_ID,
  projectRoot: process.cwd(),
});

program
  .command('pull')
  .description('Pull Pact Main state (read-only cache)')
  .action(async () => {
    const result = await client.main.pull();
    console.log(`Pulled ${result.atomCount} atoms, ${result.moleculeCount} molecules`);
  });

program
  .command('check')
  .description('Run local reconciliation check (advisory plausibility report)')
  .action(async () => {
    const report = await client.reconciliation.check();
    console.log(`Orphan tests: ${report.orphanTests.length}`);
    console.log(`Uncovered atoms: ${report.uncoveredAtoms.length}`);
    console.log(`Plausible links: ${report.plausibleLinks.length}`);
  });

program
  .command('drift')
  .description('View drift summary')
  .action(async () => {
    const summary = await client.drift.getSummary();
    console.log(`Total open drift: ${summary.totalOpen}`);
    console.log(`Overdue: ${summary.overdueCount}`);
    console.log(`Convergence score: ${summary.convergenceScore}/100`);
  });

program.parse();
```

### Example 3: CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/pact-reconciliation.yml
name: Pact Reconciliation

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  reconcile:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run tests with coverage
        run: npm run test:cov

      - name: Run Pact reconciliation (CI-attested)
        env:
          PACT_SERVER_URL: ${{ secrets.PACT_SERVER_URL }}
          PACT_AUTH_TOKEN: ${{ secrets.PACT_AUTH_TOKEN }}
          PACT_PROJECT_ID: ${{ secrets.PACT_PROJECT_ID }}
        run: |
          node scripts/pact-reconcile.js

      - name: Check drift convergence
        env:
          PACT_SERVER_URL: ${{ secrets.PACT_SERVER_URL }}
          PACT_AUTH_TOKEN: ${{ secrets.PACT_AUTH_TOKEN }}
        run: |
          node scripts/pact-drift-check.js
```

```typescript
// scripts/pact-reconcile.js
import { PactClient, FileReader, CoverageCollector } from '@pact/client-sdk';

const client = new PactClient({
  serverUrl: process.env.PACT_SERVER_URL,
  authToken: process.env.PACT_AUTH_TOKEN,
  projectId: process.env.PACT_PROJECT_ID,
  projectRoot: process.cwd(),
});

const fileReader = new FileReader(process.cwd());
const { manifest, contents } = await fileReader.readForReconciliation();

const result = await client.reconciliation.analyzeWithPreReadContent({
  rootDirectory: process.cwd(),
  manifest,
  fileContents: contents,
  options: {
    mode: 'full',
    attestationType: 'ci-attested',  // Canonical update
    exceptionLane: 'normal',
  },
});

console.log(`Reconciliation complete: ${result.runId}`);

// Upload coverage
const coverageCollector = new CoverageCollector();
const coverage = await coverageCollector.collectFromFile('./coverage/lcov.info');
await coverageCollector.upload(client, coverage);
```

## TypeScript Support

The SDK is written in TypeScript and provides full type definitions. All API responses are strongly typed.

```typescript
import { Atom, Molecule, DriftDebt, ReconciliationRun } from '@pact/client-sdk';

const atom: Atom = await client.atoms.get('abc-123');
// atom.status is typed as 'draft' | 'proposed' | 'committed' | 'superseded'
// atom.promotedToMainAt is typed as Date | null
```

## Error Handling

All async methods may throw errors. Wrap in try/catch:

```typescript
try {
  const result = await client.reconciliation.check();
} catch (error) {
  if (error.statusCode === 404) {
    console.error('Project not found');
  } else if (error.statusCode === 401) {
    console.error('Authentication failed');
  } else {
    console.error('Unexpected error:', error.message);
  }
}
```

## Testing

The SDK includes 99 comprehensive tests:

```bash
npm test                # Run all tests
npm run test:watch      # Watch mode
npm run test:cov        # With coverage report
```

## Development

```bash
# Build
npm run build

# Clean
npm run clean

# Lint
npm run lint
```

## Dependencies

**Zero runtime dependencies** - Uses only:
- `node:fs` - Filesystem access
- `node:path` - Path manipulation
- `node:child_process` - Git operations
- Global `fetch` - HTTP requests (Node.js 18+)

## License

UNLICENSED - Private project

## Support

For issues or questions:
- See main Pact documentation: [../../docs/](../../docs/)
- Check implementation checklists: [../../docs/implementation-checklist-phase17.md](../../docs/implementation-checklist-phase17.md)
- Review examples: [./examples/](./examples/)

---

**Ready to integrate Pact into your development workflow?** Start with the [Quick Start](#quick-start) guide above!
