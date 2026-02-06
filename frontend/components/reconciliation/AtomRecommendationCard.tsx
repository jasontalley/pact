'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  FileCode,
  AlertTriangle,
  Lightbulb,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AtomRecommendation, RecommendationStatus } from '@/types/reconciliation';

interface AtomRecommendationCardProps {
  atom: AtomRecommendation;
  decision?: 'approve' | 'reject';
  onDecisionChange?: (tempId: string, decision: 'approve' | 'reject' | null) => void;
  onApprove?: (tempId: string) => void;
  onReject?: (tempId: string, reason?: string) => void;
  disabled?: boolean;
  showActions?: boolean;
}

/**
 * Quality score color based on threshold
 */
function getQualityColor(score?: number): string {
  if (score === undefined || score === null) return 'text-muted-foreground';
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-yellow-600';
  return 'text-red-600';
}

/**
 * Quality score background for badge
 */
function getQualityBadgeVariant(score?: number): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (score === undefined || score === null) return 'outline';
  if (score >= 80) return 'default';
  if (score >= 60) return 'secondary';
  return 'destructive';
}

/**
 * Get status badge variant
 */
function getStatusBadgeVariant(status: RecommendationStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'approved':
      return 'default';
    case 'rejected':
      return 'destructive';
    default:
      return 'outline';
  }
}

/**
 * Category color mapping
 */
function getCategoryColor(category: string): string {
  switch (category.toLowerCase()) {
    case 'functional':
      return 'bg-purple-100 text-purple-800 border-purple-200';
    case 'performance':
      return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'security':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'reliability':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'usability':
      return 'bg-cyan-100 text-cyan-800 border-cyan-200';
    case 'maintainability':
      return 'bg-gray-100 text-gray-800 border-gray-200';
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200';
  }
}

/**
 * AtomRecommendationCard - Display an atom recommendation with review actions
 */
export function AtomRecommendationCard({
  atom,
  decision,
  onDecisionChange,
  onApprove,
  onReject,
  disabled = false,
  showActions = true,
}: AtomRecommendationCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  const handleApprove = () => {
    if (onDecisionChange) {
      onDecisionChange(atom.tempId, decision === 'approve' ? null : 'approve');
    }
    if (onApprove) {
      onApprove(atom.tempId);
    }
    setShowRejectInput(false);
  };

  const handleReject = () => {
    if (showRejectInput) {
      // Submit rejection
      if (onDecisionChange) {
        onDecisionChange(atom.tempId, 'reject');
      }
      if (onReject) {
        onReject(atom.tempId, rejectReason);
      }
      setShowRejectInput(false);
      setRejectReason('');
    } else {
      // Show rejection input
      setShowRejectInput(true);
    }
  };

  const handleCancelReject = () => {
    setShowRejectInput(false);
    setRejectReason('');
  };

  const isApproved = decision === 'approve' || atom.status === 'approved';
  const isRejected = decision === 'reject' || atom.status === 'rejected';

  return (
    <Card
      className={cn(
        'transition-all',
        isApproved && 'border-green-300 bg-green-50/50',
        isRejected && 'border-red-300 bg-red-50/50'
      )}
    >
      <CardContent className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* ID and badges */}
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="font-mono text-xs text-muted-foreground">
                {atom.tempId}
              </span>
              <Badge className={cn('text-xs border', getCategoryColor(atom.category))}>
                {atom.category}
              </Badge>
              {atom.qualityScore !== undefined && atom.qualityScore !== null && (
                <Badge variant={getQualityBadgeVariant(atom.qualityScore)} className="text-xs">
                  Quality: {atom.qualityScore}
                </Badge>
              )}
              {atom.status !== 'pending' && (
                <Badge variant={getStatusBadgeVariant(atom.status)} className="text-xs">
                  {atom.status}
                </Badge>
              )}
            </div>

            {/* Description */}
            <p className="text-sm mb-2">{atom.description}</p>

            {/* Confidence and source */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span>
                Confidence:{' '}
                <span className="font-medium">
                  {Math.round(atom.confidence * 100)}%
                </span>
              </span>
              <span className="flex items-center gap-1">
                <FileCode className="h-3 w-3" />
                <span className="font-mono truncate max-w-[200px]">
                  {atom.sourceTestFilePath.split('/').pop()}:{atom.sourceTestLineNumber}
                </span>
              </span>
            </div>
          </div>

          {/* Actions */}
          {showActions && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                size="sm"
                variant={isApproved ? 'default' : 'outline'}
                className={cn(
                  'gap-1',
                  isApproved && 'bg-green-600 hover:bg-green-700'
                )}
                onClick={handleApprove}
                disabled={disabled}
              >
                <CheckCircle className="h-4 w-4" />
                {isApproved ? 'Approved' : 'Approve'}
              </Button>
              <Button
                size="sm"
                variant={isRejected ? 'destructive' : 'outline'}
                className="gap-1"
                onClick={handleReject}
                disabled={disabled}
              >
                <XCircle className="h-4 w-4" />
                {isRejected ? 'Rejected' : 'Reject'}
              </Button>
            </div>
          )}
        </div>

        {/* Reject reason input */}
        {showRejectInput && (
          <div className="mt-3 p-3 bg-red-50 rounded-md border border-red-200">
            <label className="text-sm font-medium text-red-800 block mb-2">
              Rejection reason (optional)
            </label>
            <Textarea
              placeholder="Why is this recommendation being rejected?"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="mb-2 bg-white"
              rows={2}
            />
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={handleReject}>
                Confirm Reject
              </Button>
              <Button size="sm" variant="outline" onClick={handleCancelReject}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Expandable details */}
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 w-full justify-center gap-1 text-xs text-muted-foreground"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="h-4 w-4" />
                  Hide details
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" />
                  Show details
                </>
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-3">
            {/* Observable Outcomes */}
            {atom.observableOutcomes && atom.observableOutcomes.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Observable Outcomes
                </h4>
                <ul className="text-sm space-y-1 pl-4">
                  {atom.observableOutcomes.map((outcome, idx) => (
                    <li key={idx} className="list-disc">
                      {outcome.description}
                      {outcome.measurementCriteria && (
                        <span className="text-xs text-muted-foreground ml-1">
                          ({outcome.measurementCriteria})
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Reasoning */}
            {atom.reasoning && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                  <Lightbulb className="h-3 w-3" />
                  Reasoning
                </h4>
                <p className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                  {atom.reasoning}
                </p>
              </div>
            )}

            {/* Source Test */}
            <div>
              <h4 className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                <FileCode className="h-3 w-3" />
                Source Test
              </h4>
              <div className="text-sm font-mono bg-muted/50 p-2 rounded">
                <p className="truncate">{atom.sourceTestFilePath}</p>
                <p className="text-xs text-muted-foreground">
                  {atom.sourceTestName} (line {atom.sourceTestLineNumber})
                </p>
              </div>
            </div>

            {/* Quality Issues (if score is low) */}
            {atom.qualityScore !== undefined && atom.qualityScore < 60 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-2">
                <h4 className="text-xs font-medium text-yellow-800 mb-1 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Quality Concerns
                </h4>
                <p className="text-xs text-yellow-700">
                  This atom has a low quality score ({atom.qualityScore}). Consider reviewing
                  the description and observable outcomes before approving.
                </p>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
