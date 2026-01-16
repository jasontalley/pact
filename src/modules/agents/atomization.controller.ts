import { Controller, Post, Body } from '@nestjs/common';
import { AtomizationService } from './atomization.service';
import { AtomizeIntentDto, AtomizationResult } from './dto/atomize-intent.dto';

@Controller('agents/atomization')
export class AtomizationController {
  constructor(private readonly atomizationService: AtomizationService) {}

  @Post('atomize')
  async atomize(@Body() atomizeDto: AtomizeIntentDto): Promise<AtomizationResult> {
    return this.atomizationService.atomize(atomizeDto);
  }
}
