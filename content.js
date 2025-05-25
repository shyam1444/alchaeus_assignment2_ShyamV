console.log("WhatsBlitz content script injected!"); 

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
    try {
        // Click on the new chat button (using a more robust selector)
        const newChatButton = await waitForElement('div[title="New chat"]', 5000);
        newChatButton.click();
        
        // Wait for the search input and enter phone number
        const searchInput = await waitForElement('div[contenteditable="true"][data-tab="3"]', 5000);
        searchInput.textContent = contact['Phone Number']; // Use 'Phone Number' from data
        // Manually trigger input event to make WhatsApp react
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        
        // Wait for the chat to load and appear in the search results
        // Increased delay for search results to allow WhatsApp to find the contact
        await new Promise(resolve => setTimeout(resolve, 4000)); 
        
        // Click on the first chat result that matches the phone number
        // Using a more robust selector that looks for the phone number in the text content
        // Note: WhatsApp Web DOM can change, this selector might need updates in the future.
        const chatItem = await waitForElement(`span[title*="${contact['Phone Number']}"]`, 5000);
        chatItem.click();
        
        // Wait for the message input
        const messageInput = await waitForElement('div[title="Type a message"]', 5000);
        messageInput.focus(); // Focus the input
        
        // Type the message character by character to mimic human typing
        const messageText = contact['Processed Message'] || '';
        for (const char of messageText) {
            document.execCommand('insertText', false, char);
            await new Promise(resolve => setTimeout(resolve, getRandomDelay(20, 100))); // Small delay between characters
        }

        // Wait a bit before sending to mimic human typing
        await new Promise(resolve => setTimeout(resolve, getRandomDelay(500, 1500)));
        
        // Send the message
        const sendButton = await waitForElement('span[data-icon="send"]', 5000);
        sendButton.click();
        
        // Wait a random delay before the next message (5-15 seconds)
        const delay = getRandomDelay(5, 15);
        console.log(`Waiting for ${delay} seconds before next message.`);
        await new Promise(resolve => setTimeout(resolve, delay * 1000));
        
        return { success: true, message: `Message sent to ${contact.Name || contact['Phone Number']}` };
    } catch (error) {
        console.error('Error sending message to', contact.Name || contact['Phone Number'], ':', error);
        let errorMessage = `Failed to send message to ${contact.Name || contact['Phone Number']}.`;
        if (error.message.includes('Timeout waiting for element')) {
            errorMessage += ` Error: Could not find element - ${error.message.split(': ')[1]}`; // Extract selector
        } else {
            errorMessage += ` Error: ${error.message}`;
        }
        // Send error message to the UI
        chrome.runtime.sendMessage({
            type: 'error',
            text: errorMessage
        });
        return { success: false, message: errorMessage };
    }
}

// Function to process all messages
async function processMessages(data) {
    // Check if on WhatsApp Web before starting
    if (!window.location.href.includes('web.whatsapp.com')) {
        chrome.runtime.sendMessage({
            type: 'error',
            text: 'Please open WhatsApp Web before starting.',
            completed: true // Mark as completed since it didn't start
        });
        return;
    }

    let successCount = 0;
    let failCount = 0;
    const totalMessages = data.length;
    
    for (let i = 0; i < totalMessages; i++) {
        const contact = data[i];
        
        // Check again in case the user navigated away during the process
        if (!window.location.href.includes('web.whatsapp.com')) {
             chrome.runtime.sendMessage({
                type: 'error',
                text: `Sending interrupted. Navigated away from WhatsApp Web (Sent: ${successCount}, Failed: ${failCount}).`,
                completed: true
            });
            // Log remaining as failed or cancelled?
            for(let j = i; j < totalMessages; j++){
                logMessageHistory({ ...data[j], status: 'Cancelled', timestamp: new Date().toISOString(), result: 'Sending interrupted - navigated away from WhatsApp Web.' });
            }
            break; // Stop the loop
        }

        // Send status update to UI
        chrome.runtime.sendMessage({
            type: 'status',
            text: `Sending message ${i + 1} of ${totalMessages}... (Success: ${successCount}, Failed: ${failCount})`,
            progress: ((i + 1) / totalMessages) * 100
        });
        
        const result = await sendSingleMessage(contact);
        
        if (result.success) {
            successCount++;
            // Log successful message
            logMessageHistory({ ...contact, status: 'Sent', timestamp: new Date().toISOString(), result: result.message });
        } else {
            failCount++;
            // Log failed message
            logMessageHistory({ ...contact, status: 'Failed', timestamp: new Date().toISOString(), result: result.message });
        }
        
    }
    
    // Send final status if not interrupted
    if (window.location.href.includes('web.whatsapp.com')) {
        chrome.runtime.sendMessage({
            type: 'status',
            text: `Completed! Successfully sent: ${successCount}, Failed: ${failCount}`,
            completed: true,
            progress: 100
        });
    }
}

// Function to log message history
function logMessageHistory(logEntry) {
    chrome.storage.local.get({'messageHistory': []}, (result) => {
        const history = result.messageHistory;
        history.push(logEntry);
        // Limit history to, say, 100 entries to avoid excessive storage
        if (history.length > 100) {
            history.shift();
        }
        chrome.storage.local.set({'messageHistory': history});
    });
}

// Listen for messages from popup or sidebar
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Content script received message:", message);

    if (message.action === 'startSending') {
        // Check if on WhatsApp Web is done inside processMessages
        processMessages(message.data);
    } else if (message.action === 'processFileFromStorage') {
        console.log("Content script processing 'processFileFromStorage'.", message.storageKey);
        // Received request to process file from storage
        const storageKey = message.storageKey;
        const fileName = message.fileName;
        const fileType = message.fileType;

        if (storageKey) {
            chrome.storage.local.get(storageKey, (result) => {
                const fileDataUrl = result[storageKey];
                if (fileDataUrl) {
                    console.log("Retrieved file data from storage.", storageKey);

                    // Create a Blob from the Data URL
                    const byteCharacters = atob(fileDataUrl.split(',')[1]);
                    const byteNumbers = new Array(byteCharacters.length);
                    for (let i = 0; i < byteCharacters.length; i++) {
                        byteNumbers[i] = byteCharacters.charCodeAt(i);
                    }
                    const byteArray = new Uint8Array(byteNumbers);
                    const blob = new Blob([byteArray], { type: fileType });

                    // Create a File object from the Blob
                    const file = new File([blob], fileName, { type: fileType, lastModified: Date.now() });

                    // Now call the handleFile function from dataHandler.js in this context
                    if (window.dataHandler && window.dataHandler.handleFile) {
                         window.dataHandler.handleFile(file);
                    } else {
                         console.error("dataHandler.js handleFile function not available in content script.");
                         // Send error message to UI
                         chrome.runtime.sendMessage({
                             type: 'error',
                             text: 'Internal error: File processing module not loaded.'
                         });
                    }

                    // Clean up the data from storage after processing
                    chrome.storage.local.remove(storageKey);

                } else {
                    console.error("File data not found in storage for key:", storageKey);
                    // Send error message to UI
                     chrome.runtime.sendMessage({
                         type: 'error',
                         text: 'File data not found in storage.'
                     });
                }
            });
        } else {
            console.error("Received processFileFromStorage message without storage key.");
             // Send error message to UI
             chrome.runtime.sendMessage({
                 type: 'error',
                 text: 'Invalid request to process file.'
             });
        }
    }
}); 