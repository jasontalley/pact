Date : 2026-01-16 06h24

# Prompt 1

> **besides brittle and vacuous what other measures of test quality can we measure in software development?**

## ChatGPT GPT-5-2 :

Beyond brittle and vacuous tests, there is a fairly rich and well-understood landscape of test quality dimensions that can be measured with varying degrees of rigor. What is interesting—especially in the direction you are heading with Pact/Lumiry—is that many of these dimensions are structural or semantic, not merely syntactic or coverage-based.

Below is a structured taxonomy of test quality measures, grouped by intent. I will explicitly note which are mechanically measurable today versus agent-assisted or semantic.

I. Specification Alignment & Intent Fidelity

These measures assess whether tests meaningfully encode intent, not just behavior.

1. Intent Coverage

Question: Does every declared intent / AC / invariant have at least one test that proves it?

Signals

- 
1:1 mapping between intent atoms and tests

- 
No orphan intents

- 
No orphan tests

Measurability

- 
Fully mechanical if intent registry exists (Pact-native)

- 
Stronger than traditional “requirements coverage”

2. Intent Precision

Question: Does the test assert the specific thing the intent claims, and not a proxy?

Anti-patterns

- 
Asserting internal implementation details

- 
Asserting partial effects (e.g., status code but not state change)

- 
Overly permissive assertions

Measurability

- 
Partially mechanical (assertion shape analysis)

- 
Strong agent-assisted semantic analysis

3. Invariant Encoding

Question: Are system invariants explicitly encoded as tests rather than implied?

Examples

- 
Idempotency

- 
Authorization invariants

- 
Monotonicity

- 
Referential integrity

Signal

- 
Invariant expressed as reusable test contract

- 
Invariant tested across multiple contexts

Measurability

- 
Structural detection

- 
Semantic scoring via agents

II. Failure Signal Quality

These measure how informative and trustworthy failures are.

4. Failure Locality

Question: When a test fails, does it isolate a single cause?

Anti-patterns

- 
Multi-assert “god tests”

- 
Large integration tests asserting many things

Signals

- 
Narrow Arrange–Act–Assert scope

- 
Single dominant assertion

Measurability

- 
Structural (assert count, branching)

- 
Heuristic scoring

5. Failure Explainability

Question: Does the failure message explain why intent was violated?

Signals

- 
Domain-specific assertion messages

- 
Includes expected vs actual in domain language

- 
References intent ID or invariant

Measurability

- 
Mechanical checks for custom assertions

- 
NLP scoring for clarity

6. False Positive Resistance

Question: Does the test fail only when the system is wrong?

Anti-patterns

- 
Time-based sleeps

- 
Ordering assumptions

- 
Environmental coupling

Measurability

- 
Overlaps with brittleness

- 
Chaos / perturbation testing can surface this

III. Test Strength & Adversarial Power

These measure how hard it is to cheat the test.

7. Mutation Resistance

Question: Would small, realistic bugs be caught?

Signal

- 
High mutation kill rate

- 
Tests fail on semantic mutations, not just syntax

Measurability

- 
Mutation testing tools

- 
Expensive but very high signal

8. Boundary Coverage

Question: Are boundary conditions explicitly tested?

Examples

- 
Off-by-one limits

- 
Empty vs null

- 
Max/min domain values

Measurability

- 
Partial mechanical detection

- 
Strong semantic inference

9. Negative Capability Coverage

Question: Does the test suite prove what the system must not do?

Examples

- 
Unauthorized access

- 
Invalid transitions

- 
Invalid inputs rejected

Measurability

- 
Mechanical classification of negative tests

- 
Intent registry alignment

IV. Determinism & Stability

These measure whether tests behave like instruments rather than experiments.

10. Determinism

Question: Is the test outcome fully deterministic?

Anti-patterns

- 
Randomness without seeding

- 
Clock dependency

- 
External APIs

Measurability

- 
Static analysis (Date.now, random, IO)

- 
Runtime re-execution variance

11. Environmental Independence

Question: Does the test require a specific machine, network, or ordering?

Signals

- 
Fully mocked boundaries

- 
Hermetic test environments

Measurability

- 
Dependency graph analysis

- 
Containerized replay

V. Structural & Architectural Quality

These measure how tests relate to system design.

12. Abstraction Alignment

Question: Do tests align with public contracts rather than internals?

