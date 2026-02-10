import { Controller, Post, Get, Delete, Body, Param, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiKeyService, CreateKeyResult, ApiKeyInfo } from './api-key.service';

class CreateApiKeyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;
}

@ApiTags('admin/api-keys')
@Controller('admin/api-keys')
export class ApiKeyController {
  private readonly logger = new Logger(ApiKeyController.name);

  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new API key' })
  async create(@Body() dto: CreateApiKeyDto): Promise<CreateKeyResult> {
    const result = await this.apiKeyService.createKey(dto.name);
    this.logger.log(`API key created: name="${dto.name}", prefix=${result.keyPrefix}`);
    return result;
  }

  @Get()
  @ApiOperation({ summary: 'List all API keys' })
  async list(): Promise<ApiKeyInfo[]> {
    return this.apiKeyService.listKeys();
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke an API key' })
  async revoke(@Param('id') id: string): Promise<void> {
    await this.apiKeyService.revokeKey(id);
    this.logger.log(`API key revoked: id=${id}`);
  }
}
