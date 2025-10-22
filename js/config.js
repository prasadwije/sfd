// js/config.js (Simplified Final Version)

const CONFIG = {
    // 1. DATA FETCHING WORKFLOW (Workflow A) - Loads Tasks and Status
    // Method: GET
    API_URL_FETCH_TASKS: "https://n8n101.prasadwije.me/webhook/f3d6df60-08a0-40f4-9606-9d8185e99f4c",

    // 2. SMART ACTION CONTROLLER (Workflow B) - START, STOP, PAUSE, COMPLETE
    // Method: POST
    API_URL_SMART_ACTION: "https://n8n101.prasadwije.me/webhook/18196b6f-da0b-46f4-be38-3ac3f97b53b2",

    API_URL_FETCH_KPI: "https://n8n101.prasadwije.me/webhook/061b0ef2-4d05-428f-907b-2a38a1cce2b9",

    // 3. (REMOVED: API_URL_ALERT_POLL) - This is now handled internally by n8n.
    
    // 4. (REMOVED: API_URL_CONFIRM_RESPONSE) - This URL will be sent dynamically
    //    by the n8n Workflow C when a PAUSE/BREAK is triggered.
    //    The Web App receives the PAUSE URL and calls it directly to confirm.
    PUBLIC_ALERT_CSV_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSxO3OeN1s9aVukbomNAjZ9NBEDjXZTGWXioIy0-foUBsWLcWlbzs6d5igBC48dWaXjxQs0jtjWgJxj/pub?gid=0&single=true&output=csv", 

    // 5. ALERT CLEAR ENDPOINT (Workflow F/I): N8N webhook to mark the sheet row/cell as CLEARED.
    // Web App calls this endpoint upon confirmation.
    API_URL_ALERT_CLEAR: "https://n8n101.prasadwije.me/webhook/32aa2fcd-cb26-4550-80ec-76a5316bf095",
    // --- OTHER CONSTANTS ---
    // User response time limit (for auto-pause after a triggered break/check)
    TIMEOUT_DURATION_SECONDS: 300, // 5 minutes
    
    // Alert Sound Paths
    // General sound for Task START/STOP/COMPLETE/RESUME
    SOUND_ALERT_GENERAL: "assets/sound/kik_general.mp3",
    
    // Critical sound for PAUSE/BREAK (State change)
    SOUND_ALERT_PAUSE: "assets/sound/chime_pause.mp3",
};