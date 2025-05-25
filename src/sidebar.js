// Inject the sidebar HTML and CSS
async function injectSidebar() {
    try {
        console.log("WhatsBlitz: Attempting to inject sidebar.");
        const sidebarHTML = await fetch(chrome.runtime.getURL('src/sidebar.html')).then(response => {
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.text();
        });
        const sidebarCSS = await fetch(chrome.runtime.getURL('src/sidebar.css')).then(response => {
             if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
             return response.text();
        });

        // Create a host element for the Shadow DOM
        const shadowHost = document.createElement('div');
        // Assign an ID for easier identification if needed, though not strictly necessary for Shadow DOM
        shadowHost.id = 'whatsblitz-sidebar-host';

        // Append the host element to the body early
        // Using requestAnimationFrame might help ensure the body is ready, though DOMContentLoaded is usually sufficient.
        // Let's stick to appending directly for now, assuming DOMContentLoaded has fired (handled by manifest v3 content_scripts).
        document.body.appendChild(shadowHost);

        // Attach a Shadow DOM to the host element
        // mode: 'open' means JavaScript from the main document can access the shadow DOM
        const shadowRoot = shadowHost.attachShadow({ mode: 'open' });

        // Inject styles into the Shadow DOM
        const styleTag = document.createElement('style');
        styleTag.textContent = sidebarCSS;
        shadowRoot.appendChild(styleTag);

        // Inject HTML into the Shadow DOM
        const sidebarDiv = document.createElement('div');
        sidebarDiv.innerHTML = sidebarHTML;
        // Append the actual sidebar content from the temporary div to the shadow root
        while (sidebarDiv.firstChild) {
            shadowRoot.appendChild(sidebarDiv.firstChild);
        }

        console.log("WhatsBlitz: Sidebar injected into Shadow DOM.");
        
        // Return the shadowRoot so the .then() block can access elements within it
        return shadowRoot;

    } catch (error) {
        console.error("WhatsBlitz: Error injecting sidebar:", error);
        // Propagate the error so the .catch() after .then() can handle it
        throw error;
    }
}

