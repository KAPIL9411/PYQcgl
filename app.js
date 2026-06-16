// Base chapters are registered by per-chapter files under ./chapters/*.js
const BASE_CHAPTERS = Array.isArray(window.BASE_CHAPTERS) ? window.BASE_CHAPTERS : [];

let CHAPTERS = BASE_CHAPTERS.slice();

const KEYS = ["A", "B", "C", "D"];
const USER_CHAPTERS_STORAGE_KEY = "pyq:chapters:user";
const PROGRESS_VERSION = 1;

const appState = {
  view: "home",
  chapterId: null,
  mode: "full", // "full", "custom", "retryWrong"
  isExamMode: false, // true for exam mode (no instant feedback), false for practice mode
  order: [],
  idx: 0,
  answers: [],
  startedAt: 0,
  elapsedMs: 0,
  lastTickAt: 0,
  timerId: null,
  autoNextId: null,
  timeLimitMs: null,
  sessionChapter: null,
  isZoomed: false, 
};

const el = {
  views: Array.from(document.querySelectorAll("[data-view]")),
  chapterGrid: document.getElementById("chapterGrid"),
  homeMeta: document.getElementById("homeMeta"),
  customForm: document.getElementById("customForm"),
  customMsg: document.getElementById("customMsg"),
  customStartBtn: document.getElementById("customStartBtn"),
  customChapterSelect: document.getElementById("customChapterSelect"),
  customChaptersChecks: document.getElementById("customChaptersChecks"),
  customQCount: document.getElementById("customQCount"),
  customMinutes: document.getElementById("customMinutes"),
  chapterwiseRow: document.getElementById("chapterwiseRow"),
  mixedRow: document.getElementById("mixedRow"),
  chapterImportTitle: document.getElementById("chapterImportTitle"),
  chapterImportId: document.getElementById("chapterImportId"),
  chapterImportDesc: document.getElementById("chapterImportDesc"),
  chapterImportJson: document.getElementById("chapterImportJson"),
  chapterImportBtn: document.getElementById("chapterImportBtn"),
  chapterExportBtn: document.getElementById("chapterExportBtn"),
  chapterClearBtn: document.getElementById("chapterClearBtn"),
  chapterImportMsg: document.getElementById("chapterImportMsg"),
  chapterExportWrap: document.getElementById("chapterExportWrap"),
  chapterExportOut: document.getElementById("chapterExportOut"),

  practiceChapterTitle: document.getElementById("practiceChapterTitle"),
  progressFill: document.getElementById("progressFill"),
  progressMeta: document.getElementById("progressMeta"),
  qMeta: document.getElementById("qMeta"),
  qTimer: document.getElementById("qTimer"),
  fsBtn: document.getElementById("fsBtn"),
  palettePanel: document.getElementById("palettePanel"),
  qText: document.getElementById("qText"),
  options: document.getElementById("options"),
  feedback: document.getElementById("feedback"),
  prevBtn: document.getElementById("prevBtn"),
  clearBtn: document.getElementById("clearBtn"),
  nextBtn: document.getElementById("nextBtn"),
  paletteList: document.getElementById("paletteList"),
  finishBtn: document.getElementById("finishBtn"),
  zoomBtn: document.getElementById("zoomBtn"), 

  resultsChapterTitle: document.getElementById("resultsChapterTitle"),
  scoreValue: document.getElementById("scoreValue"),
  scoreSub: document.getElementById("scoreSub"),
  accValue: document.getElementById("accValue"),
  timeValue: document.getElementById("timeValue"),
  attemptedValue: document.getElementById("attemptedValue"),
  reviewMeta: document.getElementById("reviewMeta"),
  reviewList: document.getElementById("reviewList"),
  reviewBtn: document.getElementById("reviewBtn"),
  retryWrongBtn: document.getElementById("retryWrongBtn"),
};

function setCustomMessage(text, kind) {
  if (!el.customMsg) return;
  el.customMsg.textContent = text || "";
  if (kind === "ok") el.customMsg.style.color = "var(--good)";
  else if (kind === "bad") el.customMsg.style.color = "var(--danger)";
  else el.customMsg.style.color = "var(--muted)";
}

function fullscreenSupported() {
  const el = document.documentElement;
  return !!(el && el.requestFullscreen) && !!document.exitFullscreen;
}

function isFullscreen() {
  return !!document.fullscreenElement;
}

async function requestFullscreen() {
  if (!fullscreenSupported()) return false;
  if (isFullscreen()) return true;
  try {
    await document.documentElement.requestFullscreen();
    return true;
  } catch {
    return false;
  }
}

async function exitFullscreen() {
  if (!fullscreenSupported()) return false;
  if (!isFullscreen()) return true;
  try {
    await document.exitFullscreen();
    return true;
  } catch {
    return false;
  }
}

async function toggleFullscreen() {
  if (isFullscreen()) return exitFullscreen();
  return requestFullscreen();
}

function syncFullscreenUi() {
  if (!el.fsBtn) return;
  if (!fullscreenSupported()) {
    el.fsBtn.hidden = true;
    return;
  }
  el.fsBtn.hidden = false;
  el.fsBtn.textContent = isFullscreen() ? "Exit Full Screen" : "Full Screen";
}

function chapterById(id) {
  if (appState.sessionChapter && appState.sessionChapter.id === id) return appState.sessionChapter;
  return CHAPTERS.find((c) => c.id === id) || null;
}

function formatDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function shuffledCopy(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  return Math.min(max, Math.max(min, i));
}

function buildMixedChapter(selectedChapterIds) {
  const ids = Array.isArray(selectedChapterIds) ? selectedChapterIds : [];
  const chapters = ids.map((id) => chapterById(id)).filter(Boolean);
  const questions = [];
  for (const c of chapters) {
    for (const q of c.questions) {
      questions.push({
        ...q,
        _chapterId: c.id,
        _chapterTitle: c.title,
      });
    }
  }
  return {
    id: "mixed",
    title: "Mixed Mock",
    desc: `Mixed mock from ${chapters.length} chapter(s).`,
    questions,
  };
}

function storageKey(kind, chapterId) {
  return `pyq:${kind}:${chapterId}`;
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    return;
  }
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// --- Bookmark Helpers ---
function getBookmarks(chapterId) {
  return readJson(`pyq:bookmarks:${chapterId}`, []);
}

function toggleBookmark(chapterId, globalIndex) {
  const bookmarks = getBookmarks(chapterId);
  const idx = bookmarks.indexOf(globalIndex);
  if (idx > -1) {
    bookmarks.splice(idx, 1); // Remove if exists
  } else {
    bookmarks.push(globalIndex); // Add if doesn't exist
  }
  writeJson(`pyq:bookmarks:${chapterId}`, bookmarks);
  renderPractice(); // Re-render to update the icon
}

function isBookmarked(chapterId, globalIndex) {
  return getBookmarks(chapterId).includes(globalIndex);
}

