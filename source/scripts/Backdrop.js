/**
 * Manages the visual backdrop overlay for the application.
 * Used primarily to block user interaction and provide a background for the countdown.
 */
export default class Backdrop {
  /**
   * Creates an instance of the Backdrop manager.
   * * @param {string} backdropId - The unique identifier for the backdrop DOM element.
   */
  constructor(backdropId) {
    /**
     * The unique identifier for the backdrop element.
     * @type {string}
     */
    this.backdropId = backdropId;

    /**
     * The cached reference to the backdrop DOM element.
     * @type {HTMLElement | null}
     */
    this.backdropElement = document.getElementById(this.backdropId);
  }

  /**
   * Generates or activates the backdrop overlay.
   * * Disables pointer events on the body to prevent user interaction,
   * then either activates an existing backdrop or creates a new one.
   * * @returns {void}
   */
  generateBackdrop() {
    // Disable all mouse and touch interactions on the page
    document.body.style.pointerEvents = "none";

    if (this.backdropElement) {
      this.backdropElement.classList.add("active");
      return;
    }

    // Create a new backdrop element if it doesn't exist
    const newBackdrop = document.createElement("div");
    newBackdrop.className = "active";
    newBackdrop.id = this.backdropId;

    document.body.appendChild(newBackdrop);
    this.backdropElement = newBackdrop;
  }

  /**
   * Hides the backdrop element and restores page interaction.
   * * Removes the 'active' class from the backdrop and re-enables pointer events.
   * * @returns {void}
   */
  hideBackdrop() {
    // Re-query or use cache to find the backdrop
    const activeBackdrop = document.getElementById(this.backdropId);
    
    if (activeBackdrop) {
      activeBackdrop.classList.remove("active");
    }
    
    // Restore all mouse and touch interactions on the page
    document.body.style.pointerEvents = "all";
  }
}