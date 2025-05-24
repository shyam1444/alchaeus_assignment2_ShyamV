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
        const newChatButton = await waitForElement('div[title="New chat"]');
        newChatButton.click();
        
        // Wait for the search input and enter phone number
        const searchInput = await waitForElement('div[contenteditable="true"][data-tab="3"]');
        searchInput.textContent = contact.Phone;
        // Manually trigger input event to make WhatsApp react
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        
        // Wait for the chat to load and appear in the search results
        // This part is tricky and might need refinement based on WhatsApp Web updates
        await new Promise(resolve => setTimeout(resolve, 3000)); // Increased delay for search results
        
        // Click on the first chat result that matches the phone number
        // This selector might need adjustment based on actual DOM structure
        const chatItem = await waitForElement(`span[title="${contact.Phone}"]`);
        chatItem.click();
        
        // Wait for the message input
        const messageInput = await waitForElement('div[title="Type a message"]');
        messageInput.click();
        
        // Type the message
        messageInput.textContent = contact['Processed Message'];
        // Manually trigger input event
        messageInput.dispatchEvent(new Event('input', { bubbles: true }));
        
        // Wait a bit before sending to mimic human typing
        await new Promise(resolve => setTimeout(resolve, getRandomDelay(1, 3) * 1000));
        
        // Send the message
        const sendButton = await waitForElement('span[data-icon="send"]');
        sendButton.click();
        
        // Wait a random delay before the next message (5-15 seconds)
        const delay = getRandomDelay(5, 15);
        console.log(`Waiting for ${delay} seconds before next message.`);
        await new Promise(resolve => setTimeout(resolve, delay * 1000));
        
        return { success: true, message: `Message sent to ${contact.Name || contact.Phone}` };
    } catch (error) {
        console.error('Error sending message to', contact.Name || contact.Phone, ':', error);
        return { success: false, message: `Failed to send message to ${contact.Name || contact.Phone}: ${error.message}` };
    }
}

// Function to process all messages
async function processMessages(data) {
    let successCount = 0;
    let failCount = 0;
    const totalMessages = data.length;
    
    for (let i = 0; i < totalMessages; i++) {
        const contact = data[i];
        
        // Send status update to popup
        chrome.runtime.sendMessage({
            type: 'status',
            text: `Sending message ${i + 1} of ${totalMessages}... (Success: ${successCount}, Failed: ${failCount})`,
            progress: ((i + 1) / totalMessages) * 100
        });
        
        const result = await sendSingleMessage(contact);
        
        if (result.success) {
            successCount++;
            // (Bonus) Log successful message
            logMessageHistory({ ...contact, status: 'Sent', timestamp: new Date().toISOString(), result: result.message });
        } else {
            failCount++;
            // (Bonus) Log failed message
            logMessageHistory({ ...contact, status: 'Failed', timestamp: new Date().toISOString(), result: result.message });
        }
        
    }
    
    // Send final status
    chrome.runtime.sendMessage({
        type: 'status',
        text: `Completed! Successfully sent: ${successCount}, Failed: ${failCount}`,
        completed: true,
        progress: 100
    });
}

// (Bonus) Function to log message history
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

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'startSending') {
        // Check if on WhatsApp Web
        if (!window.location.href.includes('web.whatsapp.com')) {
             chrome.runtime.sendMessage({
                type: 'status',
                text: 'Please open WhatsApp Web first',
                completed: true
            });
            return;
        }
        processMessages(message.data);
    }
}); 