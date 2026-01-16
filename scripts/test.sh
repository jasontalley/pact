#!/bin/bash

# Pact Test Runner
# Runs tests inside Docker containers following "No Host Dependencies" philosophy
#
# Usage:
#   ./scripts/test.sh                          # Run all tests
#   ./scripts/test.sh --watch                  # Run in watch mode
#   ./scripts/test.sh --file atomization       # Run specific test file
#   ./scripts/test.sh --coverage               # Run with coverage
#   ./scripts/test.sh --e2e                    # Run E2E tests
#   ./scripts/test.sh --ci                     # Run full CI test suite
#   ./scripts/test.sh --quality                # Run test quality analyzer
#   ./scripts/test.sh --coupling               # Run test-atom coupling analysis

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
TEST_COMMAND="npm test -- --no-coverage"
CONTAINER_NAME="pact-app"
USE_APP_CONTAINER=true
WATCH_MODE=false

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --watch)
      WATCH_MODE=true
      USE_APP_CONTAINER=false
      CONTAINER_NAME="pact-test"
      shift
      ;;
    --file)
      TEST_FILE="$2"
      TEST_COMMAND="npm test -- --testPathPattern=$TEST_FILE --no-coverage"
      USE_APP_CONTAINER=true
      CONTAINER_NAME="pact-app"
      shift 2
      ;;
    --coverage)
      TEST_COMMAND="npm run test:cov"
      USE_APP_CONTAINER=true
      CONTAINER_NAME="pact-app"
      shift
      ;;
    --e2e)
      TEST_COMMAND="NODE_ENV=test npm run test:e2e"
      USE_APP_CONTAINER=true
      CONTAINER_NAME="pact-app"
      shift
      ;;
    --ci)
      TEST_COMMAND="npm run test:cov && NODE_ENV=test npm run test:e2e"
      USE_APP_CONTAINER=true
      CONTAINER_NAME="pact-app"
      shift
      ;;
    --quality)
      TEST_COMMAND="npm run test:quality"
      USE_APP_CONTAINER=true
      CONTAINER_NAME="pact-app"
      shift
      ;;
    --coupling)
      TEST_COMMAND="npm run test:coupling"
      USE_APP_CONTAINER=true
      CONTAINER_NAME="pact-app"
      shift
      ;;
    --bdd)
      TEST_COMMAND="npm run test:bdd"
      USE_APP_CONTAINER=true
      CONTAINER_NAME="pact-app"
      shift
      ;;
    --help)
      echo "Pact Test Runner - Docker-based test execution"
      echo ""
      echo "Usage: ./scripts/test.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --watch              Run tests in watch mode"
      echo "  --file <name>        Run specific test file (pattern match)"
      echo "  --coverage           Run tests with coverage report"
      echo "  --e2e                Run end-to-end tests"
      echo "  --ci                 Run full CI test suite (unit + e2e + coverage)"
      echo "  --quality            Run test quality analyzer"
      echo "  --coupling           Run test-atom coupling analysis"
      echo "  --bdd                Run BDD/Cucumber tests"
      echo "  --help               Show this help message"
      echo ""
      echo "Examples:"
      echo "  ./scripts/test.sh                          # Run all unit tests"
      echo "  ./scripts/test.sh --watch                  # Watch mode"
      echo "  ./scripts/test.sh --file atomization       # Run atomization tests"
      echo "  ./scripts/test.sh --coverage               # With coverage"
      echo "  ./scripts/test.sh --ci                     # Full CI suite"
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

echo -e "${BLUE}=== Pact Test Runner ===${NC}"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo -e "${RED}Error: Docker is not running${NC}"
  echo "Please start Docker and try again"
  exit 1
fi

# Function to start containers if not running
ensure_containers_running() {
  echo -e "${YELLOW}Checking container status...${NC}"

  # Check if postgres is running
  if ! docker ps | grep -q pact-postgres; then
    echo -e "${YELLOW}Starting PostgreSQL...${NC}"
    docker-compose up -d postgres

    # Wait for postgres to be healthy
    echo -e "${YELLOW}Waiting for PostgreSQL to be ready...${NC}"
    sleep 2  # Give container time to start
    RETRIES=30
    until docker exec pact-postgres pg_isready -U pact > /dev/null 2>&1; do
      RETRIES=$((RETRIES - 1))
      if [ $RETRIES -eq 0 ]; then
        echo -e "${RED}PostgreSQL failed to start${NC}"
        echo -e "${RED}Check logs with: docker-compose logs postgres${NC}"
        exit 1
      fi
      sleep 2
    done
    echo -e "${GREEN}PostgreSQL is ready${NC}"
  fi

  # Start Redis if needed (for LLM service tests)
  if ! docker ps | grep -q pact-redis; then
    echo -e "${YELLOW}Starting Redis...${NC}"
    docker-compose up -d redis
    sleep 2
  fi

  # Handle test container vs app container
  # Strategy:
  # - Watch mode: Use dedicated test container (designed for interactive watch)
  # - All other modes: Use app container (stays running reliably)
  if [ "$USE_APP_CONTAINER" = true ]; then
    if ! docker ps | grep -q pact-app; then
      echo -e "${YELLOW}Starting app container...${NC}"
      docker-compose up -d app
      sleep 3
    fi
  else
    # Watch mode: Use test container
    if ! docker ps | grep -q pact-test; then
      echo -e "${YELLOW}Starting test container for watch mode...${NC}"
      docker-compose up -d test
      sleep 3
    fi
  fi

  echo -e "${GREEN}Containers are running${NC}"
  echo ""
}

# Function to run tests
run_tests() {
  echo -e "${BLUE}Running: ${TEST_COMMAND}${NC}"
  echo ""

  if [ "$WATCH_MODE" = true ]; then
    echo -e "${YELLOW}Starting watch mode (Ctrl+C to exit)...${NC}"
    echo ""
    # Stop the test container if it's running, then restart it in attached mode
    docker-compose stop test > /dev/null 2>&1
    docker-compose run --rm test npm run test:watch
  else
    # Use -i (not -it) to avoid TTY requirement in CI environments
    docker exec -i $CONTAINER_NAME sh -c "$TEST_COMMAND"
  fi

  TEST_EXIT_CODE=$?

  echo ""
  if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✓ Tests passed${NC}"
  else
    echo -e "${RED}✗ Tests failed${NC}"
    exit $TEST_EXIT_CODE
  fi
}

# Main execution
ensure_containers_running
run_tests

echo ""
echo -e "${BLUE}=== Test run complete ===${NC}"
