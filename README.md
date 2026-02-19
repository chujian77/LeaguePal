# LeaguePal

**你的英雄联盟客户端助手** | A desktop assistant for League of Legends (CN server)

基于 Electron + Vue 3 + TypeScript 构建，通过 LCU（League Client Update）API 与游戏客户端通信，提供反作弊优化等实用功能。

---

## 功能

### 🔗 LCU 自动接受对局
- 找到对局4秒后自动接受对局

### 👤 召唤师信息
- 连接客户端后自动展示当前登录账号的召唤师信息
- 显示内容：游戏名（GameName + TagLine）、召唤师等级、头像

### ⚡ ACE 反作弊优化
针对腾讯 ACE 反作弊（SGuard64）导致游戏帧率下降的问题，提供以下优化：

| 功能 | 说明 |
|------|------|
| **预启动 SGuard64** | 检测到 `LeagueClient.exe` 启动时，立即抢先启动自定义路径的 `SGuard64.exe`，避免游戏内触发硬盘扫描 |
| **降低进程优先级** | 自动将 `SGuard64` / `SGuardSvc64` 进程优先级设为 **Idle**，减少对游戏进程的 CPU 抢占 |
| **限制 CPU 亲和性** | 自动将上述进程绑定到最后一个 **小核（E-core）**，避免占用性能核心 |
| **休眠恢复重配置** | 系统从睡眠/休眠唤醒后自动重新应用以上配置 |

> 使用 ACE 优化功能需要在设置中配置 `SGuard64.exe` 所在目录路径。

### 🖥️ 系统托盘
- 关闭窗口后最小化到系统托盘，不退出程序
- 可从托盘菜单完全退出

---

## 技术栈

- **框架**: [Electron](https://www.electronjs.org/) + [Vue 3](https://vuejs.org/)
- **语言**: TypeScript
- **构建工具**: Vite + [Electron Forge](https://www.electronforge.io/)
- **通信**: WebSocket（LCU API）

---

## 开发

```bash
# 安装依赖
npm install

# 启动开发模式（需要 gsudo 以获取管理员权限）
npm run dev

# 打包
npm run build
```

> **注意**：程序需要以**管理员权限**运行，用于设置 ACE 进程的优先级和 CPU 亲和性。

---

## 免责声明

本项目仅通过官方 LCU API 与客户端通信，不修改游戏文件，不注入进程。ACE 优化功能仅调整系统级进程调度参数，使用风险由用户自行承担。

---

## License

[MIT](LICENSE)
