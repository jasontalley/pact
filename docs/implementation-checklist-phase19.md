# Implementation Checklist: Phase 19 — Pact Self-Hosting via Brownfield Reconciliation

## Document Metadata

| Field | Value |
|-------|-------|
| **Phase** | 19 |
| **Focus** | Externalize Pact from itself using brownfield reconciliation |
| **Status** | Not Started |
| **Prerequisites** | Phase 18 (Agent-suggested atoms, HITL approval, reconciliation inference) |
| **Related Docs** | [agents-overview.md](agents-overview.md), [implementation-checklist-phase18.md](implementation-checklist-phase18.md) |

---

## Overview

Phase 19 completes Pact's journey to self-hosting by treating **Pact's own codebase as a brownfield project**. Instead of manually importing atoms, we use Pact's reconciliation agent to analyze Pact's tests, infer atoms, and establish Pact Main as the canonical source of truth.

**Core Principle**: **Pact manages Pact the same way it would manage any brownfield codebase.**

### The Goal

Run Pact's reconciliation agent on Pact's own repository to:
1. Analyze 142 test files with 800+ test cases
2. Infer 200-300 atoms from existing test behavior
3. Human approval of inferred atoms
4. Annotate tests with `@atom` references
5. CI validates coverage against Pact Main
6. Establish Pact Main as canonical truth

### Why This Matters

This validates Pact's core value proposition: **"Drop Pact into any brownfield codebase and it will extract your intent graph from existing tests."**

If Pact can successfully analyze itself, it can analyze any project.

---

## Epistemic Authority Model

```
┌──────────────────────────────────────────────────────────┐
│  PACT MAIN (Canonical Truth)                              │
│  - Atoms: committed via HITL approval                    │
│  - Molecules: approved groupings                         │
│  - Test-Atom Links: CI-attested                          │
│  - Coverage: CI-attested canonical state                 │
│                                                          │
│  Updated ONLY via:                                       │
│  1. CI attestation (reconciliation runs)                 │
│  2. HITL approval (proposed → committed)                 │
└──────────────────────────────────────────────────────────┘
                          ▲
                          │ Reconciliation infers
                          │
┌──────────────────────────┴───────────────────────────────┐
│  Pact Repository (Code + Test References)                │
│  - Source code: src/**/*.ts                              │
│  - Tests: **/*.spec.ts with @atom annotations            │
│  - Coverage reports: test-results/                       │
│                                                          │
│  Tests reference Pact Main via @atom IA-XXX              │
└──────────────────────────────────────────────────────────┘
```

**Key Insight**: Pact Main (database) is canonical. Git contains code and references to atoms, not atom definitions.

---

## 19.1 Project Initialization

### Context

Create the "pact" project in Pact's database and configure for self-hosting.

### Tasks

- [ ] **19.1.1** Create project initialization script
  - **File**: `scripts/init-pact-self-hosting.ts`
  - **Priority**: High | **Effort**: S
  - **Details**:
    - Create "pact" project in database:
      ```typescript
      const project = await projectsRepo.save({
        name: 'pact',
        description: 'Pact intent management system - managing itself',
        repositoryUrl: 'https://github.com/yourorg/pact',
        rootDirectory: process.cwd(),
      });
      ```
    - Create default reconciliation policy:
      ```typescript
      await policiesRepo.save({
        projectId: project.id,
        allowAgentAtomSuggestions: true,
        ciBlockOnProposedAtoms: true,
        reconciliationInfersAtoms: true,
        minConfidenceForSuggestion: 0.75,
      });
      ```
    - Return project ID for subsequent steps
    - Idempotent (safe to run multiple times)

- [ ] **19.1.2** Verify project creation
  - **Priority**: High | **Effort**: S
  - **Dependencies**: 19.1.1
  - **Details**:
    - Query project via API: `GET /api/projects/1`
    - Verify fields: name, description, rootDirectory
    - Verify policy exists: `GET /api/reconciliation/policies/1`
    - Verify empty state: 0 atoms, 0 molecules, 0 links

- [ ] **19.1.3** Document project ID for MCP/CI configuration
  - **File**: `.env.example` or `docs/self-hosting-setup.md`
  - **Priority**: Medium | **Effort**: S
  - **Details**:
    - Document `PACT_PROJECT_ID=1` for use in scripts
    - Add to MCP server configuration
    - Add to CI environment variables

---

## 19.2 Initial Brownfield Reconciliation

### Context

Run full-scan reconciliation on Pact's codebase to infer atoms from existing tests. This is the **critical test** of Pact's brownfield integration capabilities.

### Tasks

- [ ] **19.2.1** Prepare Pact codebase for analysis
  - **Priority**: High | **Effort**: S
  - **Details**:
    - Ensure all tests are passing: `npm test`
    - Generate coverage: `npm run test:cov`
    - Verify test file count: `find . -name "*.spec.ts" | wc -l` (expect 140+)
    - Remove any existing `@atom` annotations (if any) to simulate brownfield

