import ScreenRecorder from './ScreenRecorder.js';
import makeToastNotification from './toast.js';

const queryElement = name => document.querySelector(name);
const getById = name => document.getElementById(name);

const microphone = getById('microphone-prompt');
const previewELement = queryElement('video');
const sourcesELement = getById('sources');

/**
 * Invokes the 'sources' method using window.ipcRenderer
 * to retrieve video sources asynchronously.
 * @async
 * @return {Promise<[Object]> | null} - A promise that resolves with
 * an array of video sources, or rejects with an error. Returns null if an error occurs.
 */
async function getSources() {
  try {
    return await window.ipcRenderer.sources();
  } catch (error) {
    console.error('Error retrieving video sources:', error);
    makeToastNotification('No video sources found');
    return null;
  }
}

const sources = await getSources();

/**
 * Loads available video sources into a dropdown element,
 * allowing the user to select a video source.
 */
function loadVideoSources() {
  if (!sources) return;

  sourcesELement.innerHTML = /* html */`
  <option id="disabled-option" disabled selected>Select video source</option>
  `;

  Object.keys(sources).forEach(source => {
    sourcesELement.innerHTML += /* html */`
      <option class='video-source-option' value='${source}'>
      ${source}
      </option>
    `;
  });
}

loadVideoSources();

/**
 * @type {ScreenRecorder}
 */
let screenRecorder;

/**
 * @type {MediaStream}
 */
let stream;

/**
 * @type {MediaStream}
*/
let audio;

let preferredSource;

microphone.onclick = () => {
  microphone.classList.toggle('active');
  const isActive = microphone.classList.contains('active');

  makeToastNotification(isActive ? 'Microphone used' : 'Audio muted');
  createRecorderInstance();
};

/**
 * Creates a new recorder
 */
async function createRecorderInstance() {
  const useMicrophone = microphone.classList.contains('active');

  const videoConstraints = {
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: preferredSource.id,
        aspectRatio: {ideal: 1.777777778},
        height: {ideal: 1080},
        width: {ideal: 1920}
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

  const audioModule = await import('./produce-muted-audio.js');
  const useMutedAudioStream = audioModule.default;

  stream = await navigator.mediaDevices.getUserMedia(videoConstraints);
  audio = useMicrophone ?
      await navigator.mediaDevices.getUserMedia(audioConstraints) :
      await useMutedAudioStream();

  // merges both audio and video if use of microphone is true
  const mixedStream = new MediaStream([
    ...stream.getTracks(),
    ...audio.getTracks()
  ]);

  previewELement.srcObject = stream;

  previewELement.onloadedmetadata = async () => {
    await previewELement.play();
  };

  const options = {mimeType: 'video/webm; codecs=vp9'};
  screenRecorder = new ScreenRecorder(mixedStream, options);
}

sourcesELement.onfocus = () => loadVideoSources();
sourcesELement.onchange = async event => {
  preferredSource = sources[event.target.value].source;
  createRecorderInstance();
};

const startELement = getById('start');
const pauseElement = getById('pause');
const stopELement = getById('stop');

startELement.onclick = () => {
  if (!screenRecorder) {
    makeToastNotification('Choose a source first');
    return;
  }

  pauseElement.style.display = 'block';
  startELement.style.display = 'none';

  screenRecorder.play(true);
};

pauseElement.onclick = () => {
  pauseElement.style.display = 'none';
  startELement.style.display = 'block';

  screenRecorder.pause();
};

stopELement.onclick = async () => {
  if (!screenRecorder) {
    makeToastNotification('Choose a source first');
    return;
  }

  if (screenRecorder.state == screenRecorder.states.WAITING) {
    makeToastNotification('Start recording first');
    return;
  }

  pauseElement.style.display = 'none';
  startELement.style.display = 'block';

  const saved = await screenRecorder.stop();
  makeToastNotification(saved ? 'Video saved' : 'Failed to save video');

  if (stream) {
    stream.getTracks().forEach(track => track.stop);
  }

  if (audio) {
    audio.getTracks().forEach(track => track.stop);
  }
};
