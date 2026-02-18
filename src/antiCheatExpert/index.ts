import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cpus } from 'node:os';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { app, powerMonitor } from 'electron';

// TODO 分模块，把共同的utils抽到utils.ts里，ACE相关的功能放在aceMonitor.ts里，bootstrap.ts里只负责启动监控和预启动

const execPromise = promisify(exec);
const isDev = !app.isPackaged;

const CHECK_INTERVAL = 3000; // 每3秒检查一次
// 进程名（tasklist 中显示的名称，不含 .exe 后缀）
const PROCESS_NAMES = ['SGuard64', 'SGuardSvc64'];

// 已配置过的进程PID集合
const configuredPids = new Set<number>();

// 监控定时器
let checkTimer: ReturnType<typeof setInterval> | null = null;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;
let isMonitoring = false;
let resumeHandler: (() => void) | null = null;

// ACE 自定义路径配置
const configDir = join(app.getPath('userData'), 'config');
const configFile = join(configDir, 'ace-config.json');

// 游戏客户端监控状态
let clientWatchTimer: ReturnType<typeof setInterval> | null = null;
let hasPreLaunchedThisSession = false; // 本次客户端启动周期是否已预启动

// ============== ACE 路径配置管理 ==============

interface AceConfig {
    acePath: string; // SGuard64.exe 所在目录路径
}

function loadConfig(): AceConfig {
    try {
        if (existsSync(configFile)) {
            return JSON.parse(readFileSync(configFile, 'utf-8'));
        }
    } catch { /* ignore */ }
    return { acePath: '' };
}

function saveConfig(config: AceConfig): void {
    try {
        if (!existsSync(configDir)) {
            mkdirSync(configDir, { recursive: true });
        }
        writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf-8');
    } catch (err) {
        console.error('[ACE Monitor] 保存配置失败:', err);
    }
}

/**
 * 获取当前配置的 ACE 路径
 */
export function getAcePath(): string {
    return loadConfig().acePath;
}

/**
 * 设置 ACE 路径
 */
export function setAcePath(acePath: string): void {
    saveConfig({ acePath });
    console.log('[ACE Monitor] ACE 路径已设置:', acePath);
}

/**
 * 预启动自定义路径的 SGuard64.exe
 * 在系统默认的 SGuard64 启动前抢先启动，避免硬盘扫描
 * 导出供外部调用（应用启动时立即调用）
 */
export async function preLaunchSGuard64(): Promise<boolean> {
    const config = loadConfig();
    if (!config.acePath) {
        console.log('[ACE Monitor] 未配置 ACE 路径，跳过预启动');
        return false;
    }

    const sguardExe = join(config.acePath, 'SGuard64.exe');
    if (!existsSync(sguardExe)) {
        console.warn('[ACE Monitor] SGuard64.exe 不存在:', sguardExe);
        return false;
    }

    // 检查 SGuard64 是否已经在运行
    const processes = await findAceProcesses();
    const sguardRunning = processes.some(p => p.name.toLowerCase().includes('sguard64'));
    if (sguardRunning) {
        console.log('[ACE Monitor] SGuard64 已在运行，跳过预启动');
        return false;
    }

    try {
        console.log('[ACE Monitor] 预启动 SGuard64:', sguardExe);
        const command = isDev
            ? `gsudo "${sguardExe}"`
            : `"${sguardExe}"`;

        // 使用 detached 模式启动，不等待进程结束
        exec(command, {
            cwd: config.acePath,
            timeout: 10000,
            windowsHide: true,
        }, (error) => {
            if (error) {
                console.warn('[ACE Monitor] 预启动 SGuard64 可能失败:', error.message);
            }
        });

        console.log('[ACE Monitor] SGuard64 预启动命令已发送');
        return true;
    } catch (err) {
        console.error('[ACE Monitor] 预启动 SGuard64 失败:', err);
        return false;
    }
}

/**
 * 获取最后一个小核(E-core)的亲和性掩码
 */
function getLastECoreAffinityMask(): number {
    const numCPUs = cpus().length;
    return 1 << (numCPUs - 1);
}

/**
 * 执行命令（开发环境自动加 gsudo）
 */
async function runElevated(command: string): Promise<{ stdout: string; stderr: string }> {
    const fullCommand = isDev ? `gsudo cmd /c "${command}"` : command;
    return execPromise(fullCommand, { timeout: 15000 });
}

/**
 * 通过 tasklist 查找 ACE 进程
 */
async function findAceProcesses(): Promise<{ pid: number; name: string }[]> {
    try {
        const { stdout } = await execPromise('tasklist /FO CSV /NH', { timeout: 10000 });
        const results: { pid: number; name: string }[] = [];
        const lines = stdout.trim().split('\n');

        for (const line of lines) {
            const match = line.match(/"([^"]+)","(\d+)"/);
            if (!match) continue;

            const [, processName, pidStr] = match;
            const pid = parseInt(pidStr, 10);

            const baseName = processName.replace(/\.exe$/i, '').toLowerCase();
            for (const targetName of PROCESS_NAMES) {
                if (baseName === targetName.toLowerCase()) {
                    results.push({ pid, name: processName });
                    break;
                }
            }
        }

        return results;
    } catch {
        return [];
    }
}

