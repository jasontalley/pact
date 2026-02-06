
# Test Quality Metrics Taxonomy

This document defines a comprehensive set of **test quality dimensions** beyond brittle and vacuous tests. These metrics focus on **intent fidelity**, **signal strength**, **determinism**, and **auditability**, and are designed to support both human-written and agent-generated test suites.

---

## I. Specification Alignment & Intent Fidelity

### 1. Intent Coverage

**Definition**
Every declared intent, acceptance criterion, or invariant must be covered by at least one test.

#### **Signals**

* One-to-one mapping between intent atoms and tests
* No orphan intents
* No orphan tests

---

### 2. Intent Precision

**Definition**
Tests assert the *specific behavior claimed by the intent*, not proxies or incidental effects.

#### **Anti-patterns**

* Asserting internal implementation details
* Asserting partial outcomes
* Overly permissive assertions

---

### 3. Invariant Encoding

**Definition**
System invariants are explicitly encoded and tested, rather than being implicit or emergent.

#### **Examples**

* Idempotency
* Authorization rules
* Referential integrity
* Monotonic state transitions

---

## II. Failure Signal Quality

### 4. Failure Locality

**Definition**
A test failure isolates a single, identifiable cause.

#### **Examples**

* Multi-assert “god tests”
* Tests validating multiple intents simultaneously

---

### 5. Failure Explainability

**Definition**
When a test fails, the error message clearly explains *why* the intent was violated.

#### **Signals**

* Domain-specific assertion messages
* Expected vs. actual values in domain language
* References to intent or invariant IDs

---

### 6. False Positive Resistance

**Definition**
Tests fail *only* when the system behavior is incorrect.

#### **Anti-patterns**

* Timing dependencies (e.g., sleeps)
* Order-dependent tests
* Environmental coupling

---

## III. Test Strength & Adversarial Power

### 7. Mutation Resistance

**Definition**
The test suite detects small but realistic defects.

#### **Signals**

* High mutation kill rate
* Semantic, not just syntactic, sensitivity

---

### 8. Boundary Coverage

**Definition**
Tests explicitly validate domain boundaries and edge conditions.

#### **Examples**

* Off-by-one limits
* Empty vs. null
* Minimum and maximum domain values

---

### 9. Negative Capability Coverage

**Definition**
Tests prove what the system must *not* do.

#### **Examples**

* Unauthorized access is rejected
* Invalid transitions are blocked
* Invalid inputs produce errors

---

## IV. Determinism & Stability

### 10. Determinism

**Definition**
Test outcomes are fully deterministic and repeatable.

#### **Anti-patterns**

* Unseeded randomness
* Clock dependency
* Network or external service calls

---

### 11. Environmental Independence

**Definition**
Tests do not depend on specific machines, environments, or execution order.

#### **Signals**

* Hermetic test environments
* Fully mocked external boundaries

---

## V. Structural & Architectural Quality

### 12. Abstraction Alignment

**Definition**
Tests validate public contracts rather than internal implementation details.

#### **Anti-patterns**

* Testing private methods
* Structural coupling to internals

---

### 13. Redundancy & Overlap

**Definition**
The test suite avoids unnecessary duplication.

#### **Signals**

* Highly correlated assertions
* Multiple tests proving the same intent

---

### 14. Test Minimality

**Definition**
Each test is necessary to prove some intent or invariant.

#### **Signal**

* Removing the test introduces a coverage or mutation gap

---

## VI. Maintainability & Evolvability

### 15. Change Amplification Factor

**Definition**
Measures how many tests break when a single intent changes.

#### **Signal**

* Low blast radius for intent changes
* Intent-scoped tests

---

### 16. Test Readability & Domain Clarity

**Definition**
Tests are easy for humans to read and reason about.

#### **Signals**

* Domain language over technical jargon
* Clear Arrange–Act–Assert structure
* Minimal incidental complexity

---

## VII. Meta-Quality (Intent-Native Systems)

### 17. Intent–Test Bijectivity

#### **Definition**

* Every intent has at least one test
* Every test maps to exactly one intent
* No ambiguous many-to-many relationships

---

### 18. Auditability Score

**Definition**
An external reviewer can reconstruct *why* the system behaves as it does.

#### **Signals**

* Traceable intent lineage
* Intent IDs embedded in tests and code
* Deterministic replay of test execution

---

## Guiding Principle

Traditional test metrics ask:

> *Does this test execute code?*

Intent-native metrics ask:

> *Does this test prove intent in a way that resists drift, deception, and automation error?*

This distinction is foundational for agent-generated software systems.

---
