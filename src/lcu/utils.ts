// LCU 工具函数

import { exec } from 'child_process';
import { promisify } from 'util';
import { app } from 'electron';
import type { LCUCredentials, GetCredentialsOptions } from './types';

const execPromise = promisify(exec);
const isDev = !app.isPackaged;

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new Error('Aborted'));
            return;
        }
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener('abort', () => {
            clearTimeout(timer);
            reject(new Error('Aborted'));
        }, { once: true });
    });
}

export async function getLCUCommandLine(): Promise<string | null> {
    const command = `wmic PROCESS WHERE name='LeagueClientUx.exe' GET commandline`;
    try {
        const fullCommand = isDev ? `gsudo ${command}` : command;
        const { stdout } = await execPromise(fullCommand);
        const trimmed = stdout.trim();
        if (!trimmed || trimmed === 'CommandLine' || !trimmed.includes('LeagueClientUx.exe')) {
            return null;
        }
        return trimmed;
    } catch {
        return null;
    }
}

export function extractCredentials(cmdline: string): LCUCredentials | null {
    const tokenMatch = cmdline.match(/--remoting-auth-token=([^"\s]+)/);
    const portMatch = cmdline.match(/--app-port=(\d+)/);

    if (!tokenMatch || !portMatch) return null;

    const token = tokenMatch[1];
    const port = parseInt(portMatch[1], 10);
    const auth = Buffer.from(`riot:${token}`).toString('base64');

    return {
        token,
        port,
        url: `https://127.0.0.1:${port}`,
        auth,
    };
}

export async function isLCURunning(): Promise<boolean> {
    const cmdline = await getLCUCommandLine();
    return cmdline !== null;
}

export async function getLCUCredentials(options: GetCredentialsOptions = {}): Promise<LCUCredentials> {
    const { pollInterval = 3000, maxRetries = -1, onWaiting, signal } = options;
    let retryCount = 0;

    while (true) {
        if (signal?.aborted) throw new Error('获取凭证被取消');

        const cmdline = await getLCUCommandLine();
        if (cmdline) {
            const credentials = extractCredentials(cmdline);
            if (credentials) {
                console.log('[LCU] ✅ 成功获取凭证');
                return credentials;
            }
        }

        retryCount++;
        if (maxRetries !== -1 && retryCount >= maxRetries) {
            throw new Error(`[LCU] 等待客户端超时，已重试 ${retryCount} 次`);
        }

        if (onWaiting) {
            onWaiting(retryCount);
        } else {
            console.log(`[LCU] ⏳ 等待客户端启动... (第 ${retryCount} 次检测)`);
        }

        try {
            await sleep(pollInterval, signal);
        } catch {
            throw new Error('获取凭证被取消');
        }
    }
}
