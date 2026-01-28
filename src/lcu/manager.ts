// LCU 生命周期管理器

import { EventEmitter } from 'events';
import { ConnectionState } from './constants';
import { LCUConnector } from './connector';
import { sleep, isLCURunning, getLCUCredentials } from './utils';
import type { LCUCredentials, LCUManagerOptions, LCUResponse, EventHandler } from './types';

/**
 * LCU 生命周期管理器
 * 自动处理客户端启动、连接、断开、重连等
 */
export class LCUManager extends EventEmitter {
    private connector: LCUConnector | null = null;
    private credentials: LCUCredentials | null = null;
    private healthCheckTimer: NodeJS.Timeout | null = null;
    private abortController: AbortController | null = null;

    private _state: ConnectionState = ConnectionState.DISCONNECTED;
    private _isRunning: boolean = false;

    private readonly options: Required<LCUManagerOptions>;

    constructor(options: LCUManagerOptions = {}) {
        super();
        this.options = {
            credentialsPollInterval: options.credentialsPollInterval ?? 3000,
            connectionRetryDelay: options.connectionRetryDelay ?? 2000,
            healthCheckInterval: options.healthCheckInterval ?? 5000,
            requestTimeout: options.requestTimeout ?? 10000,
            withWebSocket: options.withWebSocket ?? true,
            autoReconnect: options.autoReconnect ?? true,
        };
    }

    // ============== 状态访问器 ==============

    get state(): ConnectionState {
        return this._state;
    }

    get isConnected(): boolean {
        return this._state === ConnectionState.CONNECTED;
    }

    get isRunning(): boolean {
        return this._isRunning;
    }

    /**
     * 获取当前连接器实例
     */
    getConnector(): LCUConnector | null {
        return this.connector;
    }

    // ============== 状态管理 ==============

    private setState(state: ConnectionState): void {
        if (this._state !== state) {
            const oldState = this._state;
            this._state = state;
            console.log(`[LCU Manager] 状态变更: ${oldState} -> ${state}`);
            this.emit('state-change', state, oldState);
        }
    }

    // ============== 生命周期管理 ==============

    /**
     * 启动管理器，开始监控 LCU 客户端
     */
    async start(): Promise<void> {
        if (this._isRunning) {
            console.warn('[LCU Manager] 已经在运行中');
            return;
        }

        this._isRunning = true;
        this.abortController = new AbortController();

        console.log('[LCU Manager] 启动');
        this.emit('start');

        await this.connectLoop();
    }

    /**
     * 停止管理器
     */
    async stop(): Promise<void> {
        if (!this._isRunning) return;

        console.log('[LCU Manager] 停止');
        this._isRunning = false;

        // 取消所有等待中的操作
        this.abortController?.abort();
        this.abortController = null;

        // 停止健康检查
        this.stopHealthCheck();

        // 关闭连接
        if (this.connector) {
            await this.connector.close();
            this.connector = null;
        }

        this.credentials = null;
        this.setState(ConnectionState.DISCONNECTED);
        this.emit('stop');
    }

    /**
     * 主连接循环
     */
    private async connectLoop(): Promise<void> {
        while (this._isRunning) {
            try {
                // 1. 等待获取凭证
                this.setState(ConnectionState.WAITING_FOR_CLIENT);
                this.credentials = await this.waitForCredentials();

                if (!this._isRunning) break;

                // 2. 等待 REST API 可用
                this.setState(ConnectionState.CONNECTING);
                await this.waitForConnection();

                if (!this._isRunning) break;

                // 3. 连接 WebSocket
                if (this.options.withWebSocket && this.connector) {
                    await this.connectWebSocket();
                }

                // 4. 等待客户端完全就绪（用户已登录）
                await this.waitForClientReady();

                if (!this._isRunning) break;

                // 5. 连接成功
                this.setState(ConnectionState.CONNECTED);
                this.emit('connected', this.connector);

                // 5. 启动健康检查
                this.startHealthCheck();

                // 6. 等待断开连接
                await this.waitForDisconnect();

            } catch (error) {
                if (!this._isRunning) break;

                console.error('[LCU Manager] 连接循环错误:', error);
                this.emit('error', error);

                // 清理当前连接
                await this.cleanup();

                // 等待一段时间后重试
                if (this._isRunning && this.options.autoReconnect) {
                    try {
                        await sleep(this.options.connectionRetryDelay, this.abortController?.signal);
                    } catch {
                        break;
                    }
                }
            }
        }
    }

    /**
     * 等待获取凭证
     */
    private async waitForCredentials(): Promise<LCUCredentials> {
        console.log('[LCU Manager] 等待客户端启动...');

        return getLCUCredentials({
            pollInterval: this.options.credentialsPollInterval,
            maxRetries: -1,
            signal: this.abortController?.signal,
            onWaiting: (count) => {
                this.emit('waiting-for-client', count);
            },
        });
    }

