# ProdOS Canonical Taxonomy

**Version:** 0.1  
**Status:** Draft  
**Scope:** Meta-system (applies across client projects)  
**Non-Goals:** Domain modeling, UI design, technology selection

---

## 0. Purpose

ProdOS is a meta-system for managing the transition of **human intent** into **deterministic, auditable realization** under conditions of uncertainty.

This taxonomy defines the minimal, load-bearing concepts required to support that transition.

---

## 1. Foundational Principle

ProdOS is designed to:

- allow ambiguity where it is valuable,
- collapse ambiguity deliberately,
- enforce invariants at explicit boundaries,
- and preserve evidence of realization.

Everything in this taxonomy exists to serve that purpose.

---

## 2. Core Ontological Categories

ProdOS recognizes exactly **five** first-class ontological categories:

1. **Intent**
2. **Boundary**
3. **Commitment**
4. **Realization**
5. **Evidence**

No additional category may be introduced at the ProdOS level.

---

## 3. Intent

### 3.1 Definition

**Intent** represents a desired system outcome expressed independently of implementation.

Intent may be incomplete, ambiguous, evolving, or internally inconsistent.

Intent is never enforceable.

---

### 3.2 Intent Unit

**Definition:**  
An **Intent Unit** is a durable container for related intent.

**Properties:**

- Long-lived
- Non-linear
- Evolves over time
- Not ordered
- Not executable

**Rules:**

- Intent Units may contain multiple Intent Atoms
- Intent Units may exist without any commitment
- Intent Units may never be rejected by the system

---

### 3.3 Intent Atom (Irreducible Primitive)

**Definition:**  
An **Intent Atom** is the smallest unit of intent that is:

- behaviorally precise
- test-derivable
- implementation-agnostic

**Properties:**

- Describes what must be true
- Does not describe how it is achieved
- Observable
- Falsifiable

**Rules:**

- Authored by humans
- Freely revisable until commitment
- The last human-authored truth before mechanization

---

## 4. Boundary

### 4.1 Definition

A **Boundary** is an explicit phase transition where the rules of the system change.

Boundaries are:

- explicit
- irreversible
- auditable

---

### 4.2 Commitment Boundary

**Definition:**  
The **Commitment Boundary** is the moment where intent becomes enforceable.

**Properties:**

- Ambiguity collapses
- Interpretation freezes
- Determinism begins

**Rules:**

- The system may reject intent only at this boundary
- Rejection is permitted only for global invariant violations
- Passing the boundary is an explicit human action

---

## 5. Commitment

### 5.1 Definition

A **Commitment** is an explicit declaration that a set of Intent Atoms is binding.

Commitment is obligation, not documentation.

---

### 5.2 Commitment Artifact

**Definition:**  
A **Commitment Artifact** is the canonical representation of committed intent.

**Properties:**

- Immutable once committed
- Fully constrained
- Globally referenceable
- Audit-safe

**Rules:**

- All downstream artifacts must reference a Commitment Artifact
- Commitment Artifacts may not contain ambiguity
- Commitment defines the scope of realization

---

## 6. Global Invariants

**Definition:**  
Global Invariants are system-level truths that must hold for any commitment to be valid.

They protect semantic coherence, traceability, auditability, and determinism.

Invariant enforcement occurs only at the Commitment Boundary.

---

## 7. Realization

### 7.1 Definition

**Realization** is the act of making committed intent true in the world.

Realization may not reinterpret intent.

---

### 7.2 Realization Artifact

**Definition:**  
A **Realization Artifact** is any artifact created to satisfy committed intent.

**Properties:**

- Deterministic
- Constrained
- Replaceable
- Fallible

Failures in realization are not rejections; they produce evidence.

---

## 8. Evidence

### 8.1 Definition

**Evidence** is proof that realization either satisfies or fails to satisfy committed intent.

Evidence is first-class.

---

### 8.2 Evidence Artifact

**Definition:**  
An **Evidence Artifact** is a structured record of observed behavior.

**Properties:**

- Machine-generated
- Immutable
- Time-bound
- Comparable

**Rules:**

- Evidence may contradict expectations
- Evidence may never be suppressed
- Evidence may never be rewritten

---

## 9. Actors

### 9.1 Human

- Originates intent
- Sole authority for commitment
- Final arbiter of acceptance

### 9.2 Agent

- Proposes and executes
- Never commits intent
- Bound by phase semantics

---

## 10. Phase Semantics (UX-Relevant)

| Phase | System Truth |
| ------------ | ------------ |
| Exploration | Intent is ambiguous, unenforceable |
| Articulation | Intent is shaped, still non-binding |
| Commitment | Invariants enforced, intent frozen |
| Observation | Realization and evidence accumulation |

Phase transitions must always be explicit.

---

## 11. Explicit Exclusions

ProdOS does not define:

- domain entities
- business roles
- workflow states
- UI surfaces
- file formats
- technology choices

These belong to client-specific instantiations.

---

## 12. Canonical Summary

- Intent is free
- Commitment is deliberate
- Boundaries are explicit
- Realization is obligated
- Evidence is undeniable

If a concept cannot be placed cleanly into one of these categories, it does not belong in ProdOS.
