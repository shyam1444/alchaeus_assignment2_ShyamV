// Get UI elements
const startButton = document.getElementById('start-button');
const previewSection = document.getElementById('preview-section');
const previewContent = document.getElementById('preview-content');
const statusDiv = document.getElementById('status');
const dropArea = document.getElementById('drop-area');
const fileNameDisplay = document.getElementById('whatsblitz-file-name');
const fileInput = document.getElementById('whatsblitz-file-input');

// Global variable to store parsed data (received via message)
let parsedData = [];

// Function to update the preview section
function updatePreview(data) {
    if (!data || data.length === 0) {
        previewSection.style.display = 'none';
        startButton.disabled = true;
        statusDiv.textContent = 'No data available.';
        // fileNameDisplay.textContent = 'No file selected'; // This is handled by dataHandler now
        return;
    }

    previewSection.style.display = 'block';
    previewContent.innerHTML = '';

    // Show first 3 items as preview
    const previewItems = data.slice(0, 3);
    previewItems.forEach(item => {
        const previewItem = document.createElement('div');
        previewItem.className = 'preview-item';
        previewItem.innerHTML = `
            <strong>Name:</strong> ${item.Name || 'N/A'}<br>
            <strong>Phone:</strong> ${item['Phone Number'] || 'N/A'}<br>
            <strong>Message:</strong> ${item['Processed Message'] ? item['Processed Message'].substring(0, 50) + (item['Processed Message'].length > 50 ? '...' : '') : 'N/A'}
        `;
        previewContent.appendChild(previewItem);
    });

    if (data.length > 3) {
        const moreItems = document.createElement('div');
        moreItems.className = 'preview-item';
        moreItems.textContent = `... and ${data.length - 3} more contacts`;
        previewContent.appendChild(moreItems);
    }

    startButton.disabled = false; // Enable button if data is present
    // statusDiv.textContent = `File processed with ${data.length} records.`; // This is handled by dataHandler now
    parsedData = data; // Store the parsed data
}

// Function to send messages (triggering content script)
async function sendMessages(data) {
    if (!data || data.length === 0) {
        statusDiv.textContent = 'No data to send';
        return;
    }

    startButton.disabled = true;
    statusDiv.textContent = 'Starting message sending...';
    // progressBarContainer.style.display = 'block'; // No progress bar in popup.html currently
    // progressBar.style.width = '0%'; // No progress bar in popup.html currently
    // progressBar.textContent = '0%'; // No progress bar in popup.html currently

    try {
        // Send message to content script to start sending
        // Need to query for the active tab running on web.whatsapp.com
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true, url: "https://web.whatsapp.com/*" });

        if (!tab) {
             statusDiv.innerHTML = '<span style="color: red; font-weight: bold;">Error: Please open WhatsApp Web (web.whatsapp.com) first.</span>';
             startButton.disabled = false;
             return;
        }

        chrome.tabs.sendMessage(tab.id, {
            action: 'startSending',
            data: data
        });

    } catch (error) {
        console.error('Error sending message to content script:', error);
        statusDiv.innerHTML = '<span style="color: red; font-weight: bold;">Error: Could not start sending.</span>';
        startButton.disabled = false;
    }
}

// Function to display message history (Popup version - simpler)
function displayMessageHistory() {
    chrome.storage.local.get({'messageHistory': []}, (result) => {
        const history = result.messageHistory;
        console.log("Message History:", history);
        // For the popup, we might just log to console or add a simple history view if desired.
        // Let's keep it simple for now and just log to console as per the original TODO.
        // TODO: Optionally display history in the UI (requires adding a history section to popup.html)
    });
}

// Listen for messages from content script (for status updates and errors)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Check if the message is from our content script (optional but good practice)
    // if (sender.tab && sender.tab.url.includes('web.whatsapp.com')) {

        console.log("Popup received message:", message);

        if (message.type === 'status') {
            statusDiv.textContent = message.text;
            // The popup UI doesn't have a progress bar, so we only update text status
            if (message.completed) {
                startButton.disabled = false;
                // Optionally display history after completion in popup
                // displayMessageHistory();
            }
        } else if (message.type === 'error') {
             statusDiv.innerHTML = '<span style="color: red; font-weight: bold;">Error: ' + message.text + '</span>';
             startButton.disabled = false;
        } else if (message.type === 'validationError') {
             statusDiv.innerHTML = '<span style="color: red; font-weight: bold;">Validation Error: ' + message.text + '</span>';
             startButton.disabled = true;
             updatePreview([]); // Clear preview on validation error
             parsedData = []; // Clear stored data
        } else if (message.type === 'dataReady') {
             statusDiv.textContent = message.text; // Set status from the message
             updatePreview(message.data); // Update preview with the received data
             // Ensure button is enabled if data is ready and valid
             startButton.disabled = false;
             // progressBarContainer.style.display = 'none'; // No progress bar in popup.html currently
        } else if (message.type === 'dataCleared') {
             statusDiv.innerHTML = message.text; // Set status from the message (might be an error message)
             startButton.disabled = true;
             updatePreview([]); // Clear preview
             parsedData = []; // Clear stored data
             // progressBarContainer.style.display = 'none'; // No progress bar in popup.html currently
        }
    // }
});

