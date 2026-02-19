import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
    plugins: [vue()], // 你原有的 vue 插件保持不变
    base: './',       // ⚠️ 关键：让打包后的资源路径变成相对路径
    build: {
        outDir: '.vite/renderer/main_window',
        emptyOutDir: true,
    },
});