// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer } from 'electron/renderer'

console.log('Preload script loaded');

// 连接状态类型
export interface ConnectionState {
    state: string;
    isConnected: boolean;
}

// 定义暴露给渲染进程的 API
export const lcuApi = {
    getProfile: () => ipcRenderer.invoke('lcu.getProfile'),

    // 获取当前连接状态
    getConnectionState: () => ipcRenderer.invoke('lcu.getConnectionState') as Promise<ConnectionState>,

    // 监听连接状态变化
    onConnectionStateChanged: (callback: (state: ConnectionState) => void) => {
        const listener = (_event: Electron.IpcRendererEvent, state: ConnectionState) => callback(state);
        ipcRenderer.on('lcu.connectionStateChanged', listener);
        // 返回取消监听的函数
        return () => ipcRenderer.removeListener('lcu.connectionStateChanged', listener);
    }
}

// ACE 反作弊 API
export const aceApi = {
    // 打开文件夹选择对话框
    selectPath: () => ipcRenderer.invoke('ace.selectPath') as Promise<{ canceled: boolean; path: string }>,

    // 获取当前配置的 ACE 路径
    getPath: () => ipcRenderer.invoke('ace.getPath') as Promise<string>,

    // 手动设置 ACE 路径
    setPath: (acePath: string) => ipcRenderer.invoke('ace.setPath', acePath) as Promise<boolean>,
}

// 导出类型供全局声明使用
export type LcuApi = typeof lcuApi
export type AceApi = typeof aceApi

contextBridge.exposeInMainWorld('lcu', lcuApi)
contextBridge.exposeInMainWorld('ace', aceApi)
