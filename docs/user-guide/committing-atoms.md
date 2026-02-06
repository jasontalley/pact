# Committing Atoms

This guide explains how to commit Intent Atoms in Pact, making them immutable and binding.

## What is Commitment?

**Commitment** is the defining phase transition in Pact where:

- **Ambiguity collapses**: The interpretation of intent is frozen
- **Immutability begins**: Committed atoms cannot be edited or deleted
- **Contracts are formed**: The atom becomes a binding specification

Think of commitment like signing a contract. Once signed, the terms are fixed. If you need changes, you create a new contract (supersession).

## The Commitment Boundary

The Commitment Boundary enforces 9 global invariants:

| Invariant | Name | What It Checks |
|-----------|------|----------------|
| INV-001 | Explicit Commitment | Human must explicitly approve |
| INV-002 | Behavioral Testability | Atom must be observable and falsifiable |
| INV-003 | No Ambiguity | No unresolved ambiguity allowed |
| INV-004 | Immutability | Committed intent cannot be edited |
| INV-005 | Traceability | All artifacts must reference their source |
| INV-006 | Human Authorization | Only humans can commit (not agents) |
| INV-007 | Evidence Immutability | Evidence cannot be altered |
| INV-008 | Limited Rejection | Rejection only for invariant violations |
| INV-009 | Explicit Resolution | Ambiguity must be resolved explicitly |

## Prerequisites for Commitment

Before an atom can be committed:

1. **Quality Score >= 80**: Atoms must pass quality validation
2. **Draft Status**: Only draft atoms can be committed
3. **Human Authorization**: You must be identified as the committer
4. **Invariant Checks**: All enabled invariants must pass

## Committing via API

### Preview Commitment (Dry-Run)

Always preview before committing to see what issues may arise:

```bash
curl -X POST http://localhost:3000/commitments/preview \
  -H "Content-Type: application/json" \
  -d '{
    "atomIds": ["123e4567-e89b-12d3-a456-426614174000"],
    "committedBy": "jane.doe@company.com"
  }'
```

**Response**:

```json
{
  "canCommit": true,
  "hasBlockingIssues": false,
  "hasWarnings": true,
  "atomCount": 1,
  "atoms": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "atomId": "IA-001",
      "description": "User authentication must complete within 2 seconds",
      "category": "performance",
      "qualityScore": 85
    }
  ],
  "invariantChecks": [
    {
      "invariantId": "INV-001",
      "name": "Explicit Commitment Required",
      "passed": true,
      "severity": "error"
    },
    {
      "invariantId": "INV-003",
      "name": "No Ambiguity in Commitment Artifacts",
      "passed": false,
      "severity": "warning",
      "message": "Atom may contain ambiguous language: 'within 2 seconds' - consider specifying 99th percentile",
      "suggestions": ["Specify '99th percentile response time' for clearer measurement"]
    }
  ],
  "blockingIssues": [],
  "warnings": ["INV-003: Atom may contain ambiguous language"]
}
```

### Create Commitment

Once preview looks good, create the commitment:

```bash
curl -X POST http://localhost:3000/commitments \
  -H "Content-Type: application/json" \
  -d '{
    "atomIds": ["123e4567-e89b-12d3-a456-426614174000"],
    "committedBy": "jane.doe@company.com"
  }'
```

**Response**:

```json
{
  "id": "456e7890-e12d-34a5-b678-901234567890",
  "commitmentId": "COM-001",
  "committedBy": "jane.doe@company.com",
  "committedAt": "2026-01-27T10:00:00Z",
  "status": "active",
  "canonicalJson": [
    {
      "atomId": "IA-001",
      "description": "User authentication must complete within 2 seconds",
      "category": "performance",
      "qualityScore": 85,
      "snapshotAt": "2026-01-27T10:00:00Z"
    }
  ],
  "invariantChecks": [
    { "invariantId": "INV-001", "passed": true },
    { "invariantId": "INV-002", "passed": true }
  ],
  "atoms": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "atomId": "IA-001",
      "description": "User authentication must complete within 2 seconds"
    }
  ]
}
```

### Committing Multiple Atoms

