const { contextBridge, ipcRenderer } = require("electron");

/**
 * Preload script to securely expose Electron IPC functionality to the renderer process.
 * Using contextBridge ensures that the renderer process does not have direct access 
 * to Node.js or Electron internals, adhering to the principle of least privilege.
 */

contextBridge.exposeInMainWorld("ipcRecorder", {
  /**
   * Invokes the request to retrieve available desktop capture sources.
   * * @returns {Promise<Object>} A map of available windows and screens.
   */
  sources: () => ipcRenderer.invoke("sources"),

  /**
   * Invokes the request to initialize a recording session and file stream.
   * * @returns {Promise<{path: string}>} The path of the temporary file created.
   */
  startSave: () => ipcRenderer.invoke("start-save"),

  /**
   * Sends a video data chunk to the main process for disk writing.
   * * @param {ArrayBuffer | Buffer} chunk - The raw data chunk from MediaRecorder.
   * @returns {void}
   */
  writeChunk: (chunk) => ipcRenderer.send("write-chunk", chunk),

  /**
   * Invokes the request to stop the recording and finalize the video file.
   * * @param {number} totalTime - The total duration of the recording in seconds.
   * @returns {Promise<void>}
   */
  stopSave: (totalTime) => ipcRenderer.invoke("stop-save", totalTime)
});