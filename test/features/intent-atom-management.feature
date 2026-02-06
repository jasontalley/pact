# @atom IA-BDD-006, IA-BDD-007, IA-BDD-008, IA-BDD-009, IA-BDD-010
Feature: Intent Atom Management
  As a product owner
  I want to manage Intent Atoms through their lifecycle
  So that I can maintain and evolve behavioral requirements

  Background:
    Given the Pact system is initialized
    And I am authenticated as a product owner

  # Scenario 1: User updates draft atom
  @update @draft
  Scenario: User updates draft atom
    Given I have created a draft atom with description: "User login must validate email format"
    When I update the atom description to: "User login must validate email format using RFC 5322 standard"
    Then the atom description is updated successfully
    And the atom status remains "draft"

  # Scenario 2: User cannot update committed atom (INV-004)
  @update @committed @invariant
  Scenario: User cannot update committed atom
    Given I have a committed atom with description: "API must return paginated results"
    When I attempt to update the atom description to: "API must return sorted paginated results"
    Then the update is rejected with status 403
    And I receive a message about immutability
    And the atom description remains unchanged

  # Scenario 3: User supersedes committed atom
  @supersession @committed
  Scenario: User supersedes committed atom
    Given I have a committed atom with description: "Cache TTL must be 5 minutes"
    And I have a committed atom with description: "Cache TTL must be 10 minutes with auto-refresh"
    When I supersede the first atom with the second atom
    Then the first atom status changes to "superseded"
    And the first atom references the superseding atom
    And the supersession chain is recorded

  # Scenario 4: User filters atoms by status
  @filtering
  Scenario: User filters atoms by status
    Given the system has atoms with various statuses:
      | status     | count |
      | draft      | 3     |
      | committed  | 2     |
      | superseded | 1     |
    When I filter atoms by status "draft"
    Then I see only atoms with status "draft"
    And the result count is 3

  # Scenario 5: User searches atoms by description
  @search
  Scenario: User searches atoms by description
    Given the system has atoms with descriptions:
      | description                                    | category    |
      | User authentication must complete within 2 sec | performance |
      | Payment must be encrypted                      | security    |
      | User session must timeout after inactivity     | security    |
    When I search for atoms containing "User"
    Then I see 2 matching atoms
    And the results include "authentication" and "session" atoms

  # Additional management scenarios

  @tagging
  Scenario: User adds and removes tags from atom
    Given I have created a draft atom with description: "Error messages must be user-friendly"
    When I add tag "ux" to the atom
    Then the atom has tag "ux"
    When I add tag "error-handling" to the atom
    Then the atom has tags "ux" and "error-handling"
    When I remove tag "ux" from the atom
    Then the atom has only tag "error-handling"

  @deletion @draft
  Scenario: User deletes draft atom
    Given I have created a draft atom with description: "Temporary test atom for deletion"
    When I delete the atom
    Then the atom is removed from the system
    And the atom is no longer retrievable

  @deletion @committed @negative
  Scenario: User cannot delete committed atom
    Given I have a committed atom with description: "Critical security requirement"
    When I attempt to delete the atom
    Then the deletion is rejected with status 403
    And I receive a message about committed atom restrictions
    And the atom still exists in the system