/**
 * 获取进程当前优先级
 * wmic 返回的 Priority 值（0-31范围），Idle 对应 4
 */
async function getProcessPriority(pid: number): Promise<number | null> {
    try {
        const command = isDev
            ? `gsudo wmic process where ProcessId=${pid} GET Priority /VALUE`
            : `wmic process where ProcessId=${pid} GET Priority /VALUE`;
        const { stdout } = await execPromise(command, { timeout: 10000 });
        const match = stdout.match(/Priority=(\d+)/);
        return match ? parseInt(match[1], 10) : null;
    } catch {
        return null;
    }
}

/**
 * 获取进程当前处理器亲和性
 */
async function getProcessAffinity(pid: number): Promise<number | null> {
    try {
        const psCmd = `(Get-Process -Id ${pid}).ProcessorAffinity`;
        const command = isDev
            ? `gsudo powershell -NoProfile -Command "${psCmd}"`
            : `powershell -NoProfile -Command "${psCmd}"`;
        const { stdout } = await execPromise(command, { timeout: 10000 });
        const value = parseInt(stdout.trim(), 10);
        return isNaN(value) ? null : value;
    } catch {
        return null;
    }
}

/**
 * 通过 wmic 设置进程优先级为 Idle (64)
 */
async function setProcessPriority(pid: number): Promise<boolean> {
    try {
        await runElevated(`wmic process where ProcessId=${pid} CALL setpriority 64`);
        return true;
    } catch {
        return false;
    }
}

/**
 * 通过 PowerShell 一行命令设置进程处理器亲和性
 */
async function setProcessAffinity(pid: number, mask: number): Promise<boolean> {
    try {
        const psCmd = `(Get-Process -Id ${pid}).ProcessorAffinity=${mask}`;
        const command = isDev
            ? `gsudo powershell -NoProfile -Command "${psCmd}"`
            : `powershell -NoProfile -Command "${psCmd}"`;
        await execPromise(command, { timeout: 15000 });
        return true;
    } catch {
        return false;
    }
}

/**
 * 检查进程是否仍然存在
 */
async function isProcessAlive(pid: number): Promise<boolean> {
    try {
        const { stdout } = await execPromise(
            `tasklist /FI "PID eq ${pid}" /FO CSV /NH`,
            { timeout: 10000 },
        );
        return stdout.includes(pid.toString());
    } catch {
        return false;
    }
}

// wmic Priority 值: Idle 进程的 Priority 通常为 4
const IDLE_PRIORITY_THRESHOLD = 6;

/**
 * 主检查循环
 */
async function checkAndConfigure(): Promise<void> {
    if (!isMonitoring) return;

    try {
        const processes = await findAceProcesses();
        const affinityMask = getLastECoreAffinityMask();
        const numCPUs = cpus().length;

        for (const proc of processes) {
            if (configuredPids.has(proc.pid)) continue;

            // 先检查当前优先级和亲和性，避免重复设置
            const currentPriority = await getProcessPriority(proc.pid);
            const currentAffinity = await getProcessAffinity(proc.pid);

            const needSetPriority = currentPriority === null || currentPriority > IDLE_PRIORITY_THRESHOLD;
            const needSetAffinity = currentAffinity === null || currentAffinity !== affinityMask;

            if (!needSetPriority && !needSetAffinity) {
                configuredPids.add(proc.pid);
                console.log(
                    `[ACE Monitor] ${proc.name} (PID: ${proc.pid}) 已是目标状态，跳过设置 ` +
                    `(优先级: ${currentPriority}, 亲和性: 0x${currentAffinity?.toString(16)})`,
                );
                continue;
            }

            let priorityOk = !needSetPriority;
            let affinityOk = !needSetAffinity;

            if (needSetPriority) {
                priorityOk = await setProcessPriority(proc.pid);
            }
            if (needSetAffinity) {
                affinityOk = await setProcessAffinity(proc.pid, affinityMask);
            }

            configuredPids.add(proc.pid);
            console.log(
                `[ACE Monitor] 配置 ${proc.name} (PID: ${proc.pid}) → ` +
                `优先级: ${!needSetPriority ? '已是低✓' : (priorityOk ? '低(Idle)✓' : '失败✗')}, ` +
                `CPU亲和性: ${!needSetAffinity ? '已设置✓' : (affinityOk ? `核心${numCPUs - 1}✓` : '失败✗')}`,
            );
        }
    } catch (err) {
        // 静默处理错误
    }
}

/**
 * 清理已退出的进程PID
 */
