import { Tray, Menu, BrowserWindow, nativeImage, app, shell } from 'electron';
import { join } from 'path';
import { homedir } from 'os';

export function createTray(mainWindow: BrowserWindow | null): Tray {
  // 创建托盘图标（使用默认图标，实际项目中应该准备专门的图标）
  const iconPath = join(__dirname, '../../public/icon.png');
  let trayIcon = nativeImage.createFromPath(iconPath);

  // 如果没有图标文件，使用空图标（ Electron 会显示空白）
  if (trayIcon.isEmpty()) {
    // 创建一个简单的 16x16 像素图标作为占位
    trayIcon = nativeImage.createEmpty();
  }

  trayIcon = trayIcon.resize({ width: 16, height: 16 });

  const tray = new Tray(trayIcon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示 CrossSync',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: 'separator' },
    {
      label: '立即同步书签',
      click: async () => {
        // TODO: 实现同步逻辑
        console.log('Sync bookmarks');
      },
    },
    {
      label: '立即同步历史',
      click: async () => {
        // TODO: 实现同步逻辑
        console.log('Sync history');
      },
    },
    { type: 'separator' },
    {
      label: '打开配置文件',
      click: () => {
        const configPath = join(homedir(), '.crosssync', 'config.json');
        shell.openPath(configPath);
      },
    },
    {
      label: '打开日志文件夹',
      click: () => {
        const logDir = join(homedir(), '.crosssync', 'logs');
        shell.openPath(logDir);
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('CrossSync - 跨浏览器书签同步');
  tray.setContextMenu(contextMenu);

  // 点击托盘图标显示/隐藏窗口
  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });

  return tray;
}
