const { ipcMain, dialog, desktopCapturer, shell, app } = require("electron");
const { spawn } = require("child_process");
const log = require("electron-log");
const path = require("path");
const fs = require("fs");

log.info("added");

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
  // Use FFmpeg to remux the WebM file, which can correct metadata and ensure better compatibility with media players
  return new Promise((resolve, reject) => {

    const ffmpegProcess = spawn("ffmpeg", [
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
      log.error("FFmpeg Output:", data.toString());
    });

    // Handle FFmpeg errors and process exit
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
  try {
    // Use Electron's official temp path instead of os.tmpdir()
    const systemTempPath = app.getPath("temp");

    // Create a unique temporary directory for the recording session
    temporaryFolder = fs.mkdtempSync(
      path.join(systemTempPath, "plaincap-")
    );

    const timestamp = Date.now();

    temporaryFilePath = path.join(
      temporaryFolder,
      `temporary-recorded-video-${timestamp}.webm`
    );

    // Ensure folder exists (extra safety for packaged apps)
    fs.mkdirSync(temporaryFolder, { recursive: true });

    // High water mark set to 1MB to buffer writes efficiently
    writeStream = fs.createWriteStream(temporaryFilePath, {
      highWaterMark: 1024 * 1024
    });

    pendingWrites = 0;

    writeStream.on("error", (error) => {
      log.error("Write stream error:", error);
    });

    return { path: temporaryFilePath };

  } catch (error) {
    log.error("Failed to start recording session:", error);
    performCleanup();

    return { path: null };
  }
});

/**
 * Writes a binary chunk of video data to the active write stream.
 * * @param {Electron.IpcMainEvent} event - The IPC event object.
 * @param {ArrayBuffer | Buffer} chunk - The video data chunk from the renderer.
 */
ipcMain.on("write-chunk", (event, chunk) => {
  // If the write stream is not initialized, we cannot write data, so we log and ignore the chunk
  if (!writeStream) return;

  try {

    // Convert IPC chunk safely to Node buffer
    const dataBuffer = Buffer.from(new Uint8Array(chunk));
    pendingWrites++;

    // Write data and rely on Node's internal stream buffering
    const isBufferFull = !writeStream.write(dataBuffer, () => {
      pendingWrites--;
    });

    if (isBufferFull) {
      // Handling backpressure if the stream buffer is full
      writeStream.once("drain", () => {});
    }
  } catch (error) {
    log.error("Chunk write failed:", error);
  }
});

/**
 * Finalizes the recording, waits for pending writes, and prompts the user for a save location.
 * * @returns {Promise<void>}
 */
ipcMain.handle("stop-save", async () => {
  // If the write stream was never initialized, we can skip the finalization process
  if (!writeStream) return;

  return new Promise(resolve => {
    const finalize = () => {
      // End the write stream to flush all data to disk
      writeStream.end();

      writeStream.once("finish", async () => {
        try {

          // Basic validation to ensure the temporary file exists and is valid
          if (!temporaryFilePath || !fs.existsSync(temporaryFilePath)) {
            log.error("Recording file missing.");

            performCleanup();
            resolve();
            return;
          }

          const fileStats = fs.statSync(temporaryFilePath);

          if (fileStats.size < 1000) {
            log.error("Recording file too small or empty.");

            performCleanup();
            resolve();
            return;
          }

          const defaultSaveFolder = path.join(app.getPath("downloads"), "recorded");

          if (!fs.existsSync(defaultSaveFolder) == true) {
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

            // Wait until the file actually exists and has data
            for (let index = 0; index < 20; index++) {
              if (fs.existsSync(finalSavePath) == true) {
                const stats = fs.statSync(finalSavePath);
                // Check if the file has a reasonable size to ensure it's not just an empty placeholder
                if (stats.size > 0) break;
              }
              
              await new Promise(_ => setTimeout(_, 100));
            }
            
            if (!canceled) {
              await shell.openPath(finalSavePath);
            }
          } catch (error) {
            log.error("FFmpeg processing failed:", error);

            // If FFmpeg fails, attempt to open the raw temporary file as a fallback
            if (!canceled) {
              await shell.openPath(temporaryFilePath);
            }
          }
        } catch (error) {
          log.error("Finalize error:", error);
        }

        performCleanup();
        resolve();
      });
    };

    /**
     * Wait until all pending write operations complete before finalizing.
     */
    const waitForWrites = () => {
      if (pendingWrites === 0) {
        finalize();
      } else {
        setTimeout(waitForWrites, 50);
      }
    };

    waitForWrites();
  });
});

/**
 * Removes temporary files and directories and resets global recording state.
 */
function performCleanup() {
  try {
    // Destroy the write stream if it exists to release file handles
    if (writeStream) {
      try {
        writeStream.destroy();
      } catch {}
    }

    // Remove the temporary file if it exists
    if (temporaryFolder && fs.existsSync(temporaryFolder) === true) {
      // Force remove the temporary directory and all its contents
      fs.rmSync(temporaryFolder, {
        recursive: true,
        force: true
      });
    }
  } catch (error) {
    log.error("Cleanup error:", error);
  }

  // Reset internal state variables
  writeStream = null;
  temporaryFilePath = null;
  temporaryFolder = null;
  pendingWrites = 0;
}