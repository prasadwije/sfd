// Global CONFIG is assumed to be available from config.js
// D3.js is assumed to be loaded via index.html

// --- GLOBAL STATE MANAGEMENT ---
const STATE = {
    currentActiveTask: null, 
    isBreakMode: false,
    breakStartTime: null,
    lastPausedTaskId: localStorage.getItem('sfd_lastPausedTaskId') || null, 
    allTasksData: [],
    breakIntervalId: null,
    taskRefreshIntervalId: null, // Task refresh interval ID
    kpiRefreshIntervalId: null, // KPI refresh interval ID
    activeTimerIntervalId: null,
    ACTIVE_TASK_REFRESH_RATE: 900000, // 15 minutes (Tasks)
    IDLE_TASK_REFRESH_RATE: 900000, // 15 minutes (Tasks when idle)
    KPI_REFRESH_RATE: 600000, // 10 minutes (KPIs)
};

let D = {}; 

// --- HELPER FUNCTIONS (Unchanged) ---

function durationStringToMs(durationStr) {
    const match = (durationStr || '').match(/(?:(\d+)D)?(?:(\d+)H)?(?:(\d+)M)?/i);
    if (!match) return 0;
    
    let totalMs = 0;
    const days = parseInt(match[1]) || 0;
    const hours = parseInt(match[2]) || 0;
    const minutes = parseInt(match[3]) || 0;
    totalMs += days * 24 * 60 * 60 * 1000;
    totalMs += hours * 60 * 60 * 1000;
    totalMs += minutes * 60 * 1000;
    return totalMs;
}

function formatMsToHHMMSS(ms) {
    if (ms < 0) ms = 0;
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const formatTime = (val) => String(val).padStart(2, '0');
    return `${formatTime(hours)}:${formatTime(minutes)}:${formatTime(seconds)}`;
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Map DOM Elements after HTML load is guaranteed
    D = {
        taskListContainer: document.getElementById('task-list-container'),
        startBreakButton: document.getElementById('start-break-button'),
        pauseOverlay: document.getElementById('pause-overlay'),
        continueButton: document.getElementById('continue-button'),
        pauseTimer: document.getElementById('pause-timer'),
        productivityBar: document.getElementById('productivity-bar'),
        productivityPercent: document.getElementById('productivity-percent'),
        loadingIndicator: document.getElementById('loading-indicator'),
        taskCount: document.getElementById('task-count'), 
        refreshButton: document.getElementById('refresh-button'),
        completedCount: document.getElementById('completed-count')
    };

    if (typeof CONFIG === 'undefined' || !CONFIG.API_URL_SMART_ACTION || !CONFIG.API_URL_FETCH_KPI) {
        console.error('CRITICAL ERROR: Configuration (config.js) is missing.');
        // Use document write as D.loadingIndicator might not be ready yet
        document.body.innerHTML = '<h1>Configuration Error! Check console.</h1>';
        return;
    }

    // 2. Start Task Data Load Loop
    fetchAndRenderTasks();
    
    // 3. Start KPI Data Load Loop (Separate)
    fetchAndRenderKPI();
    STATE.kpiRefreshIntervalId = setInterval(fetchAndRenderKPI, STATE.KPI_REFRESH_RATE);
    
    setupEventListeners();

    if (STATE.lastPausedTaskId) {
        setBreakMode(true);
    }
});

// --- REFRESH CONTROL ---

function startTaskAutoRefreshLoop(rate) {
    if (STATE.taskRefreshIntervalId) clearInterval(STATE.taskRefreshIntervalId);
    STATE.taskRefreshIntervalId = setInterval(fetchAndRenderTasks, rate);
    console.log(`Task auto refresh set to ${rate / 1000} seconds.`);
}

// --- CORE API & DATA FUNCTIONS ---

