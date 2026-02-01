'use client';

import { useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { ConfigValue } from '@/types/config';
import { useSetConfigValue, useResetConfigValue } from '@/hooks/config';
import {
  Database,
  FileCode,
  Server,
  RotateCcw,
  Check,
  X,
  AlertTriangle,
  Info,
  Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

interface ConfigFieldProps {
  config: ConfigValue;
  className?: string;
}

/**
 * Source indicator icon and color
 */
function SourceIndicator({ source }: { source: string }) {
  const sourceInfo = {
    database: { icon: Database, color: 'text-blue-500', label: 'UI Override' },
    environment: { icon: Server, color: 'text-amber-500', label: 'Environment' },
    code: { icon: FileCode, color: 'text-gray-400', label: 'Default' },
  };

  const info = sourceInfo[source as keyof typeof sourceInfo] || sourceInfo.code;
  const Icon = info.icon;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <Icon className={cn('h-4 w-4', info.color)} />
        </TooltipTrigger>
        <TooltipContent>
          <p>Source: {info.label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * ConfigField component - Renders the appropriate input for a configuration value
 */
export function ConfigField({ config, className }: ConfigFieldProps) {
  const [localValue, setLocalValue] = useState<unknown>(config.value);
  const [isEditing, setIsEditing] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [changeReason, setChangeReason] = useState('');

  const setConfigValue = useSetConfigValue();
  const resetConfigValue = useResetConfigValue();

  // Sync local value when config changes
  useEffect(() => {
    setLocalValue(config.value);
  }, [config.value]);

  const hasChanged = JSON.stringify(localValue) !== JSON.stringify(config.value);
  const isModified = config.source === 'database';
  const canEdit = config.isEditable;

  const handleSave = useCallback(() => {
    setConfigValue.mutate({
      domain: config.domain,
      key: config.key,
      value: localValue,
      reason: changeReason || undefined,
    });
    setIsEditing(false);
    setChangeReason('');
  }, [config.domain, config.key, localValue, changeReason, setConfigValue]);

  const handleCancel = useCallback(() => {
    setLocalValue(config.value);
    setIsEditing(false);
    setChangeReason('');
  }, [config.value]);

  const handleReset = useCallback(() => {
    resetConfigValue.mutate({
      domain: config.domain,
      key: config.key,
    });
    setShowResetDialog(false);
  }, [config.domain, config.key, resetConfigValue]);

  const renderInput = () => {
    if (!canEdit) {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="h-4 w-4" />
          <span className="font-mono">{formatValue(config.value, config.valueType)}</span>
        </div>
      );
    }

    switch (config.valueType) {
      case 'boolean':
        return (
          <Switch
            checked={localValue as boolean}
            onCheckedChange={(checked) => {
              setLocalValue(checked);
              // Auto-save boolean changes
              setConfigValue.mutate({
                domain: config.domain,
                key: config.key,
                value: checked,
              });
            }}
            disabled={setConfigValue.isPending}
          />
        );

      case 'number':
        return (
          <Input
            type="number"
            value={localValue as number}
            onChange={(e) => setLocalValue(parseFloat(e.target.value) || 0)}
            onFocus={() => setIsEditing(true)}
            min={config.validation?.min}
            max={config.validation?.max}
            className="w-32 font-mono"
          />
        );

      case 'string':
        if (config.validation?.enum) {
          return (
            <Select
              value={localValue as string}
              onValueChange={(value) => {
                setLocalValue(value);
                // Auto-save enum changes
                setConfigValue.mutate({
                  domain: config.domain,
                  key: config.key,
                  value,
                });
              }}
            >
              <SelectTrigger className="w-40" disabled={setConfigValue.isPending}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {config.validation.enum.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        }
        return (
          <Input
            type="text"
            value={localValue as string}
            onChange={(e) => setLocalValue(e.target.value)}
            onFocus={() => setIsEditing(true)}
            className="w-64 font-mono"
          />
        );

      case 'json':
        return (
          <Textarea
            value={typeof localValue === 'string' ? localValue : JSON.stringify(localValue, null, 2)}
            onChange={(e) => {
              try {
                setLocalValue(JSON.parse(e.target.value));
              } catch {
                // Keep as string if not valid JSON
                setLocalValue(e.target.value);
              }
            }}
            onFocus={() => setIsEditing(true)}
            className="w-64 h-24 font-mono text-xs"
          />
        );

      default:
        return (
          <span className="font-mono text-sm">{formatValue(config.value, config.valueType)}</span>
        );
    }
  };

  return (
    <div className={cn('py-4 border-b last:border-b-0', className)}>
      <div className="flex items-start justify-between gap-4">
        {/* Left side - label and description */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Label className="font-medium">{formatKey(config.key)}</Label>
            <SourceIndicator source={config.source} />
            {config.requiresRestart && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Requires restart to take effect</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {!canEdit && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Lock className="h-4 w-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Read-only configuration</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">{config.description}</p>
          {config.envVarName && (
            <p className="text-xs text-muted-foreground mt-1 font-mono">
              ENV: {config.envVarName}
            </p>
          )}
          {config.validation && (
            <p className="text-xs text-muted-foreground mt-1">
              {config.validation.min !== undefined && `Min: ${config.validation.min}`}
              {config.validation.min !== undefined && config.validation.max !== undefined && ' | '}
              {config.validation.max !== undefined && `Max: ${config.validation.max}`}
            </p>
          )}
        </div>

        {/* Right side - input and actions */}
        <div className="flex items-center gap-2">
          {renderInput()}

          {/* Save/Cancel buttons when editing */}
          {isEditing && hasChanged && (
            <>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={setConfigValue.isPending}
              >
                <Check className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCancel}
              >
                <X className="h-4 w-4" />
              </Button>
            </>
          )}

          {/* Reset button when modified */}
          {isModified && canEdit && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowResetDialog(true)}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Reset to default</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {/* Reset confirmation dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Configuration</DialogTitle>
            <DialogDescription>
              This will remove the UI override and revert to the{' '}
              {config.envVarName ? 'environment or default' : 'default'} value.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Current value:</span>
              <span className="font-mono">{formatValue(config.value, config.valueType)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Will revert to:</span>
              <span className="font-mono">
                {formatValue(config.envValue ?? config.codeDefault, config.valueType)}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReset}
              disabled={resetConfigValue.isPending}
            >
              {resetConfigValue.isPending ? 'Resetting...' : 'Reset to Default'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Format a config key for display
 */
function formatKey(key: string): string {
  return key
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Format a config value for display
 */
function formatValue(value: unknown, type: string): string {
  if (value === null || value === undefined) return '-';
  if (type === 'boolean') return value ? 'Enabled' : 'Disabled';
  if (type === 'json') return JSON.stringify(value);
  if (type === 'number') return value.toString();
  return String(value);
}
