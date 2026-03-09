/* eslint-disable linebreak-style */
const { app, BrowserWindow } = require('electron');
const { join, resolve } = require('path');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

/** @type {string | undefined} */
let applicationIcon;

// Determine the appropriate icon format based on the operating system
switch (process.platform) {
  case 'win32':
    applicationIcon = resolve(__dirname, '../source/assets/logo', 'switch.ico');
    break;
  case 'darwin':
    applicationIcon = resolve(__dirname, '../source/assets/logo', 'switch.icns');
    break;
  case 'linux':
    applicationIcon = resolve(__dirname, '../source/assets/logo', 'switch.png');
    break;
}

/**
 * Creates and configures the main application window.
 * * @returns {Promise<void>}
 */
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
      nodeIntegration: false, // Security best practice
      contextIsolation: true, // Recommended for modern Electron
      preload: join(__dirname, 'preload.js'),
    },
    resizable: false,
    icon: applicationIcon
  });

  mainWindow.loadFile(join(__dirname, 'index.html'));

  // Optimization: Show window only when the content is ready to prevent flickering
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  /**
   * Input event interceptor.
   * Prevents page refresh (Ctrl+R) and opening DevTools (Ctrl+Shift+I) 
   * to maintain a kiosk-like application state.
   */
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const isControlR = input.control && input.key.toLowerCase() === 'r';
    const isControlShiftI = input.control && input.shift && input.key.toLowerCase() === 'i';

    if (isControlR || isControlShiftI) {
      event.preventDefault();
    }
  });
};

// Enable GPU-based video encoding and ignore driver blacklists for performance
app.commandLine.appendSwitch('ignore-gpu-blacklist', 'true');
app.commandLine.appendSwitch('enable-features', 'VaapiVideoEncoder');

/**
 * Event listener for Electron app initialization.
 */
app.on('ready', () => {
  // Check again for squirrel startup to prevent multiple instances during install
  if (require('electron-squirrel-startup')) {
    app.quit();
  }

  // Load backend logic scripts
  require('./scripts/view');

  // Slight delay before window creation to ensure system resources are ready
  setTimeout(() => {
    createWindow();
  }, 200);
});

/**
 * Quits the application when all windows are closed, 
 * except on macOS (darwin) where apps typically stay active.
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * Re-creates a window if the dock icon is clicked and no other windows are open (macOS).
 */
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});