- [ ] **19.2.2** Run initial reconciliation with inference
  - **File**: `scripts/reconcile-pact-initial.ts`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 19.1.1, 19.2.1
  - **Details**:
    - Script to trigger reconciliation:
      ```typescript
      const client = new PactClient({
        serverUrl: 'http://localhost:3000',
        projectRoot: process.cwd(),
        projectId: 1,
      });

      console.log('Starting initial brownfield reconciliation...\n');
      console.log('This will analyze Pact\'s codebase and infer atoms from tests.\n');

      const result = await client.reconcile({
        mode: 'full-scan',
        options: {
          includeSourceFiles: true,
          includeDocs: false,
          inferAtoms: true,           // Enable atom inference
          minConfidence: 0.75,         // Minimum confidence for suggestions
        }
      });

      console.log('\nReconciliation complete!');
      console.log(`Run ID: ${result.runId}`);
      console.log(`Status: ${result.status}`);
      console.log(`Duration: ${result.durationMs}ms`);
      console.log(`\nResults:`);
      console.log(`  Tests analyzed: ${result.testsAnalyzed}`);
      console.log(`  Atoms inferred: ${result.atomsInferred}`);
      console.log(`  Molecules suggested: ${result.moleculesSuggested}`);
      console.log(`  Proposed atoms (pending approval): ${result.proposedAtoms}`);
      console.log(`\nNext step: Review proposed atoms at http://localhost:3000/atoms/pending`);
      ```
    - Run via: `docker exec pact-app npx ts-node scripts/reconcile-pact-initial.ts`
    - Expected output:
      ```
      Tests analyzed: 847
      Atoms inferred: 247
      Molecules suggested: 18
      Proposed atoms (pending approval): 247
      ```

- [ ] **19.2.3** Verify reconciliation results
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 19.2.2
  - **Details**:
    - Query proposed atoms: `GET /api/atoms?status=proposed&projectId=1`
    - Verify atom structure:
      - `atomId`: "IA-NEW-001", "IA-NEW-002", etc.
      - `status`: "proposed"
      - `source`: "reconciliation_inference"
      - `confidence`: 0.75-0.95
      - `description`: Meaningful behavioral description
      - `validators`: Extracted from test assertions
      - `evidence`: Test file references
    - Verify molecule suggestions: `GET /api/molecules?status=draft&projectId=1`
    - Check reconciliation run: `GET /api/reconciliation/runs/1`

- [ ] **19.2.4** Analyze inference quality
  - **File**: `scripts/analyze-inference-quality.ts`
  - **Priority**: Medium | **Effort**: M
  - **Dependencies**: 19.2.3
  - **Details**:
    - Generate quality report:
      ```typescript
      const atoms = await getProposedAtoms(projectId: 1);

      const report = {
        total: atoms.length,
        byConfidence: {
          high: atoms.filter(a => a.confidence >= 0.85).length,
          medium: atoms.filter(a => a.confidence >= 0.75 && a.confidence < 0.85).length,
          low: atoms.filter(a => a.confidence < 0.75).length,
        },
        byCategory: groupBy(atoms, 'category'),
        samplesForReview: {
          highConfidence: atoms.filter(a => a.confidence >= 0.85).slice(0, 5),
          mediumConfidence: atoms.filter(a => a.confidence >= 0.75 && a.confidence < 0.85).slice(0, 5),
        }
      };
      ```
    - Manual review of samples to validate quality
    - Document any patterns of poor inference for improvement
    - Target: >80% of atoms should be high quality

---

## 19.3 Batch Approval Workflow

### Context

Efficiently review and approve 200+ inferred atoms using batch operations and confidence thresholds.

### Tasks

- [ ] **19.3.1** Create batch approval UI enhancements
  - **File**: `frontend/app/atoms/pending/page.tsx`
  - **Priority**: High | **Effort**: M
  - **Details**:
    - Add confidence threshold filter:
      - "Show high confidence (≥85%)" toggle
      - "Show medium confidence (75-84%)" toggle
    - Add batch selection:
      - "Select all visible" checkbox
      - Selected count indicator
      - "Approve selected" button
    - Add bulk actions dropdown:
      - "Approve all high confidence"
      - "Approve all in category"
      - "Reject duplicates"
    - Add sort options:
      - By confidence (desc)
      - By category
      - By related atom (group by feature)

- [ ] **19.3.2** Create batch approval endpoint
  - **File**: `src/modules/atoms/atoms.controller.ts`
  - **Priority**: High | **Effort**: M
  - **Details**:
    - `POST /api/atoms/batch-approve`
    - Body:
      ```typescript
      {
        atomIds: number[];           // IDs to approve
        edits?: Map<number, {        // Optional edits before approval
          description?: string;
          category?: string;
          validators?: string[];
        }>;
      }
      ```
    - Transaction: All atoms approved atomically or none
    - Assign sequential atomIds (IA-001, IA-002, etc.)
    - Set `status = 'committed'`, `approvedBy = currentUser`, `approvedAt = now()`
    - Return summary:
      ```typescript
      {
        approved: number;
        atomIds: string[];           // New sequential IDs
        errors: Array<{ atomId: number; error: string }>;
      }
      ```

- [ ] **19.3.3** Create batch rejection endpoint
  - **File**: `src/modules/atoms/atoms.controller.ts`
  - **Priority**: Medium | **Effort**: S
  - **Dependencies**: 19.3.2
  - **Details**:
    - `POST /api/atoms/batch-reject`
    - Body:
      ```typescript
      {
        atomIds: number[];
        reason: string;              // Common rejection reason
      }
      ```
    - Set `status = 'abandoned'` for all
    - Store rejection reason
    - Return count of rejected atoms

- [ ] **19.3.4** Execute batch approval process
  - **Priority**: High | **Effort**: L (manual review)
  - **Dependencies**: 19.3.1, 19.3.2
  - **Details**:
    - **Phase 1: Auto-approve high confidence**
      - Filter: `confidence >= 0.85`
      - Expected: ~150-180 atoms
      - Review samples (5-10 random)
      - Bulk approve via UI
    - **Phase 2: Manual review medium confidence**
      - Filter: `0.75 <= confidence < 0.85`
      - Expected: ~40-60 atoms
      - Review each individually
      - Approve or edit descriptions as needed
    - **Phase 3: Reject low quality**
      - Filter: duplicates, unclear, or incorrect inferences
      - Expected: ~10-20 atoms
      - Batch reject with reason
    - Target: Approve 200-230 atoms total

- [ ] **19.3.5** Verify approval results
  - **Priority**: High | **Effort**: S
  - **Dependencies**: 19.3.4
  - **Details**:
    - Query committed atoms: `GET /api/atoms?status=committed&projectId=1`
    - Verify sequential atomIds: IA-001, IA-002, ..., IA-230
    - Verify `approvedBy` and `approvedAt` fields populated
    - Verify no proposed atoms remain (or document why kept)
    - Check Pact Main state:
      ```
      Atoms: 230 committed
      Molecules: 0 (not yet approved)
      Test links: 0 (tests not yet annotated)
      ```

---

## 19.4 Test Annotation Generation

### Context

Generate patches to add `@atom IA-XXX` annotations to test files based on approved atoms.

### Tasks

- [ ] **19.4.1** Create patch generation service
  - **File**: `src/modules/agents/patch-generator.service.ts`
  - **Priority**: High | **Effort**: L
  - **Details**:
    - Service to generate patches for test annotations:
      ```typescript
      async generateTestAnnotations(runId: number): Promise<Patch[]> {
        // Get reconciliation run results
        const run = await this.reconciliationRepo.findOne(runId);
        const proposedLinks = run.proposedTestLinks;  // From inference

        const patches: Patch[] = [];

        for (const link of proposedLinks) {
          const atom = await this.atomsRepo.findOne(link.atomId);
          if (atom.status !== 'committed') continue;

          // Read test file
          const content = await fs.readFile(link.testFile, 'utf-8');
          const lines = content.split('\n');

          // Find test definition line
          const testLine = this.findTestLine(lines, link.testName);

          // Generate annotation insertion
          const indent = this.detectIndent(lines[testLine]);
          const annotation = `${indent}// @atom ${atom.atomId}\n`;

          patches.push({
            file: link.testFile,
            lineNumber: testLine,
            insertion: annotation,
            testName: link.testName,
            atomId: atom.atomId,
          });
        }

        return patches;
      }
      ```

- [ ] **19.4.2** Create patch application utility
  - **File**: `src/modules/agents/patch-applicator.service.ts`
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 19.4.1
  - **Details**:
    - Service to apply patches to files:
      ```typescript
      async applyPatches(patches: Patch[]): Promise<ApplyResult> {
        const results: ApplyResult = {
          applied: [],
          failed: [],
        };

        // Group patches by file
        const patchesByFile = groupBy(patches, 'file');

        for (const [file, filePatches] of Object.entries(patchesByFile)) {
          try {
            let content = await fs.readFile(file, 'utf-8');
            const lines = content.split('\n');

            // Sort patches by line number (descending) to avoid offset issues
            filePatches.sort((a, b) => b.lineNumber - a.lineNumber);

            // Apply each patch
            for (const patch of filePatches) {
              lines.splice(patch.lineNumber, 0, patch.insertion.trimEnd());
            }

            // Write updated content
            await fs.writeFile(file, lines.join('\n'));

            results.applied.push(...filePatches.map(p => p.atomId));
          } catch (error) {
            results.failed.push({
              file,
              error: error.message,
              patches: filePatches,
            });
          }
        }

        return results;
      }
      ```

- [ ] **19.4.3** Create patch generation endpoint
  - **File**: `src/modules/agents/reconciliation.controller.ts`
  - **Priority**: High | **Effort**: S
  - **Dependencies**: 19.4.1
  - **Details**:
    - `POST /api/reconciliation/:runId/generate-patches`
    - Returns:
      ```typescript
      {
        patches: Patch[];
        summary: {
          totalPatches: number;
          fileCount: number;
          byCategory: { [category: string]: number };
        }
      }
      ```

- [ ] **19.4.4** Create patch application endpoint
  - **File**: `src/modules/agents/reconciliation.controller.ts`
  - **Priority**: High | **Effort**: S
  - **Dependencies**: 19.4.2
  - **Details**:
    - `POST /api/reconciliation/:runId/apply-patches`
    - Body: `{ dryRun?: boolean }`
    - If `dryRun: true`: Return preview without applying
    - If `dryRun: false`: Apply patches and return results
    - Return:
      ```typescript
      {
        applied: string[];           // Atom IDs
        failed: Array<{
          file: string;
          error: string;
          patches: Patch[];
        }>;
        summary: {
          filesModified: number;
          annotationsAdded: number;
        }
      }
      ```

- [ ] **19.4.5** Generate and review patches
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 19.4.3
  - **Details**:
    - Generate patches: `POST /api/reconciliation/1/generate-patches`
    - Save to file: `patches-pact-self-hosting.json`
    - Review sample patches manually (5-10 files)
    - Verify:
      - Annotations placed correctly (before test definition)
      - Indentation matches file style
      - Atom IDs are correct
      - No duplicate annotations

- [ ] **19.4.6** Apply patches to test files
  - **Priority**: High | **Effort**: S
  - **Dependencies**: 19.4.4, 19.4.5
  - **Details**:
    - Dry run: `POST /api/reconciliation/1/apply-patches { dryRun: true }`
    - Review preview
    - Apply: `POST /api/reconciliation/1/apply-patches { dryRun: false }`
    - Verify files modified:
      ```bash
      git status
      # Should show 140+ modified test files
      ```
    - Verify annotations:
      ```bash
      grep -r "@atom IA-" src/ test/ | wc -l
      # Should match approved atom count (~230)
      ```

- [ ] **19.4.7** Commit annotated tests
  - **Priority**: High | **Effort**: S
  - **Dependencies**: 19.4.6
  - **Details**:
    - Review git diff for sample files
    - Verify no unintended changes
    - Commit:
      ```bash
      git add src/**/*.spec.ts test/**/*.spec.ts
      git commit -m "chore: Add @atom annotations from Pact reconciliation

      Pact analyzed its own codebase as a brownfield project and inferred
      230 atoms from existing test behavior. This commit adds @atom
      annotations linking tests to approved atoms in Pact Main.

      - Tests analyzed: 847
      - Atoms approved: 230
      - Files annotated: 142

      Pact Main is now the canonical source of truth for Pact's intent graph."
      git push origin feature/pact-self-hosting
      ```

---

## 19.5 CI Self-Hosting Configuration

### Context

Configure CI to run Pact as a service, reconcile against Pact Main, and attest coverage.

### Tasks

- [ ] **19.5.1** Create CI workflow for self-hosting
  - **File**: `.github/workflows/pact-self-hosting.yml`
  - **Priority**: High | **Effort**: M
  - **Details**:
    - Full workflow (see detailed YAML below)
    - Services: postgres, pact
    - Steps:
      1. Checkout code
      2. Setup Node.js
      3. Install dependencies
      4. Build Pact
      5. Start Pact server (background)
      6. Initialize project (create "pact" project in DB)
      7. Run tests with coverage
      8. Run reconciliation with CI attestation
      9. Upload artifacts (report, coverage)
      10. Comment PR with results

- [ ] **19.5.2** Create CI initialization script
  - **File**: `scripts/ci-init-pact.ts`
  - **Priority**: High | **Effort**: S
  - **Dependencies**: 19.1.1
  - **Details**:
    - Idempotent script run in CI to initialize Pact:
      ```typescript
      // Check if "pact" project exists
      const existing = await projectsRepo.findOne({ where: { name: 'pact' } });
      if (existing) {
        console.log('Pact project already exists (ID: ${existing.id})');
        return existing;
      }

      // Create project + policy
      const project = await projectsRepo.save({ name: 'pact', ... });
      await policiesRepo.save({ projectId: project.id, ... });

      console.log('Pact project initialized (ID: ${project.id})');
      return project;
      ```
    - Used by CI to ensure project exists before reconciliation

- [ ] **19.5.3** Update CI example for attestation
  - **File**: `packages/client-sdk/examples/ci/example.ts`
  - **Priority**: High | **Effort**: M
  - **Details**:
    - Add attestation headers:
      ```typescript
      const result = await client.api.submitPreReadContent(content, {
        attestation: {
          type: 'ci',
          provider: ci.provider,
          buildId: ci.buildId,
          buildUrl: ci.buildUrl,
          commitHash: ci.commitHash,
          branch: ci.branch,
        }
      });
      ```
    - Handle attestation response:
      ```typescript
      if (result.attestation?.verified) {
        console.log('✓ CI attestation verified');
        console.log(`  Build: ${result.attestation.buildUrl}`);
        console.log(`  Commit: ${result.attestation.commitHash}`);
      }
      ```

- [ ] **19.5.4** Test CI workflow locally
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 19.5.1, 19.5.2
  - **Details**:
    - Use `act` to test GitHub Actions locally:
      ```bash
      # Install act: https://github.com/nektos/act
      brew install act

      # Test workflow
      act -j pact-validation --env-file .env.ci
      ```
    - Or push to test branch and verify in GitHub Actions
    - Verify:
      - Pact server starts successfully
      - Project initialized
      - Tests run and coverage generated
      - Reconciliation completes
      - Attestation recorded
      - Artifacts uploaded

- [ ] **19.5.5** Configure GitHub secrets
  - **Priority**: High | **Effort**: S (manual)
  - **Details**:
    - Add secrets in GitHub repo settings:
      - `PACT_PROJECT_ID`: `1` (for "pact" project)
      - Optional: `PACT_AUTH_TOKEN` (if auth enabled)
    - Document in `docs/ci-setup.md`

- [ ] **19.5.6** Create PR with annotated tests
  - **Priority**: High | **Effort**: S
  - **Dependencies**: 19.4.7, 19.5.4
  - **Details**:
    - Push branch: `feature/pact-self-hosting`
    - Create PR against `develop`
    - Verify CI runs automatically
    - Review CI output in PR checks
    - Verify PR comment with reconciliation results

---

## 19.6 MCP Server Finalization

### Context

Finalize MCP server registration and configuration for Claude Code integration.

### Tasks

- [ ] **19.6.1** Build MCP server
  - **Priority**: High | **Effort**: S
  - **Details**:
    - Build Pact: `npm run build`
    - Verify MCP server compiled: `dist/mcp/pact-mcp-server.js` exists
    - Test MCP server starts:
      ```bash
      node dist/mcp/pact-mcp-server.js
      # Should start in stdio mode
      ```

- [ ] **19.6.2** Register MCP server in Claude Code config
  - **File**: `~/.claude/mcp-servers.json` or project-specific config
  - **Priority**: High | **Effort**: S
  - **Details**:
    - Create or update MCP servers config:
      ```json
      {
        "pact": {
          "command": "node",
          "args": ["/Users/jasontalley/code/pact/dist/mcp/pact-mcp-server.js"],
          "env": {
            "PACT_API_URL": "http://localhost:3000"
          }
        }
      }
      ```
    - Restart Claude Code to load new config
    - Verify in Claude Code: "Show available MCP servers"

- [ ] **19.6.3** Test MCP tools from Claude Code
  - **Priority**: High | **Effort**: M
  - **Details**:
    - Test each tool via Claude Code:
      ```
      User: "Use Pact to list committed atoms"
      Claude Code: Calls list_atoms({ status: 'committed' })

      User: "Show me atoms that need implementation"
      Claude Code: Calls get_implementable_atoms({ limit: 10 })

      User: "Search for authentication atoms"
      Claude Code: Calls search_atoms({ query: 'authentication' })

      User: "Show coupling status"
      Claude Code: Calls get_coupling_status()
      ```
    - Verify responses are correct
    - Verify Claude Code can interpret results

- [ ] **19.6.4** Document MCP integration
  - **File**: `docs/mcp-integration.md`
  - **Priority**: Medium | **Effort**: M
  - **Details**:
    - Document MCP server setup
    - List all 10 MCP tools with examples
    - Document environment variables
    - Troubleshooting guide
    - Example workflows with Claude Code

---

## 19.7 End-to-End Validation

### Context

Validate the complete self-hosting workflow from Claude Code query to CI attestation.

### Tasks

- [ ] **19.7.1** Test: Claude Code queries Pact Main
  - **Priority**: High | **Effort**: M
  - **Details**:
    - Via Claude Code:
      ```
      User: "Show me all committed atoms in Pact"
      Expected: Returns 230 atoms from Pact Main

      User: "What's the coverage status?"
      Expected: Shows 95%+ test-atom coupling

      User: "Which atoms need more test coverage?"
      Expected: Returns atoms with < 80% coverage (if any)
      ```
    - Verify responses reference Pact Main (not filesystem)

- [ ] **19.7.2** Test: Claude Code suggests new atom
  - **Priority**: High | **Effort**: M
  - **Details**:
    - Scenario: Implement a new feature that needs rate limiting
    - Via Claude Code:
      ```
      User: "I'm implementing password reset. Suggest an atom for rate limiting."
      Claude Code: Calls suggest_atom({
        description: "Password reset must rate-limit to 3 attempts/hour/IP",
        category: "security",
        rationale: "Prevent brute-force attacks"
      })
      Expected: Returns IA-NEW-001 (proposed)
      ```
    - Verify proposed atom in Pact UI: `http://localhost:3000/atoms/pending`

