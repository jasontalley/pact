# ProdOS Global Invariants

**Version:** 1.0  
**Applies At:** Commitment Boundary only  
**Enforcement:** Blocking

---

## INV-001: Explicit Commitment Required

No intent may become enforceable without an explicit human commitment action.

---

## INV-002: Intent Atoms Must Be Behaviorally Testable

Every committed Intent Atom must describe behavior that is observable and falsifiable.

---

## INV-003: No Ambiguity in Commitment Artifacts

Commitment Artifacts must not contain unresolved ambiguity or implementation directives.

---

## INV-004: Commitment Is Immutable

Committed intent may not be edited. It may only be superseded by a new commitment.

---

## INV-005: Traceability Is Mandatory

All Realization and Evidence Artifacts must reference the Commitment Artifact they satisfy.

---

## INV-006: Agents May Not Commit Intent

Only humans may authorize commitment across the Commitment Boundary.

---

## INV-007: Evidence Is First-Class and Immutable

Evidence Artifacts may not be altered, suppressed, or discarded.

---

## INV-008: Rejection Is Limited to Invariants

The system may reject intent only due to violations of declared global invariants.

---

## INV-009: Post-Commitment Ambiguity Must Be Resolved Explicitly

Ambiguity discovered after commitment may never be resolved in place. It must result in either:

- A superseding commitment (new Commitment Artifact), or
- An explicit, logged Clarification Artifact that answers a specific question without mutating original intent.

Silent reinterpretation by agents is forbidden.
