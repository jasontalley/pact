'use client';

import { useQuery } from '@tanstack/react-query';
import { atomsApi, SemanticDiff } from '@/lib/api/atoms';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ArrowRight, Plus, Minus, RefreshCw, Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AtomDiffViewerProps {
  atomIdA: string;
  atomIdB: string;
}

const changeTypeColors: Record<string, string> = {
  expanded: 'text-green-600 dark:text-green-400',
  narrowed: 'text-yellow-600 dark:text-yellow-400',
  reframed: 'text-blue-600 dark:text-blue-400',
  unchanged: 'text-muted-foreground',
};

export function AtomDiffViewer({ atomIdA, atomIdB }: AtomDiffViewerProps) {
  const { data: diff, isLoading, error } = useQuery({
    queryKey: ['atoms', 'diff', atomIdA, atomIdB],
    queryFn: () => atomsApi.diff(atomIdA, atomIdB),
    enabled: !!atomIdA && !!atomIdB,
  });

  if (isLoading) return <div className="flex items-center justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (error || !diff) return <div className="text-destructive p-4">Failed to load diff</div>;

  return (
    <div className="space-y-4">
      {/* Overall Assessment */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Overall Assessment</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">{diff.overallAssessment}</p>
        </CardContent>
      </Card>

      {/* Description diff */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Description</CardTitle>
            <Badge variant="outline" className={cn(changeTypeColors[diff.descriptionDiff.changeType])}>
              {diff.descriptionDiff.changeType}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{diff.descriptionDiff.summary}</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-red-50 dark:bg-red-950/20 rounded-md">
              <p className="text-xs font-medium mb-1">{diff.atomA.atomId}</p>
              <p className="text-sm">{diff.atomA.description}</p>
            </div>
            <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-md">
              <p className="text-xs font-medium mb-1">{diff.atomB.atomId}</p>
              <p className="text-sm">{diff.atomB.description}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quality diff */}
      {diff.qualityDiff && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Quality Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold">{diff.qualityDiff.old ?? 'N/A'}</span>
              <ArrowRight className="h-4 w-4" />
              <span className="text-2xl font-bold">{diff.qualityDiff.new ?? 'N/A'}</span>
              <Badge variant={diff.qualityDiff.delta >= 0 ? 'default' : 'destructive'} className="flex items-center gap-1">
                {diff.qualityDiff.delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {diff.qualityDiff.delta > 0 ? '+' : ''}{diff.qualityDiff.delta.toFixed(1)}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Outcomes diff */}
      {(diff.outcomesDiff.added.length > 0 || diff.outcomesDiff.removed.length > 0 || diff.outcomesDiff.modified.length > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Observable Outcomes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {diff.outcomesDiff.added.map((o, i) => (
              <div key={`add-${i}`} className="flex items-start gap-2 text-sm text-green-600 dark:text-green-400">
                <Plus className="h-4 w-4 mt-0.5 shrink-0" />
                {o.description}
              </div>
            ))}
            {diff.outcomesDiff.removed.map((o, i) => (
              <div key={`rem-${i}`} className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
                <Minus className="h-4 w-4 mt-0.5 shrink-0" />
                {o.description}
              </div>
            ))}
            {diff.outcomesDiff.modified.map((o, i) => (
              <div key={`mod-${i}`} className="flex items-start gap-2 text-sm text-yellow-600 dark:text-yellow-400">
                <RefreshCw className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{o.old.description} <ArrowRight className="h-3 w-3 inline" /> {o.new.description}</span>
              </div>
            ))}
            {diff.outcomesDiff.unchanged > 0 && (
              <p className="text-xs text-muted-foreground">{diff.outcomesDiff.unchanged} outcome(s) unchanged</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tags diff */}
      {(diff.tagsDiff.added.length > 0 || diff.tagsDiff.removed.length > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Tags</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-2 flex-wrap">
            {diff.tagsDiff.added.map((t) => (
              <Badge key={`add-${t}`} className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                + {t}
              </Badge>
            ))}
            {diff.tagsDiff.removed.map((t) => (
              <Badge key={`rem-${t}`} className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                - {t}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Category diff */}
      {diff.categoryDiff && (
        <Card>
          <CardContent className="py-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">Category:</span>
              <Badge variant="outline">{diff.categoryDiff.old}</Badge>
              <ArrowRight className="h-4 w-4" />
              <Badge variant="outline">{diff.categoryDiff.new}</Badge>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