    /**
     * 等待 REST API 连接可用
     */
    private async waitForConnection(): Promise<void> {
        if (!this.credentials) {
            throw new Error('没有凭证');
        }

        console.log('[LCU Manager] 等待 REST API 可用...');

        this.connector = new LCUConnector(this.credentials, {
            requestTimeout: this.options.requestTimeout,
        });

        let attempt = 0;
        const maxAttempts = -1; // 无限重试

        while (this._isRunning) {
            attempt++;

            try {
                const response = await this.connector.get('/riotclient/ux-state');

                if (response.status === 200) {
                    console.log('[LCU Manager] REST API 已连接');
                    this.connector.setRestAlive(true);
                    return;
                }
            } catch (error) {
                // 连接失败，继续重试
            }

            // 检查客户端是否还在运行
            const running = await isLCURunning();
            if (!running) {
                throw new Error('客户端已关闭');
            }

            console.log(`[LCU Manager] REST API 连接尝试 ${attempt} 失败，${this.options.connectionRetryDelay}ms 后重试...`);
            this.emit('connection-retry', attempt);

            try {
                await sleep(this.options.connectionRetryDelay, this.abortController?.signal);
            } catch {
                throw new Error('连接被取消');
            }

            if (maxAttempts !== -1 && attempt >= maxAttempts) {
                throw new Error(`连接失败，已重试 ${attempt} 次`);
            }
        }

        throw new Error('连接被取消');
    }

    /**
     * 连接 WebSocket
     */
    private async connectWebSocket(): Promise<void> {
        if (!this.connector) return;

        let attempt = 0;
        const maxAttempts = 10;

        while (this._isRunning && attempt < maxAttempts) {
            attempt++;

            try {
                await this.connector.connectWebSocket();

                // 监听 WebSocket 关闭事件
                this.connector.on('websocket-close', () => {
                    if (this._isRunning && this.options.autoReconnect) {
                        this.handleWebSocketDisconnect();
                    }
                });

                return;
            } catch (error) {
                console.warn(`[LCU Manager] WebSocket 连接尝试 ${attempt}/${maxAttempts} 失败`);

                if (attempt < maxAttempts) {
                    try {
                        await sleep(1000, this.abortController?.signal);
                    } catch {
                        throw new Error('WebSocket 连接被取消');
                    }
                }
            }
        }

        console.warn('[LCU Manager] WebSocket 连接失败，将仅使用 REST API');
    }

    /**
     * 等待客户端完全就绪（用户已登录）
     */
    private async waitForClientReady(): Promise<void> {
        if (!this.connector) {
            throw new Error('没有连接器');
        }

        console.log('[LCU Manager] 等待客户端就绪（用户登录）...');

        let attempt = 0;
        const maxAttempts = 30; // 最多等待 30 次，每次 2 秒，共 60 秒
        const retryDelay = 2000;

        while (this._isRunning) {
            attempt++;

            try {
                const response = await this.connector.get('/lol-summoner/v1/current-summoner');

                // 检查是否成功获取到召唤师信息（用户已登录）
                if (response.status === 200 && response.data && !(response.data as any).errorCode) {
                    console.log('[LCU Manager] 客户端已就绪，用户已登录');
                    return;
                }

                // 如果返回 404 或 RPC_ERROR，说明用户还未登录
                const data = response.data as any;
                if (data?.errorCode === 'RPC_ERROR' || response.status === 404) {
                    console.log(`[LCU Manager] 等待用户登录... (第 ${attempt} 次检测)`);
                    this.emit('waiting-for-login', attempt);
                }
            } catch (error) {
                console.warn(`[LCU Manager] 检查登录状态失败: ${error}`);
            }

            // 检查客户端是否还在运行
            const running = await isLCURunning();
            if (!running) {
                throw new Error('客户端已关闭');
            }

            // 检查是否超过最大尝试次数
            if (attempt >= maxAttempts) {
                throw new Error(`等待用户登录超时，已等待 ${attempt * retryDelay / 1000} 秒`);
            }

            try {
                await sleep(retryDelay, this.abortController?.signal);
            } catch {
                throw new Error('等待被取消');
            }
        }

        throw new Error('等待被取消');
    }

    /**
     * 处理 WebSocket 断开
     */
    private async handleWebSocketDisconnect(): Promise<void> {
        if (!this._isRunning || !this.connector) return;

        console.log('[LCU Manager] WebSocket 断开，尝试重连...');
        this.setState(ConnectionState.RECONNECTING);

        let attempt = 0;
        const maxAttempts = 5;

        while (this._isRunning && attempt < maxAttempts) {
            attempt++;

            // 先检查客户端是否还在运行
            const running = await isLCURunning();
            if (!running) {
                console.log('[LCU Manager] 客户端已关闭');
                return; // 让健康检查处理完整的重连流程
            }

            try {
                await this.connector.connectWebSocket();
                await this.connector.resubscribeAll();
                this.setState(ConnectionState.CONNECTED);
                console.log('[LCU Manager] WebSocket 重连成功');
                return;
            } catch (error) {
                console.warn(`[LCU Manager] WebSocket 重连尝试 ${attempt}/${maxAttempts} 失败`);

                if (attempt < maxAttempts) {
                    try {
                        await sleep(1000 * attempt, this.abortController?.signal);
                    } catch {
                        return;
                    }
                }
            }
        }

        console.warn('[LCU Manager] WebSocket 重连失败');
        this.setState(ConnectionState.CONNECTED); // 仍然保持 REST 连接
    }

