'use client';

import { useState, useRef, useEffect } from 'react';
import {
  useInterview,
  InterviewMessage,
  InterviewPhase,
} from '@/hooks/interview/use-interview';
import { ClarificationQuestionCard } from './ClarificationQuestionCard';
import { AtomPreview } from './AtomPreview';
import { MoleculePreview } from './MoleculePreview';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Send,
  Loader2,
  RotateCcw,
  MessageSquare,
  Bot,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const phaseLabels: Record<InterviewPhase, string> = {
  idle: 'Ready',
  analyzing: 'Analyzing',
  clarifying: 'Clarifying',
  extracting: 'Extracting',
  complete: 'Complete',
  error: 'Error',
};

const phaseColors: Record<InterviewPhase, string> = {
  idle: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  analyzing:
    'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  clarifying:
    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  extracting:
    'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  complete:
    'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  error: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

export function InterviewChat() {
  const {
    phase,
    messages,
    pendingQuestions,
    startInterview,
    submitAnswers,
    isLoading,
    reset,
  } = useInterview();

  const [input, setInput] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleStart = () => {
    if (input.trim()) {
      startInterview(input.trim());
      setInput('');
    }
  };

  const handleAnswer = (questionId: string, response: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: response }));
  };

  const handleSkip = (questionId: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: 'skip' }));
  };

  const handleSubmitAnswers = () => {
    const answerList = Object.entries(answers).map(
      ([questionId, response]) => ({
        questionId,
        response,
      }),
    );
    if (answerList.length > 0) {
      submitAnswers(answerList);
      setAnswers({});
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && phase === 'idle') {
      e.preventDefault();
      handleStart();
    }
  };

  const renderMessage = (msg: InterviewMessage) => {
    const isUser = msg.role === 'user';
    const isSystem = msg.role === 'system';

    return (
      <div
        key={msg.id}
        className={cn(
          'flex gap-3 mb-4',
          isUser ? 'justify-end' : 'justify-start',
        )}
      >
        {!isUser && (
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Bot className="h-4 w-4 text-primary" />
          </div>
        )}
        <div
          className={cn(
            'max-w-[80%] rounded-lg px-4 py-3',
            isUser
              ? 'bg-primary text-primary-foreground'
              : isSystem
                ? 'bg-red-100 dark:bg-red-900/30 text-red-900 dark:text-red-100'
                : 'bg-muted',
          )}
        >
          {msg.type === 'text' && (
            <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
          )}
          {msg.type === 'questions' && (
            <div className="space-y-2">
              <p className="text-sm mb-2">{msg.content}</p>
            </div>
          )}
          {msg.type === 'atoms' && (
            <div className="space-y-2">
              <p className="text-sm mb-2">{msg.content}</p>
              {(
                msg.data as Array<{
                  description: string;
                  category: string;
                  observableOutcomes?: string[];
                  confidence?: number;
                }>
              )?.map((atom, i) => (
                <AtomPreview key={i} atom={atom} />
              ))}
            </div>
          )}
          {msg.type === 'molecules' && (
            <div className="space-y-2">
              <p className="text-sm mb-2">{msg.content}</p>
              {(
                msg.data as Array<{
                  name: string;
                  description: string;
                  lensType: string;
                  atomIndices: number[];
                }>
              )?.map((mol, i) => (
                <MoleculePreview
                  key={i}
                  molecule={mol}
                  atomCount={
                    (
                      messages.find((m) => m.type === 'atoms')
                        ?.data as unknown[]
                    )?.length ?? 0
                  }
                />
              ))}
            </div>
          )}
        </div>
        {isUser && (
          <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center shrink-0">
            <User className="h-4 w-4 text-primary-foreground" />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <MessageSquare className="h-5 w-5" />
          <h2 className="font-semibold">Intent Interview</h2>
          <Badge className={cn('text-xs', phaseColors[phase])}>
            {phaseLabels[phase]}
          </Badge>
        </div>
        {phase !== 'idle' && (
          <Button variant="outline" size="sm" onClick={reset}>
            <RotateCcw className="h-4 w-4 mr-1" />
            New Interview
          </Button>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="text-center text-muted-foreground py-12">
            <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium mb-2">Start an Interview</p>
            <p className="text-sm max-w-md mx-auto">
              Describe what you want to build. The interview agent will ask
              clarifying questions to extract precise intent atoms.
            </p>
          </div>
        )}
        {messages.map(renderMessage)}

        {/* Pending questions inline */}
        {phase === 'clarifying' && pendingQuestions.length > 0 && (
          <div className="space-y-3 mt-4">
            {pendingQuestions.map((q) => (
              <ClarificationQuestionCard
                key={q.id}
                question={q}
                onAnswer={handleAnswer}
                onSkip={handleSkip}
                disabled={isLoading}
              />
            ))}
            <div className="flex justify-end">
              <Button
                onClick={handleSubmitAnswers}
                disabled={
                  isLoading || Object.keys(answers).length === 0
                }
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-1" />
                )}
                Submit Answers ({Object.keys(answers).length}/
                {pendingQuestions.length})
              </Button>
            </div>
          </div>
        )}

        {isLoading && phase === 'analyzing' && (
          <div className="flex items-center gap-2 text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Analyzing intent...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      {phase === 'idle' && (
        <div className="p-4 border-t">
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe what you want to build..."
              className="min-h-[60px] resize-none"
              disabled={isLoading}
            />
            <Button
              onClick={handleStart}
              disabled={isLoading || !input.trim()}
              className="self-end"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
