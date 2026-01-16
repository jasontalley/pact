import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AtomizationController } from './atomization.controller';
import { AtomizationService } from './atomization.service';
import { AtomQualityService } from '../validators/atom-quality.service';
import { TestAtomCouplingService } from './test-atom-coupling.service';
import { AtomicityCheckerService } from './atomicity-checker.service';
import { IntentRefinementService } from './intent-refinement.service';
import { Atom } from '../atoms/atom.entity';
import { AgentAction } from './agent-action.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Atom, AgentAction])],
  controllers: [AtomizationController],
  providers: [
    AtomizationService,
    AtomQualityService,
    TestAtomCouplingService,
    AtomicityCheckerService,
    IntentRefinementService,
  ],
  exports: [
    AtomizationService,
    AtomQualityService,
    TestAtomCouplingService,
    AtomicityCheckerService,
    IntentRefinementService,
  ],
})
export class AgentsModule {}
