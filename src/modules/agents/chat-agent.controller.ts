/**
 * Chat Agent Controller
 *
 * REST API endpoints for the conversational agent interface.
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ChatAgentService } from './chat-agent.service';
import { ChatRequestDto, ChatResponseDto, ExportChatDto } from './dto/chat-agent.dto';

@ApiTags('agents')
@Controller('agents/chat')
export class ChatAgentController {
  constructor(private readonly chatAgentService: ChatAgentService) {}

  /**
   * POST /agents/chat
   * Send a message to the chat agent
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send a message to the Pact chat agent',
    description:
      'Conversational interface for interacting with Pact agents. The agent can analyze intents, search atoms, suggest refinements, and more.',
  })
  @ApiResponse({
    status: 200,
    description: 'Chat response with optional tool calls and suggestions',
    type: ChatResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 500, description: 'Chat processing failed' })
  async chat(@Body() request: ChatRequestDto): Promise<ChatResponseDto> {
    return this.chatAgentService.chat(request);
  }

  /**
   * GET /agents/chat/sessions/:sessionId
   * Get session details (for debugging/admin)
   */
  @Get('sessions/:sessionId')
  @ApiOperation({
    summary: 'Get chat session details',
    description: 'Retrieve information about a chat session including message history.',
  })
  @ApiParam({ name: 'sessionId', description: 'Chat session ID' })
  @ApiResponse({ status: 200, description: 'Session details' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  getSession(@Param('sessionId') sessionId: string) {
    const session = this.chatAgentService.getSession(sessionId);
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    return {
      id: session.id,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
      messageCount: session.messages.length,
      messages: session.messages,
    };
  }

  /**
   * GET /agents/chat/sessions/:sessionId/export
   * Export session as markdown
   */
  @Get('sessions/:sessionId/export')
  @ApiOperation({
    summary: 'Export chat session as markdown',
    description: 'Export a chat session to markdown format for documentation or sharing.',
  })
  @ApiParam({ name: 'sessionId', description: 'Chat session ID' })
  @ApiQuery({ name: 'format', required: false, enum: ['markdown', 'json'] })
  @ApiResponse({ status: 200, description: 'Exported chat session' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  exportSession(
    @Param('sessionId') sessionId: string,
    @Query('format') format: 'markdown' | 'json' = 'markdown',
  ) {
    const session = this.chatAgentService.getSession(sessionId);
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    if (format === 'json') {
      return {
        id: session.id,
        createdAt: session.createdAt,
        lastActivityAt: session.lastActivityAt,
        messages: session.messages,
        context: session.context,
      };
    }

    return {
      content: this.chatAgentService.exportSessionAsMarkdown(sessionId),
      contentType: 'text/markdown',
    };
  }
}
