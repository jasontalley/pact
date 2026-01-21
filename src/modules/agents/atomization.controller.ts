import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { AtomizationService } from './atomization.service';
import { AtomizeIntentDto, AtomizationResult } from './dto/atomize-intent.dto';

@ApiTags('agents')
@Controller('agents/atomization')
export class AtomizationController {
  constructor(private readonly atomizationService: AtomizationService) {}

  @Post('atomize')
  @ApiOperation({
    summary: 'Atomize raw intent into structured atoms',
    description:
      'Analyzes raw intent text and returns atomization results including atomicity assessment, category detection, and suggested atom structure.',
  })
  @ApiBody({ type: AtomizeIntentDto })
  @ApiResponse({
    status: 201,
    description: 'Intent atomized successfully',
    type: AtomizationResult,
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 503, description: 'LLM service unavailable' })
  async atomize(@Body() atomizeDto: AtomizeIntentDto): Promise<AtomizationResult> {
    return this.atomizationService.atomize(atomizeDto);
  }
}
