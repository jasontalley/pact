'use client';

import Link from 'next/link';
import { AppLayout } from '@/components/layout';
import {
  Settings,
  Cpu,
  Shield,
  Activity,
  FileCode,
  FolderOpen,
  History,
  Key,
  ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface SettingsSection {
  href: string;
  title: string;
  description: string;
  icon: React.ElementType;
}

const settingsSections: SettingsSection[] = [
  {
    href: '/settings/llm',
    title: 'LLM Providers',
    description: 'Configure AI providers, model preferences, and budget limits',
    icon: Cpu,
  },
  {
    href: '/settings/repository',
    title: 'Repository',
    description: 'Configure the target repository for analysis and reconciliation',
    icon: FolderOpen,
  },
  {
    href: '/settings/api-keys',
    title: 'API Keys',
    description: 'Manage API keys for CLI, CI/CD, and external integrations',
    icon: Key,
  },
  {
    href: '/settings/system',
    title: 'System Configuration',
    description: 'Agent settings, resilience, safety, observability, and feature flags',
    icon: Settings,
  },
  {
    href: '/settings/invariants',
    title: 'Invariants',
    description: 'System-wide rules and constraints for validation',
    icon: Shield,
  },
  {
    href: '/settings/system/audit',
    title: 'Audit Log',
    description: 'View configuration change history',
    icon: History,
  },
];

export default function SettingsPage() {
  return (
    <AppLayout showSidebar>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Settings className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">Settings</h1>
          </div>
          <p className="text-muted-foreground">
            Configure system-wide settings, AI providers, and more.
          </p>
        </div>

        {/* Settings Sections */}
        <div className="grid gap-4">
          {settingsSections.map((section) => {
            const Icon = section.icon;
            return (
              <Link key={section.href} href={section.href}>
                <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <CardTitle className="text-lg">{section.title}</CardTitle>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>{section.description}</CardDescription>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
