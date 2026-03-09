/** @type {HTMLElement | null} */
const toastContainer = document.getElementById('toasts');

/**
 * Creates and displays a temporary toast notification on the screen.
 * * This function appends a div element to the global toast container,
 * applies a standard class, and automatically removes it after a delay.
 * * @param {string} message - The text content to display within the notification.
 * @throws {Error} If the toast container element (#toasts) is not found in the DOM.
 * @throws {Error} If the message is missing or is not a valid string.
 * @returns {void}
 * * @example
 * makeToastNotification('File saved successfully!');
 */
export default function makeToastNotification(message) {
  // Check for the existence of the global container
  if (!toastContainer) {
    throw new Error(`Missing toast container element`);
  }

  // Validate that a message was provided
  if (!message) {
    throw new Error(`Cannot call toast without a message`);
  }

  // Ensure the message is a string to prevent unexpected behavior
  if (typeof message !== 'string') {
    throw new Error(`Cannot call toast on non-string message`);
  }

  const toastElement = document.createElement('div');
  toastElement.className = 'toast';
  toastElement.textContent = message;

  // Append the new notification to the container
  toastContainer.appendChild(toastElement);

  // Automatically remove the element after 4000 milliseconds (4 seconds)
  setTimeout(() => {
    toastElement.remove();
  }, 4000);
}