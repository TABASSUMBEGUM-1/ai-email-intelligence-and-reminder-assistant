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
    initOnboarding();
    renderPersonalizedTag();
    initMiniCalendar();

    const savedTheme = localStorage.getItem("theme");
    if(savedTheme === "light"){
        document.body.classList.add("light-theme");
        document.getElementById("themeBtn").innerHTML = "☀️";
    }
};

/* ---------------- Onboarding ---------------- */

function initOnboarding(){
    const done = localStorage.getItem("onboardingDone");
    if(done) return;

    const overlay = document.getElementById("onboardingOverlay");
    const grid = document.getElementById("onboardingGrid");
    const ctaBtn = document.getElementById("onboardingDone");
    const skipBtn = document.getElementById("onboardingSkip");

    let selected = new Set();

    requestAnimationFrame(() => overlay.classList.add("show"));

    grid.querySelectorAll(".onb-chip").forEach(chip => {
        chip.addEventListener("click", () => {
            const val = chip.dataset.value;
            if(selected.has(val)){
                selected.delete(val);
                chip.classList.remove("selected");
            } else {
                selected.add(val);
                chip.classList.add("selected");
            }
        });
    });

    function closeOnboarding(prefs){
        localStorage.setItem("onboardingDone", "1");
        localStorage.setItem("emailPreferences", JSON.stringify(prefs));
        overlay.classList.remove("show");
        setTimeout(() => overlay.style.display = "none", 300);
        renderPersonalizedTag();
    }

    ctaBtn.addEventListener("click", () => closeOnboarding(Array.from(selected)));
    skipBtn.addEventListener("click", () => closeOnboarding([]));
}

function renderPersonalizedTag(){
    const tag = document.getElementById("personalizedTag");
    const prefs = JSON.parse(localStorage.getItem("emailPreferences")) || [];

    if(prefs.length === 0){
        tag.style.display = "none";
        return;
    }

    tag.style.display = "inline-block";
    tag.innerText = `🎯 Watching for: ${prefs.join(", ")}`;
}

/* ---------------- Analyze ---------------- */

async function analyzeEmail() {
    const loader = document.getElementById("loader");
    const emailField = document.getElementById("emailInput");
    const email = emailField.value.trim();
    const button = document.getElementById("analyzeBtn");
    const resultDiv = document.getElementById("result");
    const saveBtn = document.getElementById("saveReminderBtn");
    const scanOverlay = document.getElementById("scanOverlay");

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
    startScanEffect(scanOverlay, emailField);

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
        stopScanEffect(scanOverlay);

        const parsed = parseAnalysis(data.response);
        latestAnalysis = parsed;

        renderResult(parsed);
        saveBtn.disabled = false;
    }
    catch(error){
        loader.style.display = "none";
        stopScanEffect(scanOverlay);
        resultDiv.classList.add("empty");
        resultDiv.innerHTML = `<p class="result-placeholder">Something went wrong reaching the AI. Check your connection and try again.</p>`;
        latestAnalysis = null;
    }

    button.querySelector(".btn-label").innerText = "Analyze with AI";
    button.disabled = false;
}

/* ---------------- Scan & Extract visual ---------------- */

const SCAN_KEYWORDS = ["deadline","register","apply","submit","priority","urgent","due","before","meeting","workshop","internship","hackathon"];

function startScanEffect(overlay, textarea){
    overlay.classList.add("active");

    const text = textarea.value;
    const found = SCAN_KEYWORDS.filter(kw => text.toLowerCase().includes(kw));
    const particleHost = document.getElementById("scanParticles");
    particleHost.innerHTML = "";

    const labels = found.length ? found.slice(0, 6) : ["scanning"];

    labels.forEach((word, i) => {
        const chip = document.createElement("span");
        chip.className = "scan-particle fly";
        chip.innerText = word;
        chip.style.left = `${10 + (i % 3) * 30}%`;
        chip.style.top = `${20 + Math.floor(i / 3) * 40}%`;
        chip.style.animationDelay = `${i * 0.15}s`;
        chip.style.setProperty("--fly-x", `${(Math.random() - 0.5) * 40}px`);
        particleHost.appendChild(chip);
    });
}

