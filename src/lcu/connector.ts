// LCU 连接器类

import https from 'https';
import { EventEmitter } from 'events';
import { WebSocket } from 'ws';
import { EventCode } from './constants';
import type { LCUCredentials, LCUResponse, EventHandler } from './types';

export class LCUConnector extends EventEmitter {
    private readonly port: number;
    private readonly authHeader: string;
    private readonly httpsAgent: https.Agent;
    private readonly requestTimeout: number;

    private ws: WebSocket | null = null;
    private subscriptions = new Map<string, Set<EventHandler>>();
    private closeRequested: boolean = false;

    private _restAlive: boolean = false;
    private _websocketAlive: boolean = false;

    constructor(credentials: LCUCredentials, options: { requestTimeout?: number } = {}) {
        super();
        this.port = credentials.port;
        this.authHeader = `Basic ${credentials.auth}`;
        this.requestTimeout = options.requestTimeout ?? 10000;
        this.httpsAgent = new https.Agent({
            rejectUnauthorized: false,
            keepAlive: true,
        });
    }

    get restAlive(): boolean { return this._restAlive; }
    get websocketAlive(): boolean { return this._websocketAlive; }
    get isConnected(): boolean { return this._restAlive; }

    setRestAlive(value: boolean): void {
        this._restAlive = value;
    }

    // ============== REST API ==============

