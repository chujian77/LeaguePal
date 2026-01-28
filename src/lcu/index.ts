// LCU Connector 模块统一导出

// 类型导出
export type {
    LCUCredentials,
    LCUEventData,
    LCUResponse,
    EventHandler,
    GetCredentialsOptions,
    LCUManagerOptions,
} from './types';

// 常量导出
export {
    EventCode,
    ConnectionState,
    LCUEvents,
} from './constants';

// 工具函数导出
export {
    sleep,
    getLCUCommandLine,
    extractCredentials,
    isLCURunning,
    getLCUCredentials,
} from './utils';

// 类导出
export { LCUConnector } from './connector';
export { LCUManager, createLCUManager } from './manager';
