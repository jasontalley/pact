'use client';

import { use, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppLayout } from '@/components/layout';
import {
  useMolecule,
  useMoleculeAtoms,
  useMoleculeChildren,
  useMoleculeAncestors,
  useUpdateMolecule,
  useDeleteMolecule,
  useRemoveAtomFromMolecule,
  useAddAtomToMolecule,
  useLensTypes,
} from '@/hooks/molecules';
import { useOrphanAtoms } from '@/hooks/molecules';
import { MoleculeLensTypeBadge, CreateMoleculeDialog, MoleculeCard } from '@/components/molecules';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { QualityBadge } from '@/components/quality/QualityBadge';
import { formatDateTime } from '@/lib/utils/format';
import type { LensType } from '@/types/molecule';
import type { Atom } from '@/types/atom';
import {
  ArrowLeft,
  Edit,
  Trash2,
  Plus,
  Layers,
  GitBranch,
  CheckCircle,
  Clock,
  AlertCircle,
  X,
  Search,
  ChevronRight,
} from 'lucide-react';

interface MoleculeDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function MoleculeDetailPage({ params }: MoleculeDetailPageProps) {
  const resolvedParams = use(params);
  const router = useRouter();

  // Data fetching
  const { data: molecule, isLoading, error } = useMolecule(resolvedParams.id);
  const { data: atoms } = useMoleculeAtoms(resolvedParams.id);
  const { data: children } = useMoleculeChildren(resolvedParams.id);
  const { data: ancestors } = useMoleculeAncestors(resolvedParams.id);
  const { data: orphanAtoms } = useOrphanAtoms();
  const { data: lensTypes } = useLensTypes();

  // Mutations
  const updateMolecule = useUpdateMolecule();
  const deleteMolecule = useDeleteMolecule();
  const removeAtom = useRemoveAtomFromMolecule();
  const addAtom = useAddAtomToMolecule();

