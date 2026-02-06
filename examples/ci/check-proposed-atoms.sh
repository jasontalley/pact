#!/bin/bash
# ==============================================================================
# CI Policy Check - Phase 18
# ==============================================================================
#
# This script checks if CI should be blocked due to pending proposed atoms.
# Use this in your CI/CD pipeline to enforce human approval before deployment.
#
# Usage:
#   ./check-proposed-atoms.sh <project-id>
#
# Environment Variables:
#   PACT_API_URL: Base URL for Pact API (default: http://localhost:3000)
#   PACT_BLOCK_ON_PROPOSED_ATOMS: Set to "true" to enable blocking (default: true)
#
# Exit Codes:
#   0: CI policy passed (no blocking)
#   1: CI policy failed (proposed atoms require approval)
#   2: Error occurred during check
#
# ==============================================================================

set -e

# Configuration
PROJECT_ID="${1:-}"
PACT_API_URL="${PACT_API_URL:-http://localhost:3000}"
PACT_BLOCK_ON_PROPOSED_ATOMS="${PACT_BLOCK_ON_PROPOSED_ATOMS:-true}"

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Validate input
if [ -z "$PROJECT_ID" ]; then
  echo -e "${RED}Error: PROJECT_ID is required${NC}"
  echo "Usage: $0 <project-id>"
  exit 2
fi

if [ "$PACT_BLOCK_ON_PROPOSED_ATOMS" != "true" ]; then
  echo -e "${GREEN}✓ CI blocking disabled (PACT_BLOCK_ON_PROPOSED_ATOMS != true)${NC}"
  exit 0
fi

echo "Checking CI policy for project: $PROJECT_ID"
echo "API URL: $PACT_API_URL"
echo ""

# Check CI policy
RESPONSE=$(curl -s -w "\n%{http_code}" \
  "$PACT_API_URL/agents/reconciliation/ci-policy/check?projectId=$PROJECT_ID" \
  -H "Content-Type: application/json" \
  2>&1)

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

# Check for curl errors
if [ $? -ne 0 ]; then
  echo -e "${RED}✗ Failed to connect to Pact API${NC}"
  echo "Response: $RESPONSE"
  exit 2
fi

# Check HTTP status
if [ "$HTTP_CODE" != "200" ]; then
  echo -e "${RED}✗ API request failed (HTTP $HTTP_CODE)${NC}"
  echo "Response: $BODY"
  exit 2
fi

# Parse response
BLOCKED=$(echo "$BODY" | grep -o '"blocked":[^,}]*' | cut -d':' -f2 | tr -d ' ')
PASSED=$(echo "$BODY" | grep -o '"passed":[^,}]*' | cut -d':' -f2 | tr -d ' ')
REASON=$(echo "$BODY" | grep -o '"reason":"[^"]*"' | cut -d'"' -f4)
PROPOSED_COUNT=$(echo "$BODY" | grep -o '"proposedAtomsCount":[0-9]*' | cut -d':' -f2)
REVIEW_URL=$(echo "$BODY" | grep -o '"reviewUrl":"[^"]*"' | cut -d'"' -f4)

echo "Policy Check Results:"
echo "  Passed: $PASSED"
echo "  Blocked: $BLOCKED"
echo "  Proposed Atoms: $PROPOSED_COUNT"
echo ""

if [ "$BLOCKED" = "true" ]; then
  echo -e "${RED}✗ CI BLOCKED${NC}"
  echo ""
  echo "$REASON"
  echo ""
  echo -e "${YELLOW}Action Required:${NC}"
  echo "  1. Review proposed atoms at: $REVIEW_URL"
  echo "  2. Approve or reject each proposed atom"
  echo "  3. Re-run this CI pipeline"
  echo ""
  exit 1
else
  echo -e "${GREEN}✓ CI PASSED${NC}"
  echo "No proposed atoms blocking deployment"
  exit 0
fi
