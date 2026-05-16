//  إعدادات الذكاء الاصطناعي
//  الأساسي : Groq — Llama 3.3 70B  (مجاني، سريع، موثوق)
//  الاحتياطي: Gemini 2.5 Flash

// ── Groq ──────────────────────────────────────────────────────
const GROQ_KEY   = "Key";
const GROQ_URL   = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

// ── Gemini (fallback) ─────────────────────────────────────────
const GEMINI_KEY = "Key";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
const GEMINI_STREAM_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?key=${GEMINI_KEY}&alt=sse`;

// عنوان الخادم الخلفي — غيّره عند النشر
const BACKEND_URL = 'http://localhost:8000';

// ── Request queue — only one Gemini call in-flight at a time ──
// Persists rate-limit timestamp across soft navigations via sessionStorage
const _geminiQueue = {
  running: false,
  tasks: [],
  get rateLimitedUntil() {
    return parseInt(sessionStorage.getItem('_gemRL') || '0', 10);
  },
  set rateLimitedUntil(v) {
    sessionStorage.setItem('_gemRL', String(v));
  }
};

function _showRLToast(secsLeft) {
  try { showToast(`انتظر ${secsLeft}ث ثم تُعاد المحاولة تلقائياً...`, 'warning'); } catch {}
}

async function _geminiEnqueue(fn) {
  return new Promise((resolve, reject) => {
    _geminiQueue.tasks.push({ fn, resolve, reject });
    _geminiDrain();
  });
}

async function _geminiDrain() {
  if (_geminiQueue.running || !_geminiQueue.tasks.length) return;
  _geminiQueue.running = true;
  const { fn, resolve, reject } = _geminiQueue.tasks.shift();
  try {
    // Wait out any active rate-limit window before firing
    const wait = _geminiQueue.rateLimitedUntil - Date.now();
    if (wait > 0) {
      let secs = Math.ceil(wait / 1000);
      _showRLToast(secs);
      const timer = setInterval(() => {
        secs--;
        if (secs > 0) _showRLToast(secs);
        else clearInterval(timer);
      }, 1000);
      await new Promise(r => setTimeout(r, wait + 200));
      clearInterval(timer);
    }
    resolve(await fn());
  } catch (e) {
    reject(e);
  } finally {
    _geminiQueue.running = false;
    if (_geminiQueue.tasks.length) setTimeout(_geminiDrain, 300);
  }
}

function _setRateLimit() {
  _geminiQueue.rateLimitedUntil = Date.now() + 65000;
}

function _buildBody(prompt, systemInstruction, maxTokens, history) {
  const contents = [];
  history.forEach(h => {
    contents.push({ role: "user",  parts: [{ text: h.question }] });
    contents.push({ role: "model", parts: [{ text: h.answer   }] });
  });
  contents.push({ role: "user", parts: [{ text: prompt }] });
  const body = { contents, generationConfig: { maxOutputTokens: maxTokens, temperature: 0.75 } };
  if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };
  return body;
}

// ── Standard call (for JSON / structured output) ─────────────
async function callGemini(prompt, systemInstruction = "", maxTokens = 4000, history = []) {
  return _geminiEnqueue(async () => {
    const body = _buildBody(prompt, systemInstruction, maxTokens, history);
    // On 429: wait 65s and retry once automatically before giving up
    for (let attempt = 1; attempt <= 2; attempt++) {
      const res = await fetch(GEMINI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        const data = await res.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      }
      if (res.status === 429) {
        if (attempt === 1) {
          _setRateLimit();
          let secs = 65;
          _showRLToast(secs);
          const timer = setInterval(() => { secs--; if (secs > 0) _showRLToast(secs); else clearInterval(timer); }, 1000);
          await new Promise(r => setTimeout(r, 65200));
          clearInterval(timer);
          continue; // retry once after wait
        }
        throw new Error(`Gemini Error 429`);
      }
      if (res.status === 503 && attempt === 1) {
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }
      throw new Error(`Gemini Error ${res.status}`);
    }
  });
}

// ── Streaming call — calls onChunk(chunk, fullTextSoFar) live ─
async function callGeminiStream(prompt, systemInstruction = "", onChunk, history = [], maxTokens = 4000) {
  return _geminiEnqueue(async () => {
    const body = _buildBody(prompt, systemInstruction, maxTokens, history);
    // On 429: wait 65s and retry once automatically
    for (let attempt = 1; attempt <= 2; attempt++) {
      const res = await fetch(GEMINI_STREAM_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        // Stream the response
        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer   = '';
        let fullText = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const json = line.slice(6).trim();
            if (!json || json === '[DONE]') continue;
            try {
              const data  = JSON.parse(json);
              const chunk = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
              if (chunk) { fullText += chunk; onChunk(chunk, fullText); }
            } catch {}
          }
        }
        return fullText;
      }
      if (res.status === 429) {
        if (attempt === 1) {
          _setRateLimit();
          // Show countdown in the stream body if available
          let secs = 65;
          _showRLToast(secs);
          const streamEl = document.getElementById('streamBody') || document.getElementById('analysisMsgBody') || document.getElementById('homeAiMsgBody');
          const countdownFn = () => {
            secs--;
            if (secs > 0) {
              _showRLToast(secs);
              if (streamEl) streamEl.innerHTML = `<span style="color:var(--text-muted)">تجاوز حد الطلبات — إعادة المحاولة خلال <strong>${secs}</strong>ث...</span>`;
            }
          };
          if (streamEl) streamEl.innerHTML = `<span style="color:var(--text-muted)">تجاوز حد الطلبات — إعادة المحاولة خلال <strong>${secs}</strong>ث...</span>`;
          const timer = setInterval(countdownFn, 1000);
          await new Promise(r => setTimeout(r, 65200));
          clearInterval(timer);
          if (streamEl) streamEl.innerHTML = '<span class="ai-cursor"></span>';
          continue;
        }
        throw new Error(`Gemini stream 429`);
      }
      throw new Error(`Gemini stream error: ${res.status}`);
    }
  });
}

// ── Groq — primary provider ───────────────────────────────────
function _buildGroqMessages(prompt, sys, history) {
  const msgs = [];
  if (sys) msgs.push({ role: "system", content: sys });
  history.forEach(h => {
    msgs.push({ role: "user",      content: h.question });
    msgs.push({ role: "assistant", content: h.answer   });
  });
  msgs.push({ role: "user", content: prompt });
  return msgs;
}

async function callGroq(prompt, sys = "", max = 4000, history = []) {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({ model: GROQ_MODEL, messages: _buildGroqMessages(prompt, sys, history), max_tokens: max, temperature: 0.75 })
  });
  if (!res.ok) throw new Error(`Groq ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