Anti-patterns

- 
Private method testing

- 
Structural coupling to internals

Measurability

- 
Access-modifier analysis

- 
Call graph inspection

13. Redundancy & Overlap

Question: Are multiple tests proving the same thing?

Signals

- 
Highly correlated assertions

- 
Identical setup and assertions

Measurability

- 
Assertion similarity analysis

- 
Graph clustering

14. Test Minimality

Question: Is each test necessary?

Signal

- 
Removing the test causes a coverage or mutation gap

Measurability

- 
Subtractive test analysis (expensive but powerful)

VI. Maintainability & Evolvability

These predict long-term cost and correctness.

15. Change Amplification Factor

Question: How many tests break when one intent changes?

Signal

- 
Low blast radius

- 
Intent-scoped tests

Measurability

- 
Git history analysis

- 
Change impact simulation

16. Test Readability & Domain Clarity

Question: Can a human understand what behavior is proven?

Signals

- 
Domain language

- 
No incidental complexity

- 
Clear AAA structure

Measurability

- 
Heuristic + agent scoring

- 
Token entropy analysis

VII. Meta-Quality (Pact-Specific, but Novel)

These become possible only once intent is first-class.

17. Intent–Test Bijectivity

- 
Every intent has tests

- 
Every test has intent

- 
No many-to-many ambiguity

18. Auditability Score

Question: Can an external auditor reconstruct why the system behaves as it does?

Signals:

- 
Traceable intent lineage

- 
Intent IDs embedded in tests and code

- 
Deterministic replay

Summary Table (Condensed)

| Dimension | Traditional Tooling | Pact-Native | Agent-Enhanced |
| --- | --- | --- | --- |
| Coverage | ✔️ | ✔️✔️ | ✔️ |
| Mutation resistance | ✔️ | ✔️ | ✔️ |
| Intent precision | ❌ | ✔️✔️ | ✔️✔️ |
| Failure explainability | ❌ | ✔️ | ✔️✔️ |
| Auditability | ❌ | ✔️✔️✔️ | ✔️✔️✔️ |

A Key Insight (Framing for Pact)

Traditional test quality metrics ask:

“Does this test execute code?”

Pact-style metrics ask:

“Does this test prove intent in a way that resists deception, drift, and automation errors?”

That framing is not incremental—it is a categorical shift. It also explains why agent-written tests require stronger quality gates than human-written ones.

If you want, the next logical step would be:

- 
a formal Test Quality Scorecard

- 
or a minimal mandatory test quality baseline suitable for CI enforcement

- 
or a taxonomy of test smells mapped to automated detection strategies

Each of those would slot directly into Pact’s value proposition.


---

# Prompt 2

> **can you capture that list as markdown?**

## ChatGPT GPT-5-2 :

Certainly. Below is the full list captured as clean, portable Markdown, suitable for direct inclusion in a repository (e.g., test-quality-metrics.md) or as a canonical reference for Pact / ProdOS.

Test Quality Metrics Taxonomy

This document defines a comprehensive set of test quality dimensions beyond brittle and vacuous tests. These metrics focus on intent fidelity, signal strength, determinism, and auditability, and are designed to support both human-written and agent-generated test suites.

I. Specification Alignment & Intent Fidelity
1. Intent Coverage

Definition
Every declared intent, acceptance criterion, or invariant must be covered by at least one test.

Signals

- 
One-to-one mapping between intent atoms and tests

- 
No orphan intents

- 
No orphan tests

2. Intent Precision

Definition
Tests assert the specific behavior claimed by the intent, not proxies or incidental effects.

Anti-patterns

- 
Asserting internal implementation details

- 
Asserting partial outcomes

- 
Overly permissive assertions

3. Invariant Encoding

Definition
System invariants are explicitly encoded and tested, rather than being implicit or emergent.

Examples

- 
Idempotency

- 
Authorization rules

- 
Referential integrity

- 
Monotonic state transitions

II. Failure Signal Quality
4. Failure Locality

Definition
A test failure isolates a single, identifiable cause.

Anti-patterns

- 
Multi-assert “god tests”

- 
Tests validating multiple intents simultaneously

5. Failure Explainability

Definition
When a test fails, the error message clearly explains why the intent was violated.

Signals

- 
Domain-specific assertion messages

- 
Expected vs. actual values in domain language

