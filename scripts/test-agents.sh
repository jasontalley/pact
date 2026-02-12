#!/bin/bash
#
# Agent Testing Script
#
# Runs agent tests inside Docker containers following "No Host Dependencies" philosophy.
# All tests execute within the pact-app container where database and LLM services are accessible.
#
# Usage:
#   ./scripts/test-agents.sh              # Run all fast tests (property + contract + cost)
#   ./scripts/test-agents.sh --property   # Run property-based tests only
#   ./scripts/test-agents.sh --cost       # Run cost/latency budget tests only
#   ./scripts/test-agents.sh --contracts  # Run contract acceptance tests only
#   ./scripts/test-agents.sh --golden     # Run golden suite evaluation (requires LLM)
#   ./scripts/test-agents.sh --micro-inference  # Run micro-inference tests (requires LLM)
#   ./scripts/test-agents.sh --quality-scoring  # Run quality-scoring tests (requires LLM)
#   ./scripts/test-agents.sh --all        # Run everything including LLM suites
#   ./scripts/test-agents.sh --ci         # CI mode: all fast tests + JUnit output
#   ./scripts/test-agents.sh --html       # Generate HTML report after evaluation
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RESULTS_DIR="test-results/agents"
CONTAINER_NAME="pact-app"

# Timestamp for this run
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")

# Default: run fast tests (no LLM required)
RUN_PROPERTY=false
RUN_COST=false
RUN_CONTRACTS=false
RUN_GOLDEN=false
RUN_MICRO_INFERENCE=false
RUN_QUALITY_SCORING=false
RUN_ALL=false
CI_MODE=false
UPDATE_SNAPSHOTS=false
HTML_REPORT=false
AGENT="all"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --property)
            RUN_PROPERTY=true
            shift
            ;;
        --cost)
            RUN_COST=true
            shift
            ;;
        --contracts)
            RUN_CONTRACTS=true
            shift
            ;;
        --golden)
            RUN_GOLDEN=true
            shift
            ;;
        --micro-inference)
            RUN_MICRO_INFERENCE=true
            shift
            ;;
        --quality-scoring)
            RUN_QUALITY_SCORING=true
            shift
            ;;
        --all)
            RUN_ALL=true
            shift
            ;;
        --ci)
            CI_MODE=true
            shift
            ;;
        --update-snapshots)
            UPDATE_SNAPSHOTS=true
            shift
            ;;
        --html)
            HTML_REPORT=true
            shift
            ;;
        --agent=*)
            AGENT="${1#*=}"
            shift
            ;;
        --help|-h)
            echo "Agent Testing Script - Docker-based test execution"
            echo ""
            echo "Usage: ./scripts/test-agents.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --property          Run property-based tests (invariants)"
            echo "  --cost              Run cost/latency budget tests"
            echo "  --contracts         Run contract acceptance tests"
            echo "  --golden            Run golden suite evaluation (requires LLM)"
            echo "  --micro-inference   Run micro-inference tests (requires LLM, ~\$0.05)"
            echo "  --quality-scoring   Run quality-scoring tests (requires LLM, ~\$0.02)"
            echo "  --all               Run all tests including LLM suites"
            echo "  --ci                CI mode: fast tests + JUnit XML output"
            echo "  --update-snapshots  Update golden test snapshots"
            echo "  --html              Generate HTML report after evaluation"
            echo "  --agent=NAME        Test specific agent (reconciliation|interview|all)"
            echo "  --help, -h          Show this help"
            echo ""
            echo "Results are saved to: test-results/agents/"
            echo ""
            echo "Examples:"
            echo "  ./scripts/test-agents.sh                    # All fast tests"
            echo "  ./scripts/test-agents.sh --golden           # Golden suite (needs LLM)"
            echo "  ./scripts/test-agents.sh --micro-inference  # Quick LLM quality check"
            echo "  ./scripts/test-agents.sh --quality-scoring  # Quality scoring check"
            echo "  ./scripts/test-agents.sh --all              # Everything"
            echo "  ./scripts/test-agents.sh --all --html       # Everything + HTML report"
            echo "  ./scripts/test-agents.sh --agent=reconciliation --golden"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# If no specific suite selected, run all fast tests (no LLM suites)