You can commit multiple atoms in a single commitment:

```bash
curl -X POST http://localhost:3000/commitments \
  -H "Content-Type: application/json" \
  -d '{
    "atomIds": [
      "123e4567-e89b-12d3-a456-426614174000",
      "234e5678-f90a-12d3-b456-526715284111",
      "345e6789-a01b-23d4-c567-637826395222"
    ],
    "committedBy": "jane.doe@company.com",
    "projectId": "project-uuid-here"
  }'
```

### Handling Invariant Warnings

If warnings exist, you can provide an override justification:

```bash
curl -X POST http://localhost:3000/commitments \
  -H "Content-Type: application/json" \
  -d '{
    "atomIds": ["123e4567-e89b-12d3-a456-426614174000"],
    "committedBy": "jane.doe@company.com",
    "overrideJustification": "Approved by product owner for MVP release - will clarify timing in sprint 3"
  }'
```

**Note**: Override justification does **not** work for blocking issues. You must resolve those first.

## Committing via UI

### Step 1: Select Atoms

From the Atoms list or Canvas view, select the atoms you want to commit.

### Step 2: Open Commitment Review

Click the "Commit" button to open the Commitment Review Dialog.

### Step 3: Review Invariant Checks

The dialog shows:

- **Atoms to Commit**: Summary of each atom with quality scores
- **Invariant Check Results**: Pass/fail status for each invariant
- **Blocking Issues**: Must be resolved before committing (shown in red)
- **Warnings**: Can be overridden with justification (shown in yellow)

### Step 4: Acknowledge and Commit

1. Check the acknowledgment box: "I understand this action is permanent"
2. If warnings exist, optionally provide override justification
3. Click "Commit Atoms"

## What Happens After Commitment

1. **Atoms become immutable**: Status changes to 'committed'
2. **Canonical snapshot created**: Atom state is frozen in JSON
3. **Commitment artifact created**: Permanent record with ID (e.g., COM-001)
4. **Timestamps recorded**: `committedAt` set for atoms and commitment

## Common Errors

### "Atom not found"

```json
{
  "statusCode": 404,
  "message": "Atom with ID abc123 not found"
}
```

**Solution**: Verify the atom UUID is correct.

### "Atom is not in draft status"

```json
{
  "statusCode": 400,
  "message": "Cannot commit atom IA-001: status is 'committed'"
}
```

**Solution**: Already committed atoms cannot be re-committed. Use supersession instead.

### "Blocking invariant violations"

```json
{
  "statusCode": 400,
  "message": "Cannot commit: blocking invariant violations",
  "violations": [
    {
      "invariantId": "INV-002",
      "message": "Atom IA-003 is not behaviorally testable"
    }
  ]
}
```

**Solution**: Fix the atom to address the invariant violation, then try again.

### "Quality score below threshold"

```json
{
  "statusCode": 400,
  "message": "Atom IA-005 has quality score 65, minimum required is 80"
}
```

**Solution**: Refine the atom to improve quality score to 80+.

## Best Practices

### 1. Always Preview First

Use the preview endpoint to catch issues before committing.

### 2. Commit Related Atoms Together

Group atoms that form a cohesive feature or capability.

### 3. Document Override Justifications

If you override warnings, explain why clearly for audit purposes.

### 4. Review Quality Scores

Ensure all atoms have quality scores >= 80 before attempting commitment.

### 5. Use Meaningful Identifiers

The `committedBy` field creates an audit trail - use identifiable values.

## Viewing Commitments

### List All Commitments

```bash
curl http://localhost:3000/commitments
```

### Get Commitment Details

```bash
curl http://localhost:3000/commitments/456e7890-e12d-34a5-b678-901234567890
```

### Get Atoms in a Commitment

```bash
curl http://localhost:3000/commitments/456e7890-e12d-34a5-b678-901234567890/atoms
```

## Next Steps

- [Configuring Invariants](./configuring-invariants.md) - Customize invariant behavior
- [Supersession](./supersession.md) - How to "change" committed atoms
- [Creating Validators](./creating-validators.md) - Add tests to prove atom satisfaction
