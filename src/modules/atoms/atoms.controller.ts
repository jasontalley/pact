import { Controller, Get, Post, Body, Param, Patch } from '@nestjs/common';
import { AtomsService } from './atoms.service';
import { CreateAtomDto } from './dto/create-atom.dto';
import { Atom } from './atom.entity';

@Controller('atoms')
export class AtomsController {
  constructor(private readonly atomsService: AtomsService) {}

  @Post()
  create(@Body() createAtomDto: CreateAtomDto): Promise<Atom> {
    return this.atomsService.create(createAtomDto);
  }

  @Get()
  findAll(): Promise<Atom[]> {
    return this.atomsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<Atom> {
    return this.atomsService.findOne(id);
  }

  @Patch(':id/commit')
  commit(@Param('id') id: string): Promise<Atom> {
    return this.atomsService.commit(id);
  }

  @Patch(':id/supersede')
  supersede(@Param('id') id: string, @Body('newAtomId') newAtomId: string): Promise<Atom> {
    return this.atomsService.supersede(id, newAtomId);
  }
}
