/**
 * Chat Agent DTOs
 *
 * Data transfer objects for the conversational agent interface.
 */

import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsObject,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Tool call made by the agent
 */
export class ToolCallDto {
  @ApiProperty({ description: 'Unique identifier for this tool call' })
  id: string;

  @ApiProperty({ description: 'Name of the tool being called' })
  name: string;

  @ApiProperty({ description: 'Arguments passed to the tool' })
  arguments: Record<string, unknown>;
}

/**
 * Result from a tool execution
 */
export class ToolResultDto {
  @ApiProperty({ description: 'ID of the tool call this result is for' })
  toolCallId: string;

  @ApiProperty({ description: 'Name of the tool' })
  name: string;

  @ApiProperty({ description: 'Result of the tool execution' })
  result: unknown;

  @ApiProperty({ description: 'Whether the tool executed successfully' })
  success: boolean;
}

/**
 * Chat request DTO
 */
export class ChatRequestDto {
  @ApiProperty({
    description: 'User message',
    example: 'Analyze this intent: Users can reset their password',
  })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiPropertyOptional({
    description: 'Session ID for multi-turn conversations',
    example: 'session-123',
  })
  @IsString()
  @IsOptional()
  sessionId?: string;

  @ApiPropertyOptional({
    description: 'Additional context for the conversation',
    example: { atomId: 'IA-001' },
  })
  @IsObject()
  @IsOptional()
  context?: Record<string, unknown>;
}

/**
 * Chat response DTO
 */
export class ChatResponseDto {
  @ApiProperty({ description: 'Session ID for continuing the conversation' })
  sessionId: string;

  @ApiProperty({ description: 'Assistant message' })
  message: string;

  @ApiPropertyOptional({ description: 'Tools called by the assistant', type: [ToolCallDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ToolCallDto)
  @IsOptional()
  toolCalls?: ToolCallDto[];

  @ApiPropertyOptional({ description: 'Results from tool executions', type: [ToolResultDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ToolResultDto)
  @IsOptional()
  toolResults?: ToolResultDto[];

  @ApiPropertyOptional({
    description: 'Suggested follow-up actions',
    type: [String],
    example: ['View atom details', 'Refine this atom'],
  })
  @IsArray()
  @IsOptional()
  suggestedActions?: string[];
}

/**
 * Chat session entity (for history)
 */
export class ChatSessionDto {
  @ApiProperty({ description: 'Session ID' })
  id: string;

  @ApiProperty({ description: 'Session creation time' })
  createdAt: Date;

  @ApiProperty({ description: 'Last activity time' })
  lastActivityAt: Date;

  @ApiProperty({ description: 'Number of messages in session' })
  messageCount: number;

  @ApiPropertyOptional({ description: 'Session title (auto-generated)' })
  title?: string;
}

/**
 * Export conversation request
 */
export class ExportChatDto {
  @ApiProperty({ description: 'Session ID to export' })
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @ApiPropertyOptional({
    description: 'Export format',
    enum: ['markdown', 'json'],
    default: 'markdown',
  })
  @IsString()
  @IsOptional()
  format?: 'markdown' | 'json';
}