async function fetchAndRenderTasks() {
    if (STATE.activeTimerIntervalId) clearInterval(STATE.activeTimerIntervalId);
    D.loadingIndicator.textContent = 'Refreshing task data...';
    
    try {
        const response = await fetch(CONFIG.API_URL_FETCH_TASKS);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json();
        STATE.allTasksData = data.tasks || [];

        D.loadingIndicator.textContent = ''; 
        
        STATE.currentActiveTask = STATE.allTasksData.find(task => task.isActive);

        const refreshRate = STATE.currentActiveTask ? STATE.ACTIVE_TASK_REFRESH_RATE : STATE.IDLE_TASK_REFRESH_RATE;
        startTaskAutoRefreshLoop(refreshRate);

        renderTaskList();
        updateControlStripDisplay();

    } catch (error) {
        console.error('Error fetching tasks (Workflow A):', error);
        D.loadingIndicator.textContent = 'Error loading tasks. Check Workflow A URL.';
    }
}

/**
 * NEW FUNCTION: Dedicated KPI Fetcher
 * FIX: Removed unnecessary DOM manipulation logic from here to prevent crash
 */
async function fetchAndRenderKPI() {
    try {
        const response = await fetch(CONFIG.API_URL_FETCH_KPI);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const data = await response.json(); 
        
        if (!data || !data.kpi_display_percent) {
             throw new Error("KPI data structure invalid or empty.");
        }
        
        // --- CORE LOGIC ONLY ---
        const percentage = data.kpi_display_percent || 0;
        const rootStyle = getComputedStyle(document.documentElement);
        const colorActive = rootStyle.getPropertyValue('--color-active').trim();
        const colorPause = rootStyle.getPropertyValue('--color-pause').trim();
        const colorUrgent = rootStyle.getPropertyValue('--color-urgent').trim();
        
        // 1. Render Main Bar KPI (still mapped for future use)
        if (D.productivityPercent) D.productivityPercent.textContent = `${percentage}%`;
        if (D.productivityBar) {
            D.productivityBar.style.width = `${percentage}%`;
            if (percentage < 30) {
                D.productivityBar.style.backgroundColor = colorUrgent;
            } else if (percentage < 60) {
                D.productivityBar.style.backgroundColor = colorPause;
            } else {
                D.productivityBar.style.backgroundColor = colorActive;
            }
        }
        
        // 2. Display Completed Tasks Count (CRITICAL FIX LINE 149/163)
        // Ensure D.completedCount exists before setting textContent
        if (D.completedCount) {
             D.completedCount.textContent = data.completed_tasks || 0; 
        }

        // 3. Render Pie Charts
        if (typeof d3 !== 'undefined') {
            renderPieChart('#focus-quality-chart', data.focus_quality_data, "Focus Quality");
            renderPieChart('#day-allocation-chart', data.day_allocation_data, "Day Allocation");
        }
        
    } catch (error) {
        // CATCH BLOCK
        console.error('Error fetching KPI data:', error);
        if (D.completedCount) D.completedCount.textContent = 'Err';
        if (D.productivityPercent) D.productivityPercent.textContent = 'Err';
    }
}


// --- CORE API & DATA FUNCTIONS (Replace existing sendSmartAction) ---

