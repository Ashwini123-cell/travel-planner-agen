/**
 * TravelMind AI — Frontend Application Logic
 * Handles chat, itinerary, budget, packing & profile features
 */

"use strict";

// ── Global State ──────────────────────────────────────────────
const STATE = {
  currentTab:   "chat",
  isLoading:    false,
  messageCount: 0,
  darkMode:     false,
};

// ── DOM Ready ─────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  initDarkMode();
  initChatInput();
  checkAPIStatus();
  setInterval(checkAPIStatus, 60_000); // re-check every 60 s
});

// ════════════════════════════════════════════════════════════
//  DARK MODE
// ════════════════════════════════════════════════════════════
function initDarkMode() {
  const saved = localStorage.getItem("tm-dark-mode");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  STATE.darkMode = saved !== null ? saved === "true" : prefersDark;
  applyDarkMode();
}

function applyDarkMode() {
  document.documentElement.setAttribute(
    "data-theme",
    STATE.darkMode ? "dark" : "light"
  );
  const icon = document.getElementById("darkIcon");
  const iconMobile = document.querySelector("#darkModeToggleMobile i");
  if (icon) icon.className = STATE.darkMode ? "bi bi-sun-fill" : "bi bi-moon-stars-fill";
  if (iconMobile) iconMobile.className = STATE.darkMode ? "bi bi-sun-fill" : "bi bi-moon-stars-fill";
}

document.getElementById("darkModeToggle")?.addEventListener("click", toggleDark);
document.getElementById("darkModeToggleMobile")?.addEventListener("click", toggleDark);

function toggleDark() {
  STATE.darkMode = !STATE.darkMode;
  localStorage.setItem("tm-dark-mode", STATE.darkMode);
  applyDarkMode();
}

// ════════════════════════════════════════════════════════════
//  TAB NAVIGATION
// ════════════════════════════════════════════════════════════
function showTab(tab) {
  // Deactivate all tabs
  document.querySelectorAll(".tab-content").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".nav-pill").forEach(el => el.classList.remove("active"));

  // Activate selected
  const content = document.getElementById(`tabContent${capitalize(tab)}`);
  const btn     = document.getElementById(`tab${capitalize(tab)}`);
  if (content) content.classList.add("active");
  if (btn)     btn.classList.add("active");

  STATE.currentTab = tab;

  // Scroll to app section
  document.getElementById("appContainer")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function scrollToApp() {
  document.getElementById("appContainer")?.scrollIntoView({ behavior: "smooth" });
}

function closeSidebar() {
  const offcanvas = bootstrap.Offcanvas.getInstance(document.getElementById("mobileSidebar"));
  offcanvas?.hide();
}

// ════════════════════════════════════════════════════════════
//  API STATUS CHECK
// ════════════════════════════════════════════════════════════
async function checkAPIStatus() {
  try {
    const res  = await fetch("/api/health");
    const data = await res.json();
    const dot  = document.getElementById("statusDot");
    const txt  = document.getElementById("apiStatus");
    const cnt  = document.getElementById("msgCount");

    if (data.api_configured && data.project_configured) {
      dot?.classList.add("online");
      dot?.classList.remove("offline");
      if (txt) txt.textContent = "Connected";
    } else {
      dot?.classList.add("offline");
      dot?.classList.remove("online");
      if (txt) txt.textContent = "Not configured";
    }

    const statusRes  = await fetch("/api/status");
    const statusData = await statusRes.json();
    if (cnt) cnt.textContent = statusData.session_messages || 0;
  } catch {
    const dot = document.getElementById("statusDot");
    const txt = document.getElementById("apiStatus");
    dot?.classList.add("offline");
    if (txt) txt.textContent = "Offline";
  }
}

// ════════════════════════════════════════════════════════════
//  CHAT FUNCTIONALITY
// ════════════════════════════════════════════════════════════
function initChatInput() {
  const textarea = document.getElementById("chatInput");
  if (!textarea) return;

  // Auto-resize
  textarea.addEventListener("input", () => {
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 140) + "px";
    updateCharCount();
  });

  // Enter to send (Shift+Enter for newline)
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
}

function updateCharCount() {
  const textarea = document.getElementById("chatInput");
  const counter  = document.getElementById("charCount");
  if (textarea && counter) {
    const len = textarea.value.length;
    counter.textContent = `${len}/4000`;
    counter.style.color = len > 3600 ? "var(--warning)" : "var(--text-muted)";
  }
}

async function sendMessage() {
  const textarea = document.getElementById("chatInput");
  const message  = textarea?.value.trim();
  if (!message || STATE.isLoading) return;

  // Clear input
  textarea.value = "";
  textarea.style.height = "auto";
  updateCharCount();

  // Add user message to UI
  appendMessage("user", message);

  // Show typing indicator
  setLoading(true, "chat");

  try {
    const res = await fetch("/api/chat", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ message }),
    });
    const data = await res.json();

    setLoading(false, "chat");

    if (data.error) {
      appendMessage("assistant", `⚠️ **Error:** ${data.error}\n\nPlease check your API credentials in the .env file.`);
    } else {
      appendMessage("assistant", data.response, data.timestamp);
    }

    // Update message count
    await checkAPIStatus();
  } catch (err) {
    setLoading(false, "chat");
    appendMessage("assistant", "⚠️ **Connection Error:** Could not reach the server. Please check if the Flask app is running.");
    console.error("Chat error:", err);
  }
}

function appendMessage(role, content, timestamp = null) {
  const area = document.getElementById("messagesArea");
  if (!area) return;

  const isUser = role === "user";
  const time   = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Just now";

  const avatarHTML = isUser
    ? `<div class="msg-avatar"><i class="bi bi-person-fill"></i></div>`
    : `<div class="msg-avatar"><i class="bi bi-airplane-fill"></i></div>`;

  const formattedContent = isUser ? escapeHtml(content) : formatMarkdown(content);

  const msgHTML = `
    <div class="message ${isUser ? "user-msg" : "assistant-msg"}">
      ${avatarHTML}
      <div class="msg-content">
        <div class="msg-bubble">${formattedContent}</div>
        <span class="msg-time">${time}</span>
      </div>
    </div>`;

  area.insertAdjacentHTML("beforeend", msgHTML);
  area.scrollTop = area.scrollHeight;
  STATE.messageCount++;
}

