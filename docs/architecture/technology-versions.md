# Technology Stack and Version Selection

**Document Version**: 1.0.0
**Last Updated**: 2026-01-14
**Status**: Active

## Purpose

This document codifies the technology stack and version selection rationale for the Pact project. All version decisions must be documented here to ensure:

1. Security: Using actively maintained versions with security patches
2. Longevity: Selecting versions with long-term support
3. Compatibility: Ensuring all components work together
4. Maintainability: Using versions with good documentation and community support

## Version Selection Policy

### General Principles

1. **For Runtime Dependencies (Node.js, PostgreSQL)**: Use current LTS (Long Term Support) versions
2. **For Frameworks (NestJS)**: Use latest stable major version with minor updates
3. **For npm Packages**: Use latest stable versions, prioritizing:
   - Active maintenance (commits within last 6 months)
   - Security updates
   - Compatibility with our Node.js version
4. **For Docker Images**: Use specific version tags (never `latest`) with `-alpine` variants where available for smaller image sizes

### Verification Process

Before adding or updating any dependency:

1. Check official documentation for current stable/LTS version
2. Verify compatibility with our Node.js version
3. Check npm/GitHub for maintenance status (last commit, open issues, security advisories)
4. Document the decision in this file

## Core Runtime

### Node.js

**Selected Version**: 24.x (Krypton LTS)
**Rationale**:
- Node.js 24.x "Krypton" is the current LTS version as of January 2026
- Supported until April 2028
- Node.js 20.x (previously used) reaches end-of-life in April 2026
- LTS versions receive security updates and bug fixes

