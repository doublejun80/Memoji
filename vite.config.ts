
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // prevent vite from obscuring rust errors
  clearScreen: false,
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
    alias: {
      'vaul@1.1.2': 'vaul',
      'sonner@2.0.3': 'sonner',
      'recharts@2.15.2': 'recharts',
      'react-resizable-panels@2.1.7': 'react-resizable-panels',
      'react-hook-form@7.55.0': 'react-hook-form',
      'react-day-picker@8.10.1': 'react-day-picker',
      'next-themes@0.4.6': 'next-themes',
      'lucide-react@0.487.0': 'lucide-react',
      'input-otp@1.4.2': 'input-otp',
      'embla-carousel-react@8.6.0': 'embla-carousel-react',
      'cmdk@1.1.1': 'cmdk',
      'class-variance-authority@0.7.1': 'class-variance-authority',
      '@radix-ui/react-tooltip@1.1.8': '@radix-ui/react-tooltip',
      '@radix-ui/react-toggle@1.1.2': '@radix-ui/react-toggle',
      '@radix-ui/react-toggle-group@1.1.2': '@radix-ui/react-toggle-group',
      '@radix-ui/react-tabs@1.1.3': '@radix-ui/react-tabs',
      '@radix-ui/react-switch@1.1.3': '@radix-ui/react-switch',
      '@radix-ui/react-slot@1.1.2': '@radix-ui/react-slot',
      '@radix-ui/react-slider@1.2.3': '@radix-ui/react-slider',
      '@radix-ui/react-separator@1.1.2': '@radix-ui/react-separator',
      '@radix-ui/react-select@2.1.6': '@radix-ui/react-select',
      '@radix-ui/react-scroll-area@1.2.3': '@radix-ui/react-scroll-area',
      '@radix-ui/react-radio-group@1.2.3': '@radix-ui/react-radio-group',
      '@radix-ui/react-progress@1.1.2': '@radix-ui/react-progress',
      '@radix-ui/react-popover@1.1.6': '@radix-ui/react-popover',
      '@radix-ui/react-navigation-menu@1.2.5': '@radix-ui/react-navigation-menu',
      '@radix-ui/react-menubar@1.1.6': '@radix-ui/react-menubar',
      '@radix-ui/react-label@2.1.2': '@radix-ui/react-label',
      '@radix-ui/react-hover-card@1.1.6': '@radix-ui/react-hover-card',
      '@radix-ui/react-dropdown-menu@2.1.6': '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-dialog@1.1.6': '@radix-ui/react-dialog',
      '@radix-ui/react-context-menu@2.2.6': '@radix-ui/react-context-menu',
      '@radix-ui/react-collapsible@1.1.3': '@radix-ui/react-collapsible',
      '@radix-ui/react-checkbox@1.1.4': '@radix-ui/react-checkbox',
      '@radix-ui/react-avatar@1.1.3': '@radix-ui/react-avatar',
      '@radix-ui/react-aspect-ratio@1.1.2': '@radix-ui/react-aspect-ratio',
      '@radix-ui/react-alert-dialog@1.1.6': '@radix-ui/react-alert-dialog',
      '@radix-ui/react-accordion@1.2.3': '@radix-ui/react-accordion',
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Env variables starting with the item of `envPrefix` will be exposed in tauri's source code through `import.meta.env`.
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    // Tauri uses Chromium on Windows and WebKit on macOS and Linux
    target: process.env.TAURI_ENV_PLATFORM == 'windows' ? 'chrome105' : 'safari13',
    // don't minify for debug builds
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    // produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    outDir: 'dist',
    // The Milkdown + CodeMirror runtime is a single deferred editor boundary.
    // Keep the warning below 1 MB while the always-on shell stays below 500 KB.
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        onlyExplicitManualChunks: true,
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          const crepeFeature = id.match(/\/@milkdown\/crepe\/lib\/esm\/feature\/([^/]+)/)?.[1];
          if (crepeFeature) return `editor-crepe-${crepeFeature}`;
          if (id.includes('/@milkdown/crepe/')) return 'editor-crepe';
          if (
            id.includes('/@milkdown/') ||
            id.includes('/prosemirror-') ||
            id.includes('/node_modules/orderedmap/') ||
            id.includes('/node_modules/rope-sequence/') ||
            id.includes('/node_modules/w3c-keyname/')
          ) return 'editor-milkdown';
          if (id.includes('/node_modules/vue/') || id.includes('/node_modules/@vue/')) return 'editor-vue';
          if (id.includes('/node_modules/lodash-es/')) return 'editor-utilities';
          if (id.includes('/node_modules/dompurify/')) return 'editor-sanitize';
          if (
            id.includes('/node_modules/codemirror/') ||
            /\/node_modules\/@codemirror\/(autocomplete|commands|language|language-data|lint|search|state|theme-one-dark|view)\//.test(id) ||
            /\/node_modules\/@lezer\/(common|highlight|lr)\//.test(id) ||
            id.includes('/node_modules/@marijn/') ||
            id.includes('/node_modules/style-mod/') ||
            id.includes('/node_modules/crelt/')
          ) return 'editor-milkdown';
          if (id.includes('/node_modules/katex/') || id.includes('/node_modules/remark-math/')) return 'editor-math';
          if (
            id.includes('/node_modules/micromark') ||
            id.includes('/node_modules/mdast-util-') ||
            id.includes('/node_modules/remark-') ||
            id.includes('/node_modules/unist-util-') ||
            id.includes('/node_modules/vfile') ||
            id.includes('/node_modules/unified/') ||
            /\/node_modules\/(bail|ccount|decode-named-character-reference|devlop|escape-string-regexp|extend|is-plain-obj|longest-streak|markdown-table|trough|zwitch)\//.test(id)
          ) return 'editor-markdown-runtime';
          if (id.includes('/node_modules/@ocavue/')) return 'editor-milkdown';
          if (id.includes('/node_modules/@floating-ui/')) return 'shared-floating';
          // CodeMirror language data uses dynamic imports. Let Rollup preserve
          // those boundaries instead of collapsing every grammar into one
          // multi-megabyte editor chunk.
          return undefined;
        },
      },
    },
  },
  server: {
    // make sure this port matches the devUrl port in tauri.conf.json file
    port: 1420,
    // Tauri expects a fixed port, fail if that port is not available
    strictPort: true,
    // if the host Tauri is expecting is set, use it
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // tell vite to ignore watching `src-tauri`
      ignored: ['**/src-tauri/**'],
    },
  },
});