function formatMarkdown(text) {
  // Escape HTML first for user safety
  let out = escapeHtml(text);

  // Basic Markdown-like rendering
  // Bold
  out = out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Headers
  out = out.replace(/^#{1,3}\s+(.+)$/gm, "<h4>$1</h4>");
  // Bullet lists
  out = out.replace(/^\s*[-•]\s+(.+)$/gm, "<li>$1</li>");
  out = out.replace(/(<li>.*<\/li>)/gs, m => `<ul>${m}</ul>`);
  // Numbered lists
  out = out.replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>");
  // Line breaks
  out = out.replace(/\n{2,}/g, "</p><p>");
  out = out.replace(/\n/g, "<br/>");
  // Wrap in paragraph if not already wrapped
  if (!out.startsWith("<h") && !out.startsWith("<ul") && !out.startsWith("<p")) {
    out = `<p>${out}</p>`;
  }

  return out;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setLoading(loading, context = "chat") {
  STATE.isLoading = loading;
  const sendBtn    = document.getElementById("sendBtn");
  const typing     = document.getElementById("typingIndicator");
  const overlay    = document.getElementById("loadingOverlay");
  const loadingTxt = document.getElementById("loadingText");

  if (context === "chat") {
    if (sendBtn) sendBtn.disabled = loading;
    typing?.classList.toggle("d-none", !loading);
    if (loading) {
      document.getElementById("messagesArea")?.scrollTo(0, 99999);
    }
  } else {
    // For other features (itinerary, budget, etc.) show overlay
    if (loading) {
      const messages = {
        itinerary:  "Crafting your personalized itinerary...",
        budget:     "Calculating your detailed budget...",
        packing:    "Preparing your packing checklist...",
        suggest:    "Finding perfect destinations...",
        profile:    "Saving your profile...",
        recommend:    "Finding your perfect destinations...",
        hotel:        "Finding your perfect hotels...",
        consultant:   "Consulting the AI Travel Expert...",
      };
      if (loadingTxt) loadingTxt.textContent = messages[context] || "Generating...";
      overlay?.classList.remove("d-none");
    } else {
      overlay?.classList.add("d-none");
    }
  }
}

// ── Quick actions ────────────────────────────────────────────
function sendQuickMessage(msg) {
  showTab("chat");
  const textarea = document.getElementById("chatInput");
  if (textarea) {
    textarea.value = msg;
    updateCharCount();
    textarea.focus();
    // Small delay to let UI update before sending
    setTimeout(() => sendMessage(), 100);
  }
}

function setInput(text) {
  const textarea = document.getElementById("chatInput");
  if (textarea) {
    textarea.value = text;
    updateCharCount();
    textarea.focus();
  }
}

function quickDestination() {
  const dest = document.getElementById("destPicker")?.value;
  if (!dest) { showToast("Please select a destination first", "warning"); return; }
  sendQuickMessage(`Plan a trip to ${dest}. Give me an overview of best time to visit, estimated budget, top attractions, and a sample 3-day itinerary.`);
}

async function clearChat() {
  if (!confirm("Clear all chat history?")) return;
  try {
    await fetch("/api/clear-chat", { method: "POST" });
    const area = document.getElementById("messagesArea");
    if (area) {
      area.innerHTML = `
        <div class="message assistant-msg">
          <div class="msg-avatar"><i class="bi bi-airplane-fill"></i></div>
          <div class="msg-content">
            <div class="msg-bubble">
              <p>Chat cleared! ✨ Ready to plan your next adventure. Where would you like to go?</p>
            </div>
            <span class="msg-time">Just now</span>
          </div>
        </div>`;
    }
    STATE.messageCount = 0;
    await checkAPIStatus();
    showToast("Chat cleared successfully", "success");
  } catch {
    showToast("Failed to clear chat", "error");
  }
}

function exportChat() {
  const area = document.getElementById("messagesArea");
  if (!area) return;

  const messages = area.querySelectorAll(".message");
  let exportText = "TravelMind AI — Chat Export\n";
  exportText += `Generated: ${new Date().toLocaleString()}\n`;
  exportText += "=".repeat(60) + "\n\n";

  messages.forEach(msg => {
    const isUser = msg.classList.contains("user-msg");
    const content = msg.querySelector(".msg-bubble")?.innerText || "";
    const time = msg.querySelector(".msg-time")?.textContent || "";
    exportText += `[${isUser ? "YOU" : "TravelMind AI"}] ${time}\n${content}\n\n`;
  });

  const blob = new Blob([exportText], { type: "text/plain" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `travelmind-chat-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Chat exported!", "success");
}

// ════════════════════════════════════════════════════════════
//  ITINERARY PLANNER
// ════════════════════════════════════════════════════════════
async function generateItinerary() {
  const dest      = document.getElementById("itin-dest")?.value.trim();
  const days      = document.getElementById("itin-days")?.value;
  const travelers = document.getElementById("itin-travelers")?.value;
  const budget    = document.getElementById("itin-budget")?.value;
  const style     = document.getElementById("itin-style")?.value;
  const interests = document.getElementById("itin-interests")?.value.trim() || "culture, food, sightseeing";

  if (!dest) { showToast("Please enter a destination", "warning"); return; }

  setLoading(true, "itinerary");
  disableForm("itinerary");

  try {
    const res = await fetch("/api/generate-itinerary", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ destination: dest, days, travelers, budget, style, interests }),
    });
    const data = await res.json();
    setLoading(false, "itinerary");
    enableForm("itinerary");

    if (data.error) { showToast(`Error: ${data.error}`, "error"); return; }

    // Store raw text
    const rawEl = document.getElementById("itinRawText");
    if (rawEl) rawEl.textContent = data.itinerary;

    // Store in full-report collapse
    const fullEl = document.getElementById("itineraryContent");
    if (fullEl) fullEl.innerHTML = formatMarkdown(data.itinerary);

    // Meta bar
    const badge = document.getElementById("itinDestBadge");
    const meta  = document.getElementById("itinMetaText");
    if (badge) badge.textContent = `✈ ${dest}`;
    if (meta)  meta.textContent  = `${days} day${days != 1 ? "s" : ""} · ${travelers} · ${budget}`;

    // Render rich day cards
    renderItineraryDashboard(data.itinerary, dest, parseInt(days));

    document.getElementById("itineraryDashboard").classList.remove("d-none");
    document.getElementById("itineraryDashboard").scrollIntoView({ behavior: "smooth", block: "start" });
    showToast("Itinerary generated! 🗺️", "success");
  } catch (err) {
    setLoading(false, "itinerary");
    enableForm("itinerary");
    showToast("Server error. Is the Flask app running?", "error");
    console.error(err);
  }
}

// ─ Export itinerary as text file ────────────────────────────
function exportItinerary() {
  const raw = document.getElementById("itinRawText")?.textContent;
  if (!raw) { showToast("Generate an itinerary first", "warning"); return; }
  const dest = document.getElementById("itin-dest")?.value.trim() || "trip";
  const blob = new Blob([raw], { type: "text/plain" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `itinerary-${dest.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Itinerary exported!", "success");
}

// ════════════════════════════════════════════════════════════
//  ITINERARY DASHBOARD RENDERER
// ════════════════════════════════════════════════════════════
function renderItineraryDashboard(text, dest, numDays) {

  // ── 1. Split into day blocks ─────────────────────────────
  // Each block starts at "# Day N" heading
  const dayBlockRe = /(?=^#\s+Day\s+\d+)/im;
  const allBlocks  = text.split(dayBlockRe).filter(b => b.trim());
  const dayBlocks  = allBlocks.filter(b => /^#\s+Day\s+\d+/i.test(b.trim()));
  const summaryBlock = allBlocks.find(b => /trip\s+summary|📊/i.test(b));

  // ── 2. Build day-nav pills ───────────────────────────────
  const navEl   = document.getElementById("itinDayNav");
  const cardsEl = document.getElementById("itinDayCards");
  if (!navEl || !cardsEl) return;

  navEl.innerHTML   = "";
  cardsEl.innerHTML = "";

  const effectiveDays = dayBlocks.length || numDays;

  for (let i = 0; i < effectiveDays; i++) {
    const dayNum = i + 1;
    const pill   = document.createElement("button");
    pill.className   = "itin-day-pill" + (i === 0 ? " active" : "");
    pill.textContent = `Day ${dayNum}`;
    pill.addEventListener("click", () => switchDay(dayNum));
    navEl.appendChild(pill);
  }

  // ── 3. Build each day card ───────────────────────────────
  for (let i = 0; i < effectiveDays; i++) {
    const block  = dayBlocks[i] || "";
    const dayNum = i + 1;
    cardsEl.insertAdjacentHTML("beforeend", buildDayCard(block, dayNum));
  }

  // ── 4. Activate first day ─────────────────────────────────
  document.querySelector(".itin-day-card")?.classList.add("active");

  // ── 5. Trip Summary ───────────────────────────────────────
  renderItinSummary(summaryBlock || text);
}

// ─ Switch visible day card ───────────────────────────────────
function switchDay(dayNum) {
  document.querySelectorAll(".itin-day-card").forEach(el => el.classList.remove("active"));
  document.querySelectorAll(".itin-day-pill").forEach(el => el.classList.remove("active"));

  document.getElementById(`itinDay${dayNum}`)?.classList.add("active");
  const pills = document.querySelectorAll(".itin-day-pill");
  if (pills[dayNum - 1]) pills[dayNum - 1].classList.add("active");
}

// ─ Build a single day card HTML ─────────────────────────────
function buildDayCard(raw, dayNum) {
  const lines = raw.split("\n");

  // Extract day title from # heading
  const headLine = lines.find(l => /^#\s+Day\s+\d+/i.test(l)) || "";
  const rawTitle = headLine.replace(/^#+\s*/,"").replace(/^Day\s+\d+\s*[:–—]\s*/i,"").trim();
  const dayTitle = rawTitle || `Day ${dayNum}`;

  // Extract per-slot blocks keyed by emoji/keyword
  const SLOT_DEFS = [
    { key: "morning",   re: /##\s*(🌅|Morning)/i,   icon: "🌅", label: "Morning",   cls: "slot-morning"   },
    { key: "afternoon", re: /##\s*(☀️|Afternoon)/i,  icon: "☀️", label: "Afternoon", cls: "slot-afternoon" },
    { key: "evening",   re: /##\s*(🌆|Evening)/i,   icon: "🌆", label: "Evening",   cls: "slot-evening"   },
    { key: "night",     re: /##\s*(🌙|Night)/i,      icon: "🌙", label: "Night",     cls: "slot-night"     },
  ];

  // Split raw text into slot chunks
  function extractSlotBlock(slotRe, nextSlotRes) {
    let start = -1;
    for (let i = 0; i < lines.length; i++) {
      if (slotRe.test(lines[i])) { start = i; break; }
    }
    if (start === -1) return "";
    let end = lines.length;
    for (const nRe of nextSlotRes) {
      for (let i = start + 1; i < lines.length; i++) {
        if (nRe.test(lines[i]) && i < end) { end = i; break; }
      }
    }
    return lines.slice(start, end).join("\n");
  }

  const slotBlocks = SLOT_DEFS.map((s, idx) => {
    const nextRes = SLOT_DEFS.slice(idx + 1).map(ns => ns.re)
      .concat([/^#\s+Day\s+\d+/i, /^---/, /^#\s+📊/i]);
    return { ...s, raw: extractSlotBlock(s.re, nextRes) };
  });

  // Extract footer info (daily budget, stay area, transport)
  function extractFooterVal(label) {
    const re   = new RegExp(`\\*\\*${label}[^*]*\\*\\*[:\\s]*(.+)`, "i");
    const line = lines.find(l => re.test(l));
    return line ? line.replace(re,"$1").replace(/\*\*/g,"").trim() : null;
  }
  const dailyBudget  = extractFooterVal("Daily Budget Estimate");
  const stayArea     = extractFooterVal("Recommended Stay Area");
  const dayTransport = extractFooterVal("Day Transport");

  // ── Helper: parse a slot block into structured fields ───
  function parseSlot(rawSlot) {
    const sLines = rawSlot.split("\n");

    // Activity name from ### heading
    const actLine = sLines.find(l => /^###\s/.test(l)) || "";
    const actName = actLine.replace(/^#+\s*/,"").trim() || "Activity";

    function field(label) {
      const re   = new RegExp(`\\*\\*${label}[^*]*\\*\\*[:\\s]*(.+)`, "i");
      const line = sLines.find(l => re.test(l));
      return line ? line.replace(re,"$1").replace(/\*\*/g,"").replace(/^\s*₹/,"₹").trim() : null;
    }

    return {
      name:       actName,
      cost:       field("Estimated Cost"),
      travelTime: field("Travel Time"),
      hours:      field("Opening Hours"),
      food:       field("Food Recommendation"),
      photo:      field("Photo Spot"),
      tip:        field("Local Tip"),
      trap:       field("Avoid Tourist Trap"),
    };
  }

  // ── Helper: render a single slot ────────────────────────
  function renderSlot(slotDef, slotData) {
    if (!slotData.name && !slotDef.raw.trim()) return "";

    const details = [
      { label: "Travel Time",   icon: "fa-route",       cls: "label-time",  val: slotData.travelTime, trap: false },
      { label: "Opening Hours", icon: "fa-clock",       cls: "label-clock", val: slotData.hours,      trap: false },
      { label: "Food",          icon: "fa-utensils",    cls: "label-food",  val: slotData.food,       trap: false },
      { label: "Photo Spot",    icon: "fa-camera",      cls: "label-photo", val: slotData.photo,      trap: false },
      { label: "Local Tip",     icon: "fa-lightbulb",   cls: "label-tip",   val: slotData.tip,        trap: false },
      { label: "Avoid Trap",    icon: "fa-triangle-exclamation", cls: "label-trap", val: slotData.trap, trap: true  },
    ].filter(d => d.val);

    const detailHtml = details.map(d => `
      <div class="itin-detail-item${d.trap ? " trap-item" : ""}">
        <div class="itin-detail-label ${d.cls}">
          <i class="fa-solid ${d.icon}"></i>${d.label}
        </div>
        <div class="itin-detail-value">${escapeHtml(d.val)}</div>
      </div>`).join("");

    return `
      <div class="itin-slot ${slotDef.cls}">
        <div class="itin-slot-icon">${slotDef.icon}</div>
        <div class="itin-slot-label">${slotDef.label}</div>
        <div class="itin-slot-card">
          <div class="itin-activity-head">
            <div class="itin-activity-name">${escapeHtml(slotData.name)}</div>
            ${slotData.cost ? `<div class="itin-cost-badge">₹ ${escapeHtml(slotData.cost.replace(/^₹\s*/,""))}</div>` : ""}
          </div>
          ${details.length ? `<div class="itin-detail-grid">${detailHtml}</div>` : ""}
        </div>
      </div>`;
  }

  const slotsHtml = slotBlocks
    .map(s => renderSlot(s, parseSlot(s.raw)))
    .join("");

  // Footer bar
  const footerItems = [
    dailyBudget  ? `<span class="itin-day-footer-item"><i class="fa-solid fa-indian-rupee-sign"></i><strong>Budget:</strong> ${escapeHtml(dailyBudget)}</span>` : "",
    stayArea     ? `<span class="itin-day-footer-item"><i class="fa-solid fa-hotel"></i><strong>Stay:</strong> ${escapeHtml(stayArea)}</span>` : "",
    dayTransport ? `<span class="itin-day-footer-item"><i class="fa-solid fa-car-side"></i><strong>Transport:</strong> ${escapeHtml(dayTransport)}</span>` : "",
  ].filter(Boolean).join("");

  return `
    <div class="itin-day-card" id="itinDay${dayNum}">
      <div class="itin-day-head">
        <div class="itin-day-num">Day<br/>${dayNum}</div>
        <div>
          <div class="itin-day-title">${escapeHtml(dayTitle)}</div>
          <div class="itin-day-meta">
            <span><i class="fa-regular fa-clock"></i>4 time slots</span>
            <span><i class="fa-solid fa-location-dot"></i>${dest}</span>
          </div>
        </div>
      </div>
      <div class="itin-timeline">
        ${slotsHtml || `<div class="p-4 text-muted">No structured slots found — see full report below.</div>`}
        ${footerItems ? `<div class="itin-day-footer">${footerItems}</div>` : ""}
      </div>
    </div>`;
}

// ─ Render trip summary stat cards ────────────────────────────
function renderItinSummary(text) {
  const summaryEl = document.getElementById("itinSummary");
  const cardsEl   = document.getElementById("itinSummaryCards");
  if (!summaryEl || !cardsEl) return;

  // Extract key figures with regex
  function extract(patterns) {
    for (const pat of patterns) {
      const m = text.match(pat);
      if (m) return m[1]?.trim() || m[0]?.trim();
    }
    return null;
  }

  const totalBudget = extract([
    /\*\*TOTAL\*\*[^₹]*₹([\d,]+\s*–\s*₹[\d,]+)/i,
    /TOTAL[^₹\n]*₹([\d,. Ll]+)/i,
    /total\s+estimated\s+cost[^₹\n]*₹([\d,. Ll]+)/i,
  ]);
  const distance = extract([
    /total\s+estimated\s+distance[^~\n]*~?([\d,]+ ?km)/i,
    /total\s+distance[^~\n]*~?([\d,]+ ?km)/i,
    /([\d,]+ ?km)\s+total/i,
  ]);
  const timeSaved = extract([
    /saves?\s+approximately\s+([\d–]+ hours?)/i,
    /time[- ]saving[^:.\n]*:\s*(\d+[^.\n]*)/i,
    /(\d+ hours?) (?:saved|vs\.)/i,
  ]);
  const ratingMatch = text.match(/\*\*([\d.]+)\s*\/\s*10\*\*/);
  const rating = ratingMatch ? ratingMatch[1] + "/10" : extract([/([\d.]+)\s*\/\s*10/]);

  const stats = [
    { label: "Total Budget",   icon: "budget-icon",   fa: "fa-indian-rupee-sign", value: totalBudget || "See report", sub: "All tiers" },
    { label: "Travel Distance", icon: "distance-icon", fa: "fa-route",             value: distance    || "Optimized",  sub: "Total km covered" },
    { label: "Time Saved",     icon: "time-icon",     fa: "fa-clock-rotate-left",  value: timeSaved   || "Hours saved", sub: "vs. typical trip" },
    { label: "Trip Rating",    icon: "rating-icon",   fa: "fa-star",              value: rating      || "—",          sub: "Overall score" },
  ];

  cardsEl.innerHTML = stats.map(s => `
    <div class="col-6 col-md-3 animate__animated animate__zoomIn">
      <div class="itin-stat-card p-3">
        <div class="itin-stat-icon ${s.icon}">
          <i class="fa-solid ${s.fa}"></i>
        </div>
        <div class="itin-stat-label">${s.label}</div>
        <div class="itin-stat-value">${escapeHtml(s.value)}</div>
        <div class="itin-stat-sub">${s.sub}</div>
      </div>
    </div>`).join("");

  summaryEl.classList.remove("d-none");
}

// ════════════════════════════════════════════════════════════
//  BUDGET CALCULATOR
// ════════════════════════════════════════════════════════════
async function calculateBudget() {
  const dest        = document.getElementById("budg-dest")?.value.trim();
  const days        = document.getElementById("budg-days")?.value;
  const travelers   = document.getElementById("budg-travelers")?.value;
  const accom       = document.getElementById("budg-accom")?.value;
  const style       = document.getElementById("budg-style")?.value;
  const totalBudget = document.getElementById("budg-total")?.value.trim();

  if (!dest) { showToast("Please enter a destination", "warning"); return; }

  setLoading(true, "budget");
  disableForm("budget");

  try {
    const res = await fetch("/api/budget-calculator", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        destination:        dest,
        days:               parseInt(days),
        travelers:          parseInt(travelers),
        accommodation_type: accom,
        travel_style:       style,
        total_budget:       totalBudget,
      }),
    });
    const data = await res.json();
    setLoading(false, "budget");
    enableForm("budget");

    if (data.error) { showToast(`Error: ${data.error}`, "error"); return; }

    // Store raw text for copy
    const rawEl = document.getElementById("budgetRawText");
    if (rawEl) rawEl.textContent = data.budget_analysis;

    // Populate full AI report collapse
    const contentEl = document.getElementById("budgetContent");
    if (contentEl) contentEl.innerHTML = formatMarkdown(data.budget_analysis);

    // Per-person per-day section
    const ppEl = document.getElementById("perPersonContent");
    if (ppEl) ppEl.innerHTML = formatMarkdown(data.budget_analysis);

    // Render the dashboard
    renderBudgetDashboard(
      data.budget_analysis, dest,
      parseInt(days), parseInt(travelers),
      totalBudget ? parseFloat(totalBudget) : null
    );

    document.getElementById("budgetDashboard").classList.remove("d-none");
    document.getElementById("budgetDashboard").scrollIntoView({ behavior: "smooth", block: "start" });
    showToast("Complete budget analysis ready! 💰", "success");
  } catch (err) {
    setLoading(false, "budget");
    enableForm("budget");
    showToast("Server error. Is the Flask app running?", "error");
    console.error(err);
  }
}

// ════════════════════════════════════════════════════════════
//  BUDGET DASHBOARD RENDERER
// ════════════════════════════════════════════════════════════
function renderBudgetDashboard(text, dest, days, travelers, totalBudgetInput = null) {
  // ── Header meta ──────────────────────────────────────────
  const destBadge = document.getElementById("budgetDestBadge");
  const tripMeta  = document.getElementById("budgetTripMeta");
  if (destBadge) destBadge.textContent = `✈ ${dest}`;
  if (tripMeta)  tripMeta.textContent  = `${days} day${days !== 1 ? "s" : ""} · ${travelers} traveler${travelers !== 1 ? "s" : ""}`;

  // ── Currency extractor helper ─────────────────────────────
  // Matches: ₹1,23,456 / ₹12345 / $1,234 / €1,234 / 1234
  function extractAmount(line) {
    const m = line.match(/[₹$€£¥][\s]?[\d,]+(?:\.\d+)?|\b[\d,]{3,}(?:\.\d+)?\b/);
    if (!m) return null;
    const num = parseFloat(m[0].replace(/[^0-9.]/g, ""));
    return isNaN(num) ? null : { raw: num, display: m[0].trim() };
  }

  // ── Category mapping: keywords → dashboard slot ─────────
  const CAT_KEYS = {
    transport:  ["transportation", "transport", "flight", "flights", "airfare", "local transport", "metro", "taxi", "bus", "train", "travel cost"],
    accomm:     ["accommodation", "hotel", "hostel", "stay", "lodging", "airbnb", "resort", "room"],
    food:       ["food", "dining", "meal", "drink", "restaurant", "eating", "breakfast", "lunch", "dinner"],
    activities: ["activit", "sightseeing", "entrance", "entry", "ticket", "attraction", "safari", "tour", "excursion", "water park"],
    shopping:   ["shopping", "souvenir", "gift", "market"],
    emergency:  ["emergency", "contingency", "medical", "emergency fund"],
    taxes:      ["tax", "taxes", "gst", "service charge", "hotel tax", "tourist tax", "charges"],
    misc:       ["misc", "miscellaneous", "tips", "internet", "sim", "laundry", "insurance", "other", "incidental"],
  };

  // We'll collect best-guess numbers per category × tier
  const catData = {};
  for (const cat of Object.keys(CAT_KEYS)) {
    catData[cat] = { b: null, m: null, l: null, raw: [] };
  }

  // ── Tier line detection ───────────────────────────────────
  // Budget tier keywords
  const TIER_B = /\b(budget|economy|cheap|low.cost|backpacker)\b/i;
  const TIER_M = /\b(mid.?range|moderate|standard|comfortable)\b/i;
  const TIER_L = /\b(luxury|premium|high.end|deluxe|expensive)\b/i;

  // ── Parse lines ───────────────────────────────────────────
  const lines = text.split(/\n/);
  let currentCat  = null;
  let currentTier = null; // 'b', 'm', 'l'

  for (const rawLine of lines) {
    const line = rawLine.toLowerCase();

    // Detect category change
    for (const [cat, keys] of Object.entries(CAT_KEYS)) {
      if (keys.some(k => line.includes(k))) {
        currentCat = cat;
        break;
      }
    }

    // Detect tier from line
    if      (TIER_B.test(rawLine)) currentTier = "b";
    else if (TIER_L.test(rawLine)) currentTier = "l";
    else if (TIER_M.test(rawLine)) currentTier = "m";

    // Try to extract an amount
    if (currentCat) {
      const amt = extractAmount(rawLine);
      if (amt) {
        catData[currentCat].raw.push({ tier: currentTier, ...amt });
        // Assign to tier slot (first occurrence wins per tier per cat)
        if (currentTier && !catData[currentCat][currentTier]) {
          catData[currentCat][currentTier] = amt.display;
        }
      }
    }
  }

  // ── Fallback: if a category has raw values but no tier breakdowns,
  //    distribute them to b/m/l in order ────────────────────
  for (const cat of Object.keys(catData)) {
    const d = catData[cat];
    const filled = d.raw.filter(r => r.tier);
    const unfilled = d.raw.filter(r => !r.tier);
    // If none of b/m/l are set, try assigning from unfilled values
    if (!d.b && !d.m && !d.l) {
      const sorted = [...filled, ...unfilled].sort((a, b) => a.raw - b.raw);
      if (sorted[0]) d.b = sorted[0].display;
      if (sorted[Math.floor(sorted.length / 2)]) d.m = sorted[Math.floor(sorted.length / 2)].display;
      if (sorted[sorted.length - 1] && sorted.length > 1) d.l = sorted[sorted.length - 1].display;
    }
  }

  // ── Extract grand totals ──────────────────────────────────
  const totals = { b: null, m: null, l: null };
  for (const rawLine of lines) {
    const lc = rawLine.toLowerCase();
    if (/(total|grand total|overall|estimated total)/i.test(rawLine)) {
      const amt = extractAmount(rawLine);
      if (amt) {
        if      (TIER_B.test(rawLine) || (!totals.b && !totals.m && !totals.l)) totals.b = totals.b || amt.display;
        else if (TIER_L.test(rawLine)) totals.l = totals.l || amt.display;
        else if (TIER_M.test(rawLine)) totals.m = totals.m || amt.display;
      }
    }
  }
  // If totals still missing, sum up cat mid-values
  function sumCatTier(tier) {
    let total = 0; let found = false;
    for (const d of Object.values(catData)) {
      if (d[tier]) {
        const n = parseFloat(String(d[tier]).replace(/[^0-9.]/g, ""));
        if (!isNaN(n)) { total += n; found = true; }
      }
    }
    return found ? total : null;
  }
  function fmtSum(n) {
    if (n === null) return "—";
    if (n >= 100000) return "₹" + (n / 100000).toFixed(1) + "L";
    if (n >= 1000)   return "₹" + n.toLocaleString("en-IN");
    return "₹" + n;
  }
  if (!totals.b) { const s = sumCatTier("b"); totals.b = s ? fmtSum(s) : "—"; }
  if (!totals.m) { const s = sumCatTier("m"); totals.m = s ? fmtSum(s) : "—"; }
  if (!totals.l) { const s = sumCatTier("l"); totals.l = s ? fmtSum(s) : "—"; }

  // ── Populate tier boxes & progress bars ──────────────────
  const catMeta = {
    transport:  { b: "tv-transport-b",  m: "tv-transport-m",  l: "tv-transport-l",  pb: "pb-transport",  lbl: "pb-transport-lbl",  pct: "pct-transport"  },
    accomm:     { b: "tv-accomm-b",     m: "tv-accomm-m",     l: "tv-accomm-l",     pb: "pb-accomm",     lbl: "pb-accomm-lbl",     pct: "pct-accomm"     },
    food:       { b: "tv-food-b",       m: "tv-food-m",       l: "tv-food-l",       pb: "pb-food",       lbl: "pb-food-lbl",       pct: "pct-food"       },
    activities: { b: "tv-activities-b", m: "tv-activities-m", l: "tv-activities-l", pb: "pb-activities", lbl: "pb-activities-lbl", pct: "pct-activities" },
    shopping:   { b: "tv-shopping-b",   m: "tv-shopping-m",   l: "tv-shopping-l",   pb: "pb-shopping",   lbl: "pb-shopping-lbl",   pct: "pct-shopping"   },
    emergency:  { b: "tv-emergency-b",  m: "tv-emergency-m",  l: "tv-emergency-l",  pb: "pb-emergency",  lbl: "pb-emergency-lbl",  pct: "pct-emergency"  },
    taxes:      { b: "tv-taxes-b",      m: "tv-taxes-m",      l: "tv-taxes-l",      pb: "pb-taxes",      lbl: "pb-taxes-lbl",      pct: "pct-taxes"      },
    misc:       { b: "tv-misc-b",       m: "tv-misc-m",       l: "tv-misc-l",       pb: "pb-misc",       lbl: "pb-misc-lbl",       pct: "pct-misc"       },
  };

  // Compute mid-tier totals for progress bar % calculation
  let midTotal = 0;
  for (const [cat, d] of Object.entries(catData)) {
    const v = d.m || d.b || d.l;
    if (v) { const n = parseFloat(String(v).replace(/[^0-9.]/g, "")); if (!isNaN(n)) midTotal += n; }
  }

  for (const [cat, ids] of Object.entries(catMeta)) {
    const d = catData[cat];
    setText(ids.b, d.b || "—");
    setText(ids.m, d.m || "—");
    setText(ids.l, d.l || "—");

    // Progress bar
    const midVal = d.m || d.b || d.l;
    let pct = 0;
    if (midVal && midTotal > 0) {
      const n = parseFloat(String(midVal).replace(/[^0-9.]/g, ""));
      if (!isNaN(n)) pct = Math.round((n / midTotal) * 100);
    }
    const pbEl  = document.getElementById(ids.pb);
    const lblEl = document.getElementById(ids.lbl);
    const pctEl = document.getElementById(ids.pct);
    if (pbEl) { setTimeout(() => { pbEl.style.width = pct + "%"; }, 200); }
    if (lblEl) lblEl.textContent = pct > 0 ? `${pct}% of total budget` : "";
    if (pctEl) pctEl.textContent = pct > 0 ? `${pct}%` : "—";
  }

  // ── Grand totals ──────────────────────────────────────────
  setText("total-budget", totals.b || "—");
  setText("total-mid",    totals.m || "—");
  setText("total-lux",    totals.l || "—");

  // ── Money-saving tips ─────────────────────────────────────
  const TIP_ICONS = [
    "fa-plane-departure", "fa-users", "fa-bus", "fa-landmark",
    "fa-tags", "fa-kitchen-set", "fa-gifts", "fa-bottle-water",
    "fa-mobile-screen", "fa-clock",
  ];
  const tips = extractTips(text);
  const accordion = document.getElementById("tipsAccordion");
  if (accordion && tips.length > 0) {
    accordion.innerHTML = tips.map((tip, i) => {
      const icon  = TIP_ICONS[i % TIP_ICONS.length];
      const parts = tip.split(/[:–—-](.+)/s);
      const title = parts[0]?.trim() || tip;
      const body  = parts[1]?.trim() || "";
      return `
        <div class="accordion-item">
          <h2 class="accordion-header">
            <button class="accordion-button ${i > 0 ? "collapsed" : ""}" type="button"
              data-bs-toggle="collapse" data-bs-target="#tip${i}">
              <span class="tip-accordion-icon me-2"><i class="fa-solid ${icon}"></i></span>
              ${escapeHtml(title)}
            </button>
          </h2>
          <div id="tip${i}" class="accordion-collapse collapse ${i === 0 ? "show" : ""}">
            <div class="accordion-body">${body ? escapeHtml(body) : escapeHtml(title)}</div>
          </div>
        </div>`;
    }).join("");
  } else if (accordion) {
    accordion.innerHTML = `<div class="accordion-item">
      <div class="accordion-body">No specific tips extracted. Review the full AI report below for advice.</div>
    </div>`;
  }

  // ── Budget Hotels suggestions ─────────────────────────────
  renderBudgetSuggestions(text);

  // ── Remaining Budget panel ────────────────────────────────
  if (totalBudgetInput) {
    renderRemainingBudget(text, totalBudgetInput);
  }
}

// ─ Parse & render Budget Hotels + Cheapest Transport ────────
function renderBudgetSuggestions(text) {
  const lines = text.split("\n");

  // ── Helper: extract a bullet list under a section heading ─
  function extractSection(headingRe) {
    let start = -1;
    for (let i = 0; i < lines.length; i++) {
      if (headingRe.test(lines[i])) { start = i; break; }
    }
    if (start === -1) return [];
    const items = [];
    for (let i = start + 1; i < lines.length; i++) {
      const l = lines[i].trim();
      if (!l) continue;
      if (/^#+\s/.test(l) && i > start + 1) break;
      if (/^[-*•]\s+/.test(l) || /^\d+\.\s+/.test(l)) {
        items.push(l.replace(/^[-*•\d.]\s+/, "").replace(/\*\*/g, "").trim());
      }
    }
    return items;
  }

  // Parse a suggestion line: "Name — ₹XXX/night — Area — Why"
  function parseSuggestLine(line) {
    const parts = line.split(/\s*[—–-]{1,2}\s*/);
    return {
      name:   parts[0]?.replace(/\*\*/g, "").trim() || line,
      price:  parts[1]?.trim() || "",
      area:   parts[2]?.trim() || "",
      detail: parts[3]?.trim() || "",
    };
  }

  // Hotels
  const hotelLines = extractSection(/budget\s+hotel|🏨.*hotel|hotel\s+recommend/i);
  const hotelEl    = document.getElementById("hotelSuggestList");
  if (hotelEl) {
    if (hotelLines.length > 0) {
      hotelEl.innerHTML = hotelLines.slice(0, 4).map(l => {
        const s = parseSuggestLine(l);
        return `
          <div class="suggest-item">
            <div class="suggest-item-name">${escapeHtml(s.name)}</div>
            <div class="suggest-item-meta">
              ${s.price ? `<span class="suggest-price-tag">${escapeHtml(s.price)}</span>` : ""}
              ${s.area  ? `<span><i class="fa-solid fa-location-dot me-1"></i>${escapeHtml(s.area)}</span>` : ""}
            </div>
            ${s.detail ? `<div class="suggest-item-detail">${escapeHtml(s.detail)}</div>` : ""}
          </div>`;
      }).join("");
    } else {
      hotelEl.innerHTML = `<div class="text-muted p-2 small">No structured hotel data found — see full report.</div>`;
    }
  }

  // Transport
  const transportLines = extractSection(/cheapest\s+transport|🚌.*transport|transport\s+option/i);
  const transEl        = document.getElementById("transportSuggestList");
  if (transEl) {
    if (transportLines.length > 0) {
      transEl.innerHTML = transportLines.slice(0, 4).map(l => {
        const s = parseSuggestLine(l);
        return `
          <div class="suggest-item">
            <div class="suggest-item-name">${escapeHtml(s.name)}</div>
            <div class="suggest-item-meta">
              ${s.price ? `<span class="suggest-price-tag">${escapeHtml(s.price)}</span>` : ""}
              ${s.area  ? `<span><i class="fa-solid fa-route me-1"></i>${escapeHtml(s.area)}</span>` : ""}
            </div>
            ${s.detail ? `<div class="suggest-item-detail">${escapeHtml(s.detail)}</div>` : ""}
          </div>`;
      }).join("");
    } else {
      transEl.innerHTML = `<div class="text-muted p-2 small">No structured transport data found — see full report.</div>`;
    }
  }
}

// ─ Remaining Budget panel ────────────────────────────────────
function renderRemainingBudget(text, inputBudget) {
  const panel = document.getElementById("remainingBudgetPanel");
  if (!panel) return;

  // Try to extract mid-range total from text
  const midMatch = text.match(/Estimated\s+Mid.Range\s+Total[^₹\n]*₹\s*([\d,]+)/i)
    || text.match(/mid.?range[^₹\n]{0,30}₹\s*([\d,]+)/i)
    || text.match(/\*\*mid.?range\*\*[^₹\n]{0,30}₹\s*([\d,]+)/i);

  let estimatedMid = null;
  if (midMatch) {
    estimatedMid = parseFloat(midMatch[1].replace(/,/g, ""));
  } else {
    // Fallback: look for TOTAL row mid column
    const totalMatch = text.match(/TOTAL[^₹\n]{0,20}₹\s*([\d,]+)[^₹\n]{0,10}₹\s*([\d,]+)/i);
    if (totalMatch) estimatedMid = parseFloat(totalMatch[2].replace(/,/g, ""));
  }

  if (!estimatedMid) { panel.classList.add("d-none"); return; }

  const remaining = inputBudget - estimatedMid;
  const pct       = Math.min(Math.round((estimatedMid / inputBudget) * 100), 100);

  // Health classification
  let health = "comfortable", healthLabel = "✅ Comfortable", barClass = "bar-ok";
  if (remaining < 0) {
    health = "over";      healthLabel = "⚠️ Over Budget"; barClass = "bar-over";
  } else if (remaining < inputBudget * 0.1) {
    health = "tight";     healthLabel = "⚡ Tight Budget"; barClass = "bar-tight";
  }

  function fmtINR(n) {
    const abs = Math.abs(n);
    if (abs >= 100000) return (n < 0 ? "-" : "") + "₹" + (abs / 100000).toFixed(1) + "L";
    return (n < 0 ? "-" : "") + "₹" + abs.toLocaleString("en-IN");
  }

  setText("remainingTotal",    fmtINR(inputBudget));
  setText("remainingSpend",    fmtINR(estimatedMid));
  setText("remainingLeft",     fmtINR(remaining));
  setText("remainingMaxLabel", fmtINR(inputBudget));

  const leftEl = document.getElementById("remainingLeft");
  if (leftEl) {
    leftEl.className = "remaining-stat-val remaining-val-highlight" + (remaining < 0 ? " negative" : "");
  }

  const badge = document.getElementById("remainingHealthBadge");
  if (badge) {
    badge.textContent = healthLabel;
    badge.className   = `remaining-health-badge ${health}`;
  }

  const bar = document.getElementById("remainingBar");
  if (bar) {
    bar.className = `progress-bar ${barClass}`;
    setTimeout(() => { bar.style.width = pct + "%"; }, 300);
  }

  panel.classList.remove("d-none");
}

// ─ helper: set text of element by id ──────────────────────
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ─ helper: extract tip lines from AI text ─────────────────
function extractTips(text) {
  const tips = [];
  const lines = text.split(/\n/);
  // Match lines like: "1. Tip text" / "- Tip text" / "• Tip text" or sections with "tip" in heading
  let inTips = false;
  for (const line of lines) {
    const trimmed = line.trim();
    // Section header detection
    if (/tip|saving|save money|money.saving|budget.tip/i.test(trimmed) && trimmed.length < 80) {
      inTips = true;
      continue;
    }
    if (inTips) {
      // End of tips section on blank lines followed by new section header
      if (/^#+\s/.test(trimmed) && !/tip/i.test(trimmed)) { inTips = false; continue; }
      if (/^(\d+[\.\)]\s+|[-•*]\s+)/.test(trimmed)) {
        const clean = trimmed.replace(/^(\d+[\.\)]\s+|[-•*]\s+)/, "").trim();
        if (clean.length > 5) tips.push(clean);
      }
    } else {
      // Also pick up numbered / bullet tip lines anywhere
      if (/^(\d+[\.\)]\s+|[-•*]\s+)/.test(trimmed)) {
        const clean = trimmed.replace(/^(\d+[\.\)]\s+|[-•*]\s+)/, "").trim();
        if (/tip|save|budget|cheap|discount|free|avoid|book|early|pack/i.test(clean)) {
          tips.push(clean);
        }
      }
    }
  }
  return tips.slice(0, 10);
}

// ════════════════════════════════════════════════════════════
//  DESTINATION RECOMMENDER
// ════════════════════════════════════════════════════════════
async function recommendDestinations() {
  const destType   = document.getElementById("rec-type")?.value;
  const budget     = document.getElementById("rec-budget")?.value;
  const days       = document.getElementById("rec-days")?.value;
  const travelers  = document.getElementById("rec-travelers")?.value;
  const interests  = document.getElementById("rec-interests")?.value.trim() || "culture, food, sightseeing";
  const style      = document.getElementById("rec-style")?.value;
  const season     = document.getElementById("rec-season")?.value;

  setLoading(true, "recommend");
  disableForm("recommend");

  try {
    const res = await fetch("/api/recommend-destinations", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        destination_type: destType,
        budget,
        days,
        travelers,
        interests,
        travel_style: style,
        season,
      }),
    });
    const data = await res.json();
    setLoading(false, "recommend");
    enableForm("recommend");

    if (data.error) { showToast(`Error: ${data.error}`, "error"); return; }

    // Store raw text
    const rawEl = document.getElementById("recRawText");
    if (rawEl) rawEl.textContent = data.recommendations;

    // Full AI report collapse
    const fullEl = document.getElementById("recFullContent");
    if (fullEl) fullEl.innerHTML = formatMarkdown(data.recommendations);

    // Meta bar
    const badge  = document.getElementById("recQueryBadge");
    const meta   = document.getElementById("recMetaText");
    if (badge) badge.textContent = `✈ ${destType}`;
    if (meta)  meta.textContent  = `${days} · ${travelers} · ${season}`;

    // Render destination cards
    renderRecommendCards(data.recommendations, destType);

    document.getElementById("recResults").classList.remove("d-none");
    document.getElementById("recResults").scrollIntoView({ behavior: "smooth", block: "start" });
    showToast("Your top destinations are ready! 🌍", "success");
  } catch (err) {
    setLoading(false, "recommend");
    enableForm("recommend");
    showToast("Server error. Is the Flask app running?", "error");
    console.error(err);
  }
}

// ─ Destination card renderer ─────────────────────────────────
function renderRecommendCards(text, queryType) {
  const container = document.getElementById("recDestCards");
  if (!container) return;

  // ── Split text into per-destination blocks ──────────────
  // Each block starts at "## " or "## 🌍 Destination"
  const blocks = text.split(/(?=^##\s)/m).filter(b => b.trim().length > 0);

  // Filter only destination blocks (skip comparison / top-pick sections)
  const destBlocks = blocks.filter(b =>
    /destination\s*\d*\s*:/i.test(b) || /^##\s+🌍/i.test(b)
  ).slice(0, 3);

  if (destBlocks.length === 0) {
    // Fallback: no structured blocks found — show as formatted text
    container.innerHTML = `
      <div class="col-12">
        <div class="content-card p-4">
          <div class="result-content">${formatMarkdown(text)}</div>
        </div>
      </div>`;
    return;
  }

  // ── Parse a single destination block ──────────────────────
  function parseBlock(raw) {
    const lines = raw.split("\n");

    // Destination name from the ## heading
    const headLine   = lines.find(l => /^##\s/.test(l)) || "";
    const nameMatch  = headLine.replace(/^#+\s*/, "").replace(/destination\s*\d*\s*:\s*/i, "").replace(/🌍/g, "").trim();
    const name       = nameMatch || "Destination";

    // Helper: extract text after a bold label
    function after(label) {
      const re   = new RegExp(`\\*\\*${label}[^*]*\\*\\*[:\\s]*(.+)`, "i");
      const line = lines.find(l => re.test(l));
      return line ? line.replace(re, "$1").replace(/\*\*/g, "").trim() : "";
    }

    // Helper: extract a bullet list section
    function bulletList(label) {
      const startRe = new RegExp(`\\*\\*${label}[^*]*\\*\\*`, "i");
      let idx = lines.findIndex(l => startRe.test(l));
      if (idx === -1) return [];
      const items = [];
      for (let i = idx + 1; i < lines.length; i++) {
        const l = lines[i].trim();
        if (!l) continue;
        if (/^\*\*/.test(l) && !l.startsWith("- ") && !l.startsWith("* ")) break;
        if (/^[-*•]\s+/.test(l)) items.push(l.replace(/^[-*•]\s+/, "").replace(/\*\*/g, "").trim());
      }
      return items;
    }

    // Helper: extract rating number
    function rating(label) {
      const re   = new RegExp(`\\*\\*${label}[^*]*\\*\\*[:\\s]*([\\d.]+)\\s*/\\s*10`, "i");
      const line = lines.find(l => re.test(l));
      if (line) { const m = line.match(re); return m ? m[1] : null; }
      // fallback: look for "X/10" anywhere on any line containing the label keyword
      const kw   = label.split(/\s/)[0].toLowerCase();
      const fb   = lines.find(l => l.toLowerCase().includes(kw) && /\d+\s*\/\s*10/.test(l));
      if (fb) { const m = fb.match(/(\d+)\s*\/\s*10/); return m ? m[1] : null; }
      return null;
    }

    return {
      name,
      why:         after("Why Visit"),
      bestTime:    after("Best Time to Visit"),
      budget:      after("Estimated Budget"),
      attractions: bulletList("Top Attractions"),
      foods:       bulletList("Local Foods"),
      safety:      rating("Safety"),
      family:      rating("Family Friendly"),
      adventure:   rating("Adventure"),
      score:       rating("Final Recommendation"),
    };
  }

  // ── Render rating value with colour class ─────────────────
  function ratingClass(val) {
    const n = parseFloat(val);
    if (isNaN(n))  return "score-mid";
    if (n >= 8)    return "score-high";
    if (n >= 6)    return "score-mid";
    return "score-low";
  }

  // ── Stars display ─────────────────────────────────────────
  function starsHtml(val) {
    const n = Math.round(parseFloat(val) / 2);
    if (isNaN(n)) return "";
    return "★".repeat(Math.min(n, 5)) + "☆".repeat(Math.max(0, 5 - n));
  }

  // ── Build card HTML ───────────────────────────────────────
  function buildCard(dest, idx) {
    const colorClass = `rec-card-${idx}`;

    const attractionsHtml = dest.attractions.slice(0, 5).map(a =>
      `<div class="rec-list-item"><i class="fa-solid fa-location-dot"></i><span>${escapeHtml(a)}</span></div>`
    ).join("") || '<div class="rec-list-item text-muted">See full report</div>';

    const foodsHtml = dest.foods.slice(0, 3).map(f =>
      `<div class="rec-list-item"><i class="fa-solid fa-utensils"></i><span>${escapeHtml(f)}</span></div>`
    ).join("") || '<div class="rec-list-item text-muted">See full report</div>';

    const safetyVal    = dest.safety    || "—";
    const familyVal    = dest.family    || "—";
    const adventureVal = dest.adventure || "—";
    const scoreVal     = dest.score     || "—";
    const scoreNum     = dest.score ? `${dest.score}/10` : "—";

    return `
      <div class="col-lg-4 col-md-6 animate__animated animate__fadeInUp" style="animation-delay:${idx * 0.12}s">
        <div class="rec-dest-card ${colorClass}">

          <!-- Card Header -->
          <div class="rec-card-head">
            <div class="rec-card-num">${idx + 1}</div>
            <div class="flex-grow-1 overflow-hidden">
              <div class="rec-card-title">${escapeHtml(dest.name)}</div>
              <div class="rec-card-subtitle">Destination #${idx + 1}</div>
            </div>
            <div class="rec-score-badge">
              <span class="rec-score-val ${ratingClass(scoreVal)}">${scoreNum}</span>
              Score
            </div>
          </div>

          <!-- Card Body -->
          <div class="rec-card-body">

            <!-- Why visit -->
            ${dest.why ? `<div class="rec-why">${escapeHtml(dest.why)}</div>` : ""}

            <!-- Budget & Best Time pills -->
            <div class="rec-meta-row">
              ${dest.budget   ? `<span class="rec-meta-pill"><i class="fa-solid fa-indian-rupee-sign"></i>${escapeHtml(dest.budget)}</span>` : ""}
              ${dest.bestTime ? `<span class="rec-meta-pill"><i class="fa-solid fa-calendar-days"></i>${escapeHtml(dest.bestTime)}</span>` : ""}
            </div>

            <!-- Attractions -->
            <div>
              <div class="rec-list-label"><i class="fa-solid fa-star me-1"></i>Top Attractions</div>
              <div class="rec-list">${attractionsHtml}</div>
            </div>

            <!-- Local Foods -->
            <div>
              <div class="rec-list-label"><i class="fa-solid fa-bowl-food me-1"></i>Local Foods</div>
              <div class="rec-list">${foodsHtml}</div>
            </div>

            <!-- Ratings -->
            <div class="rec-ratings">
              <div class="rec-rating-box">
                <div class="rec-rating-label">Safety</div>
                <div class="rec-rating-val ${ratingClass(safetyVal)}">${safetyVal !== "—" ? safetyVal + "/10" : "—"}</div>
                <div class="rec-rating-stars">${starsHtml(safetyVal)}</div>
              </div>
              <div class="rec-rating-box">
                <div class="rec-rating-label">Family</div>
                <div class="rec-rating-val ${ratingClass(familyVal)}">${familyVal !== "—" ? familyVal + "/10" : "—"}</div>
                <div class="rec-rating-stars">${starsHtml(familyVal)}</div>
              </div>
              <div class="rec-rating-box">
                <div class="rec-rating-label">Adventure</div>
                <div class="rec-rating-val ${ratingClass(adventureVal)}">${adventureVal !== "—" ? adventureVal + "/10" : "—"}</div>
                <div class="rec-rating-stars">${starsHtml(adventureVal)}</div>
              </div>
            </div>

          </div><!-- end rec-card-body -->

          <!-- Footer CTA -->
          <div class="rec-card-footer">
            <button class="btn-rec-plan" onclick="sendQuickMessage('Plan a detailed trip to ${dest.name.replace(/'/g, "\\'")}')">
              <i class="bi bi-map-fill me-2"></i>Plan a Trip to ${escapeHtml(dest.name)}
            </button>
          </div>

        </div><!-- end rec-dest-card -->
      </div>`;
  }

  container.innerHTML = destBlocks
    .map((block, i) => buildCard(parseBlock(block), i))
    .join("");
}

// ════════════════════════════════════════════════════════════
//  PACKING LIST
// ════════════════════════════════════════════════════════════
async function generatePackingList() {
  const dest       = document.getElementById("pack-dest")?.value.trim();
  const duration   = document.getElementById("pack-duration")?.value;
  const season     = document.getElementById("pack-season")?.value;
  const weather    = document.getElementById("pack-weather")?.value.trim();
  const style      = document.getElementById("pack-style")?.value;
  const type       = document.getElementById("pack-type")?.value;
  const activities = document.getElementById("pack-activities")?.value.trim();

  if (!dest) { showToast("Please enter a destination", "warning"); return; }

  setLoading(true, "packing");
  disableForm("packing");

  try {
    const res = await fetch("/api/packing-list", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        destination: dest, duration, season, weather,
        travel_style: style, travel_type: type, activities,
      }),
    });
    const data = await res.json();
    setLoading(false, "packing");
    enableForm("packing");

    if (data.error) { showToast(`Error: ${data.error}`, "error"); return; }

    // Store raw
    const rawEl = document.getElementById("packRawText");
    if (rawEl) rawEl.textContent = data.packing_list;

    // Full report
    const fullEl = document.getElementById("packingContent");
    if (fullEl) fullEl.innerHTML = formatMarkdown(data.packing_list);

    // Meta bar
    const badge = document.getElementById("packDestBadge");
    const meta  = document.getElementById("packMetaText");
    if (badge) badge.textContent = `🎒 ${dest}`;
    if (meta)  meta.textContent  = `${duration} · ${season} · ${type}`;

    // Render interactive dashboard
    renderPackingDashboard(data.packing_list, dest);

    document.getElementById("packingDashboard").classList.remove("d-none");
    document.getElementById("packingDashboard").scrollIntoView({ behavior: "smooth", block: "start" });
    showToast("Smart packing list ready! 🎒", "success");
  } catch (err) {
    setLoading(false, "packing");
    enableForm("packing");
    showToast("Server error. Is the Flask app running?", "error");
    console.error(err);
  }
}

// ─ Export packing list ───────────────────────────────────────
function exportPackingList() {
  const raw = document.getElementById("packRawText")?.textContent;
  if (!raw) { showToast("Generate a packing list first", "warning"); return; }
  const dest = document.getElementById("pack-dest")?.value.trim() || "trip";
  const blob = new Blob([raw], { type: "text/plain" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `packing-list-${dest.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Packing list exported!", "success");
}

// ════════════════════════════════════════════════════════════
//  PACKING DASHBOARD RENDERER
// ════════════════════════════════════════════════════════════

// Track check state globally per session
const PACK_STATE = {};  // { itemId: boolean }
let PACK_TOTAL_ITEMS = 0;

function renderPackingDashboard(text, dest) {
  PACK_TOTAL_ITEMS = 0;

  // ── Category definitions ─────────────────────────────────
  const CATEGORIES = [
    { key: "clothes",     re: /##\s*(👕|Clothes|Clothing)/i,     icon: "fa-shirt",         iconCls: "icon-clothes",     cardCls: "pack-cat-clothes",     label: "Clothes"       },
    { key: "shoes",       re: /##\s*(👟|Shoes|Footwear)/i,       icon: "fa-shoe-prints",   iconCls: "icon-shoes",       cardCls: "pack-cat-shoes",       label: "Shoes"         },
    { key: "electronics", re: /##\s*(📱|Electronics|Gadgets)/i,  icon: "fa-mobile-screen", iconCls: "icon-electronics", cardCls: "pack-cat-electronics", label: "Electronics"   },
    { key: "medicines",   re: /##\s*(💊|Medicines|Health|Medical)/i, icon: "fa-kit-medical", iconCls: "icon-medicines",  cardCls: "pack-cat-medicines",   label: "Medicines"     },
    { key: "documents",   re: /##\s*(📄|Documents|Money)/i,      icon: "fa-passport",      iconCls: "icon-documents",   cardCls: "pack-cat-documents",   label: "Documents"     },
    { key: "accessories", re: /##\s*(🎒|Accessories|Bags)/i,     icon: "fa-bag-shopping",  iconCls: "icon-accessories", cardCls: "pack-cat-accessories", label: "Accessories"   },
    { key: "emergency",   re: /##\s*(🆘|Emergency)/i,            icon: "fa-kit-medical",   iconCls: "icon-emergency",   cardCls: "pack-cat-emergency",   label: "Emergency Kit" },
    { key: "essentials",  re: /##\s*(🧳|Travel Essentials|Essentials)/i, icon: "fa-suitcase", iconCls: "icon-essentials", cardCls: "pack-cat-essentials", label: "Essentials" },
  ];

  const lines = text.split("\n");

  // ── Extract items for a category block ───────────────────
  function extractCategoryItems(catRe, nextRes) {
    let start = -1;
    for (let i = 0; i < lines.length; i++) {
      if (catRe.test(lines[i])) { start = i; break; }
    }
    if (start === -1) return [];
    let end = lines.length;
    for (const nRe of nextRes) {
      for (let i = start + 1; i < lines.length; i++) {
        if (nRe.test(lines[i]) && i < end) { end = i; break; }
      }
    }
    const items = [];
    for (let i = start + 1; i < end; i++) {
      const l = lines[i].trim();
      // Match: - [ ] [MUST/OPT] Item text — note
      if (/^-\s*\[[ x]\]/.test(l)) {
        const isMust = /\[MUST\]/i.test(l);
        const isOpt  = /\[OPT\]/i.test(l);
        // Strip checkbox + priority tag
        let raw = l.replace(/^-\s*\[[ x]\]\s*/, "")
                   .replace(/\[(MUST|OPT)\]\s*/gi, "")
                   .trim();
        // Split on " — " for note
        const dashIdx = raw.indexOf(" — ");
        const itemText = dashIdx !== -1 ? raw.slice(0, dashIdx).trim() : raw;
        const itemNote = dashIdx !== -1 ? raw.slice(dashIdx + 3).trim() : "";
        if (itemText) items.push({ text: itemText, note: itemNote, must: isMust, opt: isOpt });
      }
    }
    return items;
  }

  // ── Build category cards ─────────────────────────────────
  const cardsEl = document.getElementById("packCategoryCards");
  const navEl   = document.getElementById("packCatNav");
  if (!cardsEl || !navEl) return;

  cardsEl.innerHTML = "";
  navEl.innerHTML   = "";

  const catItemData = {};

  for (let ci = 0; ci < CATEGORIES.length; ci++) {
    const cat   = CATEGORIES[ci];
    const nextRes = CATEGORIES.slice(ci + 1).map(c => c.re)
      .concat([/^---/, /^##\s+⭐/, /^##\s+💡/, /^##\s+❌/, /^##\s+📊/]);

    const items = extractCategoryItems(cat.re, nextRes);
    catItemData[cat.key] = items;

    if (items.length === 0) continue;

    PACK_TOTAL_ITEMS += items.length;

    // Nav pill
    const pill = document.createElement("button");
    pill.className  = "pack-cat-pill";
    pill.id         = `packPill-${cat.key}`;
    pill.innerHTML  = `<i class="fa-solid ${cat.icon}"></i>${cat.label}<span class="pack-pill-count" id="packPillCount-${cat.key}">${items.length}</span>`;
    pill.addEventListener("click", () => scrollToPackCat(cat.key));
    navEl.appendChild(pill);

    // Card
    const mustItems = items.filter(i => i.must);
    const optItems  = items.filter(i => !i.must);
    const itemsHtml = items.map((item, idx) => {
      const id = `pack-item-${cat.key}-${idx}`;
      PACK_STATE[id] = false;
      return `
        <div class="pack-check-item" id="${id}" onclick="togglePackItem('${id}')">
          <div class="pack-checkbox"></div>
          <div class="flex-grow-1">
            <div class="pack-item-text">${escapeHtml(item.text)}</div>
            ${item.note ? `<div class="pack-item-note">${escapeHtml(item.note)}</div>` : ""}
          </div>
          ${item.must ? `<span class="pack-badge must">Must</span>` : ""}
          ${(item.opt && !item.must) ? `<span class="pack-badge opt">Optional</span>` : ""}
        </div>`;
    }).join("");

    cardsEl.insertAdjacentHTML("beforeend", `
      <div class="col-md-6 col-lg-4">
        <div class="pack-cat-card ${cat.cardCls}" id="packCat-${cat.key}">
          <div class="pack-cat-head">
            <div class="pack-cat-icon ${cat.iconCls}"><i class="fa-solid ${cat.icon}"></i></div>
            <div class="pack-cat-title">${cat.label}</div>
            <div class="pack-cat-counter" id="packCatCount-${cat.key}">${mustItems.length} must · ${optItems.length} opt</div>
          </div>
          <div class="pack-checklist">${itemsHtml}</div>
        </div>
      </div>`);
  }

  // ── Must Carry list ───────────────────────────────────────
  const mustSectionRe   = /##\s+(⭐|Must Carry)/i;
  const mustEndRes      = [/##\s+(💡|Optional)/i, /##\s+(❌|Don't Pack)/i, /##\s+(📊|Packing Priority)/i];
  renderPackSection(
    lines, mustSectionRe, mustEndRes,
    "mustCarryList",
    (num, text, note) => `<li><strong>${escapeHtml(text)}</strong>${note ? ` <span>— ${escapeHtml(note)}</span>` : ""}</li>`
  );

  // ── Optional list ─────────────────────────────────────────
  const optSectionRe  = /##\s+(💡|Optional Items)/i;
  const optEndRes     = [/##\s+(❌|Don't Pack)/i, /##\s+(📊|Packing Priority)/i, /##\s+(💡 Smart Packing)/i];
  renderPackSection(
    lines, optSectionRe, optEndRes,
    "optionalList",
    (num, text, note) => `<li>${escapeHtml(text)}${note ? ` <span>— ${escapeHtml(note)}</span>` : ""}</li>`
  );

  // ── Don't Pack list ───────────────────────────────────────
  const dontSectionRe = /##\s+(❌|Don't Pack)/i;
  const dontEndRes    = [/##\s+(📊|Packing Priority)/i, /##\s+(💡 Smart)/i];
  const dontItems     = extractBulletSection(lines, dontSectionRe, dontEndRes);
  const dontEl        = document.getElementById("dontPackList");
  const dontPanel     = document.getElementById("dontPackPanel");
  if (dontEl && dontItems.length > 0) {
    dontEl.innerHTML = dontItems.map(i => {
      const parts = i.split(/\s+[—–-]\s+/);
      return `<li><strong>${escapeHtml(parts[0] || i)}</strong>${parts[1] ? ` <span>— ${escapeHtml(parts[1])}</span>` : ""}</li>`;
    }).join("");
    dontPanel?.classList.remove("d-none");
  }

  // ── Smart Packing Tips accordion ─────────────────────────
  const tipsSectionRe = /##\s+(💡 Smart Packing Tips|Smart Packing Tips)/i;
  const tipsEndRes    = [/^---/, /^##\s+[^💡]/];
  const tipItems      = extractBulletSection(lines, tipsSectionRe, tipsEndRes);
  const tipsAccordion = document.getElementById("packTipsAccordion");
  const tipsPanel     = document.getElementById("packTipsPanel");
  if (tipsAccordion && tipItems.length > 0) {
    const TIP_ICONS = ["fa-sun", "fa-bag-shopping", "fa-scale-balanced", "fa-shield", "fa-store"];
    tipsAccordion.innerHTML = tipItems.map((tip, i) => {
      const parts = tip.split(/[:–—-](.+)/s);
      const title = parts[0]?.trim() || tip;
      const body  = parts[1]?.trim() || "";
      return `
        <div class="accordion-item">
          <h2 class="accordion-header">
            <button class="accordion-button ${i > 0 ? "collapsed" : ""}" type="button"
              data-bs-toggle="collapse" data-bs-target="#packTip${i}">
              <span class="tip-accordion-icon me-2"><i class="fa-solid ${TIP_ICONS[i % TIP_ICONS.length]}"></i></span>
              ${escapeHtml(title)}
            </button>
          </h2>
          <div id="packTip${i}" class="accordion-collapse collapse ${i === 0 ? "show" : ""}">
            <div class="accordion-body">${body ? escapeHtml(body) : escapeHtml(title)}</div>
          </div>
        </div>`;
    }).join("");
    tipsPanel?.classList.remove("d-none");
  }

  // ── Initialise progress bar ───────────────────────────────
  updatePackProgress();
}

// ─ Toggle a packing item checked state ───────────────────────
function togglePackItem(id) {
  PACK_STATE[id] = !PACK_STATE[id];
  const el = document.getElementById(id);
  if (el) el.classList.toggle("checked", PACK_STATE[id]);
  updatePackProgress();
}

// ─ Update overall progress counter + bar ────────────────────
function updatePackProgress() {
  const checked = Object.values(PACK_STATE).filter(Boolean).length;
  const total   = Object.keys(PACK_STATE).length;
  const pct     = total > 0 ? Math.round((checked / total) * 100) : 0;

  const bar   = document.getElementById("packOverallBar");
  const label = document.getElementById("packProgressLabel");
  if (bar)   bar.style.width = pct + "%";
  if (label) label.textContent = `${checked} / ${total} packed (${pct}%)`;
}

// ─ Helper: render a numbered-list section to a target element ─
function renderPackSection(lines, sectionRe, endRes, targetId, rowFn) {
  const el = document.getElementById(targetId);
  if (!el) return;
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (sectionRe.test(lines[i])) { start = i; break; }
  }
  if (start === -1) return;
  let end = lines.length;
  for (const nRe of endRes) {
    for (let i = start + 1; i < lines.length; i++) {
      if (nRe.test(lines[i]) && i < end) { end = i; break; }
    }
  }
  const items = [];
  for (let i = start + 1; i < end; i++) {
    const l = lines[i].trim();
    if (/^\d+\.\s+/.test(l) || /^[-*•]\s+/.test(l)) {
      const raw   = l.replace(/^(\d+\.\s+|[-*•]\s+)/, "").replace(/\*\*/g, "").trim();
      const dash  = raw.indexOf(" — ");
      const text  = dash !== -1 ? raw.slice(0, dash).trim() : raw;
      const note  = dash !== -1 ? raw.slice(dash + 3).trim() : "";
      if (text) items.push({ text, note });
    }
  }
  if (items.length > 0) {
    el.innerHTML = items.map((it, i) => rowFn(i + 1, it.text, it.note)).join("");
  }
}

// ─ Helper: extract bullet list items from a section ──────────
function extractBulletSection(lines, sectionRe, endRes) {
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (sectionRe.test(lines[i])) { start = i; break; }
  }
  if (start === -1) return [];
  let end = lines.length;
  for (const nRe of endRes) {
    for (let i = start + 1; i < lines.length; i++) {
      if (nRe.test(lines[i]) && i < end) { end = i; break; }
    }
  }
  const items = [];
  for (let i = start + 1; i < end; i++) {
    const l = lines[i].trim();
    if (/^(\d+\.\s+|[-*•]\s+)/.test(l)) {
      items.push(l.replace(/^(\d+\.\s+|[-*•]\s+)/, "").replace(/\*\*/g, "").trim());
    }
  }
  return items;
}

// ─ Scroll to a category card ─────────────────────────────────
function scrollToPackCat(key) {
  document.getElementById(`packCat-${key}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
}


// ════════════════════════════════════════════════════════════
//  HOTEL ADVISOR
// ════════════════════════════════════════════════════════════
async function recommendHotels() {
  const dest      = document.getElementById("hotel-dest")?.value.trim();
  const budget    = document.getElementById("hotel-budget")?.value;
  const travelers = document.getElementById("hotel-travelers")?.value;
  const style     = document.getElementById("hotel-style")?.value;
  const room      = document.getElementById("hotel-room")?.value;
  const stars     = document.getElementById("hotel-stars")?.value;
  const checkIn   = document.getElementById("hotel-checkin")?.value;
  const checkOut  = document.getElementById("hotel-checkout")?.value;

  if (!dest) { showToast("Please enter a destination", "warning"); return; }

  setLoading(true, "hotel");
  disableForm("hotel");

  try {
    const res = await fetch("/api/hotel-advisor", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        destination:      dest,
        budget_per_night: budget,
        travelers:        travelers,
        travel_style:     style,
        room_type:        room,
        star_preference:  stars,
        check_in:         checkIn,
        check_out:        checkOut,
      }),
    });
    const data = await res.json();
    setLoading(false, "hotel");
    enableForm("hotel");

    if (data.error) { showToast(`Error: ${data.error}`, "error"); return; }

    // Store raw text for export / copy
    const rawEl = document.getElementById("hotelRawText");
    if (rawEl) rawEl.textContent = data.hotels;

    // Full AI report collapse
    const fullEl = document.getElementById("hotelFullContent");
    if (fullEl) fullEl.innerHTML = formatMarkdown(data.hotels);

    // Meta bar
    const badge = document.getElementById("hotelDestBadge");
    const meta  = document.getElementById("hotelMetaText");
    if (badge) badge.textContent = `🏨 ${dest}`;
    if (meta)  meta.textContent  = `${budget} · ${travelers} · ${style}`;

    renderHotelDashboard(data.hotels, dest);

    document.getElementById("hotelDashboard").classList.remove("d-none");
    document.getElementById("hotelDashboard").scrollIntoView({ behavior: "smooth", block: "start" });
    showToast("Hotels found! Ready to book? 🏨", "success");
  } catch (err) {
    setLoading(false, "hotel");
    enableForm("hotel");
    showToast("Server error. Is the Flask app running?", "error");
    console.error(err);
  }
}

// ─ Export hotel report as text file ─────────────────────────
function exportHotelReport() {
  const raw = document.getElementById("hotelRawText")?.textContent;
  if (!raw) { showToast("Generate a hotel report first", "warning"); return; }
  const dest = document.getElementById("hotel-dest")?.value.trim() || "hotels";
  const blob = new Blob([raw], { type: "text/plain" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `hotel-report-${dest.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Hotel report exported!", "success");
}

// ════════════════════════════════════════════════════════════
//  HOTEL DASHBOARD RENDERER
// ════════════════════════════════════════════════════════════
function renderHotelDashboard(text, dest) {
  const cardsEl = document.getElementById("hotelCards");
  if (!cardsEl) return;
  cardsEl.innerHTML = "";

  // ── Split text into per-hotel blocks on --- separators ─────
  const rawBlocks = text.split(/^---+$/m).map(b => b.trim()).filter(Boolean);

  // Keep only blocks that start with a ## 🏨 Hotel heading
  const hotelBlocks = rawBlocks.filter(b => /^##\s+🏨\s+Hotel\s+\d+/i.test(b));

  if (hotelBlocks.length === 0) {
    // Fallback: render formatted markdown
    cardsEl.innerHTML = `<div class="col-12"><div class="content-card p-4">${formatMarkdown(text)}</div></div>`;
  } else {
    hotelBlocks.forEach((block, idx) => {
      cardsEl.insertAdjacentHTML("beforeend", buildHotelCard(block, idx));
    });
  }

  // ── Top picks panel ────────────────────────────────────────
  renderHotelTopPicks(text);

  // ── Booking tips accordion ─────────────────────────────────
  renderHotelBookingTips(text);
}

// ─ Build one hotel card from a text block ───────────────────
function buildHotelCard(block, idx) {
  const lines = block.split(/\n/);

  // ── Helper: extract field value ──────────────────────────
  function field(re) {
    const line = lines.find(l => re.test(l));
    if (!line) return "";
    return line.replace(re, "").replace(/\*\*/g, "").trim();
  }

  // ── Header line: ## 🏨 Hotel N: [Name] ──────────────────
  const headerLine = lines.find(l => /^##\s+🏨\s+Hotel\s+\d+/i.test(l)) || "";
  const nameMatch  = headerLine.match(/Hotel\s+\d+:\s+(.+)/i);
  const hotelName  = nameMatch ? nameMatch[1].trim() : `Hotel ${idx + 1}`;

  // ── Key fields ────────────────────────────────────────────
  const starRaw    = field(/\*\*Star Rating\*\*\s*[:\-–]/i);
  const price      = field(/\*\*Price Per Night\*\*\s*[:\-–]/i);
  const location   = field(/\*\*Location\s*[/\/]?\s*Area\*\*\s*[:\-–]/i);
  const distances  = field(/\*\*Distance from Key Attractions\*\*\s*[:\-–]/i);
  const bestFor    = field(/\*\*Best For\*\*\s*[:\-–]/i);

  // ── Score line: ⭐ Overall Recommendation Score: X.X/10 ──
  const scoreLine  = lines.find(l => /Overall Recommendation Score/i.test(l)) || "";
  const scoreMatch = scoreLine.match(/([\d.]+)\s*\/\s*10/);
  const score      = scoreMatch ? parseFloat(scoreMatch[1]) : null;

  // ── Star count from star rating field ─────────────────────
  const starCount  = (starRaw.match(/⭐/g) || []).length || parseInt(starRaw) || 0;
  const starsHtml  = "⭐".repeat(Math.min(starCount, 5)) || starRaw.slice(0, 12);

  // ── Verdict ───────────────────────────────────────────────
  const verdictLine = lines.find(l => /\*\*Verdict\*\*\s*[:\-–]/i.test(l)) || "";
  const verdict     = verdictLine.replace(/\*\*Verdict\*\*\s*[:\-–]/i, "").replace(/\*\*/g, "").trim();

  // ── Facilities ────────────────────────────────────────────
  const FAC_MAP = [
    { re: /\*\*WiFi\*\*/i,               icon: "fa-wifi",       label: "WiFi"      },
    { re: /\*\*Parking\*\*/i,            icon: "fa-square-parking", label: "Parking" },
    { re: /\*\*Swimming Pool\*\*/i,      icon: "fa-water-ladder",   label: "Pool"    },
    { re: /\*\*Restaurant\*\*/i,         icon: "fa-utensils",   label: "Restaurant" },
    { re: /\*\*Air Conditioning\*\*/i,   icon: "fa-snowflake",  label: "AC"        },
    { re: /\*\*Breakfast Included\*\*/i, icon: "fa-mug-saucer", label: "Breakfast" },
    { re: /\*\*Gym\s*[/\/]?\s*Fitness\*\*/i, icon: "fa-dumbbell", label: "Gym"    },
    { re: /\*\*Spa\s*&?\s*Wellness\*\*/i,    icon: "fa-spa",      label: "Spa"    },
  ];

  const facHtml = FAC_MAP.map(f => {
    const fl = lines.find(l => f.re.test(l)) || "";
    const val = fl.replace(f.re, "").replace(/\*\*/g, "").replace(/^[\s:\-–]+/, "").trim();
    const yes = val && !/^(no|not available|lobby only|n\/a)/i.test(val);
    return `
      <div class="hotel-fac-item ${yes ? "fac-yes" : "fac-no"}">
        <i class="fa-solid ${f.icon}"></i>
        <span>${f.label}</span>
      </div>`;
  }).join("");

  // ── Pros ──────────────────────────────────────────────────
  let inPros = false, inCons = false;
  const pros = [], cons = [];
  for (const l of lines) {
    if (/###\s+👍\s+Pros/i.test(l))  { inPros = true;  inCons = false; continue; }
    if (/###\s+👎\s+Cons/i.test(l))  { inCons = true;  inPros = false; continue; }
    if (/###\s+/.test(l) && (inPros || inCons)) { inPros = false; inCons = false; }
    if (inPros && /^\d+\.\s+|^[-*•]\s+/.test(l.trim())) {
      pros.push(l.trim().replace(/^(\d+\.\s+|[-*•]\s+)/, "").replace(/\*\*/g, "").trim());
    }
    if (inCons && /^\d+\.\s+|^[-*•]\s+/.test(l.trim())) {
      cons.push(l.trim().replace(/^(\d+\.\s+|[-*•]\s+)/, "").replace(/\*\*/g, "").trim());
    }
  }

  const prosHtml = pros.slice(0, 4).map(p => `<li>${escapeHtml(p)}</li>`).join("") || "<li>See full report</li>";
  const consHtml = cons.slice(0, 3).map(c => `<li>${escapeHtml(c)}</li>`).join("") || "<li>See full report</li>";

  // ── Insider tip ───────────────────────────────────────────
  let inTip = false;
  const tips = [];
  for (const l of lines) {
    if (/###\s+💡\s+Insider Tips/i.test(l)) { inTip = true; continue; }
    if (/###\s+/.test(l) && inTip)           { inTip = false; }
    if (inTip && /^[-*•]\s+/.test(l.trim())) {
      tips.push(l.trim().replace(/^[-*•]\s+/, "").replace(/\*\*/g, "").trim());
    }
  }
  const insiderHtml = tips.length
    ? `<div class="hotel-insider-tip"><i class="fa-solid fa-lightbulb me-2"></i>${escapeHtml(tips[0])}</div>`
    : "";

  // ── Score ring colour ─────────────────────────────────────
  const scoreColor = score === null ? "#94a3b8"
    : score >= 8.5 ? "#059669"
    : score >= 7   ? "#f59e0b"
    : "#ef4444";

  const scoreHtml = score !== null
    ? `<div class="hotel-score-ring" style="--ring-color:${scoreColor}">
         <span class="hotel-score-val">${score.toFixed(1)}</span>
         <span class="hotel-score-lbl">/ 10</span>
       </div>`
    : "";

  return `
    <div class="col-md-6 col-xl-6">
      <div class="hotel-card hotel-card-${idx % 4}">
        <div class="hotel-card-top">
          <div class="hotel-name-row">
            <div>
              <div class="hotel-name">${escapeHtml(hotelName)}</div>
              <div class="hotel-stars">${starsHtml}</div>
            </div>
            ${scoreHtml}
          </div>
          <div class="hotel-meta-row">
            ${location ? `<span class="hotel-meta-pill"><i class="fa-solid fa-location-dot me-1"></i>${escapeHtml(location)}</span>` : ""}
            ${price    ? `<span class="hotel-meta-pill price-pill"><i class="fa-solid fa-tag me-1"></i>${escapeHtml(price)}</span>` : ""}
            ${bestFor  ? `<span class="hotel-meta-pill"><i class="fa-solid fa-users me-1"></i>${escapeHtml(bestFor)}</span>` : ""}
          </div>
        </div>

        <div class="hotel-fac-grid">${facHtml}</div>

        <div class="hotel-proscons">
          <div class="hotel-pros-col">
            <div class="hotel-pc-head pros-head"><i class="fa-solid fa-thumbs-up me-1"></i>Pros</div>
            <ul class="hotel-pros-list">${prosHtml}</ul>
          </div>
          <div class="hotel-cons-col">
            <div class="hotel-pc-head cons-head"><i class="fa-solid fa-thumbs-down me-1"></i>Cons</div>
            <ul class="hotel-cons-list">${consHtml}</ul>
          </div>
        </div>

        ${insiderHtml}
        ${verdict ? `<div class="hotel-verdict">${escapeHtml(verdict)}</div>` : ""}
      </div>
    </div>`;
}

// ─ Render "Our Top Pick" panel ───────────────────────────────
function renderHotelTopPicks(text) {
  const panel   = document.getElementById("hotelTopPicks");
  const content = document.getElementById("hotelTopPicksContent");
  if (!panel || !content) return;

  const lines     = text.split(/\n/);
  const pickStart = lines.findIndex(l => /##\s+🎯\s+Our Top Pick/i.test(l));
  if (pickStart === -1) return;

  const pickEnd = lines.findIndex((l, i) => i > pickStart && /^##\s+/.test(l));
  const pickLines = lines.slice(pickStart + 1, pickEnd === -1 ? pickStart + 10 : pickEnd);

  const PICK_ICONS = {
    "Best Overall":  { icon: "fa-trophy",       cls: "pick-overall"  },
    "Best Budget":   { icon: "fa-piggy-bank",    cls: "pick-budget"   },
    "Best Luxury":   { icon: "fa-gem",           cls: "pick-luxury"   },
    "Best for Families": { icon: "fa-people-roof", cls: "pick-family" },
    "Best Value":    { icon: "fa-star",          cls: "pick-value"    },
  };

  const picks = [];
  for (const l of pickLines) {
    const m = l.match(/\*\*(.+?)\*\*\s*[:\-–]\s*(.+)/);
    if (m) picks.push({ label: m[1].trim(), reason: m[2].replace(/\*\*/g, "").trim() });
  }

  if (picks.length === 0) return;

  content.innerHTML = picks.map(p => {
    const meta = PICK_ICONS[p.label] || { icon: "fa-hotel", cls: "pick-overall" };
    return `
      <div class="col-md-4">
        <div class="hotel-pick-card ${meta.cls}">
          <div class="pick-icon-wrap"><i class="fa-solid ${meta.icon}"></i></div>
          <div class="pick-label">${escapeHtml(p.label)}</div>
          <div class="pick-reason">${escapeHtml(p.reason)}</div>
        </div>
      </div>`;
  }).join("");

  panel.classList.remove("d-none");
}

// ─ Render booking tips accordion ────────────────────────────
function renderHotelBookingTips(text) {
  const panel     = document.getElementById("hotelBookingTips");
  const accordion = document.getElementById("hotelTipsAccordion");
  if (!panel || !accordion) return;

  const lines     = text.split(/\n/);
  const tipStart  = lines.findIndex(l => /##\s+📌\s+Booking Tips/i.test(l));
  if (tipStart === -1) return;

  const tipEnd   = lines.findIndex((l, i) => i > tipStart && /^##\s+/.test(l));
  const tipLines = lines.slice(tipStart + 1, tipEnd === -1 ? lines.length : tipEnd);

  const tips = [];
  for (const l of tipLines) {
    const t = l.trim();
    if (/^\d+\.\s+|^[-*•]\s+/.test(t)) {
      tips.push(t.replace(/^(\d+\.\s+|[-*•]\s+)/, "").replace(/\*\*/g, "").trim());
    }
  }

  if (tips.length === 0) return;

  const TIP_ICONS = ["fa-calendar-check", "fa-percent", "fa-magnifying-glass", "fa-map-pin", "fa-rotate-left"];

  accordion.innerHTML = tips.map((tip, i) => {
    const parts = tip.split(/[:–—-](.+)/s);
    const title = parts[0]?.trim() || tip;
    const body  = parts[1]?.trim() || "";
    return `
      <div class="accordion-item">
        <h2 class="accordion-header">
          <button class="accordion-button ${i > 0 ? "collapsed" : ""}" type="button"
            data-bs-toggle="collapse" data-bs-target="#hotelTip${i}">
            <span class="tip-accordion-icon me-2"><i class="fa-solid ${TIP_ICONS[i % TIP_ICONS.length]}"></i></span>
            ${escapeHtml(title)}
          </button>
        </h2>
        <div id="hotelTip${i}" class="accordion-collapse collapse ${i === 0 ? "show" : ""}">
          <div class="accordion-body">${body ? escapeHtml(body) : escapeHtml(title)}</div>
        </div>
      </div>`;
  }).join("");

  panel.classList.remove("d-none");
}


// ════════════════════════════════════════════════════════════
//  AI TRAVEL CONSULTANT
// ════════════════════════════════════════════════════════════
async function runTravelConsultant() {
  const destType  = document.getElementById("con-type")?.value;
  const budget    = document.getElementById("con-budget")?.value;
  const days      = document.getElementById("con-days")?.value;
  const travelers = document.getElementById("con-travelers")?.value;
  const interests = document.getElementById("con-interests")?.value.trim() || "culture, food, sightseeing";
  const style     = document.getElementById("con-style")?.value;
  const season    = document.getElementById("con-season")?.value;

  setLoading(true, "consultant");
  disableForm("consultant");

  try {
    const res = await fetch("/api/travel-consultant", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        destination_type: destType,
        budget,
        days,
        travelers,
        interests,
        travel_style: style,
        season,
      }),
    });
    const data = await res.json();
    setLoading(false, "consultant");
    enableForm("consultant");

    if (data.error) { showToast(`Error: ${data.error}`, "error"); return; }

    // Store raw text
    const rawEl = document.getElementById("conRawText");
    if (rawEl) rawEl.textContent = data.recommendations;

    // Full AI report
    const fullEl = document.getElementById("conFullContent");
    if (fullEl) fullEl.innerHTML = formatMarkdown(data.recommendations);

    // Meta bar
    const badge = document.getElementById("conQueryBadge");
    const meta  = document.getElementById("conMetaText");
    if (badge) badge.textContent = `✈ ${destType}`;
    if (meta)  meta.textContent  = `${days} · ${travelers} · ${season}`;

    renderConsultantDashboard(data.recommendations);

    document.getElementById("conDashboard").classList.remove("d-none");
    document.getElementById("conDashboard").scrollIntoView({ behavior: "smooth", block: "start" });
    showToast("Expert recommendations ready! 🌍", "success");
  } catch (err) {
    setLoading(false, "consultant");
    enableForm("consultant");
    showToast("Server error. Is the Flask app running?", "error");
    console.error(err);
  }
}

// ─ Export consultant report ──────────────────────────────────
function exportConsultantReport() {
  const raw = document.getElementById("conRawText")?.textContent;
  if (!raw) { showToast("Generate recommendations first", "warning"); return; }
  const type = document.getElementById("con-type")?.value.split(" ")[0] || "travel";
  const blob = new Blob([raw], { type: "text/plain" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `consultant-report-${type.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Consultant report exported!", "success");
}

// ════════════════════════════════════════════════════════════
//  CONSULTANT DASHBOARD RENDERER
// ════════════════════════════════════════════════════════════
function renderConsultantDashboard(text) {
  const container = document.getElementById("conDestCards");
  if (!container) return;
  container.innerHTML = "";

  // ── Split into per-destination blocks ─────────────────────
  const blocks = text.split(/(?=^##\s)/m).filter(b => b.trim().length > 0);
  const destBlocks = blocks.filter(b =>
    /destination\s*\d*\s*:/i.test(b) || /^##\s+🌍/i.test(b)
  ).slice(0, 3);

  if (destBlocks.length === 0) {
    container.innerHTML = `<div class="col-12"><div class="content-card p-4"><div class="result-content">${formatMarkdown(text)}</div></div></div>`;
  } else {
    const parsed = destBlocks.map(parseConBlock);
    parsed.forEach((dest, idx) => {
      container.insertAdjacentHTML("beforeend", buildConCard(dest, idx));
    });
    renderConScoreSummary(parsed);
  }

  renderConTopPick(text);
}

// ─ Parse one destination block ───────────────────────────────
function parseConBlock(raw) {
  const lines = raw.split("\n");

  const headLine  = lines.find(l => /^##\s/.test(l)) || "";
  const name      = headLine.replace(/^#+\s*/, "")
    .replace(/destination\s*\d*\s*:\s*/i, "").replace(/🌍/g, "").trim() || "Destination";

  function after(label) {
    const re   = new RegExp(`\\*\\*${label}[^*]*\\*\\*[:\\s]*(.+)`, "i");
    const line = lines.find(l => re.test(l));
    return line ? line.replace(re, "$1").replace(/\*\*/g, "").trim() : "";
  }

  function bulletList(label) {
    const startRe = new RegExp(`\\*\\*${label}[^*]*\\*\\*`, "i");
    let idx = lines.findIndex(l => startRe.test(l));
    if (idx === -1) return [];
    const items = [];
    for (let i = idx + 1; i < lines.length; i++) {
      const l = lines[i].trim();
      if (!l) continue;
      if (/^\*\*/.test(l) && !l.startsWith("- ") && !l.startsWith("* ")) break;
      if (/^[-*•]\s+/.test(l)) items.push(l.replace(/^[-*•]\s+/, "").replace(/\*\*/g, "").trim());
    }
    return items;
  }

  function rating(label) {
    const re   = new RegExp(`\\*\\*${label}[^*]*\\*\\*[:\\s]*([\\d.]+)\\s*/\\s*10`, "i");
    const line = lines.find(l => re.test(l));
    if (line) { const m = line.match(re); return m ? parseFloat(m[1]) : null; }
    const kw = label.split(/\s/)[0].toLowerCase();
    const fb = lines.find(l => l.toLowerCase().includes(kw) && /\d+\s*\/\s*10/.test(l));
    if (fb)  { const m = fb.match(/([\d.]+)\s*\/\s*10/); return m ? parseFloat(m[1]) : null; }
    return null;
  }

  return {
    name,
    why:         after("Why Visit"),
    bestTime:    after("Best Time to Visit"),
    budget:      after("Estimated Budget"),
    attractions: bulletList("Top Attractions"),
    foods:       bulletList("Local Foods"),
    safety:      rating("Safety"),
    family:      rating("Family Friendly"),
    adventure:   rating("Adventure"),
    score:       rating("Final Recommendation"),
  };
}

// ─ Build one consultant destination card ─────────────────────
function buildConCard(dest, idx) {
  const clsIdx = idx % 3;

  // Rating bar helper
  function ratingBar(val, label, icon, fillColor) {
    const pct   = val !== null ? Math.min(val * 10, 100) : 0;
    const cls   = val === null ? "" : val >= 8 ? "score-high" : val >= 6 ? "score-mid" : "score-low";
    const disp  = val !== null ? `${val}/10` : "—";
    return `
      <div class="con-rating-box">
        <div class="con-rating-label"><i class="fa-solid ${icon} me-1"></i>${label}</div>
        <div class="con-rating-bar-track">
          <div class="con-rating-bar-fill" style="width:${pct}%; background:${fillColor}"></div>
        </div>
        <div class="con-rating-val ${cls}">${disp}</div>
      </div>`;
  }

  const score     = dest.score;
  const scoreColor = score === null ? "#94a3b8"
    : score >= 8.5 ? "#059669" : score >= 7 ? "#f59e0b" : "#ef4444";
  const scoreHtml = score !== null
    ? `<div class="con-score-ring" style="--ring-color:${scoreColor}">
         <span class="con-score-val">${score.toFixed(1)}</span>
         <span class="con-score-lbl">/ 10</span>
       </div>`
    : "";

  const attractionsHtml = dest.attractions.slice(0, 5).map(a =>
    `<div class="con-list-item"><i class="fa-solid fa-location-dot"></i><span>${escapeHtml(a)}</span></div>`
  ).join("") || '<div class="con-list-item text-muted small">See full report</div>';

  const foodsHtml = dest.foods.slice(0, 3).map(f =>
    `<div class="con-list-item"><i class="fa-solid fa-utensils"></i><span>${escapeHtml(f)}</span></div>`
  ).join("") || '<div class="con-list-item text-muted small">See full report</div>';

  return `
    <div class="col-lg-4 col-md-6 animate__animated animate__fadeInUp" style="animation-delay:${idx * 0.12}s">
      <div class="con-dest-card con-card-${clsIdx}">

        <div class="con-card-head">
          <div class="con-card-num">${idx + 1}</div>
          <div class="flex-grow-1 overflow-hidden">
            <div class="con-card-title">${escapeHtml(dest.name)}</div>
            <div class="con-card-sub">Destination #${idx + 1}</div>
          </div>
          ${scoreHtml}
        </div>

        <div class="con-card-body">
          ${dest.why ? `<div class="con-why">${escapeHtml(dest.why)}</div>` : ""}

          <div class="con-meta-pills">
            ${dest.budget   ? `<span class="con-meta-pill budget-pill"><i class="fa-solid fa-indian-rupee-sign"></i>${escapeHtml(dest.budget)}</span>` : ""}
            ${dest.bestTime ? `<span class="con-meta-pill"><i class="fa-solid fa-calendar-days"></i>${escapeHtml(dest.bestTime)}</span>` : ""}
          </div>

          <div>
            <div class="con-list-label"><i class="fa-solid fa-star me-1"></i>Top Attractions</div>
            <div class="con-list">${attractionsHtml}</div>
          </div>

          <div>
            <div class="con-list-label"><i class="fa-solid fa-bowl-food me-1"></i>Local Foods</div>
            <div class="con-list">${foodsHtml}</div>
          </div>

          <div class="con-ratings-grid">
            ${ratingBar(dest.safety,    "Safety",    "fa-shield-halved", "#10b981")}
            ${ratingBar(dest.family,    "Family",    "fa-people-roof",   "#6d28d9")}
            ${ratingBar(dest.adventure, "Adventure", "fa-person-hiking",  "#f59e0b")}
          </div>
        </div>

        <div class="con-card-footer">
          <button class="btn-con-plan" onclick="sendQuickMessage('Plan a detailed trip to ${dest.name.replace(/'/g, "\\'")}')">
            <i class="bi bi-map-fill me-2"></i>Plan a Trip to ${escapeHtml(dest.name)}
          </button>
        </div>

      </div>
    </div>`;
}

// ─ Score summary comparison bars ────────────────────────────
function renderConScoreSummary(parsed) {
  const summary   = document.getElementById("conScoreSummary");
  const barsEl    = document.getElementById("conScoreBars");
  if (!summary || !barsEl || parsed.length === 0) return;

  const BAR_COLORS = ["#10b981", "#8b5cf6", "#f59e0b"];

  barsEl.innerHTML = parsed.map((dest, i) => {
    const score = dest.score;
    if (score === null) return "";
    const pct   = Math.min(score * 10, 100);
    return `
      <div class="con-score-bar-row">
        <div class="con-score-bar-label">${escapeHtml(dest.name.length > 18 ? dest.name.slice(0, 17) + "…" : dest.name)}</div>
        <div class="con-score-bar-track">
          <div class="con-score-bar-fill" style="width:${pct}%; background:${BAR_COLORS[i % BAR_COLORS.length]}"></div>
        </div>
        <div class="con-score-bar-val">${score.toFixed(1)}</div>
      </div>`;
  }).join("");

  if (barsEl.innerHTML.trim()) summary.classList.remove("d-none");
}

// ─ Top pick banner ───────────────────────────────────────────
function renderConTopPick(text) {
  const banner     = document.getElementById("conTopPickBanner");
  const nameEl     = document.getElementById("conTopPickName");
  const reasonEl   = document.getElementById("conTopPickReason");
  if (!banner || !nameEl || !reasonEl) return;

  const lines      = text.split(/\n/);
  const pickStart  = lines.findIndex(l => /##\s+🏆\s+Top Pick/i.test(l));
  if (pickStart === -1) return;

  // Look for "**Best Match:** Name — reason" pattern
  for (let i = pickStart + 1; i < Math.min(pickStart + 10, lines.length); i++) {
    const m = lines[i].match(/\*\*Best Match\*\*\s*[:\-–]\s*(.+)/i);
    if (m) {
      const full    = m[1].replace(/\*\*/g, "").trim();
      const dashIdx = full.search(/\s+[—–-]\s+/);
      if (dashIdx !== -1) {
        nameEl.textContent   = full.slice(0, dashIdx).trim();
        reasonEl.textContent = full.slice(dashIdx).replace(/^[\s—–-]+/, "").trim();
      } else {
        nameEl.textContent   = full;
        reasonEl.textContent = "";
      }
      banner.classList.remove("d-none");
      return;
    }
  }
}


// ════════════════════════════════════════════════════════════
//  TRAVEL PROFILE
// ════════════════════════════════════════════════════════════
async function saveProfile() {
  const profile = {
    travelers:     document.getElementById("prof-travelers")?.value.trim(),
    home_city:     document.getElementById("prof-city")?.value.trim(),
    budget:        document.getElementById("prof-budget")?.value,
    style:         document.getElementById("prof-style")?.value,
    interests:     document.getElementById("prof-interests")?.value.trim(),
    special_needs: document.getElementById("prof-needs")?.value.trim(),
  };

  setLoading(true, "profile");

  try {
    const res = await fetch("/api/save-profile", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(profile),
    });
    const data = await res.json();
    setLoading(false, "profile");

    if (data.error) { showToast(`Error: ${data.error}`, "error"); return; }

    document.getElementById("profileSaved")?.classList.remove("d-none");
    showToast("Profile saved! AI responses are now personalized 🎯", "success");
  } catch (err) {
    setLoading(false, "profile");
    showToast("Server error", "error");
    console.error(err);
  }
}

// ════════════════════════════════════════════════════════════
//  QUICK SUGGEST
// ════════════════════════════════════════════════════════════
async function quickSuggest() {
  const pref     = document.getElementById("suggest-pref")?.value.trim();
  const budget   = document.getElementById("suggest-budget")?.value;
  const duration = document.getElementById("suggest-duration")?.value;

  if (!pref) { showToast("Please describe what you're looking for", "warning"); return; }

  setLoading(true, "suggest");

  try {
    const res = await fetch("/api/quick-suggest", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ preferences: pref, budget, duration }),
    });
    const data = await res.json();
    setLoading(false, "suggest");

    if (data.error) { showToast(`Error: ${data.error}`, "error"); return; }

    document.getElementById("suggestContent").textContent = data.suggestions;
    document.getElementById("suggestResult").classList.remove("d-none");
    document.getElementById("suggestResult").scrollIntoView({ behavior: "smooth" });
    showToast("Destinations found! ✈️", "success");
  } catch (err) {
    setLoading(false, "suggest");
    showToast("Server error", "error");
    console.error(err);
  }
}

// ════════════════════════════════════════════════════════════
//  COPY RESULT
// ════════════════════════════════════════════════════════════
async function copyResult(containerId) {
  const container = document.getElementById(containerId);
  // Support both: elements with a nested .result-content, and plain text elements
  const content = container?.querySelector(".result-content")?.textContent
                ?? container?.textContent;
  if (!content) return;

  try {
    await navigator.clipboard.writeText(content);
    showToast("Copied to clipboard!", "success");
  } catch {
    // Fallback
    const el = document.createElement("textarea");
    el.value = content;
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
    showToast("Copied!", "success");
  }
}

// ════════════════════════════════════════════════════════════
//  FORM HELPERS
// ════════════════════════════════════════════════════════════
function disableForm(context) {
  const tabEl = document.getElementById(`tabContent${capitalize(context)}`);
  tabEl?.querySelectorAll(".btn-generate, input, select").forEach(el => { el.disabled = true; });
}

function enableForm(context) {
  const tabEl = document.getElementById(`tabContent${capitalize(context)}`);
  tabEl?.querySelectorAll(".btn-generate, input, select").forEach(el => { el.disabled = false; });
}

// ════════════════════════════════════════════════════════════
//  TOAST NOTIFICATIONS
// ════════════════════════════════════════════════════════════
function showToast(message, type = "info") {
  const toastEl   = document.getElementById("toastMsg");
  const toastBody = document.getElementById("toastBody");
  if (!toastEl || !toastBody) return;

  const colors = {
    success: "#059669",
    error:   "#dc2626",
    warning: "#d97706",
    info:    "#2563eb",
  };

  toastBody.textContent  = message;
  toastEl.style.borderLeft = `4px solid ${colors[type] || colors.info}`;

  const toast = bootstrap.Toast.getOrCreateInstance(toastEl, { delay: 3000 });
  toast.show();
}
