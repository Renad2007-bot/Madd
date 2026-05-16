import { db } from "./firebase-config.js";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  doc,
  serverTimestamp,
  limit,
  onSnapshot,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";

const BANNED_WORDS = [
  "غبي",
  "احمق",
  "كلب",
  "حمار",
  "ابن الحرام",
  "خنزير",
  "لعين",
  "ملعون",
  "فاشل",
  "تافه",
  "مجنون",
  "حقير",
  "وسخ",
  "نذل",
  "جاهل",
];

let activeChatUnsubscribe = null;
let activeChatOtherUid = null;
let activeChatOtherName = null;

window.containsBannedWord = function (text = "") {
  return BANNED_WORDS.some((w) => text.includes(w));
};

async function checkWithModel(text) {
  try {
    const base = window.BACKEND_URL || "http://localhost:8000";
    const res = await fetch(`${base}/classify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.is_offensive;
  } catch (e) {
    return false;
  }
}

async function moderateText(text) {
  if (window.containsBannedWord(text)) {
    return { blocked: true, reason: "كلمات غير لائقة" };
  }
  const offensive = await checkWithModel(text);
  if (offensive) {
    return { blocked: true, reason: "محتوى غير مناسب" };
  }
  return { blocked: false };
}

function makeConvKey(uid1, uid2) {
  return [uid1, uid2].filter(Boolean).sort().join("_");
}

function formatTime(value) {
  try {
    if (value?.toDate) {
      return value
        .toDate()
        .toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
    }
    if (value) {
      return new Date(value).toLocaleTimeString("ar-SA", {
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return "";
  } catch (e) {
    return "";
  }
}

function formatDateTime(value) {
  try {
    if (value?.toDate) return value.toDate().toLocaleString("ar-SA");
    if (value) return new Date(value).toLocaleString("ar-SA");
    return "الآن";
  } catch (e) {
    return "الآن";
  }
}

function getTimestampMs(value) {
  try {
    if (value?.toDate) return value.toDate().getTime();
    if (value) return new Date(value).getTime();
    return 0;
  } catch (e) {
    return 0;
  }
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeAttr(value = "") {
  return escapeHtml(value).replaceAll("\n", " ");
}

function typeLabel(type) {
  return (
    {
      secondary: "طالب ثانوي",
      university: "طالب جامعي",
      mentor: "مرشد أكاديمي",
      student: "طالب",
    }[type] ||
    type ||
    "مستخدم"
  );
}

function typeColor(type) {
  return (
    {
      secondary: "var(--gold)",
      university: "var(--green-main)",
      mentor: "#1a3a6a",
      student: "var(--green-main)",
    }[type] || "var(--green-main)"
  );
}

function closeRequestModal() {
  document.getElementById("requestModal")?.classList.remove("show");
}

// ── جلب المستخدمين ─────────────────────────────────────────────
window.loadCommunityUsersFromFirebase = async function () {
  const user = getCurrentUser?.();
  const myUid = user?.uid || user?.email || "";
  if (!user) return [];
  try {
    const q = query(
      collection(db, "users"),
      where("city", "==", user.city || ""),
    );
    const snap = await getDocs(q);
    const users = [];
    snap.forEach((d) => {
      const data = d.data();
      const uid = data.uid || d.id || data.email || "";
      if (uid && uid !== myUid) {
        users.push({
          uid,
          name: data.name || data.email || "مستخدم",
          type: data.type || data.role || "student",
          interests: data.interests || [],
          city: data.city || "",
          specialization: data.specialization || "",
          spec: data.specialization || "",
          gpa: data.uniGpa || data.gpa || null,
          semester: data.semester || null,
          university: data.university || "",
          email: data.email || "",
        });
      }
    });
    return users;
  } catch (e) {
    console.error("خطأ في جلب المستخدمين:", e);
    return [];
  }
};

// ── جلب المنشورات ──────────────────────────────────────────────
window.loadPostsWallFromFirebase = async function () {
  const user = getCurrentUser?.();
  const wall = document.getElementById("postsWall");
  if (!wall || !user) return;
  try {
    const q = query(
      collection(db, "posts"),
      where("city", "==", user.city || ""),
      limit(30),
    );
    const snap = await getDocs(q);
    const posts = [];
    snap.forEach((d) => posts.push({ id: d.id, ...d.data() }));
    posts.sort(
      (a, b) =>
        getTimestampMs(b.createdAt || b.time) -
        getTimestampMs(a.createdAt || a.time),
    );
    if (!posts.length) {
      wall.innerHTML =
        '<p style="color:var(--text-muted);text-align:center;padding:16px;font-size:14px;">لا توجد منشورات بعد — كن أول من ينشر! 📢</p>';
      return;
    }
    wall.innerHTML =
      `<h3 style="margin-bottom:14px;">📢 آخر المنشورات في ${escapeHtml(user.city || "منطقتك")}</h3>` +
      posts
        .map((p) => {
          const author = p.author || p.authorName || p.name || "مستخدم";
          const uid = p.authorUid || p.uid || p.userUid || p.email || "";
          const text = p.text || p.message || "";
          const city = p.city || "";
          const type = p.type || p.authorType || "student";
          return `
            <div class="msg-item anim-up">
              <div class="avatar av-md" style="background:${typeColor(type)};">${escapeHtml(author.charAt(0) || "؟")}</div>
              <div class="msg-body">
                <div class="msg-sender">${escapeHtml(author)} · ${escapeHtml(typeLabel(type))} · ${escapeHtml(city)}</div>
                <div class="msg-text">${escapeHtml(text)}</div>
                <div class="msg-time">${formatDateTime(p.createdAt || p.time)}</div>
                <button class="btn btn-sm btn-outline" style="margin-top:8px;" onclick="openSendRequest('${safeAttr(author)}','${safeAttr(uid)}')">💬 طلب إرشاد</button>
              </div>
            </div>
          `;
        })
        .join("");
  } catch (e) {
    console.error("خطأ في جلب المنشورات:", e);
    if (typeof loadPostsWall === "function") loadPostsWall();
  }
};

// ── فتح نافذة الإرسال بمستلم محدد ────────────────────────────
window.openSendRequest = function (name, uid = "") {
  const modal = document.getElementById("requestModal");
  const sel = document.getElementById("reqTarget");
  if (!sel || !modal) return;
  sel.innerHTML = `<option value="${escapeHtml(name)}" selected>${escapeHtml(name)}</option>`;
  let uidInput = document.getElementById("reqTargetUid");
  if (!uidInput) {
    uidInput = document.createElement("input");
    uidInput.type = "hidden";
    uidInput.id = "reqTargetUid";
    sel.parentElement.appendChild(uidInput);
  }
  uidInput.value = uid || "";
  modal.classList.add("show");
};

// ── فتح نافذة الإرسال مع تحميل المستخدمين ────────────────────
window.showRequestModal = async function () {
  const modal = document.getElementById("requestModal");
  const sel = document.getElementById("reqTarget");
  if (!sel || !modal) return;
  sel.innerHTML = '<option value="">جاري التحميل...</option>';
  modal.classList.add("show");
  const users = await window.loadCommunityUsersFromFirebase();
  if (!users.length) {
    sel.innerHTML = '<option value="">لا يوجد مستخدمون في مدينتك</option>';
    return;
  }
  sel.innerHTML = users
    .map(
      (u) =>
        `<option value="${escapeHtml(u.name)}" data-uid="${escapeHtml(u.uid)}">${escapeHtml(u.name)} (${escapeHtml(typeLabel(u.type))})</option>`,
    )
    .join("");
  sel.onchange = () => {
    const opt = sel.options[sel.selectedIndex];
    let uidInput = document.getElementById("reqTargetUid");
    if (!uidInput) {
      uidInput = document.createElement("input");
      uidInput.type = "hidden";
      uidInput.id = "reqTargetUid";
      sel.parentElement.appendChild(uidInput);
    }
    uidInput.value = opt?.dataset?.uid || "";
  };
  sel.dispatchEvent(new Event("change"));
};

// ── إرسال طلب الإرشاد ─────────────────────────────────────────
window.sendRequest = async function () {
  const user = getCurrentUser?.();
  const myUid = user?.uid || user?.email || "";
  const target = document.getElementById("reqTarget")?.value || "";
  const targetUid = document.getElementById("reqTargetUid")?.value || "";
  const msg = document.getElementById("reqMsg")?.value?.trim() || "";
  if (!user || !myUid) {
    showToast?.("سجلي الدخول أولاً", "error");
    return;
  }
  if (!target || !targetUid) {
    showToast?.("اختاري شخصاً صحيحاً أولاً", "error");
    return;
  }
  if (targetUid === myUid) {
    showToast?.("لا يمكنك إرسال طلب لنفسك", "error");
    return;
  }
  if (msg.length > 2) {
    showToast?.("⏳ جاري فحص الرسالة...", "info");
    const check = await moderateText(msg);
    if (check.blocked) {
      showToast?.(`⚠️ ${check.reason}، يرجى تعديل الرسالة`, "error");
      return;
    }
  }
  try {
    const convKey = makeConvKey(myUid, targetUid);
    const text = msg || "أرغب بطلب إرشاد أكاديمي";
    await addDoc(collection(db, "messages"), {
      msgType: "guidance_request",
      status: "pending",
      convKey,
      participants: [myUid, targetUid],
      fromUid: myUid,
      fromName: user.name || user.email || "مستخدم",
      fromType: user.type || user.role || "student",
      fromCity: user.city || "",
      toUid: targetUid,
      toName: target,
      message: text,
      text,
      read: false,
      createdAt: serverTimestamp(),
    });
    const input = document.getElementById("reqMsg");
    if (input) input.value = "";
    closeRequestModal();
    addNotification?.(
      "طلب إرشاد مُرسل ✅",
      `تم إرسال طلبك إلى ${target}`,
      "info",
    );
    showToast?.(`✅ تم إرسال طلب الإرشاد إلى ${target}`);
  } catch (e) {
    console.error("خطأ في إرسال طلب الإرشاد:", e);
    showToast?.("تعذر إرسال الطلب، تأكدي من الاتصال", "error");
  }
};

// ── استماع لطلبات الإرشاد الواردة ─────────────────────────────
window.listenGuidanceRequests = function () {
  const user = window.getCurrentUser?.() || getCurrentUser?.();
  const myUid = user?.uid || user?.email || "";
  const box = document.getElementById("guidanceRequestsBox");
  if (!box) return null;
  if (!myUid) {
    box.innerHTML = `<div class="rp-empty"><div class="rp-empty-title">يرجى تسجيل الدخول</div></div>`;
    return null;
  }
  // Show loading state immediately
  box.innerHTML = `<div style="text-align:center;padding:30px;"><div class="spinner" style="margin:0 auto;"></div></div>`;
  const q = query(collection(db, "messages"), where("toUid", "==", myUid));
  return onSnapshot(
    q,
    (snap) => {
      const requests = [];
      snap.forEach((d) => {
        const data = { id: d.id, ...d.data() };
        if (
          (data.msgType === "guidance_request" ||
            data.msgType === "reply_request") &&
          data.status === "pending"
        )
          requests.push(data);
      });
      requests.sort(
        (a, b) => getTimestampMs(b.createdAt) - getTimestampMs(a.createdAt),
      );
      if (!requests.length) {
        box.innerHTML = `
        <div class="rp-empty">
          <div class="rp-empty-title">لا توجد طلبات إرشاد حالياً</div>
          <div class="rp-empty-sub">ستظهر هنا طلبات الطلاب عند وصولها</div>
        </div>
      `;
        return;
      }
      box.innerHTML = requests
        .map((r) => {
          const fromName = r.fromName || "طالب";
          const fromUid = r.fromUid || "";
          const fromType = r.fromType || "university";
          const city = r.fromCity || "";
          const text = r.text || r.message || "";
          const gpa = r.fromGpa || "";
          const semester = r.fromSemester || "";
          const university = r.fromUniversity || "";
          const spec = r.fromSpec || "";
          // encode all values for safe HTML attributes
          const eId = safeAttr(r.id);
          const eUid = safeAttr(fromUid);
          const eName = safeAttr(fromName);
          const eType = safeAttr(fromType);
          const eCity = safeAttr(city);
          const eGpa = safeAttr(String(gpa));
          const eSem = safeAttr(String(semester));
          const eUni = safeAttr(university);
          const eSpec = safeAttr(spec);
          return `
          <div class="req-card anim-up">
            <div class="req-card-top">
              <div class="conv-av" style="background:var(--green-main);cursor:pointer;" onclick="showStudentProfile('${eUid}','${eName}','${eType}','${eCity}','${eGpa}','${eSem}','${eUni}','${eSpec}')">${escapeHtml(fromName.charAt(0) || "؟")}</div>
              <div style="flex:1;">
                <div style="font-size:14px;font-weight:700;cursor:pointer;" onclick="showStudentProfile('${eUid}','${eName}','${eType}','${eCity}','${eGpa}','${eSem}','${eUni}','${eSpec}')">${escapeHtml(fromName)}</div>
                <div style="font-size:12px;color:var(--text-muted);">${escapeHtml(typeLabel(fromType))} · ${escapeHtml(city)} · ${formatDateTime(r.createdAt)}</div>
              </div>
              <span style="font-size:11px;background:#fff8e7;color:var(--gold-dark);padding:3px 10px;border-radius:20px;font-weight:700;">معلّق</span>
            </div>
            <div class="req-intro-text">${escapeHtml(text)}</div>
            <div class="req-actions">
              <button class="btn btn-primary btn-sm" onclick="approveGuidanceRequest('${eId}','${eUid}','${eName}','${eType}','${eCity}','${eGpa}','${eSem}','${eUni}','${eSpec}')">قبول وبدء المحادثة</button>
              <button class="btn btn-outline btn-sm" onclick="showStudentProfile('${eUid}','${eName}','${eType}','${eCity}','${eGpa}','${eSem}','${eUni}','${eSpec}')">عرض الملف</button>
              <button class="btn btn-outline btn-sm" style="color:var(--danger,#c03030);border-color:var(--danger,#c03030);" onclick="rejectGuidanceRequest('${eId}')">رفض</button>
            </div>
          </div>
        `;
        })
        .join("");
    },
    (error) => {
      console.error("listenGuidanceRequests error:", error);
      box.innerHTML = `
        <div class="rp-empty">
          <div class="rp-empty-title">تعذر تحميل الطلبات</div>
          <div class="rp-empty-sub" style="color:var(--danger,#c03030);font-size:11px;">${escapeHtml(error?.message || "خطأ في الاتصال")}</div>
        </div>
      `;
    },
  );
};

// ── قبول طلب الإرشاد ──────────────────────────────────────────
window.approveGuidanceRequest = async function (
  requestId,
  studentUid,
  studentName,
  studentType,
  studentCity,
  gpa,
  semester,
  university,
  spec,
) {
  const user = getCurrentUser?.();
  const myUid = user?.uid || user?.email || "";
  if (!myUid || !studentUid) {
    showToast?.("تعذر بدء المحادثة", "error");
    return;
  }
  try {
    const convKey = makeConvKey(myUid, studentUid);
    await updateDoc(doc(db, "messages", requestId), {
      status: "approved",
      read: true,
    });
    await addDoc(collection(db, "messages"), {
      msgType: "chat",
      convKey,
      participants: [myUid, studentUid],
      fromUid: myUid,
      fromName: user.name || user.email || "مرشد",
      fromType: user.type || "mentor",
      toUid: studentUid,
      toName: studentName || "طالب",
      text: "تم قبول طلب الإرشاد، كيف أقدر أساعدك؟",
      message: "تم قبول طلب الإرشاد، كيف أقدر أساعدك؟",
      read: false,
      createdAt: serverTimestamp(),
    });
    showToast?.("تم قبول الطلب وبدء المحادثة");
    // Add to myStudents for guidance lists
    const savedStudents = JSON.parse(
      localStorage.getItem("myStudents__" + myUid) || "[]",
    );
    if (!savedStudents.find((s) => s.uid === studentUid)) {
      savedStudents.push({
        uid: studentUid,
        name: studentName,
        type: studentType,
        city: studentCity,
        gpa,
        semester,
        university,
        spec,
      });
      localStorage.setItem(
        "myStudents__" + myUid,
        JSON.stringify(savedStudents),
      );
      // also save without uid suffix for legacy access
      const legacy = JSON.parse(localStorage.getItem("myStudents") || "[]");
      if (!legacy.find((s) => s.uid === studentUid)) {
        legacy.push({
          uid: studentUid,
          name: studentName,
          type: studentType,
          city: studentCity,
        });
        localStorage.setItem("myStudents", JSON.stringify(legacy));
      }
    }
    // عرض ملف الطالب بعد القبول مباشرة
    if (typeof showStudentProfile === "function") {
      showStudentProfile(
        studentUid,
        studentName,
        studentType,
        studentCity,
        gpa,
        semester,
        university,
        spec,
      );
    }
  } catch (e) {
    console.error("خطأ في قبول الطلب:", e);
    showToast?.("تعذر قبول الطلب", "error");
  }
};

// ── رفض طلب الإرشاد ───────────────────────────────────────────
window.rejectGuidanceRequest = async function (requestId) {
  try {
    await updateDoc(doc(db, "messages", requestId), {
      status: "rejected",
      read: true,
    });
    showToast?.("تم رفض الطلب");
  } catch (e) {
    console.error("خطأ في رفض الطلب:", e);
    showToast?.("تعذر رفض الطلب", "error");
  }
};

// ── فتح نافذة المحادثة الفعلية (real-time) ───────────────────
window.openRealChat = function (otherUid, otherName) {
  const user = getCurrentUser?.();
  const myUid = user?.uid || user?.email || "";
  if (!myUid || !otherUid) {
    showToast?.("تعذر فتح المحادثة", "error");
    return;
  }
  const convKey = makeConvKey(myUid, otherUid);
  activeChatOtherUid = otherUid;
  activeChatOtherName = otherName || "محادثة";
  const mc = document.getElementById("mainContent");
  if (!mc) {
    showToast?.("لم يتم العثور على مساحة عرض المحادثة", "error");
    return;
  }
  mc.innerHTML = `
    <div class="chat-page">
      <div class="chat-header">
        <button class="chat-back" onclick="renderCommunityMsgs()" title="رجوع" style="font-size:20px;background:none;border:none;cursor:pointer;color:var(--text-muted);padding:4px 8px;">‹</button>
        <div class="chat-header-av">${escapeHtml((activeChatOtherName || "؟").charAt(0))}</div>
        <div class="chat-header-info" style="flex:1;">
          <div class="chat-header-name">${escapeHtml(activeChatOtherName)}</div>
          <div class="chat-header-status">محادثة نشطة</div>
        </div>
      </div>
      <div class="chat-body" id="realChatBody"></div>
      <div class="chat-input-bar">
        <textarea id="realChatInput" class="chat-input" placeholder="اكتب رسالتك..." rows="1" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendRealChatMessage();}"></textarea>
        <button class="chat-send-btn" onclick="sendRealChatMessage()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;transform:scaleX(-1)"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    </div>
  `;
  if (activeChatUnsubscribe) activeChatUnsubscribe();
  const q = query(collection(db, "messages"), where("convKey", "==", convKey));
  activeChatUnsubscribe = onSnapshot(q, (snap) => {
    const messages = [];
    snap.forEach((d) => {
      const data = { id: d.id, ...d.data() };
      if (data.msgType === "chat") messages.push(data);
    });
    messages.sort(
      (a, b) => getTimestampMs(a.createdAt) - getTimestampMs(b.createdAt),
    );
    const body = document.getElementById("realChatBody");
    if (!body) return;
    if (!messages.length) {
      body.innerHTML = `
        <div class="rp-empty">
          <div class="rp-empty-title">ابدأ المحادثة</div>
          <div class="rp-empty-sub">اكتب أول رسالة للبدء</div>
        </div>
      `;
      return;
    }
    body.innerHTML = messages
      .map((m) => {
        const isMe = m.fromUid === myUid;
        const text = m.text || m.message || "";
        const fromName = m.fromName || "مستخدم";
        if (isMe) {
          return `
            <div class="chat-bubble-wrap mine">
              <div class="chat-bubble mine">${escapeHtml(text)}</div>
              <div class="chat-time">${formatTime(m.createdAt)}</div>
            </div>
          `;
        }
        return `
          <div class="chat-bubble-wrap theirs">
            <div class="conv-av" style="width:32px;height:32px;font-size:13px;background:var(--green-main)">${escapeHtml(fromName.charAt(0) || "؟")}</div>
            <div>
              <div class="chat-bubble theirs">${escapeHtml(text)}</div>
              <div class="chat-time">${formatTime(m.createdAt)}</div>
            </div>
          </div>
        `;
      })
      .join("");
    body.scrollTop = body.scrollHeight;
  });
};

// ── إرسال رسالة في المحادثة ──────────────────────────────────
window.sendRealChatMessage = async function () {
  const user = getCurrentUser?.();
  const myUid = user?.uid || user?.email || "";
  const input = document.getElementById("realChatInput");
  const text = input?.value?.trim() || "";
  if (!text) return;
  if (!myUid || !activeChatOtherUid) {
    showToast?.("لا يوجد مستلم للمحادثة", "error");
    return;
  }
  const check = await moderateText(text);
  if (check.blocked) {
    showToast?.(`⚠️ ${check.reason}، يرجى تعديل الرسالة`, "error");
    return;
  }
  try {
    const convKey = makeConvKey(myUid, activeChatOtherUid);
    await addDoc(collection(db, "messages"), {
      msgType: "chat",
      convKey,
      participants: [myUid, activeChatOtherUid],
      fromUid: myUid,
      fromName: user.name || user.email || "مستخدم",
      fromType: user.type || user.role || "student",
      toUid: activeChatOtherUid,
      toName: activeChatOtherName || "مستخدم",
      text,
      message: text,
      read: false,
      createdAt: serverTimestamp(),
    });
    input.value = "";
  } catch (e) {
    console.error("خطأ في إرسال الرسالة:", e);
    showToast?.("تعذر إرسال الرسالة", "error");
  }
};

// ── استماع للمحادثات النشطة ───────────────────────────────────
window.listenMyConversations = function () {
  const user = getCurrentUser?.();
  const myUid = user?.uid || user?.email || "";
  if (!myUid) {
    showToast?.("سجلي الدخول أولاً", "error");
    return null;
  }
  const list = document.getElementById("conversationsList");
  if (!list) return null;
  // Show loading state
  list.innerHTML = `<div style="text-align:center;padding:30px;"><div class="spinner" style="margin:0 auto;"></div></div>`;
  const q = query(
    collection(db, "messages"),
    where("participants", "array-contains", myUid),
  );
  return onSnapshot(
    q,
    (snap) => {
      const map = new Map();
      snap.forEach((d) => {
        const m = { id: d.id, ...d.data() };
        if (!m.convKey || m.msgType !== "chat") return;
        const current = map.get(m.convKey);
        const currentTime = getTimestampMs(current?.createdAt);
        const msgTime = getTimestampMs(m.createdAt);
        if (!current || msgTime >= currentTime) {
          const otherUid = m.fromUid === myUid ? m.toUid : m.fromUid;
          const otherName = m.fromUid === myUid ? m.toName : m.fromName;
          map.set(m.convKey, {
            otherUid,
            otherName,
            lastMsg: m.text || m.message || "",
            createdAt: m.createdAt,
            unread: m.toUid === myUid && !m.read,
          });
        }
      });
      const conversations = Array.from(map.values()).sort(
        (a, b) => getTimestampMs(b.createdAt) - getTimestampMs(a.createdAt),
      );
      if (!conversations.length) {
        list.innerHTML = `
        <div class="rp-empty">
          <div class="rp-empty-title">لا توجد محادثات بعد</div>
          <div class="rp-empty-sub">عند قبول طلب الإرشاد ستظهر المحادثة هنا</div>
        </div>
      `;
        return;
      }
      list.innerHTML = `
      <div class="conv-list">
        ${conversations
          .map(
            (c) => `
              <div class="conv-item ${c.unread ? "unread" : ""}" onclick="openRealChat('${safeAttr(c.otherUid)}','${safeAttr(c.otherName)}')">
                <div class="conv-av" style="background:var(--green-main)">${escapeHtml((c.otherName || "؟").charAt(0))}</div>
                <div class="conv-body">
                  <div class="conv-name">${escapeHtml(c.otherName || "مستخدم")}</div>
                  <div class="conv-preview">${escapeHtml(c.lastMsg || "")}</div>
                </div>
                <div class="conv-meta">
                  <div class="conv-time">${formatTime(c.createdAt)}</div>
                  ${c.unread ? '<div class="conv-unread-dot"></div>' : ""}
                </div>
              </div>
            `,
          )
          .join("")}
      </div>
    `;
    },
    (error) => {
      console.error("listenMyConversations error:", error);
      list.innerHTML = `
      <div class="rp-empty">
        <div class="rp-empty-title">تعذر تحميل المحادثات</div>
        <div class="rp-empty-sub" style="color:var(--danger,#c03030);font-size:11px;">${escapeHtml(error?.message || "خطأ في الاتصال")}</div>
      </div>
    `;
    },
  );
};

// ── تحديث شارة الرسائل ───────────────────────────────────────
window.updatePostsBadge = async function () {
  const user = getCurrentUser?.();
  const myUid = user?.uid || user?.email || "";
  if (!myUid) return;
  try {
    const q = query(collection(db, "messages"), where("toUid", "==", myUid));
    const snap = await getDocs(q);
    let count = 0;
    snap.forEach((d) => {
      const m = d.data();
      if (!m.read && (m.msgType === "guidance_request" || m.msgType === "chat"))
        count++;
    });
    const badge =
      document.getElementById("postsBadge") ||
      document.getElementById("messagesBadge") ||
      document.querySelector("[data-community-badge]");
    if (badge) {
      badge.textContent = count;
      badge.style.display = count > 0 ? "inline-flex" : "none";
    }
  } catch (e) {
    console.error("خطأ في تحديث العداد:", e);
  }
};

window.startCommunityRealtime = function () {
  window.updatePostsBadge?.();
};

window.addEventListener("load", () => {
  setTimeout(() => window.startCommunityRealtime?.(), 700);
});

console.log("✅ community-fix.js loaded — real-time chat active");
