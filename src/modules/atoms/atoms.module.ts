import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AtomsController } from './atoms.controller';
import { AtomsService } from './atoms.service';
import { AtomsRepository } from './atoms.repository';
import { Atom } from './atom.entity';
import { AgentsModule } from '../agents/agents.module';

@Module({
  imports: [TypeOrmModule.forFeature([Atom]), forwardRef(() => AgentsModule)],
  controllers: [AtomsController],
  providers: [AtomsService, AtomsRepository],
  exports: [AtomsService, AtomsRepository],
})
export class AtomsModule {}
