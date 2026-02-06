"use strict";
/**
 * Coverage Collector Module
 *
 * Collects test coverage data from various formats (Istanbul, c8, lcov)
 * and transforms it for upload to the Pact server.
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
exports.CoverageCollector = void 0;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const git_client_1 = require("./git-client");
/**
 * Coverage collector for various coverage formats.
 */
class CoverageCollector {
    projectRoot;
    constructor(options) {
        this.projectRoot = options.projectRoot;
    }
    /**
     * Collect coverage from a file path.
     * Auto-detects the format based on file content/extension.
     *
     * @param coveragePath - Path to coverage file (relative or absolute)
     * @returns Normalized coverage data
     */
    async collectFromFile(coveragePath) {
        const fullPath = path.isAbsolute(coveragePath)
            ? coveragePath
            : path.join(this.projectRoot, coveragePath);
        if (!fs.existsSync(fullPath)) {
            throw new Error(`Coverage file not found: ${coveragePath}`);
        }
        const content = await fs.promises.readFile(fullPath, 'utf-8');
        const ext = path.extname(coveragePath).toLowerCase();
        // Detect format and parse
        if (ext === '.json') {
            return this.parseIstanbulJson(content);
        }
        else if (ext === '.info' || coveragePath.includes('lcov')) {
            return this.parseLcov(content);
        }
        else {
            // Try to auto-detect based on content
            try {
                const json = JSON.parse(content);
                if (json.total && json.total.lines) {
                    return this.parseIstanbulSummary(json);
                }
                else {
                    return this.parseIstanbulCoverage(json);
                }
            }
            catch {
                throw new Error(`Unknown coverage format for file: ${coveragePath}`);
            }
        }
    }
    /**
     * Collect coverage from the default Istanbul/NYC output locations.
     *
     * @returns Coverage data or null if no coverage found
     */
    async collectFromDefaults() {
        const defaultPaths = [
            'coverage/coverage-summary.json',
            'coverage/coverage-final.json',
            '.nyc_output/coverage.json',
            'coverage/lcov.info',
        ];
        for (const coveragePath of defaultPaths) {
            const fullPath = path.join(this.projectRoot, coveragePath);
            if (fs.existsSync(fullPath)) {
                return this.collectFromFile(coveragePath);
            }
        }
        return null;
    }
    /**
     * Parse Istanbul coverage-summary.json format.
     */
    parseIstanbulSummary(summary) {
        const files = [];
        for (const [filePath, data] of Object.entries(summary)) {
            if (filePath === 'total')
                continue;
            files.push({
                path: this.normalizeFilePath(filePath),
                statements: data.statements.pct,
                branches: data.branches.pct,
                functions: data.functions.pct,
                lines: data.lines.pct,
                uncoveredLines: [], // Summary doesn't include line-level detail
            });
        }
        const commitHash = this.getCommitHash();
        return {
            format: 'istanbul',
            statements: summary.total.statements.pct,
            branches: summary.total.branches.pct,
            functions: summary.total.functions.pct,
            lines: summary.total.lines.pct,
            files,
            timestamp: new Date(),
            commitHash,
        };
    }
    /**
     * Parse Istanbul coverage-final.json or coverage.json format.
     */
    parseIstanbulCoverage(coverage) {
        const files = [];
        let totalStatements = 0;
        let coveredStatements = 0;
        let totalBranches = 0;
        let coveredBranches = 0;
        let totalFunctions = 0;
        let coveredFunctions = 0;
        let totalLines = 0;
        let coveredLines = 0;
        for (const [, data] of Object.entries(coverage)) {
            const uncoveredLines = [];
            // Calculate statement coverage
            const statementCounts = Object.values(data.s);
            const fileStatements = statementCounts.length;
            const fileCoveredStatements = statementCounts.filter((c) => c > 0).length;
            // Calculate function coverage
            const functionCounts = Object.values(data.f);
            const fileFunctions = functionCounts.length;
            const fileCoveredFunctions = functionCounts.filter((c) => c > 0).length;
            // Calculate branch coverage
            const branchCounts = Object.values(data.b).flat();
            const fileBranches = branchCounts.length;
            const fileCoveredBranches = branchCounts.filter((c) => c > 0).length;
            // Find uncovered lines from statement map
            for (const [statementId, location] of Object.entries(data.statementMap)) {
                if (data.s[statementId] === 0) {
                    for (let line = location.start.line; line <= location.end.line; line++) {
                        if (!uncoveredLines.includes(line)) {
                            uncoveredLines.push(line);
                        }
                    }
                }
            }
            // Calculate line coverage (approximation based on statements)
            const fileLines = Object.keys(data.statementMap).length;
            const fileCoveredLines = fileLines - uncoveredLines.length;
            files.push({
                path: this.normalizeFilePath(data.path),
                statements: fileStatements > 0 ? (fileCoveredStatements / fileStatements) * 100 : 100,
                branches: fileBranches > 0 ? (fileCoveredBranches / fileBranches) * 100 : 100,
                functions: fileFunctions > 0 ? (fileCoveredFunctions / fileFunctions) * 100 : 100,
                lines: fileLines > 0 ? (fileCoveredLines / fileLines) * 100 : 100,
                uncoveredLines: uncoveredLines.sort((a, b) => a - b),
            });
            totalStatements += fileStatements;
            coveredStatements += fileCoveredStatements;
            totalBranches += fileBranches;
            coveredBranches += fileCoveredBranches;
            totalFunctions += fileFunctions;
            coveredFunctions += fileCoveredFunctions;
            totalLines += fileLines;
            coveredLines += fileCoveredLines;
        }
        const commitHash = this.getCommitHash();
        return {
            format: 'istanbul',
            statements: totalStatements > 0 ? (coveredStatements / totalStatements) * 100 : 100,
            branches: totalBranches > 0 ? (coveredBranches / totalBranches) * 100 : 100,
            functions: totalFunctions > 0 ? (coveredFunctions / totalFunctions) * 100 : 100,
            lines: totalLines > 0 ? (coveredLines / totalLines) * 100 : 100,
            files,
            timestamp: new Date(),
            commitHash,
        };
    }
    /**
     * Parse Istanbul JSON format (can be either summary or detailed).
     */
    parseIstanbulJson(content) {
        const json = JSON.parse(content);
        // Check if it's a summary format
        if (json.total && json.total.lines) {
            return this.parseIstanbulSummary(json);
        }
        // Otherwise it's the detailed format
        return this.parseIstanbulCoverage(json);
    }
    /**
     * Parse LCOV format.
     */
    parseLcov(content) {
        const files = [];
        let currentFile = null;
        let totalLines = 0;
        let coveredLines = 0;
        let totalFunctions = 0;
        let coveredFunctions = 0;
        let totalBranches = 0;
        let coveredBranches = 0;
        let fileLines = 0;
        let fileCoveredLines = 0;
        let fileFunctions = 0;
        let fileCoveredFunctions = 0;
        let fileBranches = 0;
        let fileCoveredBranches = 0;
        let uncoveredLines = [];
        const lines = content.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('SF:')) {
                // Source file
                currentFile = trimmed.substring(3);
            }
            else if (trimmed.startsWith('DA:')) {
                // Line data: DA:line,hitcount
                const parts = trimmed.substring(3).split(',');
                const lineNum = parseInt(parts[0], 10);
                const hits = parseInt(parts[1], 10);
                fileLines++;
                if (hits > 0) {
                    fileCoveredLines++;
                }
                else {
                    uncoveredLines.push(lineNum);
                }
            }
            else if (trimmed.startsWith('FN:')) {
                // Function definition
                fileFunctions++;
            }
            else if (trimmed.startsWith('FNDA:')) {
                // Function data: FNDA:hitcount,name
                const hits = parseInt(trimmed.substring(5).split(',')[0], 10);
                if (hits > 0) {
                    fileCoveredFunctions++;
                }
            }
            else if (trimmed.startsWith('BRDA:')) {
                // Branch data: BRDA:line,block,branch,hitcount
                const parts = trimmed.substring(5).split(',');
                const hits = parts[3] === '-' ? 0 : parseInt(parts[3], 10);
                fileBranches++;
                if (hits > 0) {
                    fileCoveredBranches++;
                }
            }
            else if (trimmed === 'end_of_record') {
                // End of file record
                if (currentFile) {
                    files.push({
                        path: this.normalizeFilePath(currentFile),
                        statements: fileLines > 0 ? (fileCoveredLines / fileLines) * 100 : 100,
                        branches: fileBranches > 0 ? (fileCoveredBranches / fileBranches) * 100 : 100,
                        functions: fileFunctions > 0 ? (fileCoveredFunctions / fileFunctions) * 100 : 100,
                        lines: fileLines > 0 ? (fileCoveredLines / fileLines) * 100 : 100,
                        uncoveredLines: uncoveredLines.sort((a, b) => a - b),
                    });
                    totalLines += fileLines;
                    coveredLines += fileCoveredLines;
                    totalFunctions += fileFunctions;
                    coveredFunctions += fileCoveredFunctions;
                    totalBranches += fileBranches;
                    coveredBranches += fileCoveredBranches;
                }
                // Reset for next file
                currentFile = null;
                fileLines = 0;
                fileCoveredLines = 0;
                fileFunctions = 0;
                fileCoveredFunctions = 0;
                fileBranches = 0;
                fileCoveredBranches = 0;
                uncoveredLines = [];
            }
        }
        const commitHash = this.getCommitHash();
        return {
            format: 'lcov',
            statements: totalLines > 0 ? (coveredLines / totalLines) * 100 : 100,
            branches: totalBranches > 0 ? (coveredBranches / totalBranches) * 100 : 100,
            functions: totalFunctions > 0 ? (coveredFunctions / totalFunctions) * 100 : 100,
            lines: totalLines > 0 ? (coveredLines / totalLines) * 100 : 100,
            files,
            timestamp: new Date(),
            commitHash,
        };
    }
    /**
     * Normalize file path to be relative to project root.
     */
    normalizeFilePath(filePath) {
        if (path.isAbsolute(filePath)) {
            return path.relative(this.projectRoot, filePath);
        }
        return filePath;
    }
    /**
     * Get current git commit hash.
     */
    getCommitHash() {
        try {
            const gitClient = new git_client_1.GitClient({ projectRoot: this.projectRoot });
            if (gitClient.isGitRepository()) {
                return gitClient.getCurrentCommitHash();
            }
        }
        catch {
            // Git not available
        }
        return undefined;
    }
}
exports.CoverageCollector = CoverageCollector;
