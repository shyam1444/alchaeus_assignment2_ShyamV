// console.log("WhatsBlitz content script injected!");

// Function to inject the UI
function injectUI() {
  fetch(chrome.runtime.getURL('uploadUI.html'))
    .then(response => response.text())
    .then(html => {
      const uiContainer = document.createElement('div');
      uiContainer.innerHTML = html;
      // Append the UI to the body of the page
      document.body.appendChild(uiContainer);
      console.log("WhatsBlitz UI injected.");
    })
    .catch(error => console.error("Error fetching UI HTML:", error));
}

// Inject the UI when the page is fully loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectUI);
} else {
    injectUI();
} 