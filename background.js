// Background script (service_worker)

chrome.runtime.onInstalled.addListener(() => {
    console.log('WhatsBlitz extension installed.');
});

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // This is where you would handle messages that need background processing,
    // like interacting with chrome.storage or making API calls.
    // For now, we primarily use this to allow content script to access chrome.storage.

    // Example: if you wanted a message to trigger something in the background
    if (request.action === "someBackgroundAction") {
        console.log("Background action requested:", request.data);
        // Perform background task...
        sendResponse({ status: "Background task completed" });
        return true; // Indicates async response
    }

    // If the message is from the content script and related to storage,
    // we don't need explicit handling here because the content script
    // can directly access chrome.storage if declared in manifest.

    // If you need to pass messages between content scripts on different tabs, 
    // or between content script and other extension parts (like a dedicated options page),
    // you would handle that here.
}); 