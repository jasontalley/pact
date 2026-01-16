import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Atom } from '../atoms/atom.entity';
import { AgentAction } from './agent-action.entity';
import { AtomizeIntentDto, AtomizationAnalysis, AtomizationResult } from './dto/atomize-intent.dto';
import { LLMService } from '../../common/llm/llm.service';
import { AtomQualityService } from '../validators/atom-quality.service';

@Injectable()
export class AtomizationService {
  private readonly logger = new Logger(AtomizationService.name);
  private readonly confidenceThreshold: number;
  private readonly qualityGatingEnabled: boolean;

  constructor(
    @InjectRepository(Atom)
    private atomRepository: Repository<Atom>,
    @InjectRepository(AgentAction)
    private agentActionRepository: Repository<AgentAction>,
    private configService: ConfigService,
    private readonly llmService: LLMService,
    private readonly atomQualityService: AtomQualityService,
  ) {
    this.confidenceThreshold = parseFloat(
      this.configService.get<string>('LLM_CONFIDENCE_THRESHOLD_ATOMICITY', '0.7'),
    );
    this.qualityGatingEnabled =
      this.configService.get<string>('ATOM_QUALITY_GATING', 'true') === 'true';
  }

  async atomize(atomizeDto: AtomizeIntentDto): Promise<AtomizationResult> {
    const { intentDescription, category, createdBy } = atomizeDto;

    this.logger.log(`Analyzing intent for atomicity: "${intentDescription}"`);

    // Step 1: Analyze atomicity using LLM
    const analysis = await this.analyzeAtomicity(intentDescription);

    // Step 2: Log agent action
    await this.logAgentAction('atomize', atomizeDto, analysis);

    // Step 3: Check confidence threshold
    if (analysis.confidence < this.confidenceThreshold) {
      this.logger.warn(
        `Low confidence (${analysis.confidence}) below threshold (${this.confidenceThreshold})`,
      );

      return {
        success: false,
        confidence: analysis.confidence,
        analysis: `Unable to determine atomicity with confidence. ${analysis.reasoning}`,
        message: 'Confidence too low. Please clarify the intent or provide more context.',
      };
    }

    // Step 4: Check if atomic
    if (!analysis.isAtomic) {
      this.logger.log('Intent is not atomic, suggesting decomposition');

      return {
        success: false,
        confidence: analysis.confidence,
        analysis: `Intent is not atomic. ${analysis.reasoning}`,
        message: `This intent should be decomposed into smaller atoms: ${analysis.suggestedDecomposition?.join(', ')}`,
      };
    }

    // Step 5: Validate atom quality (if enabled)
    const resolvedCategory = category || analysis.category;
    if (this.qualityGatingEnabled) {
      const qualityResult = await this.atomQualityService.validateAtom({
        atomId: 'pending', // Will be assigned after creation
        description: intentDescription,
        category: resolvedCategory,
      });

      this.logger.log(
        `Quality validation: ${qualityResult.totalScore}/100 (${qualityResult.decision})`,
      );

      // Gate based on quality decision
      if (qualityResult.decision === 'reject') {
        return {
          success: false,
          confidence: analysis.confidence,
          analysis: analysis.reasoning,
          message: qualityResult.overallFeedback,
          qualityValidation: {
            totalScore: qualityResult.totalScore,
            decision: qualityResult.decision,
            overallFeedback: qualityResult.overallFeedback,
            actionableImprovements: qualityResult.actionableImprovements,
          },
        };
      }

      if (qualityResult.decision === 'revise') {
        // Create atom but mark as needs-revision
        const atom = await this.createAtom(
          intentDescription,
          resolvedCategory,
          createdBy,
          'needs-revision',
          qualityResult.totalScore,
        );

        this.logger.log(`Created atom ${atom.atomId} with needs-revision status`);

        return {
          success: true,
          atom: {
            id: atom.id,
            atomId: atom.atomId,
            description: atom.description,
            category: atom.category,
            status: atom.status,
            qualityScore: qualityResult.totalScore,
          },
          confidence: analysis.confidence,
          analysis: analysis.reasoning,
          message: qualityResult.overallFeedback,
          qualityValidation: {
            totalScore: qualityResult.totalScore,
            decision: qualityResult.decision,
            overallFeedback: qualityResult.overallFeedback,
            actionableImprovements: qualityResult.actionableImprovements,
          },
        };
      }

      // Quality approved - create atom with quality score
      const atom = await this.createAtom(
        intentDescription,
        resolvedCategory,
        createdBy,
        'draft',
        qualityResult.totalScore,
      );

      this.logger.log(`Successfully created high-quality atom ${atom.atomId}`);

      return {
        success: true,
        atom: {
          id: atom.id,
          atomId: atom.atomId,
          description: atom.description,
          category: atom.category,
          status: atom.status,
          qualityScore: qualityResult.totalScore,
        },
        confidence: analysis.confidence,
        analysis: analysis.reasoning,
        qualityValidation: {
          totalScore: qualityResult.totalScore,
          decision: qualityResult.decision,
          overallFeedback: qualityResult.overallFeedback,
          actionableImprovements: qualityResult.actionableImprovements,
        },
      };
    }

    // Quality gating disabled - create atom without validation
    const atom = await this.createAtom(intentDescription, resolvedCategory, createdBy);

    this.logger.log(`Successfully created atom ${atom.atomId}`);

    return {
      success: true,
      atom: {
        id: atom.id,
        atomId: atom.atomId,
        description: atom.description,
        category: atom.category,
        status: atom.status,
      },
      confidence: analysis.confidence,
      analysis: analysis.reasoning,
    };
  }

