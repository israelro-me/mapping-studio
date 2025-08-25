import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json' with { type: 'json' }

// GH Pages base when building on CI; local dev uses '/'
const BASE = process.env.GITHUB_PAGES ? '/mapping-studio/' : '/'

export default defineConfig({
    base: BASE,
    plugins: [react()],
    define: {
        __APP_VERSION__: JSON.stringify(pkg.version),
        __GIT_SHA__: JSON.stringify(process.env.VITE_GIT_SHA || ''), // set in CI step
        __BUILD_TIME__: JSON.stringify(process.env.BUILD_TIME || new Date().toISOString()),
    },
    build: {
        // Monaco is big; don’t warn unless really large (i.e., 3 megs)
        chunkSizeWarningLimit: 3000,

        rollupOptions: {
            output: {
                // Put ALL monaco-editor modules into their own chunk
                manualChunks(id: string) {
                    if (id.includes('monaco-editor')) return 'monaco'
                    // let's add more buckets here if desired:
                    // if (id.includes('/node_modules/yaml/')) return 'yaml'
                },
            },
        },
    },
})
