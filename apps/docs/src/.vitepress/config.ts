import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'
import type { DefaultTheme, UserConfig } from 'vitepress'

const config = defineConfig({
  cacheDir: '.vitepress/.cache',
  outDir: '.vitepress/dist',
  title: "EmProps Job Queue",
  description: "Documentation for the EmProps Job Queue System",
  base: '/',
  lastUpdated: true,
  cleanUrls: true,
  ignoreDeadLinks: true, // Ignore dead links to prevent build failures
  head: [
    ['link', { rel: 'icon', type: 'image/png', href: '/images/favicon.png' }],
    ['link', { rel: 'stylesheet', href: '/css/styles.css' }]
  ],

  markdown: {
    lineNumbers: true,
    container: {
      tipLabel: 'Tip',
      warningLabel: 'Warning',
      dangerLabel: 'Danger',
      infoLabel: 'Info',
      detailsLabel: 'Details'
    }
  },

  mermaid: {
    theme: 'default',
    securityLevel: 'loose',
    startOnLoad: true,
    maxTextSize: 50000,
    flowchart: {
      useMaxWidth: true,
      htmlLabels: true
    },
    themeVariables: {
      nodeTextColor: '#000000',
      mainBkg: '#ffffff',
      textColor: '#000000',
      classFontColor: '#000000',
      labelTextColor: '#000000',
      stateLabelColor: '#000000',
      entityTextColor: '#000000',
      flowchartTextColor: '#000000'
    }
  },

  themeConfig: {
    // Search
    search: {
      provider: 'local'
    },
    logo: '/images/logo.png',
    
    // Social links
    socialLinks: [
      { icon: 'github', link: 'https://github.com/emprops/emp-job-queue' }
    ],

    // Footer
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024 EmProps'
    },
    
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Understanding', link: '/01-understanding-the-system/' },
      { text: 'How It Works', link: '/02-how-it-works/' },
      { text: 'Implementation', link: '/03-implementation-details/' },
      { text: 'Production', link: '/04-running-in-production/' },
      { text: 'Development', link: '/05-development/' },
      { text: 'Future', link: '/06-future-vision/' },
      { text: 'Open API', link: '/08-emprops-open-api/' },
      { text: 'Observability', link: '/09-observability/' }
    ],

    sidebar: {
      '/01-understanding-the-system/': [
        {
          text: '1. Understanding the System',
          items: [
            { text: 'Overview', link: '/01-understanding-the-system/' },
            { text: 'System Overview', link: '/01-understanding-the-system/system-overview' },
            { text: 'North Star Vision 🚧', link: '/01-understanding-the-system/north-star-vision' },
            { text: 'Business Context 📝', link: '/01-understanding-the-system/business-context' },
            { text: 'Capabilities & Limitations 📝', link: '/01-understanding-the-system/capabilities-limitations' }
          ]
        }
      ],
      '/02-how-it-works/': [
        {
          text: '2. How It Works',
          items: [
            { text: 'Overview', link: '/02-how-it-works/' },
            { text: 'Job Lifecycle', link: '/02-how-it-works/job-lifecycle' },
            { text: 'Worker Selection', link: '/02-how-it-works/worker-selection' },
            { text: 'Redis Architecture 📝', link: '/02-how-it-works/redis-architecture' },
            { text: 'Machine Communication 📝', link: '/02-how-it-works/machine-communication' },
            { text: 'Scaling Mechanisms 🚧', link: '/02-how-it-works/scaling-mechanisms' }
          ]
        }
      ],
      '/03-implementation-details/': [
        {
          text: '3. Implementation Details',
          items: [
            { text: 'Overview', link: '/03-implementation-details/' },
            { text: 'Unified Machine Architecture', link: '/03-implementation-details/unified-machine-architecture' },
            { text: 'Technical Implementation', link: '/03-implementation-details/technical-implementation' },
            { text: 'WebSocket API', link: '/03-implementation-details/websocket-api' },
            { text: 'Machine Bootstrap & Lifecycle', link: '/03-implementation-details/machine-bootstrap-lifecycle' },
            { text: 'Webhook Notification System', link: '/03-implementation-details/webhook-notification-system' },
            { text: 'Redis Data Structures 📝', link: '/03-implementation-details/redis-data-structures' },
            { text: 'Service Communication 📝', link: '/03-implementation-details/service-communication' },
            { text: 'API Connectors 🚧', link: '/03-implementation-details/api-connectors' }
          ]
        }
      ],
      '/04-running-in-production/': [
        {
          text: '4. Running in Production',
          items: [
            { text: 'Overview', link: '/04-running-in-production/' },
            { text: 'Failure Handling', link: '/04-running-in-production/failure-handling' },
            { text: 'Machine Logs Analysis', link: '/04-running-in-production/machine-logs-analysis' },
            { text: 'Deployment Strategies 📝', link: '/04-running-in-production/deployment-strategies' },
            { text: 'Monitoring & Alerting 📝', link: '/04-running-in-production/monitoring-alerting' },
            { text: 'Performance Tuning 🚧', link: '/04-running-in-production/performance-tuning' },
            { text: 'Capacity Planning 📝', link: '/04-running-in-production/capacity-planning' }
          ]
        }
      ],
      '/05-development/': [
        {
          text: '5. Development',
          items: [
            { text: 'Overview', link: '/05-development/' },
            { text: 'Development Changelog', link: '/05-development/changelog' },
            { text: 'Monorepo Migration', link: '/05-development/monorepo-migration' },
            { text: 'Local Development Setup 📝', link: '/05-development/local-development' },
            { text: 'Testing Procedures 🚧', link: '/05-development/testing-procedures' },
            { text: 'Contributing Guidelines 📝', link: '/05-development/contributing' },
            { text: 'Architecture Decisions 📝', link: '/05-development/architecture-decisions' }
          ]
        }
      ],
      '/06-future-vision/': [
        {
          text: '6. Future Vision',
          items: [
            { text: 'Overview', link: '/06-future-vision/' },
            { text: 'North Star Architecture 🚧', link: '/06-future-vision/north-star-architecture' },
            { text: 'Predictive Model Management 🚧', link: '/06-future-vision/predictive-model-management' },
            { text: 'Pool-Based Routing 📝', link: '/06-future-vision/pool-based-routing' },
            { text: 'Technical Roadmap 📝', link: '/06-future-vision/technical-roadmap' },
            { text: 'Customer Documentation Plans 📝', link: '/06-future-vision/customer-docs-planning' }
          ]
        }
      ],
      '/examples/': [
        {
          text: 'Examples',
          items: [
            { text: 'Overview', link: '/examples/' },
            { text: 'Mermaid Diagrams', link: '/examples/mermaid' },
            { text: 'Advanced Usage', link: '/examples/advanced' },
            { text: 'Diagram Components', link: '/examples/diagram' }
          ]
        }
      ],
      '/08-emprops-open-api/': [
        {
          text: '8. EmProps Open API',
          items: [
            { text: 'Overview', link: '/08-emprops-open-api/' },
            { text: 'Architecture', link: '/08-emprops-open-api/architecture/' },
            { text: 'API Reference', link: '/08-emprops-open-api/api-reference/' },
            { text: 'Implementation Guides', link: '/08-emprops-open-api/implementation-guides/' },
            { text: 'Examples', link: '/08-emprops-open-api/examples/' }
          ]
        }
      ],
      '/08-emprops-open-api/architecture/': [
        {
          text: 'Architecture',
          items: [
            { text: 'Overview', link: '/08-emprops-open-api/architecture/' },
            { text: 'Collection System', link: '/08-emprops-open-api/architecture/collection-system' },
            { text: 'Frontend Collection Flow ✨', link: '/08-emprops-open-api/architecture/frontend-collection-flow' },
            { text: 'Database Schema 📝', link: '/08-emprops-open-api/architecture/database-schema' }
          ]
        }
      ],
      '/08-emprops-open-api/api-reference/': [
        {
          text: 'API Reference',
          items: [
            { text: 'Overview', link: '/08-emprops-open-api/api-reference/' },
            { text: 'Collections 📝', link: '/08-emprops-open-api/api-reference/collections' },
            { text: 'Workflows 📝', link: '/08-emprops-open-api/api-reference/workflows' },
            { text: 'Models 📝', link: '/08-emprops-open-api/api-reference/models' },
            { text: 'Generation 📝', link: '/08-emprops-open-api/api-reference/generation' }
          ]
        }
      ],
      '/08-emprops-open-api/implementation-guides/': [
        {
          text: 'Implementation Guides',
          items: [
            { text: 'Overview', link: '/08-emprops-open-api/implementation-guides/' },
            { text: 'Collection Creation API ✨', link: '/08-emprops-open-api/implementation-guides/collection-generation-api' },
            { text: 'Workflow Integration 📝', link: '/08-emprops-open-api/implementation-guides/workflow-integration' },
            { text: 'Authentication Setup 📝', link: '/08-emprops-open-api/implementation-guides/authentication-setup' }
          ]
        }
      ],
      '/08-emprops-open-api/examples/': [
        {
          text: 'Examples',
          items: [
            { text: 'Overview', link: '/08-emprops-open-api/examples/' },
            { text: 'Basic Collection 📝', link: '/08-emprops-open-api/examples/basic-collection' },
            { text: 'Advanced Workflows 📝', link: '/08-emprops-open-api/examples/advanced-workflows' },
            { text: 'Progress Tracking 📝', link: '/08-emprops-open-api/examples/progress-tracking' }
          ]
        }
      ],
      '/09-observability/': [
        {
          text: '9. Observability',
          items: [
            { text: 'Overview', link: '/09-observability/' },
            { text: 'Information Flow', link: '/09-observability/information-flow' },
            { text: 'Architecture 📝', link: '/09-observability/architecture' },
            { text: 'Adding Telemetry 📝', link: '/09-observability/adding-telemetry' },
            { text: 'Debugging Guide 📝', link: '/09-observability/debugging-guide' },
            { text: 'Query Cookbook 📝', link: '/09-observability/query-cookbook' },
            { text: 'Monitoring Setup 📝', link: '/09-observability/monitoring-setup' },
            { text: 'Alert Configuration 📝', link: '/09-observability/alert-configuration' },
            { text: 'Performance Tuning 📝', link: '/09-observability/performance-tuning' }
          ]
        }
      ]
    }
  },

  vite: {
    optimizeDeps: {
      // Force Vite to pre-bundle these dependencies
      include: [
        '@braintree/sanitize-url',
        'dayjs',
        'mermaid',
        'cytoscape',
        'cytoscape-cose-bilkent',
        'khroma'
      ],
      // Explicitly exclude nothing to let Vite handle all deps
      exclude: []
    },
    resolve: {
      alias: {
        '@': '/src'
      }
    },
    ssr: {
      // Ensure these modules aren't externalized during SSR
      noExternal: ['mermaid', 'dayjs', '@braintree/sanitize-url', 'cytoscape', 'khroma']
    }
  }
})

export default withMermaid(config)
