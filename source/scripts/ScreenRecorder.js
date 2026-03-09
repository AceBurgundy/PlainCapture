import Stopwatch from "./Stopwatch.js";
import Backdrop from "./Backdrop.js";

/**
 * Screen recording manager that coordinates the MediaRecorder API,
 * a visual countdown timer, and IPC-based file saving.
 */
export default class ScreenRecorder {
  /**
   * Create a new ScreenRecorder instance.
   *
   * @param {MediaStream} stream - The mixed media stream to record.
   * @param {MediaRecorderOptions} options - Configuration for the MediaRecorder (mimeType, bitsPerSecond).
   * @param {string} [backdropElementId="backdrop"] - The ID of the DOM element used for the recording backdrop.
   * @throws {Error} If stream or options are missing.
   */
  constructor(stream, options, backdropElementId = "backdrop") {
    if (!stream || !options) {
      throw new Error("Missing parameters: ScreenRecorder requires a stream and options.");
    }

    /** @type {MediaRecorder} */
    const mediaRecorder = new MediaRecorder(stream, options);

    /** @type {Backdrop} */
    const backdropManager = new Backdrop(backdropElementId);

    /** @type {Stopwatch} */
    const recordingTimer = new Stopwatch();

    /**
     * Enum for recording states.
     * @readonly
     * @enum {string}
     */
    this.states = {
      RECORDING: "RECORDING",
      WAITING: "WAITING",
      PAUSED: "PAUSED"
    };

    /** @type {string} */
    this.state = this.states.WAITING;

    /**
     * Handles the dataavailable event by converting blobs to ArrayBuffers
     * and sending them to the main process via IPC.
     *
     * @param {BlobEvent} event - The event containing the recorded data chunk.
     */
    const handleDataAvailable = async (event) => {
      if (!event.data || event.data.size === 0) return;

      const dataBuffer = await event.data.arrayBuffer();

      // Write the chunk to the file system via the Electron IPC bridge
      window.ipcRecorder.writeChunk(dataBuffer);
    };

    /**
     * Displays a visual countdown overlay before recording starts.
     *
     * @returns {Promise<boolean>} Resolves to true when the countdown finishes.
     */
    const runStartCountdown = () => {
      backdropManager.generateBackdrop();

      const countdownDisplay = document.createElement("p");
      countdownDisplay.id = "countdown";
      document.body.appendChild(countdownDisplay);

      let currentCount = 5;

      return new Promise((resolve) => {
        const intervalId = setInterval(() => {
          countdownDisplay.textContent = currentCount.toString();
          currentCount--;

          if (currentCount < 0) {
            clearInterval(intervalId);

            backdropManager.hideBackdrop();
            countdownDisplay.remove();

            resolve(true);
          }
        }, 1000);
      });
    };

    /**
     * Initializes the file save path and starts the MediaRecorder.
     */
    const beginRecordingProcess = async () => {
      await window.ipcRecorder.startSave();

      mediaRecorder.ondataavailable = handleDataAvailable;

      // Request data chunks every 2000ms (2 seconds)
      mediaRecorder.start(2000);

      this.state = this.states.RECORDING;
      recordingTimer.start();
    };

    /**
     * Signals the main process to finalize the video file and reset state.
     *
     * @param {number} totalTime - The total duration of the recording in seconds.
     * @returns {Promise<boolean>} True if the save was successful.
     */
    const finalizeFileSave = async (totalTime) => {
      let isSaved = false;

      try {
        await window.ipcRecorder.stopSave(totalTime);
        isSaved = true;
      } catch (error) {
        console.error(`Finalize save error: ${error.message}`);
      }

      mediaRecorder.ondataavailable = null;
      this.state = this.states.WAITING;

      return isSaved;
    };

    /**
     * Starts or resumes the recording.
     *
     * @param {boolean} useCountdown - Whether to show the countdown before starting.
     */
    this.play = (useCountdown) => {
      if (this.state === this.states.WAITING) {
        if (!useCountdown) {
          beginRecordingProcess();
          return;
        }

        runStartCountdown().then(() => beginRecordingProcess());
        return;
      }

      if (this.state === this.states.PAUSED) {
        mediaRecorder.resume();
        recordingTimer.continue();
        this.state = this.states.RECORDING;
      }
    };

    /**
     * Stops the recording and triggers the file finalization process.
     *
     * @returns {Promise<boolean>} Resolves with the success status of the save operation.
     */
    this.stop = () => {
      return new Promise((resolve) => {
        const recordedDuration = recordingTimer.stop();

        mediaRecorder.onstop = async () => {
          const success = await finalizeFileSave(recordedDuration);
          resolve(success);
        };

        mediaRecorder.stop();
      });
    };

    /**
     * Pauses the current recording session and the internal timer.
     */
    this.pause = () => {
      if (this.state !== this.states.RECORDING) return;

      mediaRecorder.pause();
      recordingTimer.pause();

      this.state = this.states.PAUSED;
    };
  }
}