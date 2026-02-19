import { defineConfig } from 'vite';
import { builtinModules } from 'module';

export default defineConfig({
    build: {
        outDir: '.vite/build',
        emptyOutDir: false, // ⚠️ 关键：设为 false，防止覆盖 main.js
        lib: {
            entry: 'src/preload.ts',
            formats: ['cjs'],
            fileName: () => 'preload.js',
        },
        rollupOptions: {
            external: [
                'electron',
                'electron/renderer',
                'electron/main',
                'electron/common',
                ...builtinModules,
                ...builtinModules.map(m => `node:${m}`)
            ]
        },
    },
});