// Event listener for start button
startButton.addEventListener('click', () => {
    // Use the parsedData stored locally
    if (parsedData && parsedData.length > 0) {
        sendMessages(parsedData);
    } else {
        statusDiv.textContent = 'No valid data to send. Please upload a file.';
    }
});

// Remove the old event listener for dataParsed
// window.removeEventListener('dataParsed', (event) => { ... });

// Initial state
startButton.disabled = true;
statusDiv.textContent = 'Please upload an Excel or CSV file.';
// Ensure preview is hidden initially
previewSection.style.display = 'none';

// Also re-implement drag and drop highlight/unhighlight here in popup.js
// since the drop area is in popup.html
function preventDefaults (e) {
  e.preventDefault();
  e.stopPropagation();
}

function highlight(e) {
  dropArea.classList.add('highlight');
}

function unhighlight(e) {
  dropArea.classList.remove('highlight');
}

// File input change event listener - Call the exposed handleFile function
if (fileInput) {
  fileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        // Instead of calling handleFile directly, send a message to content.js
        sendFileToContentScript(file);
    }
  });
}

// Function to send the file data to the content script
function sendFileToContentScript(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
        const fileDataUrl = event.target.result; // Get file content as Data URL
        const storageKey = 'whatsblitz_file_' + file.name; // Create a unique key for storage

        // Save file data to chrome.storage.local
        chrome.storage.local.set({[storageKey]: fileDataUrl}, () => {
            if (chrome.runtime.lastError) {
                console.error("Error saving file to storage:", chrome.runtime.lastError);
                statusDiv.innerHTML = '<span style="color: red; font-weight: bold;">Error saving file data.</span>';
                startButton.disabled = true;
            } else {
                console.log("File data saved to storage.", storageKey);
                // Now send a message to content.js with the storage key
                chrome.tabs.query({ active: true, currentWindow: true, url: "https://web.whatsapp.com/*" }, (tabs) => {
                    if (tabs.length > 0) {
                        chrome.tabs.sendMessage(tabs[0].id, {
                            action: 'processFileFromStorage',
                            storageKey: storageKey,
                            fileName: file.name, // Also send file name for reconstructing File object
                            fileType: file.type // Also send file type
                        }, (response) => {
                            // Handle response from content script if needed (optional)
                            if (chrome.runtime.lastError) {
                                console.error("Error sending message to content script:", chrome.runtime.lastError);
                                statusDiv.innerHTML = '<span style="color: red; font-weight: bold;">Error initiating file processing.</span>';
                                startButton.disabled = true;
                                // Clean up storage if message sending failed
                                chrome.storage.local.remove(storageKey);
                            }
                             // Content script will send status updates via chrome.runtime.sendMessage
                        });
                    } else {
                         statusDiv.innerHTML = '<span style="color: red; font-weight: bold;">Error: WhatsApp Web tab not found.</span>';
                         startButton.disabled = true;
                         // Clean up storage if tab not found
                         chrome.storage.local.remove(storageKey);
                    }
                });
            }
        });
    };
     // Read file as Data URL for sending
    reader.readAsDataURL(file);
}

// Drag and drop handling
function handleDrop(e) {
  const dt = e.dataTransfer;
  const files = dt.files;

  if (files.length > 0) {
      const file = files[0];
      // Instead of calling handleFile directly, send a message to content.js
      sendFileToContentScript(file);
  }
}

// Event listeners for drag and drop
if (dropArea) {
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, preventDefaults, false);
  });

  ['dragenter', 'dragover'].forEach(eventName => {
    dropArea.addEventListener(eventName, highlight, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, unhighlight, false);
  });

  dropArea.addEventListener('drop', handleDrop, false);
} 