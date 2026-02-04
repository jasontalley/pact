'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GitPullRequest, Clock, CheckCircle2, XCircle, FileEdit, Lock } from 'lucide-react';
import type { ChangeSetSummary } from '@/lib/api/change-sets';

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive'; icon: React.ReactNode }> = {
  draft: { label: 'Draft', variant: 'secondary', icon: <FileEdit className="h-3 w-3" /> },
  review: { label: 'In Review', variant: 'outline', icon: <Clock className="h-3 w-3" /> },
  approved: { label: 'Approved', variant: 'default', icon: <CheckCircle2 className="h-3 w-3" /> },
  committed: { label: 'Committed', variant: 'default', icon: <Lock className="h-3 w-3" /> },
  rejected: { label: 'Rejected', variant: 'destructive', icon: <XCircle className="h-3 w-3" /> },
};

interface ChangeSetCardProps {
  changeSet: ChangeSetSummary;
}

export function ChangeSetCard({ changeSet }: ChangeSetCardProps) {
  const meta = changeSet.changeSetMetadata;
  const config = statusConfig[meta.status] || statusConfig.draft;
  const approvalCount = meta.approvals.filter(a => a.decision === 'approved').length;

  return (
    <Link href={`/change-sets/${changeSet.id}`}>
      <Card className="hover:border-primary/50 transition-colors cursor-pointer">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <GitPullRequest className="h-4 w-4" />
              {changeSet.name}
            </CardTitle>
            <Badge variant={config.variant} className="flex items-center gap-1">
              {config.icon}
              {config.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {changeSet.description && (
            <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{changeSet.description}</p>
          )}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {meta.approvals.length > 0 && (
              <span>{approvalCount}/{meta.requiredApprovals} approved</span>
            )}
            <span>Created {new Date(changeSet.createdAt).toLocaleDateString()}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
