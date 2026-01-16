# @atom IA-001, IA-002, IA-003
Feature: Atom Creation
  As a product owner
  I want to create Intent Atoms from natural language descriptions
  So that I can capture behavioral requirements in a testable form

  Background:
    Given the Pact system is initialized
    And I am authenticated as a product owner

  # @atom IA-001
  Scenario: Create valid atom with sufficient confidence
    Given I have an intent description: "User authentication must complete within 2 seconds"
    When I submit the intent for atomization
    Then the Atomization Agent analyzes the intent
    And the atom is created with status "draft"
    And the atom ID matches pattern "IA-\d{3}"
    And the confidence score is at least 0.7

  # @atom IA-002
  Scenario: Reject vague intent with low confidence
    Given I have a vague intent: "System should be fast"
    When I submit the intent for atomization
    Then the Atomization Agent analyzes the intent
    And the confidence score is below 0.7
    And the system rejects the atom creation
    And I receive feedback explaining the issue

  # @atom IA-003
  Scenario: Suggest decomposition for non-atomic intent
    Given I have a compound intent: "User can log in and view dashboard"
    When I submit the intent for atomization
    Then the Atomization Agent detects the intent is not atomic
    And the system suggests decomposition into smaller atoms
    And no atom is created

  # @atom IA-004
  Scenario: Create atom with specific category
    Given I have an intent description: "Payment transaction must be encrypted"
    And I specify category as "security"
    When I submit the intent for atomization
    Then the atom is created with category "security"

  # @atom IA-005
  Scenario: Reject implementation-specific intent
    Given I have an implementation-specific intent: "Use Redis for session storage"
    When I submit the intent for atomization
    Then the Atomization Agent detects implementation details
    And the confidence score is below 0.7
    And I receive feedback about implementation-agnostic requirements
