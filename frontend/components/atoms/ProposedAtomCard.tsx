'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/shared/StatusBadge';
import type { Atom } from '@/types/atom';
import { AtomReviewModal } from './AtomReviewModal';

interface ProposedAtomCardProps {
  atom: Atom;
  onReviewComplete?: () => void;
}

/**
 * Card component for displaying a proposed atom awaiting HITL approval (Phase 18)
 */
export function ProposedAtomCard({ atom, onReviewComplete }: ProposedAtomCardProps) {
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);

  const confidencePercent = Math.round((atom.confidence || 0) * 100);
  const isHighConfidence = (atom.confidence || 0) >= 0.8;
  const isMediumConfidence = (atom.confidence || 0) >= 0.6 && (atom.confidence || 0) < 0.8;

  // Extract source test information from metadata if available
  const sourceTest = atom.metadata?.sourceOrphanTest as { filePath?: string; testName?: string; runId?: string } | undefined;

  return (
    <>
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg flex items-center gap-2">
                <span className="font-mono text-sm text-muted-foreground">{atom.atomId}</span>
                <StatusBadge status={atom.status} />
              </CardTitle>
              <CardDescription className="mt-2">{atom.description}</CardDescription>
            </div>
            <Badge
              variant={isHighConfidence ? 'success' : isMediumConfidence ? 'warning' : 'destructive'}
              className="shrink-0"
            >
              {confidencePercent}% confidence
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Category */}
          <div>
            <h4 className="text-sm font-medium text-muted-foreground">Category</h4>
            <Badge variant="outline" className="mt-1 capitalize">{atom.category}</Badge>
          </div>

          {/* Rationale */}
          {atom.rationale && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground">Rationale</h4>
              <p className="text-sm mt-1">{atom.rationale}</p>
            </div>
          )}

          {/* Observable Outcomes */}
          {atom.observableOutcomes && atom.observableOutcomes.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground">Observable Outcomes</h4>
              <ul className="list-disc list-inside text-sm mt-1 space-y-1">
                {atom.observableOutcomes.map((outcome, idx) => (
                  <li key={idx}>{outcome.description}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Source Test Information */}
          {sourceTest && (
            <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded">
              <div className="font-medium mb-1">Inferred from test:</div>
              {sourceTest.testName && <div className="truncate">Test: {sourceTest.testName}</div>}
              {sourceTest.filePath && <div className="truncate">File: {sourceTest.filePath}</div>}
              {sourceTest.runId && <div className="truncate">Run: {sourceTest.runId}</div>}
            </div>
          )}

          {/* Proposed By */}
          <div className="text-xs text-muted-foreground">
            Proposed by: <span className="font-medium">{atom.proposedBy || 'Unknown'}</span>
            {atom.source && <span className="ml-2">({atom.source.replace(/_/g, ' ')})</span>}
          </div>
        </CardContent>

        <CardFooter className="gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => setIsReviewModalOpen(true)}
            className="flex-1"
          >
            Review
          </Button>
        </CardFooter>
      </Card>

      {/* Review Modal */}
      <AtomReviewModal
        atom={atom}
        open={isReviewModalOpen}
        onOpenChange={setIsReviewModalOpen}
        onReviewComplete={() => {
          setIsReviewModalOpen(false);
          onReviewComplete?.();
        }}
      />
    </>
  );
}
