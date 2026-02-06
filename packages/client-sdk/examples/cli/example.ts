/**
 * CLI Tool Example
 *
 * Demonstrates how to build a `pact` CLI tool using @pact/client-sdk.
 *
 * Commands:
 * - pact pull   : Cache Pact Main commitments locally
 * - pact check  : Generate local reconciliation report (plausibility)
 * - pact apply  : Apply @atom patches locally
 * - pact status : Show current local state vs Main
 *
 * Note: There is no `pact push` command — canonical updates happen through CI only.
 * This enforces the principle: "Local = plausible, CI-attested = true"
 */

// Use relative import for development; published package uses '@pact/client-sdk'
import { PactClient, formatCheckResult } from '../../src';

// CLI configuration (would come from .pactrc, env vars, or flags)
interface CliConfig {
  serverUrl: string;
  projectRoot: string;
  projectId?: string;
  authToken?: string;
  verbose?: boolean;
}

function log(config: CliConfig, message: string) {
  if (config.verbose) {
    console.log(message);
  }
}

/**
 * pact pull
 *
 * Downloads and caches the current Pact Main state locally.
 * Used for:
 * - Offline IDE hints
 * - Fast local comparisons
 * - Pre-commit checks without network
 */
export async function pullCommand(config: CliConfig): Promise<number> {
  console.log('Pulling Pact Main state...\n');

  const client = new PactClient(config);

  try {
    const result = await client.pull();

    console.log(`Cached to: ${result.cachePath}`);
    console.log(`  Atoms:     ${result.atomCount}`);
    console.log(`  Molecules: ${result.moleculeCount}`);
    console.log(`  Links:     ${result.linkCount}`);
    console.log(`  Version:   ${result.snapshotVersion}`);

    if (!result.wasPerformed) {
      console.log('\n(Cache was fresh, no download needed)');
    }

    console.log(`\nPull successful.`);
    return 0;
  } catch (error) {
    console.error(`Pull failed: ${error instanceof Error ? error.message : error}`);
    return 1;
  }
}

/**
 * pact check
 *
 * Runs a local reconciliation check against the cached Main state.
 * Produces a PLAUSIBILITY report — advisory only, not canonical.
 *
 * Exit codes:
 * - 0: All tests linked, no issues
 * - 1: Orphan tests or uncovered atoms found
 * - 2: Error running check
 */
export async function checkCommand(
  config: CliConfig,
  options?: { json?: boolean },
): Promise<number> {
  console.log('Running local reconciliation check...\n');

  const client = new PactClient(config);

  try {
    const result = await client.check();

    if (options?.json) {
      // JSON output for CI/scripts
      console.log(JSON.stringify(result.report, null, 2));
    } else {
      // Human-readable output
      console.log(formatCheckResult(result));
    }

    // Exit code based on issues
    const hasIssues = result.report.orphanTests.length > 0 || result.report.uncoveredAtoms.length > 0;

    if (hasIssues) {
      console.log('\nNote: This is a local plausibility check.');
      console.log('Canonical state is only updated through CI-attested runs.');
      return 1;
    }

    return 0;
  } catch (error) {
    console.error(`Check failed: ${error instanceof Error ? error.message : error}`);
    return 2;
  }
}

/**
 * pact apply
 *
 * Applies @atom annotation patches to local files.
 * Patches come from server recommendations or local analysis.
 *
 * Options:
 * - --preview : Show what would be applied without making changes
 * - --backup  : Create .bak files before modifying (default: true)
 */
