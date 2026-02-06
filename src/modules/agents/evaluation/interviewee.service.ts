/**
 * Interviewee Service
 *
 * LLM-based interviewee for stochastic interview evaluation.
 * Wraps Haiku to play the role of a stakeholder answering
 * interview agent questions, guided by ground truth facts
 * and a persona configuration.
 */

import { LLMService } from '../../../common/llm/llm.service';
import { AgentTaskType } from '../../../common/llm/providers/types';
import { InterviewQuestion, ConversationTurn } from '../graphs/types/interview-state';
import {
  GroundTruthFact,
  IntervieweePersona,
} from '../../../../test/fixtures/agents/intent-interview/stochastic-schema';

export interface IntervieweeContext {
  domain: string;
  constraints?: string[];
  persona?: string;
}

/**
 * Stateless service that generates interviewee responses
 * based on ground truth facts and persona configuration.
 */
export class IntervieweeService {
  constructor(private readonly llmService: LLMService) {}

  /**
   * Generate a response to interview questions as the stakeholder.
   */
  async respond(
    questions: InterviewQuestion[],
    groundTruth: GroundTruthFact[],
    persona: IntervieweePersona,
    context: IntervieweeContext,
    conversationHistory: ConversationTurn[],
    round: number,
    maxRounds: number,
  ): Promise<{ content: string; signalsDone: boolean }> {
    const systemPrompt = this.buildSystemPrompt(groundTruth, persona, context);
    const userPrompt = this.buildUserPrompt(questions, conversationHistory, round, maxRounds);

    const response = await this.llmService.invoke({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      agentName: 'interview-interviewee',
      purpose: 'Simulate stakeholder answering interview questions',
      taskType: AgentTaskType.CHAT,
      preferredModel: 'claude-haiku-4-5',
      preferredProvider: 'anthropic',
      temperature: 0.7,
      maxTokens: 1024,
      useCache: false, // Never cache interviewee responses — stochastic tests need variance
    });

    const content = response.content || '';
    const signalsDone = this.detectDone(content, round, maxRounds);

    return { content, signalsDone };
  }

  private buildSystemPrompt(
    groundTruth: GroundTruthFact[],
    persona: IntervieweePersona,
    context: IntervieweeContext,
  ): string {
    const decidedFacts = groundTruth.filter((f) => f.isDecided);
    const undecidedFacts = groundTruth.filter((f) => !f.isDecided);

    const factsSection = decidedFacts.map((f) => `- ${f.fact}`).join('\n');

    const undecidedSection =
      undecidedFacts.length > 0 ? undecidedFacts.map((f) => `- ${f.fact}`).join('\n') : 'None';

    const constraintsSection = context.constraints?.length
      ? context.constraints.map((c) => `- ${c}`).join('\n')
      : 'None specified';

    return `You are a ${persona.style} ${context.persona || 'stakeholder'} working on: ${context.domain}

## What you know (decided requirements — share when asked):
${factsSection}

## Topics NOT yet decided (say "we haven't decided that yet" or "that's still TBD"):
${undecidedSection}

## Project constraints:
${constraintsSection}

## Communication rules:
- ${persona.styleInstructions}
- Answer ONLY what is asked. Do not volunteer information unprompted.
- Keep answers grounded in the facts above. Do not invent new requirements.
- If asked about something not in your facts, say you're not sure or it hasn't been discussed.
- When you've shared all relevant decided facts, signal you're done by saying something like "I think that covers everything" or "that's all I have for now".
- Be natural — you're a real stakeholder, not a test fixture.`;
  }

  private buildUserPrompt(
    questions: InterviewQuestion[],
    conversationHistory: ConversationTurn[],
    round: number,
    maxRounds: number,
  ): string {
    const questionsText = questions.map((q, i) => `${i + 1}. ${q.question}`).join('\n');

    const historyText =
      conversationHistory.length > 0
        ? conversationHistory
            .slice(-6) // Last 3 turns (3 assistant + 3 user)
            .map((t) => `${t.role === 'assistant' ? 'Interviewer' : 'You'}: ${t.content}`)
            .join('\n\n')
        : '';

    const parts = [
      `Round ${round} of ${maxRounds}.`,
      historyText ? `Previous conversation:\n${historyText}` : '',
      `The interviewer asks:\n${questionsText}`,
      'Respond naturally, addressing the questions above.',
    ];

    return parts.filter(Boolean).join('\n\n');
  }

  /**
   * Detect if the interviewee is signaling they're done.
   * Check both explicit phrases and round proximity to max.
   */
  private detectDone(content: string, round: number, maxRounds: number): boolean {
    const text = content.toLowerCase();

    // Explicit done signals
    const donePatterns = [
      /that covers (it|everything)/,
      /that's (all|everything)/,
      /nothing else/,
      /i think (that's it|we're done|we covered)/,
      /no more (questions|topics|items)/,
      /we've covered everything/,
      /that should be (it|enough|sufficient)/,
    ];

    if (donePatterns.some((p) => p.test(text))) {
      return true;
    }

    // If at or past penultimate round, signal done
    if (round >= maxRounds - 1) {
      return true;
    }

    return false;
  }
}
