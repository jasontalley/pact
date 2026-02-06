'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { MoleculeLensTypeBadge } from './MoleculeLensTypeBadge';
import { useCreateMolecule, useMolecules, useLensTypes } from '@/hooks/molecules';
import type { LensType } from '@/types/molecule';
import { LENS_TYPE_DESCRIPTIONS } from '@/types/molecule';
import { X, Plus, Layers, Search } from 'lucide-react';

interface CreateMoleculeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  parentMoleculeId?: string | null;
}

/**
 * Dialog for creating a new molecule
 */
export function CreateMoleculeDialog({
  isOpen,
  onClose,
  parentMoleculeId: initialParentId = null,
}: CreateMoleculeDialogProps) {
  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [lensType, setLensType] = useState<LensType>('feature');
  const [lensLabel, setLensLabel] = useState('');
  const [parentMoleculeId, setParentMoleculeId] = useState<string | null>(initialParentId);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [parentSearch, setParentSearch] = useState('');
  const [showParentSearch, setShowParentSearch] = useState(false);

  // API hooks
  const createMolecule = useCreateMolecule();
  const { data: lensTypes } = useLensTypes();
  const { data: moleculesData } = useMolecules({
    search: parentSearch,
    limit: 10,
  });

  const molecules = moleculesData?.items || [];

  // Reset when parent changes from prop
  useEffect(() => {
    setParentMoleculeId(initialParentId);
  }, [initialParentId]);

  if (!isOpen) return null;

  const handleClose = () => {
    // Reset form
    setName('');
    setDescription('');
    setLensType('feature');
    setLensLabel('');
    setParentMoleculeId(initialParentId);
    setTags([]);
    setTagInput('');
    setParentSearch('');
    setShowParentSearch(false);
    onClose();
  };

  const handleCreate = () => {
    if (!name.trim()) return;
    if (lensType === 'custom' && !lensLabel.trim()) return;

    createMolecule.mutate(
      {
        name: name.trim(),
        description: description.trim() || undefined,
        lensType,
        lensLabel: lensType === 'custom' ? lensLabel.trim() : undefined,
        parentMoleculeId: parentMoleculeId || undefined,
        tags: tags.length > 0 ? tags : undefined,
      },
      {
        onSuccess: () => handleClose(),
      }
    );
  };

  const handleAddTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
    }
    setTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleSelectParent = (moleculeId: string | null) => {
    setParentMoleculeId(moleculeId);
    setShowParentSearch(false);
    setParentSearch('');
  };

  const canCreate =
    name.trim().length >= 3 && (lensType !== 'custom' || lensLabel.trim().length >= 2);

  const selectedParent = molecules.find((m) => m.id === parentMoleculeId);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-molecule-dialog-title"
        className="bg-card rounded-lg border shadow-lg max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="p-6 border-b flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            <h2 id="create-molecule-dialog-title" className="text-xl font-semibold">
              Create Molecule
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-accent rounded-md"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {/* Name */}
          <div>
            <label className="text-sm font-medium block mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., User Authentication Flow"
              className="w-full px-3 py-2 border rounded-md"
              autoFocus
            />
            <p className="text-xs text-muted-foreground mt-1">Minimum 3 characters</p>
          </div>

          {/* Description */}
          <div>
            <label className="text-sm font-medium block mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this molecule represents..."
              className="w-full h-20 px-3 py-2 border rounded-md resize-none"
            />
          </div>

          {/* Lens Type */}
          <div>
            <label className="text-sm font-medium block mb-1">Lens Type *</label>
            <select
              value={lensType}
              onChange={(e) => setLensType(e.target.value as LensType)}
              className="w-full px-3 py-2 border rounded-md"
            >
              {lensTypes?.map((lt) => (
                <option key={lt.type} value={lt.type}>
                  {lt.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              {LENS_TYPE_DESCRIPTIONS[lensType]}
            </p>
          </div>

          {/* Custom Lens Label (only for custom type) */}
          {lensType === 'custom' && (
            <div>
              <label className="text-sm font-medium block mb-1">Custom Label *</label>
              <input
                type="text"
                value={lensLabel}
                onChange={(e) => setLensLabel(e.target.value)}
                placeholder="e.g., Sprint Goal, Theme"
                className="w-full px-3 py-2 border rounded-md"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Label for your custom lens type
              </p>
            </div>
          )}

          {/* Parent Molecule */}
          <div>
            <label className="text-sm font-medium block mb-1">Parent Molecule</label>
            <div className="relative">
              {parentMoleculeId ? (
                <div className="flex items-center gap-2 px-3 py-2 border rounded-md">
                  <span className="flex-1 truncate">
                    {selectedParent?.name || 'Loading...'}
                  </span>
                  <button
                    onClick={() => setParentMoleculeId(null)}
                    className="p-1 hover:bg-accent rounded"
                    type="button"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={parentSearch}
                    onChange={(e) => {
                      setParentSearch(e.target.value);
                      setShowParentSearch(true);
                    }}
                    onFocus={() => setShowParentSearch(true)}
                    placeholder="Search for parent molecule..."
                    className="w-full pl-9 pr-3 py-2 border rounded-md"
                  />

                  {/* Parent search dropdown */}
                  {showParentSearch && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setShowParentSearch(false)}
                      />
                      <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-md shadow-lg z-20 max-h-48 overflow-y-auto">
                        <button
                          onClick={() => handleSelectParent(null)}
                          className="w-full px-3 py-2 text-sm text-left hover:bg-accent text-muted-foreground"
                        >
                          No parent (root molecule)
                        </button>
                        {molecules
                          .filter((m) => m.id !== parentMoleculeId)
                          .map((molecule) => (
                            <button
                              key={molecule.id}
                              onClick={() => handleSelectParent(molecule.id)}
                              className="w-full px-3 py-2 text-sm text-left hover:bg-accent flex items-center gap-2"
                            >
                              <MoleculeLensTypeBadge
                                type={molecule.lensType}
                                customLabel={molecule.lensLabel}
                              />
                              <span className="truncate">{molecule.name}</span>
                            </button>
                          ))}
                        {molecules.length === 0 && parentSearch && (
                          <div className="px-3 py-2 text-sm text-muted-foreground">
                            No molecules found
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Nest this molecule under another molecule
            </p>
          </div>

          {/* Tags */}
          <div>
            <label className="text-sm font-medium block mb-1">Tags</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-sm bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                >
                  {tag}
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:text-blue-900 dark:hover:text-blue-100"
                    type="button"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder="Add a tag..."
                className="flex-1 px-3 py-2 border rounded-md"
              />
              <button
                onClick={handleAddTag}
                disabled={!tagInput.trim()}
                className="px-3 py-2 border rounded-md hover:bg-accent disabled:opacity-50"
                type="button"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Press Enter or comma to add a tag
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t flex justify-end gap-2 flex-shrink-0">
          <button
            onClick={handleClose}
            className="px-4 py-2 border rounded-lg hover:bg-accent"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!canCreate || createMolecule.isPending}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
          >
            {createMolecule.isPending ? 'Creating...' : 'Create Molecule'}
          </button>
        </div>
      </div>
    </div>
  );
}
