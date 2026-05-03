import ScreenRecorder from "./ScreenRecorder.js";
import makeToastNotification from "./toast.js";

const RECORD_WIDTH = 1920;
const RECORD_HEIGHT = 1080;
const RECORD_FPS = 30;

/** @type {string} */
const VIDEO_MIME_TYPE = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
  ? "video/webm;codecs=vp9"
  : "video/webm;codecs=vp8";

/**
 * Shorthand for document.getElementById.
 * @param {string} id - Element ID.
 * @returns {HTMLElement | null}
 */
const getElementById = (id) => document.getElementById(id);

const microphoneToggle = getElementById("microphone-prompt");
const previewVideoElement = getElementById("video");
const sourcesDropdown = getElementById("sources");

const startButton = getElementById("start");
const pauseButton = getElementById("pause");
const stopButton = getElementById("stop");

/** @type {ScreenRecorder | null} */
let screenRecorder = null;

/** @type {MediaStream | null} */
let videoStream = null;

/** @type {MediaStream | null} */
let audioStream = null;

/** @type {Electron.DesktopCapturerSource | null} */
let preferredSource = null;

/**
 * Downscales a MediaStream using an offscreen canvas to achieve the target
 *
 * @param {MediaStream} inputStream - The raw source stream.
 * @param {number} width - Target width.
 * @param {number} height - Target height.
 * @param {number} fps - Target frames per second.
 * @returns {MediaStream} The downscaled MediaStream.
 */
function downscaleStream(inputStream, width, height, fps) {
  const videoElement = document.createElement("video");

  videoElement.srcObject = inputStream;
  videoElement.autoplay = true;
  videoElement.muted = true;
  videoElement.playsInline = true;
  
  // Important for color accuracy
  videoElement.style.colorSpace = "srgb";
  videoElement.play();

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", {
    alpha: false,
    desynchronized: true,
    willReadFrequently: false,
    colorSpace: "srgb"
  });

  function draw() {
    context.imageSmoothingEnabled = false;
    context.filter = "saturate(1.4) contrast(1.05)";
    // context.filter = "saturate(1.35) contrast(1.06) brightness(1.03)";
    context.drawImage(videoElement, 0, 0, width, height);
    
    // Use requestAnimationFrame for smoother rendering and better performance
    // Also prevents sections in the video to freeze
    requestAnimationFrame(draw);
  }

  draw();

  return canvas.captureStream(fps);
}

/**
 * Fetches available desktop capture sources via Electron IPC.
 *
 * @returns {Promise<Object | null>} Map of sources or null on error.
 */
async function getAvailableSources() {
  try {
    return await window.ipcRecorder.sources();
  } catch (error) {
    console.error("Error retrieving video sources:", error);
    makeToastNotification("No video sources found");
    return null;
  }
}

// Initial source fetch
const availableSources = await getAvailableSources();

/**
 * Populates the source selection dropdown with available windows/screens.
 */
function loadVideoSources() {
  if (!availableSources) return;

  sourcesDropdown.replaceChildren();

  const defaultOption = document.createElement("option");
  defaultOption.id = "disabled-option";
  defaultOption.disabled = true;
  defaultOption.selected = true;
  defaultOption.textContent = "Select video source";

  sourcesDropdown.appendChild(defaultOption);

  for (const sourceName in availableSources) {
    const option = document.createElement("option");
    option.className = "video-source-option";
    option.value = sourceName;
    option.textContent = sourceName;

    sourcesDropdown.appendChild(option);
  }
}

loadVideoSources();


if (availableSources) {
  const firstSourceName = Object.keys(availableSources)[0];

  if (firstSourceName) {
    preferredSource = availableSources[firstSourceName].source;
    sourcesDropdown.value = firstSourceName;

    createRecorderInstance();
  }
}

microphoneToggle.onclick = () => {
  microphoneToggle.classList.toggle("active");

  const isMicrophoneActive = microphoneToggle.classList.contains("active");

  makeToastNotification(isMicrophoneActive ? "Microphone used" : "Audio muted");

  // Re-initialize recorder if a source is already selected
  if (preferredSource) {
    createRecorderInstance();
  }
};

/**
 * Configures media constraints, captures streams, downscales video, 
 * and initializes the ScreenRecorder instance.
 *
 * @returns {Promise<void>}
 */
async function createRecorderInstance() {
  if (!preferredSource) return;

  const isMicrophoneActive = microphoneToggle.classList.contains("active");

  const videoConstraints = {
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: preferredSource.id,
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: RECORD_FPS }
      }
    }
  };

  const audioConstraints = {
    video: false,
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      sampleRate: 44100
    }
  };

  // Dynamically load muted audio utility
  const audioModule = await import("./produce-muted-audio.js");
  const getMutedAudioStream = audioModule.default;

  try {
    videoStream = await navigator.mediaDevices.getUserMedia(videoConstraints);
  } catch (error) {
    makeToastNotification("Screen capture permission denied");
    return;
  }

  try {
    audioStream = isMicrophoneActive
      ? await navigator.mediaDevices.getUserMedia(audioConstraints)
      : await getMutedAudioStream();
  } catch (error) {
    makeToastNotification("Audio permission denied");
  }

  const scaledVideoStream = downscaleStream(
    videoStream,
    RECORD_WIDTH,
    RECORD_HEIGHT,
    RECORD_FPS
  );

  const mixedStream = new MediaStream([
    ...scaledVideoStream.getTracks(),
    ...audioStream.getTracks()
  ]);

  // The preview shows the raw stream (full resolution) for user feedback
  previewVideoElement.srcObject = videoStream;

  previewVideoElement.onloadedmetadata = async () => {
    try {
      await previewVideoElement.play();
    } catch (error) {
      console.error("Preview playback failed:", error);
    }
  };

  const recorderOptions = {
    mimeType: VIDEO_MIME_TYPE,
    videoBitsPerSecond: 20000000, // 20 Mbps for high-quality recording
    keyframeInterval: 3000 // Keyframe every 3 seconds
  };

  screenRecorder = new ScreenRecorder(mixedStream, recorderOptions);
}

sourcesDropdown.onfocus = loadVideoSources;

sourcesDropdown.onchange = async (event) => {
  const sourceName = event.target.value;
  preferredSource = availableSources[sourceName].source;
  await createRecorderInstance();
};

startButton.onclick = () => {
  if (!screenRecorder) {
    makeToastNotification("Choose a source first");
    return;
  }

  pauseButton.style.display = "block";
  startButton.style.display = "none";

  screenRecorder.play(true);
};

pauseButton.onclick = () => {
  pauseButton.style.display = "none";
  startButton.style.display = "block";

  screenRecorder.pause();
};

stopButton.onclick = async () => {
  if (!screenRecorder) {
    makeToastNotification("Choose a source first");
    return;
  }

  // Ensure recording has actually begun before attempting to stop
  if (screenRecorder.state === screenRecorder.states.WAITING) {
    makeToastNotification("Start recording first");
    return;
  }

  pauseButton.style.display = "none";
  startButton.style.display = "block";

  const isSavedSuccessfully = await screenRecorder.stop();

  makeToastNotification(isSavedSuccessfully ? "Video saved" : "Failed to save video");

  // Release media hardware resources
  if (videoStream) {
    videoStream.getTracks().forEach((track) => track.stop());
  }
  if (audioStream) {
    audioStream.getTracks().forEach((track) => track.stop());
  }

  if (preferredSource !== null) {
    // Recreate recorder instance to reset state and allow new recordings without page refresh
    // This prevents the preview screen to go black after clicking stop recording.
    await createRecorderInstance();
  }
};