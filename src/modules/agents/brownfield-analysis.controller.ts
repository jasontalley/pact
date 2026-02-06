import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { BrownfieldAnalysisService } from './brownfield-analysis.service';
import { BrownfieldAnalysisDto, BrownfieldAnalysisResult } from './dto/brownfield-analysis.dto';

@ApiTags('agents')
@Controller('agents/brownfield-analysis')
export class BrownfieldAnalysisController {
  constructor(private readonly brownfieldAnalysisService: BrownfieldAnalysisService) {}

  @Post('analyze')
  @ApiOperation({
    summary: 'Analyze repository to infer intent atoms from orphan tests',
    description:
      'Analyzes a repository (code + documentation) to discover orphan tests (tests without @atom annotations) and infer intent atoms from them. Uses LangGraph for multi-step reasoning and is visible in LangSmith Studio for refinement.',
  })
  @ApiBody({ type: BrownfieldAnalysisDto })
  @ApiResponse({
    status: 200,
    description: 'Repository analyzed successfully',
    type: BrownfieldAnalysisResult,
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 500, description: 'Analysis failed' })
  async analyze(@Body() dto: BrownfieldAnalysisDto): Promise<BrownfieldAnalysisResult> {
    return this.brownfieldAnalysisService.analyzeRepository(dto);
  }
}
