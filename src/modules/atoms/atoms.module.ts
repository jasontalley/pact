import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AtomsController } from './atoms.controller';
import { AtomsService } from './atoms.service';
import { AtomsRepository } from './atoms.repository';
import { Atom } from './atom.entity';
import { AgentsModule } from '../agents/agents.module';
import { ValidatorsModule } from '../validators/validators.module';
import { CommittedAtomGuard } from '../../common/guards/committed-atom.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Atom]),
    forwardRef(() => AgentsModule),
    forwardRef(() => ValidatorsModule),
  ],
  controllers: [AtomsController],
  providers: [AtomsService, AtomsRepository, CommittedAtomGuard],
  exports: [AtomsService, AtomsRepository, CommittedAtomGuard],
})
export class AtomsModule {}