- [ ] **19.7.3** Test: HITL approves suggested atom
  - **Priority**: High | **Effort**: S
  - **Dependencies**: 19.7.2
  - **Details**:
    - Open Pact UI pending atoms page
    - Review IA-NEW-001
    - Approve
    - Verify promoted to committed: IA-231
    - Query via MCP: Should now appear in committed atoms

- [ ] **19.7.4** Test: Implement and annotate with approved atom
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 19.7.3
  - **Details**:
    - Via Claude Code: "Implement IA-231 with tests"
    - Claude Code writes:
      ```typescript
      // test/auth/rate-limit.spec.ts
      // @atom IA-231
      it('rate limits password reset attempts', () => { ... });

      // src/auth/rate-limiter.service.ts
      class RateLimiterService { ... }
      ```
    - Local check: `pact check`
    - Expected: Shows IA-231 linked to test (plausible)

- [ ] **19.7.5** Test: CI validates and attests
  - **Priority**: High | **Effort**: M
  - **Dependencies**: 19.7.4
  - **Details**:
    - Commit and push:
      ```bash
      git add test/auth/rate-limit.spec.ts src/auth/rate-limiter.service.ts
      git commit -m "feat: Add rate limiting (IA-231)"
      git push
      ```
    - Wait for CI
    - Verify CI:
      1. Runs tests
      2. Reconciles with Pact Main
      3. Detects new test linked to IA-231
      4. Updates coverage (CI-attested)
      5. Posts results to PR
    - Query Pact Main: IA-231 coverage now 85% (canonical)

