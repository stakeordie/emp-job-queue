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
      { 
        text: 'Architecture', 
        items: [
          { text: 'System Overview', link: '/guide/architecture' },
          { text: 'Job Lifecycle', link: '/guide/job-lifecycle' },
          { text: 'Worker Selection', link: '/guide/worker-selection' },
          { text: 'Notifications', link: '/guide/notifications' }
        ]
      },
      { text: 'API Reference', link: '/guide/websocket-api' },
      { text: 'Examples', link: '/examples/' },
      { text: 'Changelog', link: '/changelog' }
    ],

    sidebar: {
      '/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Overview', link: '/' },
            { text: 'Quick Start', link: '/guide/' }
          ]
        },
        {
          text: 'System Architecture',
          collapsed: false,
          items: [
            { text: 'Architecture Overview', link: '/guide/architecture' },
            { text: 'Job Lifecycle', link: '/guide/job-lifecycle' },
            { text: 'Worker Selection', link: '/guide/worker-selection' },
            { text: 'Notifications', link: '/guide/notifications' }
          ]
        },
        {
          text: 'API Reference',
          collapsed: true,
          items: [
            { text: 'WebSocket API', link: '/guide/websocket-api' }
          ]
        },
        {
          text: 'Development',
          collapsed: true,
          items: [
            { text: 'Changelog', link: '/changelog' }
          ]
        }
      ],
      '/guide/': [
        {
          text: 'System Architecture',
          collapsed: false,
          items: [
            { text: 'Quick Start', link: '/guide/' },
            { text: 'Architecture Overview', link: '/guide/architecture' },
            { text: 'Job Lifecycle', link: '/guide/job-lifecycle' },
            { text: 'Worker Selection', link: '/guide/worker-selection' },
            { text: 'Notifications', link: '/guide/notifications' }
          ]
        },
        {
          text: 'API Reference',
          collapsed: false,
          items: [
            { text: 'WebSocket API', link: '/guide/websocket-api' }
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
