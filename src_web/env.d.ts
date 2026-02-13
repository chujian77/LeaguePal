/// <reference types="vite/client" />

declare module '*.vue' {
    import type { DefineComponent } from 'vue';
    const component: DefineComponent<{}, {}, any>;
    export default component;
}

// 导入 preload 中定义的 API 类型
import type { LcuApi, AceApi } from '../src/preload'

// 全局扩展 Window 接口
declare global {
    interface Window {
        lcu: LcuApi
        ace: AceApi
    }
}