  private async analyzeAtomicity(intentDescription: string): Promise<AtomizationAnalysis> {
    const systemPrompt = `You are an expert at analyzing product intents for atomicity.
Evaluate intents based on three criteria:
1. Is this irreducible? (Cannot be decomposed further without losing meaning)
2. Is this behaviorally testable? (Observable and falsifiable)
3. Is this implementation-agnostic? (Describes WHAT, not HOW)

Respond in JSON format only.`;

    const userPrompt = `Analyze the following intent for atomicity:

Intent: "${intentDescription}"

Respond in JSON format:
{
  "isAtomic": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "explanation of why this is or isn't atomic",
  "category": "functional|performance|security|reliability|usability",
  "suggestedDecomposition": ["atom1", "atom2"] (only if not atomic)
}

Examples:
- "User authentication must complete within 2 seconds" -> isAtomic: true, category: performance
- "User can log in and view dashboard" -> isAtomic: false (two separate behaviors)
- "System should be fast" -> isAtomic: false (not testable, too vague)
- "Payment must process securely using TLS 1.3" -> isAtomic: false (includes HOW - TLS 1.3)
- "Payment transaction must be encrypted" -> isAtomic: true, category: security

Respond with ONLY the JSON, no additional text.`;

    try {
      const response = await this.llmService.invoke({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        agentName: 'atomization-agent',
        purpose: 'Analyze intent for atomicity',
        temperature: 0.2,
      });

      const content = response.content;

      // Extract JSON from response (LLM might wrap it in markdown)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in LLM response');
      }

      const analysis: AtomizationAnalysis = JSON.parse(jsonMatch[0]);

      // Validate response
      if (
        typeof analysis.isAtomic !== 'boolean' ||
        typeof analysis.confidence !== 'number' ||
        !analysis.reasoning ||
        !analysis.category
      ) {
        throw new Error('Invalid analysis structure from LLM');
      }

      this.logger.log(
        `LLM analysis complete: isAtomic=${analysis.isAtomic}, confidence=${analysis.confidence}, cost=$${response.cost.toFixed(4)}`,
      );

      return analysis;
    } catch (error) {
      this.logger.error(`Failed to analyze atomicity: ${error.message}`);

      // Return low-confidence result on error
      return {
        isAtomic: false,
        confidence: 0.0,
        reasoning: `Error analyzing intent: ${error.message}`,
        category: 'functional',
      };
    }
  }

  private async createAtom(
    description: string,
    category: string,
    createdBy?: string,
    status: string = 'draft',
    qualityScore?: number,
  ): Promise<Atom> {
    // Generate next atom ID
    const latestAtom = await this.atomRepository.findOne({
      where: {},
      order: { atomId: 'DESC' },
    });

    const nextId = latestAtom ? parseInt(latestAtom.atomId.split('-')[1]) + 1 : 1;
    const atomId = `IA-${String(nextId).padStart(3, '0')}`;

    // Create atom with specified status and quality score
    const atom = this.atomRepository.create({
      atomId,
      description,
      category,
      status,
      qualityScore: qualityScore || null,
      createdBy: createdBy || null,
      metadata: {
        source: 'atomization-agent',
      },
    });

    return this.atomRepository.save(atom);
  }

  private async logAgentAction(actionType: string, input: any, output: any): Promise<void> {
    try {
      const agentAction = this.agentActionRepository.create({
        agentName: 'atomization-agent',
        actionType,
        input,
        output,
        confidenceScore: output.confidence || null,
        humanApproved: null, // Will be set later if human reviews
      });

      await this.agentActionRepository.save(agentAction);
    } catch (error) {
      this.logger.error(`Failed to log agent action: ${error.message}`);
      // Don't fail the request if logging fails
    }
  }
}