- 
References to intent or invariant IDs

6. False Positive Resistance

Definition
Tests fail only when the system behavior is incorrect.

Anti-patterns

- 
Timing dependencies (e.g., sleeps)

- 
Order-dependent tests

- 
Environmental coupling

III. Test Strength & Adversarial Power
7. Mutation Resistance

Definition
The test suite detects small but realistic defects.

Signals

- 
High mutation kill rate

- 
Semantic, not just syntactic, sensitivity

8. Boundary Coverage

Definition
Tests explicitly validate domain boundaries and edge conditions.

Examples

- 
Off-by-one limits

- 
Empty vs. null

- 
Minimum and maximum domain values

9. Negative Capability Coverage

Definition
Tests prove what the system must not do.

Examples

- 
Unauthorized access is rejected

- 
Invalid transitions are blocked

- 
Invalid inputs produce errors

IV. Determinism & Stability
10. Determinism

Definition
Test outcomes are fully deterministic and repeatable.

Anti-patterns

- 
Unseeded randomness

- 
Clock dependency

- 
Network or external service calls

11. Environmental Independence

Definition
Tests do not depend on specific machines, environments, or execution order.

Signals

- 
Hermetic test environments

- 
Fully mocked external boundaries

V. Structural & Architectural Quality
12. Abstraction Alignment

Definition
Tests validate public contracts rather than internal implementation details.

Anti-patterns

- 
Testing private methods

- 
Structural coupling to internals

13. Redundancy & Overlap

Definition
The test suite avoids unnecessary duplication.

Signals

- 
Highly correlated assertions

- 
Multiple tests proving the same intent

14. Test Minimality

Definition
Each test is necessary to prove some intent or invariant.

Signal

- 
Removing the test introduces a coverage or mutation gap

VI. Maintainability & Evolvability
15. Change Amplification Factor

Definition
Measures how many tests break when a single intent changes.

Signal

- 
Low blast radius for intent changes

- 
Intent-scoped tests

16. Test Readability & Domain Clarity

Definition
Tests are easy for humans to read and reason about.

Signals

- 
Domain language over technical jargon

- 
Clear Arrange–Act–Assert structure

- 
Minimal incidental complexity

VII. Meta-Quality (Intent-Native Systems)
17. Intent–Test Bijectivity

Definition

- 
Every intent has at least one test

- 
Every test maps to exactly one intent

- 
No ambiguous many-to-many relationships

18. Auditability Score

Definition
An external reviewer can reconstruct why the system behaves as it does.

Signals

- 
Traceable intent lineage

- 
Intent IDs embedded in tests and code

- 
Deterministic replay of test execution

Guiding Principle

Traditional test metrics ask:

Does this test execute code?

Intent-native metrics ask:

Does this test prove intent in a way that resists drift, deception, and automation error?

This distinction is foundational for agent-generated software systems.

If you want, the next step could be to:

- 
Normalize these into a CI-enforceable quality rubric

- 
Define hard vs. soft gates for automated enforcement

- 
Map each metric to static analysis, runtime analysis, or agent review

All three are straightforward extensions of this artifact.


---

# Prompt 3

> **What do you think about these quality dimensions for tests? // Quality dimensions (from /ingest/test-quality.md) const QUALITY_DIMENSIONS = { intentFidelity: { weight: 0.2, threshold: 0.7 }, noVacuousTests: { weight: 0.15, threshold: 0.9 }, noBrittleTests: { weight: 0.15, threshold: 0.8 }, determinism: { weight: 0.1, threshold: 0.95 }, failureSignalQuality: { weight: 0.15, threshold: 0.7 }, integrationTestAuthenticity: { weight: 0.15, threshold: 0.8 }, boundaryAndNegativeCoverage: { weight: 0.1, threshold: 0.6 }, };**

## ChatGPT GPT-5-2 :

Short answer: this is a strong, coherent first-order model. It is internally consistent, intent-forward, and—critically—gateable. You have avoided the two classic traps:

1. 
Over-indexing on raw coverage.

2. 
Defining dimensions that cannot be operationalized.

That said, there are a few structural observations and refinements that will materially improve its long-term usefulness, especially in an agent-driven environment.

1. High-level assessment
What you got right

a. Intent fidelity as the anchor (0.20)
This is exactly correct. If tests do not prove intent, everything else is noise. Making this the highest-weight dimension is both philosophically and practically sound.

