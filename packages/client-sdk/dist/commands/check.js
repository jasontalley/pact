"use strict";
/**
 * Check Command
 *
 * Runs a local reconciliation check using cached Main state
 * and local files. Produces an advisory plausibility report.
 *
 * This is the `pact check` developer command.
 *
 * IMPORTANT: Local = plausible, Canonical = true.
 * This command produces advisory reports only - it does not
 * update any canonical state on the server.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.check = check;
exports.createCheckCommand = createCheckCommand;
exports.formatCheckResult = formatCheckResult;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const main_cache_store_1 = require("../main-cache-store");
const main_cache_1 = require("../main-cache");
const file_reader_1 = require("../file-reader");
const git_client_1 = require("../git-client");
/**
 * Execute the check command.
 *
 * Performs a local reconciliation using:
 * 1. Cached Main state (atoms, molecules, links)
 * 2. Local test files
 *
 * Produces a plausibility report showing:
 * - Plausible atom-test links found locally
 * - Orphan tests (no atom linkage)
 * - Uncovered atoms (no test linkage)
 *
 * @param options - Check command options
 * @returns Check result with report
 */
async function check(options) {
    const warnings = [];
    // Load cached Main state
    const cacheStore = new main_cache_store_1.MainCacheStore({
        projectRoot: options.projectRoot,
    });
    let cache;
    if (!cacheStore.exists()) {
        warnings.push('No Main state cache found. Run "pact pull" first for accurate results.');
        cache = new main_cache_1.MainCache(); // Empty cache
    }
    else {
        cache = await cacheStore.load();
        // Check cache freshness
        const maxAge = options.maxCacheAge ?? 24 * 60 * 60 * 1000;
        if (cache.isStale(maxAge)) {
            warnings.push(`Cache is stale (last pulled: ${cache.getPulledAt()?.toISOString()}). Consider running "pact pull".`);
        }
    }
    // Scan local test files
    const fileReader = new file_reader_1.FileReader({
        projectRoot: options.projectRoot,
        excludePatterns: options.excludePatterns,
        maxFiles: options.maxFiles,
    });
    const manifest = await fileReader.buildManifest();
    // Get git commit hash if available
    let commitHash;
    try {
        const gitClient = new git_client_1.GitClient({ projectRoot: options.projectRoot });
        if (gitClient.isGitRepository()) {
            commitHash = gitClient.getCurrentCommitHash();
        }
    }
    catch {
        // Git not available
    }
    // Find plausible links by scanning test files for @atom annotations
    const plausibleLinks = [];
    const linkedTestFiles = new Set();
    for (const testFile of manifest.testFiles) {
        const content = await fileReader.readFile(testFile);
        if (!content)
            continue;
        // Find @atom annotations
        const atomAnnotations = findAtomAnnotations(content);
        for (const annotation of atomAnnotations) {
            const atom = cache.getAtom(annotation.atomId);
            const confidence = atom ? 1.0 : 0.5; // Lower confidence if atom not in cache
            plausibleLinks.push({
                atomId: annotation.atomId,
                testFile,
                confidence,
            });
            linkedTestFiles.add(testFile);
        }
    }
    // Find orphan tests (test files with no @atom annotations)
    const orphanTests = manifest.testFiles.filter((file) => !linkedTestFiles.has(file));
    // Find uncovered atoms (atoms with no test links in cache)
    const uncoveredAtoms = cache.getUncoveredAtoms().map((atom) => atom.id);
    // Build report
    const report = {
        plausibleLinks,
        orphanTests,
        uncoveredAtoms,
        generatedAt: new Date(),
        commitHash,
        isAdvisory: true,
    };
    // Add quality summary if we have enough data
    if (plausibleLinks.length > 0) {
        const avgConfidence = plausibleLinks.reduce((sum, link) => sum + link.confidence, 0) / plausibleLinks.length;
        report.qualitySummary = {
            averageScore: avgConfidence * 100,
            gradeDistribution: {
                high: plausibleLinks.filter((l) => l.confidence >= 0.8).length,
                medium: plausibleLinks.filter((l) => l.confidence >= 0.5 && l.confidence < 0.8).length,
                low: plausibleLinks.filter((l) => l.confidence < 0.5).length,
            },
        };
    }
    // Save report
    const reportPath = options.outputPath ?? path.join(options.projectRoot, '.pact', 'local-report.json');
    // Ensure directory exists
    const reportDir = path.dirname(reportPath);
    if (!fs.existsSync(reportDir)) {
        await fs.promises.mkdir(reportDir, { recursive: true });
    }
    await fs.promises.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');
    return {
        report,
        reportPath,
        warnings,
    };
}
/**
 * Find @atom annotations in file content.
 */
