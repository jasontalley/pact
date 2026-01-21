'use client';

import { useAtoms } from '@/hooks/atoms/use-atoms';

/**
 * Dashboard statistics cards
 */
export function DashboardStats() {
  const { data: draftData } = useAtoms({ status: 'draft', limit: 1 });
  const { data: committedData } = useAtoms({ status: 'committed', limit: 1 });
  const { data: supersededData } = useAtoms({ status: 'superseded', limit: 1 });
  const { data: allData } = useAtoms({ limit: 1 });

  const stats = [
    {
      label: 'Total Atoms',
      value: allData?.total ?? 0,
      description: 'All intent atoms in the system',
    },
    {
      label: 'Draft',
      value: draftData?.total ?? 0,
      description: 'Atoms in draft status',
      color: 'text-blue-600',
    },
    {
      label: 'Committed',
      value: committedData?.total ?? 0,
      description: 'Immutable committed atoms',
      color: 'text-green-600',
    },
    {
      label: 'Superseded',
      value: supersededData?.total ?? 0,
      description: 'Atoms replaced by newer versions',
      color: 'text-gray-500',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="bg-card rounded-lg border p-6 shadow-sm"
        >
          <p className="text-sm font-medium text-muted-foreground">
            {stat.label}
          </p>
          <p className={`text-3xl font-bold mt-2 ${stat.color || ''}`}>
            {stat.value}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {stat.description}
          </p>
        </div>
      ))}
    </div>
  );
}