async function sendSmartAction(action, taskId, buttonElement) {
    // FIX 1: Apply instant feedback and disable controls
    const actionSuccessful = applyInstantFeedback(action, taskId, buttonElement);
    if (!actionSuccessful) return; // Stop execution if feedback fails/is not needed

    // FIX 2: Only RESUME uses the stored lastPausedTaskId, otherwise use provided taskId
    const idToSend = (action === 'RESUME_TASK') ? STATE.lastPausedTaskId : taskId;
    
    // Critical check: Ensure ID exists for any non-PAUSE action
    if (!idToSend && action !== 'PAUSE_MANUAL') {
        console.error(`ACTION ABORTED: ${action} requires a Task ID.`);
        D.loadingIndicator.textContent = `Error: Cannot execute ${action}, ID missing.`;
        revertInstantFeedback(action, buttonElement); 
        return;
    }

    D.loadingIndicator.textContent = `${action.replace('_', ' ')} initiated...`;
    
    const payload = { action: action, id: idToSend };
    
    try {
        const response = await fetch(CONFIG.API_URL_SMART_ACTION, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        
        const result = await response.json();
        
        playSound(result.action);
        
        handleN8nResponse(result);
        
        // Full state is corrected by the subsequent refresh
        setTimeout(fetchAndRenderTasks, 500); 

    } catch (error) {
        console.error('Error executing smart action:', error);
        D.loadingIndicator.textContent = `Action failed: ${error.message}. Check N8N logs.`;
        // Revert feedback if fetch fails
        revertInstantFeedback(action, buttonElement);
    }
}

// --- UI RENDERING (Replace existing renderTaskList function in app.js) ---

function renderTaskList() {
    const tasks = STATE.allTasksData;
    D.taskListContainer.innerHTML = '';
    
    D.taskCount.textContent = `TASKS UP NEXT (${tasks.length})`; 
    
    if (tasks.length === 0) {
        D.taskListContainer.innerHTML = '<div style="text-align: center; color: var(--color-secondary-text); padding: 30px;">No tasks available.</div>';
        return;
    }

    if (STATE.activeTimerIntervalId) clearInterval(STATE.activeTimerIntervalId);

    // Get today's start timestamp (for accurate comparison for Due Date logic)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStartMs = today.getTime();
    const tomorrowStartMs = todayStartMs + (24 * 3600 * 1000); // Define tomorrow start time once

    // FIX: Use forEach with index for staggered animation logic
    tasks.forEach((task, index) => { 
        
        // --- Variable Definitions for current task ---
        const isCurrentlyActive = task.isActive;
        
        // 1. Due Date Logic and Formatting
        const dueDateMs = task.due_date && task.due_date !== 0 ? parseInt(task.due_date) : 0;
        let formattedDueDate = null;
        let dueDateClass = 'due-future'; 
        const hasDueDate = dueDateMs !== 0; // Check if a due date value exists

        if (hasDueDate) {
            const taskDueDate = new Date(dueDateMs);
            formattedDueDate = taskDueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            
            // NOTE: Comparison uses the start of the day (todayStartMs)
            if (dueDateMs < todayStartMs) {
                // Past due date
                dueDateClass = 'overdue';
            } else if (dueDateMs >= todayStartMs && dueDateMs < tomorrowStartMs) {
                // Due today
                dueDateClass = 'due-today';
            } else {
                // Future due date (default color)
                dueDateClass = 'due-future';
            }
        }
        
        // 2. Task variables
        const priorityClass = `priority-${task.priority}`; // DEFINED HERE
        
        const totalDurationMs = durationStringToMs(task.projectDuration);
        const staticDurationDisplay = formatMsToHHMMSS(totalDurationMs);
        const isDurationZero = totalDurationMs === 0;

        let actionButtonHTML = '';
        
        // 3. Action Button Setup
        if (isCurrentlyActive) {
            actionButtonHTML += `<button class="icon-button task-action-btn action-stop" data-action="STOP_TASK" data-task-id="${task.id}"><i class="fas fa-stop"></i></button>`;
        } else if (task.status === 'paused' || task.status === 'to do' || task.status === 'in progress' || task.status === 'stopped') {
            actionButtonHTML += `<button class="icon-button task-action-btn action-start" data-action="START_TASK" data-task-id="${task.id}"><i class="fas fa-play"></i></button>`;
        }
        
        // 4. COMPLETE Button 
        if (task.status !== 'complete') { 
             actionButtonHTML += `<button class="icon-button task-action-btn action-done" data-action="COMPLETE_TASK" data-task-id="${task.id}"><i class="fas fa-check"></i></button>`;
        }

        const taskItem = document.createElement('div');
        taskItem.className = `task-item ${priorityClass}`; // priorityClass is correctly used here
        
        taskItem.innerHTML = `
            <div class="task-details">
                <p class="task-name">${task.name}</p>
                <div class="task-metadata">
                    <span class="priority-badge ${task.priority === 'null' || task.priority === 'none' ? 'prio-null' : `prio-${task.priority}`}">
                        ${task.priority === 'null' || task.priority === 'none' ? '—' : task.priority.toUpperCase()} 
                    </span>
                    <!-- Due Date Display with dynamic color class - Conditional rendering -->
                    ${hasDueDate ? `<span class="${dueDateClass}">| Due: ${formattedDueDate}</span>` : ''}
                </div>
            </div>
            <div class="task-actions">
                <span class="task-time-display running-indicator" id="cwt-task-${task.id}" 
                      style="visibility: ${isCurrentlyActive || !isDurationZero ? 'visible' : 'hidden'};">
                    ${staticDurationDisplay}
                </span>
                ${actionButtonHTML}
            </div>
        `;
        D.taskListContainer.appendChild(taskItem);

        // --- STAGGERED ANIMATION LOGIC (Retained) ---
        // This makes the tasks fade in one after another
        setTimeout(() => {
            // CRITICAL: Ensure visibility is set to 1 for the animation
            taskItem.style.opacity = 1;
            taskItem.style.transform = 'translateY(0)';
        }, index * 50); 
        // --- END STAGGERED LOGIC ---


        // Start the timer inside the task item if active
        if (isCurrentlyActive && task.startTime) {
             startActiveTimer(task.startTime, `cwt-task-${task.id}`, totalDurationMs); 
        }
    });
}


function updateControlStripDisplay() {
    const isTaskRunning = !!STATE.currentActiveTask;

    if (isTaskRunning && !STATE.isBreakMode) {
        D.startBreakButton.classList.remove('disabled');
        D.startBreakButton.dataset.taskId = STATE.currentActiveTask.id;
    } else {
        D.startBreakButton.classList.add('disabled');
        D.startBreakButton.dataset.taskId = null;
    }
}


// --- TIMER AND UI STATE ---

function startActiveTimer(isoStartTime, elementId, existingDurationMs) {
    if (STATE.activeTimerIntervalId) clearInterval(STATE.activeTimerIntervalId);

    const element = document.getElementById(elementId);
    if (!element) return;

    const sessionStartTime = new Date(isoStartTime).getTime();
    
    // FUSION OFFSET: The timer will start counting from this offset time.
    const durationOffsetMs = existingDurationMs; 
    
    STATE.activeTimerIntervalId = setInterval(() => {
        const now = new Date().getTime();
        const sessionElapsedMs = now - sessionStartTime;
        
        // FUSION: New Session Elapsed + Existing Duration = Grand Total Time
        const grandTotalMs = sessionElapsedMs + durationOffsetMs; 

        // Update the element text with the fused time
        element.textContent = formatMsToHHMMSS(grandTotalMs);
    }, 1000);
}


function setBreakMode(enteringBreak) {
    STATE.isBreakMode = enteringBreak;
    if (enteringBreak) {
        D.pauseOverlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden'; 
        
        STATE.breakStartTime = new Date();
        STATE.breakIntervalId = setInterval(updateBreakTimer, 1000);
        
        document.getElementById('dashboard-container').style.pointerEvents = 'none';
        
    } else {
        D.pauseOverlay.classList.add('hidden');
        document.body.style.overflow = 'auto';
        document.getElementById('dashboard-container').style.pointerEvents = 'auto';
        
        if (STATE.breakIntervalId) clearInterval(STATE.breakIntervalId);
        D.pauseTimer.textContent = '--:--:--';
        
        localStorage.removeItem('sfd_lastPausedTaskId'); 
        STATE.lastPausedTaskId = null;
        
        fetchAndRenderTasks();
        fetchAndRenderKPI();
    }
}


function updateBreakTimer() {
    if (!STATE.breakStartTime) return;
    const elapsedMs = new Date().getTime() - STATE.breakStartTime.getTime();
    
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const formatTime = (val) => String(val).padStart(2, '0');
    D.pauseTimer.textContent = `${formatTime(hours)}:${formatTime(minutes)}:${formatTime(seconds)}`;
}


// --- D3 CHART RENDERING LOGIC ---

function renderPieChart(containerSelector, data, title) {
    if (typeof d3 === 'undefined') return;
    
    // Adjusted dimensions for the compact view
    const width = 230, height = 230, margin = 10;
    const radius = Math.min(width, height) / 2 - margin;

    d3.select(containerSelector).selectAll("*").remove();

    const svg = d3.select(containerSelector)
      .append("svg")
        .attr("width", width)
        .attr("height", height + 30) 
      .append("g")
        .attr("transform", `translate(${width / 2}, ${height / 2 + 15})`);
        
    const totalValue = d3.sum(data, v => v.value); 

    // --- 1. ADD SVG GRADIENT DEFINITIONS TO THE CHART ---
    // This defines the actual gradient logic for the browser
    const defs = svg.append("defs");

    // Define the color mapping for dynamic fill URLs
    const colorMap = {
        'Focused Work': { id: 'grad-focus', url: 'url(#grad-focus)', start: '#69E084', end: 'var(--c-green)' },
        'Working Time': { id: 'grad-work', url: 'url(#grad-work)', start: '#007AFF', end: '#4A90E2' },
        'Social Media / Distractions': { id: 'grad-social', url: 'url(#grad-social)', start: '#FF5555', end: 'var(--c-red)' },
        'Social Media': { id: 'grad-social-day', url: 'url(#grad-social-day)', start: '#FF5555', end: 'var(--c-red)' },
        'Other Activities': { id: 'grad-other', url: 'url(#grad-other)', start: '#FFC94D', end: 'var(--c-orange)' },
        'Remaining Day': { id: 'grad-remain', url: 'url(#grad-remain)', start: '#D8D8D8', end: '#B0B0B0' },
    };
    
    // Create actual linear gradients for all defined color maps
    Object.keys(colorMap).forEach(key => {
        const map = colorMap[key];
        const gradient = defs.append("linearGradient")
            .attr("id", map.id)
            .attr("x1", "0%")
            .attr("y1", "0%")
            .attr("x2", "100%")
            .attr("y2", "100%"); // Diagonal gradient

        gradient.append("stop")
            .attr("offset", "0%")
            .attr("stop-color", map.start);
        
        gradient.append("stop")
            .attr("offset", "100%")
            .attr("stop-color", map.end);
    });
    // --- END GRADIENT DEFINITIONS ---

    // Create title (remains unchanged)
    svg.append("text")
        .attr("x", 0)
        .attr("y", -height / 2 - 5)
        .attr("text-anchor", "middle")
        .style("font-size", "14px")
        .style("font-weight", "600")
        .style("fill", "var(--color-primary-text)")
        .text(title);
        
    const pie = d3.pie()
      .value(d => d.value)
      .sort(null);

    const arc = d3.arc()
      .innerRadius(radius * 0.5) 
      .outerRadius(radius * 0.9);

    const arcs = svg.selectAll(".arc")
      .data(pie(data))
      .enter().append("g")
        .attr("class", "arc");

    // Drawing arcs
    arcs.append("path")
      .attr("d", arc)
      // FIX: Use the URL reference to the defined gradient
      .attr("fill", d => colorMap[d.data.label] ? colorMap[d.data.label].url : d.data.color) 
      .attr("stroke", "none") // Ensure no white stroke remains
      .attr("style", "stroke-width: 2px;") 
      // Add 3D Shadow Filter
      .attr("filter", "url(#chart-shadow)");


    // Defining the 3D Shadow Filter (Must be done in SVG definitions)
    defs.append("filter")
        .attr("id", "chart-shadow")
        .append("feDropShadow")
            .attr("dx", "3")
            .attr("dy", "3")
            .attr("stdDeviation", "3")
            .attr("flood-color", "rgba(0,0,0,0.4)"); 


    // Adding two-line labels (remains unchanged)
    const textGroup = arcs.append("text")
      .attr("transform", d => `translate(${arc.centroid(d)})`)
      .style("text-anchor", "middle")
      .style("font-size", "11px")
      .style("fill", d => d.data.value > (totalValue / 10) ? "white" : "black"); 

    // Line 1: Percentage
    textGroup.append("tspan")
      .attr("x", 0)
      .attr("dy", "-0.4em") 
      .text(d => {
            const percentage = Math.round((d.data.value / totalValue) * 100);
            return percentage > 5 ? `${percentage}%` : ''; 
      });

    // Line 2: Duration (XH YM)
    textGroup.append("tspan")
      .attr("x", 0)
      .attr("dy", "1.1em") 
      .text(d => {
            const percentage = Math.round((d.data.value / totalValue) * 100);
            if (percentage > 5 && d.data.duration) {
                return d.data.duration;
            }
            return '';
      });
}


// --- EVENT HANDLERS (Replace existing D.taskListContainer listener) ---

function setupEventListeners() {
    D.startBreakButton.addEventListener('click', () => {
        const taskId = D.startBreakButton.dataset.taskId;
        // Pass the button element itself for instant feedback
        sendSmartAction('PAUSE_MANUAL', taskId, D.startBreakButton); 
    });

    D.continueButton.addEventListener('click', () => {
        const taskIdToResume = localStorage.getItem('sfd_lastPausedTaskId');
        if (taskIdToResume) {
             // Pass the continue button element
            sendSmartAction('RESUME_TASK', taskIdToResume, D.continueButton); 
        } else {
            setBreakMode(false);
        }
    });
    
    // Handle ALL task list actions (START, STOP, COMPLETE)
    D.taskListContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.task-action-btn');
        if (btn) {
            let action = btn.dataset.action;
            const taskId = btn.dataset.taskId;

            // FIX 1: If action is RESUME_TASK from the list, change it to START_TASK
            // All non-break starts must be START_TASK command
            if (action === 'RESUME_TASK') {
                 action = 'START_TASK';
            }
            
            // FIX 2: Clear any lingering RESUME state if a user starts a new task or stops
            if (action === 'START_TASK' || action === 'STOP_TASK') {
                 localStorage.removeItem('sfd_lastPausedTaskId');
                 STATE.lastPausedTaskId = null;
            }

            if (taskId) {
                 // Pass the specific button element
                 sendSmartAction(action, taskId, btn); 
            } else {
                 console.error(`Action ${action} failed: Task ID missing.`);
            }
        }
    });
    
    D.refreshButton.addEventListener('click', () => {
        fetchAndRenderTasks();
        fetchAndRenderKPI();
    });
}

