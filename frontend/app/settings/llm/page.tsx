'use client';

import { useState } from 'react';
import { AppLayout } from '@/components/layout';
import {
  useProviders,
  useLLMConfig,
  useUpdateProviderConfig,
  useUpdateBudgetConfig,
  useTestProvider,
  useBudgetStatus,
} from '@/hooks/llm';
import type {
  LLMProviderType,
  ProviderStatus,
  ProviderConfig,
  BudgetConfig,
} from '@/types/llm';
import { cn } from '@/lib/utils';
import {
  Settings,
  Cpu,
  DollarSign,
  Check,
  X,
  RefreshCw,
  Eye,
  EyeOff,
  Info,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';

export default function LLMSettingsPage() {
  return (
    <AppLayout showSidebar>
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Cpu className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">LLM Settings</h1>
          </div>
          <p className="text-muted-foreground">
            Configure AI providers, model preferences, and budget limits for Pact agents.
          </p>
        </div>

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8 dark:bg-blue-950 dark:border-blue-800">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div className="text-sm text-blue-800 dark:text-blue-200">
              <p className="font-medium mb-1">Multi-Provider LLM Support</p>
              <ul className="space-y-1 list-disc list-inside">
                <li><strong>OpenAI</strong> - GPT-5 family for general tasks and reasoning</li>
                <li><strong>Anthropic</strong> - Claude models for complex agents and coding</li>
                <li><strong>Ollama</strong> - Local models for privacy and cost-free operation</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="providers" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="providers">Providers</TabsTrigger>
            <TabsTrigger value="budget">Budget & Limits</TabsTrigger>
          </TabsList>

          <TabsContent value="providers">
            <ProviderSettings />
          </TabsContent>

          <TabsContent value="budget">
            <BudgetSettings />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

/** Display names for providers when no active instance exists */
const providerDisplayNames: Record<LLMProviderType, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  ollama: 'Ollama',
};

/**
 * Provider Settings Section
 *
 * Cards are driven by the admin config (which always lists all providers),
 * not by the active-providers list (which is empty when no API keys are set).
 */
function ProviderSettings() {
  const { data: providers, isLoading: loadingProviders } = useProviders();
  const { data: config, isLoading: loadingConfig } = useLLMConfig();

  if (loadingProviders || loadingConfig) {
    return <ProviderSettingsSkeleton />;
  }

  // Drive cards from admin config, merging active provider status when available
  const providerCards = (config?.providers || []).map((providerConfig) => {
    const activeProvider = providers?.providers.find(
      (p) => p.name === providerConfig.provider
    );
    const providerStatus: ProviderStatus = activeProvider || {
      name: providerConfig.provider,
      displayName: providerDisplayNames[providerConfig.provider],
      available: false,
      health: { available: false },
      supportedModels: providerConfig.defaultModel ? [providerConfig.defaultModel] : [],
      defaultModel: providerConfig.defaultModel || '',
    };
    return { providerStatus, providerConfig };
  });

  return (
    <div className="space-y-4">
      {providerCards.map(({ providerStatus, providerConfig }) => (
        <ProviderCard
          key={providerStatus.name}
          provider={providerStatus}
          config={providerConfig}
        />
      ))}
    </div>
  );
}

/**
 * Individual Provider Card
 */
function ProviderCard({
  provider,
  config,
}: {
  provider: ProviderStatus;
  config?: ProviderConfig;
}) {
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [endpoint, setEndpoint] = useState(config?.endpoint || '');
  const [defaultModel, setDefaultModel] = useState(config?.defaultModel || provider.defaultModel);

  const updateProvider = useUpdateProviderConfig();
  const testProvider = useTestProvider();

  const providerInfo: Record<LLMProviderType, { icon: string; color: string; description: string }> = {
    openai: {
      icon: 'O',
      color: 'bg-green-500',
      description: 'GPT-5 family - flagship reasoning and high-throughput tasks',
    },
    anthropic: {
      icon: 'A',
      color: 'bg-orange-500',
      description: 'Claude models - best for complex agents and coding',
    },
    ollama: {
      icon: 'L',
      color: 'bg-purple-500',
      description: 'Local models - free, private, no API key required',
    },
  };

  const info = providerInfo[provider.name];
  const isLocal = provider.name === 'ollama';

  const handleToggleEnabled = (enabled: boolean) => {
    updateProvider.mutate({
      provider: provider.name,
      enabled,
    });
  };

  const handleSaveApiKey = () => {
    if (apiKey) {
      updateProvider.mutate({
        provider: provider.name,
        apiKey,
      });
      setApiKey('');
    }
  };

  const handleSaveEndpoint = () => {
    updateProvider.mutate({
      provider: provider.name,
      endpoint: endpoint || undefined,
    });
  };

  const handleSaveDefaultModel = () => {
    updateProvider.mutate({
      provider: provider.name,
      defaultModel,
    });
  };

  const handleTestConnection = () => {
    testProvider.mutate(provider.name);
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold',
                info.color
              )}
            >
              {info.icon}
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                {provider.displayName}
                <Badge
                  variant={provider.available ? 'default' : 'secondary'}
                  className={cn(
                    'text-xs',
                    provider.available && 'bg-green-500 hover:bg-green-600'
                  )}
                >
                  {provider.available ? 'Connected' : 'Unavailable'}
                </Badge>
              </CardTitle>
              <CardDescription>{info.description}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTestConnection}
                    disabled={testProvider.isPending}
                  >
                    {testProvider.isPending ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Test connection</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Switch
              checked={config?.enabled ?? true}
              onCheckedChange={handleToggleEnabled}
              disabled={updateProvider.isPending}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* API Key (not for local) */}
        {!isLocal && (
          <div className="space-y-2">
            <Label htmlFor={`${provider.name}-api-key`}>API Key</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id={`${provider.name}-api-key`}
                  type={showApiKey ? 'text' : 'password'}
                  placeholder={config?.apiKeySet ? '••••••••••••••••' : 'Enter API key'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <Button
                onClick={handleSaveApiKey}
                disabled={!apiKey || updateProvider.isPending}
              >
                Save
              </Button>
            </div>
            {config?.apiKeySet && (
              provider.available ? (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <Check className="h-3 w-3" /> API key configured
                </p>
              ) : (
                <p className="text-xs text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> API key set but provider unavailable
                </p>
              )
            )}
          </div>
        )}

        {/* Endpoint (for Ollama) */}
        {isLocal && (
          <div className="space-y-2">
            <Label htmlFor={`${provider.name}-endpoint`}>Endpoint URL</Label>
            <div className="flex gap-2">
              <Input
                id={`${provider.name}-endpoint`}
                placeholder="http://localhost:11434"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
              />
              <Button
                onClick={handleSaveEndpoint}
                disabled={updateProvider.isPending}
              >
                Save
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Default: http://localhost:11434
            </p>
          </div>
        )}

        {/* Default Model */}
        <div className="space-y-2">
          <Label htmlFor={`${provider.name}-model`}>Default Model</Label>
          <div className="flex gap-2">
            <Select value={defaultModel} onValueChange={setDefaultModel}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                {provider.supportedModels.map((model) => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={handleSaveDefaultModel}
              disabled={defaultModel === config?.defaultModel || updateProvider.isPending}
            >
              Save
            </Button>
          </div>
        </div>

        {/* Health Info */}
        {provider.health.lastError && (
          <div className="p-3 bg-red-50 dark:bg-red-950 rounded-lg text-sm text-red-800 dark:text-red-200">
            <div className="flex items-start gap-2">
              <X className="h-4 w-4 mt-0.5" />
              <div>
                <p className="font-medium">Last Error</p>
                <p className="text-xs">{provider.health.lastError}</p>
                {provider.health.lastErrorAt && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(provider.health.lastErrorAt).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {typeof provider.health.averageLatencyMs === 'number' && provider.health.averageLatencyMs > 0 && (
          <p className="text-xs text-muted-foreground">
            Average latency: {Math.round(provider.health.averageLatencyMs)}ms
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Budget Settings Section
 */
function BudgetSettings() {
  const { data: config, isLoading } = useLLMConfig();
  const { dailyUtilization, monthlyUtilization } = useBudgetStatus();
  const updateBudget = useUpdateBudgetConfig();

  const [dailyLimit, setDailyLimit] = useState<string>('');
  const [monthlyLimit, setMonthlyLimit] = useState<string>('');
  const [warningThreshold, setWarningThreshold] = useState<string>('');
  const [hardStop, setHardStop] = useState(false);
  const [alertEmail, setAlertEmail] = useState('');

  // Initialize form when config loads
  useState(() => {
    if (config?.budget) {
      setDailyLimit(config.budget.dailyLimitUsd.toString());
      setMonthlyLimit(config.budget.monthlyLimitUsd.toString());
      setWarningThreshold(config.budget.warningThresholdPercent.toString());
      setHardStop(config.budget.hardStopEnabled);
      setAlertEmail(config.budget.alertEmail || '');
    }
  });

  if (isLoading) {
    return <BudgetSettingsSkeleton />;
  }

  const handleSave = () => {
    updateBudget.mutate({
      dailyLimitUsd: parseFloat(dailyLimit) || undefined,
      monthlyLimitUsd: parseFloat(monthlyLimit) || undefined,
      warningThresholdPercent: parseInt(warningThreshold) || undefined,
      hardStopEnabled: hardStop,
      alertEmail: alertEmail || undefined,
    });
  };

  const budget = config?.budget;

  return (
    <div className="space-y-6">
      {/* Current Usage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Current Usage
          </CardTitle>
          <CardDescription>
            Track your LLM spending against configured limits
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Daily Usage */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Daily Budget</span>
              <span className="font-medium">
                ${budget?.dailyLimitUsd.toFixed(2) || '0.00'} limit
              </span>
            </div>
            <Progress
              value={dailyUtilization}
              className={cn(
                'h-3',
                dailyUtilization >= 90 && '[&>div]:bg-red-500',
                dailyUtilization >= 70 && dailyUtilization < 90 && '[&>div]:bg-yellow-500'
              )}
            />
            <p className="text-xs text-muted-foreground">
              {dailyUtilization.toFixed(1)}% used today
            </p>
          </div>

          {/* Monthly Usage */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Monthly Budget</span>
              <span className="font-medium">
                ${budget?.monthlyLimitUsd.toFixed(2) || '0.00'} limit
              </span>
            </div>
            <Progress
              value={monthlyUtilization}
              className={cn(
                'h-3',
                monthlyUtilization >= 90 && '[&>div]:bg-red-500',
                monthlyUtilization >= 70 && monthlyUtilization < 90 && '[&>div]:bg-yellow-500'
              )}
            />
            <p className="text-xs text-muted-foreground">
              {monthlyUtilization.toFixed(1)}% used this month
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Budget Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Budget Limits
          </CardTitle>
          <CardDescription>
            Set spending limits to control costs
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="daily-limit">Daily Limit (USD)</Label>
              <Input
                id="daily-limit"
                type="number"
                step="0.01"
                min="0"
                placeholder={budget?.dailyLimitUsd.toString() || '10.00'}
                value={dailyLimit}
                onChange={(e) => setDailyLimit(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="monthly-limit">Monthly Limit (USD)</Label>
              <Input
                id="monthly-limit"
                type="number"
                step="0.01"
                min="0"
                placeholder={budget?.monthlyLimitUsd.toString() || '100.00'}
                value={monthlyLimit}
                onChange={(e) => setMonthlyLimit(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="warning-threshold">Warning Threshold (%)</Label>
            <Input
              id="warning-threshold"
              type="number"
              min="0"
              max="100"
              placeholder={budget?.warningThresholdPercent.toString() || '80'}
              value={warningThreshold}
              onChange={(e) => setWarningThreshold(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Show warnings when usage exceeds this percentage
            </p>
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <Label htmlFor="hard-stop">Hard Stop</Label>
              <p className="text-xs text-muted-foreground">
                Block requests when budget is exceeded
              </p>
            </div>
            <Switch
              id="hard-stop"
              checked={hardStop}
              onCheckedChange={setHardStop}
            />
          </div>

          {hardStop && (
            <div className="p-3 bg-yellow-50 dark:bg-yellow-950 rounded-lg text-sm text-yellow-800 dark:text-yellow-200">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5" />
                <p>
                  With hard stop enabled, all LLM requests will be blocked when
                  the budget limit is reached. Consider using local models as a fallback.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="alert-email">Alert Email (Optional)</Label>
            <Input
              id="alert-email"
              type="email"
              placeholder="admin@example.com"
              value={alertEmail}
              onChange={(e) => setAlertEmail(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Receive email alerts when thresholds are exceeded
            </p>
          </div>

          <Button
            onClick={handleSave}
            disabled={updateBudget.isPending}
            className="w-full"
          >
            {updateBudget.isPending ? 'Saving...' : 'Save Budget Settings'}
          </Button>
        </CardContent>
      </Card>

      {/* Cost Optimization Tips */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            Cost Optimization Tips
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 text-green-500 mt-0.5" />
              <span>Use <strong>Ollama</strong> for privacy-sensitive tasks - it's free!</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 text-green-500 mt-0.5" />
              <span>Use <strong>gpt-5-nano</strong> ($0.05/1M input) for simple classification tasks</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 text-green-500 mt-0.5" />
              <span>Reserve <strong>Claude Sonnet</strong> for complex agent workflows</span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="h-4 w-4 text-green-500 mt-0.5" />
              <span>Enable caching to reduce repeated requests</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Loading skeleton for provider settings
 */
function ProviderSettingsSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-48" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Loading skeleton for budget settings
 */
function BudgetSettingsSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-full" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
