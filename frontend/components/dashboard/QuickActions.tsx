'use client';

import Link from 'next/link';
import { useRefinementWizardStore } from '@/stores/refinement-wizard';

/**
 * Quick action buttons for dashboard
 */
export function QuickActions() {
  const { openWizard } = useRefinementWizardStore();

  const actions = [
    {
      label: 'Create New Atom',
      description: 'Start with natural language intent',
      onClick: openWizard,
      primary: true,
    },
    {
      label: 'Browse Atoms',
      description: 'Search and filter all atoms',
      href: '/atoms',
    },
    {
      label: 'Start Reconciliation',
      description: 'Analyze repository for intent',
      href: '/reconciliation',
    },
  ];

  return (
    <div className="bg-card rounded-lg border p-6">
      <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
      <div className="space-y-3">
        {actions.map((action) =>
          action.href ? (
            <Link
              key={action.label}
              href={action.href}
              className="block p-4 rounded-lg border hover:bg-accent transition-colors"
            >
              <p className="font-medium">{action.label}</p>
              <p className="text-sm text-muted-foreground">
                {action.description}
              </p>
            </Link>
          ) : (
            <button
              key={action.label}
              onClick={action.onClick}
              className={`w-full text-left p-4 rounded-lg border transition-colors ${
                action.primary
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'hover:bg-accent'
              }`}
            >
              <p className="font-medium">{action.label}</p>
              <p
                className={`text-sm ${
                  action.primary
                    ? 'text-primary-foreground/80'
                    : 'text-muted-foreground'
                }`}
              >
                {action.description}
              </p>
            </button>
          )
        )}
      </div>
    </div>
  );
}
