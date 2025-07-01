# Core Components Implementation

## Status: Pending

## Description
Create the core React components for the Next.js monitor app, including job cards, worker status, connection indicators, and layout components.

## Component Architecture Built on shadcn/ui + Radix

### Layout Components
```typescript
// RootLayout - Main app layout with shadcn/ui components
interface RootLayoutProps {
  children: React.ReactNode;
}
// Uses: shadcn/ui Layout primitives, ThemeProvider, Toaster

// DashboardLayout - Dashboard with Radix Sheet sidebar
interface DashboardLayoutProps {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
}
// Uses: Sheet (Radix), Card (shadcn), ScrollArea (shadcn)

// NavigationSidebar - Collapsible nav with Radix Collapsible
interface NavigationSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}
// Uses: Sheet, Collapsible, NavigationMenu (Radix), Button (shadcn)
```

### Job Components
```typescript
// JobCard - Individual job display with shadcn/ui Card
interface JobCardProps {
  job: Job;
  compact?: boolean;
  showActions?: boolean;
  onCancel?: (jobId: string) => void;
  onRetry?: (jobId: string) => void;
  onViewDetails?: (jobId: string) => void;
}
// Uses: Card, Badge, Button, Progress, DropdownMenu (shadcn)

// JobList - Virtualized list with Radix ScrollArea
interface JobListProps {
  jobs: Job[];
  loading?: boolean;
  emptyMessage?: string;
  onJobSelect?: (jobId: string) => void;
}
// Uses: ScrollArea, Card, Skeleton (shadcn), VirtualizedList

// JobFilters - Filter controls with Radix components
interface JobFiltersProps {
  filters: JobFilter;
  onFiltersChange: (filters: JobFilter) => void;
}
// Uses: Select, Switch, DatePicker, Popover, Checkbox (Radix/shadcn)

// JobDetails - Detailed view with Radix Dialog/Sheet
interface JobDetailsProps {
  jobId: string;
  onClose: () => void;
}
// Uses: Dialog/Sheet, Tabs, Separator, ScrollArea (shadcn)
```

### Worker Components
```typescript
// WorkerCard - Individual worker display with status indicators
interface WorkerCardProps {
  worker: Worker;
  compact?: boolean;
  showDetails?: boolean;
}
// Uses: Card, Badge, Avatar, Tooltip, Progress (shadcn)

// WorkerGrid - Responsive grid with loading states
interface WorkerGridProps {
  workers: Worker[];
  loading?: boolean;
  onWorkerSelect?: (workerId: string) => void;
}
// Uses: Card, Skeleton, AspectRatio (shadcn), CSS Grid

// WorkerStatus - Real-time status with Radix Tooltip
interface WorkerStatusProps {
  worker: Worker;
  showTooltip?: boolean;
}
// Uses: Tooltip, Badge, HoverCard (Radix/shadcn)
```

### Advanced UI Components
```typescript
// ConnectionIndicator - WebSocket status with Radix Tooltip
interface ConnectionIndicatorProps {
  isConnected: boolean;
  reconnecting?: boolean;
  lastHeartbeat?: Date;
}
// Uses: Tooltip, Badge, animated ping effect, Lucide icons

// LogViewer - Debug logs with shadcn ScrollArea + Command
interface LogViewerProps {
  entries: LogEntry[];
  filter?: LogFilter;
  onFilterChange?: (filter: LogFilter) => void;
  maxHeight?: number;
}
// Uses: ScrollArea, Command, Popover, Input, Select (shadcn)

// StatsCard - Metrics with Radix hover effects
interface StatsCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon?: React.ReactNode;
}
// Uses: Card, HoverCard, Chart components, Lucide icons

// ThemeToggle - Light/dark mode with Radix Switch
interface ThemeToggleProps {
  theme: 'light' | 'dark' | 'system';
  onThemeChange: (theme: string) => void;
}
// Uses: DropdownMenu, Switch, Sun/Moon icons (Lucide)

// CommandPalette - Quick actions with shadcn Command
interface CommandPaletteProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}
// Uses: Command, Dialog, Command.Input, Command.List (shadcn)
```

## Tasks
- [ ] Install shadcn/ui components: Card, Button, Badge, Dialog, Sheet, Tabs
- [ ] Install Radix primitives: Select, Switch, Tooltip, Progress, ScrollArea
- [ ] Set up Lucide React icons library
- [ ] Create RootLayout with ThemeProvider and Toaster
- [ ] Build NavigationSidebar with Radix Sheet + Collapsible
- [ ] Implement JobCard with Card, Badge, Progress, DropdownMenu
- [ ] Create JobList with virtualized ScrollArea + Skeleton loading
- [ ] Build JobFilters using Select, DatePicker, Popover, Checkbox
- [ ] Implement JobDetails with Dialog/Sheet + Tabs + ScrollArea
- [ ] Create WorkerCard with Avatar, Tooltip, Badge components
- [ ] Build WorkerGrid with responsive Card grid + AspectRatio
- [ ] Implement ConnectionIndicator with Tooltip + animated Badge
- [ ] Create LogViewer with ScrollArea + Command + filtering
- [ ] Build StatsCard with HoverCard + Chart + Lucide icons
- [ ] Create ThemeToggle with DropdownMenu + Switch
- [ ] Implement CommandPalette with Command + Dialog
- [ ] Add proper TypeScript interfaces for all Radix props
- [ ] Implement full accessibility (ARIA, keyboard nav, focus management)
- [ ] Create responsive design using Tailwind breakpoints
- [ ] Add smooth animations using Tailwind + Radix animation APIs

## Priority: High

## Dependencies
- monitor-app-setup.md (project structure)
- monitor-state-management.md (Zustand stores)
- shadcn/ui component library

## Files to Create
- `src/components/layout/RootLayout.tsx`
- `src/components/layout/DashboardLayout.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/components/jobs/JobCard.tsx`
- `src/components/jobs/JobList.tsx`
- `src/components/jobs/JobFilters.tsx`
- `src/components/jobs/JobDetails.tsx`
- `src/components/workers/WorkerCard.tsx`
- `src/components/workers/WorkerGrid.tsx`
- `src/components/workers/WorkerStatus.tsx`
- `src/components/ui/ConnectionIndicator.tsx`
- `src/components/ui/LogViewer.tsx`
- `src/components/ui/StatsCard.tsx`
- `src/components/ui/LoadingSpinner.tsx`
- `__tests__/components/` - Test files for each component

## Acceptance Criteria
- [ ] All components are fully typed with TypeScript
- [ ] Components are responsive and mobile-friendly
- [ ] Proper accessibility features implemented
- [ ] Components integrate seamlessly with Zustand stores
- [ ] Virtualization works efficiently for large lists
- [ ] Real-time updates don't cause performance issues
- [ ] Consistent design system across all components
- [ ] 85%+ test coverage for all components