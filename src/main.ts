import { app, BrowserWindow, Tray, Menu, nativeImage } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import './lcu/bootstrap';
import './ipc';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// 单实例锁：防止重复启动
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.exit(0);
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

const createTray = () => {
  // 使用实际的 PNG 图标文件
  const iconPath = path.join(__dirname, 'icon.png');
  const icon = nativeImage.createFromPath(iconPath);

  tray = new Tray(icon);
  tray.setToolTip('LeaguePal');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示窗口',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      type: 'separator',
    },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // 双击托盘图标显示窗口
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
};

const createWindow = async () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 900,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      devTools: app.isPackaged ? false : true,
    },
    icon: path.join(__dirname, 'icon.png')
  });

  // 拦截关闭事件，最小化到托盘而不是退出
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  // 使用 Electron 原生的 app.isPackaged 来判断环境
  if (!app.isPackaged) {
    // 开发环境：直接加载 Vite 的本地开发服务器
    // (Vite 默认运行在 5173 端口，如果你的端口不同，请修改这里)
    mainWindow.loadURL('http://localhost:5173');

    // 开发环境下自动打开开发者工具 (可选)
    // mainWindow.webContents.openDevTools();
  } else {
    // 生产环境：加载编译打包后的静态 HTML 文件
    // 因为主进程代码编译后会放在 .vite/build/ 目录下，
    // 所以我们需要回退一层 `../` 找到 renderer 目录
    mainWindow.loadFile(
      path.join(__dirname, '../renderer/main_window/index.html')
    );
  }

  // Open the DevTools.
  // mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
  createTray();
  createWindow();
});

// 在 macOS 上，当用户从 Dock 菜单退出时
app.on('before-quit', () => {
  isQuitting = true;
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else if (mainWindow) {
    mainWindow.show();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