if [[ "$RUN_PROPERTY" == "false" && "$RUN_COST" == "false" && "$RUN_CONTRACTS" == "false" && "$RUN_GOLDEN" == "false" && "$RUN_MICRO_INFERENCE" == "false" && "$RUN_QUALITY_SCORING" == "false" && "$RUN_ALL" == "false" && "$CI_MODE" == "false" ]]; then
    RUN_PROPERTY=true
    RUN_COST=true
    RUN_CONTRACTS=true
fi

# If --all, enable everything
if [[ "$RUN_ALL" == "true" ]]; then
    RUN_PROPERTY=true
    RUN_COST=true
    RUN_CONTRACTS=true
    RUN_GOLDEN=true
    RUN_MICRO_INFERENCE=true
    RUN_QUALITY_SCORING=true
fi

# CI mode: fast tests with JUnit output
if [[ "$CI_MODE" == "true" ]]; then
    RUN_PROPERTY=true
    RUN_COST=true
    RUN_CONTRACTS=true
    RUN_GOLDEN=false  # Golden requires LLM, skip in CI by default
fi

echo -e "${BLUE}=== Pact Agent Testing ===${NC}"
echo "Timestamp: $TIMESTAMP"
echo "Results: $RESULTS_DIR"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}Error: Docker is not running${NC}"
    echo "Please start Docker and try again"
    exit 1
fi

# Function to ensure containers are running
ensure_containers_running() {
    echo -e "${YELLOW}Checking container status...${NC}"

    # Check if postgres is running
    if ! docker ps | grep -q pact-postgres; then
        echo -e "${YELLOW}Starting PostgreSQL...${NC}"
        docker-compose up -d postgres

        # Wait for postgres to be healthy
        echo -e "${YELLOW}Waiting for PostgreSQL to be ready...${NC}"
        sleep 2
        RETRIES=30
        until docker exec pact-postgres pg_isready -U pact > /dev/null 2>&1; do
            RETRIES=$((RETRIES - 1))
            if [ $RETRIES -eq 0 ]; then
                echo -e "${RED}PostgreSQL failed to start${NC}"
                exit 1
            fi
            sleep 2
        done
        echo -e "${GREEN}PostgreSQL is ready${NC}"
    fi

    # Start Redis if needed
    if ! docker ps | grep -q pact-redis; then
        echo -e "${YELLOW}Starting Redis...${NC}"
        docker-compose up -d redis
        sleep 2
    fi

    # Start app container if needed
    if ! docker ps | grep -q pact-app; then
        echo -e "${YELLOW}Starting app container...${NC}"
        docker-compose up -d app
        sleep 3
    fi

    echo -e "${GREEN}Containers are running${NC}"
    echo ""
}

# Ensure containers are running
ensure_containers_running

# Create results directories inside container
docker exec -i $CONTAINER_NAME sh -c "mkdir -p $RESULTS_DIR/property $RESULTS_DIR/contracts $RESULTS_DIR/cost $RESULTS_DIR/golden $RESULTS_DIR/micro-inference $RESULTS_DIR/quality-scoring $RESULTS_DIR/reports $RESULTS_DIR/snapshots/reconciliation $RESULTS_DIR/snapshots/interview"

FAILED=0
TOTAL=0

# Evaluation CLI command prefix — override NODE_OPTIONS to use a smaller heap
# so the ts-node process doesn't OOM alongside the running NestJS app
EVAL_CMD="NODE_OPTIONS=--max-old-space-size=3072 npx ts-node scripts/evaluate-agents.ts"

