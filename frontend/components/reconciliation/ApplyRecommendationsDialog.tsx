'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Zap,
  Layers,
  FileCode,
  CheckCircle,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import type { AtomRecommendation, MoleculeRecommendation, ApplyRequest } from '@/types/reconciliation';

interface ApplyRecommendationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  atoms: AtomRecommendation[];
  molecules: MoleculeRecommendation[];
  atomDecisions: Map<string, 'approve' | 'reject'>;
  moleculeDecisions: Map<string, 'approve' | 'reject'>;
  onApply: (request: ApplyRequest) => void;
  isApplying?: boolean;
}

/**
 * ApplyRecommendationsDialog - Preview and confirm applying recommendations
 */
export function ApplyRecommendationsDialog({
  open,
  onOpenChange,
  atoms,
  molecules,
  atomDecisions,
  moleculeDecisions,
  onApply,
  isApplying = false,
}: ApplyRecommendationsDialogProps) {
  const [includeMolecules, setIncludeMolecules] = useState(true);
  const [injectAnnotations, setInjectAnnotations] = useState(false);

  // Calculate what will be applied
  const approvedAtoms = atoms.filter(
    (a) => atomDecisions.get(a.tempId) === 'approve' || a.status === 'approved'
  );
  const rejectedAtoms = atoms.filter(
    (a) => atomDecisions.get(a.tempId) === 'reject' || a.status === 'rejected'
  );
  const pendingAtoms = atoms.filter(
    (a) =>
      !atomDecisions.has(a.tempId) &&
      a.status === 'pending'
  );

  const approvedMolecules = molecules.filter(
    (m) => moleculeDecisions.get(m.tempId) === 'approve' || m.status === 'approved'
  );

  // Calculate quality distribution
  const highQualityCount = approvedAtoms.filter(
    (a) => a.qualityScore !== undefined && a.qualityScore >= 80
  ).length;
  const mediumQualityCount = approvedAtoms.filter(
    (a) => a.qualityScore !== undefined && a.qualityScore >= 60 && a.qualityScore < 80
  ).length;
  const lowQualityCount = approvedAtoms.filter(
    (a) => a.qualityScore !== undefined && a.qualityScore < 60
  ).length;

  const handleApply = () => {
    const selections = approvedAtoms.map((a) => a.tempId);
    if (includeMolecules) {
      selections.push(...approvedMolecules.map((m) => m.tempId));
    }

    onApply({
      selections,
      injectAnnotations,
    });
  };

  const canApply = approvedAtoms.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Apply Recommendations</DialogTitle>
          <DialogDescription>
            Review what will be created and confirm to apply the recommendations.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2 text-green-700 mb-1">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm font-medium">To Create</span>
              </div>
              <p className="text-2xl font-bold text-green-800">
                {approvedAtoms.length}
              </p>
              <p className="text-xs text-green-600">atoms approved</p>
            </div>

            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2 text-red-700 mb-1">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm font-medium">Rejected</span>
              </div>
              <p className="text-2xl font-bold text-red-800">
                {rejectedAtoms.length}
              </p>
              <p className="text-xs text-red-600">atoms rejected</p>
            </div>

            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="flex items-center gap-2 text-gray-700 mb-1">
                <Zap className="h-4 w-4" />
                <span className="text-sm font-medium">Pending</span>
              </div>
              <p className="text-2xl font-bold text-gray-800">
                {pendingAtoms.length}
              </p>
              <p className="text-xs text-gray-600">not reviewed</p>
            </div>
          </div>

          {/* Quality Distribution */}
          {approvedAtoms.length > 0 && (
            <div className="p-3 bg-muted/50 rounded-lg">
              <h4 className="text-sm font-medium mb-2">Quality Distribution</h4>
              <div className="flex gap-4 text-sm">
                <div className="flex items-center gap-1">
                  <Badge variant="default" className="bg-green-600">
                    {highQualityCount}
                  </Badge>
                  <span className="text-muted-foreground">High (80+)</span>
                </div>
                <div className="flex items-center gap-1">
                  <Badge variant="secondary">{mediumQualityCount}</Badge>
                  <span className="text-muted-foreground">Medium (60-79)</span>
                </div>
                <div className="flex items-center gap-1">
                  <Badge variant="destructive">{lowQualityCount}</Badge>
                  <span className="text-muted-foreground">Low (&lt;60)</span>
                </div>
              </div>
            </div>
          )}

          <Separator />

          {/* Options */}
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="include-molecules"
                checked={includeMolecules}
                onCheckedChange={(checked) => setIncludeMolecules(checked === true)}
              />
              <Label htmlFor="include-molecules" className="text-sm">
                Include molecules ({approvedMolecules.length} approved)
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="inject-annotations"
                checked={injectAnnotations}
                onCheckedChange={(checked) => setInjectAnnotations(checked === true)}
              />
              <Label htmlFor="inject-annotations" className="text-sm flex items-center gap-2">
                <FileCode className="h-4 w-4" />
                Inject @atom annotations into test files
              </Label>
            </div>
          </div>

          <Separator />

          {/* Preview */}
          <div>
            <h4 className="text-sm font-medium mb-2">What will be created:</h4>
            <ScrollArea className="h-[150px] border rounded-md p-2">
              <div className="space-y-2">
                {approvedAtoms.map((atom) => (
                  <div
                    key={atom.tempId}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Zap className="h-3 w-3 text-primary" />
                    <span className="truncate flex-1">{atom.description}</span>
                    <Badge variant="outline" className="text-xs">
                      {atom.category}
                    </Badge>
                  </div>
                ))}
                {includeMolecules &&
                  approvedMolecules.map((mol) => (
                    <div
                      key={mol.tempId}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Layers className="h-3 w-3 text-primary" />
                      <span className="truncate flex-1">{mol.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {mol.atomRecommendationTempIds.length} atoms
                      </Badge>
                    </div>
                  ))}
                {approvedAtoms.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No atoms approved for creation
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Warning for low quality atoms */}
          {lowQualityCount > 0 && (
            <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
              <div className="text-sm text-yellow-800">
                <strong>Warning:</strong> {lowQualityCount} atom(s) have low quality
                scores (&lt;60). Consider reviewing these before applying.
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={!canApply || isApplying}>
            {isApplying ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Applying...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Apply {approvedAtoms.length} Atom{approvedAtoms.length !== 1 ? 's' : ''}
                {includeMolecules && approvedMolecules.length > 0 && (
                  <> + {approvedMolecules.length} Molecule{approvedMolecules.length !== 1 ? 's' : ''}</>
                )}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