async function callGroqStream(prompt, sys = "", onChunk, history = [], max = 4000) {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({ model: GROQ_MODEL, messages: _buildGroqMessages(prompt, sys, history), max_tokens: max, temperature: 0.75, stream: true })
  });
  if (!res.ok) throw new Error(`Groq stream ${res.status}`);

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', fullText = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const json = line.slice(6).trim();
      if (!json || json === '[DONE]') continue;
      try {
        const chunk = JSON.parse(json).choices?.[0]?.delta?.content || '';
        if (chunk) { fullText += chunk; onChunk(chunk, fullText); }
      } catch {}
    }
  }
  return fullText;
}

// ── Safe wrappers — Groq first, Gemini as fallback ────────────
async function callGeminiSafe(prompt, sys = "", max = 4000, history = []) {
  try {
    return await callGroq(prompt, sys, max, history);
  } catch (e) {
    console.warn('Groq failed, trying Gemini:', e.message);
    try {
      return await callGemini(prompt, sys, max, history);
    } catch (e2) {
      throw e2;
    }
  }
}

async function callGeminiStreamSafe(prompt, sys = "", onChunk, history = [], max = 4000) {
  try {
    return await callGroqStream(prompt, sys, onChunk, history, max);
  } catch (groqErr) {
    console.warn('Groq stream failed, trying Gemini:', groqErr.message);
    try {
      return await callGeminiStream(prompt, sys, onChunk, history, max);
    } catch (gemErr) {
      // Last resort: Gemini standard (no streaming)
      if (!gemErr?.message?.includes('429')) {
        try {
          const text = await callGemini(prompt, sys, max, history);
          onChunk(text, text);
          return text;
        } catch {}
      }
      throw gemErr;
    }
  }
}

