// Inject the sidebar HTML and CSS
async function injectSidebar() {
    const sidebarHTML = await fetch(chrome.runtime.getURL('src/sidebar.html')).then(response => response.text());
    const sidebarCSS = await fetch(chrome.runtime.getURL('src/sidebar.css')).then(response => response.text());

    const styleTag = document.createElement('style');
    styleTag.textContent = sidebarCSS;
    document.head.appendChild(styleTag);

    const sidebarDiv = document.createElement('div');
    sidebarDiv.innerHTML = sidebarHTML;
    // Append to a suitable place in the WhatsApp Web DOM
    // A common place is the body, but may need adjustment depending on WhatsApp Web updates
    document.body.appendChild(sidebarDiv.firstElementChild); 
    
    // Inject SheetJS and PapaParse scripts if not already present
    // These are needed by dataHandler.js which runs in the same context as the sidebar
    if (!document.querySelector('script[src*="xlsx.full.min.js"]')) {
        const scriptXLSX = document.createElement('script');
        scriptXLSX.src = chrome.runtime.getURL('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
        document.head.appendChild(scriptXLSX);
    }
    if (!document.querySelector('script[src*="papaparse.min.js"]')) {
         const scriptPapa = document.createElement('script');
         scriptPapa.src = chrome.runtime.getURL('https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.3.0/papaparse.min.js');
         document.head.appendChild(scriptPapa);
    }
    
    // Inject dataHandler.js - it needs to run in the same isolated world as the sidebar script
    // because the file input and drag/drop events are handled here.
    if (!document.querySelector('script[src*="dataHandler.js"]')) {
        const scriptDataHandler = document.createElement('script');
        scriptDataHandler.src = chrome.runtime.getURL('src/dataHandler.js');
        document.head.appendChild(scriptDataHandler);
    }
}

injectSidebar().then(() => {
    // Get UI elements after injection
    const startButton = document.getElementById('whatsblitz-sidebar-start-button');
    const previewSection = document.getElementById('whatsblitz-sidebar-preview-section');
    const previewContent = document.getElementById('whatsblitz-sidebar-preview-content');
    const statusDiv = document.getElementById('whatsblitz-sidebar-status');
    const dropArea = document.getElementById('whatsblitz-sidebar-drop-area');
    const fileNameDisplay = document.getElementById('whatsblitz-sidebar-file-name');
    const fileInput = document.getElementById('whatsblitz-sidebar-file-input');
    const progressBarContainer = document.querySelector('.whatsblitz-progress-bar-container');
    const progressBar = document.getElementById('whatsblitz-sidebar-progress-bar');
    const historySection = document.getElementById('whatsblitz-sidebar-history-section');
    const historyContent = document.getElementById('whatsblitz-sidebar-history-content');

    let parsedData = []; // Data parsed from file

    // Function to update the preview section
    function updatePreview(data) {
        if (!data || data.length === 0) {
            previewSection.style.display = 'none';
            startButton.disabled = true;
            statusDiv.textContent = 'No data available.';
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
        statusDiv.textContent = `File processed with ${data.length} records.`;
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

    // Listen for messages from content script (for status updates and errors)
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'status') {
            statusDiv.textContent = message.text;
            if (message.progress !== undefined) {
                progressBarContainer.style.display = 'block';
                progressBar.style.width = message.progress + '%';
                progressBar.textContent = Math.round(message.progress) + '%';
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
        }
    });

    // Event listener for start button
    startButton.addEventListener('click', () => {
        if (parsedData && parsedData.length > 0) {
            sendMessages(parsedData);
        } else {
            statusDiv.textContent = 'No valid data to send. Please upload a file.';
        }
    });

    // Listen for the custom event from dataHandler.js when data is parsed
    // This event is triggered by dataHandler.js when a file is successfully parsed.
    window.addEventListener('dataParsed', (event) => {
        // The dataHandler.js now includes validation and sets status messages.
        // We just need to update the preview if validation passed.
        if (event.detail && event.detail.length > 0) {
             updatePreview(event.detail); // event.detail contains the parsed data
             // Clear previous error messages if a new valid file is uploaded
             if (statusDiv.classList.contains('whatsblitz-error')) {
                 statusDiv.classList.remove('whatsblitz-error');
             }
        } else if (event.detail && event.detail.isValid === false) {
            // Data validation failed, dataHandler.js should have already set the status
             startButton.disabled = true; // Disable start button on validation failure
             previewSection.style.display = 'none'; // Hide preview on validation failure
             parsedData = []; // Clear parsed data
        } else {
            // File was handled, but no valid data resulted (e.g., empty file)
            updatePreview([]); // Clear preview and disable button
        }
    });
    
     // Initial load: display history
    displayMessageHistory();

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
    
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;

        if (files.length > 0) {
            const file = files[0];
            // Use the handleFile function from dataHandler.js
            // Assuming dataHandler.js is loaded and handleFile is in the global scope or accessible.
            if (typeof handleFile === 'function') {
                 handleFile(file);
            } else {
                console.error("dataHandler.js handleFile function not available.");
                statusDiv.innerHTML = '<span class="whatsblitz-error">Error: File processing function not loaded.</span>';
            }
        }
    }

    // --- File input change handling for the sidebar ---
    if (fileInput) {
        fileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                 // Use the handleFile function from dataHandler.js
                if (typeof handleFile === 'function') {
                     handleFile(file);
                } else {
                    console.error("dataHandler.js handleFile function not available.");
                    statusDiv.innerHTML = '<span class="whatsblitz-error">Error: File processing function not loaded.</span>';
                }
            }
        });
    }

}).catch(console.error); 