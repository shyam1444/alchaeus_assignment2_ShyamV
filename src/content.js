// content.js - Handles interaction with WhatsApp Web DOM and message processing.
// It receives commands from UI scripts (popup.js, sidebar.js) via chrome.runtime.sendMessage.

console.log("WhatsBlitz content script injected!");

// Listen for messages from popup or sidebar - Set up listener early
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("WhatsBlitz: content: Message listener triggered.", message);

    // If a message listener returns true, it means it will send a response asynchronously.
    // If it doesn't return anything or returns false, the port closes immediately after the listener finishes.

    if (message.action === 'startSending') {
        console.log("WhatsBlitz: content: Handling 'startSending'.");
        processMessages(message.data);
        // No return true here as we don't send an async response

    } else if (message.action === 'isContentScriptReady') {
        console.log("WhatsBlitz: content: Handling 'isContentScriptReady'.");
        const isReady = !!(window.dataHandler && window.dataHandler.handleFile);
        sendResponse({ ready: isReady });
        console.log("WhatsBlitz: content: Responding to 'isContentScriptReady' with:", { ready: isReady });
        return true; // Indicate that sendResponse was called asynchronously

    } else if (message.action === 'processFileFromStorage') {
        console.log("WhatsBlitz: content: Handling 'processFileFromStorage'.");
        console.log("WhatsBlitz: content: Checking availability of window.dataHandler and handleFile.");

        const storageKey = message.storageKey;
        const fileName = message.fileName;
        const fileType = message.fileType;

        if (storageKey) {
            if (!window.dataHandler || !window.dataHandler.handleFile) {
                 console.error("WhatsBlitz: content: dataHandler.js or handleFile function not available yet. Cannot process file from storage.", window.dataHandler);
                 chrome.runtime.sendMessage({ type: 'error', text: 'Internal error: File processing module not fully loaded. Please try again.' });
                 return false; // Indicate not fully handled
            }

            chrome.storage.local.get(storageKey, (result) => {
                console.log("WhatsBlitz: content: chrome.storage.local.get callback executed.");
                const fileDataUrl = result[storageKey];
                if (fileDataUrl) {
                    console.log("WhatsBlitz: content: Retrieved file data from storage.", storageKey);
                    const byteCharacters = atob(fileDataUrl.split(',')[1]);
                    const byteNumbers = new Array(byteCharacters.length);
                    for (let i = 0; i < byteCharacters.length; i++) {
                        byteNumbers[i] = byteCharacters.charCodeAt(i);
                    }
                    const byteArray = new Uint8Array(byteNumbers);
                    const blob = new Blob([byteArray], { type: fileType });
                    const file = new File([blob], fileName, { type: fileType, lastModified: Date.now() });

                    console.log("WhatsBlitz: content: Calling dataHandler.handleFile.");
                    window.dataHandler.handleFile(file);
                    chrome.storage.local.remove(storageKey);
                    // No sendResponse here
                } else {
                    console.error("WhatsBlitz: content: File data not found in storage for key:", storageKey);
                    chrome.runtime.sendMessage({ type: 'error', text: 'File data not found in storage.' });
                }
            });
            // No return true here as we don't send an async response from the listener itself

        } else {
            console.error("WhatsBlitz: content: Received processFileFromStorage message without storage key.");
            chrome.runtime.sendMessage({ type: 'error', text: 'Invalid request to process file.' });
            return false; // No asynchronous response expected here
        }
    }

    // If the message is not handled, the listener finishes and the port closes.
    // If other messages are sent, they won't expect a response by default.
});

// Function to wait for an element to be present in the DOM
function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        
        const checkElement = () => {
            const element = document.querySelector(selector);
            if (element) {
                resolve(element);
                return;
            }
            
            if (Date.now() - startTime > timeout) {
                reject(new Error(`Timeout waiting for element: ${selector}`));
                return;
            }
            
            requestAnimationFrame(checkElement);
        };
        
        checkElement();
    });
}

// Function to generate a random delay between min and max seconds
function getRandomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Function to send a single message
async function sendSingleMessage(contact) {
    // ... existing code ...
}

// Function to process all messages
async function processMessages(data) {
    // ... existing code ...
}

// Function to log message history
function logMessageHistory(logEntry) {
    // ... existing code ...
}