b. Orthogonality is mostly preserved
With one exception (see below), these dimensions measure different failure modes rather than rephrasing the same concept.

c. Thresholds reflect reality, not perfectionism
You are not demanding 1.0 in places where systems rarely achieve it (boundary coverage, failure signal quality). This is critical for adoption.

d. Designed for CI gating, not dashboards
Every dimension here can plausibly block a merge. That is a much higher bar than “interesting metrics.”

Overall verdict: this is already better than most commercial test-quality frameworks.

2. Dimension-by-dimension critique

I’ll go dimension by dimension, focusing on clarity, overlap, and calibration.

intentFidelity

tsCopy codeweight: 0.2
threshold: 0.7

Assessment: Excellent, but underspecified

This is the most important dimension and also the most semantically complex.

Suggestions:

- 
Explicitly define what earns partial credit

Assertion strength

- 
Scope alignment

- 
Proxy vs direct validation

Consider whether this should be two sub-signals internally:

- 
Intent linkage (mechanical)

- 
Intent proof strength (semantic)

Threshold of 0.7 is reasonable early, but you may eventually want:

- 
Soft gate at 0.7

- 
Hard gate at 0.6

This is the one dimension where agent-assisted scoring will matter most.

noVacuousTests

tsCopy codeweight: 0.15
threshold: 0.9

Assessment: Correctly strict

Vacuous tests are actively harmful, especially with agents. A high threshold is appropriate.

One note:

- 
Vacuity detection tends to be binary in spirit

- 
A score-based threshold is fine, but make sure the semantics are clear:

One egregious vacuous test should hurt more than many borderline ones

This is a good candidate for:

- 
Per-test hard failures

- 
Aggregated into the suite score secondarily

noBrittleTests

tsCopy codeweight: 0.15
threshold: 0.8

Assessment: Good, but overlaps slightly with determinism

Brittleness and determinism are correlated but not identical:

- 
Determinism = repeatability

- 
Brittleness = sensitivity to irrelevant change

Your separation is defensible, but I would strongly recommend:

- 
Documenting the difference explicitly

- 
Ensuring detection logic does not double-penalize the same root cause

Otherwise, weight and threshold are appropriate.

determinism

tsCopy codeweight: 0.1
threshold: 0.95

Assessment: Correct, but possibly underweighted long-term

In an agent-heavy system, non-determinism is a silent killer:

- 
Flaky CI

- 
Unreliable intent verification

- 
Agent learning from noise

You may eventually want:

- 
Weight closer to 0.15

- 
Or a hard floor (e.g., <0.9 always fails CI)

That said, your current calibration is reasonable for early adoption.

failureSignalQuality

tsCopy codeweight: 0.15
threshold: 0.7

Assessment: Excellent inclusion, rare in practice

This is one of the most under-measured aspects of test quality, and one of the most valuable.

Two suggestions:

- 
Ensure this scores signal clarity, not verbosity

- 
Reward:

Domain language

- 
Expected vs actual

- 
Intent reference

Threshold at 0.7 is right; most codebases are bad at this initially.

integrationTestAuthenticity

tsCopy codeweight: 0.15
threshold: 0.8

Assessment: Important, but slightly ambiguous

This is the least precisely named dimension.

Questions your spec should answer explicitly:

- 
Does “authentic” mean:

Real boundaries?

- 
No over-mocking?

- 
Real data flows?

Does this apply only to integration tests, or penalize unit tests masquerading as integration tests?

The concept is solid, but this dimension will benefit from:

- 
A tighter operational definition

- 
Clear non-goals (e.g., not punishing unit tests)

Weight and threshold are reasonable once clarified.

boundaryAndNegativeCoverage

tsCopy codeweight: 0.1
threshold: 0.6

Assessment: Correctly scoped as “important but hard”

This is exactly the right place to be lenient:

- 
Boundary coverage is expensive

- 
Negative testing is often uneven

The low threshold signals:

“We care, but we are pragmatic.”

That is the right message.

One improvement:

- 
Consider tracking boundary vs negative separately internally

- 
Aggregate them for the external score

3. Structural observations
A. You are missing exactly one major dimension

Notably absent (and understandably so) is:

Mutation / adversarial resistance