injectSidebar().then((shadowRoot) => {
    console.log("WhatsBlitz: sidebar: injectSidebar promise resolved. Attaching event listeners."); // Log to confirm this block executes
    // Get UI elements from the shadowRoot after injection
    const startButton = shadowRoot.getElementById('whatsblitz-sidebar-start-button');
    const previewSection = shadowRoot.getElementById('whatsblitz-sidebar-preview-section');
    const previewContent = shadowRoot.getElementById('whatsblitz-sidebar-preview-content');
    const statusDiv = shadowRoot.getElementById('whatsblitz-sidebar-status');
    const dropArea = shadowRoot.getElementById('whatsblitz-sidebar-drop-area');
    const fileNameDisplay = shadowRoot.getElementById('whatsblitz-sidebar-file-name');
    const fileInput = shadowRoot.getElementById('whatsblitz-sidebar-file-input'); // Ensure fileInput is also from shadowRoot
    const progressBarContainer = shadowRoot.querySelector('.whatsblitz-progress-bar-container');
    const progressBar = shadowRoot.getElementById('whatsblitz-sidebar-progress-bar');
    const historySection = shadowRoot.getElementById('whatsblitz-sidebar-history-section');
    const historyContent = shadowRoot.getElementById('whatsblitz-sidebar-history-content');

    console.log("WhatsBlitz: sidebar: Retrieved fileInput element:", fileInput); // Log retrieved fileInput
    console.log("WhatsBlitz: sidebar: Retrieved dropArea element:", dropArea); // Log retrieved dropArea

    let parsedData = []; // Data parsed from file

    // Function to update the preview section
    function updatePreview(data) {
        if (!data || data.length === 0) {
            previewSection.style.display = 'none';
            startButton.disabled = true;
            statusDiv.textContent = 'No data available.'; // This might be overwritten by messages from dataHandler
            fileNameDisplay.textContent = 'No file selected'; // Reset file name display
            progressBarContainer.style.display = 'none'; // Hide progress bar
            return;
        }

        previewSection.style.display = 'block';
        previewContent.innerHTML = '';

        // Show first 3 items as preview
        const previewItems = data.slice(0, 3);
        previewItems.forEach(item => {
            const previewItem = document.createElement('div');
            previewItem.className = 'whatsblitz-preview-item';
            previewItem.innerHTML = `
                <strong>Name:</strong> ${item.Name || 'N/A'}<br>
                <strong>Phone:</strong> ${item['Phone Number'] || 'N/A'}<br>
                <strong>Message:</strong> ${item['Processed Message'] ? item['Processed Message'].substring(0, 50) + (item['Processed Message'].length > 50 ? '...' : '') : 'N/A'}
            `;
            previewContent.appendChild(previewItem);
        });

        if (data.length > 3) {
            const moreItems = document.createElement('div');
            moreItems.className = 'whatsblitz-preview-item';
            moreItems.textContent = `... and ${data.length - 3} more contacts`;
            previewContent.appendChild(moreItems);
        }

        startButton.disabled = false; // Enable button if data is present
        // statusDiv.textContent = `File processed with ${data.length} records.`; // This is handled by dataHandler now
        parsedData = data; // Store the parsed data
    }

    // Function to send messages (triggering content script)
    function sendMessages(data) {
        if (!data || data.length === 0) {
            statusDiv.textContent = 'No data to send';
            return;
        }

        startButton.disabled = true;
        statusDiv.textContent = 'Starting message sending...';
        progressBarContainer.style.display = 'block';
        progressBar.style.width = '0%';
        progressBar.textContent = '0%';

        // Send message to content script to start sending
        chrome.runtime.sendMessage({
            action: 'startSending',
            data: data
        });
    }

    // Function to display message history
    function displayMessageHistory() {
        chrome.storage.local.get({'messageHistory': []}, (result) => {
            const history = result.messageHistory;
            if (history.length > 0) {
                historySection.style.display = 'block';
                historyContent.innerHTML = '';
                // Display history in reverse chronological order (latest first)
                history.slice().reverse().forEach(
                    item => {
                    const historyItem = document.createElement('div');
                    const statusClass = item.status === 'Sent' ? '' : 'whatsblitz-error';
                    historyItem.className = `whatsblitz-history-item ${statusClass}`;

                    let messageSnippet = item.result || '';
                    if (messageSnippet.length > 100) {
                         messageSnippet = messageSnippet.substring(0, 100) + '...';
                    }

                    historyItem.innerHTML = `
                        <strong>${item.status}:</strong> ${item.Name || item['Phone Number'] || 'N/A'} - ${messageSnippet}
                        <br><small>${new Date(item.timestamp).toLocaleString()}</small>
                    `;
                    historyContent.appendChild(historyItem);
                });
            } else {
                 historySection.style.display = 'none';
            }
        });
    }

    // Listen for messages from content script or dataHandler (for status updates and errors)
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        // Optional: Check if the message is from our scripts for robustness
        // if (sender.id === chrome.runtime.id) {

            console.log("Sidebar received message:", message);

            if (message.type === 'status') {
                statusDiv.textContent = message.text;
                if (message.progress !== undefined) {
                    progressBarContainer.style.display = 'block';
                    progressBar.style.width = message.progress + '%';
                    progressBar.textContent = Math.round(message.progress) + '%';
                } else {
                     progressBarContainer.style.display = 'none'; // Hide progress bar if no progress info
                }
                if (message.completed) {
                    startButton.disabled = false;
                    progressBarContainer.style.display = 'none';
                    // Display history after completion
                    displayMessageHistory();
                }
            } else if (message.type === 'error') {
                 statusDiv.innerHTML = `<span class="whatsblitz-error">Error: ${message.text}</span>`;
                 startButton.disabled = false;
                 progressBarContainer.style.display = 'none';
                 // On error, we might want to clear parsed data or indicate invalid state
                 parsedData = [];
                 updatePreview([]); // Clear preview on error
            } else if (message.type === 'validationError') {
                 statusDiv.innerHTML = `<span class="whatsblitz-error">Validation Error: ${message.text}</span>`;
                 startButton.disabled = true;
                 previewSection.style.display = 'none'; // Hide preview on validation failure
                 parsedData = []; // Clear stored data
            } else if (message.type === 'dataReady') {
                 statusDiv.textContent = message.text; // Set status from the message
                 updatePreview(message.data); // Update preview with the received data
                 // Ensure button is enabled if data is ready and valid
                 startButton.disabled = false;
                 progressBarContainer.style.display = 'none'; // Hide progress bar
            } else if (message.type === 'dataCleared') {
                 statusDiv.innerHTML = message.text; // Set status from the message (might be an error message)
                 startButton.disabled = true;
                 previewSection.style.display = 'none'; // Hide preview
                 parsedData = []; // Clear stored data
                 progressBarContainer.style.display = 'none'; // Hide progress bar
            }
        // }
    });

    // Event listener for start button
    startButton.addEventListener('click', () => {
        if (parsedData && parsedData.length > 0) {
            sendMessages(parsedData);
        } else {
            statusDiv.textContent = 'No valid data to send. Please upload a file.';
        }
    });

    // Initial load: display history and set initial status
    displayMessageHistory();
    startButton.disabled = true;
    statusDiv.textContent = 'Please upload an Excel or CSV file.';
    previewSection.style.display = 'none';
    progressBarContainer.style.display = 'none';

    // --- Drag and drop handling for the sidebar ---
    // Note: This is a simplified implementation. A more robust version might be needed.
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

    // Function to handle file selection
    async function handleFileSelect(event) {
        console.log("WhatsBlitz: sidebar: handleFileSelect called.");
        const file = event.target.files[0];
        if (file) {
            console.log("WhatsBlitz: sidebar: File selected:", file.name, file.type, file.size);
             // Instead of calling handleFile directly, send a message to content.js
            // We will now use saveFileAndSendMessage to handle saving to storage
            saveFileAndSendMessage(file);
        }
    }

    // Function to handle drop
    function handleDrop(e) {
        console.log("WhatsBlitz: handleDrop called.");
        const dt = e.dataTransfer;
        const files = dt.files;

        if (files.length > 0) {
            const file = files[0];
            console.log("WhatsBlitz: File dropped:", file.name, file.type, file.size);
            // Use the exposed handleFile function from dataHandler.js
            // We will now use saveFileAndSendMessage to handle saving to storage
            saveFileAndSendMessage(file);
        }
    }

    // Function to save file to storage and send message
    async function saveFileAndSendMessage(file) {
        console.log("WhatsBlitz: saveFileAndSendMessage called.", file ? file.name : 'no file');
       if (!file) {
           console.error("WhatsBlitz: saveFileAndSendMessage called with no file.");
           updateStatus('Error: No file provided for processing.', true);
           return;
       }

       // Send the file object directly to the background script for processing.
       console.log("WhatsBlitz: sidebar: Sending file object to background script.", { fileName: file.name, fileType: file.type });

       // We need to send the file data itself. Sending the File object directly isn't straightforward.
       // Let's read it as an ArrayBuffer here and send that. This is still done in the sidebar
       // but is a smaller step before moving the whole reader to background.

        const reader = new FileReader();

        reader.onload = function(event) {
            console.log("WhatsBlitz: sidebar: FileReader onload event triggered to read ArrayBuffer.");
            const fileArrayBuffer = event.target.result; // Get file content as ArrayBuffer

            chrome.runtime.sendMessage({
                action: 'processFileInBackground', // New action for background script
                fileName: file.name,
                fileType: file.type,
                fileArrayBuffer: fileArrayBuffer // Send the ArrayBuffer
            }, (response) => {
                console.log("WhatsBlitz: sidebar: Response from background script (processFileInBackground):", response);
                if (chrome.runtime.lastError) {
                    console.error("WhatsBlitz: sidebar: Error sending file data to background:", chrome.runtime.lastError.message);
                    updateStatus('Error initiating file processing (communication error).', true);
                }
                // The background script will send further status updates.
            });
        };

        reader.onerror = function(event) {
            console.error("WhatsBlitz: sidebar: FileReader error:", event.target.error);
            updateStatus('Error reading file.', true);
        };

        // Read file as ArrayBuffer
        reader.readAsArrayBuffer(file);
    }

    // Function to update the start button state
    function updateStartButtonState() {
        // ... existing code ...
    }

    // Function to handle starting the message sending process
    function startSendingMessages() {
        // ... existing code ...
    }

    // Function to update status messages on the UI
    function updateStatus(message, isError = false) {
        // ... existing code ...
    }

    // Function to log message history to the UI
    function logHistory(logEntry) {
        // ... existing code ...
    }

    // Function to clear message history
    function clearHistory() {
        // ... existing code ...
    }

    // --- File input change handling for the sidebar ---
    if (fileInput) {
        fileInput.addEventListener('change', (event) => {
            console.log("WhatsBlitz: sidebar: File input change detected.");
            const file = event.target.files[0];
            if (file) {
                 console.log("WhatsBlitz: sidebar: File selected via input:", file.name, file.type, file.size);
                 // Call saveFileAndSendMessage to handle saving to storage and sending message
                 saveFileAndSendMessage(file);
            }
        });
    }

    // Add event listeners for drag and drop
    const dropZone = shadowRoot.getElementById('whatsblitz-sidebar-drop-area'); // Get from shadowRoot now
    if (dropZone) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, preventDefaults, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, highlight, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropArea.classList.remove('highlight'); // Fix: use dropArea which is already defined and used for drag/drop class changes
        });

        dropZone.addEventListener('drop', handleDrop, false);
    }

    console.log("WhatsBlitz: sidebar: File input and drag/drop listeners attached."); // Log to confirm listeners are set up

    // Initial state of the start button
    updateStartButtonState();

}).catch(console.error);