    async request<T = unknown>(method: string, endpoint: string, data?: unknown): Promise<LCUResponse<T>> {
        const url = `https://127.0.0.1:${this.port}${endpoint}`;

        return new Promise((resolve, reject) => {
            const options: https.RequestOptions = {
                method: method.toUpperCase(),
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': this.authHeader,
                },
                rejectUnauthorized: false,
                agent: this.httpsAgent,
            };

            const req = https.request(url, options, (res) => {
                let body = '';
                res.on('data', (chunk) => (body += chunk));
                res.on('end', () => {
                    try {
                        const jsonData = body ? JSON.parse(body) : null;
                        resolve({ status: res.statusCode ?? 0, data: jsonData });
                    } catch {
                        resolve({ status: res.statusCode ?? 0, data: body as T });
                    }
                });
            });

            req.on('error', (error) => {
                reject(new Error(`[LCU] 请求失败 ${method} ${endpoint}: ${error.message}`));
            });

            req.setTimeout(this.requestTimeout, () => {
                req.destroy();
                reject(new Error(`[LCU] 请求超时 ${method} ${endpoint}`));
            });

            if (data !== undefined) req.write(JSON.stringify(data));
            req.end();
        });
    }

    async get<T = unknown>(endpoint: string): Promise<LCUResponse<T>> {
        return this.request<T>('GET', endpoint);
    }

    async post<T = unknown>(endpoint: string, data?: unknown): Promise<LCUResponse<T>> {
        return this.request<T>('POST', endpoint, data);
    }

    async put<T = unknown>(endpoint: string, data?: unknown): Promise<LCUResponse<T>> {
        return this.request<T>('PUT', endpoint, data);
    }

    async delete<T = unknown>(endpoint: string): Promise<LCUResponse<T>> {
        return this.request<T>('DELETE', endpoint);
    }

    async patch<T = unknown>(endpoint: string, data?: unknown): Promise<LCUResponse<T>> {
        return this.request<T>('PATCH', endpoint, data);
    }

    // ============== WebSocket ==============

    async connectWebSocket(): Promise<void> {
        if (this._websocketAlive) {
            console.warn('[LCU] WebSocket 已连接');
            return;
        }

        return new Promise((resolve, reject) => {
            const wsUrl = `wss://127.0.0.1:${this.port}`;

            this.ws = new WebSocket(wsUrl, {
                headers: {
                    Authorization: this.authHeader,
                },
                rejectUnauthorized: false,
            });

            const timeout = setTimeout(() => {
                if (this.ws) {
                    this.ws.close();
                    this.ws = null;
                }
                reject(new Error('[LCU] WebSocket 连接超时'));
            }, 10000);

            this.ws.on('open', () => {
                clearTimeout(timeout);
                this._websocketAlive = true;
                console.log('[LCU] WebSocket 已连接');
                resolve();
            });

            this.ws.on('message', (data: Buffer | string) => {
                const message = typeof data === 'string' ? data : data.toString('utf8');
                this.handleWebSocketMessage(message);
            });

            this.ws.on('close', (code, reason) => {
                clearTimeout(timeout);
                console.log(`[LCU] WebSocket 已断开 (code: ${code}, reason: ${reason})`);
                this._websocketAlive = false;
                this.ws = null;
                this.emit('websocket-close');
            });

            this.ws.on('error', (error: Error) => {
                clearTimeout(timeout);
                console.error('[LCU] WebSocket 错误:', error.message);
                this.emit('error', error);

                if (!this._websocketAlive) {
                    reject(error);
                }
            });
        });
    }

    private handleWebSocketMessage(message: string): void {
        if (!message) return;

        try {
            const parsed = JSON.parse(message);
            if (!Array.isArray(parsed) || parsed.length < 3) return;

            const [opcode, event, eventData] = parsed;

            if (opcode === EventCode.EVENT) {
                const handlers = this.subscriptions.get(event);
                if (handlers && handlers.size > 0) {
                    handlers.forEach((handler) => {
                        try {
                            Promise.resolve(handler(eventData)).catch((e) => {
                                console.error('[LCU] 事件处理器错误:', e);
                            });
                        } catch (e) {
                            console.error('[LCU] 事件处理器错误:', e);
                        }
                    });
                }
            }
        } catch {
            // 忽略非 JSON 消息
        }
    }

    async subscribe(event: string, handler: EventHandler): Promise<void> {
        if (!this.ws || !this._websocketAlive) {
            throw new Error('[LCU] WebSocket 未连接');
        }

        if (!this.subscriptions.has(event)) {
            this.subscriptions.set(event, new Set());
            this.ws.send(JSON.stringify([EventCode.SUBSCRIBE, event]));
            console.log(`[LCU] 订阅: ${event}`);
        }

        const handlers = this.subscriptions.get(event)!;
        if (!handlers.has(handler)) {
            handlers.add(handler);
        }
    }

    async unsubscribe(event: string, handler?: EventHandler): Promise<void> {
        if (!this.ws || !this._websocketAlive) return;

        const handlers = this.subscriptions.get(event);
        if (!handlers) return;

        if (!handler) {
            this.subscriptions.delete(event);
            this.ws.send(JSON.stringify([EventCode.UNSUBSCRIBE, event]));
            console.log(`[LCU] 取消订阅: ${event}`);
        } else {
            handlers.delete(handler);
            if (handlers.size === 0) {
                this.subscriptions.delete(event);
                this.ws.send(JSON.stringify([EventCode.UNSUBSCRIBE, event]));
                console.log(`[LCU] 取消订阅: ${event}`);
            }
        }
    }

    async subscribeOnce(event: string, handler: EventHandler): Promise<void> {
        const onceHandler: EventHandler = async (data) => {
            await this.unsubscribe(event, onceHandler);
            await handler(data);
        };
        await this.subscribe(event, onceHandler);
    }

    getSubscribedEvents(): string[] {
        return Array.from(this.subscriptions.keys());
    }

    async resubscribeAll(): Promise<void> {
        if (!this.ws || !this._websocketAlive) return;

        for (const event of this.subscriptions.keys()) {
            this.ws.send(JSON.stringify([EventCode.SUBSCRIBE, event]));
            console.log(`[LCU] 重新订阅: ${event}`);
        }
    }

    // ============== 连接管理 ==============

    async close(): Promise<void> {
        console.log('[LCU] 正在关闭连接...');
        this.closeRequested = true;

        if (this.ws) {
            this.ws.removeAllListeners();
            this.ws.close();
            this.ws = null;
        }

        this.httpsAgent.destroy();
        this.subscriptions.clear();

        this._websocketAlive = false;
        this._restAlive = false;

        console.log('[LCU] 所有连接已关闭');
    }

    async ping(): Promise<boolean> {
        try {
            const response = await this.get('/riotclient/ux-state');
            return response.status === 200;
        } catch {
            return false;
        }
    }
}