- [ ] **19.7.6** Test: Full brownfield integration
  - **Priority**: Medium | **Effort**: L
  - **Details**:
    - Create a new test project (sample app)
    - Run Pact reconciliation on it (brownfield)
    - Verify atom inference works on different codebase
    - Document any issues or improvements needed
    - This validates Pact's general-purpose capabilities

---

## 19.8 Proto-Pact Deprecation

### Context

Archive filesystem-based atoms and establish Pact Main as the single source of truth.

### Tasks

- [ ] **19.8.1** Archive proto-Pact artifacts
  - **Priority**: Medium | **Effort**: S
  - **Details**:
    - Move filesystem artifacts to bootstrap:
      ```bash
      mkdir -p bootstrap/proto-pact
      git mv atoms/ bootstrap/proto-pact/atoms/
      git mv molecules/ bootstrap/proto-pact/molecules/
      git mv global/ bootstrap/proto-pact/global/
      ```
    - Create deprecation notice:
      ```markdown
      # bootstrap/proto-pact/README.md

      # Proto-Pact Artifacts (DEPRECATED)

      These files were created before Pact existed to bootstrap the system.

      **Status**: DEPRECATED as of [date]

      **Reason**: Pact Main (database) is now the canonical source of truth.
      Pact manages its own atoms via reconciliation inference and HITL approval.

      **What replaced this**:
      - Atoms: Pact Main database (queried via API/MCP)
      - Test links: @atom annotations in test files
      - Molecules: Pact Main database
      - Reconciliation: Automated brownfield inference

      **Preserved for**: Historical reference only.
      ```

