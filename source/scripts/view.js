const { ipcMain, dialog, desktopCapturer, shell, app } = require("electron");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");

/** @type {fs.WriteStream | null} */
let writeStream = null;

/** @type {string | null} */
let tempFilePath = null;

/** @type {string | null} */
let finalFilePath = null;

/** @type {boolean} */
let recordingCanceled = false;

/**
 * Retrieves available desktop sources (windows and screens) for capture.
 *
 * @returns {Promise<Object<string, {label: string, source: Electron.DesktopCapturerSource}>>} 
 * A map of source names to their corresponding source objects.
 */
ipcMain.handle("sources", async () => {
  const sources = await desktopCapturer.getSources({
    types: ["window", "screen"]
  });

  const mappedSources = {};

  sources.forEach((source) => {
    mappedSources[source.name] = {
      label: source.name,
      source: source
    };
  });

  return mappedSources;
});

/**
 * Checks if a directory exists at the specified path.
 *
 * @param {string} folderPath - The absolute path to the directory.
 * @returns {boolean} True if the directory exists, false otherwise.
 */
function doesFolderExist(folderPath) {
  try {
    return fs.statSync(folderPath).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Uses FFmpeg to update the duration metadata of a video file.
 * * This is typically used to fix WebM files recorded in chunks that 
 * lack a proper duration header.
 *
 * @param {string} inputFile - Path to the temporary video file.
 * @param {number} durationInSeconds - The total duration of the recording in seconds.
 * @returns {Promise<void>} Resolves when the FFmpeg command completes.
 */
function changeVideoDuration(inputFile, durationInSeconds) {
  return new Promise((resolve, reject) => {
    const directory = path.dirname(inputFile);
    const filename = path.basename(inputFile);

    // Create the final output filename by removing the "temp " prefix
    const outputFile = path.join(directory, filename.replace("temp ", ""));

    const command = `ffmpeg -i "${inputFile}" -c copy -metadata duration=${durationInSeconds} "${outputFile}"`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }

      // Check for stderr as FFmpeg often outputs progress/warnings there, 
      // but only reject if it indicates a fatal interruption.
      if (stderr) {
        // Many FFmpeg versions write to stderr by default even for success.
        // We resolve here to maintain original behavior while noting the output.
      }

      resolve();
    });
  });
}

/**
 * Initializes the recording session, creates the save directory, 
 * and opens a system save dialog.
 *
 * @returns {Promise<{path: string}>} The path to the temporary file created for writing.
 */
ipcMain.handle("start-save", async () => {
  const defaultFolder = path.join(app.getPath("downloads"), "recorded");

  if (!doesFolderExist(defaultFolder)) {
    try {
      fs.mkdirSync(defaultFolder);
    } catch (error) {
      // EEXIST = File/Folder already exists
      if (error.code !== "EEXIST") throw error;
    }
  }

  const timestamp = Date.now();
  const defaultFileName = `recorded-video-${timestamp}.webm`;
  const defaultPath = path.join(defaultFolder, defaultFileName);

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "Save Video",
    defaultPath: defaultPath
  });

  finalFilePath = canceled ? defaultPath : filePath;

  const fileName = path.basename(finalFilePath);
  const directory = path.dirname(finalFilePath);

  // Prefix temporary file to distinguish it from the final processed output
  tempFilePath = path.join(directory, "temp " + fileName);

  if (path.extname(tempFilePath) !== ".webm") {
    tempFilePath += ".webm";
  }

  recordingCanceled = canceled;

  writeStream = fs.createWriteStream(tempFilePath);

  return { path: tempFilePath };
});

/**
 * Receives video data chunks from the renderer process and writes them to disk.
 *
 * @param {Electron.IpcMainEvent} event - The IPC event object.
 * @param {ArrayBuffer | Buffer} chunk - The video data chunk to write.
 */
ipcMain.on("write-chunk", (event, chunk) => {
  if (!writeStream) return;

  try {
    writeStream.write(Buffer.from(chunk));
  } catch (error) {
    console.error("Chunk write error:", error);
  }
});

/**
 * Ends the recording session, flushes the stream, and triggers the 
 * FFmpeg duration fix.
 *
 * @param {Electron.IpcMainEvent} event - The IPC event object.
 * @param {number} totalTime - The total duration of the recorded video in seconds.
 * @returns {Promise<void>}
 */
ipcMain.handle("stop-save", async (event, totalTime) => {
  if (!writeStream) return;

  return new Promise((resolve) => {
    writeStream.end(async () => {
      // Logic assumes tempFilePath always contains "temp " per the start-save logic
      const savedPath = tempFilePath.replace("temp ", "");

      try {
        await changeVideoDuration(tempFilePath, totalTime);

        if (!recordingCanceled) {
          shell.openPath(savedPath);
        }
      } catch (error) {
        console.error("Duration fix failed:", error);

        // Fallback: Open the raw temp file if processing failed
        if (!recordingCanceled) {
          shell.openPath(tempFilePath);
        }
      } finally {
        // Cleanup: Remove the temporary file after processing or failure
        fs.unlink(tempFilePath, (error) => {
          if (error) {
            console.error("Temp delete failed:", error);
          }
        });

        // Reset global state for the next recording
        writeStream = null;
        tempFilePath = null;
        finalFilePath = null;

        resolve();
      }
    });
  });
});