# =============================================================================
# Property Tests
# =============================================================================
if [[ "$RUN_PROPERTY" == "true" ]]; then
    echo -e "${BLUE}--- Property Tests ---${NC}"
    TOTAL=$((TOTAL + 1))

    PROPERTY_OUTPUT="$RESULTS_DIR/property/results-$TIMESTAMP.json"

    if $CI_MODE; then
        # CI mode: JUnit XML output
        if docker exec -i $CONTAINER_NAME sh -c "npx jest --testPathPattern='test/agents/.*/properties' --no-coverage --json --outputFile='$PROPERTY_OUTPUT' --reporters=default --reporters=jest-junit"; then
            echo -e "${GREEN}Property tests: PASSED${NC}"
        else
            echo -e "${RED}Property tests: FAILED${NC}"
            FAILED=$((FAILED + 1))
        fi
    else
        # Normal mode: JSON output
        if docker exec -i $CONTAINER_NAME sh -c "npx jest --testPathPattern='test/agents/.*/properties' --no-coverage --json --outputFile='$PROPERTY_OUTPUT'"; then
            echo -e "${GREEN}Property tests: PASSED${NC}"
        else
            echo -e "${RED}Property tests: FAILED${NC}"
            FAILED=$((FAILED + 1))
        fi
    fi

    echo "  Output: $PROPERTY_OUTPUT"
    echo ""
fi

# =============================================================================
# Contract Acceptance Tests
# =============================================================================
if [[ "$RUN_CONTRACTS" == "true" ]]; then
    echo -e "${BLUE}--- Contract Acceptance Tests ---${NC}"
    TOTAL=$((TOTAL + 1))

    CONTRACT_OUTPUT="$RESULTS_DIR/contracts/results-$TIMESTAMP.json"

    if docker exec -i $CONTAINER_NAME sh -c "npx jest --testPathPattern='test/agents/contracts' --no-coverage --json --outputFile='$CONTRACT_OUTPUT'"; then
        echo -e "${GREEN}Contract tests: PASSED${NC}"
    else
        echo -e "${RED}Contract tests: FAILED${NC}"
        FAILED=$((FAILED + 1))
    fi

    echo "  Output: $CONTRACT_OUTPUT"
    echo ""
fi

# =============================================================================
# Cost/Latency Budget Tests
# =============================================================================
if [[ "$RUN_COST" == "true" ]]; then
    echo -e "${BLUE}--- Cost/Latency Budget Tests ---${NC}"
    TOTAL=$((TOTAL + 1))

    COST_OUTPUT="$RESULTS_DIR/cost/results-$TIMESTAMP.json"

    if docker exec -i $CONTAINER_NAME sh -c "npx jest --testPathPattern='test/agents/cost-latency' --no-coverage --json --outputFile='$COST_OUTPUT'"; then
        echo -e "${GREEN}Cost/latency tests: PASSED${NC}"
    else
        echo -e "${RED}Cost/latency tests: FAILED${NC}"
        FAILED=$((FAILED + 1))
    fi

    echo "  Output: $COST_OUTPUT"
    echo ""
fi

# =============================================================================
# Golden Suite Evaluation (requires LLM + NestJS app bootstrap)
# =============================================================================
if [[ "$RUN_GOLDEN" == "true" ]]; then
    echo -e "${BLUE}--- Golden Suite Evaluation ---${NC}"
    echo -e "${YELLOW}Note: Golden tests require LLM access${NC}"
    TOTAL=$((TOTAL + 1))

    GOLDEN_ARGS="--output=$RESULTS_DIR/golden"

    if [[ "$AGENT" != "all" ]]; then
        GOLDEN_ARGS="$GOLDEN_ARGS --agent=$AGENT"
    fi

    if [[ "$UPDATE_SNAPSHOTS" == "true" ]]; then
        GOLDEN_ARGS="$GOLDEN_ARGS --update-snapshots"
    fi

    if [[ "$HTML_REPORT" == "true" ]]; then
        GOLDEN_ARGS="$GOLDEN_ARGS --html"
    fi

    if docker exec -i $CONTAINER_NAME sh -c "$EVAL_CMD --suite=golden $GOLDEN_ARGS"; then
        echo -e "${GREEN}Golden suite: PASSED${NC}"
    else
        echo -e "${RED}Golden suite: FAILED${NC}"
        FAILED=$((FAILED + 1))
    fi

    echo ""