- [ ] **19.8.2** Update documentation references
  - **Priority**: Medium | **Effort**: M
  - **Details**:
    - Update all docs that reference `/atoms/*.json`:
      - Remove import instructions
      - Update to reference Pact Main queries
      - Update diagrams showing data flow
    - Files to update:
      - `README.md`
      - `CLAUDE.md`
      - `docs/architecture/*`
      - Any tutorial/getting-started docs

- [ ] **19.8.3** Remove filesystem-based queries
  - **Priority**: Low | **Effort**: M
  - **Details**:
    - Search codebase for any remaining filesystem reads of atoms:
      ```bash
      grep -r "atoms/.*\.json" src/
      grep -r "fs.readFile.*atoms" src/
      ```
    - Replace with database queries
    - Remove any bootstrap scaffolding that reads filesystem atoms
    - Update tests to use database fixtures

- [ ] **19.8.4** Commit deprecation
  - **Priority**: Medium | **Effort**: S
  - **Dependencies**: 19.8.1, 19.8.2
  - **Details**:
    - Commit:
      ```bash
      git add bootstrap/proto-pact/ atoms/ molecules/ global/ docs/
      git commit -m "chore: Deprecate proto-Pact filesystem artifacts

      Pact Main (database) is now the canonical source of truth.
      Proto-Pact artifacts (/atoms, /molecules, /global) have been
      archived to bootstrap/proto-pact/ for historical reference.

      Pact now manages itself through:
      - Reconciliation inference (brownfield analysis)
      - HITL approval workflow
      - CI attestation
      - MCP integration with Claude Code

      All queries now go through Pact Main API."
      ```

