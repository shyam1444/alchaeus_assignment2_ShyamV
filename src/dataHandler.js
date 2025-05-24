// Get the file input and the drag-and-drop area (label)
const fileInput = document.getElementById('whatsblitz-file-input');
const dropArea = document.querySelector('label[for="whatsblitz-file-input"]');
const fileNameDisplay = document.getElementById('whatsblitz-file-name');
const statusDiv = document.getElementById('status'); // Get status div from popup.html

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
        return { isValid: false, message: "File is empty or could not be parsed." };
    }

    const requiredHeaders = ['Phone Number', 'Name', 'Custom Message'];
    const headers = Object.keys(data[0]);

    const missingHeaders = requiredHeaders.filter(header => !headers.includes(header));
    if (missingHeaders.length > 0) {
        return { isValid: false, message: `Missing required columns: ${missingHeaders.join(', ')}` };
    }

    // Basic validation for phone numbers (can be enhanced)
    const invalidContacts = data.filter(contact => !contact['Phone Number'] || isNaN(contact['Phone Number']));
    if (invalidContacts.length > 0) {
        return { isValid: false, message: `Invalid or missing phone numbers found in ${invalidContacts.length} row(s).` };
    }

    return { isValid: true, message: "Data validated successfully." };
}

// Function to handle file processing
function handleFile(file) {
  if (!file) {
    fileNameDisplay.textContent = 'No file selected.';
    parsedData = [];
    // Notify popup that data is cleared
    window.dispatchEvent(new CustomEvent('dataParsed', { detail: parsedData }));
    return;
  }

  fileNameDisplay.textContent = `Selected file: ${file.name}`;
  statusDiv.textContent = 'Processing file...';

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
                fileNameDisplay.textContent = 'Error processing file.';
                statusDiv.textContent = 'Error processing file.';
                parsedData = [];
                // Notify popup that data is cleared
                window.dispatchEvent(new CustomEvent('dataParsed', { detail: parsedData }));
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
      fileNameDisplay.textContent = 'Error processing file.';
      statusDiv.textContent = 'Error processing file.';
      parsedData = [];
      // Notify popup that data is cleared
      window.dispatchEvent(new CustomEvent('dataParsed', { detail: parsedData }));
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
        fileNameDisplay.textContent = 'Validation failed.';
        statusDiv.textContent = `Error: ${validationResult.message}`;
        parsedData = [];
        // Notify popup that data is cleared
        window.dispatchEvent(new CustomEvent('dataParsed', { detail: parsedData }));
        return;
    }

    // Process data with placeholders
    parsedData = processDataWithPlaceholders(rawData);

    console.log("Processed data:", parsedData);

    // Display parsed data in the UI (handled by popup.js)
    fileNameDisplay.textContent += ` - ${parsedData.length} records processed.`;
    statusDiv.textContent = 'File processed and data ready.';
    
    // Notify popup that data is ready
    window.dispatchEvent(new CustomEvent('dataParsed', { detail: parsedData }));
}

// Event listener for file input change
if (fileInput) {
  fileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    handleFile(file);
  });
} else {
  console.error("File input element not found.");
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
} else {
   console.error("Drop area element not found.");
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

  handleFile(files[0]);
}

// Add SheetJS and PapaParse scripts to be loaded in popup.html
// These will be added directly in popup.html for simplicity in this case
// <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
// <script src="https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.3.0/papaparse.min.js"></script> 