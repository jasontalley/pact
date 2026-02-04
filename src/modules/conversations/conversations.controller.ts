import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ConversationsService } from './conversations.service';
import { Conversation } from './conversation.entity';
import { ConversationMessage } from './conversation-message.entity';

@ApiTags('conversations')
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new conversation' })
  @ApiResponse({ status: 201, description: 'Conversation created' })
  create(@Body('title') title?: string): Promise<Conversation> {
    return this.conversationsService.create(title);
  }

  @Get()
  @ApiOperation({ summary: 'List recent conversations' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'List of conversations' })
  getRecent(@Query('limit') limit?: string): Promise<Conversation[]> {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : 20;
    return this.conversationsService.getRecent(parsedLimit);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search conversations by title or message content' })
  @ApiQuery({ name: 'q', description: 'Search query', required: true })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'includeArchived', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Search results' })
  async search(
    @Query('q') query: string,
    @Query('limit') limit?: string,
    @Query('includeArchived') includeArchived?: string,
  ): Promise<Conversation[]> {
    return this.conversationsService.search(query, {
      limit: limit ? Number.parseInt(limit, 10) : undefined,
      includeArchived: includeArchived === 'true',
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get conversation by ID' })
  @ApiParam({ name: 'id', description: 'UUID of the conversation' })
  @ApiResponse({ status: 200, description: 'Conversation details' })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  findOne(@Param('id') id: string): Promise<Conversation> {
    return this.conversationsService.findById(id);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Get messages for a conversation' })
  @ApiParam({ name: 'id', description: 'UUID of the conversation' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'List of messages' })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  getMessages(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<ConversationMessage[]> {
    return this.conversationsService.getMessages(id, {
      limit: limit ? Number.parseInt(limit, 10) : undefined,
      offset: offset ? Number.parseInt(offset, 10) : undefined,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update conversation title' })
  @ApiParam({ name: 'id', description: 'UUID of the conversation' })
  @ApiResponse({ status: 200, description: 'Title updated' })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  async updateTitle(@Param('id') id: string, @Body('title') title: string): Promise<void> {
    return this.conversationsService.updateTitle(id, title);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Archive a conversation' })
  @ApiParam({ name: 'id', description: 'UUID of the conversation' })
  @ApiResponse({ status: 204, description: 'Conversation archived' })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  async archive(@Param('id') id: string): Promise<void> {
    return this.conversationsService.archive(id);
  }

  @Post(':id/compact')
  @ApiOperation({ summary: 'Compact conversation by summarizing old messages' })
  @ApiParam({ name: 'id', description: 'UUID of the conversation' })
  @ApiQuery({
    name: 'threshold',
    required: false,
    type: Number,
    description: 'Messages to keep (default: 50)',
  })
  @ApiResponse({ status: 200, description: 'Compaction result' })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  async compact(
    @Param('id') id: string,
    @Query('threshold') threshold?: string,
  ): Promise<{ summary: string }> {
    const thresholdNum = threshold ? Number.parseInt(threshold, 10) : undefined;
    const summary = await this.conversationsService.compactConversation(id, thresholdNum);
    return { summary };
  }

  @Get(':id/messages/compacted')
  @ApiOperation({ summary: 'Get messages with compaction-aware loading' })
  @ApiParam({ name: 'id', description: 'UUID of the conversation' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Summary and recent messages' })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  async getCompactedMessages(
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ): Promise<{ summary: string | null; messages: ConversationMessage[] }> {
    return this.conversationsService.getMessagesWithCompaction(id, {
      limit: limit ? Number.parseInt(limit, 10) : undefined,
    });
  }
}