---

## 19.9 Documentation & Knowledge Transfer

### Context

Comprehensive documentation of Pact's self-hosting architecture and workflows.

### Tasks

- [ ] **19.9.1** Create self-hosting guide
  - **File**: `docs/self-hosting-guide.md`
  - **Priority**: High | **Effort**: L
  - **Details**:
    - Complete guide covering:
      1. Architecture overview (Pact Main as canonical)
      2. Initial setup (project initialization)
      3. Brownfield reconciliation workflow
      4. HITL approval process
      5. Test annotation
      6. CI configuration
      7. MCP integration
      8. Troubleshooting
    - Include diagrams and examples
    - Step-by-step instructions

- [ ] **19.9.2** Create brownfield integration guide
  - **File**: `docs/brownfield-integration.md`
  - **Priority**: High | **Effort**: M
  - **Details**:
    - Guide for using Pact on any brownfield codebase
    - Based on lessons from Pact self-hosting
    - Sections:
      1. Prerequisites (test coverage, file structure)
      2. Initial reconciliation
      3. Reviewing inferred atoms
      4. Approval strategies
      5. Test annotation
      6. Ongoing validation
    - Include success metrics and best practices

- [ ] **19.9.3** Update main README
  - **File**: `README.md`
  - **Priority**: High | **Effort**: M
  - **Details**:
    - Update "Current Status" section:
      - Pact is now self-hosting ✓
      - 230+ atoms in Pact Main
      - 95%+ test-atom coupling
      - CI-attested coverage
    - Update architecture section:
      - Pact Main as canonical truth
      - Remove references to filesystem atoms
    - Add "Pact Managing Pact" section:
      - How Pact manages itself
      - Link to self-hosting guide

