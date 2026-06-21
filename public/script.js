let latestAnalysis = null;

// Backend URL.
// - Local dev: leave as-is, talks to your local server on :3000
// - Production: set window.MAILMIND_API_BASE in a small inline script
//   in index.html (see comment near the </head> tag) to your deployed
//   Render/Railway backend URL, e.g. "https://mailmind-api.onrender.com"
const API_BASE = window.MAILMIND_API_BASE || "http://localhost:3000";

function showPage(pageId, btn){
    document.getElementById("analyzePage").style.display = "none";
    document.getElementById("dashboardPage").style.display = "none";
    document.getElementById(pageId).style.display = "block";

    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    if(btn){
        btn.classList.add("active");
    } else {
        const match = document.querySelector(`.nav-btn[data-page="${pageId}"]`);
        if(match) match.classList.add("active");
    }

    if(pageId === "dashboardPage"){
        renderReminders();
    }
}

window.onload = function(){
    renderReminders();
    updateBellCounts();

    const savedTheme = localStorage.getItem("theme");
    if(savedTheme === "light"){
        document.body.classList.add("light-theme");
        document.getElementById("themeBtn").innerHTML = "☀️";
    }
};

/* ---------------- Analyze ---------------- */

async function analyzeEmail() {
    const loader = document.getElementById("loader");
    const email = document.getElementById("emailInput").value.trim();
    const button = document.getElementById("analyzeBtn");
    const resultDiv = document.getElementById("result");
    const saveBtn = document.getElementById("saveReminderBtn");

    if(!email){
        alert("Paste an email first!");
        return;
    }

    button.querySelector(".btn-label").innerText = "Analyzing...";
    button.disabled = true;
    saveBtn.disabled = true;
    loader.style.display = "block";
    resultDiv.classList.remove("empty");
    resultDiv.innerHTML = "";

    try {
        const response = await fetch(`${API_BASE}/analyze`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: email })
        });

        if(!response.ok){
            throw new Error("Server error");
        }

        const data = await response.json();
        loader.style.display = "none";

        const parsed = parseAnalysis(data.response);
        latestAnalysis = parsed;

        renderResult(parsed);
        saveBtn.disabled = false;
    }
    catch(error){
        loader.style.display = "none";
        resultDiv.classList.add("empty");
        resultDiv.innerHTML = `<p class="result-placeholder">Something went wrong reaching the AI. Check your connection and try again.</p>`;
        latestAnalysis = null;
    }

    button.querySelector(".btn-label").innerText = "Analyze with AI";
    button.disabled = false;
}

function parseAnalysis(text){
    const get = (label) => {
        const re = new RegExp(label + ":\\s*(.*)");
        const m = text.match(re);
        return m ? m[1].trim() : "";
    };

    return {
        title: get("Title") || "Untitled",
        category: get("Category") || "General",
        task: get("Task") || "—",
        deadline: get("Deadline") || "Not Mentioned",
        priority: parseInt(get("Priority")) || 0,
        summary: get("Summary") || ""
    };
}

function priorityClass(priority){
    if(priority > 80) return "urgent";
    if(priority >= 50) return "important";
    return "info";
}

function renderResult(parsed){
    const resultDiv = document.getElementById("result");
    const pClass = priorityClass(parsed.priority);

    resultDiv.innerHTML = `
        <div class="result-grid">
            <div class="result-field full">
                <span class="result-label">Title</span>
                <span class="result-value">${escapeHtml(parsed.title)}</span>
            </div>
            <div class="result-field">
                <span class="result-label">Category</span>
                <span class="result-value">${escapeHtml(parsed.category)}</span>
            </div>
            <div class="result-field">
                <span class="result-label">Deadline</span>
                <span class="result-value">${escapeHtml(parsed.deadline)}</span>
            </div>
            <div class="result-field full">
                <span class="result-label">Task</span>
                <span class="result-value">${escapeHtml(parsed.task)}</span>
            </div>
            <div class="result-field">
                <span class="result-label">Priority</span>
                <span class="priority-pill ${pClass}">${parsed.priority} / 100</span>
            </div>
            <div class="result-field full">
                <span class="result-label">Summary</span>
                <span class="result-value">${escapeHtml(parsed.summary)}</span>
            </div>
        </div>
    `;
}

function escapeHtml(str){
    const div = document.createElement("div");
    div.innerText = str;
    return div.innerHTML;
}

/* ---------------- Reminders ---------------- */

function saveReminder(){
    if(!latestAnalysis){
        alert("Analyze an email first!");
        return;
    }

    let reminders = JSON.parse(localStorage.getItem("reminders")) || [];

    if(reminders.some(r => r.title === latestAnalysis.title)){
        alert("Reminder already saved!");
        return;
    }

    const reminder = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2,7),
        title: latestAnalysis.title,
        category: latestAnalysis.category,
        task: latestAnalysis.task,
        deadline: latestAnalysis.deadline,
        priority: latestAnalysis.priority,
        summary: latestAnalysis.summary
    };

    reminders.push(reminder);
    localStorage.setItem("reminders", JSON.stringify(reminders));

    updateBellCounts();
    showPage("dashboardPage", document.querySelector('[data-page="dashboardPage"]'));
    alert("Reminder saved!");
}