export async function applyCommand(
  config: CliConfig,
  patchFile: string,
  options?: { preview?: boolean; backup?: boolean },
): Promise<number> {
  const client = new PactClient(config);

  try {
    // Load patches from file (JSON format)
    const fs = await import('node:fs/promises');
    const patchData = await fs.readFile(patchFile, 'utf-8');
    const patches = JSON.parse(patchData);

    if (!Array.isArray(patches)) {
      console.error('Patch file must contain an array of patches');
      return 1;
    }

    console.log(`Found ${patches.length} patches to apply\n`);

    // Validate patches
    const errors = await client.patches.validatePatches(patches);
    if (errors.length > 0) {
      console.error('Validation errors:');
      for (const error of errors) {
        console.error(`  - ${error}`);
      }
      return 1;
    }

    if (options?.preview) {
      // Preview mode
      console.log('Preview (no changes made):\n');
      const previews = await client.patches.previewPatches(patches);

      for (const preview of previews) {
        if (preview.success) {
          console.log(`${preview.filePath}:`);
          console.log(preview.preview);
          console.log('---');
        } else {
          console.error(`${preview.filePath}: ${preview.error}`);
        }
      }

      return 0;
    }

    // Apply patches
    const results = await client.patches.applyPatches(patches);

    let exitCode = 0;
    for (const result of results) {
      if (result.success) {
        console.log(`Applied: ${result.filePath}`);
      } else {
        console.error(`Failed:  ${result.filePath} - ${result.error}`);
        exitCode = 1;
      }
    }

    const successful = results.filter((r) => r.success).length;
    console.log(`\n${successful}/${patches.length} patches applied successfully.`);

    return exitCode;
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : error}`);
    return 1;
  }
}

/**
 * pact status
 *
 * Shows the current local state compared to cached Main.
 * Includes:
 * - Cache freshness
 * - Local coverage summary
 * - Quick drift indicators
 */
export async function statusCommand(config: CliConfig): Promise<number> {
  const client = new PactClient(config);

  try {
    const cache = await client.getCache();
    const summary = cache.getSummary();

    console.log('Pact Status\n');
    console.log('Cache:');
    console.log(`  Location:  .pact/main-cache.json`);
    console.log(`  Timestamp: ${summary.pulledAt?.toISOString() ?? 'never'}`);
    console.log(`  Server:    ${cache.getServerUrl() || 'unknown'}`);
    console.log(`  Version:   ${summary.snapshotVersion}`);

    console.log('\nMain State:');
    console.log(`  Atoms:       ${summary.atomCount}`);
    console.log(`  Molecules:   ${summary.moleculeCount}`);
    console.log(`  Test Links:  ${summary.linkCount}`);
    console.log(`  Committed:   ${summary.committedAtoms}`);
    console.log(`  Uncovered:   ${summary.uncoveredAtoms}`);

    // Quick local check
    console.log('\nLocal Check:');
    try {
      const checkResult = await client.check();
      const report = checkResult.report;
      console.log(`  Plausible Links: ${report.plausibleLinks.length}`);
      console.log(`  Orphan Tests:    ${report.orphanTests.length}`);
      console.log(`  Uncovered Atoms: ${report.uncoveredAtoms.length}`);

      if (checkResult.warnings.length > 0) {
        console.log('\nWarnings:');
        for (const warning of checkResult.warnings) {
          console.log(`  - ${warning}`);
        }
      }
    } catch {
      console.log('  (unable to run local check)');
    }

    return 0;
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : error}`);
    return 1;
  }
}

/**
 * Main CLI entry point
 */
export async function main(args: string[]): Promise<number> {
  const command = args[0];

  // Default config (would be loaded from .pactrc or env)
  const config: CliConfig = {
    serverUrl: process.env.PACT_SERVER_URL || 'http://localhost:3000',
    projectRoot: process.cwd(),
    projectId: process.env.PACT_PROJECT_ID,
    authToken: process.env.PACT_AUTH_TOKEN,
    verbose: args.includes('--verbose') || args.includes('-v'),
  };

  switch (command) {
    case 'pull':
      return pullCommand(config);

    case 'check':
      return checkCommand(config, { json: args.includes('--json') });

    case 'apply':
      const patchFile = args[1];
      if (!patchFile) {
        console.error('Usage: pact apply <patch-file.json> [--preview]');
        return 1;
      }
      return applyCommand(config, patchFile, {
        preview: args.includes('--preview'),
        backup: !args.includes('--no-backup'),
      });

    case 'status':
      return statusCommand(config);

    case 'help':
    case '--help':
    case '-h':
      printHelp();
      return 0;

    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      return 1;
  }
}

function printHelp() {
  console.log(`
pact - Local client for Pact intent management

COMMANDS:
  pull     Download and cache Pact Main state locally
  check    Run local reconciliation check (plausibility)
  apply    Apply @atom annotation patches to files
  status   Show current local state vs cached Main

OPTIONS:
  --verbose, -v    Show detailed output
  --json           Output in JSON format (check command)
  --preview        Preview changes without applying (apply command)
  --no-backup      Don't create backup files (apply command)

ENVIRONMENT:
  PACT_SERVER_URL   Server URL (default: http://localhost:3000)
  PACT_PROJECT_ID   Project identifier
  PACT_AUTH_TOKEN   Authentication token

EXAMPLES:
  pact pull                      Cache Main state from server
  pact check                     Check local test coverage
  pact check --json              Output check results as JSON
  pact apply patches.json        Apply @atom annotations
  pact apply patches.json --preview  Preview without applying
  pact status                    Show current state summary

NOTE:
  There is no 'pact push' command. Canonical state updates happen
  only through CI-attested reconciliation runs. Local checks are
  advisory (plausibility signals), not authoritative.
`);
}

// Run if executed directly
if (require.main === module) {
  main(process.argv.slice(2)).then(process.exit);
}
