import { Module, forwardRef, OnModuleInit } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AtomizationController } from './atomization.controller';
import { AtomizationService } from './atomization.service';
import { BrownfieldAnalysisController } from './brownfield-analysis.controller';
import { BrownfieldAnalysisService } from './brownfield-analysis.service';
import { ChatAgentController } from './chat-agent.controller';
import { ChatAgentService } from './chat-agent.service';
import { ReconciliationController } from './reconciliation.controller';
import { ManifestController } from './manifest.controller';
import { AtomQualityService } from '../validators/atom-quality.service';
import { TestAtomCouplingService } from './test-atom-coupling.service';
import { AtomicityCheckerService } from './atomicity-checker.service';
import { IntentRefinementService } from './intent-refinement.service';
import { CommitmentAgentService } from './commitment-agent.service';
import { ContextBuilderService } from './context-builder.service';
import { MoleculeVerifierService } from './molecule-verifier.service';
import { ReconciliationService } from './reconciliation.service';
import { InterviewService } from './interview.service';
import { ApplyService } from './apply.service';
import { Atom } from '../atoms/atom.entity';
import { Molecule } from '../molecules/molecule.entity';
import { MoleculeAtom } from '../molecules/molecule-atom.entity';
import { AgentAction } from './agent-action.entity';
import { ReconciliationRun } from './entities/reconciliation-run.entity';
import { AtomRecommendation } from './entities/atom-recommendation.entity';
import { MoleculeRecommendation } from './entities/molecule-recommendation.entity';
import { TestRecord } from './entities/test-record.entity';
import { ReconciliationRepository } from './repositories/reconciliation.repository';
import { AtomsModule } from '../atoms/atoms.module';
import { CommitmentsModule } from '../commitments/commitments.module';
import { InvariantsModule } from '../invariants/invariants.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { ToolRegistryService } from './tools/tool-registry.service';
import { AtomToolsService } from './tools/atom-tools.service';
import { ATOM_TOOLS } from './tools/atom-tools.definitions';
import { ReconciliationToolsService } from './tools/reconciliation-tools.service';
import { RECONCILIATION_TOOLS } from './tools/reconciliation-tools.definitions';
import { GraphRegistryService } from './graphs/graph-registry.service';
import { ReconciliationSchedulerService } from './reconciliation-scheduler.service';
import { ArtifactCaptureService } from './evaluation/artifact-capture.service';
import { AtomInferenceService } from './atom-inference.service';
import { ReconciliationAtomInferenceService } from './reconciliation-atom-inference.service';
import { CIPolicyService } from './ci-policy.service';
import { ReconciliationPolicy } from './entities/reconciliation-policy.entity';
import { RepoManifest } from './entities/repo-manifest.entity';
import { ManifestRepository } from './repositories/manifest.repository';
import { ManifestService } from './manifest.service';
import { CancellationRegistry } from '../../common/cancellation.registry';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Atom,
      AgentAction,
      Molecule,
      MoleculeAtom,
      ReconciliationRun,
      AtomRecommendation,
      MoleculeRecommendation,
      TestRecord,
      ReconciliationPolicy,
      RepoManifest,
    ]),
    ScheduleModule.forRoot(),
    forwardRef(() => AtomsModule),
    forwardRef(() => CommitmentsModule),
    InvariantsModule,
    ConversationsModule,
    ProjectsModule,
  ],
  controllers: [
    AtomizationController,
    BrownfieldAnalysisController,
    ChatAgentController,
    ReconciliationController,
    ManifestController,
  ],
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
    MoleculeVerifierService,
    ReconciliationService,
    InterviewService,
    ReconciliationRepository,
    ApplyService,
    ToolRegistryService,
    AtomToolsService,
    ReconciliationToolsService,
    GraphRegistryService,
    ReconciliationSchedulerService,
    ArtifactCaptureService,
    AtomInferenceService,
    ReconciliationAtomInferenceService,
    CIPolicyService,
    ManifestRepository,
    ManifestService,
    // String token alias so ModuleRef.get('ManifestService') works from other modules
    { provide: 'ManifestService', useExisting: ManifestService },
    CancellationRegistry,
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
    MoleculeVerifierService,
    ReconciliationService,
    InterviewService,
    ReconciliationRepository,
    ApplyService,
    ToolRegistryService,
    GraphRegistryService,
    ReconciliationSchedulerService,
    ArtifactCaptureService,
    AtomInferenceService,
    ReconciliationAtomInferenceService,
    ManifestRepository,
    ManifestService,
  ],
})
export class AgentsModule implements OnModuleInit {
  constructor(
    private readonly toolRegistry: ToolRegistryService,
    private readonly atomTools: AtomToolsService,
    private readonly reconciliationTools: ReconciliationToolsService,
  ) {}

  onModuleInit() {
    // Register all atom tools with the registry
    for (const toolDef of ATOM_TOOLS) {
      this.toolRegistry.registerTool(toolDef, this.atomTools);
    }

    // Register all reconciliation tools with the registry
    for (const toolDef of RECONCILIATION_TOOLS) {
      this.toolRegistry.registerTool(toolDef, this.reconciliationTools);
    }
  }
}
