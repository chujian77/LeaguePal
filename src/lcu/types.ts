// LCU 类型定义

export interface LCUCredentials {
    token: string;
    port: number;
    url: string;
    auth: string;
}

export interface LCUEventData {
    uri: string;
    eventType: string;
    data: unknown;
}

export interface LCUResponse<T = unknown> {
    status: number;
    data: T;
}

export type EventHandler = (data: LCUEventData) => void | Promise<void>;

export interface GetCredentialsOptions {
    pollInterval?: number;
    maxRetries?: number;
    onWaiting?: (retryCount: number) => void;
    signal?: AbortSignal;
}

export interface LCUManagerOptions {
    credentialsPollInterval?: number;
    connectionRetryDelay?: number;
    healthCheckInterval?: number;
    requestTimeout?: number;
    withWebSocket?: boolean;
    autoReconnect?: boolean;
}
