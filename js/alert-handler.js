/**
 * SFD Alert Handler Module (js/alert-handler.js)
 * Polling logic to check the public Google Sheet (published as CSV) for an alert status.
 * This minimizes n8n server load by polling an external static resource.
 */

// Global state and functions are assumed to be available from app.js (D, CONFIG, setBreakMode, fetchAndRenderTasks)

// FIX: Set a fast polling rate for real-time feel (5 seconds)
const ALERT_POLLING_FREQUENCY = 5000; 
let alertPollingIntervalId = null;

// Assuming you configure the PUBLIC CSV URL in config.js:
// CONFIG.PUBLIC_ALERT_CSV_URL = "https://docs.google.com/spreadsheets/.../pub?output=csv&gid=123";
// CONFIG.ALERT_CLEAR_URL = "YOUR_N8N_CLEAR_WEBHOOK"; // Still need n8n for the WRITE (clear) action

const ALERT_DOM = {
    overlay: document.getElementById('pause-overlay'),
    messageArea: document.querySelector('.overlay-message'), 
    confirmButton: document.getElementById('continue-button'), 
    timerDisplay: document.getElementById('pause-timer')
};


// --- CORE POLLING FUNCTION ---

function startAlertPolling() {
    if (alertPollingIntervalId) clearInterval(alertPollingIntervalId);
    
    // Start the continuous polling loop
    alertPollingIntervalId = setInterval(fetchAlertStatus, ALERT_POLLING_FREQUENCY);
    console.log("Alert Polling started at 5s interval.");
}


async function fetchAlertStatus() {
    // Only poll if we are NOT currently in a break
    if (STATE.isBreakMode || !CONFIG.PUBLIC_ALERT_CSV_URL) {
        return; 
    }
    
    try {
        const response = await fetch(CONFIG.PUBLIC_ALERT_CSV_URL);
        
        if (!response.ok) {
             console.warn('CSV Fetch Failed (CORS or 404).');
             return; 
        }
        
        const csvText = await response.text();
        
        // --- CRITICAL TEST LINE ---
        console.log("--- RAW CSV DATA RECEIVED ---");
        console.log(csvText); // Print the raw text to console
        console.log("-----------------------------");
        
        // --- CSV PARSING LOGIC ---
        // Expecting data like: Status,Message,WaitID\nPENDING,Your check is due,X123
        const rows = csvText.trim().split('\n');
        if (rows.length < 2) return; 

        // Data is expected on the second row (index 1)
        const dataRow = rows[1].split(',');
        
        // Ensure dataRow has enough columns (at least 3: STATUS, MESSAGE, WAIT_URL)
        if (dataRow.length < 3) return;

        const alertStatus = dataRow[0].trim();
        const alertMessage = dataRow[1].trim();
        const waitUrl = dataRow[2].trim(); 

        // Alert Status Check
        if (alertStatus === 'PENDING') {
            // Stop polling immediately as we have received an alert
            clearInterval(alertPollingIntervalId);
            
            // Log successful parsing
            console.warn(`ALERT DETECTED: Status=${alertStatus}, URL=${waitUrl.substring(0, 40)}...`);

            // Display the popup
            displayServerAlert({ 
                message: alertMessage, 
                wait_url: waitUrl 
            });
        }
    } catch (error) {
        console.error('Alert polling failed during parsing:', error.message); 
    }
}


// --- DISPLAY AND INTERACTION LOGIC ---

function displayServerAlert(alertData) {
    const confirmUrl = alertData.wait_url; 

    // Play alert sound 
    playSound('PAUSED'); 

    // Show the dedicated alert popup
    ALERT_DOM.overlay.classList.remove('hidden');
    ALERT_DOM.timerDisplay.textContent = 'CHECK!'; 
    ALERT_DOM.messageArea.innerHTML = `<p>⚠️ SERVER ALERT: ${alertData.message}</p>
                                       <p>Confirm to continue working.</p>`;
    
    // Update the button to send the confirmation URL
    ALERT_DOM.confirmButton.textContent = 'CONFIRM WORKING';
    
    // Temporarily replace the click listener with the alert confirmation logic
    const oldListener = ALERT_DOM.confirmButton.__currentListener;
    if (oldListener) ALERT_DOM.confirmButton.removeEventListener('click', oldListener);

    const newListener = () => {
        // On confirmation, call the N8N Clear endpoint
        sendAlertConfirmation(confirmUrl);
        
        // Instant removal of the UI
        ALERT_DOM.overlay.classList.add('hidden'); 
        ALERT_DOM.confirmButton.removeEventListener('click', newListener); // Remove self
        ALERT_DOM.confirmButton.__currentListener = null;
    };
    
    ALERT_DOM.confirmButton.addEventListener('click', newListener);
    ALERT_DOM.confirmButton.__currentListener = newListener; // Store reference
}


async function sendAlertConfirmation(clearUrl) {
    try {
        // We use fetch with POST method to satisfy the CORS preflight request
        const response = await fetch(clearUrl, { 
            method: 'POST', 
            headers: { 
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status: 'CLEARED' }) 
        });
        
        // CRITICAL FIX: Handle successful status codes and 409 Conflict
        if (response.status === 409) {
            // If N8N returns 409 (Conflict), it means the Wait Node already timed out/cleared.
            console.warn("Alert cleared via Timeout (409 Conflict). Treating as success.");
        } else if (!response.ok) {
            // General HTTP error
            throw new Error(`Failed to confirm alert. Status: ${response.status}`);
        }
        
        // After successful confirmation, restart the general task fetch and polling
        fetchAndRenderTasks();
        startAlertPolling(); 
        
    } catch (error) {
        console.error('Failed to clear alert to N8N:', error);
        alert('Confirmation failed. Please check your N8N CORS/URL setup.');
    }
}


// --- EXPOSE/INTEGRATE WITH APP.JS ---
document.addEventListener('DOMContentLoaded', () => {
    // Map required elements after DOMContentLoaded for safety
    window.ALERT_DOM = {
        overlay: document.getElementById('pause-overlay'),
        messageArea: document.querySelector('.overlay-message'),
        confirmButton: document.getElementById('continue-button'),
        timerDisplay: document.getElementById('pause-timer')
    };

    // Delay start slightly to ensure initial task fetch runs first
    setTimeout(startAlertPolling, 5000); 
});
