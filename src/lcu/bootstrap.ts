// LCU 启动引导

import { createLCUManager, LCUEvents, ConnectionState } from './index';
import { startAceMonitor, stopAceMonitor, preLaunchSGuard64, watchForGameClient } from '../antiCheatExpert';

// 启动游戏客户端监控，检测到客户端启动时立即预启动自定义 SGuard64
// 这样可以抢在系统默认的 SGuard64 之前启动
watchForGameClient();

// 创建管理器
export const lcuManager = createLCUManager({
    credentialsPollInterval: 3000,  // 等待客户端启动的轮询间隔
    connectionRetryDelay: 2000,     // 连接重试间隔
    healthCheckInterval: 5000,      // 健康检查间隔
    withWebSocket: true,
    autoReconnect: true,            // 自动重连
});

// 监听状态变化
lcuManager.on('state-change', (newState: ConnectionState, oldState: ConnectionState) => {
    console.log(`状态变化: ${oldState} -> ${newState}`);

    switch (newState) {
        case ConnectionState.WAITING_FOR_CLIENT:
            console.log('等待客户端启动...');
            // 客户端未启动，停止 ACE 监控
            stopAceMonitor();
            break;
        case ConnectionState.CONNECTING:
            console.log('正在连接...');
            // 客户端已启动（正在连接），开始 ACE 监控
            startAceMonitor();
            break;
        case ConnectionState.CONNECTED:
            console.log('已连接！');
            // 确保 ACE 监控在运行
            startAceMonitor();
            break;
        case ConnectionState.RECONNECTING:
            console.log('正在重连...');
            break;
        case ConnectionState.DISCONNECTED:
            console.log('已断开');
            // 客户端断开，停止 ACE 监控
            stopAceMonitor();
            break;
    }
});

// 监听连接成功
lcuManager.on('connected', async (connector) => {
    console.log('LCU 已连接！');

    // 获取当前召唤师信息
    try {
        const summoner = await lcuManager.get('/lol-summoner/v1/current-summoner');
        console.log('当前召唤师:', summoner.data);
    } catch (error) {
        console.error('获取召唤师信息失败:', error);
    }

    // 订阅事件
    await lcuManager.subscribe(LCUEvents.GAMEFLOW, (data) => {
        console.log('游戏流程状态:', data);
        setTimeout(() => {
            lcuManager.post('/lol-matchmaking/v1/ready-check/accept')

        }, 4000);
    });

    // await lcuManager.subscribe(LCUEvents.CHAMP_SELECT, (data) => {
    //     console.log('选人阶段:', data);
    // });
});

// 监听客户端关闭
lcuManager.on('client-closed', () => {
    console.log('客户端已关闭，等待重新启动...');
    // 重新启动游戏客户端监控，为下次启动做准备
    watchForGameClient();
});

// 监听等待客户端
lcuManager.on('waiting-for-client', (count) => {
    console.log(`等待客户端启动... (第 ${count} 次检测)`);
});

// 监听等待用户登录
lcuManager.on('waiting-for-login', (count) => {
    console.log(`等待用户登录... (第 ${count} 次检测)`);
});

// 监听连接重试
lcuManager.on('connection-retry', (attempt) => {
    console.log(`连接重试 #${attempt}`);
});

// 监听错误
lcuManager.on('error', (error) => {
    console.error('LCU 错误:', error);
});

// 启动管理器
lcuManager.start();

// 应用退出时停止
process.on('SIGINT', async () => {
    await lcuManager.stop();
    process.exit(0);
});