**Sources**:
- [Node.js Releases](https://nodejs.org/en/about/previous-releases)
- [Node.js 24.12.0 LTS Release](https://nodejs.org/en/blog/release/v24.12.0)
- [Node.js End-of-Life Dates](https://endoflife.date/nodejs)

**Docker Image**: `node:24-alpine`

### PostgreSQL

**Selected Version**: 18.x
**Current Patch Version**: 18.1
**Rationale**:
- PostgreSQL 18 is the latest major version
- Released November 2025
- Includes performance improvements and new features
- PostgreSQL 13 (oldest in support) is now end-of-life
- All versions 14-18 currently receive security updates

**Sources**:
- [PostgreSQL Release Notes](https://www.postgresql.org/docs/release/)
- [PostgreSQL 18.1 Release](https://www.postgresql.org/about/news/postgresql-181-177-1611-1515-1420-and-1323-released-3171/)
- [PostgreSQL Versioning Policy](https://www.postgresql.org/support/versioning/)

**Docker Image**: `postgres:18-alpine`

### Redis

**Selected Version**: 7.x
**Rationale**:
- Stable, well-tested version
- Used for LLM response caching
- Redis 7.0 introduced improvements to memory efficiency

**Docker Image**: `redis:7-alpine`

## Backend Framework

### NestJS

**Selected Version**: 11.1.x
**Current Version**: 11.1.11
**Rationale**:
- NestJS 11 is the latest major version
- Express v5 is now the default
- Improved performance with optimized module resolution
- Built-in JSON logging support
- New ParseDatePipe and IntrinsicException features
- Actively maintained with regular patch releases

**Related Packages**: All `@nestjs/*` packages should use version ^11.1.0

**Sources**:
- [NestJS Releases](https://github.com/nestjs/nest/releases)
- [Announcing NestJS 11](https://trilon.io/blog/announcing-nestjs-11-whats-new)
- [NestJS Migration Guide](https://docs.nestjs.com/migration-guide)

## Database & ORM

### TypeORM

**Selected Version**: ^0.3.20
**Rationale**:
- Mature, widely-used ORM for TypeScript
- Good NestJS integration via `@nestjs/typeorm`
- Active development and community support

### Database Driver

**Package**: `pg`
**Selected Version**: ^8.11.x
**Rationale**:
- Official PostgreSQL client for Node.js
- Well-maintained and reliable

## LLM Service Dependencies

### Circuit Breaker

**Package**: `opossum`
**Selected Version**: ^9.0.0
**Previous Version Used**: 8.1.3 (outdated)
**Rationale**:
- Version 9.0.0 is the latest stable release (published ~June 2025)
- Provides fail-fast circuit breaker pattern
- Actively maintained by Nodeshift community
- 170 projects in npm registry depend on it

**Sources**:
- [opossum on npm](https://www.npmjs.com/package/opossum)
- [opossum GitHub Repository](https://github.com/nodeshift/opossum)

### Retry Logic

**Package**: `p-retry`
**Selected Version**: ^7.1.1
**Previous Version Used**: 6.2.0 (outdated)
**Rationale**:
- Version 7.1.1 is the latest stable release
- Published recently (December 2025)
- Provides exponential backoff for promise-returning functions
- Maintained by Sindre Sorhus
- 1,676 projects in npm registry depend on it

**Sources**:
- [p-retry on npm](https://www.npmjs.com/package/p-retry)
- [p-retry GitHub Repository](https://github.com/sindresorhus/p-retry)

### Rate Limiting

**Package**: `rate-limiter-flexible`
**Selected Version**: ^5.0.0 (latest stable)
**Previous Selection**: `bottleneck` 2.19.5 (rejected)
**Rationale**:
- **Why not Bottleneck**: Last published 6 years ago (2019), unmaintained, no recent commits
- **Why rate-limiter-flexible**:
  - Actively maintained with recent updates
  - Supports Redis, memory, and other backends
  - Atomic operations for reliability
  - Handles high volumes efficiently
  - More downloads than bottleneck (6.8M vs 2.6M weekly)
  - Supports Redis Cluster and Sentinel
  - Better for complex rate limiting scenarios

**Sources**:
- [rate-limiter-flexible on npm](https://www.npmjs.com/package/rate-limiter-flexible)
- [rate-limiter-flexible GitHub](https://github.com/animir/node-rate-limiter-flexible)
- [Bottleneck maintenance status discussion](https://github.com/SGrondin/bottleneck/issues/207)

### Redis Client

**Package**: `ioredis`
**Selected Version**: ^5.9.1
**Previous Version Used**: 5.3.2 (outdated)
**Rationale**:
- Version 5.9.1 is the latest stable release (published January 2026)
- Robust, performance-focused Redis client
- Used by Alibaba and other major companies
- Active maintenance on best-effort basis
- Note: For new projects, `node-redis` is now recommended, but ioredis is still well-supported

**Sources**:
- [ioredis on npm](https://www.npmjs.com/package/ioredis)
- [ioredis GitHub Repository](https://github.com/redis/ioredis)
- [ioredis Documentation](https://ioredis.com/)

### UUID Generation

**Package**: `uuid`
**Selected Version**: ^10.0.0 (latest)
**Previous Version Used**: 9.0.1 (outdated)
**Rationale**:
- Standard UUID generation library
- Version 10.0.0 is the latest stable release
- Wide adoption and active maintenance

## LangChain

### Core Packages

**Packages**:
- `langchain`: ^0.3.x (check for latest)
- `@langchain/core`: ^0.3.x
- `@langchain/openai`: ^0.3.x

**Note**: LangChain versions were outdated (0.1.x was selected originally). Need to verify latest stable versions.

**Action Required**: Research and update to latest LangChain v0.3.x versions

## Testing

### Jest

**Selected Version**: ^29.7.x
**Rationale**:
- Industry standard testing framework
- Good TypeScript support
- Active development

### Cucumber

**Package**: `@cucumber/cucumber`
**Selected Version**: ^10.2.x
**Rationale**:
- BDD testing support
- Gherkin syntax for acceptance criteria

## Development Dependencies

### TypeScript

**Selected Version**: ^5.7.x (latest 5.x)
**Previous Version**: 5.3.3
**Rationale**:
- TypeScript 5.x is mature and stable
- Should use latest minor version for bug fixes and improvements

### ESLint & Prettier

**Selected Versions**:
- `eslint`: ^9.x (latest)
- `prettier`: ^3.x (latest)
- Related plugins at compatible versions

**Note**: Need to verify ESLint 9.x compatibility with current setup

## Update Schedule

### Security Updates
- **Frequency**: Immediately upon CVE disclosure
- **Process**: Review security advisories weekly, apply patches within 72 hours

### Minor Updates
- **Frequency**: Monthly
- **Process**: Update patch versions during maintenance windows

### Major Updates
- **Frequency**: Quarterly review
- **Process**:
  1. Review release notes
  2. Test in development environment
  3. Create migration plan if needed
  4. Update documentation
  5. Deploy to production

## Verification Commands

To verify current versions:

```bash
# Check Node.js version
node --version

# Check npm package versions
npm list --depth=0

# Check for outdated packages
npm outdated

# Security audit
npm audit
```

## Migration Notes

### From Node.js 20 to 24
- Update Dockerfile base image from `node:20-alpine` to `node:24-alpine`
- No code changes required (backward compatible)
- Test all TypeScript compilation and runtime behavior

### From PostgreSQL 16 to 18
- Update docker-compose.yml from `postgres:16-alpine` to `postgres:18-alpine`
- No schema changes required
- Performance improvements expected (query planning, indexing)

### From NestJS 10 to 11
- Review [NestJS migration guide](https://docs.nestjs.com/migration-guide)
- Express v5 is now default (may have breaking changes)
- Update all `@nestjs/*` packages to ^11.1.0
- Test all controllers, services, and middleware

### From bottleneck to rate-limiter-flexible
- Different API - requires code refactoring
- Update LLM service to use rate-limiter-flexible patterns
- Test rate limiting behavior under load

## Rejected Alternatives

### Bottleneck (for rate limiting)
- **Reason for Rejection**: Unmaintained since 2019, no recent commits, potential security concerns
- **Replacement**: rate-limiter-flexible

### Node.js 20.x
- **Reason for Rejection**: Reaches end-of-life April 2026 (3 months)
- **Replacement**: Node.js 24.x LTS

## References

All version selections are based on research conducted on 2026-01-14 using official documentation and npm registry data.

---

**Next Review Date**: 2026-04-14 (Quarterly)
**Document Owner**: @jasontalley
**Approved By**: [Pending]
