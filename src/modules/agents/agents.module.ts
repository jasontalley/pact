import { Module, forwardRef, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AtomizationController } from './atomization.controller';
import { AtomizationService } from './atomization.service';
import { BrownfieldAnalysisController } from './brownfield-analysis.controller';
import { BrownfieldAnalysisService } from './brownfield-analysis.service';
import { ChatAgentController } from './chat-agent.controller';
import { ChatAgentService } from './chat-agent.service';
import { AtomQualityService } from '../validators/atom-quality.service';
import { TestAtomCouplingService } from './test-atom-coupling.service';
import { AtomicityCheckerService } from './atomicity-checker.service';
import { IntentRefinementService } from './intent-refinement.service';
import { CommitmentAgentService } from './commitment-agent.service';
import { ContextBuilderService } from './context-builder.service';
import { Atom } from '../atoms/atom.entity';
import { AgentAction } from './agent-action.entity';
import { AtomsModule } from '../atoms/atoms.module';
import { CommitmentsModule } from '../commitments/commitments.module';
import { InvariantsModule } from '../invariants/invariants.module';
import { ToolRegistryService } from './tools/tool-registry.service';
import { AtomToolsService } from './tools/atom-tools.service';
import { ATOM_TOOLS } from './tools/atom-tools.definitions';

@Module({
  imports: [
    TypeOrmModule.forFeature([Atom, AgentAction]),
    forwardRef(() => AtomsModule),
    forwardRef(() => CommitmentsModule),
    InvariantsModule,
  ],
  controllers: [AtomizationController, BrownfieldAnalysisController, ChatAgentController],
  providers: [
    AtomizationService,
    BrownfieldAnalysisService,
    ChatAgentService,
    ContextBuilderService,
    AtomQualityService,
    TestAtomCouplingService,
    AtomicityCheckerService,
    IntentRefinementService,
    CommitmentAgentService,
    ToolRegistryService,
    AtomToolsService,
  ],
  exports: [
    AtomizationService,
    BrownfieldAnalysisService,
    ChatAgentService,
    AtomQualityService,
    TestAtomCouplingService,
    AtomicityCheckerService,
    IntentRefinementService,
    CommitmentAgentService,
    ToolRegistryService,
  ],
})
export class AgentsModule implements OnModuleInit {
  constructor(
    private readonly toolRegistry: ToolRegistryService,
    private readonly atomTools: AtomToolsService,
  ) {}

  onModuleInit() {
    // Register all atom tools with the registry
    for (const toolDef of ATOM_TOOLS) {
      this.toolRegistry.registerTool(toolDef, this.atomTools);
    }
  }
}
