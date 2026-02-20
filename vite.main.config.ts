// vite.main.config.ts
import { defineConfig } from 'vite';
import { copyFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { builtinModules } from 'module';

export default defineConfig({
    plugins: [
        {
            name: 'copy-tray-icon',
            closeBundle() {
                const src = resolve(__dirname, 'src/icon.png');
                const dest = resolve(__dirname, '.vite/build/icon.png');
                if (existsSync(src)) {
                    copyFileSync(src, dest);
                    console.log('Copied icon.png to .vite/build/');
                }
            },
        },
    ],
    build: {
        outDir: '.vite/build',
        emptyOutDir: true,
        lib: {
            entry: 'src/main.ts',
            formats: ['cjs'],
            fileName: () => 'main.js',
        },
        rollupOptions: {
            // ws 内部有 WebSocket.WebSocket = WebSocket 的循环引用。
            // 若让 Rollup 打包内联 ws，会破坏该循环引用，导致
            // "WebSocket is not a constructor" 错误。
            // 将 ws 标记为 external，由 electron-builder 将 node_modules/ws 打包进应用。
            // bufferutil / utf-8-validate 是 ws 的可选原生依赖，同样不打包进 bundle，
            // ws 会在运行时自动降级到纯 JS 实现。
            external: [
                'ws',
                'bufferutil',
                'utf-8-validate',
                'electron',
                ...builtinModules,
                ...builtinModules.map(m => `node:${m}`)
            ],
        },
    },
});
