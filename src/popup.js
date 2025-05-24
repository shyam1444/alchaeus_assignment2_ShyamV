// Get UI elements
const startButton = document.getElementById('start-button');
const previewSection = document.getElementById('preview-section');
const previewContent = document.getElementById('preview-content');
const statusDiv = document.getElementById('status');
const dropArea = document.getElementById('drop-area');
const fileNameDisplay = document.getElementById('whatsblitz-file-name');
const fileInput = document.getElementById('whatsblitz-file-input');

// Function to update the preview section
function updatePreview(data) {
    if (!data || data.length === 0) {
        previewSection.style.display = 'none';
        startButton.disabled = true;
        statusDiv.textContent = 'No data available.';
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
            <strong>Message:</strong> ${item['Processed Message'] || 'N/A'}
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
    statusDiv.textContent = `File processed with ${data.length} records.`;
}

// Function to send messages (triggering content script)
async function sendMessages(data) {
    if (!data || data.length === 0) {
        statusDiv.textContent = 'No data to send';
        return;
    }

    startButton.disabled = true;
    statusDiv.textContent = 'Starting message sending...';

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        // Send message to content script to start sending
        chrome.tabs.sendMessage(tab.id, {
            action: 'startSending',
            data: data
        });

    } catch (error) {
        console.error('Error sending message to content script:', error);
        statusDiv.textContent = 'Error: Could not start sending.';
        startButton.disabled = false;
    }
}

// (Bonus) Function to display message history
function displayMessageHistory() {
    chrome.storage.local.get({'messageHistory': []}, (result) => {
        const history = result.messageHistory;
        console.log("Message History:", history);
        // TODO: Display history in the UI (requires adding a history section to popup.html)
    });
}

// Listen for messages from content script (for status updates)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'status') {
        statusDiv.textContent = message.text;
        // TODO: Update a progress bar if we add one to popup.html
        if (message.completed) {
            startButton.disabled = false;
            // Optionally display history after completion
            // displayMessageHistory();
        }
    }
});

// Event listener for start button
startButton.addEventListener('click', () => {
    // Access parsedData from the window object set by dataHandler.js
    if (window.parsedData && window.parsedData.length > 0) {
        sendMessages(window.parsedData);
    } else {
        statusDiv.textContent = 'No valid data to send. Please upload a file.';
    }
});

// Listen for the custom event from dataHandler.js when data is parsed
window.addEventListener('dataParsed', (event) => {
    window.parsedData = event.detail; // Store parsed data globally or in a more structured way
    updatePreview(window.parsedData);
});

// Initial state
startButton.disabled = true;
statusDiv.textContent = 'Please upload an Excel or CSV file.';

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

function handleDrop(e) {
  const dt = e.dataTransfer;
  const files = dt.files;

  // Trigger the file input change event in dataHandler.js
  // This requires modifying dataHandler.js to expose a function
  // Or, we can just handle the file directly here and call the processing logic
  // Let's handle it directly here for simplicity.
  if (files.length > 0) {
      // Call the file handling logic from dataHandler.js
      // Need to ensure dataHandler.js exposes handleFile or similar
      // For now, let's assume dataHandler.js is loaded and its functions are available.
      if (typeof handleFile === 'function') {
          handleFile(files[0]);
      } else {
          console.error("dataHandler.js functions not available.");
          statusDiv.textContent = "Error: Core functions not loaded.";
      }
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