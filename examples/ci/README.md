# Pact CI Policy Integration (Phase 18)

This directory contains examples for integrating Pact's CI policy checks into your CI/CD pipeline.

## Overview

Phase 18 introduces **Human-in-the-Loop (HITL) approval** for AI-suggested atoms. The CI policy enforcement ensures that proposed atoms are reviewed and approved before code is deployed to production.

## How It Works

1. **Reconciliation Agent** or **Development Agent** suggests new atoms during analysis
2. Atoms are created with `status: 'proposed'`
3. **CI Pipeline** checks if there are proposed atoms awaiting approval
4. If policy is enabled and proposed atoms exist, **CI is blocked**
5. **Human reviewer** approves or rejects atoms via `/atoms/pending` dashboard
6. Once all atoms are reviewed, **CI pipeline proceeds**

## Files

- **check-proposed-atoms.sh** - Shell script for checking CI policy
- **github-actions-example.yml** - GitHub Actions workflow example
- **README.md** - This file

## Quick Start

### 1. Configure Environment Variables

Set these in your CI environment:

```bash
PACT_API_URL=https://pact.yourcompany.com
PACT_PROJECT_ID=your-project-uuid
PACT_BLOCK_ON_PROPOSED_ATOMS=true
```

### 2. Add to Your CI Pipeline

#### GitHub Actions

Copy `github-actions-example.yml` to `.github/workflows/pact-ci-check.yml`

#### GitLab CI

```yaml
pact-policy-check:
  stage: test
  script:
    - curl -O https://raw.githubusercontent.com/your-org/pact/main/examples/ci/check-proposed-atoms.sh
    - chmod +x check-proposed-atoms.sh
    - ./check-proposed-atoms.sh $PACT_PROJECT_ID
  only:
    - main
    - develop
```

#### Jenkins

```groovy
stage('Pact Policy Check') {
    steps {
        sh '''
            curl -O https://raw.githubusercontent.com/your-org/pact/main/examples/ci/check-proposed-atoms.sh
            chmod +x check-proposed-atoms.sh
            ./check-proposed-atoms.sh ${PACT_PROJECT_ID}
        '''
    }
}
```

#### Direct Script Usage

```bash
# Check policy for a project
./check-proposed-atoms.sh your-project-uuid

# With custom API URL
PACT_API_URL=https://pact.yourcompany.com \
  ./check-proposed-atoms.sh your-project-uuid

# Disable blocking (dry-run mode)
PACT_BLOCK_ON_PROPOSED_ATOMS=false \
  ./check-proposed-atoms.sh your-project-uuid
```

## API Endpoints

### Check CI Policy

```bash
GET /agents/reconciliation/ci-policy/check?projectId=<uuid>
```

**Response:**

```json
{
  "passed": false,
  "blocked": true,
  "reason": "CI blocked: 3 proposed atoms require human approval. Review at: http://localhost:3000/atoms/pending",
  "proposedAtomsCount": 3,
  "reviewUrl": "http://localhost:3000/atoms/pending"
}
```

### Get Policy Status

```bash
GET /agents/reconciliation/ci-policy/status?projectId=<uuid>
```

**Response:**

```json
{
  "ciBlockOnProposedAtoms": true,
  "currentProposedCount": 3,
  "wouldBlock": true
}
```

## Policy Configuration

Enable/disable CI blocking via the reconciliation policy:

```sql
-- Enable CI blocking for a project
UPDATE reconciliation_policies
SET "ciBlockOnProposedAtoms" = true
WHERE "projectId" = 'your-project-uuid';

-- Disable CI blocking
UPDATE reconciliation_policies
SET "ciBlockOnProposedAtoms" = false
WHERE "projectId" = 'your-project-uuid';
```

Or via the Pact API (if available):

```bash
PATCH /reconciliation-policies/:projectId
{
  "ciBlockOnProposedAtoms": true
}
```

## Exit Codes

The `check-proposed-atoms.sh` script returns:

- **0**: CI policy passed (no blocking)
- **1**: CI policy failed (proposed atoms require approval)
- **2**: Error occurred during check

## Workflow Example

### Scenario: Agent suggests atom during reconciliation

1. **Developer** runs reconciliation: `pact reconcile`
2. **Agent** finds orphan test, infers atom with 85% confidence
3. **Atom** created with `status: 'proposed'`
4. **CI Pipeline** triggered on push
5. **CI Check** detects proposed atom, **blocks deployment**
6. **Notification** sent to team: "3 proposed atoms need review"
7. **Reviewer** navigates to `/atoms/pending`
8. **Reviewer** approves atom (or edits description first)
9. **Atom** status changes to `'committed'`
10. **CI Pipeline** re-run, check passes, **deployment proceeds**

## Best Practices

1. **Enable blocking on main/production branches only**

   ```yaml
   if: github.ref == 'refs/heads/main'
   ```

2. **Send notifications when CI is blocked**

   ```yaml
   - name: Notify Slack
     if: failure()
     uses: slackapi/slack-github-action@v1
     with:
       payload: |
         {
           "text": "Pact CI blocked: Proposed atoms require approval at ${{ env.REVIEW_URL }}"
         }
   ```

3. **Show pending count in CI logs**

   The script automatically displays:
   - Number of proposed atoms
   - Review URL
   - Action steps

4. **Test in dry-run mode first**

   ```bash
   PACT_BLOCK_ON_PROPOSED_ATOMS=false ./check-proposed-atoms.sh <project-id>
   ```

## Troubleshooting

### CI check always passes

- Verify `PACT_BLOCK_ON_PROPOSED_ATOMS=true`
- Check policy is enabled in database: `SELECT * FROM reconciliation_policies WHERE "projectId" = '<uuid>'`
- Ensure `ciBlockOnProposedAtoms` is `true`

### CI check fails with connection error

- Verify `PACT_API_URL` is accessible from CI environment
- Check firewall rules
- Ensure Pact API is running

### Proposed atoms not appearing

- Verify `projectId` is passed to reconciliation
- Check atom inference is enabled: `reconciliationInfersAtoms = true`
- Check minimum confidence threshold: `minConfidenceForSuggestion`

## Further Reading

- [Phase 18 Implementation Summary](../../docs/phase-18-implementation-summary.md)
- [Phase 18 Final Status](../../docs/phase-18-final-status.md)
- [Pact HITL Dashboard](http://localhost:3000/atoms/pending)