function stopScanEffect(overlay){
    overlay.classList.remove("active");
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

    resultDiv.classList.add("materializing");
    setTimeout(() => resultDiv.classList.remove("materializing"), 550);

    resultDiv.innerHTML = `
        <div class="result-grid">
            <div class="result-field full" style="animation-delay:0.05s">
                <span class="result-label">Title</span>
                <span class="result-value">${escapeHtml(parsed.title)}</span>
            </div>
            <div class="result-field" style="animation-delay:0.12s">
                <span class="result-label">Category</span>
                <span class="result-value">${escapeHtml(parsed.category)}</span>
            </div>
            <div class="result-field" style="animation-delay:0.18s">
                <span class="result-label">Deadline</span>
                <span class="result-value">${escapeHtml(parsed.deadline)}</span>
            </div>
            <div class="result-field full" style="animation-delay:0.24s">
                <span class="result-label">Task</span>
                <span class="result-value">${escapeHtml(parsed.task)}</span>
            </div>
            <div class="result-field" style="animation-delay:0.3s">
                <span class="result-label">Priority</span>
                <span class="priority-pill ${pClass}">${parsed.priority} / 100</span>
            </div>
            <div class="result-field full" style="animation-delay:0.36s">
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
    renderMiniCalendar();
    showPage("dashboardPage", document.querySelector('[data-page="dashboardPage"]'));
    alert("Reminder saved!");
}

function deleteReminder(id){
    let reminders = JSON.parse(localStorage.getItem("reminders")) || [];
    reminders = reminders.filter(r => r.id !== id);
    localStorage.setItem("reminders", JSON.stringify(reminders));
    renderReminders();
    updateBellCounts();
    renderMiniCalendar();
}

function clearReminders(){
    const confirmDelete = confirm("Delete all reminders?");
    if(!confirmDelete) return;

    localStorage.removeItem("reminders");
    renderReminders();
    updateBellCounts();
    renderMiniCalendar();
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

/* ---------------- Mini Calendar ---------------- */

let mcViewYear, mcViewMonth; // 0-indexed month

function initMiniCalendar(){
    const today = new Date();
    mcViewYear = today.getFullYear();
    mcViewMonth = today.getMonth();

    document.getElementById("mcPrev").addEventListener("click", () => {
        mcViewMonth--;
        if(mcViewMonth < 0){ mcViewMonth = 11; mcViewYear--; }
        renderMiniCalendar();
    });

    document.getElementById("mcNext").addEventListener("click", () => {
        mcViewMonth++;
        if(mcViewMonth > 11){ mcViewMonth = 0; mcViewYear++; }
        renderMiniCalendar();
    });

    renderMiniCalendar();
}

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function getRemindersByDateKey(){
    const reminders = JSON.parse(localStorage.getItem("reminders")) || [];
    const map = {};

    reminders.forEach(r => {
        if(!r.deadline) return;
        const parsed = Date.parse(r.deadline);
        if(isNaN(parsed)) return;

        const d = new Date(parsed);
        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

        if(!map[key]) map[key] = [];
        map[key].push(r);
    });

    return map;
}

function renderMiniCalendar(){
    const grid = document.getElementById("mcGrid");
    const label = document.getElementById("mcMonthLabel");
    grid.innerHTML = "";

    label.innerText = `${MONTH_NAMES[mcViewMonth]} ${mcViewYear}`;

    const firstDay = new Date(mcViewYear, mcViewMonth, 1).getDay();
    const daysInMonth = new Date(mcViewYear, mcViewMonth + 1, 0).getDate();

    const today = new Date();
    const isCurrentMonth = (today.getFullYear() === mcViewYear && today.getMonth() === mcViewMonth);

    const remindersByDate = getRemindersByDateKey();

    for(let i = 0; i < firstDay; i++){
        const empty = document.createElement("div");
        empty.className = "mc-day empty";
        grid.appendChild(empty);
    }

    for(let day = 1; day <= daysInMonth; day++){
        const cell = document.createElement("div");
        cell.className = "mc-day";

        if(isCurrentMonth && day === today.getDate()){
            cell.classList.add("today");
        }

        const numSpan = document.createElement("span");
        numSpan.innerText = day;
        cell.appendChild(numSpan);

        const key = `${mcViewYear}-${mcViewMonth}-${day}`;
        const dayReminders = remindersByDate[key];

        if(dayReminders && dayReminders.length){
            cell.classList.add("has-reminder");

            const dotsWrap = document.createElement("div");
            dotsWrap.className = "mc-dots";

            dayReminders.slice(0, 3).forEach(r => {
                const level = urgencyLevel(r.deadline);
                const dot = document.createElement("span");
                dot.className = `mc-dot ${level === "unknown" ? "safe" : level}`;
                dotsWrap.appendChild(dot);
            });

            cell.appendChild(dotsWrap);

            const tooltip = document.createElement("div");
            tooltip.className = "mc-tooltip";
            tooltip.innerHTML = dayReminders.map(r =>
                `<div class="mc-tooltip-item">${escapeHtml(r.title)}</div>`
            ).join("");
            cell.appendChild(tooltip);
        }

        grid.appendChild(cell);
    }
}