// ============================================================
// messaging.js — WhatsApp-style Realtime Chat System
// Firestore structure:
//   conversations/{convId}  → { visitorName, visitorId, lastMsg, lastTs, unread }
//   conversations/{convId}/messages/{msgId} → { text, sender, ts }
// ============================================================

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCJ0oJ5BWOLZXXj8PaLBacb4Sxi5H-XaaA",
  authDomain: "ssc-pyqs.firebaseapp.com",
  projectId: "ssc-pyqs",
  storageBucket: "ssc-pyqs.firebasestorage.app",
  messagingSenderId: "499049609447",
  appId: "1:499049609447:web:8077a597a0819e63fd8a42",
  measurementId: "G-8CGEH4D0V1",
};

const ADMIN_PASSWORD = "Kapil@ssc2026";
const VISITOR_ID_KEY = "chat:visitorId";
const VISITOR_NAME_KEY = "chat:visitorName";

// ---- internal state ----
let _db = null;
let _firebaseReady = false;
let _adminAuthed = false;
let _chatUnsubscribe = null;      // realtime listener for open chat
let _convUnsubscribe = null;      // realtime listener for admin conv list
let _presenceUnsub = null;        // visitor: listening to admin presence
let _adminHeartbeatId = null;     // admin: heartbeat interval
let _activeConvId = null;         // admin: currently open conversation

// ============================================================
// Firebase bootstrap
// ============================================================
function loadFirebase() {
  return new Promise((resolve, reject) => {
    if (_firebaseReady) return resolve(_db);
    const s1 = document.createElement("script");
    s1.src = "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js";
    s1.onload = () => {
      const s2 = document.createElement("script");
      s2.src = "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js";
      s2.onload = () => {
        try {
          if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
          _db = firebase.firestore();
          _firebaseReady = true;
          resolve(_db);
        } catch (e) { reject(e); }
      };
      s2.onerror = () => reject(new Error("Firestore SDK load failed"));
      document.head.appendChild(s2);
    };
    s1.onerror = () => reject(new Error("Firebase App SDK load failed"));
    document.head.appendChild(s1);
  });
}

// ============================================================
// Visitor identity — persisted in localStorage
// ============================================================
function getVisitorId() {
  let id = localStorage.getItem(VISITOR_ID_KEY);
  if (!id) {
    id = "v_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(VISITOR_ID_KEY, id);
  }
  return id;
}
function getVisitorName() { return localStorage.getItem(VISITOR_NAME_KEY) || ""; }
function setVisitorName(n) { localStorage.setItem(VISITOR_NAME_KEY, n.trim()); }

// ============================================================
// Firestore helpers
// ============================================================
async function getOrCreateConversation(visitorId, visitorName) {
  const db = await loadFirebase();
  const ref = db.collection("conversations").doc(visitorId);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      visitorId,
      visitorName: visitorName.trim(),
      lastMsg: "",
      lastTs: firebase.firestore.FieldValue.serverTimestamp(),
      unread: 0,
      visitorLastSeen: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } else {
    // Update visitor's last seen whenever they open the widget
    await ref.update({ visitorLastSeen: firebase.firestore.FieldValue.serverTimestamp() });
  }
  return ref;
}

