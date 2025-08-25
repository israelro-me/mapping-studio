/// <reference types="node" />

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
    base: '/mapping-studio/',
    plugins: [react()],
    define: {
        __APP_VERSION__: JSON.stringify(pkg.version),
        __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
        __GIT_SHA__: JSON.stringify(process.env.VITE_GIT_SHA || '')
    }
})
