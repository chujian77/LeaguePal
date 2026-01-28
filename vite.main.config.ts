// vite.main.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        rollupOptions: {
            external: [
                // 将 ws 的可选依赖标记为外部模块
                'bufferutil',
                'utf-8-validate',
            ],
        },
    },
    // 或者使用 resolve.alias 将这些模块解析为空
    resolve: {
        alias: {
            // 如果 external 不生效，可以尝试这个
            // 'bufferutil': './src/empty-module.ts',
            // 'utf-8-validate': './src/empty-module.ts',
        },
    },
});