async function sendVisitorMessage(visitorId, text) {
  const db = await loadFirebase();
  const convRef = db.collection("conversations").doc(visitorId);
  const msgRef = convRef.collection("messages");
  await msgRef.add({
    text: text.trim(),
    sender: "visitor",
    ts: firebase.firestore.FieldValue.serverTimestamp(),
  });
  await convRef.update({
    lastMsg: text.trim().slice(0, 80),
    lastTs: firebase.firestore.FieldValue.serverTimestamp(),
    unread: firebase.firestore.FieldValue.increment(1),
    visitorLastSeen: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

async function sendAdminReply(convId, text) {
  const db = await loadFirebase();
  const convRef = db.collection("conversations").doc(convId);
  await convRef.collection("messages").add({
    text: text.trim(),
    sender: "admin",
    ts: firebase.firestore.FieldValue.serverTimestamp(),
  });
  await convRef.update({
    lastMsg: "You: " + text.trim().slice(0, 80),
    lastTs: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

async function markConvRead(convId) {
  const db = await loadFirebase();
  await db.collection("conversations").doc(convId).update({ unread: 0 });
}

async function deleteConversation(convId) {
  const db = await loadFirebase();
  // Delete all messages in subcollection first
  const msgs = await db.collection("conversations").doc(convId).collection("messages").get();
  const batch = db.batch();
  msgs.docs.forEach(d => batch.delete(d.ref));
  batch.delete(db.collection("conversations").doc(convId));
  await batch.commit();
}

// ============================================================
// Presence system
// ============================================================

// Admin: start broadcasting presence (called when admin panel opens)
async function startAdminPresence() {
  const db = await loadFirebase();
  const ref = db.collection("presence").doc("admin");

  const beat = async () => {
    try {
      await ref.set({
        online: true,
        lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) { /* ignore */ }
  };

  await beat();
  // Heartbeat every 25 seconds
  _adminHeartbeatId = setInterval(beat, 25000);

  // Mark offline when tab closes / navigates away
  const goOffline = () => {
    navigator.sendBeacon && navigator.sendBeacon(
      `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/presence/admin`,
    );
    // Best-effort synchronous write via beacon isn't possible for Firestore,
    // so we rely on the timestamp staleness check on the visitor side.
    // Also try the async path:
    ref.set({ online: false, lastSeen: firebase.firestore.FieldValue.serverTimestamp() }).catch(() => {});
  };
  window.addEventListener("beforeunload", goOffline);
}

// Admin: stop presence (called on logout)
async function stopAdminPresence() {
  if (_adminHeartbeatId) { clearInterval(_adminHeartbeatId); _adminHeartbeatId = null; }
  try {
    const db = await loadFirebase();
    await db.collection("presence").doc("admin").set({
      online: false,
      lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) { /* ignore */ }
}

// Visitor: subscribe to admin presence and update the status line
async function subscribeToAdminPresence(statusEl) {
  const db = await loadFirebase();
  if (_presenceUnsub) { _presenceUnsub(); _presenceUnsub = null; }

  _presenceUnsub = db.collection("presence").doc("admin")
    .onSnapshot(snap => {
      if (!snap.exists) {
        setStatusOffline(statusEl, null);
        return;
      }
      const data = snap.data();
      if (data.online === true) {
        // Treat as offline if heartbeat is stale > 50s
        const ts = data.lastSeen ? data.lastSeen.toDate() : null;
        const age = ts ? Date.now() - ts.getTime() : 999999;
        if (age < 50000) {
          statusEl.innerHTML = `<span class="status-dot status-dot--online"></span> Online`;
        } else {
          setStatusOffline(statusEl, ts);
        }
      } else {
        const ts = data.lastSeen ? data.lastSeen.toDate() : null;
        setStatusOffline(statusEl, ts);
      }
    }, () => {
      statusEl.textContent = "Offline";
    });
}

function setStatusOffline(el, lastSeenDate) {
  if (!lastSeenDate) {
    el.innerHTML = `<span class="status-dot status-dot--offline"></span> Offline`;
    return;
  }
  const diff = Date.now() - lastSeenDate.getTime();
  const mins = Math.floor(diff / 60000);
  const hrs  = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  let label;
  if (mins < 1)       label = "Last seen just now";
  else if (mins < 60) label = `Last seen ${mins}m ago`;
  else if (hrs < 24)  label = `Last seen ${hrs}h ago`;
  else                label = `Last seen ${days}d ago`;
  el.innerHTML = `<span class="status-dot status-dot--offline"></span> ${label}`;
}


// ============================================================
// Utilities
// ============================================================
function escHtml(s) {
  return String(s || "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

function formatTime(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) +
    " " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function formatLastTs(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

// ============================================================
// Floating button
// ============================================================
function buildFloatingButton() {
  if (document.getElementById("msgFloatBtn")) return;

  // Chat button
  const btn = document.createElement("button");
  btn.id = "msgFloatBtn";
  btn.type = "button";
  btn.setAttribute("aria-label", "Chat with admin");
  btn.innerHTML = `
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
    <span class="msg-float-label">Chat</span>
    <span class="msg-float-badge" id="msgFloatBadge" hidden>!</span>
  `;
  btn.addEventListener("click", openChatWidget);
  document.body.appendChild(btn);

  // Admin icon button (small, discreet, above chat button)
  const adminBtn = document.createElement("a");
  adminBtn.id = "adminFloatBtn";
  adminBtn.href = "#/admin";
  adminBtn.setAttribute("aria-label", "Admin panel");
  adminBtn.title = "Admin Panel";
  adminBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  `;
  document.body.appendChild(adminBtn);
}

// ============================================================
// Chat widget — visitor side
// ============================================================
function openChatWidget() {
  if (document.getElementById("chatWidget")) return;

  const name = getVisitorName();
  if (!name) {
    openNameModal();
    return;
  }
  buildChatWidget(name);
}

function openNameModal() {
  document.getElementById("nameModal")?.remove();
  const m = document.createElement("div");
  m.id = "nameModal";
  m.className = "chat-name-overlay";
  m.innerHTML = `
    <div class="chat-name-box">
      <div class="chat-name-header">
        <div class="chat-name-logo">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <div>
          <div class="chat-name-title">Start a Chat</div>
          <div class="chat-name-sub">Message the admin directly</div>
        </div>
      </div>
      <div class="chat-name-body">
        <label class="msg-label">Your Name</label>
        <input class="msg-input" id="visitorNameInput" type="text" placeholder="e.g. Sharma" maxlength="60" autocomplete="name" />
        <div id="nameErr" class="msg-error" style="margin-top:8px" hidden>Please enter your name.</div>
      </div>
      <div class="chat-name-footer">
        <button class="chat-cancel-btn" id="nameCancelBtn" type="button">Cancel</button>
        <button class="chat-start-btn" id="nameStartBtn" type="button">Start Chat →</button>
      </div>
    </div>
  `;
  document.body.appendChild(m);
  const input = m.querySelector("#visitorNameInput");
  input.focus();
  m.querySelector("#nameCancelBtn").addEventListener("click", () => m.remove());
  m.addEventListener("click", e => { if (e.target === m) m.remove(); });
  const start = () => {
    const v = input.value.trim();
    if (!v) { m.querySelector("#nameErr").hidden = false; return; }
    setVisitorName(v);
    m.remove();
    buildChatWidget(v);
  };
  m.querySelector("#nameStartBtn").addEventListener("click", start);
  input.addEventListener("keydown", e => { if (e.key === "Enter") start(); });
}

async function buildChatWidget(visitorName) {
  const visitorId = getVisitorId();

  // Create widget
  const widget = document.createElement("div");
  widget.id = "chatWidget";
  widget.className = "chat-widget";
  widget.innerHTML = `
    <div class="chat-widget__header">
      <div class="chat-widget__avatar">A</div>
      <div class="chat-widget__info">
        <div class="chat-widget__name">SSC CGL Admin</div>
        <div class="chat-widget__status" id="chatStatus">Connecting…</div>
      </div>
      <button class="chat-widget__close" id="chatCloseBtn" title="Close">✕</button>
    </div>
    <div class="chat-widget__messages" id="chatMessages">
      <div class="chat-connecting">
        <div class="admin-spinner"></div>
      </div>
    </div>
    <div class="chat-widget__footer">
      <textarea class="chat-input" id="chatInput" placeholder="Type a message…" rows="1" maxlength="1000"></textarea>
      <button class="chat-send-btn" id="chatSendBtn" type="button" aria-label="Send">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
      </button>
    </div>
  `;
  document.body.appendChild(widget);

  widget.querySelector("#chatCloseBtn").addEventListener("click", () => {
    if (_chatUnsubscribe) { _chatUnsubscribe(); _chatUnsubscribe = null; }
    if (_presenceUnsub)   { _presenceUnsub();   _presenceUnsub = null; }
    widget.remove();
  });

  // Auto-resize textarea
  const input = widget.querySelector("#chatInput");
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  });

  // Send on Enter (Shift+Enter = newline)
  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doSend(); }
  });
  widget.querySelector("#chatSendBtn").addEventListener("click", doSend);

  async function doSend() {
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    input.style.height = "auto";
    try {
      await sendVisitorMessage(visitorId, text);
    } catch (err) {
      console.error("Send error:", err);
    }
  }

  // Init conversation and subscribe to realtime messages
  try {
    await getOrCreateConversation(visitorId, visitorName);
    const statusEl = widget.querySelector("#chatStatus");
    statusEl.textContent = "Checking…";
    subscribeToAdminPresence(statusEl);
    subscribeToChat(visitorId, widget);
  } catch (e) {
    widget.querySelector("#chatStatus").textContent = "Connection failed";
    widget.querySelector("#chatMessages").innerHTML =
      `<div class="chat-error">⚠️ Could not connect. Check your internet.</div>`;
  }
}

async function subscribeToChat(visitorId, widget) {
  const db = await loadFirebase();
  const msgsContainer = widget.querySelector("#chatMessages");

  if (_chatUnsubscribe) _chatUnsubscribe();

  _chatUnsubscribe = db
    .collection("conversations").doc(visitorId)
    .collection("messages")
    .orderBy("ts", "asc")
    .onSnapshot(snap => {
      msgsContainer.innerHTML = "";
      if (snap.empty) {
        msgsContainer.innerHTML = `<div class="chat-empty-hint">Say hello! The admin will reply soon 👋</div>`;
        return;
      }
      snap.docs.forEach(doc => {
        const msg = doc.data();
        const bubble = document.createElement("div");
        bubble.className = `chat-bubble chat-bubble--${msg.sender === "visitor" ? "out" : "in"}`;
        bubble.innerHTML = `
          <div class="chat-bubble__text">${escHtml(msg.text)}</div>
          <div class="chat-bubble__time">${formatTime(msg.ts)}</div>
        `;
        msgsContainer.appendChild(bubble);
      });
      // Scroll to bottom
      msgsContainer.scrollTop = msgsContainer.scrollHeight;
    }, err => {
      console.error("Realtime listener error:", err);
    });
}

// ============================================================
// Admin Panel
// ============================================================
function renderAdminPanel() {
  if (!_adminAuthed) { renderAdminLogin(); return; }
  renderAdminInbox();
}

function renderAdminLogin() {
  document.getElementById("adminPanel")?.remove();
  const panel = document.createElement("div");
  panel.id = "adminPanel";
  panel.className = "admin-panel";
  panel.innerHTML = `
    <div class="admin-login">
      <div class="admin-login__icon">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      </div>
      <h2 class="admin-login__title">Admin Chat</h2>
      <p class="admin-login__desc">Enter your password to access all conversations</p>
      <div class="admin-login__form">
        <input class="msg-input" id="adminPassInput" type="password" placeholder="Admin password" autocomplete="current-password" />
        <div id="adminLoginError" class="msg-error" style="margin-top:8px" hidden>Incorrect password.</div>
        <button class="btn btn--primary" id="adminLoginBtn" type="button" style="width:100%;margin-top:10px">Unlock →</button>
      </div>
      <a class="admin-back-link" href="#/home">← Back to site</a>
    </div>
  `;
  document.body.appendChild(panel);
  const inp = panel.querySelector("#adminPassInput");
  inp.focus();
  const doLogin = () => {
    if (inp.value === ADMIN_PASSWORD) {
      _adminAuthed = true; panel.remove(); renderAdminInbox();
    } else {
      panel.querySelector("#adminLoginError").hidden = false;
      inp.value = ""; inp.focus();
    }
  };
  panel.querySelector("#adminLoginBtn").addEventListener("click", doLogin);
  inp.addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); });
}

async function renderAdminInbox() {
  document.getElementById("adminPanel")?.remove();
  const panel = document.createElement("div");
  panel.id = "adminPanel";
  panel.className = "admin-panel";
  panel.innerHTML = `
    <div class="admin-chat-layout">
      <!-- Sidebar: conversation list -->
      <aside class="admin-sidebar">
        <div class="admin-sidebar__header">
          <div class="admin-sidebar__title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            Conversations
          </div>
          <div class="admin-sidebar__actions">
            <a class="admin-icon-btn" href="#/home" title="Back to site">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </a>
            <button class="admin-icon-btn" id="adminLogoutBtn" title="Logout">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="admin-conv-list" id="adminConvList">
          <div class="admin-loading"><div class="admin-spinner"></div><span>Loading…</span></div>
        </div>
      </aside>
      <!-- Main: chat window -->
      <main class="admin-chat-main" id="adminChatMain">
        <div class="admin-no-chat">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <p>Select a conversation to start chatting</p>
        </div>
      </main>
    </div>
  `;
  document.body.appendChild(panel);

  panel.querySelector("#adminLogoutBtn").addEventListener("click", () => {
    _adminAuthed = false;
    stopAdminPresence();
    if (_convUnsubscribe) { _convUnsubscribe(); _convUnsubscribe = null; }
    if (_chatUnsubscribe) { _chatUnsubscribe(); _chatUnsubscribe = null; }
    panel.remove();
    window.location.hash = "#/home";
  });

  startAdminPresence();
  subscribeToConversations(panel);
}

async function subscribeToConversations(panel) {
  const db = await loadFirebase();
  const listEl = panel.querySelector("#adminConvList");

  if (_convUnsubscribe) _convUnsubscribe();

  _convUnsubscribe = db.collection("conversations")
    .orderBy("lastTs", "desc")
    .onSnapshot(snap => {
      listEl.innerHTML = "";
      if (snap.empty) {
        listEl.innerHTML = `<div class="admin-conv-empty">No conversations yet</div>`;
        return;
      }
      snap.docs.forEach(doc => {
        const conv = { id: doc.id, ...doc.data() };
        const item = buildConvItem(conv, panel);
        if (conv.id === _activeConvId) item.classList.add("is-active");
        listEl.appendChild(item);
      });
    }, err => console.error("Conv listener err:", err));
}

function buildConvItem(conv, panel) {
  const item = document.createElement("div");
  item.className = "admin-conv-item";
  item.dataset.id = conv.id;
  const initial = (conv.visitorName || "?")[0].toUpperCase();
  item.innerHTML = `
    <div class="admin-conv-avatar">${initial}</div>
    <div class="admin-conv-info">
      <div class="admin-conv-top">
        <span class="admin-conv-name">${escHtml(conv.visitorName || "Visitor")}</span>
        <span class="admin-conv-time">${formatLastTs(conv.lastTs)}</span>
      </div>
      <div class="admin-conv-last">${escHtml(conv.lastMsg || "No messages yet")}</div>
    </div>
    ${conv.unread > 0 ? `<div class="admin-conv-unread">${conv.unread}</div>` : ""}
  `;
  item.addEventListener("click", () => {
    // Mark active in sidebar
    panel.querySelectorAll(".admin-conv-item").forEach(i => i.classList.remove("is-active"));
    item.classList.add("is-active");
    item.querySelector(".admin-conv-unread")?.remove();
    _activeConvId = conv.id;
    markConvRead(conv.id).catch(() => {});
    // Show chat pane on mobile
    const mainEl = panel.querySelector("#adminChatMain");
    if (mainEl) mainEl.classList.add("has-chat");
    openAdminChat(conv, panel);
  });
  return item;
}

async function openAdminChat(conv, panel) {
  const mainEl = panel.querySelector("#adminChatMain");
  mainEl.innerHTML = `
    <div class="admin-chat-header">
      <button class="admin-chat-back" id="adminChatBack" title="Back to list">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 12H5M5 12l7 7M5 12l7-7"/>
        </svg>
      </button>
      <div class="admin-chat-avatar">${(conv.visitorName||"?")[0].toUpperCase()}</div>
      <div class="admin-chat-info">
        <div class="admin-chat-name">${escHtml(conv.visitorName || "Visitor")}</div>
        <div class="admin-chat-online" id="adminChatPresence">Active recently</div>
      </div>
      <button class="admin-chat-delete" id="adminDeleteConv" title="Delete conversation">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          <path d="M10 11v6M14 11v6"/>
        </svg>
      </button>
    </div>
    <div class="admin-chat-messages" id="adminChatMessages">
      <div class="admin-loading"><div class="admin-spinner"></div></div>
    </div>
    <div class="admin-chat-footer">
      <textarea class="chat-input" id="adminReplyInput" placeholder="Type a reply…" rows="1" maxlength="1000"></textarea>
      <button class="chat-send-btn" id="adminSendBtn" type="button" aria-label="Send">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
      </button>
    </div>
  `;

  // Show chat on mobile
  mainEl.classList.add("has-chat");

  // Back button (mobile)
  mainEl.querySelector("#adminChatBack").addEventListener("click", () => {
    _activeConvId = null;
    mainEl.classList.remove("has-chat");
    if (_chatUnsubscribe) { _chatUnsubscribe(); _chatUnsubscribe = null; }
    mainEl.innerHTML = `<div class="admin-no-chat"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><p>Select a conversation</p></div>`;
    panel.querySelectorAll(".admin-conv-item").forEach(i => i.classList.remove("is-active"));
  });

  // Delete conversation
  mainEl.querySelector("#adminDeleteConv").addEventListener("click", async () => {
    if (!confirm(`Delete entire conversation with "${conv.visitorName}"?`)) return;
    try {
      await deleteConversation(conv.id);
      _activeConvId = null;
      if (_chatUnsubscribe) { _chatUnsubscribe(); _chatUnsubscribe = null; }
      mainEl.innerHTML = `<div class="admin-no-chat"><p>Conversation deleted.</p></div>`;
    } catch (e) { alert("Error: " + e.message); }
  });

  // Auto-resize textarea
  const replyInput = mainEl.querySelector("#adminReplyInput");
  replyInput.addEventListener("input", () => {
    replyInput.style.height = "auto";
    replyInput.style.height = Math.min(replyInput.scrollHeight, 120) + "px";
  });

  const doReply = async () => {
    const text = replyInput.value.trim();
    if (!text) return;
    replyInput.value = "";
    replyInput.style.height = "auto";
    try { await sendAdminReply(conv.id, text); }
    catch (e) { console.error("Reply error:", e); }
  };
  replyInput.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doReply(); } });
  mainEl.querySelector("#adminSendBtn").addEventListener("click", doReply);

  // Subscribe to messages realtime
  subscribeToAdminMessages(conv.id, mainEl);

  // Show visitor's last activity in header (live)
  const presenceEl = mainEl.querySelector("#adminChatPresence");
  if (presenceEl) {
    loadFirebase().then(db => {
      db.collection("conversations").doc(conv.id).onSnapshot(snap => {
        if (!snap.exists) return;
        const data = snap.data();
        const ts = data.visitorLastSeen ? data.visitorLastSeen.toDate() : null;
        if (!ts) { presenceEl.textContent = "Active recently"; return; }
        const diff = Date.now() - ts.getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1)       presenceEl.innerHTML = `<span style="color:#4ade80">● Online</span>`;
        else if (mins < 5)  presenceEl.innerHTML = `<span style="color:#4ade80">● Just now</span>`;
        else if (mins < 60) presenceEl.textContent = `Last seen ${mins}m ago`;
        else {
          const hrs = Math.floor(diff / 3600000);
          presenceEl.textContent = hrs < 24 ? `Last seen ${hrs}h ago` : `Last seen ${Math.floor(hrs/24)}d ago`;
        }
      });
    });
  }

  replyInput.focus();
}

async function subscribeToAdminMessages(convId, mainEl) {
  const db = await loadFirebase();
  const msgsEl = mainEl.querySelector("#adminChatMessages");

  if (_chatUnsubscribe) _chatUnsubscribe();

  _chatUnsubscribe = db
    .collection("conversations").doc(convId)
    .collection("messages")
    .orderBy("ts", "asc")
    .onSnapshot(snap => {
      msgsEl.innerHTML = "";
      if (snap.empty) {
        msgsEl.innerHTML = `<div class="chat-empty-hint">No messages yet</div>`;
        return;
      }
      snap.docs.forEach(doc => {
        const msg = doc.data();
        const bubble = document.createElement("div");
        // admin sent = "out" (right side), visitor = "in" (left side)
        bubble.className = `chat-bubble chat-bubble--${msg.sender === "admin" ? "out" : "in"}`;
        bubble.innerHTML = `
          <div class="chat-bubble__text">${escHtml(msg.text)}</div>
          <div class="chat-bubble__time">${formatTime(msg.ts)}</div>
        `;
        msgsEl.appendChild(bubble);
      });
      msgsEl.scrollTop = msgsEl.scrollHeight;
    }, err => console.error("Msg listener err:", err));
}

// ============================================================
// Hash routing
// ============================================================
function handleMessagingRoute() {
  const hash = window.location.hash || "#/home";
  if (hash.startsWith("#/admin")) {
    const app = document.getElementById("app");
    if (app) app.style.display = "none";
    if (!document.getElementById("adminPanel")) renderAdminPanel();
    return true;
  }
  const app = document.getElementById("app");
  if (app) app.style.display = "";
  document.getElementById("adminPanel")?.remove();
  if (_convUnsubscribe) { _convUnsubscribe(); _convUnsubscribe = null; }
  if (_chatUnsubscribe) { _chatUnsubscribe(); _chatUnsubscribe = null; }
  stopAdminPresence();
  return false;
}

// ============================================================
// Init
// ============================================================
function initMessaging() {
  buildFloatingButton();
  window.addEventListener("hashchange", handleMessagingRoute);
  handleMessagingRoute();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initMessaging);
} else {
  initMessaging();
}
