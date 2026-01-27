'use client';

import { use, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppLayout } from '@/components/layout';
import { useAtom, useCommitAtom, useDeleteAtom, useUpdateAtom } from '@/hooks/atoms/use-atoms';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { QualityBadge } from '@/components/quality/QualityBadge';
import { ValidatorList, CreateValidatorDialog } from '@/components/validators';
import { formatDateTime } from '@/lib/utils/format';
import { ArrowLeft } from 'lucide-react';
import type { AtomCategory } from '@/types/atom';
import type { Validator } from '@/types/validator';

const categories: { value: AtomCategory; label: string }[] = [
  { value: 'functional', label: 'Functional' },
  { value: 'performance', label: 'Performance' },
  { value: 'security', label: 'Security' },
  { value: 'reliability', label: 'Reliability' },
  { value: 'usability', label: 'Usability' },
  { value: 'maintainability', label: 'Maintainability' },
];

interface AtomDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function AtomDetailPage({ params }: AtomDetailPageProps) {
  const resolvedParams = use(params);
  const { data: atom, isLoading, error } = useAtom(resolvedParams.id);
  const commitAtom = useCommitAtom();
  const deleteAtom = useDeleteAtom();
  const updateAtom = useUpdateAtom();
  const router = useRouter();
  const [showCommitConfirm, setShowCommitConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showCreateValidatorDialog, setShowCreateValidatorDialog] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [validatorToEdit, setValidatorToEdit] = useState<Validator | null>(null);

  // Edit form state
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState<AtomCategory>('functional');

  // Sync edit form with atom data when dialog opens
  useEffect(() => {
    if (atom && showEditDialog) {
      setEditDescription(atom.description);
      setEditCategory(atom.category);
    }
  }, [atom, showEditDialog]);

  const handleEdit = () => {
    if (!atom) return;
    updateAtom.mutate(
      {
        id: atom.id,
        data: {
          description: editDescription,
          category: editCategory,
        },
      },
      {
        onSuccess: () => {
          setShowEditDialog(false);
        },
      }
    );
  };

  const handleCommit = () => {
    if (!atom) return;
    commitAtom.mutate(atom.id, {
      onSuccess: () => {
        setShowCommitConfirm(false);
        setAcknowledged(false);
      },
    });
  };

  const handleDelete = () => {
    if (!atom) return;
    deleteAtom.mutate(atom.id, {
      onSuccess: () => {
        router.push('/atoms');
      },
    });
  };