// --- NEW: INSTANT FEEDBACK LOGIC (Replace existing function) ---

/**
 * Puts the clicked button into a loading state and disables critical controls.
 * NOTE: PAUSE_MANUAL skips the spinner logic.
 */
// --- NEW: INSTANT FEEDBACK LOGIC (Replace existing function) ---

/**
 * Puts the clicked button into a loading state and predicts immediate UI changes.
 */
function applyInstantFeedback(action, taskId, buttonElement) {
    // Disable all primary controls
    D.startBreakButton.disabled = true;
    D.refreshButton.disabled = true;

    if (action === 'PAUSE_MANUAL') {
        setBreakMode(true);
        return true; 
    }

    if (!buttonElement) return true; 

    // Apply visual loading state
    buttonElement.dataset.originalHtml = buttonElement.innerHTML;
    buttonElement.disabled = true;
    buttonElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; 
    
    // 2. Predict Start/Resume: Use existing duration as the starting offset
    if (action === 'START_TASK') {
        const taskItem = buttonElement.closest('.task-item');
        if (!taskItem) return;

        // --- DURATION RETRIEVAL LOGIC ---
        // Find the task object from the global state
        const targetTask = STATE.allTasksData.find(t => t.id === taskId);
        // Get the existing duration in MS from the task object (0 if new task)
        const existingDurationMs = targetTask ? durationStringToMs(targetTask.projectDuration) : 0;
        // --- END DURATION RETRIEVAL ---

        // Predict: Switch the buttons in the action area of the task card
        const actionArea = taskItem.querySelector('.task-actions');
        if (actionArea) {
             actionArea.innerHTML = `
                <span class="task-time-display running-indicator" id="cwt-task-${taskId}">${formatMsToHHMMSS(existingDurationMs)}</span>
                <button class="icon-button task-action-btn action-stop" data-action="STOP_TASK" data-task-id="${taskId}">
                    <i class="fas fa-stop"></i>
                </button>
                <button class="icon-button task-action-btn action-done" data-action="COMPLETE_TASK" data-task-id="${taskId}">
                    <i class="fas fa-check"></i>
                </button>
            `;
             // Start temporary timer using the existing duration as the offset
             startActiveTimer(new Date().toISOString(), `cwt-task-${taskId}`, existingDurationMs);
        }
    }
    
    return true; 
}