function findAtomAnnotations(content) {
    const annotations = [];
    const lines = content.split('\n');
    // Pattern to match @atom annotations
    // Supports: // @atom IA-001, /* @atom IA-001 */, # @atom IA-001
    const atomPattern = /@atom\s+(IA-\d+|[a-zA-Z0-9_-]+)/g;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let match;
        // Reset regex state
        atomPattern.lastIndex = 0;
        while ((match = atomPattern.exec(line)) !== null) {
            annotations.push({
                atomId: match[1],
                line: i + 1,
            });
        }
    }
    return annotations;
}
/**
 * Create a check command with pre-configured options.
 * Useful for CLI tools.
 */
function createCheckCommand(defaultOptions) {
    return (options) => {
        const mergedOptions = {
            ...defaultOptions,
            ...options,
        };
        if (!mergedOptions.projectRoot) {
            throw new Error('projectRoot is required');
        }
        return check(mergedOptions);
    };
}
/**
 * Format the check result for CLI output.
 */
function formatCheckResult(result) {
    const { report, warnings } = result;
    const lines = [];
    // Header
    lines.push('=== Pact Local Check Report ===');
    lines.push(`Generated: ${report.generatedAt.toISOString()}`);
    if (report.commitHash) {
        lines.push(`Commit: ${report.commitHash.substring(0, 8)}`);
    }
    lines.push('');
    // Warnings
    if (warnings.length > 0) {
        lines.push('⚠️  Warnings:');
        for (const warning of warnings) {
            lines.push(`   - ${warning}`);
        }
        lines.push('');
    }
    // Summary
    lines.push('📊 Summary:');
    lines.push(`   Plausible links: ${report.plausibleLinks.length}`);
    lines.push(`   Orphan tests: ${report.orphanTests.length}`);
    lines.push(`   Uncovered atoms: ${report.uncoveredAtoms.length}`);
    lines.push('');
    // Quality summary
    if (report.qualitySummary) {
        lines.push('📈 Quality:');
        lines.push(`   Average confidence: ${report.qualitySummary.averageScore.toFixed(1)}%`);
        lines.push(`   High confidence: ${report.qualitySummary.gradeDistribution.high || 0}`);
        lines.push(`   Medium confidence: ${report.qualitySummary.gradeDistribution.medium || 0}`);
        lines.push(`   Low confidence: ${report.qualitySummary.gradeDistribution.low || 0}`);
        lines.push('');
    }
    // Orphan tests (if any)
    if (report.orphanTests.length > 0) {
        lines.push('📝 Orphan Tests (no @atom annotation):');
        const displayCount = Math.min(report.orphanTests.length, 10);
        for (let i = 0; i < displayCount; i++) {
            lines.push(`   - ${report.orphanTests[i]}`);
        }
        if (report.orphanTests.length > displayCount) {
            lines.push(`   ... and ${report.orphanTests.length - displayCount} more`);
        }
        lines.push('');
    }
    // Uncovered atoms (if any)
    if (report.uncoveredAtoms.length > 0) {
        lines.push('🔴 Uncovered Atoms (no test linkage):');
        const displayCount = Math.min(report.uncoveredAtoms.length, 10);
        for (let i = 0; i < displayCount; i++) {
            lines.push(`   - ${report.uncoveredAtoms[i]}`);
        }
        if (report.uncoveredAtoms.length > displayCount) {
            lines.push(`   ... and ${report.uncoveredAtoms.length - displayCount} more`);
        }
        lines.push('');
    }
    // Advisory notice
    lines.push('ℹ️  This report is advisory only (local = plausible).');
    lines.push('   Canonical truth requires CI-attested reconciliation.');
    return lines.join('\n');
}
