/**
 * Interview Controller
 *
 * REST API endpoints for the Intent Interview Agent.
 * Manages multi-turn interview sessions for intent extraction.
 */

import { Controller, Post, Get, Body, Param, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiParam } from '@nestjs/swagger';
import { IsString, IsArray, ValidateNested, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { InterviewService, InterviewStartResult, InterviewAnswerResult } from './interview.service';

// ── DTOs ──────────────────────────────────────────────────────────────

class StartInterviewDto {
  @IsString()
  @IsNotEmpty()
  rawIntent: string;
}

class AnswerDto {
  @IsString()
  @IsNotEmpty()
  questionId: string;

  @IsString()
  @IsNotEmpty()
  response: string;
}

class SubmitAnswersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerDto)
  answers: AnswerDto[];
}

// ── Controller ────────────────────────────────────────────────────────

@ApiTags('Interview Agent')
@Controller('agents/interview')
export class InterviewController {
  private readonly logger = new Logger(InterviewController.name);

  constructor(private readonly interviewService: InterviewService) {}

  @Post('start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start a new interview session' })
  @ApiBody({ type: StartInterviewDto })
  @ApiResponse({ status: 200, description: 'Interview session started with initial questions' })
  async start(@Body() dto: StartInterviewDto): Promise<InterviewStartResult> {
    this.logger.log(`Starting interview for: "${dto.rawIntent.slice(0, 80)}..."`);
    return this.interviewService.startInterview(dto.rawIntent);
  }

  @Post(':sessionId/answers')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit answers to interview questions' })
  @ApiParam({ name: 'sessionId', description: 'Interview session ID' })
  @ApiBody({ type: SubmitAnswersDto })
  @ApiResponse({
    status: 200,
    description: 'Answers processed, may return more questions or final result',
  })
  async submitAnswers(
    @Param('sessionId') sessionId: string,
    @Body() dto: SubmitAnswersDto,
  ): Promise<InterviewAnswerResult> {
    this.logger.log(`Submitting ${dto.answers.length} answers for session ${sessionId}`);
    return this.interviewService.submitAnswers(sessionId, dto.answers);
  }

  @Get('sessions')
  @ApiOperation({ summary: 'List active interview sessions' })
  @ApiResponse({ status: 200, description: 'List of active sessions' })
  listSessions() {
    return this.interviewService.listSessions();
  }

  @Get(':sessionId')
  @ApiOperation({ summary: 'Get interview session status' })
  @ApiParam({ name: 'sessionId', description: 'Interview session ID' })
  @ApiResponse({ status: 200, description: 'Session details' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  getSession(@Param('sessionId') sessionId: string) {
    const session = this.interviewService.getSession(sessionId);
    if (!session) {
      return { error: 'Session not found', statusCode: 404 };
    }
    return session;
  }
}
