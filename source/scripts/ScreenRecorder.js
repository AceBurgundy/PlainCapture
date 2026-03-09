import Stopwatch from './Stopwatch.js';
import Backdrop from './Backdrop.js';
/**
 * Represents a class for recording and saving media streams.
 * @class
 * @export default
 */
export default class ScreenRecorder {
  /**
   * Creates an instance of the MediaRecorderManager.
   * @constructor
   * @param {MediaStream} stream - The media stream to be recorded.
   * @param {Object} options - Options for the MediaRecorder.
   * @param {string} [backdropElementId='backdrop'] the id for the backdrop element
   * @throws {Error} Throws an error if stream or options are missing.
   */
  constructor(stream, options, backdropElementId='backdrop') {
    if (!stream || !options) throw new Error('Missing parameters');

    /**
     * @type {MediaRecorder}
     */
    const mediaRecorder = new MediaRecorder(stream, options);

    /**
     * @type {Backdrop}
     */
    const backdrop = new Backdrop(backdropElementId);

    /**
     * @type {Stopwatch}
     */
    const timer = new Stopwatch();

    /**
     * @type {ArrayBuffer[]}
     */
    const recordedChunks = [];

    this.states = {
      RECORDING: 'RECORDING',
      WAITING: 'WAITING',
      PAUSED: 'PAUSED'
    };

    /**
     * @type {string}
     */
    this.state = this.states.WAITING;

    /**
     * Event handler for recording stream data.
     * @private
     * @param {MediaRecorder} event - The MediaRecorder event containing recorded data.
     */
    const recordStream = event => {
      recordedChunks.push(event.data);
    };

    /**
     * Starts a countdown
     * @public
     * @return {Promise<Boolean>} true if the countdown has been completed
     */
    const startCountDown = () => {
      backdrop.generateBackdrop();
      const holder = document.createElement('p');
      holder.id = 'countdown';
      document.body.appendChild(holder);

      let countdownCount = 5;

      return new Promise(resolve => {
        const intervalId = setInterval(() => {
          holder.textContent = countdownCount;
          countdownCount--;

          if (countdownCount < 0) {
            clearInterval(intervalId);
            backdrop.hideBackdrop();

            holder.remove();
            resolve(true);
          }
        }, 1000);
      });
    };

    /**
     * Starts the recording
     * @private
     */
    const startRecording = () => {
      mediaRecorder.start(200);
      this.state = this.states.RECORDING;
      mediaRecorder.ondataavailable = recordStream;
      timer.start();
    };

    /**
     * Saves the recorded data.
     * @private
     * @async
     * @param {MediaRecorder} event - The MediaRecorderEvent triggered when recording stops.
     * @param {number} totalTime - The total duration.
     * @return {Promise<void>} A promise that resolves when the data is saved.
     */
    const save = async (event, totalTime) => {
      let saved = false;

      const blob = new Blob(recordedChunks, {
        type: 'video/webm; codecs=vp9'
      });

      const buffer = await blob.arrayBuffer();

      try {
        await window.ipcRenderer.saveFile(buffer, totalTime);

        saved = true;
      } catch (error) {
        console.error(error.message);
      }

      mediaRecorder.ondataavailable = null;
      recordedChunks.length = 0;
      this.state = this.states.WAITING;
      return saved;
    };

    /**
     * Starts or resumes recording.
     * @public
     * @param {boolean} [countdown=false] - If a countdown is permitter before starting
     */
    this.play = (countdown=false) => {
      if (this.state === this.states.WAITING) {
        if (!countdown) {
          startRecording();
          return;
        }

        startCountDown().then(() => startRecording());
        return;
      }

      if (this.state === this.states.PAUSED) {
        mediaRecorder.resume();
        timer.continue();
        this.state = this.states.RECORDING;
      }
    };

    /**
     * Stops the recording and triggers the save process.
     * @public
     */
    this.stop = async () => {
      mediaRecorder.stop();
      const totalTime = timer.stop();
      return mediaRecorder.onstop = event => save(event, totalTime);
    };

    /**
     * Pauses the recording.
     */
    this.pause = () => {
      if (this.state !== this.states.RECORDING) return;

      mediaRecorder.pause();
      timer.pause();
      this.state = this.states.PAUSED;
    };
  }
}
