# Design System Implementation

## Status: Pending

## Description
Implement a comprehensive design system using shadcn/ui + Radix UI primitives to create a professional, accessible, and consistent user interface for the monitor application.

## Design System Architecture

### Core Foundation
```typescript
// Theme Configuration with CSS Variables
interface ThemeConfig {
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    muted: string;
    success: string;
    warning: string;
    destructive: string;
    background: string;
    foreground: string;
    border: string;
  };
  spacing: Record<string, string>;
  typography: Record<string, string>;
  borderRadius: Record<string, string>;
  shadows: Record<string, string>;
}
```

### shadcn/ui Components to Install
```bash
# Core Components
npx shadcn-ui@latest add button
npx shadcn-ui@latest add card
npx shadcn-ui@latest add input
npx shadcn-ui@latest add label
npx shadcn-ui@latest add form

# Layout Components  
npx shadcn-ui@latest add sheet
npx shadcn-ui@latest add dialog
npx shadcn-ui@latest add tabs
npx shadcn-ui@latest add separator
npx shadcn-ui@latest add scroll-area

# Data Display
npx shadcn-ui@latest add table
npx shadcn-ui@latest add badge
npx shadcn-ui@latest add progress
npx shadcn-ui@latest add avatar
npx shadcn-ui@latest add skeleton

# Navigation
npx shadcn-ui@latest add dropdown-menu
npx shadcn-ui@latest add navigation-menu
npx shadcn-ui@latest add command
npx shadcn-ui@latest add popover

# Form Controls
npx shadcn-ui@latest add select
npx shadcn-ui@latest add switch
npx shadcn-ui@latest add checkbox
npx shadcn-ui@latest add slider
npx shadcn-ui@latest add textarea

# Feedback
npx shadcn-ui@latest add toast
npx shadcn-ui@latest add alert
npx shadcn-ui@latest add alert-dialog
npx shadcn-ui@latest add tooltip

# Advanced
npx shadcn-ui@latest add data-table
npx shadcn-ui@latest add date-picker
npx shadcn-ui@latest add calendar
npx shadcn-ui@latest add aspect-ratio
```

### Component Patterns

#### Job Status System
```typescript
// Status variants with consistent colors
const jobStatusVariants = {
  pending: "secondary",     // Gray
  assigned: "default",      // Blue  
  active: "default",        // Blue
  completed: "success",     // Green
  failed: "destructive",    // Red
  cancelled: "outline",     // Gray outline
  unworkable: "warning"     // Yellow
} as const;

// Badge component usage
<Badge variant={jobStatusVariants[job.status]}>
  {job.status.toUpperCase()}
</Badge>
```

#### Priority Indicators
```typescript
// Priority system with visual hierarchy
const priorityConfig = {
  1: { color: "text-red-600", label: "Urgent", variant: "destructive" },
  25: { color: "text-orange-500", label: "High", variant: "warning" },
  50: { color: "text-blue-500", label: "Normal", variant: "default" },
  75: { color: "text-gray-500", label: "Low", variant: "secondary" }
} as const;

// Usage in components
<Badge variant={priorityConfig[job.priority].variant}>
  {priorityConfig[job.priority].label}
</Badge>
```

#### Card Layouts
```typescript
// Consistent card structure for all entities
const JobCard = ({ job }: { job: Job }) => (
  <Card className="hover:shadow-md transition-shadow">
    <CardHeader className="pb-2">
      <div className="flex items-center justify-between">
        <CardTitle className="text-sm font-medium">{job.id}</CardTitle>
        <Badge variant={jobStatusVariants[job.status]}>
          {job.status}
        </Badge>
      </div>
    </CardHeader>
    <CardContent className="space-y-2">
      <div className="flex items-center space-x-2">
        <Badge variant="outline">{job.job_type}</Badge>
        <Badge variant={priorityConfig[job.priority].variant}>
          P{job.priority}
        </Badge>
      </div>
      {job.workflow_id && (
        <div className="text-xs text-muted-foreground">
          Workflow: {job.workflow_id}
        </div>
      )}
    </CardContent>
    <CardFooter className="pt-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>View Details</DropdownMenuItem>
          <DropdownMenuItem>Cancel Job</DropdownMenuItem>
          <DropdownMenuItem>Retry Job</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </CardFooter>
  </Card>
);
```

### Form Patterns with react-hook-form + Zod
```typescript
// Zod schema for job submission
const jobSubmissionSchema = z.object({
  jobType: z.string().min(1, "Job type is required"),
  priority: z.number().min(1).max(100),
  payload: z.record(z.any()),
  workflowSimulation: z.boolean().default(false),
  stepCount: z.number().min(1).max(10).optional(),
});

// Form component with shadcn Form
const JobSubmissionForm = () => {
  const form = useForm<z.infer<typeof jobSubmissionSchema>>({
    resolver: zodResolver(jobSubmissionSchema),
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="jobType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Job Type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select job type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="simulation">Simulation</SelectItem>
                  <SelectItem value="comfyui">ComfyUI</SelectItem>
                  <SelectItem value="a1111">Automatic1111</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="priority"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Priority: {field.value}</FormLabel>
              <FormControl>
                <Slider
                  min={1}
                  max={100}
                  step={1}
                  value={[field.value]}
                  onValueChange={(value) => field.onChange(value[0])}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
};
```

### Dark/Light Theme Implementation
```typescript
// Theme provider with system preference
const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
        .matches ? 'dark' : 'light';
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

// Theme toggle component
const ThemeToggle = () => {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
```

## Tasks
- [ ] Install and configure shadcn/ui with Next.js 14
- [ ] Set up Tailwind CSS with CSS variables for theming
- [ ] Install all required shadcn/ui components
- [ ] Create theme provider with light/dark/system modes
- [ ] Set up Lucide React icons library
- [ ] Create consistent color system for job statuses
- [ ] Implement priority indicator system
- [ ] Create reusable card patterns for jobs/workers
- [ ] Set up form patterns with react-hook-form + Zod
- [ ] Implement responsive breakpoint system
- [ ] Create animation and transition patterns
- [ ] Set up accessibility standards (ARIA, focus management)
- [ ] Create component documentation with Storybook (optional)
- [ ] Implement design tokens for consistent spacing/typography

## Priority: High

## Dependencies
- monitor-app-setup.md (Next.js project)
- Tailwind CSS configuration
- TypeScript setup

## Files to Create
- `src/lib/theme-provider.tsx`
- `src/components/ui/` - shadcn/ui components
- `src/lib/utils.ts` - Utility functions
- `src/styles/globals.css` - CSS variables and base styles
- `tailwind.config.js` - Tailwind configuration
- `components.json` - shadcn/ui configuration

## Acceptance Criteria
- [ ] All shadcn/ui components installed and configured
- [ ] Dark/light/system theme switching works seamlessly
- [ ] Consistent color system across all components
- [ ] Responsive design works on all screen sizes
- [ ] Form validation works with proper error states
- [ ] Accessibility standards met (WCAG 2.1)
- [ ] Component patterns are reusable and consistent
- [ ] Performance is optimized (no layout shift, fast interactions)