function deleteReminder(id){
    let reminders = JSON.parse(localStorage.getItem("reminders")) || [];
    reminders = reminders.filter(r => r.id !== id);
    localStorage.setItem("reminders", JSON.stringify(reminders));
    renderReminders();
    updateBellCounts();
}

function clearReminders(){
    const confirmDelete = confirm("Delete all reminders?");
    if(!confirmDelete) return;

    localStorage.removeItem("reminders");
    renderReminders();
    updateBellCounts();
}

/* ---------------- Deadline urgency ---------------- */

// Returns days remaining (can be negative if overdue), or null if unparseable
function daysUntil(deadlineStr){
    if(!deadlineStr || /not mentioned|n\/a|unknown|none/i.test(deadlineStr)){
        return null;
    }

    const parsed = Date.parse(deadlineStr);
    if(isNaN(parsed)){
        return null;
    }

    const today = new Date();
    today.setHours(0,0,0,0);

    const target = new Date(parsed);
    target.setHours(0,0,0,0);

    const diffMs = target - today;
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

// Returns "urgent" | "soon" | "safe" | "unknown"
function urgencyLevel(deadlineStr){
    const days = daysUntil(deadlineStr);
    if(days === null) return "unknown";
    if(days <= 2) return "urgent";
    if(days <= 7) return "soon";
    return "safe";
}

function urgencyLabel(level, days){
    if(level === "unknown") return "";
    if(days < 0) return `Overdue by ${Math.abs(days)}d`;
    if(days === 0) return "Due today";
    if(days === 1) return "Due tomorrow";
    if(level === "urgent") return `Due in ${days}d`;
    if(level === "soon") return `Due in ${days}d`;
    return `Due in ${days}d`;
}

/* ---------------- Render dashboard ---------------- */

function renderReminders(){
    const reminderDiv = document.getElementById("reminders");
    const emptyState = document.getElementById("emptyState");
    reminderDiv.innerHTML = "";

    let reminders = JSON.parse(localStorage.getItem("reminders")) || [];

    if(reminders.length === 0){
        emptyState.style.display = "block";
        return;
    }
    emptyState.style.display = "none";

    reminders.sort((a,b) => {
        const da = daysUntil(a.deadline);
        const db = daysUntil(b.deadline);
        // unknown deadlines sink to bottom
        if(da === null && db === null) return parseInt(b.priority) - parseInt(a.priority);
        if(da === null) return 1;
        if(db === null) return -1;
        if(da !== db) return da - db;
        return parseInt(b.priority) - parseInt(a.priority);
    });

    reminders.forEach(reminder => {
        const days = daysUntil(reminder.deadline);
        const level = urgencyLevel(reminder.deadline);
        const label = urgencyLabel(level, days);

        const card = document.createElement("div");
        card.classList.add("reminder-card");
        if(level === "urgent") card.classList.add("urgent");
        if(level === "soon") card.classList.add("soon");

        const metaTagClass = level === "urgent" ? "tag-urgent" : (level === "soon" ? "tag-soon" : "");

        card.innerHTML = `
            <div class="reminder-body">
                <h3>${escapeHtml(reminder.title)}</h3>
                <div class="reminder-meta">
                    <span>${escapeHtml(reminder.category || "General")}</span>
                    <span>📅 ${escapeHtml(reminder.deadline)}</span>
                    ${label ? `<span class="${metaTagClass}">${label}</span>` : ""}
                    <span>⭐ Priority ${reminder.priority}</span>
                </div>
            </div>
            <button class="delete-btn" title="Delete reminder" aria-label="Delete reminder">✕</button>
        `;

        card.querySelector(".delete-btn").addEventListener("click", () => deleteReminder(reminder.id));

        reminderDiv.appendChild(card);
    });
}

/* ---------------- Bell badges ---------------- */

function updateBellCounts(){
    const reminders = JSON.parse(localStorage.getItem("reminders")) || [];
    const count = reminders.length;

    document.getElementById("reminderCount").innerText = count;
    document.getElementById("reminderCountTop").innerText = count;

    const hasUrgent = reminders.some(r => urgencyLevel(r.deadline) === "urgent");
    const dot = document.getElementById("bellUrgentDot");
    if(hasUrgent){
        dot.classList.add("show");
    } else {
        dot.classList.remove("show");
    }
}

/* ---------------- UI chrome ---------------- */

function toggleSidebar(){
    document.getElementById("sidebar").classList.toggle("collapsed");
}

function toggleTheme(){
    document.body.classList.toggle("light-theme");
    const btn = document.getElementById("themeBtn");

    if(document.body.classList.contains("light-theme")){
        btn.innerHTML = "☀️";
        localStorage.setItem("theme","light");
    } else {
        btn.innerHTML = "🌙";
        localStorage.setItem("theme","dark");
    }
}