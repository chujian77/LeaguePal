import { ipcMain, BrowserWindow, dialog } from "electron";
import { lcuManager } from "./lcu/bootstrap";
import { getAcePath, setAcePath } from "./antiCheatExpert";

// 获取召唤师信息
ipcMain.handle('lcu.getProfile', async () => {
    try {
        return await lcuManager.get('/lol-summoner/v1/current-summoner');
    } catch (error) {
        console.error('获取召唤师信息失败:', error);
        return null;
    }
});

// 获取当前连接状态
ipcMain.handle('lcu.getConnectionState', () => {
    return {
        state: lcuManager.state,
        isConnected: lcuManager.isConnected
    };
});

// 向所有渲染进程广播连接状态变化
function broadcastConnectionState(state: string, isConnected: boolean) {
    BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send('lcu.connectionStateChanged', { state, isConnected });
    });
}

// 监听连接状态变化
lcuManager.on('state-change', (state) => {
    broadcastConnectionState(state, lcuManager.isConnected);
});

// ============== ACE 反作弊相关 ==============

// 打开文件夹选择对话框
ipcMain.handle('ace.selectPath', async () => {
    const result = await dialog.showOpenDialog({
        title: '选择 ACE 反作弊程序路径（SGuard64.exe 所在目录）',
        properties: ['openDirectory'],
        defaultPath: getAcePath() || undefined,
    });

    if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true, path: '' };
    }

    const selectedPath = result.filePaths[0];
    setAcePath(selectedPath);
    return { canceled: false, path: selectedPath };
});

// 获取当前 ACE 路径
ipcMain.handle('ace.getPath', () => {
    return getAcePath();
});

// 手动设置 ACE 路径（通过输入框）
ipcMain.handle('ace.setPath', (_event, acePath: string) => {
    setAcePath(acePath);
    return true;
});
