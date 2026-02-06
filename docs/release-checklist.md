# Release Checklist

Use this checklist when preparing a new Pact release.

---

## Pre-Release Checklist

### Code Quality

- [ ] All tests passing on develop branch
  ```bash
  docker exec pact-app npm test
  docker exec pact-app npm run test:e2e
  ```

- [ ] Test coverage meets minimum threshold (≥80%)
  ```bash
  docker exec pact-app npm run test:cov
  ```

- [ ] No linting errors
  ```bash
  docker exec pact-app npm run lint
  ```

- [ ] No critical security vulnerabilities
  ```bash
  npm audit --audit-level=high
  ```

### Dependencies

- [ ] Dependencies reviewed and updated
  ```bash
  npm outdated
  npm update  # Update non-breaking
  ```

- [ ] Security vulnerabilities addressed
  ```bash
  npm audit fix
  npm audit fix --force  # If needed, review breaking changes
  ```

- [ ] Package-lock.json committed

### Documentation

- [ ] CHANGELOG.md updated with release notes
  - Added features documented
  - Breaking changes clearly marked
  - Security fixes listed
  - Migration guide provided (if needed)

- [ ] Version bumped in package.json
  ```bash
  # Manually edit package.json "version" field
  # Or use: npm version <major|minor|patch>
  ```

- [ ] README.md up to date
  - Features reflect current capabilities
  - Installation instructions accurate
  - Links working

- [ ] Deployment guide updated (if infrastructure changed)

- [ ] API documentation generated
  ```bash
  # Swagger docs auto-generated from code
  # Verify at http://localhost:3000/api
  ```

### Database

- [ ] Migration scripts tested
  ```bash
  # Test fresh database → latest schema
  docker-compose down -v
  docker-compose up -d postgres
  docker exec pact-app npm run migration:run
  docker exec pact-app npm run migration:show
  ```

- [ ] Rollback tested (if applicable)
  ```bash
  docker exec pact-app npm run migration:revert
  ```

- [ ] Data integrity verified (for existing databases)

### Configuration

- [ ] .env.production.example updated with new variables

- [ ] docker-compose.prod.yml reflects infrastructure changes

- [ ] Dockerfile builds successfully
  ```bash
  docker build -t pact:test .
  ```

---

## Release Process

### 1. Prepare Release Branch

```bash
# Ensure develop is up to date
git checkout develop
git pull origin develop

# Create release commit
git add .
git commit -m "chore: Prepare v0.X.Y release

- Update CHANGELOG.md
- Bump version to 0.X.Y
- Update documentation
"
```

### 2. Merge to Main

```bash
# Switch to main and merge develop
git checkout main
git pull origin main
git merge develop --no-ff -m "Merge develop into main for v0.X.Y release"
```

### 3. Create Git Tag

```bash
# Tag the release
git tag -a v0.X.Y -m "Release v0.X.Y - <Short Description>

<Detailed release notes or reference to CHANGELOG>
"

# Verify tag
git tag -l v0.X.Y
git show v0.X.Y
```

### 4. Push to Remote

```bash
# Push main branch
git push origin main

# Push tag (this triggers GitHub Actions release workflow)
git push origin v0.X.Y
```

### 5. Monitor Release Workflow

- [ ] GitHub Actions workflow started
  - Check at: `https://github.com/<org>/pact/actions`

- [ ] Build and test job passed
  - Unit tests passed
  - E2E tests passed
  - Migrations ran successfully

- [ ] Docker build and push job passed
  - Image pushed to Docker Hub
  - Both `latest` and `v0.X.Y` tags created

- [ ] GitHub Release created automatically
  - Release notes extracted from CHANGELOG
  - Assets attached (if any)

### 6. Verify Release Artifacts

- [ ] Docker image available on Docker Hub
  ```bash
  docker pull <dockerhub-user>/pact:0.X.Y
  docker run --rm <dockerhub-user>/pact:0.X.Y node --version
  ```

- [ ] GitHub Release published
  - Visit: `https://github.com/<org>/pact/releases/tag/v0.X.Y`
  - Verify release notes
  - Download and test artifacts

### 7. Test Deployment from Release

```bash
# Test production deployment from released Docker image
mkdir -p /tmp/pact-release-test
cd /tmp/pact-release-test

# Copy production files
cp <pact-repo>/.env.production.example .env.production
cp <pact-repo>/docker-compose.prod.yml .

# Edit .env.production with test values
nano .env.production

# Start services
docker-compose -f docker-compose.prod.yml --env-file .env.production up -d

# Run migrations
docker-compose -f docker-compose.prod.yml exec app npm run migration:run

# Verify health
curl http://localhost:3000/health

# Clean up
docker-compose -f docker-compose.prod.yml down -v
```

### 8. Sync Branches

```bash
# Merge main back to develop (to sync version bump, tags)
git checkout develop
git merge main --no-ff -m "Merge main back to develop after v0.X.Y release"
git push origin develop
```

---

## Post-Release Checklist

### Verification

- [ ] Production deployment successful (if applicable)
- [ ] Health checks passing
  ```bash
  curl https://your-domain.com/health
  ```

- [ ] Database migrations applied cleanly
- [ ] No errors in application logs

### Communication

- [ ] Announce release (if applicable)
  - Internal team notification
  - Blog post (if significant release)
  - Social media / community forums
  - Update project status badges

