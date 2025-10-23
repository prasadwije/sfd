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
        // FIX: Add a Cache Buster to the URL to force the browser to fetch fresh data
        const cacheBuster = `&t=${new Date().getTime()}`; 
        const pollingUrl = CONFIG.PUBLIC_ALERT_CSV_URL + cacheBuster;

        const response = await fetch(pollingUrl);
        
        if (!response.ok) {
             console.warn('CSV Fetch Failed (CORS or 404).');
             return; 
        }
        
        const csvText = await response.text();
        
        // --- CSV PARSING LOGIC ---
        const rows = csvText.trim().split('\n');
        if (rows.length < 2) return; 

        // Data is expected on the second row (index 1)
        const dataRow = rows[1].split(',');
        
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

    // 1. Show the dedicated alert popup
    ALERT_DOM.overlay.classList.remove('hidden');
    ALERT_DOM.timerDisplay.textContent = 'CHECK!'; 

    // --- CRITICAL FIX: Set Custom Messages based on alert type ---
    let messageHTML = '';
    
    if (alertData.type === 'MANUAL_PAUSE') {
        // This is not a server alert, but a user intent confirmation (Pure Break)
        messageHTML = `<p>TAKE A BREAK</p>
                       <p class="overlay-message">Your work is paused. Continue when ready.</p>`;
    } else {
        // Server Alert (30 min check)
        messageHTML = `<p>⚠️ SERVER ALERT: ${alertData.message || 'Activity Check'}</p>
                       <p class="overlay-message">Confirm to continue working.</p>`;
    }

    ALERT_DOM.messageArea.innerHTML = messageHTML;
    
    // 2. Update the button to send the confirmation URL
    ALERT_DOM.confirmButton.textContent = 'CONFIRM WORKING';
    
    // ... (rest of the button listener logic remains the same) ...
    
    const oldListener = ALERT_DOM.confirmButton.__currentListener;
    if (oldListener) ALERT_DOM.confirmButton.removeEventListener('click', oldListener);

    const newListener = () => {
        sendAlertConfirmation(confirmUrl);
        
        ALERT_DOM.overlay.classList.add('hidden'); 
        ALERT_DOM.confirmButton.removeEventListener('click', newListener); 
        ALERT_DOM.confirmButton.__currentListener = null;
    };
    
    ALERT_DOM.confirmButton.addEventListener('click', newListener);
    ALERT_DOM.confirmButton.__currentListener = newListener; 
}


async function sendAlertConfirmation(waitUrl) {
    try {
        // We get the clear URL from the global CONFIG object
        const clearStatusBaseUrl = CONFIG.API_URL_ALERT_CLEAR; 
        
        // --- ACTION 1: RELEASE THE N8N WAIT NODE (Confirms User is present) ---
        const waitResponse = await fetch(waitUrl, { method: 'GET' });
        
        if (waitResponse.status === 409) {
            console.warn("Wait Node already cleared via Timeout (409 Conflict). Proceeding to clear status.");
        } else if (!waitResponse.ok) {
             throw new Error(`Failed to release N8N Wait Node. Status: ${waitResponse.status}`);
        }
        
        // --- ACTION 2: CLEAR THE ALERT STATUS (Permanent Clear) ---
        
        // This is a direct call to the Workflow F Clear Endpoint
        const clearStatusUrl = clearStatusBaseUrl;

        const clearResponse = await fetch(clearStatusUrl, { method: 'GET' });

        if (!clearResponse.ok) {
             throw new Error(`Failed to clear alert status. Status: ${clearResponse.status}`);
        }
        
        // --- FINAL SUCCESS ---
        fetchAndRenderTasks();
        startAlertPolling(); 
        
    } catch (error) {
        console.error('Failed to clear alert sequence:', error);
        alert('Confirmation failed. Please check your N8N URL/Origin setup.');
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





