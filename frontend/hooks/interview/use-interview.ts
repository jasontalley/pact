'use client';

import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  interviewApi,
  InterviewStartResponse,
} from '@/lib/api/interview';
import { toast } from 'sonner';

export type InterviewPhase =
  | 'idle'
  | 'analyzing'
  | 'clarifying'
  | 'extracting'
  | 'complete'
  | 'error';

export interface InterviewMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  type: 'text' | 'questions' | 'atoms' | 'molecules';
  data?: unknown;
  timestamp: Date;
}

export function useInterview() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [phase, setPhase] = useState<InterviewPhase>('idle');
  const [messages, setMessages] = useState<InterviewMessage[]>([]);
  const [pendingQuestions, setPendingQuestions] = useState<
    InterviewStartResponse['questions']
  >([]);

  const addMessage = useCallback(
    (msg: Omit<InterviewMessage, 'id' | 'timestamp'>) => {
      setMessages((prev) => [
        ...prev,
        {
          ...msg,
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          timestamp: new Date(),
        },
      ]);
    },
    [],
  );

  const startMutation = useMutation({
    mutationFn: (rawIntent: string) => interviewApi.start(rawIntent),
    onMutate: (rawIntent) => {
      setPhase('analyzing');
      addMessage({ role: 'user', content: rawIntent, type: 'text' });
    },
    onSuccess: (data) => {
      setSessionId(data.sessionId);
      if (data.questions.length > 0) {
        setPhase('clarifying');
        setPendingQuestions(data.questions);
        addMessage({
          role: 'assistant',
          content:
            'I have some clarifying questions to better understand your intent:',
          type: 'questions',
          data: data.questions,
        });
      } else {
        setPhase('complete');
        addMessage({
          role: 'assistant',
          content:
            'Intent analysis complete. No further clarification needed.',
          type: 'text',
        });
      }
    },
    onError: (error: Error) => {
      setPhase('error');
      toast.error(`Failed to start interview: ${error.message}`);
      addMessage({
        role: 'system',
        content: `Error: ${error.message}`,
        type: 'text',
      });
    },
  });

  const answerMutation = useMutation({
    mutationFn: (answers: Array<{ questionId: string; response: string }>) => {
      if (!sessionId) throw new Error('No active session');
      return interviewApi.submitAnswers(sessionId, answers);
    },
    onMutate: (answers) => {
      setPhase('analyzing');
      const answersText = answers
        .map((a) => {
          const q = pendingQuestions.find(
            (pq) => pq.id === a.questionId,
          );
          return `Q: ${q?.question || a.questionId}\nA: ${a.response}`;
        })
        .join('\n\n');
      addMessage({ role: 'user', content: answersText, type: 'text' });
    },
    onSuccess: (data) => {
      if (data.status === 'waiting_for_answers' && data.questions) {
        setPhase('clarifying');
        setPendingQuestions(data.questions);
        addMessage({
          role: 'assistant',
          content: 'Follow-up questions:',
          type: 'questions',
          data: data.questions,
        });
      } else if (data.status === 'completed' && data.result) {
        setPhase('complete');
        if (data.result.atoms.length > 0) {
          addMessage({
            role: 'assistant',
            content: `Extracted ${data.result.atoms.length} atom(s):`,
            type: 'atoms',
            data: data.result.atoms,
          });
        }
        if (data.result.molecules.length > 0) {
          addMessage({
            role: 'assistant',
            content: `Suggested ${data.result.molecules.length} molecule grouping(s):`,
            type: 'molecules',
            data: data.result.molecules,
          });
        }
        addMessage({
          role: 'assistant',
          content: data.result.output,
          type: 'text',
        });
      }
    },
    onError: (error: Error) => {
      setPhase('error');
      toast.error(`Failed to submit answers: ${error.message}`);
    },
  });

  const reset = useCallback(() => {
    setSessionId(null);
    setPhase('idle');
    setMessages([]);
    setPendingQuestions([]);
  }, []);

  return {
    sessionId,
    phase,
    messages,
    pendingQuestions,
    startInterview: startMutation.mutate,
    submitAnswers: answerMutation.mutate,
    isLoading: startMutation.isPending || answerMutation.isPending,
    reset,
  };
}