- [ ] Update project documentation links
  - Wiki / documentation site
  - README badges (version, build status)

### Monitoring

- [ ] Monitor for issues in first 24-48 hours
  - Application logs
  - Error tracking (Sentry, etc.)
  - Performance metrics
  - User feedback

- [ ] Watch for reported issues
  - GitHub Issues
  - Support channels

### Housekeeping

- [ ] Archive release branch (if using release branches)
- [ ] Update project milestone/roadmap
- [ ] Create next milestone (v0.X.Y+1)
- [ ] Close completed issues/PRs related to release

---

## Rollback Plan

If critical issues are discovered after release:

### Option 1: Hotfix Release

For minor issues that can be quickly fixed:

```bash
# Create hotfix branch from tag
git checkout -b hotfix/v0.X.Y+1 v0.X.Y

# Make fixes
# ... edit files ...

# Commit fixes
git commit -am "fix: <Issue description>"

# Bump patch version
# Edit package.json: 0.X.Y → 0.X.Y+1

# Merge to main and tag
git checkout main
git merge hotfix/v0.X.Y+1 --no-ff
git tag -a v0.X.Y+1 -m "Hotfix v0.X.Y+1"
git push origin main
git push origin v0.X.Y+1

# Merge back to develop
git checkout develop
git merge hotfix/v0.X.Y+1
git push origin develop
```

### Option 2: Revert Tag

For critical issues requiring immediate rollback:

```bash
# Delete tag locally
git tag -d v0.X.Y

# Delete tag remotely
git push origin :refs/tags/v0.X.Y

# Delete GitHub Release (via web UI or gh CLI)
gh release delete v0.X.Y

# Revert commits on main
git checkout main
git revert <commit-hash>
git push origin main
```

### Option 3: Mark as Deprecated

For less critical issues, mark release as deprecated in GitHub:

- Edit GitHub Release
- Mark as "Pre-release" or add deprecation notice
- Point users to fixed version

---

## Release Types

### Major Release (X.0.0)

- Breaking changes
- Significant architectural changes
- API changes requiring client updates
- **Requires**: Migration guide, deprecation notices, upgrade path

### Minor Release (0.X.0)

- New features
- Non-breaking enhancements
- New APIs (backward compatible)
- **Requires**: Feature documentation, API docs update

### Patch Release (0.0.X)

- Bug fixes
- Security patches
- Performance improvements
- **Requires**: Fix descriptions, affected versions

---

## Version Numbering

Pact follows [Semantic Versioning](https://semver.org/):

**Given a version number MAJOR.MINOR.PATCH**:

- **MAJOR**: Incompatible API changes
- **MINOR**: Backward-compatible functionality additions
- **PATCH**: Backward-compatible bug fixes

**Pre-release versions**:
- `0.1.0-alpha.1` - Alpha releases (internal testing)
- `0.1.0-beta.1` - Beta releases (external testing)
- `0.1.0-rc.1` - Release candidates (final testing)

---

## GitHub Secrets Required

For automated releases, ensure these secrets are configured in GitHub repository settings:

- `DOCKER_USERNAME` - Docker Hub username
- `DOCKER_PASSWORD` - Docker Hub access token
- `CODECOV_TOKEN` - Codecov upload token (optional)

**Setup**:
1. Go to `https://github.com/<org>/pact/settings/secrets/actions`
2. Add each secret with "New repository secret"

---

## Troubleshooting

### Release Workflow Failed

**Check GitHub Actions logs**:
- Visit: `https://github.com/<org>/pact/actions`
- Click on failed workflow
- Review job logs

**Common issues**:
- Test failures → Fix tests, re-tag
- Docker login failed → Check DOCKER_USERNAME/DOCKER_PASSWORD secrets
- Migration failed → Review migration scripts

### Docker Image Not Pushed

```bash
# Check Docker Hub
docker search <dockerhub-user>/pact

# Verify workflow completed docker-build-and-push job
# Check GitHub Actions logs

# Manual push (if needed)
docker login
docker build -t <dockerhub-user>/pact:0.X.Y .
docker push <dockerhub-user>/pact:0.X.Y
```

### Tag Already Exists

```bash
# Delete and recreate tag
git tag -d v0.X.Y
git push origin :refs/tags/v0.X.Y
git tag -a v0.X.Y -m "Release v0.X.Y"
git push origin v0.X.Y
```

---

## Template: Release Announcement

```markdown
# Pact v0.X.Y Released 🚀

We're excited to announce Pact v0.X.Y!

## Highlights

- **Feature 1**: Brief description
- **Feature 2**: Brief description
- **Security**: Fixed X vulnerabilities

## Breaking Changes

None / List changes here

## Upgrade Guide

```bash
# Docker deployment
docker pull <dockerhub-user>/pact:0.X.Y
docker-compose -f docker-compose.prod.yml up -d

# Run migrations
docker-compose -f docker-compose.prod.yml exec app npm run migration:run
```

## Full Changelog

See [CHANGELOG.md](https://github.com/<org>/pact/blob/main/CHANGELOG.md)

## Resources

- [Release Notes](https://github.com/<org>/pact/releases/tag/v0.X.Y)
- [Documentation](https://github.com/<org>/pact/blob/main/README.md)
- [Deployment Guide](https://github.com/<org>/pact/blob/main/docs/deployment-guide.md)
```

---

**Document Version**: 1.0.0
**Last Updated**: 2026-02-06
