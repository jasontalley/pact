'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ValidatorTypeBadge } from './ValidatorTypeBadge';
import { ValidatorFormatBadge } from './ValidatorFormatBadge';
import { useCreateValidator } from '@/hooks/validators';
import { useTemplates, useInstantiateTemplate } from '@/hooks/validators';
import type {
  ValidatorType,
  ValidatorFormat,
  TemplateCategory,
  ValidatorTemplate,
} from '@/types/validator';
import { X, FileText, Layout, Sparkles, Search, ChevronRight, Check } from 'lucide-react';

interface CreateValidatorDialogProps {
  atomId: string;
  isOpen: boolean;
  onClose: () => void;
}

type CreationMethod = 'write' | 'template' | 'ai';
type Step = 'method' | 'write' | 'template-browse' | 'template-params' | 'review';

const validatorTypes: { value: ValidatorType; label: string; description: string }[] = [
  { value: 'gherkin', label: 'Gherkin', description: 'Given/When/Then BDD scenarios' },
  { value: 'executable', label: 'Executable', description: 'TypeScript test code' },
  { value: 'declarative', label: 'Declarative', description: 'Natural language rules' },
];

const validatorFormats: { value: ValidatorFormat; label: string }[] = [
  { value: 'gherkin', label: 'Gherkin' },
  { value: 'natural_language', label: 'Natural Language' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'json', label: 'JSON' },
];

const categoryLabels: Record<TemplateCategory, string> = {
  authentication: 'Authentication',
  authorization: 'Authorization',
  'data-integrity': 'Data Integrity',
  performance: 'Performance',
  'state-transition': 'State Transition',
  'error-handling': 'Error Handling',
  custom: 'Custom',
};

/**
 * Multi-step dialog for creating validators
 */