// ── Markdown → HTML renderer ──────────────────────────────────
function renderMarkdown(text) {
  if (!text) return '';
  return text
    // escape HTML first
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // headings
    .replace(/^###\s+(.+)$/gm, '<div class="md-h3">$1</div>')
    .replace(/^##\s+(.+)$/gm,  '<div class="md-h2">$1</div>')
    .replace(/^#\s+(.+)$/gm,   '<div class="md-h1">$1</div>')
    // bold / italic
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+?)\*/g, '<em>$1</em>')
    // bullet lists
    .replace(/^[-•]\s+(.+)$/gm,
      '<div class="md-li"><span class="md-bullet">•</span><span>$1</span></div>')
    // numbered lists
    .replace(/^(\d+)\.\s+(.+)$/gm,
      '<div class="md-li"><span class="md-num">$1.</span><span>$2</span></div>')
    // horizontal rule
    .replace(/^---$/gm, '<hr class="md-hr">')
    // paragraph breaks
    .replace(/\n\n/g, '<div class="md-gap"></div>')
    .replace(/\n/g, ' ');
}

// ── Safe JSON parser ──────────────────────────────────────────
function safeJSON(text) {
  try {
    if (!text) return null;
    const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const start = clean.search(/[\[{]/);
    const end   = Math.max(clean.lastIndexOf('}'), clean.lastIndexOf(']'));
    if (start === -1 || end === -1) return null;
    return JSON.parse(clean.slice(start, end + 1));
  } catch { return null; }
}

// ── Storage helpers ───────────────────────────────────────────
function saveData(key, val) {
  try { localStorage.setItem("madd_" + key, JSON.stringify(val)); } catch {}
}
function loadData(key) {
  try { return JSON.parse(localStorage.getItem("madd_" + key)); } catch { return null; }
}
function clearData(key) { localStorage.removeItem("madd_" + key); }

// ── Current user ──────────────────────────────────────────────
function getCurrentUser() { return loadData("currentUser"); }
function setCurrentUser(user) { saveData("currentUser", user); }
function requireAuth() {
  if (!getCurrentUser()) { window.location.href = "index.html"; }
}
function logout() {
  clearData("currentUser");
  window.location.href = "index.html";
}

// ── Loading overlay ───────────────────────────────────────────
function showLoading(text = "جاري التحميل...", sub = "") {
  const el = document.getElementById("loadingOverlay");
  if (!el) return;
  el.querySelector(".ld-text").textContent = text;
  el.querySelector(".ld-sub").textContent  = sub;
  el.classList.add("show");
}
function hideLoading() {
  const el = document.getElementById("loadingOverlay");
  if (el) el.classList.remove("show");
}

// ── Toast ─────────────────────────────────────────────────────
function showToast(msg, type = "success") {
  let t = document.getElementById("toastEl");
  if (!t) { t = document.createElement("div"); t.id = "toastEl"; document.body.appendChild(t); }
  t.className = `madd-toast ${type}`;
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3500);
}

// ── Notifications badge ───────────────────────────────────────
function updateNotifBadge() {
  const notifs = loadData("notifications") || [];
  const unread = notifs.filter(n => !n.read).length;
  document.querySelectorAll(".notif-badge").forEach(b => {
    b.textContent    = unread;
    b.style.display  = unread ? "flex" : "none";
  });
}

function addNotification(title, body, type = "info") {
  const notifs = loadData("notifications") || [];
  notifs.unshift({ id: Date.now(), title, body, type, read: false, time: new Date().toISOString() });
  saveData("notifications", notifs.slice(0, 50));
  updateNotifBadge();
}

// ── Saudi constants ───────────────────────────────────────────
const SAUDI_REGIONS = [
  "منطقة الرياض","منطقة مكة المكرمة","منطقة المدينة المنورة","منطقة القصيم",
  "منطقة الشرقية","منطقة عسير","منطقة تبوك","منطقة حائل","منطقة الحدود الشمالية",
  "منطقة جازان","منطقة نجران","منطقة الباحة","منطقة الجوف"
];

const SAUDI_CITIES = [
  "الرياض","جدة","مكة المكرمة","المدينة المنورة","الدمام","الخبر","الظهران",
  "تبوك","بريدة","خميس مشيط","أبها","الطائف","القطيف","حفر الباطن",
  "الجبيل","الأحساء","حائل","نجران","جازان","ينبع","الباحة","عرعر",
  "سكاكا","القريات","الدوادمي","الزلفي","شقراء","المجمعة","وادي الدواسر",
  "بيشة","النماص","محايل عسير","صبيا","صامطة","الليث","القنفذة","رابغ"
];

const SPECIALIZATIONS = [
  "علوم الحاسب","هندسة البرمجيات","الذكاء الاصطناعي","نظم المعلومات",
  "الهندسة الكهربائية","الهندسة الميكانيكية","الهندسة المدنية","الهندسة الكيميائية",
  "طب بشري","طب أسنان","صيدلة","تمريض","علوم طبية مختبرية",
  "إدارة أعمال","محاسبة","تمويل","تسويق","اقتصاد",
  "قانون","علوم سياسية","إعلام وصحافة","علم النفس","علم الاجتماع",
  "تصميم جرافيك","معمارية","تصميم داخلي","فنون",
  "رياضيات","فيزياء","كيمياء","أحياء","إحصاء",
  "تربية وتعليم","لغة عربية","لغة إنجليزية","ترجمة"
];

const INTERESTS = [
  "التقنية والبرمجة","الذكاء الاصطناعي","تطوير التطبيقات",
  "الطب والصحة","الصيدلة","العلوم البيولوجية",
  "الهندسة","الروبوتات","الميكاترونكس",
  "الأعمال والريادة","التسويق الرقمي","المال والاستثمار",
  "الفنون والتصميم","التصوير","الموسيقى",
  "العلوم الإنسانية","التاريخ","الفلسفة",
  "القانون والعدالة","العمل الحقوقي",
  "التعليم والتدريس","علم النفس","الإرشاد",
  "الرياضة والصحة","التغذية","اللياقة البدنية",
  "البيئة والاستدامة","الطاقة المتجددة",
  "الإعلام والصحافة","الكتابة الإبداعية","صناعة المحتوى"
];