  if (isLoading) {
    return (
      <AppLayout showSidebar={false}>
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="space-y-4">
            <div className="h-12 w-64 bg-muted animate-pulse rounded" />
            <div className="h-32 bg-muted animate-pulse rounded" />
            <div className="h-64 bg-muted animate-pulse rounded" />
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error || !atom) {
    return (
      <AppLayout showSidebar={false}>
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <Link href="/atoms" className="inline-flex items-center gap-1 text-sm text-primary hover:underline mb-6">
            <ArrowLeft className="h-4 w-4" />
            Back to Atoms
          </Link>
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold text-destructive">Atom Not Found</h2>
            <p className="text-muted-foreground mt-2">
              The requested atom could not be found.
            </p>
          </div>
        </div>
      </AppLayout>
    );
  }

  const canCommit = atom.status === 'draft' && (atom.qualityScore ?? 0) >= 80;
  const canDelete = atom.status === 'draft';
  const canEdit = atom.status === 'draft';

  return (
    <AppLayout showSidebar={false}>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Back Link */}
        <Link href="/atoms" className="inline-flex items-center gap-1 text-sm text-primary hover:underline mb-6">
          <ArrowLeft className="h-4 w-4" />
          Back to Atoms
        </Link>

        {/* Title Section */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-mono font-bold">{atom.atomId}</h1>
              <StatusBadge status={atom.status} />
            </div>
            <p className="text-muted-foreground capitalize">{atom.category}</p>
          </div>
          <QualityBadge score={atom.qualityScore} showLabel className="text-lg px-3 py-1" />
        </div>

        {/* Description */}
        <div className="bg-card rounded-lg border p-6 mb-6">
          <h2 className="text-lg font-semibold mb-3">Description</h2>
          <p className="text-foreground whitespace-pre-wrap">{atom.description}</p>
        </div>

        {/* Observable Outcomes */}
        {atom.observableOutcomes.length > 0 && (
          <div className="bg-card rounded-lg border p-6 mb-6">
            <h2 className="text-lg font-semibold mb-3">Observable Outcomes</h2>
            <ul className="space-y-3">
              {atom.observableOutcomes.map((outcome, i) => (
                <li key={i} className="border-l-2 border-primary/30 pl-3">
                  <p className="text-foreground">{outcome.description}</p>
                  {outcome.measurementCriteria && (
                    <p className="text-sm text-muted-foreground mt-1">
                      <span className="font-medium">Measurement:</span> {outcome.measurementCriteria}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Falsifiability Criteria */}
        {atom.falsifiabilityCriteria.length > 0 && (
          <div className="bg-card rounded-lg border p-6 mb-6">
            <h2 className="text-lg font-semibold mb-3">Falsifiability Criteria</h2>
            <ul className="space-y-3">
              {atom.falsifiabilityCriteria.map((criterion, i) => (
                <li key={i} className="border-l-2 border-destructive/30 pl-3">
                  <p className="text-foreground">
                    <span className="font-medium">If:</span> {criterion.condition}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    <span className="font-medium">Then:</span> {criterion.expectedBehavior}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Tags */}
        {atom.tags.length > 0 && (
          <div className="bg-card rounded-lg border p-6 mb-6">
            <h2 className="text-lg font-semibold mb-3">Tags</h2>
            <div className="flex flex-wrap gap-2">
              {atom.tags.map((tag) => (
                <span
                  key={tag}
                  className="bg-muted px-3 py-1 rounded-full text-sm"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Validators */}
        <div className="bg-card rounded-lg border p-6 mb-6">
          <ValidatorList
            atomId={atom.id}
            onCreateValidator={() => setShowCreateValidatorDialog(true)}
            onEditValidator={(validator) => setValidatorToEdit(validator)}
          />
        </div>

        {/* Metadata */}
        <div className="bg-card rounded-lg border p-6 mb-6">
          <h2 className="text-lg font-semibold mb-3">Details</h2>
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-sm text-muted-foreground">Created</dt>
              <dd className="font-medium">{formatDateTime(new Date(atom.createdAt))}</dd>
            </div>
            {atom.committedAt && (
              <div>
                <dt className="text-sm text-muted-foreground">Committed</dt>
                <dd className="font-medium">{formatDateTime(new Date(atom.committedAt))}</dd>
              </div>
            )}
            {atom.supersededBy && (
              <div>
                <dt className="text-sm text-muted-foreground">Superseded By</dt>
                <dd>
                  <Link href={`/atoms/${atom.supersededBy}`} className="text-primary hover:underline">
                    View new atom
                  </Link>
                </dd>
              </div>
            )}
            {atom.parentIntent && (
              <div className="col-span-2">
                <dt className="text-sm text-muted-foreground">Original Intent</dt>
                <dd className="text-sm">{atom.parentIntent}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          {canEdit && (
            <button
              onClick={() => setShowEditDialog(true)}
              className="px-4 py-2 border rounded-lg hover:bg-accent"
            >
              Edit
            </button>
          )}
          {canCommit && (
            <button
              onClick={() => setShowCommitConfirm(true)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Commit
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90"
            >
              Delete
            </button>
          )}
        </div>

        {/* Commit Confirmation Dialog */}
        {showCommitConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-card rounded-lg border shadow-lg max-w-md w-full p-6">
              <h3 className="text-xl font-semibold mb-2">Commit Intent Atom</h3>
              <p className="text-muted-foreground mb-4">
                This action is <strong>permanent</strong>. Once committed, this atom
                cannot be edited or deleted—only superseded.
              </p>

              <div className="flex items-center gap-2 mb-4">
                <input
                  type="checkbox"
                  id="acknowledge"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="acknowledge" className="text-sm">
                  I understand this atom will become immutable
                </label>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setShowCommitConfirm(false);
                    setAcknowledged(false);
                  }}
                  className="px-4 py-2 border rounded-lg hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCommit}
                  disabled={!acknowledged || commitAtom.isPending}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {commitAtom.isPending ? 'Committing...' : 'Commit Atom'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-card rounded-lg border shadow-lg max-w-md w-full p-6">
              <h3 className="text-xl font-semibold mb-2">Delete Atom</h3>
              <p className="text-muted-foreground mb-4">
                Are you sure you want to delete this draft atom? This action cannot be undone.
              </p>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteAtom.isPending}
                  className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 disabled:opacity-50"
                >
                  {deleteAtom.isPending ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Dialog */}
        {showEditDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-card rounded-lg border shadow-lg max-w-lg w-full p-6">
              <h3 className="text-xl font-semibold mb-4">Edit Atom</h3>

              <div className="space-y-4">
                <div>
                  <label htmlFor="edit-description" className="text-sm font-medium block mb-2">
                    Description
                  </label>
                  <textarea
                    id="edit-description"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full h-32 px-3 py-2 border rounded-md resize-none"
                  />
                </div>

                <div>
                  <label htmlFor="edit-category" className="text-sm font-medium block mb-2">
                    Category
                  </label>
                  <select
                    id="edit-category"
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value as AtomCategory)}
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    {categories.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={() => setShowEditDialog(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEdit}
                  disabled={updateAtom.isPending || !editDescription.trim()}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
                >
                  {updateAtom.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Create Validator Dialog */}
        <CreateValidatorDialog
          atomId={atom.id}
          isOpen={showCreateValidatorDialog}
          onClose={() => setShowCreateValidatorDialog(false)}
        />
      </div>
    </AppLayout>
  );
}
