'use client';

import DatabaseConnectionMonitor from '@/components/DatabaseConnectionMonitor';

export default function DatabasePage() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Database Connection Monitoring</h1>
        <p className="text-muted-foreground">
          Real-time monitoring of database connection pools and performance metrics
        </p>
      </div>

      <DatabaseConnectionMonitor />
    </div>
  );
}