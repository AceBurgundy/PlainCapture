/* eslint-disable linebreak-style */
const {app, BrowserWindow} = require('electron');
const {join, resolve} = require('path');

if (require('electron-squirrel-startup')) app.quit();

let icon;

switch (process.platform) {
  case 'win32':
    icon = resolve(__dirname, '../source/assets/logo', 'switch.ico');
    break;
  case 'darwin':
    icon = resolve(__dirname, '../source/assets/logo', 'switch.icns');
    break;
  case 'linux':
    icon = resolve(__dirname, '../source/assets/logo', 'switch.png');
    break;
}

const createWindow = async () => {
  const defaultHeight = 480;
  const defaultWidth = 720;

  const mainWindow = new BrowserWindow({
    minHeight: defaultHeight,
    minWidth: defaultWidth,
    height: defaultHeight,
    width: defaultWidth,
    // autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      preload: join(__dirname, 'preload.js'),
    },
    icon
  });

  mainWindow.loadFile(
      join(__dirname, 'index.html')
  );

  mainWindow.on('resize', () => {
    mainWindow.setSize(defaultWidth, defaultHeight);
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Prevent page refresh with Control + R and opening of console
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const CNTRL_R = input.control && input.key.toLowerCase() === 'r';
    const CNTRL_SHIFT_I = input.control && input.shift && input.key.toLowerCase() === 'i';

    if (CNTRL_R || CNTRL_SHIFT_I) event.preventDefault();
  });
};

// app.disableHardwareAcceleration();
app.commandLine.appendSwitch('ignore-gpu-blacklist', 'true');

app.on('ready', () => {
  if (require('electron-squirrel-startup')) app.quit();
  require('./scripts/view');
  setTimeout(() => createWindow(), 200);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

