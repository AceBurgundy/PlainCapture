const { ipcMain, dialog, desktopCapturer, shell, app } = require("electron");
const ffmpegPath = require("ffmpeg-static");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

/** @type {fs.WriteStream | null} */
let writeStream = null;

/** @type {string | null} */
let temporaryFilePath = null;

/** @type {string | null} */
let temporaryFolder = null;

/** @type {number} */
let pendingWrites = 0;

/**
 * Retrieves all available desktop sources (windows and screens).
 * * @returns {Promise<Object<string, {label: string, source: Electron.DesktopCapturerSource}>>}
 */
ipcMain.handle("sources", async () => {
  const sources = await desktopCapturer.getSources({
    types: ["window", "screen"]
  });

  const mappedSources = {};
  for (const source of sources) {
    mappedSources[source.name] = {
      label: source.name,
      source: source
    };
  }

  return mappedSources;
});


/**
 * Re-muxes a WebM file using FFmpeg to fix duration metadata and stream timestamps.
 * * @param {string} inputFile - Path to the raw temporary WebM file.
 * @param {string} outputFile - Path where the corrected WebM should be saved.
 * @returns {Promise<void>}
 */
function remuxWebM(inputFile, outputFile) {
  return new Promise((resolve, reject) => {

    const ffmpegProcess = spawn(ffmpegPath, [
      "-fflags", "+genpts",
      "-analyzeduration", "100M",
      "-probesize", "100M",
      "-err_detect", "ignore_err",
      "-i", inputFile,
      "-c", "copy",
      "-map", "0",
      "-avoid_negative_ts", "make_zero",
      "-max_interleave_delta", "0",
      "-f", "webm",
      "-y",
      outputFile
    ]);

    ffmpegProcess.stderr.on("data", (data) => {
      console.log("FFmpeg Output:", data.toString());
    });

    ffmpegProcess.on("error", reject);

    ffmpegProcess.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });
  });
}

/**
 * Initializes a recording session by creating a temporary directory and write stream.
 * * @returns {Promise<{path: string}>} The path to the temporary file created.
 */
ipcMain.handle("start-save", async () => {

  // Create a unique temporary directory for the recording session
  temporaryFolder = fs.mkdtempSync(
    path.join(os.tmpdir(), "plaincap-")
  );

  const timestamp = Date.now();

  temporaryFilePath = path.join(
    temporaryFolder,
    `temporary-recorded-video-${timestamp}.webm`
  );

  // High water mark set to 1MB to buffer writes efficiently
  writeStream = fs.createWriteStream(temporaryFilePath, {
    highWaterMark: 1024 * 1024
  });

  pendingWrites = 0;

  return { path: temporaryFilePath };
});

/**
 * Writes a binary chunk of video data to the active write stream.
 * * @param {Electron.IpcMainEvent} event - The IPC event object.
 * @param {ArrayBuffer | Buffer} chunk - The video data chunk from the renderer.
 */
ipcMain.on("write-chunk", (event, chunk) => {

  if (!writeStream) return;

  // Convert IPC chunk safely to Node buffer
  const dataBuffer = Buffer.from(new Uint8Array(chunk));

  // Write data and rely on Node's internal stream buffering
  const isBufferFull = !writeStream.write(dataBuffer);

  if (isBufferFull) {
    // Handling backpressure if the stream buffer is full
    writeStream.once("drain", () => {});
  }
});

/**
 * Finalizes the recording, waits for pending writes, and prompts the user for a save location.
 * * @returns {Promise<void>}
 */
ipcMain.handle("stop-save", async () => {

  if (!writeStream) return;

  return new Promise((resolve) => {

    // Signal that no more chunks will be written
    writeStream.end();

    writeStream.on("finish", async () => {

      // Basic validation to ensure the temporary file exists and is valid
      if (!fs.existsSync(temporaryFilePath)) {
        console.error("Recording file missing.");
        performCleanup();
        resolve();
        return;
      }

      const fileStats = fs.statSync(temporaryFilePath);

      if (fileStats.size < 1000) {
        console.error("Recording file too small or empty.");
        performCleanup();
        resolve();
        return;
      }

      const defaultSaveFolder = path.join(app.getPath("downloads"), "recorded");

      if (!fs.existsSync(defaultSaveFolder)) {
        fs.mkdirSync(defaultSaveFolder, { recursive: true });
      }

      const defaultFileName = `recorded-video-${Date.now()}.webm`;
      const defaultSavePath = path.join(defaultSaveFolder, defaultFileName);

      const { canceled, filePath } = await dialog.showSaveDialog({
        title: "Save Video",
        defaultPath: defaultSavePath
      });

      const finalSavePath = canceled ? defaultSavePath : filePath;

      try {
        // Correct the video metadata using FFmpeg remuxing
        await remuxWebM(temporaryFilePath, finalSavePath);

        if (!canceled) {
          shell.openPath(finalSavePath);
        }
      } catch (error) {
        console.error("FFmpeg processing failed:", error);

        // If FFmpeg fails, attempt to open the raw temporary file as a fallback
        if (!canceled) {
          shell.openPath(temporaryFilePath);
        }
      }

      performCleanup();
      resolve();
    });
  });
});

/**
 * Removes temporary files and directories and resets global recording state.
 */
function performCleanup() {
  try {
    if (temporaryFolder && fs.existsSync(temporaryFolder) == true) {
      // Force remove the temporary directory and all its contents
      fs.rmSync(temporaryFolder, { recursive: true, force: true });
    }
  } catch (error) {
    console.error("Cleanup error:", error);
  }

  // Reset internal state variables
  writeStream = null;
  temporaryFilePath = null;
  temporaryFolder = null;
  pendingWrites = 0;
}