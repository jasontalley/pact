# @pact/client-sdk Examples

This directory contains examples demonstrating how to use the @pact/client-sdk in different deployment scenarios.

## Deployment Models

| Model | Example | Description |
|-------|---------|-------------|
| VSCode Extension | [vscode-extension/](vscode-extension/) | IDE integration for local plausibility checks |
| CLI Tool | [cli/](cli/) | Command-line interface for developers |
| CI/CD Pipeline | [ci/](ci/) | The canonical promotion gate |

## Core Principle

**Local = Plausible. CI-Attested = True.**

- Local checks (VSCode, CLI) produce *plausibility* signals — advisory, not authoritative
- Only CI-attested runs update *canonical* epistemic state
- There is no `pact push` command — truth flows through CI only

## VSCode Extension Example

Shows how to:
- Pull Main state for IDE hints
- Run local reconciliation checks
- Apply @atom annotations
- Display coverage in code lens

```typescript
import { PactClient } from '@pact/client-sdk';

const client = new PactClient({
  serverUrl: 'https://pact.example.com',
  projectRoot: '/path/to/workspace',
});

// Pull Main state for IDE hints
const pullResult = await client.pull();

// Run local check (plausibility)
const checkResult = await client.check();
```

## CLI Tool Example

Commands:
- `pact pull` — Cache Main state locally
- `pact check` — Run local reconciliation check
- `pact apply` — Apply @atom patches
- `pact status` — Show current state summary

```bash
# Environment
export PACT_SERVER_URL=https://pact.example.com
export PACT_PROJECT_ID=my-project

# Commands
pact pull                    # Cache Main state
pact check                   # Check local coverage
pact check --json            # JSON output for scripting
pact apply patches.json      # Apply recommendations
```

## CI/CD Pipeline Example

The canonical promotion path — the only way to update truth:

```yaml
# .github/workflows/pact.yml
name: Pact Reconciliation

on:
  push:
    branches: [main]

jobs:
  reconcile:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm test -- --coverage

      - name: Pact Reconciliation
        run: npx ts-node packages/client-sdk/examples/ci/example.ts
        env:
          PACT_SERVER_URL: ${{ secrets.PACT_SERVER_URL }}
          PACT_AUTH_TOKEN: ${{ secrets.PACT_AUTH_TOKEN }}
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PACT_SERVER_URL` | Pact server URL | `http://localhost:3000` |
| `PACT_PROJECT_ID` | Project identifier | (none) |
| `PACT_AUTH_TOKEN` | Authentication token | (none) |
| `PACT_COVERAGE_PATH` | Path to coverage file | (auto-detect) |
| `PACT_FAIL_ON_UNLINKED` | Fail CI on unlinked tests | `true` |
| `PACT_FAIL_ON_DRIFT` | Fail CI on drift warnings | `false` |
| `PACT_MIN_COVERAGE` | Minimum coverage percent | (none) |

## Running Examples

These examples are reference implementations. To run them:

```bash
# Install dependencies
npm install

# Run CLI example
npx ts-node packages/client-sdk/examples/cli/example.ts --help

# Run CI example (requires CI environment)
CI=true npx ts-node packages/client-sdk/examples/ci/example.ts
```

## See Also

- [Client SDK Documentation](../README.md)
- [Phase 17: Local/Remote Split](../../../docs/implementation-checklist-phase17.md)
