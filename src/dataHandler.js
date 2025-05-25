// dataHandler.js - Handles file reading, parsing, and data validation.
// It communicates with UI scripts (popup.js, sidebar.js) via chrome.runtime.sendMessage.

// Remove direct DOM element references as this script runs in an isolated world.
// const fileInput = document.getElementById('whatsblitz-file-input');
// const dropArea = document.querySelector('label[for="whatsblitz-file-input"]');
// const fileNameDisplay = document.getElementById('whatsblitz-file-name');
// const statusDiv = document.getElementById('status');

let parsedData = []; // Array to store the parsed data

// Function to handle placeholder replacement
function processDataWithPlaceholders(data) {
  return data.map(contact => {
    let message = contact['Custom Message'] || '';
    
    // Replace all placeholders like {{key}} with the corresponding value from contact
    message = message.replace(/{{(\w+)}}/g, (match, key) => {
        const value = contact[key];
        return value !== undefined && value !== null ? value : '';
    });

    return { ...contact, 'Processed Message': message };
  });
}

// Function to validate the uploaded data
function validateData(data) {
    if (!data || data.length === 0) {
        // Send validation error message
         chrome.runtime.sendMessage({
            type: 'validationError',
            text: "File is empty or could not be parsed."
        });
        return { isValid: false, message: "File is empty or could not be parsed." };
    }

    const requiredHeaders = ['Phone Number', 'Name', 'Custom Message'];
    const headers = Object.keys(data[0]);

    const missingHeaders = requiredHeaders.filter(header => !headers.includes(header));
    if (missingHeaders.length > 0) {
        // Send validation error message
        chrome.runtime.sendMessage({
            type: 'validationError',
            text: `Missing required columns: ${missingHeaders.join(', ')}`
        });
        return { isValid: false, message: `Missing required columns: ${missingHeaders.join(', ')}` };
    }

    // Basic validation for phone numbers (can be enhanced)
    const invalidContacts = data.filter(contact => !contact['Phone Number'] || isNaN(contact['Phone Number']));
    if (invalidContacts.length > 0) {
         // Send validation error message
         chrome.runtime.sendMessage({
            type: 'validationError',
            text: `Invalid or missing phone numbers found in ${invalidContacts.length} row(s).`
        });
        return { isValid: false, message: `Invalid or missing phone numbers found in ${invalidContacts.length} row(s).` };
    }

    // Send status that validation succeeded
     chrome.runtime.sendMessage({
        type: 'status',
        text: "Data validated successfully."
     });

    return { isValid: true, message: "Data validated successfully." };
}

// Function to handle file processing (called by UI scripts)
function handleFile(file) {
  if (!file) {
     chrome.runtime.sendMessage({
        type: 'status',
        text: 'No file selected.'
     });
    return;
  }

  chrome.runtime.sendMessage({
      type: 'status',
      text: `Processing file: ${file.name}`
  });

  const reader = new FileReader();

  reader.onload = function(event) {
    const fileContent = event.target.result;
    let rawData = [];

    try {
      const fileExtension = file.name.split('.').pop().toLowerCase();

      if (fileExtension === 'xlsx' || fileExtension === 'xls') {
        // Use SheetJS to parse the file content
        const workbook = XLSX.read(fileContent, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        rawData = XLSX.utils.sheet_to_json(worksheet);
      } else if (fileExtension === 'csv') {
        // Use PapaParse to parse the file content
        Papa.parse(fileContent, {
            header: true,
            complete: function(results) {
                rawData = results.data;
                processAndValidateData(rawData);
            },
            error: function(error) {
                console.error("Error parsing CSV file:", error);
                chrome.runtime.sendMessage({
                    type: 'error',
                    text: `Error parsing CSV file: ${error.message}`
                });
            }
        });
        // For PapaParse, the rest of the logic continues in the complete callback
        return;
      } else {
          throw new Error("Unsupported file type. Please upload .xlsx, .xls, or .csv");
      }

      // If not CSV, process and validate directly
      if (fileExtension !== 'csv') {
         processAndValidateData(rawData);
      }

    } catch (error) {
      console.error("Error parsing file:", error);
       chrome.runtime.sendMessage({
            type: 'error',
            text: `Error parsing file: ${error.message}`
        });
    }
  };

  // Read the file appropriately based on type
  const fileExtension = file.name.split('.').pop().toLowerCase();
  if (fileExtension === 'xlsx' || fileExtension === 'xls') {
    reader.readAsBinaryString(file);
  } else if (fileExtension === 'csv') {
    reader.readAsText(file);
  }
}

function processAndValidateData(rawData) {
    console.log("Raw file data:", rawData);

    const validationResult = validateData(rawData);

    if (!validationResult.isValid) {
        console.error("Data validation failed:", validationResult.message);
        // The validation function already sends a message, just return.
        return;
    }

    // Process data with placeholders
    parsedData = processDataWithPlaceholders(rawData);

    console.log("Processed data:", parsedData);

    // Notify UI that data is ready and send the data
     chrome.runtime.sendMessage({
        type: 'dataReady',
        data: parsedData,
        text: `File processed with ${parsedData.length} records. Data ready to send.`
     });
}

// Expose handleFile for UI scripts to call via a namespace
window.dataHandler = { 
    handleFile: handleFile
    // processAndValidateData: processAndValidateData // Keep internal unless specifically needed elsewhere
};

// Add SheetJS and PapaParse scripts to be loaded in popup.html
// These will be added directly in popup.html for simplicity in this case
// <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
// <script src="https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.3.0/papaparse.min.js"></script> 

// Expose handleFile globally so popup.js/sidebar.js can call it
// window.handleFile = handleFile;
// window.preventDefaults = preventDefaults; // Expose if needed by UI scripts
// window.highlight = highlight;         // Expose if needed by UI scripts
// window.unhighlight = unhighlight;       // Expose if needed by UI scripts
// window.handleDrop = handleDrop;         // Expose if needed by UI scripts - though sidebar/popup should call handleFile directly

// Remove direct DOM manipulation for status and file name display,
// rely on messages sent back to the UI scripts.
// statusDiv and fileNameDisplay are likely null or refer to elements in dataHandler's context,
// not the popup/sidebar DOM.
// Remove the following lines if they exist and are for direct DOM manipulation:
// const fileNameDisplay = document.getElementById('whatsblitz-file-name');
// const statusDiv = document.getElementById('status'); 