- [ ] **19.9.4** Update CLAUDE.md
  - **File**: `CLAUDE.md`
  - **Priority**: Medium | **Effort**: M
  - **Details**:
    - Update "Intent Artifact Management" section:
      - Pact Main is canonical (not filesystem)
      - Remove proto-Pact instructions
      - Add reconciliation workflow
    - Update "Bootstrap Scaffolding" section:
      - Mark proto-Pact as deprecated
      - Update bootstrap completion status
    - Add "Self-Hosting" section:
      - MCP integration
      - Claude Code workflows
      - Agent-suggested atoms

- [ ] **19.9.5** Create video walkthrough (optional)
  - **Priority**: Low | **Effort**: L
  - **Details**:
    - Screen recording demonstrating:
      1. Pact analyzing its own codebase
      2. Reviewing inferred atoms
      3. Approving atoms
      4. Annotating tests
      5. CI validation
      6. Claude Code querying Pact Main
    - Upload to docs or README

---

## Phase 19 Completion Criteria

| Criterion | Validation |
|-----------|------------|
| **Project Initialized** | "pact" project exists in database with ID 1 |
| **Brownfield Success** | 200+ atoms inferred from existing tests |
| **HITL Approval** | 200+ atoms approved and committed to Pact Main |
| **Tests Annotated** | 95%+ tests have @atom annotations |
| **CI Self-Hosting** | CI runs Pact-in-CI and attests coverage |
| **MCP Integration** | Claude Code can query Pact Main via MCP |
| **Agent Suggestions** | Claude Code can suggest new atoms |
| **Coverage Attested** | Pact Main shows CI-attested coverage for all atoms |
| **Proto-Pact Deprecated** | /atoms, /molecules, /global archived |
| **Documentation Complete** | Self-hosting and brownfield guides published |
| **Zero Manual Import** | No filesystem atom import scripts used |
| **Pact Main Canonical** | All queries go to database, not filesystem |

---

## File Inventory

### New Files (12)

