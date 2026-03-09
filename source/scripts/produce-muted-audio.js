/**
 * Produces a muted audio MediaStream using the Web Audio API.
 * This is used as a fallback or placeholder when microphone access is disabled
 * but the MediaRecorder still requires an active audio track to initialize.
 *
 * @returns {Promise<MediaStream>} A promise that resolves to a MediaStream containing a silent track.
 * @example
 * const silentStream = await produceMutedAudio();
 */
export default async function produceMutedAudio() {
  // Create an audio context to manage the audio graph
  const audioContext = new AudioContext();

  // Create a destination node that outputs a MediaStream
  const streamDestination = audioContext.createMediaStreamDestination();

  // Create a gain node to control volume
  const gainNode = audioContext.createGain();

  // Set gain to 0.0 to ensure the output is completely silent
  gainNode.gain.value = 0.0;

  // Connect the gain node to the stream destination
  gainNode.connect(streamDestination);

  /** @type {MediaStream} */
  const silentStream = streamDestination.stream;

  /**
   * Note: The original implementation forces an empty array for getAudioTracks.
   * This preserves that specific behavior for compatibility with the mixed-stream logic.
   */
  return Object.assign(silentStream, {
    getAudioTracks: () => []
  });
}