export function CreateValidatorDialog({ atomId, isOpen, onClose }: CreateValidatorDialogProps) {
  // Step state
  const [step, setStep] = useState<Step>('method');
  const [creationMethod, setCreationMethod] = useState<CreationMethod | null>(null);

  // Write mode state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [validatorType, setValidatorType] = useState<ValidatorType>('gherkin');
  const [format, setFormat] = useState<ValidatorFormat>('gherkin');
  const [content, setContent] = useState('');

  // Template mode state
  const [categoryFilter, setCategoryFilter] = useState<TemplateCategory | ''>('');
  const [templateSearch, setTemplateSearch] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<ValidatorTemplate | null>(null);
  const [templateParams, setTemplateParams] = useState<Record<string, string>>({});
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');

  // API hooks
  const createValidator = useCreateValidator();
  const instantiateTemplate = useInstantiateTemplate();
  const { data: templatesData, isLoading: templatesLoading } = useTemplates({
    category: categoryFilter || undefined,
    search: templateSearch || undefined,
    limit: 50,
  });

  const templates = templatesData?.data || [];

  if (!isOpen) return null;

  const handleClose = () => {
    // Reset state
    setStep('method');
    setCreationMethod(null);
    setName('');
    setDescription('');
    setValidatorType('gherkin');
    setFormat('gherkin');
    setContent('');
    setCategoryFilter('');
    setTemplateSearch('');
    setSelectedTemplate(null);
    setTemplateParams({});
    setTemplateName('');
    setTemplateDescription('');
    onClose();
  };

  const handleMethodSelect = (method: CreationMethod) => {
    setCreationMethod(method);
    if (method === 'write') {
      setStep('write');
    } else if (method === 'template') {
      setStep('template-browse');
    } else if (method === 'ai') {
      // AI mode - for now, redirect to write mode
      setStep('write');
    }
  };

  const handleTemplateSelect = (template: ValidatorTemplate) => {
    setSelectedTemplate(template);
    // Initialize params with empty strings for required fields
    const initialParams: Record<string, string> = {};
    for (const paramName of template.parametersSchema.required || []) {
      initialParams[paramName] = '';
    }
    setTemplateParams(initialParams);
    setTemplateName('');
    setTemplateDescription('');
    setStep('template-params');
  };

  const handleCreateFromWrite = () => {
    if (!name.trim() || !content.trim()) return;

    createValidator.mutate(
      {
        atomId,
        name: name.trim(),
        description: description.trim() || undefined,
        validatorType,
        content: content.trim(),
        format,
      },
      {
        onSuccess: () => handleClose(),
      }
    );
  };

  const handleCreateFromTemplate = () => {
    if (!selectedTemplate) return;

    // Validate required params
    const missingParams = (selectedTemplate.parametersSchema.required || []).filter(
      (param) => !templateParams[param]?.trim()
    );
    if (missingParams.length > 0) {
      alert(`Please fill in required parameters: ${missingParams.join(', ')}`);
      return;
    }

    instantiateTemplate.mutate(
      {
        templateId: selectedTemplate.id,
        data: {
          atomId,
          parameters: templateParams,
          name: templateName.trim() || undefined,
          description: templateDescription.trim() || undefined,
        },
      },
      {
        onSuccess: () => handleClose(),
      }
    );
  };

  const canProceedFromWrite = name.trim().length >= 3 && content.trim().length >= 10;

  const renderStep = () => {
    switch (step) {
      case 'method':
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              How would you like to create this validator?
            </p>
            <div className="grid gap-3">
              <button
                onClick={() => handleMethodSelect('write')}
                className="flex items-center gap-4 p-4 border rounded-lg hover:bg-accent text-left"
              >
                <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                  <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h4 className="font-medium">Write Manually</h4>
                  <p className="text-sm text-muted-foreground">
                    Write your validator in Gherkin, natural language, or code
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 ml-auto text-muted-foreground" />
              </button>

              <button
                onClick={() => handleMethodSelect('template')}
                className="flex items-center gap-4 p-4 border rounded-lg hover:bg-accent text-left"
              >
                <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                  <Layout className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h4 className="font-medium">Use Template</h4>
                  <p className="text-sm text-muted-foreground">
                    Choose from 20+ pre-built validation patterns
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 ml-auto text-muted-foreground" />
              </button>

              <button
                onClick={() => handleMethodSelect('ai')}
                className="flex items-center gap-4 p-4 border rounded-lg hover:bg-accent text-left opacity-50 cursor-not-allowed"
                disabled
              >
                <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                  <Sparkles className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h4 className="font-medium">AI Generate</h4>
                  <p className="text-sm text-muted-foreground">
                    Describe what to validate and let AI generate it (coming soon)
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 ml-auto text-muted-foreground" />
              </button>
            </div>
          </div>
        );

      case 'write':
        return (
          <div className="space-y-4">
            {/* Name */}
            <div>
              <label className="text-sm font-medium block mb-1">Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Authentication Required Check"
                className="w-full px-3 py-2 border rounded-md"
                autoFocus
              />
            </div>

            {/* Description */}
            <div>
              <label className="text-sm font-medium block mb-1">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this validator check?"
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>

            {/* Type & Format */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium block mb-1">Type *</label>
                <select
                  value={validatorType}
                  onChange={(e) => setValidatorType(e.target.value as ValidatorType)}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  {validatorTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Format *</label>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as ValidatorFormat)}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  {validatorFormats.map((fmt) => (
                    <option key={fmt.value} value={fmt.value}>
                      {fmt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Content */}
            <div>
              <label className="text-sm font-medium block mb-1">Content *</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={
                  format === 'gherkin'
                    ? 'Given a user with valid credentials\nWhen they submit the login form\nThen they are authenticated successfully'
                    : format === 'natural_language'
                      ? 'User must be authenticated before accessing protected resources'
                      : 'Enter your validator content...'
                }
                className="w-full h-48 px-3 py-2 border rounded-md font-mono text-sm resize-none"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Minimum 10 characters required
              </p>
            </div>
          </div>
        );

      case 'template-browse':
        return (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={templateSearch}
                  onChange={(e) => setTemplateSearch(e.target.value)}
                  placeholder="Search templates..."
                  className="w-full pl-9 pr-3 py-2 border rounded-md"
                />
              </div>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as TemplateCategory | '')}
                className="px-3 py-2 border rounded-md"
              >
                <option value="">All Categories</option>
                {Object.entries(categoryLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {/* Template List */}
            <div className="max-h-[400px] overflow-y-auto border rounded-lg divide-y">
              {templatesLoading ? (
                <div className="p-8 text-center text-muted-foreground">
                  Loading templates...
                </div>
              ) : templates.length > 0 ? (
                templates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => handleTemplateSelect(template)}
                    className="w-full p-4 text-left hover:bg-accent transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium">{template.name}</h4>
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
                          {template.description}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <span className="text-xs px-2 py-0.5 bg-muted rounded">
                            {categoryLabels[template.category]}
                          </span>
                          <ValidatorFormatBadge format={template.format} />
                          {template.isBuiltin && (
                            <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded">
                              Built-in
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-1" />
                    </div>
                  </button>
                ))
              ) : (
                <div className="p-8 text-center text-muted-foreground">
                  No templates found matching your criteria
                </div>
              )}
            </div>
          </div>
        );

      case 'template-params':
        if (!selectedTemplate) return null;
        return (
          <div className="space-y-4">
            {/* Selected Template Info */}
            <div className="p-4 bg-muted rounded-lg">
              <h4 className="font-medium">{selectedTemplate.name}</h4>
              <p className="text-sm text-muted-foreground mt-1">
                {selectedTemplate.description}
              </p>
            </div>

            {/* Parameters */}
            <div className="space-y-3">
              <h5 className="font-medium">Parameters</h5>
              {Object.entries(selectedTemplate.parametersSchema.properties).map(([paramName, schema]) => {
                const isRequired = selectedTemplate.parametersSchema.required?.includes(paramName);
                return (
                  <div key={paramName}>
                    <label className="text-sm font-medium block mb-1">
                      {paramName} {isRequired && '*'}
                    </label>
                    <input
                      type="text"
                      value={templateParams[paramName] || ''}
                      onChange={(e) =>
                        setTemplateParams({ ...templateParams, [paramName]: e.target.value })
                      }
                      placeholder={schema.description}
                      className="w-full px-3 py-2 border rounded-md"
                    />
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {schema.description}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Optional Overrides */}
            <div className="space-y-3 pt-4 border-t">
              <h5 className="font-medium">Optional Overrides</h5>
              <div>
                <label className="text-sm font-medium block mb-1">Custom Name</label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder={`Default: ${selectedTemplate.name}`}
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Custom Description</label>
                <input
                  type="text"
                  value={templateDescription}
                  onChange={(e) => setTemplateDescription(e.target.value)}
                  placeholder="Override the default description"
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
            </div>

            {/* Preview */}
            {selectedTemplate.exampleUsage && (
              <div className="pt-4 border-t">
                <h5 className="font-medium mb-2">Example Usage</h5>
                <pre className="p-3 bg-muted rounded-lg text-xs overflow-x-auto whitespace-pre-wrap">
                  {selectedTemplate.exampleUsage}
                </pre>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  const stepTitle = {
    method: 'Create Validator',
    write: 'Write Validator',
    'template-browse': 'Choose Template',
    'template-params': 'Configure Template',
    review: 'Review',
  };

  const isCreating = createValidator.isPending || instantiateTemplate.isPending;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-validator-dialog-title"
        className="bg-card rounded-lg border shadow-lg max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="p-6 border-b flex items-center justify-between flex-shrink-0">
          <div>
            <h2 id="create-validator-dialog-title" className="text-xl font-semibold">
              {stepTitle[step]}
            </h2>
            {step !== 'method' && (
              <p className="text-sm text-muted-foreground mt-1">
                {creationMethod === 'template' ? 'From Template' : 'Manual Entry'}
              </p>
            )}
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
        <div className="p-6 overflow-y-auto flex-1">
          {renderStep()}
        </div>

        {/* Footer */}
        <div className="p-6 border-t flex justify-between flex-shrink-0">
          <button
            onClick={step === 'method' ? handleClose : () => {
              if (step === 'write') setStep('method');
              else if (step === 'template-browse') setStep('method');
              else if (step === 'template-params') setStep('template-browse');
            }}
            className="px-4 py-2 border rounded-lg hover:bg-accent"
          >
            {step === 'method' ? 'Cancel' : 'Back'}
          </button>

          <div className="flex gap-2">
            {step === 'write' && (
              <button
                onClick={handleCreateFromWrite}
                disabled={!canProceedFromWrite || isCreating}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
              >
                {isCreating ? 'Creating...' : 'Create Validator'}
              </button>
            )}

            {step === 'template-params' && (
              <button
                onClick={handleCreateFromTemplate}
                disabled={isCreating}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
              >
                {isCreating ? 'Creating...' : 'Create from Template'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
