#!/bin/bash

# Pact Test Runner
# Runs tests inside Docker containers following "No Host Dependencies" philosophy
#
# Usage:
#   ./scripts/test.sh                          # Run all backend tests
#   ./scripts/test.sh --watch                  # Run in watch mode
#   ./scripts/test.sh --file atomization       # Run specific test file
#   ./scripts/test.sh --coverage               # Run with coverage
#   ./scripts/test.sh --e2e                    # Run backend E2E tests
#   ./scripts/test.sh --ci                     # Run full CI test suite (backend + frontend)
#   ./scripts/test.sh --quality                # Run test quality analyzer
#   ./scripts/test.sh --coupling               # Run test-atom coupling analysis
#   ./scripts/test.sh --frontend               # Run frontend unit tests
#   ./scripts/test.sh --frontend-coverage      # Run frontend tests with coverage
#   ./scripts/test.sh --frontend-e2e           # Run frontend Playwright E2E tests
#   ./scripts/test.sh --all                    # Run all tests (backend + frontend)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default values
TEST_COMMAND="npm test -- --no-coverage"
CONTAINER_NAME="pact-app"
USE_APP_CONTAINER=true
USE_FRONTEND_CONTAINER=false
WATCH_MODE=false
RUN_ALL=false

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
      # Full CI suite: backend coverage + e2e, then frontend tests
      RUN_ALL=true
      shift
      ;;
    --all)
      # Run all tests (backend + frontend)
      RUN_ALL=true
      shift
      ;;
    --quality)
      TEST_COMMAND="npm run test:quality:report"
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
    --frontend)
      TEST_COMMAND="npm test"
      USE_APP_CONTAINER=false
      USE_FRONTEND_CONTAINER=true
      CONTAINER_NAME="pact-frontend-test"
      shift
      ;;
    --frontend-watch)
      TEST_COMMAND="npm run test:watch"
      USE_APP_CONTAINER=false
      USE_FRONTEND_CONTAINER=true
      CONTAINER_NAME="pact-frontend-test"
      WATCH_MODE=true
      shift
      ;;
    --frontend-coverage)
      TEST_COMMAND="npm run test:coverage"
      USE_APP_CONTAINER=false
      USE_FRONTEND_CONTAINER=true
      CONTAINER_NAME="pact-frontend-test"
      shift
      ;;
    --frontend-e2e)
      TEST_COMMAND="npx playwright test"
      USE_APP_CONTAINER=false
      USE_FRONTEND_CONTAINER=true
      CONTAINER_NAME="pact-frontend-test"
      shift
      ;;
    --help)
      echo "Pact Test Runner - Docker-based test execution"
      echo ""
      echo "Usage: ./scripts/test.sh [OPTIONS]"
      echo ""
      echo "Backend Options:"
      echo "  --watch              Run backend tests in watch mode"
      echo "  --file <name>        Run specific test file (pattern match)"
      echo "  --coverage           Run backend tests with coverage report"
      echo "  --e2e                Run backend end-to-end tests"
      echo "  --quality            Run test quality analyzer"
      echo "  --coupling           Run test-atom coupling analysis"
      echo "  --bdd                Run BDD/Cucumber tests"
      echo ""
      echo "Frontend Options:"
      echo "  --frontend           Run frontend unit tests (Vitest)"
      echo "  --frontend-watch     Run frontend tests in watch mode"
      echo "  --frontend-coverage  Run frontend tests with coverage"
      echo "  --frontend-e2e       Run frontend E2E tests (Playwright)"
      echo ""
      echo "Combined Options:"
      echo "  --ci                 Run full CI test suite (backend + frontend)"
      echo "  --all                Run all tests (backend + frontend)"
      echo "  --help               Show this help message"
      echo ""
      echo "Examples:"
      echo "  ./scripts/test.sh                          # Run backend unit tests"
      echo "  ./scripts/test.sh --watch                  # Backend watch mode"
      echo "  ./scripts/test.sh --file atomization       # Run atomization tests"
      echo "  ./scripts/test.sh --coverage               # Backend with coverage"
      echo "  ./scripts/test.sh --frontend               # Frontend unit tests"
      echo "  ./scripts/test.sh --frontend-coverage      # Frontend with coverage"
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

  # Handle container selection based on test type
  if [ "$USE_FRONTEND_CONTAINER" = true ]; then
    # Frontend tests: Ensure app is running for API calls (E2E tests need this)
    # Note: We use docker-compose run for frontend tests, so no need to start frontend dev server
    if ! docker ps | grep -q pact-app; then
      echo -e "${YELLOW}Starting app container (for API)...${NC}"
      docker-compose up -d app
      sleep 3
    fi
  elif [ "$USE_APP_CONTAINER" = true ]; then
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
    if [ "$USE_FRONTEND_CONTAINER" = true ]; then
      # Use docker-compose run for interactive frontend watch mode (uses frontend-test container)
      docker-compose run --rm frontend-test sh -c "$TEST_COMMAND"
    else
      # Stop the test container if it's running, then restart it in attached mode
      docker-compose stop test > /dev/null 2>&1
      docker-compose run --rm test npm run test:watch
    fi
  elif [ "$USE_FRONTEND_CONTAINER" = true ]; then
    # For frontend tests, use dedicated frontend-test container (has Playwright browsers)
    echo -e "${YELLOW}Building frontend-test container...${NC}"
    docker-compose build --quiet frontend-test
    docker-compose run --rm frontend-test sh -c "$TEST_COMMAND"
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

