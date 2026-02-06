import { apiClient } from './client';

export interface InterviewStartResponse {
  sessionId: string;
  conversationId: string;
  questions: Array<{
    id: string;
    question: string;
    category: string;
    rationale?: string;
  }>;
  analysis: {
    summary: string;
    ambiguities: string[];
    impliedBehaviors: string[];
  } | null;
}

export interface InterviewAnswerResponse {
  sessionId: string;
  status: 'waiting_for_answers' | 'completed';
  questions?: Array<{
    id: string;
    question: string;
    category: string;
  }>;
  result?: {
    atoms: Array<{
      description: string;
      category: string;
      observableOutcomes: string[];
      confidence: number;
    }>;
    molecules: Array<{
      name: string;
      description: string;
      lensType: string;
      atomIndices: number[];
    }>;
    output: string;
  };
}

export const interviewApi = {
  start: async (rawIntent: string): Promise<InterviewStartResponse> => {
    const response = await apiClient.post<InterviewStartResponse>(
      '/agents/interview/start',
      { rawIntent },
    );
    return response.data;
  },

  submitAnswers: async (
    sessionId: string,
    answers: Array<{ questionId: string; response: string }>,
  ): Promise<InterviewAnswerResponse> => {
    const response = await apiClient.post<InterviewAnswerResponse>(
      `/agents/interview/${sessionId}/answers`,
      { answers },
    );
    return response.data;
  },
};