You may have intentionally omitted it due to cost. That is fine. But I would recommend:

- 
Naming it as an explicit non-goal (for now)
or

- 
Reserving a slot for it later (even at weight 0)

Its absence is defensible; its invisibility is not.

B. Weights sum cleanly and tell a story

Your weights add to 1.0 and narrate a philosophy:

- 
50%: intent, meaning, signal

- 
30%: correctness and realism

- 
20%: stability and completeness

That is a very good story to be able to tell users.

C. This is already a CI-grade contract

With minimal refinement, this can be:

- 
A pre-push gate

- 
A CI quality budget

- 
A regression detector over time

Most frameworks never get here.

4. Suggested minimal refinements (non-disruptive)

If you want to keep this tight and avoid scope creep, I would suggest only:

1. 
Clarify integrationTestAuthenticity semantics

2. 
Document brittleness vs determinism explicitly

3. 
Call out mutation resistance as a future dimension

4. 
Optionally:

Raise determinism weight slightly or

5. 
Add a hard determinism floor

No renaming, no re-weighting required to proceed.

Final verdict

This is a serious, production-worthy test quality model—especially for an intent-native, agent-augmented system. It is:

- 
Opinionated without being dogmatic

- 
Enforceable without being brittle

- 
Forward-looking without being speculative

Most importantly: it aligns with how agents actually fail, not how humans like to believe tests fail.

If you want, the next logical step would be to:

- 
Map each dimension to concrete detection signals

- 
Define hard vs soft gates

- 
Or produce a single scalar Test Quality Index (TQI) with explainability

All three would build directly on what you already have.


---

# Prompt 4

> **Here's the first version of the test analyzer code**

## ChatGPT GPT-5-2-THINKING :

Thanks—this is a good “bootstrap scaffolding” implementation: it is small, deterministic, and it produces a single, legible verdict (passed + scored breakdown). As a v0 analyzer, it is doing the right thing: cheap heuristics that establish guardrails.

Below is a candid review focused on (a) correctness of the heuristics, (b) avoiding pathological incentives, and (c)1 improvements that preserve your current architecture.

What’s strong in this v1
1) The shape of the API is right

- 
analyzeTestFile(filePath) -> { scores, overallScore, passed, issues } is exactly what you want for CI integration.

- 
It separates scoring from thresholding and issue collection, which will make future refactors easier.

2) You kept it “cheap”

- 
Regex-based scoring is appropriate for scaffolding; AST parsing is overkill until you know what you actually want to enforce.

3) Dimensions map 1:1 to your rubric

- 
No “mystery metrics.” Everything ties directly back to the dimensions you defined.

Key issues to address (these will matter quickly)
A) Some dimensions will be gameable (incentive risk)

Right now, a developer/agent can inflate scores cheaply:

- 
Intent fidelity: Add @atom IA-001 comments everywhere.

- 
Failure signal quality: Add comments before every expect() with no additional meaning.

- 
Boundary coverage: Add toBe(null) assertions or toThrow() anywhere, regardless of relevance.

This is normal for v1, but you should add minimum strength rules so the metric can’t be “satisfied” by noise.

B) Several heuristics are too coarse and will mis-score real code
1) checkDeterminism incorrectly treats “any jest.mock exists” as “everything is mocked”

jsCopy codeconst isMocked = content.includes('jest.mock') || content.includes('jest.spyOn');

If there is one jest.mock() for some unrelated dependency, then Math.random() occurrences are treated as “mocked” even if they are not. This will produce false confidence.

Minimal fix (still regex-based): check for mocking of the specific nondeterminism source:

- 
jest.spyOn(Math, 'random'), mockDate, jest.useFakeTimers, vi.setSystemTime, etc.

- 
For network calls: look for nock, msw, fetchMock, etc.

2) checkFailureSignalQuality is partially based on an invalid Jest pattern

jsCopy codeexpect(...).something(, 'message')

Jest matchers generally do not accept a second “message” argument; this regex will rarely match legitimate code and can mislead you.

Your “comment before expect” approach is directionally fine, but it is still gameable.

Better proxy signals (still cheap):

- 
Quality of it("...")/test("...") titles (domain phrasing, expected behavior included)

- 
Presence of expect.assertions(n) / expect.hasAssertions()

- 
Use of custom matchers/util assertions that generate strong diffs (toMatchObject, toStrictEqual for data contracts, etc.)