fi

# =============================================================================
# Micro-Inference Suite (requires LLM, ~$0.05, ~30s)
# =============================================================================
if [[ "$RUN_MICRO_INFERENCE" == "true" ]]; then
    echo -e "${BLUE}--- Micro-Inference Suite ---${NC}"
    echo -e "${YELLOW}Note: Micro-inference tests require LLM access (~\$0.05)${NC}"
    TOTAL=$((TOTAL + 1))

    MI_ARGS="--output=$RESULTS_DIR/micro-inference"

    if [[ "$HTML_REPORT" == "true" ]]; then
        MI_ARGS="$MI_ARGS --html"
    fi

    if docker exec -i $CONTAINER_NAME sh -c "$EVAL_CMD --suite=micro-inference $MI_ARGS"; then
        echo -e "${GREEN}Micro-inference suite: PASSED${NC}"
    else
        echo -e "${RED}Micro-inference suite: FAILED${NC}"
        FAILED=$((FAILED + 1))
    fi

    echo ""
fi

# =============================================================================
# Quality Scoring Suite (requires LLM, ~$0.02, ~3min)
# =============================================================================
if [[ "$RUN_QUALITY_SCORING" == "true" ]]; then
    echo -e "${BLUE}--- Quality Scoring Suite ---${NC}"
    echo -e "${YELLOW}Note: Quality scoring tests require LLM access (~\$0.02)${NC}"
    TOTAL=$((TOTAL + 1))

    QS_ARGS="--output=$RESULTS_DIR/quality-scoring"

    if [[ "$HTML_REPORT" == "true" ]]; then
        QS_ARGS="$QS_ARGS --html"
    fi

    if docker exec -i $CONTAINER_NAME sh -c "$EVAL_CMD --suite=quality-scoring $QS_ARGS"; then
        echo -e "${GREEN}Quality scoring suite: PASSED${NC}"
    else
        echo -e "${RED}Quality scoring suite: FAILED${NC}"
        FAILED=$((FAILED + 1))
    fi

    echo ""
fi

# =============================================================================
# Summary Report
# =============================================================================
echo -e "${BLUE}=== Summary ===${NC}"

# Generate summary JSON inside container
docker exec -i $CONTAINER_NAME sh -c "cat > $RESULTS_DIR/summary-$TIMESTAMP.json << EOF
{
  \"timestamp\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\",
  \"runId\": \"$TIMESTAMP\",
  \"suites\": {
    \"property\": $RUN_PROPERTY,
    \"contracts\": $RUN_CONTRACTS,
    \"cost\": $RUN_COST,
    \"golden\": $RUN_GOLDEN,
    \"micro_inference\": $RUN_MICRO_INFERENCE,
    \"quality_scoring\": $RUN_QUALITY_SCORING
  },
  \"total\": $TOTAL,
  \"failed\": $FAILED,
  \"passed\": $((TOTAL - FAILED)),
  \"result\": \"$(if [ $FAILED -eq 0 ]; then echo "PASSED"; else echo "FAILED"; fi)\"
}
EOF"

echo "Summary saved: $RESULTS_DIR/summary-$TIMESTAMP.json"
echo ""

# Print results
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All $TOTAL test suite(s) passed!${NC}"
else
    echo -e "${RED}$FAILED of $TOTAL test suite(s) failed${NC}"
    exit 1
fi

echo ""
echo -e "${CYAN}Test results are available in:${NC}"
echo -e "  ${YELLOW}test-results/agents/${NC}"
echo -e "  See ${YELLOW}test-results/README.md${NC} for navigation guide"