/**
 * Reverts button state if an API error occurs before confirmation.
 * (A full data refresh will correct the actual state anyway)
 */
function revertInstantFeedback(action, buttonElement) {
    // Re-enable global controls
    D.startBreakButton.disabled = false;
    D.refreshButton.disabled = false;
    
    if (buttonElement && buttonElement.dataset.originalHtml) {
        // Revert the button's content and state
        buttonElement.innerHTML = buttonElement.dataset.originalHtml;
        buttonElement.disabled = false;
        delete buttonElement.dataset.originalHtml;
    }
}

/**
 * Reverts button state if an API error occurs before confirmation.
 * (A full data refresh will correct the actual state anyway)
 */
function revertInstantFeedback(buttonElement) {
    if (!buttonElement) return;
    
    // Simple text revert based on action type
    const action = buttonElement.dataset.action;

    // Revert spinner icon to original icon
    if (action === 'START_TASK') {
         buttonElement.innerHTML = '<i class="fas fa-play"></i>';
    } else if (action === 'STOP_TASK') {
         buttonElement.innerHTML = '<i class="fas fa-stop"></i>';
    } else if (action === 'COMPLETE_TASK') {
         buttonElement.innerHTML = '<i class="fas fa-check"></i>';
    } else if (action === 'PAUSE_MANUAL') {
         buttonElement.innerHTML = '<i class="fas fa-pause"></i> START BREAK';
    }
    
    buttonElement.disabled = false;
    D.loadingIndicator.textContent = 'Reverting... Check connection.';
    
    // A subsequent fetchAndRenderTasks() will correct the UI state completely
}