async function cleanupStalePids(): Promise<void> {
    if (configuredPids.size === 0) return;

    for (const pid of [...configuredPids]) {
        const alive = await isProcessAlive(pid);
        if (!alive) {
            configuredPids.delete(pid);
            console.log(`[ACE Monitor] 进程 PID ${pid} 已退出，移除记录`);
        }
    }
}

/**
 * 启动 ACE 进程监控（仅监控优先级和亲和性，预启动在 bootstrap.ts 中处理）
 */
export function startAceMonitor(): void {
    if (isMonitoring) {
        console.log('[ACE Monitor] 已在监控中，跳过');
        return;
    }

    isMonitoring = true;

    // 立即执行一次检查
    checkAndConfigure();

    // 定时检查
    checkTimer = setInterval(() => {
        checkAndConfigure();
    }, CHECK_INTERVAL);

    // 每30秒清理一次已退出的PID
    cleanupTimer = setInterval(() => {
        cleanupStalePids();
    }, 30000);

    // 监听系统唤醒事件，休眠恢复后重新配置 ACE 进程
    resumeHandler = () => {
        console.log('[ACE Monitor] 检测到系统从休眠/睡眠中恢复，清空已配置记录，重新检查');
        configuredPids.clear();
        checkAndConfigure();
    };
    powerMonitor.on('resume', resumeHandler);

    const numCPUs = cpus().length;
    console.log(
        `[ACE Monitor] 反作弊进程监控已启动\n` +
        `  模式: ${isDev ? '开发(gsudo)' : '生产(管理员)'}\n` +
        `  检查间隔: ${CHECK_INTERVAL / 1000}s\n` +
        `  CPU核心数: ${numCPUs}, 亲和性掩码: 0x${getLastECoreAffinityMask().toString(16)} (核心${numCPUs - 1})\n` +
        `  目标进程: ${PROCESS_NAMES.join(', ')}`,
    );
}

/**
 * 停止 ACE 进程监控
 */
export function stopAceMonitor(): void {
    if (!isMonitoring) return;

    isMonitoring = false;

    if (checkTimer) {
        clearInterval(checkTimer);
        checkTimer = null;
    }
    if (cleanupTimer) {
        clearInterval(cleanupTimer);
        cleanupTimer = null;
    }

    if (resumeHandler) {
        powerMonitor.removeListener('resume', resumeHandler);
        resumeHandler = null;
    }

    configuredPids.clear();
    console.log('[ACE Monitor] 反作弊进程监控已停止');
}

// ============== 游戏客户端监控（用于预启动 SGuard64）==============

/**
 * 检查 LeagueClient.exe 是否在运行（主启动器，比 LeagueClientUx.exe 更早启动）
 */
async function isLeagueClientRunning(): Promise<boolean> {
    try {
        const command = isDev
            ? `gsudo tasklist /FI "IMAGENAME eq LeagueClient.exe" /FO CSV /NH`
            : `tasklist /FI "IMAGENAME eq LeagueClient.exe" /FO CSV /NH`;
        const { stdout } = await execPromise(command, { timeout: 10000 });
        return stdout.toLowerCase().includes('leagueclient.exe');
    } catch {
        return false;
    }
}

/**
 * 启动游戏客户端监控
 * 检测到 LeagueClient.exe 启动时，立即预启动自定义 SGuard64
 * 这样可以抢在系统默认的 SGuard64 之前启动
 */
export function watchForGameClient(): void {
    if (clientWatchTimer) {
        console.log('[ACE Monitor] 游戏客户端监控已在运行');
        return;
    }

    console.log('[ACE Monitor] 启动游戏客户端监控（检测 LeagueClient.exe）');

    // 每秒检查一次，尽早检测到客户端启动
    clientWatchTimer = setInterval(async () => {
        try {
            const clientRunning = await isLeagueClientRunning();

            if (clientRunning && !hasPreLaunchedThisSession) {
                // 检测到客户端启动，立即预启动自定义 SGuard64
                console.log('[ACE Monitor] 检测到 LeagueClient.exe 启动，准备预启动自定义 SGuard64');
                hasPreLaunchedThisSession = true;
                const launched = await preLaunchSGuard64();

                // 无论预启动成功还是失败（SGuard64已在运行），都停止监控
                // 因为本次客户端启动周期的任务已完成
                console.log('[ACE Monitor] 预启动任务完成，停止游戏客户端监控');
                stopWatchingGameClient();
            } else if (!clientRunning && hasPreLaunchedThisSession) {
                // 客户端已退出，重置标记，下次启动时重新预启动
                console.log('[ACE Monitor] LeagueClient.exe 已退出，重置预启动标记');
                hasPreLaunchedThisSession = false;
            }
        } catch (err) {
            // 静默处理错误
        }
    }, 1000); // 1秒检查一次，尽早检测
}

/**
 * 停止游戏客户端监控
 */
export function stopWatchingGameClient(): void {
    if (clientWatchTimer) {
        clearInterval(clientWatchTimer);
        clientWatchTimer = null;
        console.log('[ACE Monitor] 游戏客户端监控已停止');
    }
}