3) checkBoundaryAndNegativeCoverage counts assertion occurrences, not tests with boundary intent

This line:

jsCopy codeboundaryTestCount += (content.match(pattern) || []).length;

means a single test with several boundary assertions will count multiple times, artificially boosting the ratio.

Better heuristic: count the number of test blocks (it(...)) that contain at least one boundary/negative pattern. That requires only a basic “split into it-blocks” approach (no AST required).

4) checkForBrittleTests mixes “brittle” and “style preference”

Snapshot tests can be brittle, but they are sometimes the right tool (especially for UI). toHaveBeenCalledTimes() is not always brittle; it depends on whether call count is part of the contract.

Recommendation: treat these as “brittleness risk signals,” not automatic penalties, unless you can detect context:

- 
toHaveBeenCalledTimes(1) on a domain-critical “exactly once” behavior might be correct

- 
Snapshot tests for stable UI components are often acceptable if they are scoped well

Missing distinction that will matter soon: “Not applicable” vs “Passing”

Right now you return 1.0 for dimensions you consider not applicable, e.g.:

jsCopy codeif (!isIntegrationTest) return 1.0;

This inflates overall scores and makes it hard to compare across test types.

Better approach: return null (or undefined) for N/A dimensions, and adjust weighting logic to normalize weights across only applicable dimensions.

- 
This avoids unit tests “benefiting” from integration-specific dimensions.

- 
It also avoids encouraging teams to misclassify tests to get “free points.”

Recommended v1.1 improvements (keep the same structure)

These changes preserve your design but make the output far more trustworthy.

1) Make every dimension compute per-test, not per-file

Even without AST parsing, you can:

- 
split on \bit\( / \btest\( boundaries

- 
treat each block as a test “unit”

- 
score the suite as the mean/median (median reduces gaming)

This one change will fix most incentive problems.

2) Make intent fidelity harder to game

Instead of counting @atom occurrences anywhere, require:

- 
The annotation appears inside the test block it claims to cover

- 
And ideally, that it is unique per test (or explicitly allow multi-atom tests but penalize)

Cheap heuristic:

- 
For each it(...) block: does it include @atom IA-###?

3) Fix determinism detection to match the specific nondeterminism

- 
If Math.random() appears, require:

jest.spyOn(Math, 'random') or seeded RNG usage or explicit deterministic wrapper

If Date.now() appears, require:

- 
fake timers / setSystemTime / date mocking

If fetch appears, require:

- 
MSW/nock/fetch-mock (or explicit “integration test allowed network” exception)

4) Add a “hard-fail smell” list

Certain patterns should fail CI regardless of overall weighted score (because they create operational instability):

- 
setTimeout(...) in tests (unless explicitly allowed with fake timers)

- 
real network calls in unit tests

- 
expect(true).toBe(true) and similar (you already catch one)

In practice, this becomes your “no regressions” guardrail while the scoring model evolves.

5) Expand file discovery

findTestFiles currently only includes .spec.ts and ignores .test.ts, .spec.tsx, etc.

At minimum:

- 
.spec.ts, .test.ts, .spec.tsx, .test.tsx, and potentially .spec.js/.test.js

Also: ignore dist/, build/, .next/, etc. to avoid scanning compiled artifacts.

Alignment to your dimensions model

Your current implementation is directionally aligned, but a few mappings are weak:

- 
failureSignalQuality: current scoring is not measuring the right thing (Jest message arg isn’t real).

- 
determinism: current mocking check is overly broad and will miss real nondeterminism.

- 
boundaryAndNegativeCoverage: current method overcounts and encourages irrelevant assertions.

- 
integrationTestAuthenticity: “no mocks” is too strict in practice (some external boundaries should be mocked even in integration tests—payments, email, third-party APIs).

Concrete next step I recommend

If you want maximum leverage for minimal work, do one refactor only:

Switch from file-level regex counts to per-test-block analysis, then aggregate.

That will immediately improve:

- 
intent fidelity accuracy

- 
boundary/negative coverage validity

- 
brittleness attribution

- 
determinism attribution

- 
gaming resistance

If you want, I can sketch a v1.1 patch that:

- 
extracts it/test blocks,

- 
scores each dimension per block,

- 
supports N/A dimensions,

- 
and keeps your existing CLI contract intact.