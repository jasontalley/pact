'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Layers } from 'lucide-react';

interface MoleculePreviewProps {
  molecule: {
    name: string;
    description: string;
    lensType: string;
    atomIndices: number[];
  };
  atomCount: number;
}

export function MoleculePreview({ molecule, atomCount }: MoleculePreviewProps) {
  return (
    <Card className="border-purple-300 dark:border-purple-700 bg-purple-50/50 dark:bg-purple-950/20">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Layers className="h-4 w-4" />
            {molecule.name}
          </CardTitle>
          <Badge variant="outline">{molecule.lensType}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">{molecule.description}</p>
        <p className="text-xs text-muted-foreground">
          Contains {molecule.atomIndices.length} of {atomCount} atom(s)
        </p>
      </CardContent>
    </Card>
  );
}
