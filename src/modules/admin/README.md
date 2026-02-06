# Admin Module

Provides administrative configuration API for system-level settings.

## Overview

The admin module exposes endpoints for managing system configuration with a layered precedence model:

```
UI/Database Config > Environment Variables > Code Defaults
```

**Status**: Minimal implementation - controller only, no service layer yet.

## Configuration Controller

The `ConfigurationController` provides REST endpoints for managing configuration:

```typescript
// Planned endpoints
GET    /admin/config              // List all configurations
GET    /admin/config/:key         // Get specific config
PUT    /admin/config/:key         // Set config value
DELETE /admin/config/:key         // Reset to default
GET    /admin/config/effective    // Get effective config (with precedence)
```

## Configuration Precedence

1. **Database/UI Config** (highest priority)
   - Stored in database
   - Editable via admin API
   - Persists across restarts

2. **Environment Variables**
   - Set in `.env` or container environment
   - Useful for deployment configuration

3. **Code Defaults** (lowest priority)
   - Hardcoded in application
   - Always available as fallback

## Planned Configuration Keys

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `quality.threshold` | number | 80 | Default quality score required for commit |
| `quality.dimensions.observable.weight` | number | 0.25 | Weight for observable dimension |
| `llm.defaultProvider` | string | 'anthropic' | Default LLM provider |
| `llm.defaultModel` | string | 'claude-3-sonnet' | Default model |
| `reconciliation.batchSize` | number | 10 | Atoms to process in batch |
| `reconciliation.maxOrphans` | number | 100 | Max orphans before requiring path filter |
| `ui.theme` | string | 'dark' | Default UI theme |

## File Structure

```
admin/
├── admin.module.ts              # NestJS module
├── configuration.controller.ts  # REST API ✓
├── configuration.service.ts     # Business logic (TODO)
├── configuration.entity.ts      # DB entity (TODO)
└── dto/
    ├── set-config.dto.ts
    └── config-response.dto.ts
```

## Planned Entity: Configuration

```typescript
interface Configuration {
  id: string;
  key: string;           // Unique config key
  value: unknown;        // JSON-serializable value
  type: 'string' | 'number' | 'boolean' | 'json';
  description: string;
  updatedAt: Date;
  updatedBy: string;
}
```

## Planned Service Methods

```typescript
class ConfigurationService {
  // CRUD
  get<T>(key: string): Promise<T>;
  set<T>(key: string, value: T, updatedBy: string): Promise<void>;
  reset(key: string): Promise<void>;

  // Bulk operations
  getAll(): Promise<ConfigMap>;
  setMany(configs: ConfigUpdate[], updatedBy: string): Promise<void>;

  // Effective config (with precedence)
  getEffective(): Promise<ConfigMap>;

  // Metadata
  getSchema(): ConfigSchema[];  // All available keys with types/defaults
}
```

## Security Considerations

Admin endpoints should be protected:

```typescript
@Controller('admin')
@UseGuards(AdminAuthGuard)  // Require admin role
export class ConfigurationController {
  // ...
}
```

## Related Modules

- **llm** - LLM configuration management
- **projects** - Per-project settings override global config
- **invariants** - Invariant configuration

## Future Enhancements

Planned features:
- Configuration audit log
- Configuration export/import
- Environment-specific configs (dev/staging/prod)
- Configuration validation
- UI for configuration management