function handleMainActionClick() {
    const action = D.mainActionButton.dataset.currentAction;
    const taskId = D.mainActionButton.dataset.taskId;

    if (action === 'RESUME_TASK' && STATE.lastPausedTaskId) {
         sendSmartAction('RESUME_TASK', STATE.lastPausedTaskId);
    }
}

// --- N8N RESPONSE HANDLER (Replace existing function) ---

function handleN8nResponse(result) {
    if (result.success !== 'true') {
        console.error('N8N reported an error or non-success:', result);
        D.loadingIndicator.textContent = `Action failed: ${result.message}`;
        return;
    }
    
    // Clear the active timer on STOP/PAUSE actions
    if (['TASK_STOPED', 'TASK_PAUSED', 'PAUSED'].includes(result.action)) {
        if (STATE.activeTimerIntervalId) clearInterval(STATE.activeTimerIntervalId);
    }
    
    // Re-enable global controls after successful response
    // We only need to enable them if we aren't entering a break (which handles its own lock)
    if (result.action !== 'TASK_PAUSED' && result.action !== 'PAUSED') {
         D.startBreakButton.disabled = false;
         D.refreshButton.disabled = false;
    }

    switch (result.action) {
        case 'TASK_PAUSED':
            const pausedTasks = Array.isArray(result) ? result : [result];
            const firstPausedTask = pausedTasks.find(r => r.action === 'TASK_PAUSED');
            
            if (firstPausedTask && firstPausedTask.taskId) {
                localStorage.setItem('sfd_lastPausedTaskId', firstPausedTask.taskId);
                STATE.lastPausedTaskId = firstPausedTask.taskId; 
            }
            
            // UI change already handled by applyInstantFeedback
            break;
            
        case 'PAUSED': 
            // UI change already handled by applyInstantFeedback
            localStorage.removeItem('sfd_lastPausedTaskId');
            STATE.lastPausedTaskId = null;
            break;
            
        case 'TASK_RESUMED':
            localStorage.removeItem('sfd_lastPausedTaskId');
            STATE.lastPausedTaskId = null;
            // UI change handled by setBreakMode(false) which is called here.
            setBreakMode(false); 
            break;
        default:
            // For all other actions, refresh logic handles the full UI correction
            break;
    }
}

function playSound(actionType) {
    if (CONFIG && CONFIG.SOUND_ALERT_GENERAL && ['TASK_PAUSED', 'TASK_COMPLETED', 'TASK_STARTED', 'TASK_RESUMED', 'PAUSED'].includes(actionType)) {
        const audio = new Audio(CONFIG.SOUND_ALERT_GENERAL);
        audio.play().catch(e => console.log('Audio play blocked:', e)); 
    }
}