function loadUserChapters() {
  const raw = readJson(USER_CHAPTERS_STORAGE_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw.filter((c) => c && typeof c === "object" && typeof c.id === "string");
}

function saveUserChapters(chapters) {
  writeJson(USER_CHAPTERS_STORAGE_KEY, Array.isArray(chapters) ? chapters : []);
}

function mergeChapters(base, user) {
  const byId = new Map();
  for (const c of base) byId.set(c.id, c);
  for (const c of user) byId.set(c.id, c);
  return Array.from(byId.values());
}

function refreshChapters() {
  CHAPTERS = mergeChapters(BASE_CHAPTERS, loadUserChapters());
}

function normalizeOptions(options) {
  if (!options || typeof options !== "object") throw new Error("Invalid options");
  const keys = ["A", "B", "C", "D"];
  const out = {};
  for (const k of keys) {
    const v = options[k] ?? options[k.toLowerCase()];
    if (typeof v !== "string") throw new Error("Options must have A, B, C, D");
    out[k] = v;
  }
  return out;
}

function normalizeQuestion(q) {
  if (!q || typeof q !== "object") throw new Error("Question must be an object");
  const question_number = Number(q.question_number);
  if (!Number.isFinite(question_number)) throw new Error("question_number must be a number");
  if (typeof q.text !== "string" || !q.text.trim()) throw new Error("text is required");
  const correct_answer_index = Number(q.correct_answer_index);
  if (![0, 1, 2, 3].includes(correct_answer_index)) throw new Error("correct_answer_index must be 0..3");
  const year = q.year === null || q.year === undefined ? null : String(q.year);
  return {
    question_number,
    text: q.text,
    options: normalizeOptions(q.options),
    correct_answer_index,
    year,
  };
}

function normalizeQuestions(list) {
  if (!Array.isArray(list)) throw new Error("Questions JSON must be an array");
  return list.map((q) => normalizeQuestion(q));
}

function upsertUserChapter(chapter) {
  const user = loadUserChapters();
  const idx = user.findIndex((c) => c.id === chapter.id);
  const next = idx >= 0 ? user.map((c, i) => (i === idx ? chapter : c)) : user.concat([chapter]);
  saveUserChapters(next);
  refreshChapters();
}

function clearUserChapters() {
  saveUserChapters([]);
  refreshChapters();
}

function setImportMessage(text, kind) {
  if (!el.chapterImportMsg) return;
  el.chapterImportMsg.textContent = text || "";
  if (kind === "ok") el.chapterImportMsg.style.color = "var(--good)";
  else if (kind === "bad") el.chapterImportMsg.style.color = "var(--danger)";
  else el.chapterImportMsg.style.color = "var(--muted)";
}

function showExportSnippet(text) {
  if (!el.chapterExportWrap || !el.chapterExportOut) return;
  el.chapterExportOut.value = text || "";
  el.chapterExportWrap.hidden = !text;
}

function formatChapterSnippet(chapters) {
  const items = Array.isArray(chapters) ? chapters : [];
  return items
    .map((c) => {
      const qLines = JSON.stringify(c.questions, null, 2)
        .split("\n")
        .map((l) => `  ${l}`)
        .join("\n");
      return `{\n  id: ${JSON.stringify(c.id)},\n  title: ${JSON.stringify(
        c.title,
      )},\n  desc: ${JSON.stringify(c.desc)},\n  questions: ${qLines},\n},`;
    })
    .join("\n\n");
}

async function copyText(text) {
  if (!text) return false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function parseHash() {
  const raw = window.location.hash || "#/home";
  const m = raw.match(/^#\/([^?]+)(\?.*)?$/);
  if (!m) return { route: "home", params: {} };
  const route = decodeURIComponent(m[1] || "home");
  const qs = (m[2] || "").replace(/^\?/, "");
  const params = {};
  if (qs) {
    for (const part of qs.split("&")) {
      const [k, v] = part.split("=");
      if (!k) continue;
      params[decodeURIComponent(k)] = decodeURIComponent(v || "");
    }
  }
  return { route, params };
}

function setView(view) {
  appState.view = view;
  for (const s of el.views) {
    const isOn = s.getAttribute("data-view") === view;
    s.hidden = !isOn;
  }
}

function isPersistentPractice() {
  return (
    appState.mode === "full" &&
    !appState.timeLimitMs &&
    appState.chapterId &&
    appState.chapterId !== "mixed" &&
    !!chapterById(appState.chapterId)
  );
}

function cloneAnswer(answer) {
  return {
    selectedIndex: answer && Number.isInteger(answer.selectedIndex) ? answer.selectedIndex : null,
    isSubmitted: !!(answer && answer.isSubmitted),
    isCorrect: !!(answer && answer.isCorrect),
    visited: !!(answer && answer.visited),
    marked: !!(answer && answer.marked),
    timeMs: Math.max(0, Number(answer && answer.timeMs) || 0),
    startedAt: 0,
  };
}

function progressKey(chapterId) {
  return storageKey("progress", chapterId);
}

function saveProgress() {
  if (!isPersistentPractice()) return;
  const chapter = chapterById(appState.chapterId);
  if (!chapter) return;
  writeJson(progressKey(appState.chapterId), {
    version: PROGRESS_VERSION,
    chapterId: appState.chapterId,
    totalQuestions: chapter.questions.length,
    order: appState.order.slice(),
    idx: appState.idx,
    answers: appState.answers.map((answer, i) => {
      const next = cloneAnswer(answer);
      if (i === appState.idx && answer && answer.startedAt) {
        next.timeMs += Math.max(0, Date.now() - answer.startedAt);
      }
      return next;
    }),
    elapsedMs: appState.elapsedMs,
    updatedAt: Date.now(),
  });
}

function loadProgress(chapterId) {
  const chapter = chapterById(chapterId);
  if (!chapter) return null;
  const saved = readJson(progressKey(chapterId), null);
  if (!saved || saved.version !== PROGRESS_VERSION || saved.chapterId !== chapterId) return null;
  if (!Array.isArray(saved.order) || !Array.isArray(saved.answers)) return null;
  if (saved.totalQuestions !== chapter.questions.length) return null;

  const expectedOrder = chapter.questions.map((_, i) => i);
  const isFullChapter =
    saved.order.length === expectedOrder.length && saved.order.every((value, i) => value === expectedOrder[i]);
  if (!isFullChapter) return null;

  return {
    order: expectedOrder,
    idx: clampInt(saved.idx, 0, 0, Math.max(0, expectedOrder.length - 1)),
    answers: expectedOrder.map((_, i) => cloneAnswer(saved.answers[i])),
    elapsedMs: Math.max(0, Number(saved.elapsedMs) || 0),
  };
}

function answeredProgress(chapterId) {
  const chapter = chapterById(chapterId);
  const saved = readJson(progressKey(chapterId), null);
  if (!chapter || !saved || saved.version !== PROGRESS_VERSION || saved.totalQuestions !== chapter.questions.length) {
    return null;
  }
  const answers = Array.isArray(saved.answers) ? saved.answers : [];
  const completed = answers.filter((a) => a && a.isSubmitted && a.selectedIndex !== null).length;
  return { completed, total: chapter.questions.length };
}

function currentQuestionElapsedMs() {
  const answer = appState.answers[appState.idx];
  if (!answer) return 0;
  const activeMs = answer.startedAt ? Math.max(0, Date.now() - answer.startedAt) : 0;
  return Math.max(0, (Number(answer.timeMs) || 0) + activeMs);
}

function renderTimerText() {
  if (!el.qTimer) return;
  const qTime = `Q Time ${formatDuration(currentQuestionElapsedMs())}`;
  if (appState.timeLimitMs && Number.isFinite(appState.timeLimitMs)) {
    const left = Math.max(0, appState.timeLimitMs - appState.elapsedMs);
    el.qTimer.textContent = `Left ${formatDuration(left)} • ${qTime}`;
    return;
  }
  el.qTimer.textContent = qTime;
}

function pauseCurrentQuestionTimer() {
  const answer = appState.answers[appState.idx];
  if (!answer || !answer.startedAt) return;
  answer.timeMs += Math.max(0, Date.now() - answer.startedAt);
  answer.startedAt = 0;
}

function startCurrentQuestionTimer() {
  const answer = appState.answers[appState.idx];
  if (!answer || answer.isSubmitted || answer.startedAt) return;
  answer.startedAt = Date.now();
}

function makeNewSession(chapterId, order, mode) {
  const chapter = chapterById(chapterId);
  const total = chapter ? order.length : 0;
  appState.chapterId = chapterId;
  appState.mode = mode;
  appState.isExamMode = (mode === "custom"); // Custom mocks are exam mode
  if (mode !== "custom") {
    appState.timeLimitMs = null;
    appState.sessionChapter = null;
  }
  appState.order = order.slice();
  appState.idx = 0;
  appState.answers = Array.from({ length: total }).map(() => ({
    selectedIndex: null,
    isSubmitted: false,
    isCorrect: false,
    visited: false,
    marked: false,
    timeMs: 0,
    startedAt: 0,
  }));
  appState.startedAt = Date.now();
  appState.elapsedMs = 0;
  appState.lastTickAt = Date.now();
  startTimer();
}

function restoreSession(chapterId, saved) {
  appState.chapterId = chapterId;
  appState.mode = "full";
  appState.timeLimitMs = null;
  appState.sessionChapter = null;
  appState.order = saved.order.slice();
  appState.idx = saved.idx;
  appState.answers = saved.answers.map(cloneAnswer);
  appState.startedAt = Date.now();
  appState.elapsedMs = saved.elapsedMs;
  appState.lastTickAt = Date.now();
  startTimer();
}

function startTimer() {
  stopTimer();
  appState.timerId = window.setInterval(() => {
    if (!appState.startedAt) return;
    const now = Date.now();
    appState.elapsedMs += Math.max(0, now - appState.lastTickAt);
    appState.lastTickAt = now;
    if (appState.view === "practice") {
      renderTimerText();
      if (appState.timeLimitMs && Number.isFinite(appState.timeLimitMs)) {
        const left = Math.max(0, appState.timeLimitMs - appState.elapsedMs);
        if (left <= 0) {
          finishSession();
          return;
        }
      }
      saveProgress();
    }
    // Don't update time in results view - show final time only
  }, 250);
}

function stopTimer() {
  if (appState.timerId) {
    window.clearInterval(appState.timerId);
    appState.timerId = null;
  }
}

function resumeSessionTimer() {
  if (appState.timerId) return;
  appState.startedAt = appState.startedAt || Date.now();
  appState.lastTickAt = Date.now();
  startTimer();
}

function ensureSessionForChapter(chapterId) {
  const chapter = chapterById(chapterId);
  if (!chapter) return;
  if (appState.chapterId !== chapterId || appState.order.length === 0) {
    const saved = loadProgress(chapterId);
    if (saved) {
      restoreSession(chapterId, saved);
      return;
    }
    makeNewSession(
      chapterId,
      chapter.questions.map((_, i) => i),
      "full",
    );
  }
}

function homeStatsText() {
  const totalQ = CHAPTERS.reduce((a, c) => a + c.questions.length, 0);
  const bestCount = CHAPTERS.filter((c) => !!readJson(storageKey("best", c.id), null)).length;
  return `${CHAPTERS.length} chapter • ${totalQ} questions • ${bestCount} attempted`;
}

function renderCustom() {
  setView("custom");
  setCustomMessage("", "muted");
  refreshChapters();

  if (el.customChapterSelect) {
    el.customChapterSelect.innerHTML = "";
    for (const c of CHAPTERS) {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = `${c.title} (${c.questions.length} Q)`;
      el.customChapterSelect.appendChild(opt);
    }
  }

  if (el.customChaptersChecks) {
    el.customChaptersChecks.innerHTML = "";
    for (const c of CHAPTERS) {
      const label = document.createElement("label");
      label.className = "check";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = c.id;
      label.appendChild(input);
      const span = document.createElement("span");
      span.textContent = `${c.title}`;
      label.appendChild(span);
      el.customChaptersChecks.appendChild(label);
    }
  }

  syncCustomTypeUi();
}

function currentMockType() {
  if (!el.customForm) return "chapter";
  const r = el.customForm.querySelector('input[name="mockType"]:checked');
  return r && r.value === "mixed" ? "mixed" : "chapter";
}

function syncCustomTypeUi() {
  const t = currentMockType();
  if (el.chapterwiseRow) el.chapterwiseRow.hidden = t !== "chapter";
  if (el.mixedRow) el.mixedRow.hidden = t !== "mixed";
}

function startCustomMock() {
  setCustomMessage("", "muted");
  refreshChapters();

  const type = currentMockType();
  const qCount = clampInt(el.customQCount?.value, 25, 1, 1000);
  const minutes = clampInt(el.customMinutes?.value, 15, 1, 10000);

  if (type === "chapter") {
    const chapterId = el.customChapterSelect?.value || (CHAPTERS[0] ? CHAPTERS[0].id : "percentage");
    const chapter = chapterById(chapterId);
    if (!chapter) {
      setCustomMessage("Select a valid chapter.", "bad");
      return;
    }
    const maxQ = chapter.questions.length;
    const n = Math.min(qCount, maxQ);
    const indices = shuffledCopy(chapter.questions.map((_, i) => i)).slice(0, n);
    appState.sessionChapter = null;
    appState.timeLimitMs = minutes * 60 * 1000;
    makeNewSession(chapterId, indices, "custom");
    requestFullscreen();
    window.location.hash = `#/practice?chapter=${encodeURIComponent(chapterId)}`;
    return;
  }

  const picked = Array.from(el.customChaptersChecks?.querySelectorAll('input[type="checkbox"]:checked') || []).map(
    (x) => x.value,
  );
  if (picked.length < 2) {
    setCustomMessage("Select at least 2 chapters for a mixed mock.", "bad");
    return;
  }
  const mixed = buildMixedChapter(picked);
  if (!mixed.questions.length) {
    setCustomMessage("Selected chapters have no questions.", "bad");
    return;
  }
  const n = Math.min(qCount, mixed.questions.length);
  const indices = shuffledCopy(mixed.questions.map((_, i) => i)).slice(0, n);
  appState.sessionChapter = mixed;
  appState.timeLimitMs = minutes * 60 * 1000;
  makeNewSession(mixed.id, indices, "custom");
  requestFullscreen();
  window.location.hash = "#/practice?chapter=mixed";
}

function renderHome() {
  setView("home");
  
  // Update subject stats
  const mathsStats = getSubjectStats('maths');
  const reasoningStats = getSubjectStats('reasoning');
  const englishStats = getSubjectStats('english');
  
  const mathsStatsEl = document.getElementById('mathsStats');
  const reasoningStatsEl = document.getElementById('reasoningStats');
  const englishStatsEl = document.getElementById('englishStats');
  const homeMeta = document.getElementById('homeMeta');
  
  if (homeMeta) {
    const totalChapters = mathsStats.chapters + reasoningStats.chapters + englishStats.chapters;
    const totalQuestions = mathsStats.questions + reasoningStats.questions + englishStats.questions;
    const totalAttempted = mathsStats.attempted + reasoningStats.attempted + englishStats.attempted;
    homeMeta.textContent = `${totalChapters} Chapters • ${totalQuestions} Questions • ${totalAttempted} Attempted`;
  }
  
  if (mathsStatsEl) {
    mathsStatsEl.innerHTML = `
      <div class="subject-card__stat">
        <span class="subject-card__stat-value">${mathsStats.chapters}</span>
        <span class="subject-card__stat-label">Chapters</span>
      </div>
      <div class="subject-card__stat">
        <span class="subject-card__stat-value">${mathsStats.questions}</span>
        <span class="subject-card__stat-label">Questions</span>
      </div>
      <div class="subject-card__stat">
        <span class="subject-card__stat-value">${mathsStats.attempted}</span>
        <span class="subject-card__stat-label">Attempted</span>
      </div>
    `;
  }
  
  if (reasoningStatsEl) {
    reasoningStatsEl.innerHTML = `
      <div class="subject-card__stat">
        <span class="subject-card__stat-value">${reasoningStats.chapters}</span>
        <span class="subject-card__stat-label">Chapters</span>
      </div>
      <div class="subject-card__stat">
        <span class="subject-card__stat-value">${reasoningStats.questions}</span>
        <span class="subject-card__stat-label">Questions</span>
      </div>
      <div class="subject-card__stat">
        <span class="subject-card__stat-value">${reasoningStats.attempted}</span>
        <span class="subject-card__stat-label">Attempted</span>
      </div>
    `;
  }
  
  if (englishStatsEl) {
    englishStatsEl.innerHTML = `
      <div class="subject-card__stat">
        <span class="subject-card__stat-value">${englishStats.chapters}</span>
        <span class="subject-card__stat-label">Chapters</span>
      </div>
      <div class="subject-card__stat">
        <span class="subject-card__stat-value">${englishStats.questions}</span>
        <span class="subject-card__stat-label">Questions</span>
      </div>
      <div class="subject-card__stat">
        <span class="subject-card__stat-value">${englishStats.attempted}</span>
        <span class="subject-card__stat-label">Attempted</span>
      </div>
    `;
  }
  
  // Setup subject card click handlers
  const subjectCards = document.querySelectorAll('.subject-card');
  subjectCards.forEach(card => {
    const btn = card.querySelector('.subject-card__btn');
    if (btn) {
      btn.addEventListener('click', () => {
        const subject = card.dataset.subject;
        window.location.hash = `#/subject?name=${subject}`;
      });
    }
  });
  
  // Setup custom mock button handler
  const customMockBtn = document.getElementById('customMockBtn');
  if (customMockBtn) {
    customMockBtn.addEventListener('click', () => {
      window.location.hash = '#/custom';
    });
  }
}

function currentQuestionInfo() {
  const chapter = chapterById(appState.chapterId);
  if (!chapter) return null;
  const globalIndex = appState.order[appState.idx];
  const question = chapter.questions[globalIndex];
  const answer = appState.answers[appState.idx];
  return { chapter, globalIndex, question, answer };
}

function clearAutoNext() {
  if (appState.autoNextId) {
    window.clearTimeout(appState.autoNextId);
    appState.autoNextId = null;
  }
}

function paletteStateFor(answer) {
  if (!answer.visited) return "nv";
  if (answer.marked) return "mr";
  
  // In exam mode, show different states
  if (appState.isExamMode) {
    // Just show if answered or not
    if (answer.selectedIndex !== null) return "ans";
    return "na";
  }
  
  // Practice mode: show correct/wrong
  if (answer.isSubmitted && answer.selectedIndex !== null) {
    return answer.isCorrect ? "ans" : "ans-bad"; 
  }
  return "na";
}

function renderPalette(chapter) {
  if (!el.paletteList) return;
  
  // Update legend based on mode
  const legendEl = document.querySelector('.legend');
  if (legendEl) {
    if (appState.isExamMode) {
      legendEl.innerHTML = `
        <div class="legend__item">
          <div class="dot"></div>
          <span>Not Visited</span>
        </div>
        <div class="legend__item">
          <div class="dot dot--na"></div>
          <span>Not Answered</span>
        </div>
        <div class="legend__item">
          <div class="dot dot--ans"></div>
          <span>Answered</span>
        </div>
      `;
    } else {
      legendEl.innerHTML = `
        <div class="legend__item">
          <div class="dot"></div>
          <span>Not Visited</span>
        </div>
        <div class="legend__item">
          <div class="dot dot--na"></div>
          <span>Not Answered</span>
        </div>
        <div class="legend__item">
          <div class="dot dot--ans"></div>
          <span>Correct</span>
        </div>
        <div class="legend__item">
          <div class="dot dot--na"></div>
          <span>Wrong</span>
        </div>
        <div class="legend__item">
          <div class="dot dot--mr"></div>
          <span>Marked</span>
        </div>
      `;
    }
  }
  
  el.paletteList.innerHTML = "";
  for (let i = 0; i < appState.order.length; i += 1) {
    const globalIndex = appState.order[i];
    const q = chapter.questions[globalIndex];
    const a = appState.answers[i];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pbtn";
    
    // --- Bookmark Palette Logic ---
    const bookmarked = isBookmarked(chapter.id, globalIndex);
    
    // Add a star and the number if bookmarked, otherwise just the number
    btn.innerHTML = bookmarked 
      ? `<span class="bmark-star">★</span> ${q.question_number}` 
      : String(q.question_number);
    
    if (bookmarked) {
      btn.classList.add("is-bookmarked");
    }
    // ------------------------------

    btn.dataset.state = paletteStateFor(a);
    if (i === appState.idx) btn.classList.add("is-current");
    btn.addEventListener("click", () => {
      pauseCurrentQuestionTimer();
      appState.idx = i;
      startCurrentQuestionTimer();
      saveProgress();
      renderPractice();
      // Auto-collapse palette on mobile after selection
      if (window.innerWidth <= 640 && el.palettePanel) {
        el.palettePanel.classList.add('is-collapsed');
      }
    });
    el.paletteList.appendChild(btn);
  }
}

function initMobilePalette() {
  if (!el.palettePanel) return;
  
  // Remove any existing listeners
  const oldHead = el.palettePanel.querySelector('.palette__head');
  if (oldHead) {
    const newHead = oldHead.cloneNode(true);
    oldHead.parentNode.replaceChild(newHead, oldHead);
  }
  
  // Add mobile toggle functionality
  const paletteHead = el.palettePanel.querySelector('.palette__head');
  if (paletteHead && window.innerWidth <= 640) {
    paletteHead.style.cursor = 'pointer';
    paletteHead.addEventListener('click', () => {
      el.palettePanel.classList.toggle('is-collapsed');
    });
    // Start collapsed on mobile
    el.palettePanel.classList.add('is-collapsed');
  } else if (paletteHead) {
    paletteHead.style.cursor = 'default';
    el.palettePanel.classList.remove('is-collapsed');
  }
}

function renderPractice() {
  const chapter = chapterById(appState.chapterId);
  if (!chapter) {
    window.location.hash = "#/home";
    return;
  }

  setView("practice");
  syncFullscreenUi();
  initMobilePalette();
  
  // Show mode indicator
  if (appState.isExamMode) {
    el.practiceChapterTitle.innerHTML = `${chapter.title} <span style="background: #667eea; color: white; font-size: 11px; padding: 3px 8px; border-radius: 4px; margin-left: 8px; font-weight: 600;">EXAM MODE</span>`;
  } else {
    el.practiceChapterTitle.textContent = chapter.title;
  }
  
  renderTimerText();
  clearAutoNext();

  const total = appState.order.length;
  const pos = appState.idx + 1;
  el.progressFill.style.width = `${(pos / Math.max(1, total)) * 100}%`;

  const info = currentQuestionInfo();
  if (!info) return;
  const { globalIndex, question, answer } = info;
  answer.visited = true;
  startCurrentQuestionTimer();

  // Create Meta tags
  const metaParts = [];
  metaParts.push(`Q${question.question_number}`);
  if (question.year) metaParts.push(`Year ${question.year}`);
  if (appState.mode === "retryWrong") metaParts.push("Retry Wrong");

  // Dynamic Header for Meta + Bookmark
  el.qMeta.innerHTML = ''; 
  const metaText = document.createElement('span');
  metaText.textContent = metaParts.join(" • ");
  el.qMeta.appendChild(metaText);

  // Bookmark Button Logic
  const bookmarked = isBookmarked(appState.chapterId, globalIndex);
  const bBtn = document.createElement('button');
  bBtn.className = `btn btn--xs ${bookmarked ? 'btn--primary' : 'btn--soft'}`;
  bBtn.style.marginLeft = "10px";
  bBtn.innerHTML = bookmarked ? '★ Bookmarked' : '☆ Bookmark';
  bBtn.onclick = () => toggleBookmark(appState.chapterId, globalIndex);
  el.qMeta.appendChild(bBtn);

  // Update Question Text
  el.qText.textContent = question.text;

  // Apply Zoom State
  if (appState.isZoomed) {
    el.qText.classList.add("is-zoomed");
    if (el.zoomBtn) {
      el.zoomBtn.classList.add("is-active");
      const textSpan = el.zoomBtn.querySelector(".zoom-text");
      if (textSpan) textSpan.textContent = "Unzoom";
    }
  } else {
    el.qText.classList.remove("is-zoomed");
    if (el.zoomBtn) {
      el.zoomBtn.classList.remove("is-active");
      const textSpan = el.zoomBtn.querySelector(".zoom-text");
      if (textSpan) textSpan.textContent = "Zoom";
    }
  }

  const answeredCount = appState.answers.filter((a) => a.selectedIndex !== null).length;
  const markedCount = appState.answers.filter((a) => a.marked).length;
  
  // In exam mode, show different labels
  if (appState.isExamMode) {
    const notAnsweredCount = total - answeredCount;
    el.progressMeta.textContent = `${pos}/${total} • Answered ${answeredCount} • Not Answered ${notAnsweredCount}`;
  } else {
    const submittedCount = appState.answers.filter((a) => a.isSubmitted && a.selectedIndex !== null).length;
    const notAnsweredCount = appState.answers.filter((a) => a.visited && !(a.isSubmitted && a.selectedIndex !== null) && !a.marked).length;
    el.progressMeta.textContent = `${pos}/${total} • Answered ${submittedCount} • Marked ${markedCount} • Not Answered ${notAnsweredCount}`;
  }

  el.options.innerHTML = "";
  const optionTexts = KEYS.map((k) => question.options[k]);

  for (let i = 0; i < 4; i += 1) {
    const btn = document.createElement("button");
    btn.className = "opt";
    btn.type = "button";
    btn.setAttribute("aria-pressed", answer.selectedIndex === i ? "true" : "false");
    btn.dataset.idx = String(i);

    const radio = document.createElement("div");
    radio.className = "opt__radio";

    const text = document.createElement("div");
    text.className = "opt__text";
    text.textContent = `${KEYS[i]}. ${optionTexts[i]}`;

    btn.appendChild(radio);
    btn.appendChild(text);

    // In exam mode, don't show feedback and don't disable options
    if (appState.isExamMode) {
      // Just allow selection, no instant feedback
      btn.addEventListener("click", () => pickOption(i));
    } else {
      // Practice mode: show instant feedback
      if (answer.isSubmitted) {
        const correctIdx = question.correct_answer_index;
        if (i === correctIdx) btn.classList.add("is-correct");
        if (answer.selectedIndex === i && answer.selectedIndex !== correctIdx) btn.classList.add("is-wrong");
        btn.disabled = true;
      } else {
        btn.addEventListener("click", () => submitInstant(i));
      }
    }

    el.options.appendChild(btn);
  }

  // Show feedback only in practice mode and when submitted
  if (!appState.isExamMode && answer.isSubmitted) {
    const correctIdx = question.correct_answer_index;
    const correctKey = KEYS[correctIdx];
    const correctText = question.options[correctKey];
    
    // Clear feedback and rebuild with proper structure
    el.feedback.innerHTML = '';
    
    if (answer.isCorrect) {
      el.feedback.className = "feedback feedback--ok";
      const resultText = document.createElement('div');
      resultText.className = 'feedback__result';
      resultText.textContent = `✓ Correct • ${correctKey}. ${correctText}`;
      el.feedback.appendChild(resultText);
    } else {
      const pickedKey = answer.selectedIndex === null ? "—" : KEYS[answer.selectedIndex];
      el.feedback.className = "feedback feedback--bad";
      const resultText = document.createElement('div');
      resultText.className = 'feedback__result';
      resultText.textContent = `✗ Wrong • Your: ${pickedKey} • Correct: ${correctKey}. ${correctText}`;
      el.feedback.appendChild(resultText);
    }
    
    // Add solution if available
    if (question.solution) {
      const solutionDiv = document.createElement('div');
      solutionDiv.className = 'feedback__solution';
      const solutionTitle = document.createElement('div');
      solutionTitle.className = 'feedback__solution-title';
      solutionTitle.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Explanation</span>`;
      const solutionText = document.createElement('div');
      solutionText.className = 'feedback__solution-text';
      solutionText.textContent = question.solution;
      solutionDiv.appendChild(solutionTitle);
      solutionDiv.appendChild(solutionText);
      el.feedback.appendChild(solutionDiv);
    }
    
    el.feedback.hidden = false;
  } else {
    el.feedback.hidden = true;
  }

  el.prevBtn.disabled = appState.idx === 0;
  
  // Update UI elements based on mode
  if (el.clearBtn) {
    el.clearBtn.style.display = appState.isExamMode ? 'none' : 'inline-flex';
  }
  
  // Update finish button text based on mode
  if (el.finishBtn) {
    if (appState.isExamMode) {
      el.finishBtn.textContent = "Submit Test";
      el.finishBtn.className = "btn btn--danger";
    } else {
      el.finishBtn.textContent = "Finish";
      el.finishBtn.className = "btn btn--soft";
    }
  }
  
  renderPalette(chapter);
}

function pickOption(idx) {
  const info = currentQuestionInfo();
  if (!info) return;

  // In exam mode, just record the selection without submitting
  if (appState.isExamMode) {
    info.answer.selectedIndex = idx;
    info.answer.visited = true;
    info.answer.startedAt = info.answer.startedAt || Date.now();
    saveProgress();
    renderPractice();
  } else {
    // In practice mode, behave as before (for any legacy code paths)
    info.answer.selectedIndex = idx;
    info.answer.startedAt = info.answer.startedAt || Date.now();

    const buttons = Array.from(el.options.querySelectorAll(".opt"));
    for (const b of buttons) {
      const i = Number(b.dataset.idx);
      b.setAttribute("aria-pressed", i === idx ? "true" : "false");
    }
  }
}

function submitInstant(idx) {
  const info = currentQuestionInfo();
  if (!info) return;
  const { question, answer } = info;
  if (answer.isSubmitted) return;

  answer.selectedIndex = idx;
  answer.visited = true;
  answer.marked = false;
  pauseCurrentQuestionTimer();

  answer.isSubmitted = true;
  answer.isCorrect = idx === question.correct_answer_index;
  saveProgress();
  renderPractice();
}

function clearResponse() {
  const info = currentQuestionInfo();
  if (!info) return;
  const { answer } = info;
  clearAutoNext();
  answer.selectedIndex = null;
  answer.isSubmitted = false;
  answer.isCorrect = false;
  answer.marked = false;
  answer.startedAt = Date.now();
  saveProgress();
  renderPractice();
}

function goPrev() {
  if (appState.idx <= 0) return;
  clearAutoNext();
  pauseCurrentQuestionTimer();
  appState.idx -= 1;
  startCurrentQuestionTimer();
  saveProgress();
  renderPractice();
}

function goNext() {
  const total = appState.order.length;
  if (appState.idx >= total - 1) {
    pauseCurrentQuestionTimer();
    saveProgress();
    window.location.hash = `#/results?chapter=${encodeURIComponent(appState.chapterId)}`;
    return;
  }
  clearAutoNext();
  pauseCurrentQuestionTimer();
  appState.idx += 1;
  startCurrentQuestionTimer();
  saveProgress();
  renderPractice();
}

function finishSession() {
  // In exam mode, show confirmation with unanswered count
  if (appState.isExamMode) {
    const total = appState.order.length;
    const answered = appState.answers.filter((a) => a.selectedIndex !== null).length;
    const unanswered = total - answered;
    
    let message = `Are you sure you want to submit the test?`;
    if (unanswered > 0) {
      message = `You have ${unanswered} unanswered question${unanswered > 1 ? 's' : ''}. Are you sure you want to submit?`;
    }
    
    if (!window.confirm(message)) {
      return;
    }
  }
  
  pauseCurrentQuestionTimer();
  
  // In exam mode, evaluate all answers before showing results
  if (appState.isExamMode) {
    const chapter = chapterById(appState.chapterId);
    if (chapter) {
      for (let i = 0; i < appState.order.length; i += 1) {
        const globalIndex = appState.order[i];
        const q = chapter.questions[globalIndex];
        const a = appState.answers[i];
        
        // Mark as submitted and evaluate correctness for ALL questions
        // Even unattempted ones need to be marked as submitted
        a.isSubmitted = true;
        if (a.selectedIndex !== null) {
          a.isCorrect = a.selectedIndex === q.correct_answer_index;
        } else {
          a.isCorrect = false;
        }
      }
    }
  }
  
  saveProgress();
  window.location.hash = `#/results?chapter=${encodeURIComponent(appState.chapterId)}`;
}

function computeSummary() {
  const total = appState.order.length;
  const chapter = chapterById(appState.chapterId);
  const attempted = appState.answers.filter((a) => a.isSubmitted && a.selectedIndex !== null).length;
  let correct = 0;
  if (chapter) {
    for (let i = 0; i < appState.order.length; i += 1) {
      const globalIndex = appState.order[i];
      const q = chapter.questions[globalIndex];
      const a = appState.answers[i];
      if (a.isSubmitted && a.selectedIndex !== null && a.selectedIndex === q.correct_answer_index) {
        correct += 1;
      }
    }
  }
  const accuracy = total ? (correct / total) * 100 : 0;
  return { total, attempted, correct, accuracy, elapsedMs: appState.elapsedMs, mode: appState.mode };
}

function updateBest(chapterId, summary) {
  const bestKey = storageKey("best", chapterId);
  const best = readJson(bestKey, null);
  const next = {
    correct: summary.correct,
    total: summary.total,
    accuracy: summary.accuracy,
    elapsedMs: summary.elapsedMs,
    at: Date.now(),
  };

  const isBetter =
    !best ||
    next.correct > best.correct ||
    (next.correct === best.correct && next.accuracy > best.accuracy) ||
    (next.correct === best.correct && next.accuracy === best.accuracy && next.elapsedMs < best.elapsedMs);

  if (isBetter) writeJson(bestKey, next);
}

function renderResults() {
  const chapter = chapterById(appState.chapterId);
  if (!chapter) {
    window.location.hash = "#/home";
    return;
  }

  setView("results");
  
  // Stop timer and save final time
  stopTimer();
  
  el.resultsChapterTitle.textContent = chapter.title;

  const summary = computeSummary();
  const lastKey = storageKey("lastSession", appState.chapterId);
  writeJson(lastKey, { ...summary, at: Date.now() });
  updateBest(appState.chapterId, summary);

  el.scoreValue.textContent = `${summary.correct}/${summary.total}`;
  
  if (appState.isExamMode) {
    el.scoreSub.textContent = "Exam Score";
  } else {
    el.scoreSub.textContent = summary.mode === "retryWrong" ? "Retry session score" : "Practice Score";
  }
  
  el.accValue.textContent = `${Math.round(summary.accuracy)}%`;
  
  // Set final time once and don't let timer update it
  el.timeValue.textContent = formatDuration(summary.elapsedMs);
  
  el.attemptedValue.textContent = `${summary.attempted}/${summary.total}`;

  el.reviewMeta.textContent = "Click any card to view solution";
  el.reviewList.innerHTML = "";

  for (let i = 0; i < appState.order.length; i += 1) {
    const globalIndex = appState.order[i];
    const q = chapter.questions[globalIndex];
    const a = appState.answers[i];

    const chip = document.createElement("div");
    chip.className = "chip";
    chip.tabIndex = 0;
    chip.setAttribute("role", "button");
    chip.setAttribute("aria-label", `Review question ${q.question_number}`);

    const top = document.createElement("div");
    top.className = "chip__top";

    const qn = document.createElement("div");
    qn.className = "chip__q";
    qn.textContent = `Q${q.question_number}`;

    const st = document.createElement("div");
    st.className = "chip__s";
    
    // Check if question was attempted (has a selected answer)
    if (a.selectedIndex === null) {
      st.classList.add("na");
      st.textContent = "Unattempted";
    } else if (a.isCorrect) {
      st.classList.add("ok");
      st.textContent = "Correct";
    } else {
      st.classList.add("bad");
      st.textContent = "Wrong";
    }

    top.appendChild(qn);
    top.appendChild(st);

    const t = document.createElement("div");
    t.className = "chip__t";
    t.textContent = q.text;

    chip.appendChild(top);
    chip.appendChild(t);

    // Add click handler to show solution modal
    (function(idx, gIdx, question, ans) {
      const showSolution = () => {
        showQuestionSolutionModal(idx, gIdx, question, ans, chapter);
      };
      chip.addEventListener("click", showSolution);
      chip.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          showSolution();
        }
      });
    })(i, globalIndex, q, a);

    el.reviewList.appendChild(chip);
  }
}

function showQuestionSolutionModal(index, globalIndex, question, answer, chapter) {
  // Remove any existing modal first
  const existingModals = document.querySelectorAll('.modal-overlay');
  existingModals.forEach(modal => {
    if (modal.parentNode) {
      modal.parentNode.removeChild(modal);
    }
  });
  
  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  
  // Create modal content
  const modal = document.createElement('div');
  modal.className = 'modal-content';
  
  // Modal header
  const header = document.createElement('div');
  header.className = 'modal-header';
  
  const title = document.createElement('h3');
  title.textContent = `Question ${question.question_number}`;
  if (question.year) {
    title.textContent += ` (${question.year})`;
  }
  
  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.innerHTML = '×';
  closeBtn.setAttribute('aria-label', 'Close modal');
  
  header.appendChild(title);
  header.appendChild(closeBtn);
  modal.appendChild(header);
  
  // Question text
  const questionText = document.createElement('div');
  questionText.className = 'modal-question';
  questionText.textContent = question.text;
  modal.appendChild(questionText);
  
  // Options
  const optionsDiv = document.createElement('div');
  optionsDiv.className = 'modal-options';
  
  const correctIdx = question.correct_answer_index;
  
  for (let i = 0; i < 4; i++) {
    const optDiv = document.createElement('div');
    optDiv.className = 'modal-option';
    
    if (i === correctIdx) {
      optDiv.classList.add('is-correct');
    }
    if (answer.selectedIndex === i && i !== correctIdx) {
      optDiv.classList.add('is-wrong');
    }
    
    const optLabel = document.createElement('div');
    optLabel.className = 'modal-option-label';
    optLabel.textContent = KEYS[i];
    
    const optText = document.createElement('div');
    optText.className = 'modal-option-text';
    optText.textContent = question.options[KEYS[i]];
    
    optDiv.appendChild(optLabel);
    optDiv.appendChild(optText);
    optionsDiv.appendChild(optDiv);
  }
  
  modal.appendChild(optionsDiv);
  
  // Status
  const statusDiv = document.createElement('div');
  statusDiv.className = 'modal-status';
  
  if (answer.selectedIndex === null) {
    statusDiv.innerHTML = '<span class="status-badge status-unattempted">⚠️ Unattempted</span>';
    statusDiv.innerHTML += `<span class="status-info">Correct Answer: <strong>${KEYS[correctIdx]}</strong></span>`;
  } else if (answer.isCorrect) {
    statusDiv.innerHTML = '<span class="status-badge status-correct">✓ Correct</span>';
    statusDiv.innerHTML += `<span class="status-info">Your Answer: <strong>${KEYS[answer.selectedIndex]}</strong></span>`;
  } else {
    statusDiv.innerHTML = '<span class="status-badge status-wrong">✗ Wrong</span>';
    statusDiv.innerHTML += `<span class="status-info">Your Answer: <strong>${KEYS[answer.selectedIndex]}</strong> • Correct: <strong>${KEYS[correctIdx]}</strong></span>`;
  }
  
  modal.appendChild(statusDiv);
  
  // Solution
  if (question.solution) {
    const solutionDiv = document.createElement('div');
    solutionDiv.className = 'modal-solution';
    
    const solutionTitle = document.createElement('div');
    solutionTitle.className = 'modal-solution-title';
    solutionTitle.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span>Solution & Explanation</span>
    `;
    
    const solutionText = document.createElement('div');
    solutionText.className = 'modal-solution-text';
    solutionText.textContent = question.solution;
    
    solutionDiv.appendChild(solutionTitle);
    solutionDiv.appendChild(solutionText);
    modal.appendChild(solutionDiv);
  }
  
  // Footer
  const footer = document.createElement('div');
  footer.className = 'modal-footer';
  
  const backBtn = document.createElement('button');
  backBtn.className = 'btn btn--secondary';
  backBtn.textContent = 'Close';
  
  footer.appendChild(backBtn);
  modal.appendChild(footer);
  
  overlay.appendChild(modal);
  
  // Close modal function
  const closeModal = () => {
    const modalToRemove = document.querySelector('.modal-overlay');
    if (modalToRemove && modalToRemove.parentNode) {
      document.body.removeChild(modalToRemove);
    }
    document.removeEventListener('keydown', handleEscape);
  };
  
  // Attach close handlers
  closeBtn.onclick = closeModal;
  backBtn.onclick = closeModal;
  
  // Close on overlay click
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      closeModal();
    }
  };
  
  // Close on Escape key
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      closeModal();
    }
  };
  document.addEventListener('keydown', handleEscape);
  
  document.body.appendChild(overlay);
}

function retryWrong() {
  const chapter = chapterById(appState.chapterId);
  if (!chapter) return;

  const wrongPositions = [];
  for (let i = 0; i < appState.order.length; i += 1) {
    const a = appState.answers[i];
    const globalIndex = appState.order[i];
    const q = chapter.questions[globalIndex];
    if (!a.isSubmitted || a.selectedIndex === null) {
      wrongPositions.push(globalIndex);
      continue;
    }
    if (a.selectedIndex !== q.correct_answer_index) wrongPositions.push(globalIndex);
  }

  const nextOrder = Array.from(new Set(wrongPositions));
  pauseCurrentQuestionTimer();
  if (nextOrder.length === 0) {
    makeNewSession(
      chapter.id,
      chapter.questions.map((_, i) => i),
      "full",
    );
  } else {
    makeNewSession(chapter.id, nextOrder, "retryWrong");
  }

  window.location.hash = `#/practice?chapter=${encodeURIComponent(chapter.id)}`;
}

function attachHandlers() {
  document.addEventListener(
    "click",
    (e) => {
      const a = e.target && e.target.closest ? e.target.closest('a[href^="#/practice"]') : null;
      if (a) requestFullscreen();
    },
    true,
  );

  if (el.fsBtn) {
    el.fsBtn.addEventListener("click", () => toggleFullscreen());
  }
  document.addEventListener("fullscreenchange", () => syncFullscreenUi());

  if (el.customForm) {
    el.customForm.addEventListener("change", (e) => {
      if (e && e.target && e.target.name === "mockType") syncCustomTypeUi();
    });
  }
  if (el.customStartBtn) {
    el.customStartBtn.addEventListener("click", () => startCustomMock());
  }

  if (el.zoomBtn) {
    el.zoomBtn.addEventListener("click", () => {
      appState.isZoomed = !appState.isZoomed;
      renderPractice();
    });
  }

  el.prevBtn.addEventListener("click", goPrev);
  el.clearBtn.addEventListener("click", clearResponse);
  el.nextBtn.addEventListener("click", goNext);
  el.finishBtn.addEventListener("click", finishSession);
  el.reviewBtn.addEventListener("click", () => {
    window.location.hash = `#/practice?chapter=${encodeURIComponent(appState.chapterId)}&pos=${encodeURIComponent(String(0))}`;
  });
  el.retryWrongBtn.addEventListener("click", retryWrong);

  if (el.chapterImportBtn) {
    el.chapterImportBtn.addEventListener("click", () => {
      setImportMessage("", "muted");
      try {
        const title = (el.chapterImportTitle?.value || "").trim();
        if (!title) {
          setImportMessage("Enter a chapter name.", "bad");
          return;
        }

        const idRaw = (el.chapterImportId?.value || "").trim();
        const id = idRaw || slugify(title);
        if (!id) {
          setImportMessage("Chapter id is required (or provide a valid name).", "bad");
          return;
        }

        const desc = (el.chapterImportDesc?.value || "").trim() || `SSC CGL PYQs for ${title}.`;
        const jsonText = (el.chapterImportJson?.value || "").trim();
        if (!jsonText) {
          setImportMessage("Paste the questions JSON array.", "bad");
          return;
        }

        const parsed = JSON.parse(jsonText);
        const questions = normalizeQuestions(parsed);
        const chapter = { id, title, desc, questions };
        upsertUserChapter(chapter);
        showExportSnippet("");
        setImportMessage(`Saved "${title}" with ${questions.length} questions.`, "ok");
        if (appState.view === "home") renderHome();
      } catch (e) {
        const msg = e && typeof e.message === "string" ? e.message : "Invalid JSON";
        setImportMessage(msg, "bad");
      }
    });
  }

  if (el.chapterExportBtn) {
    el.chapterExportBtn.addEventListener("click", async () => {
      setImportMessage("", "muted");
      try {
        const jsonText = (el.chapterImportJson?.value || "").trim();
        const title = (el.chapterImportTitle?.value || "").trim();
        const idRaw = (el.chapterImportId?.value || "").trim();
        const id = idRaw || (title ? slugify(title) : "");
        const desc = (el.chapterImportDesc?.value || "").trim() || (title ? `SSC CGL PYQs for ${title}.` : "");

        let chapters = [];
        if (jsonText && title) {
          const parsed = JSON.parse(jsonText);
          const questions = normalizeQuestions(parsed);
          chapters = [{ id: id || slugify(title), title, desc, questions }];
        } else {
          chapters = loadUserChapters();
        }

        if (!chapters.length) {
          setImportMessage("No imported chapters to export.", "bad");
          showExportSnippet("");
          return;
        }

        const snippet = formatChapterSnippet(chapters);
        showExportSnippet(snippet);

        let copied = await copyText(snippet);
        if (!copied && el.chapterExportOut) {
          el.chapterExportOut.focus();
          el.chapterExportOut.select();
          try {
            copied = document.execCommand("copy");
          } catch {
            copied = false;
          }
        }

        setImportMessage(copied ? "Snippet copied to clipboard." : "Snippet ready (copy manually).", "ok");
      } catch (e) {
        const msg = e && typeof e.message === "string" ? e.message : "Invalid JSON";
        setImportMessage(msg, "bad");
      }
    });
  }

  if (el.chapterClearBtn) {
    el.chapterClearBtn.addEventListener("click", () => {
      const ok = window.confirm("Clear all imported chapters?");
      if (!ok) return;
      clearUserChapters();
      showExportSnippet("");
      setImportMessage("Imported chapters cleared.", "ok");
      if (appState.view === "home") renderHome();
    });
  }

  window.addEventListener("keydown", (e) => {
    if (appState.view !== "practice") return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const info = currentQuestionInfo();
    if (!info) return;

    if (e.key >= "1" && e.key <= "4") {
      submitInstant(Number(e.key) - 1);
      e.preventDefault();
      return;
    }

    if (e.key === "Enter") {
      goNext();
      return;
    }

    if (e.key.toLowerCase() === "n") {
      goNext();
      return;
    }

    if (e.key.toLowerCase() === "p") {
      goPrev();
      e.preventDefault();
      return;
    }

    if (e.key.toLowerCase() === "m") {
      return;
    }

    if (e.key.toLowerCase() === "c") {
      clearResponse();
      e.preventDefault();
      return;
    }

    if (e.key.toLowerCase() === "r") {
      finishSession();
      e.preventDefault();
    }
  });

  window.addEventListener("beforeunload", () => {
    saveProgress();
  });
}

function handleRoute() {
  const { route, params } = parseHash();
  if (route === "home") {
    pauseCurrentQuestionTimer();
    saveProgress();
    stopTimer();
    appState.timeLimitMs = null;
    appState.sessionChapter = null;
    renderHome();
    return;
  }

  if (route === "subject") {
    pauseCurrentQuestionTimer();
    saveProgress();
    stopTimer();
    renderSubject();
    return;
  }

  if (route === "custom") {
    pauseCurrentQuestionTimer();
    saveProgress();
    stopTimer();
    renderCustom();
    return;
  }

  if (route === "practice") {
    const chapterId = params.chapter || "percentage";
    ensureSessionForChapter(chapterId);
    resumeSessionTimer();
    if (params.pos) {
      pauseCurrentQuestionTimer();
      const nextPos = Math.min(Math.max(0, Number(params.pos)), Math.max(0, appState.order.length - 1));
      appState.idx = Number.isFinite(nextPos) ? nextPos : 0;
    }
    startCurrentQuestionTimer();
    saveProgress();
    renderPractice();
    return;
  }

  if (route === "results") {
    const chapterId = params.chapter || appState.chapterId || "percentage";
    
    // Don't call ensureSessionForChapter - it would overwrite our exam results!
    // The session data is already in appState from the test just taken
    if (!appState.chapterId) {
      // Only if there's no active session, redirect to home
      window.location.hash = "#/home";
      return;
    }
    
    pauseCurrentQuestionTimer();
    renderResults();
    return;
  }

  // Admin route is handled by messaging.js — don't redirect away
  if (route === "admin") return;

  window.location.hash = "#/home";
}

refreshChapters();
attachHandlers();
window.addEventListener("hashchange", handleRoute);
window.addEventListener("resize", () => {
  if (appState.view === "practice") {
    initMobilePalette();
  }
});
handleRoute();


// ============================================
// SUBJECT FUNCTIONALITY
// ============================================

// Get chapters by subject
function getChaptersBySubject(subject) {
  return CHAPTERS.filter(c => c.subject === subject);
}

// Get subject stats
function getSubjectStats(subject) {
  const chapters = getChaptersBySubject(subject);
  const totalQ = chapters.reduce((a, c) => a + c.questions.length, 0);
  const attempted = chapters.filter(c => !!readJson(storageKey("best", c.id), null)).length;
  return { chapters: chapters.length, questions: totalQ, attempted };
}

// Render subject view
function renderSubject() {
  const { params } = parseHash();
  const subject = params.name || 'maths';
  const chapters = getChaptersBySubject(subject);
  
  setView("subject");
  
  const subjectTitle = document.getElementById('subjectTitle');
  const subjectPanelTitle = document.getElementById('subjectPanelTitle');
  const subjectMeta = document.getElementById('subjectMeta');
  const chapterGrid = document.getElementById('chapterGrid');
  
  const displayNames = {
    'maths': 'Quantitative Aptitude',
    'reasoning': 'Reasoning Ability',
    'english': 'English Language'
  };
  const displayName = displayNames[subject] || 'Chapters';
  
  if (subjectTitle) subjectTitle.textContent = displayName;
  if (subjectPanelTitle) subjectPanelTitle.textContent = `${displayName} Chapters`;
  if (subjectMeta) subjectMeta.textContent = `${chapters.length} chapters • ${chapters.reduce((a, c) => a + c.questions.length, 0)} questions`;
  
  if (chapterGrid) {
    chapterGrid.innerHTML = "";
    
    for (const chapter of chapters) {
      const best = readJson(storageKey("best", chapter.id), null);
      const last = readJson(storageKey("lastSession", chapter.id), null);
      const progress = answeredProgress(chapter.id);
      const bestText = best ? `${Math.round(best.accuracy)}%` : "—";
      const lastText = last ? `${Math.round(last.accuracy)}%` : "—";
      const progressText = progress ? ` • Done ${progress.completed}/${progress.total}` : "";

      const card = document.createElement("div");
      card.className = "card";

      const h = document.createElement("h3");
      h.className = "card__title";
      h.textContent = chapter.title;
      card.appendChild(h);

      const p = document.createElement("p");
      p.className = "card__desc";
      p.textContent = chapter.desc;
      card.appendChild(p);

      const row = document.createElement("div");
      row.className = "card__row";

      const badge = document.createElement("div");
      badge.className = "badge";
      badge.innerHTML = `${chapter.questions.length} Q • Best <strong>${bestText}</strong> • Last ${lastText}${progressText}`;

      const btn = document.createElement("button");
      btn.className = "btn btn--primary";
      btn.type = "button";
      btn.textContent = progress && progress.completed > 0 ? "Resume" : "Start";
      btn.addEventListener("click", () => {
        requestFullscreen();
        window.location.hash = `#/practice?chapter=${encodeURIComponent(chapter.id)}`;
      });

      row.appendChild(badge);
      row.appendChild(btn);
      card.appendChild(row);

      chapterGrid.appendChild(card);
    }
  }
}
