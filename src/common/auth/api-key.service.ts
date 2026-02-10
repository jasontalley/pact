import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes, createHash } from 'crypto';
import { ApiKey } from './api-key.entity';

/** Result of creating a new API key — includes the raw key (shown once) */
export interface CreateKeyResult {
  id: string;
  name: string;
  key: string;
  keyPrefix: string;
  createdAt: Date;
}

/** Safe API key info for listing (no hash or raw key) */
export interface ApiKeyInfo {
  id: string;
  name: string;
  keyPrefix: string;
  isActive: boolean;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name);

  constructor(
    @InjectRepository(ApiKey)
    private readonly apiKeyRepository: Repository<ApiKey>,
  ) {}

  /**
   * Generate a new API key.
   * The raw key is returned ONCE — it cannot be retrieved later.
   */
  async createKey(name: string): Promise<CreateKeyResult> {
    const rawKey = `pact_${randomBytes(32).toString('hex')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.substring(0, 12);

    const apiKey = this.apiKeyRepository.create({
      name,
      keyHash,
      keyPrefix,
      isActive: true,
    });

    const saved = await this.apiKeyRepository.save(apiKey);
    this.logger.log(`API key created: name="${name}", prefix=${keyPrefix}`);

    return {
      id: saved.id,
      name: saved.name,
      key: rawKey,
      keyPrefix,
      createdAt: saved.createdAt,
    };
  }

  /**
   * Validate an API key and update lastUsedAt.
   * Returns the ApiKey entity if valid, null otherwise.
   */
  async validateKey(rawKey: string): Promise<ApiKey | null> {
    if (!rawKey || !rawKey.startsWith('pact_')) {
      return null;
    }

    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const apiKey = await this.apiKeyRepository.findOne({
      where: { keyHash, isActive: true },
    });

    if (!apiKey) {
      return null;
    }

    // Update lastUsedAt (fire-and-forget, don't block the request)
    this.apiKeyRepository.update(apiKey.id, { lastUsedAt: new Date() }).catch((err) => {
      this.logger.warn(`Failed to update lastUsedAt for key ${apiKey.keyPrefix}: ${err.message}`);
    });

    return apiKey;
  }

  /**
   * List all API keys (safe info only — no hashes).
   */
  async listKeys(): Promise<ApiKeyInfo[]> {
    const keys = await this.apiKeyRepository.find({
      order: { createdAt: 'DESC' },
    });

    return keys.map((k) => ({
      id: k.id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      isActive: k.isActive,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt,
      revokedAt: k.revokedAt,
    }));
  }

  /**
   * Revoke an API key by ID.
   */
  async revokeKey(id: string): Promise<void> {
    await this.apiKeyRepository.update(id, {
      isActive: false,
      revokedAt: new Date(),
    });
    this.logger.log(`API key revoked: id=${id}`);
  }
}