    /**
     * 等待断开连接（通过健康检查检测）
     */
    private waitForDisconnect(): Promise<void> {
        return new Promise((resolve) => {
            const checkDisconnect = () => {
                if (!this._isRunning || this._state === ConnectionState.DISCONNECTED) {
                    resolve();
                }
            };

            this.once('client-closed', resolve);
            this.once('stop', resolve);

            // 定期检查状态
            const interval = setInterval(() => {
                if (!this._isRunning) {
                    clearInterval(interval);
                    resolve();
                }
            }, 1000);
        });
    }

    /**
     * 启动健康检查
     */
    private startHealthCheck(): void {
        this.stopHealthCheck();

        this.healthCheckTimer = setInterval(async () => {
            if (!this._isRunning || !this.connector) return;

            try {
                // 检查客户端进程是否还在
                const running = await isLCURunning();

                if (!running) {
                    console.log('[LCU Manager] 检测到客户端已关闭');
                    await this.handleClientClosed();
                    return;
                }

                // 检查 REST API 是否响应
                const alive = await this.connector.ping();

                if (!alive) {
                    console.warn('[LCU Manager] REST API 无响应');
                    // 可能是临时问题，不立即断开
                }
            } catch (error) {
                console.error('[LCU Manager] 健康检查错误:', error);
            }
        }, this.options.healthCheckInterval);
    }

    /**
     * 停止健康检查
     */
    private stopHealthCheck(): void {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }
    }

    /**
     * 处理客户端关闭
     */
    private async handleClientClosed(): Promise<void> {
        console.log('[LCU Manager] 客户端已关闭，准备重新等待...');

        this.stopHealthCheck();

        // 清理当前连接
        await this.cleanup();

        this.emit('client-closed');

        // connectLoop 会自动重新开始等待
    }

    /**
     * 清理连接
     */
    private async cleanup(): Promise<void> {
        if (this.connector) {
            try {
                await this.connector.close();
            } catch {
                // 忽略关闭错误
            }
            this.connector = null;
        }

        this.credentials = null;
        this.setState(ConnectionState.DISCONNECTED);
    }

    // ============== 便捷方法（代理到 connector）==============

    /**
     * 发送 GET 请求
     */
    async get<T = unknown>(endpoint: string): Promise<LCUResponse<T>> {
        if (!this.connector || !this.isConnected) {
            throw new Error('[LCU Manager] 未连接');
        }
        return this.connector.get<T>(endpoint);
    }

    /**
     * 发送 POST 请求
     */
    async post<T = unknown>(endpoint: string, data?: unknown): Promise<LCUResponse<T>> {
        if (!this.connector || !this.isConnected) {
            throw new Error('[LCU Manager] 未连接');
        }
        return this.connector.post<T>(endpoint, data);
    }

    /**
     * 发送 PUT 请求
     */
    async put<T = unknown>(endpoint: string, data?: unknown): Promise<LCUResponse<T>> {
        if (!this.connector || !this.isConnected) {
            throw new Error('[LCU Manager] 未连接');
        }
        return this.connector.put<T>(endpoint, data);
    }

    /**
     * 发送 DELETE 请求
     */
    async delete<T = unknown>(endpoint: string): Promise<LCUResponse<T>> {
        if (!this.connector || !this.isConnected) {
            throw new Error('[LCU Manager] 未连接');
        }
        return this.connector.delete<T>(endpoint);
    }

    /**
     * 发送 PATCH 请求
     */
    async patch<T = unknown>(endpoint: string, data?: unknown): Promise<LCUResponse<T>> {
        if (!this.connector || !this.isConnected) {
            throw new Error('[LCU Manager] 未连接');
        }
        return this.connector.patch<T>(endpoint, data);
    }

    /**
     * 订阅事件
     */
    async subscribe(event: string, handler: EventHandler): Promise<void> {
        if (!this.connector || !this.isConnected) {
            throw new Error('[LCU Manager] 未连接');
        }
        return this.connector.subscribe(event, handler);
    }

    /**
     * 取消订阅事件
     */
    async unsubscribe(event: string, handler?: EventHandler): Promise<void> {
        if (!this.connector) return;
        return this.connector.unsubscribe(event, handler);
    }

    /**
     * 订阅一次性事件
     */
    async subscribeOnce(event: string, handler: EventHandler): Promise<void> {
        if (!this.connector || !this.isConnected) {
            throw new Error('[LCU Manager] 未连接');
        }
        return this.connector.subscribeOnce(event, handler);
    }
}

/**
 * 创建 LCU 管理器（推荐使用）
 * 自动处理客户端启动、连接、断开、重连
 */
export function createLCUManager(options?: LCUManagerOptions): LCUManager {
    return new LCUManager(options);
}
