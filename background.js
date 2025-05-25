// Background script (service_worker)

chrome.runtime.onInstalled.addListener(() => {
    console.log('WhatsBlitz extension installed.');
});

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("WhatsBlitz: background: Received message:", request, "from sender:", sender);

    // Handle message to process file data received as ArrayBuffer from sidebar
    if (request.action === "processFileInBackground") {
        console.log("WhatsBlitz: background: Received 'processFileInBackground' message.", request.fileName);

        const fileArrayBuffer = request.fileArrayBuffer;
        const fileName = request.fileName;
        const fileType = request.fileType;

        if (!fileArrayBuffer) {
            console.error("WhatsBlitz: background: Received processFileInBackground without fileArrayBuffer.");
            // Optionally send an error back to the sidebar
            return; // No async response
        }

        // Create a Blob from the ArrayBuffer
        const blob = new Blob([fileArrayBuffer], { type: fileType });

        // Use FileReader in the background script to read the Blob as a Data URL
        const reader = new FileReader();

        reader.onload = function(event) {
            console.log("WhatsBlitz: background: FileReader onload event triggered.");
            const fileDataUrl = event.target.result; // Get file content as Data URL

            // Generate storage key (similar logic to what was in sidebar)
            const storageKey = 'whatsblitz_file_' + Date.now() + '_' + fileName.replace(/[^a-zA-Z0-9.]/g, '_');

            console.log("WhatsBlitz: background: Generated storage key:", storageKey);
            console.log("WhatsBlitz: background: Attempting to save file data to storage.");

            chrome.storage.local.set({[storageKey]: fileDataUrl}, () => {
                console.log("WhatsBlitz: background: chrome.storage.local.set callback executed.");
                if (chrome.runtime.lastError) {
                    console.error("WhatsBlitz: background: Error saving file to storage:", chrome.runtime.lastError);
                     // Send error back to sidebar if possible (might need sender.tab.id)
                } else {
                    console.log("WhatsBlitz: background: File data successfully saved to storage. Forwarding message to content script.", storageKey);
                    // Now forward the message to the content script in the active tab
                    chrome.tabs.query({ active: true, currentWindow: true, url: "https://web.whatsapp.com/*" }, (tabs) => {
                        if (tabs && tabs.length > 0) {
                            chrome.tabs.sendMessage(tabs[0].id, {
                                action: 'processFileFromStorage',
                                storageKey: storageKey, // Pass the generated key
                                fileName: fileName,
                                fileType: fileType // Keep fileType for potential use in content script
                            }, (response) => {
                                console.log("WhatsBlitz: background: Response from content script (processFileFromStorage):", response);
                                if (chrome.runtime.lastError) {
                                    console.error("WhatsBlitz: background: Error forwarding message to content script:", chrome.runtime.lastError.message);
                                }
                            });
                        } else {
                            console.warn("WhatsBlitz: background: No active WhatsApp Web tab found to forward message.");
                        }
                    });
                }
            });
        };

        reader.onerror = function(event) {
             console.error("WhatsBlitz: background: FileReader error:", event.target.error);
             // Optionally send an error back to the sidebar
        };

        // Read the Blob as a Data URL
        reader.readAsDataURL(blob);

        // No return true here as we don't send an async response from this background handler
    }

    // Handle the old processFileDataInStorage message (can keep for compatibility or remove if confident)
    if (request.action === "processFileDataInStorage") {
        console.warn("WhatsBlitz: background: Received old 'processFileDataInStorage' message. This should now be handled by processFileInBackground.");
        // You can optionally add fallback logic or just log a warning
    }

    // Example: if you wanted a message to trigger something in the background
    if (request.action === "someBackgroundAction") {
        console.log("WhatsBlitz: background: Background action requested:", request.data);
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