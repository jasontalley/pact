'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { SkipForward, Send } from 'lucide-react';

interface ClarificationQuestionCardProps {
  question: {
    id: string;
    question: string;
    category: string;
    rationale?: string;
  };
  onAnswer: (questionId: string, response: string) => void;
  onSkip: (questionId: string) => void;
  disabled?: boolean;
}

export function ClarificationQuestionCard({
  question,
  onAnswer,
  onSkip,
  disabled = false,
}: ClarificationQuestionCardProps) {
  const [response, setResponse] = useState('');

  const handleSubmit = () => {
    if (response.trim()) {
      onAnswer(question.id, response.trim());
      setResponse('');
    }
  };

  return (
    <Card className="border-blue-200 dark:border-blue-800">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">
            {question.question}
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {question.category}
          </Badge>
        </div>
        {question.rationale && (
          <p className="text-xs text-muted-foreground mt-1">
            {question.rationale}
          </p>
        )}
      </CardHeader>
      <CardContent>
        <Textarea
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          placeholder="Your answer..."
          className="mb-2 min-h-[60px]"
          disabled={disabled}
        />
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSkip(question.id)}
            disabled={disabled}
          >
            <SkipForward className="h-4 w-4 mr-1" />
            Skip
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={disabled || !response.trim()}
          >
            <Send className="h-4 w-4 mr-1" />
            Answer
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
