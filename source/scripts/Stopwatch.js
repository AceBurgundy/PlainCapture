/**
 * Stopwatch class to measure elapsed time.
 * This implementation uses closure-based private variables within the constructor
 * to manage state.
 */
export default class Stopwatch {
  /**
   * Create a new Stopwatch instance.
   */
  constructor() {
    /**
     * Time when the stopwatch started or resumed (in milliseconds).
     * @type {number}
     */
    let startTime = 0;

    /**
     * Indicates whether the stopwatch is currently running.
     * @type {boolean}
     */
    let isRunning = false;

    /**
     * Elapsed time in milliseconds.
     * @type {number}
     */
    let elapsedTime = 0;

    /**
     * Interval ID for the setInterval function.
     * @type {number | null}
     */
    let updateInterval = null;

    /**
     * Start the stopwatch.
     * * If the stopwatch is not already running, it captures the current timestamp
     * and begins an interval to update the elapsed time.
     * * @returns {void}
     */
    this.start = () => {
      if (!isRunning) {
        // Adjust startTime to account for previously accumulated elapsed time
        startTime = Date.now() - elapsedTime;
        isRunning = true;

        updateInterval = setInterval(() => {
          elapsedTime = Date.now() - startTime;
        }, 1000);
      }
    };

    /**
     * Pause the stopwatch.
     * * Stops the interval timer but preserves the current elapsed time.
     * * @returns {void}
     */
    this.pause = () => {
      if (isRunning) {
        if (updateInterval) {
          clearInterval(updateInterval);
        }
        isRunning = false;
      }
    };

    /**
     * Resume the stopwatch if paused.
     * * A wrapper for the start method to maintain logical clarity for 
     * continuing a paused session.
     * * @returns {void}
     */
    this.continue = () => {
      if (!isRunning) {
        this.start();
      }
    };

    /**
     * Stop the stopwatch and reset all internal values.
     *
     * @returns {number} The total duration accumulated before the reset in seconds.
     */
    this.stop = () => {
      if (updateInterval) {
        clearInterval(updateInterval);
      }
      
      isRunning = false;
      
      // Store the final duration before resetting
      const totalDurationInMilliseconds = elapsedTime;
      
      // Reset state
      elapsedTime = 0;
      startTime = 0;
      
      // Convert milliseconds to seconds
      return totalDurationInMilliseconds / 1000;
    };
  }
}