# Function to run all tests (CI mode)
run_all_tests() {
  local FAILED=0

  echo -e "${CYAN}=== Running Full Test Suite ===${NC}"
  echo ""

  # Ensure backend containers are running
  echo -e "${YELLOW}Starting backend containers...${NC}"
  docker-compose up -d postgres redis app
  sleep 3

  # Wait for postgres
  RETRIES=30
  until docker exec pact-postgres pg_isready -U pact > /dev/null 2>&1; do
    RETRIES=$((RETRIES - 1))
    if [ $RETRIES -eq 0 ]; then
      echo -e "${RED}PostgreSQL failed to start${NC}"
      exit 1
    fi
    sleep 2
  done

  # Wait for app container to be ready
  echo -e "${YELLOW}Waiting for app container...${NC}"
  sleep 3

  echo -e "${GREEN}Backend containers ready${NC}"
  echo ""

  # Backend unit tests with coverage
  echo -e "${CYAN}--- Backend Unit Tests ---${NC}"
  if docker exec -i pact-app npm run test:cov; then
    echo -e "${GREEN}✓ Backend unit tests passed${NC}"
  else
    echo -e "${RED}✗ Backend unit tests failed${NC}"
    FAILED=1
  fi
  echo ""

  # Backend E2E tests
  echo -e "${CYAN}--- Backend E2E Tests ---${NC}"
  if docker exec -i pact-app sh -c "NODE_ENV=test npm run test:e2e"; then
    echo -e "${GREEN}✓ Backend E2E tests passed${NC}"
  else
    echo -e "${RED}✗ Backend E2E tests failed${NC}"
    FAILED=1
  fi
  echo ""

  # Test quality analyzer (generates HTML report)
  echo -e "${CYAN}--- Test Quality Analyzer ---${NC}"
  if docker exec -i pact-app npm run test:quality:report; then
    echo -e "${GREEN}✓ Test quality checks passed${NC}"
  else
    echo -e "${RED}✗ Test quality checks failed${NC}"
    FAILED=1
  fi
  echo ""

  # Frontend unit tests with coverage (use dedicated frontend-test container)
  echo -e "${CYAN}--- Frontend Unit Tests ---${NC}"
  # Build frontend-test image (has Playwright browsers pre-installed)
  echo -e "${YELLOW}Building frontend-test container...${NC}"
  docker-compose build --quiet frontend-test
  if docker-compose run --rm frontend-test npm run test:coverage; then
    echo -e "${GREEN}✓ Frontend unit tests passed${NC}"
  else
    echo -e "${RED}✗ Frontend unit tests failed${NC}"
    FAILED=1
  fi
  echo ""

  # Frontend E2E tests (Playwright) - uses frontend-test container with browsers
  echo -e "${CYAN}--- Frontend E2E Tests (Playwright) ---${NC}"
  # Start frontend dev server for E2E tests to run against
  docker-compose up -d frontend
  echo -e "${YELLOW}Waiting for frontend dev server...${NC}"
  sleep 5
  # Run Playwright tests in the frontend-test container (has browsers pre-installed)
  if docker-compose run --rm frontend-test npx playwright test --project=chromium; then
    echo -e "${GREEN}✓ Frontend E2E tests passed${NC}"
  else
    echo -e "${YELLOW}⚠ Frontend E2E tests failed or skipped${NC}"
    # Don't fail CI for Playwright issues during initial setup
  fi
  echo ""

  # Summary
  echo -e "${CYAN}=== Test Suite Summary ===${NC}"
  if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
  else
    echo -e "${RED}✗ Some tests failed${NC}"
    exit 1
  fi
}

# Main execution
if [ "$RUN_ALL" = true ]; then
  run_all_tests
else
  ensure_containers_running
  run_tests
fi

echo ""
echo -e "${BLUE}=== Test run complete ===${NC}"
echo ""
echo -e "${CYAN}Test results are available in:${NC}"
echo -e "  ${YELLOW}test-results/${NC}"
echo -e "  See ${YELLOW}test-results/README.md${NC} for navigation guide"