  // UI state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showAddAtomDialog, setShowAddAtomDialog] = useState(false);
  const [showCreateChildDialog, setShowCreateChildDialog] = useState(false);
  const [atomToRemove, setAtomToRemove] = useState<Atom | null>(null);
  const [atomSearchTerm, setAtomSearchTerm] = useState('');

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editLensType, setEditLensType] = useState<LensType>('feature');
  const [editLensLabel, setEditLensLabel] = useState('');

  // Sync edit form with molecule data when dialog opens
  useEffect(() => {
    if (molecule && showEditDialog) {
      setEditName(molecule.name);
      setEditDescription(molecule.description || '');
      setEditLensType(molecule.lensType);
      setEditLensLabel(molecule.lensLabel || '');
    }
  }, [molecule, showEditDialog]);

  const handleEdit = () => {
    if (!molecule) return;
    updateMolecule.mutate(
      {
        id: molecule.id,
        data: {
          name: editName.trim(),
          description: editDescription.trim() || undefined,
          lensType: editLensType,
          lensLabel: editLensType === 'custom' ? editLensLabel.trim() : undefined,
        },
      },
      {
        onSuccess: () => setShowEditDialog(false),
      }
    );
  };

  const handleDelete = () => {
    if (!molecule) return;
    deleteMolecule.mutate(molecule.id, {
      onSuccess: () => router.push('/molecules'),
    });
  };

  const handleRemoveAtom = () => {
    if (!molecule || !atomToRemove) return;
    removeAtom.mutate(
      { moleculeId: molecule.id, atomId: atomToRemove.id },
      {
        onSuccess: () => setAtomToRemove(null),
      }
    );
  };

  const handleAddAtom = (atomId: string) => {
    if (!molecule) return;
    addAtom.mutate(
      { moleculeId: molecule.id, data: { atomId } },
      {
        onSuccess: () => {
          setShowAddAtomDialog(false);
          setAtomSearchTerm('');
        },
      }
    );
  };

  // Filter orphan atoms for search
  const filteredOrphanAtoms = orphanAtoms?.filter((atom) => {
    if (!atomSearchTerm) return true;
    const search = atomSearchTerm.toLowerCase();
    return (
      atom.atomId.toLowerCase().includes(search) ||
      atom.description.toLowerCase().includes(search)
    );
  });

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

  if (error || !molecule) {
    return (
      <AppLayout showSidebar={false}>
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <Link
            href="/molecules"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline mb-6"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Molecules
          </Link>
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold text-destructive">Molecule Not Found</h2>
            <p className="text-muted-foreground mt-2">
              The requested molecule could not be found.
            </p>
          </div>
        </div>
      </AppLayout>
    );
  }

  const metrics = molecule.metrics;
  const realizationStatus = metrics?.realizationStatus?.overall || 'unrealized';

  return (
    <AppLayout showSidebar={false}>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6 flex-wrap">
          <Link href="/molecules" className="hover:text-primary">
            Molecules
          </Link>
          {ancestors &&
            [...ancestors].reverse().map((ancestor) => (
              <div key={ancestor.id} className="flex items-center gap-2">
                <ChevronRight className="h-4 w-4" />
                <Link href={`/molecules/${ancestor.id}`} className="hover:text-primary">
                  {ancestor.name}
                </Link>
              </div>
            ))}
          <ChevronRight className="h-4 w-4" />
          <span className="text-foreground font-medium">{molecule.name}</span>
        </div>

        {/* Title Section */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold">{molecule.name}</h1>
              <MoleculeLensTypeBadge type={molecule.lensType} customLabel={molecule.lensLabel} />
            </div>
            <p className="text-sm font-mono text-muted-foreground">{molecule.moleculeId}</p>
          </div>
          {metrics?.aggregateQuality?.average !== undefined && (
            <QualityBadge score={metrics.aggregateQuality.average} showLabel className="text-lg px-3 py-1" />
          )}
        </div>

        {/* Description */}
        {molecule.description && (
          <div className="bg-card rounded-lg border p-6 mb-6">
            <h2 className="text-lg font-semibold mb-3">Description</h2>
            <p className="text-foreground whitespace-pre-wrap">{molecule.description}</p>
          </div>
        )}

        {/* Metrics Summary */}
        {metrics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-card rounded-lg border p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Layers className="h-4 w-4" />
                <span className="text-sm">Atoms</span>
              </div>
              <p className="text-2xl font-bold">{metrics.atomCount}</p>
            </div>

            <div className="bg-card rounded-lg border p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <GitBranch className="h-4 w-4" />
                <span className="text-sm">Children</span>
              </div>
              <p className="text-2xl font-bold">{metrics.childMoleculeCount || 0}</p>
            </div>

            <div className="bg-card rounded-lg border p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm">Coverage</span>
              </div>
              <p className="text-2xl font-bold">{metrics.validatorCoverage}%</p>
            </div>

            <div className="bg-card rounded-lg border p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <RealizationIcon status={realizationStatus} />
                <span className="text-sm">Status</span>
              </div>
              <p className="text-2xl font-bold capitalize">{realizationStatus}</p>
            </div>
          </div>
        )}

        {/* Atoms */}
        <div className="bg-card rounded-lg border p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Atoms ({atoms?.length || 0})
            </h2>
            <button
              onClick={() => setShowAddAtomDialog(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Add Atom
            </button>
          </div>

          {atoms && atoms.length > 0 ? (
            <div className="space-y-2">
              {atoms.map((atom) => (
                <div
                  key={atom.id}
                  className="flex items-center justify-between p-3 bg-muted rounded-lg"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/atoms/${atom.id}`}
                        className="font-mono text-sm font-medium hover:text-primary hover:underline"
                      >
                        {atom.atomId}
                      </Link>
                      <StatusBadge status={atom.status} />
                    </div>
                    <p className="text-sm text-muted-foreground truncate mt-0.5">
                      {atom.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <QualityBadge score={atom.qualityScore} />
                    <button
                      onClick={() => setAtomToRemove(atom)}
                      className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-destructive"
                      title="Remove from molecule"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Layers className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No atoms in this molecule yet</p>
              <button
                onClick={() => setShowAddAtomDialog(true)}
                className="mt-2 text-sm text-primary hover:underline"
              >
                Add your first atom
              </button>
            </div>
          )}
        </div>

        {/* Child Molecules */}
        <div className="bg-card rounded-lg border p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <GitBranch className="h-5 w-5" />
              Child Molecules ({children?.length || 0})
            </h2>
            <button
              onClick={() => setShowCreateChildDialog(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              Add Child
            </button>
          </div>

          {children && children.length > 0 ? (
            <div className="space-y-3">
              {children.map((child) => (
                <MoleculeCard key={child.id} molecule={child} showMetrics={false} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <GitBranch className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No child molecules</p>
              <button
                onClick={() => setShowCreateChildDialog(true)}
                className="mt-2 text-sm text-primary hover:underline"
              >
                Create a child molecule
              </button>
            </div>
          )}
        </div>

        {/* Tags */}
        {molecule.tags && molecule.tags.length > 0 && (
          <div className="bg-card rounded-lg border p-6 mb-6">
            <h2 className="text-lg font-semibold mb-3">Tags</h2>
            <div className="flex flex-wrap gap-2">
              {molecule.tags.map((tag) => (
                <span
                  key={tag}
                  className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-3 py-1 rounded-full text-sm"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Metadata */}
        <div className="bg-card rounded-lg border p-6 mb-6">
          <h2 className="text-lg font-semibold mb-3">Details</h2>
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-sm text-muted-foreground">Created</dt>
              <dd className="font-medium">{formatDateTime(new Date(molecule.createdAt))}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Updated</dt>
              <dd className="font-medium">{formatDateTime(new Date(molecule.updatedAt))}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Owner</dt>
              <dd className="font-medium">{molecule.ownerId || 'Unassigned'}</dd>
            </div>
            {molecule.parentMoleculeId && (
              <div>
                <dt className="text-sm text-muted-foreground">Parent</dt>
                <dd>
                  <Link
                    href={`/molecules/${molecule.parentMoleculeId}`}
                    className="text-primary hover:underline"
                  >
                    View parent molecule
                  </Link>
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => setShowEditDialog(true)}
            className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-accent"
          >
            <Edit className="h-4 w-4" />
            Edit
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>

        {/* Delete Confirmation Dialog */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-card rounded-lg border shadow-lg max-w-md w-full p-6">
              <h3 className="text-xl font-semibold mb-2">Delete Molecule</h3>
              <p className="text-muted-foreground mb-4">
                Are you sure you want to delete &quot;{molecule.name}&quot;? This will not delete
                the atoms within it, but they may become orphaned.
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
                  disabled={deleteMolecule.isPending}
                  className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 disabled:opacity-50"
                >
                  {deleteMolecule.isPending ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Remove Atom Confirmation Dialog */}
        {atomToRemove && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-card rounded-lg border shadow-lg max-w-md w-full p-6">
              <h3 className="text-xl font-semibold mb-2">Remove Atom</h3>
              <p className="text-muted-foreground mb-4">
                Remove <span className="font-mono">{atomToRemove.atomId}</span> from this molecule?
                The atom itself will not be deleted.
              </p>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setAtomToRemove(null)}
                  className="px-4 py-2 border rounded-lg hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRemoveAtom}
                  disabled={removeAtom.isPending}
                  className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 disabled:opacity-50"
                >
                  {removeAtom.isPending ? 'Removing...' : 'Remove'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Dialog */}
        {showEditDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-card rounded-lg border shadow-lg max-w-lg w-full p-6">
              <h3 className="text-xl font-semibold mb-4">Edit Molecule</h3>

              <div className="space-y-4">
                <div>
                  <label htmlFor="edit-name" className="text-sm font-medium block mb-2">
                    Name
                  </label>
                  <input
                    id="edit-name"
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md"
                  />
                </div>

                <div>
                  <label htmlFor="edit-description" className="text-sm font-medium block mb-2">
                    Description
                  </label>
                  <textarea
                    id="edit-description"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="w-full h-24 px-3 py-2 border rounded-md resize-none"
                  />
                </div>

                <div>
                  <label htmlFor="edit-lens-type" className="text-sm font-medium block mb-2">
                    Lens Type
                  </label>
                  <select
                    id="edit-lens-type"
                    value={editLensType}
                    onChange={(e) => setEditLensType(e.target.value as LensType)}
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    {lensTypes?.map((lt) => (
                      <option key={lt.type} value={lt.type}>
                        {lt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {editLensType === 'custom' && (
                  <div>
                    <label htmlFor="edit-lens-label" className="text-sm font-medium block mb-2">
                      Custom Label
                    </label>
                    <input
                      id="edit-lens-label"
                      type="text"
                      value={editLensLabel}
                      onChange={(e) => setEditLensLabel(e.target.value)}
                      className="w-full px-3 py-2 border rounded-md"
                    />
                  </div>
                )}
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
                  disabled={updateMolecule.isPending || !editName.trim()}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
                >
                  {updateMolecule.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Atom Dialog */}
        {showAddAtomDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-card rounded-lg border shadow-lg max-w-lg w-full p-6 max-h-[80vh] flex flex-col">
              <h3 className="text-xl font-semibold mb-4">Add Atom to Molecule</h3>

              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={atomSearchTerm}
                  onChange={(e) => setAtomSearchTerm(e.target.value)}
                  placeholder="Search orphan atoms..."
                  className="w-full pl-9 pr-3 py-2 border rounded-md"
                />
              </div>

              <div className="flex-1 overflow-y-auto border rounded-lg">
                {filteredOrphanAtoms && filteredOrphanAtoms.length > 0 ? (
                  <div className="divide-y">
                    {filteredOrphanAtoms.map((atom) => (
                      <button
                        key={atom.id}
                        onClick={() => handleAddAtom(atom.id)}
                        disabled={addAtom.isPending}
                        className="w-full p-3 text-left hover:bg-accent disabled:opacity-50"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm">{atom.atomId}</span>
                          <StatusBadge status={atom.status} />
                        </div>
                        <p className="text-sm text-muted-foreground truncate mt-0.5">
                          {atom.description}
                        </p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center text-muted-foreground">
                    {atomSearchTerm
                      ? 'No matching orphan atoms found'
                      : 'No orphan atoms available'}
                  </div>
                )}
              </div>

              <div className="flex justify-end mt-4">
                <button
                  onClick={() => {
                    setShowAddAtomDialog(false);
                    setAtomSearchTerm('');
                  }}
                  className="px-4 py-2 border rounded-lg hover:bg-accent"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Create Child Molecule Dialog */}
        <CreateMoleculeDialog
          isOpen={showCreateChildDialog}
          onClose={() => setShowCreateChildDialog(false)}
          parentMoleculeId={molecule.id}
        />
      </div>
    </AppLayout>
  );
}

function RealizationIcon({ status }: { status: string }) {
  switch (status) {
    case 'realized':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'partial':
      return <Clock className="h-4 w-4 text-yellow-500" />;
    case 'unrealized':
    default:
      return <AlertCircle className="h-4 w-4 text-gray-400" />;
  }
}