| File | Task | Purpose |
|------|------|---------|
| `scripts/init-pact-self-hosting.ts` | 19.1.1 | Initialize "pact" project |
| `scripts/reconcile-pact-initial.ts` | 19.2.2 | Run initial brownfield reconciliation |
| `scripts/analyze-inference-quality.ts` | 19.2.4 | Analyze inference results |
| `scripts/ci-init-pact.ts` | 19.5.2 | CI project initialization |
| `src/modules/agents/patch-generator.service.ts` | 19.4.1 | Generate test annotation patches |
| `src/modules/agents/patch-applicator.service.ts` | 19.4.2 | Apply patches to files |
| `.github/workflows/pact-self-hosting.yml` | 19.5.1 | CI self-hosting workflow |
| `docs/self-hosting-guide.md` | 19.9.1 | Complete self-hosting guide |
| `docs/brownfield-integration.md` | 19.9.2 | Brownfield integration guide |
| `docs/mcp-integration.md` | 19.6.4 | MCP integration documentation |
| `docs/ci-setup.md` | 19.5.5 | CI configuration guide |
| `bootstrap/proto-pact/README.md` | 19.8.1 | Proto-Pact deprecation notice |

### Modified Files (8)

| File | Task | Changes |
|------|------|---------|
| `src/modules/agents/reconciliation.controller.ts` | 19.4.3, 19.4.4 | Add patch generation/application endpoints |
| `src/modules/atoms/atoms.controller.ts` | 19.3.2, 19.3.3 | Add batch approve/reject endpoints |
| `frontend/app/atoms/pending/page.tsx` | 19.3.1 | Add batch approval UI |
| `packages/client-sdk/examples/ci/example.ts` | 19.5.3 | Add CI attestation support |
| `README.md` | 19.9.3 | Update with self-hosting status |
| `CLAUDE.md` | 19.9.4 | Update intent management section |
| `.env.example` | 19.1.3 | Add PACT_PROJECT_ID |
| `~/.claude/mcp-servers.json` | 19.6.2 | Register Pact MCP server |

### Archived Files

| Original Location | New Location | Reason |
|-------------------|--------------|--------|
| `/atoms/*.json` | `/bootstrap/proto-pact/atoms/` | Proto-Pact artifacts (deprecated) |
| `/molecules/*.md` | `/bootstrap/proto-pact/molecules/` | Proto-Pact artifacts (deprecated) |
| `/global/*.md` | `/bootstrap/proto-pact/global/` | Proto-Pact artifacts (deprecated) |

---

## Dependencies and Ordering

### Week 1: Foundation & Reconciliation
- **Day 1**: 19.1 (Project Init) + 19.2.1 (Prepare codebase)
- **Day 2**: 19.2.2-19.2.4 (Initial reconciliation + analysis)
- **Day 3**: 19.3 (Batch approval workflow)
- **Day 4**: 19.3.4-19.3.5 (Execute approvals + verify)

### Week 2: Annotation & CI
- **Day 5**: 19.4.1-19.4.4 (Patch generation + endpoints)
- **Day 6**: 19.4.5-19.4.7 (Generate, apply, commit patches)
- **Day 7**: 19.5.1-19.5.3 (CI workflow configuration)
- **Day 8**: 19.5.4-19.5.6 (Test CI + create PR)

### Week 3: Integration & Documentation
- **Day 9**: 19.6 (MCP finalization) + 19.7.1-19.7.3 (Validation)
- **Day 10**: 19.7.4-19.7.6 (E2E validation)
- **Day 11**: 19.8 (Proto-Pact deprecation)
- **Day 12**: 19.9 (Documentation)

**Total estimated time: 12-15 days**

---

## Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| **Atoms Inferred** | 200-300 | Count proposed atoms after reconciliation |
| **Approval Rate** | >85% | approved / (approved + rejected) |
| **Test Coverage** | >95% | tests with @atom / total tests |
| **Inference Quality** | >80% high confidence | atoms with confidence >= 0.85 |
| **CI Success** | Green build | GitHub Actions passes |
| **MCP Availability** | 10 tools | Claude Code lists all tools |
| **E2E Workflow** | 1 full cycle | Claude Code → suggest → approve → CI |
| **Zero Filesystem** | 0 filesystem atom reads | grep search finds none |
| **Pact Main Queries** | 100% | All atom queries go to database |

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Inference quality too low | Medium | High | Review samples early; tune prompts; lower confidence threshold |
| Too many atoms to review | Medium | Medium | Batch approval UI; confidence filters; auto-approve high confidence |
| Patch generation errors | Low | Medium | Dry run first; manual review; version control safety net |
| CI configuration issues | Medium | Medium | Test locally with `act`; start with simple workflow |
| MCP server not discoverable | Low | Medium | Document setup clearly; test registration |
| Proto-Pact dependencies remain | Low | Low | Comprehensive grep search; systematic removal |

---

*Phase 19 completes Pact's journey to self-hosting by treating its own codebase as a brownfield project, validating Pact's core value proposition: automated intent extraction from existing tests.*
