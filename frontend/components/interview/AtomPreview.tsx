'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Target } from 'lucide-react';

interface AtomPreviewProps {
  atom: {
    description: string;
    category: string;
    observableOutcomes?: string[];
    confidence?: number;
  };
}

export function AtomPreview({ atom }: AtomPreviewProps) {
  return (
    <Card className="border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Draft Atom</CardTitle>
          <div className="flex gap-2">
            <Badge variant="outline">{atom.category}</Badge>
            {atom.confidence != null && (
              <Badge
                variant={atom.confidence >= 80 ? 'default' : 'secondary'}
              >
                {atom.confidence}%
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm">{atom.description}</p>
        {atom.observableOutcomes && atom.observableOutcomes.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">
              <Target className="h-3 w-3 inline mr-1" />
              Observable Outcomes
            </p>
            <ul className="space-y-1">
              {atom.observableOutcomes.map((outcome, i) => (
                <li key={i} className="text-xs flex items-start gap-1">
                  <CheckCircle className="h-3 w-3 text-green-500 mt-0.5 shrink-0" />
                  {outcome}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
