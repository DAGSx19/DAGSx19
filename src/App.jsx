import { useState, useEffect, useRef, useMemo } from "react";
import { db } from "./firebase";
import { ref, onValue, set, push, remove, get, query, orderByChild, limitToLast } from "firebase/database";
import {
  Radio, Lock, Plus, Shield, Trash2, UserX, Crown, LogOut, Send, X, ShieldCheck, Users, Ban,
  Hash, Circle, Square, Triangle, Hexagon, Star, Link2, Search, Copy, AlertTriangle, Pin,
  Flag, Sun, Moon, MessageSquare, ChevronDown, ChevronRight, ScrollText, Megaphone, Server,
} from "lucide-react";

// ---------- helpers ----------
const simpleHash = (str) => {
  let h1 = 0, h2 = 0;
  for (let i = 0; i < str.length; i++) {
    h1 = (Math.imul(31, h1) + str.charCodeAt(i)) | 0;
    h2 = (Math.imul(33, h2) + str.charCodeAt(i) * 7) | 0;
  }
  return `${h1}.${h2}.${str.length}`;
};
const genCode = () => Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6);

const MSG_TTL_MS = 10 * 60 * 1000;
const RATE_LIMIT_COUNT = 5;
const RATE_LIMIT_WINDOW_MS = 10000;
const RATE_LIMIT_COOLDOWN_MS = 12000;
const TYPING_TIMEOUT_MS = 3000;

const AVATAR_COLORS = ["#39FF88", "#4FD1C5", "#F2B705", "#F27171", "#8B5CF6", "#38BDF8", "#FB923C"];
const AVATAR_SHAPES = [
  { key: "circle", Icon: Circle }, { key: "square", Icon: Square }, { key: "triangle", Icon: Triangle },
  { key: "hexagon", Icon: Hexagon }, { key: "star", Icon: Star },
];

const BAD_WORDS = ["aptal", "salak", "gerizekalı"];
const censorText = (text) => {
  let out = text;
  BAD_WORDS.forEach((w) => { out = out.replace(new RegExp(w, "gi"), "*".repeat(w.length)); });
  return out;
};

const URL_REGEX = /(https?:\/\/[^\s]+)/g;
const IMAGE_REGEX = /\.(png|jpe?g|gif|webp)(\?.*)?$/i;
const isImageUrl = (url) => IMAGE_REGEX.test(url) || /giphy\.com|tenor\.com/i.test(url);

const SECURITY_QUESTIONS = ["En sevdiğin oyun hangisi?", "İlk evcil hayvanının adı neydi?", "En sevdiğin renk hangisi?", "Doğduğun şehir neresi?", "En sevdiğin yemek nedir?"];
const CHANNELS = [{ id: "genel-1", name: "genel-1" }, { id: "genel-2", name: "genel-2" }, { id: "genel-3", name: "genel-3" }];
const DEFAULT_SERVER_CHANNELS = ["genel", "duyuru", "sohbet"];
const REACTION_EMOJIS = ["👍", "❤️", "😂", "🔥", "😢"];

const checkPasswordStrength = (pw, strong) =>
  strong ? pw.length >= 10 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw) && /[^A-Za-z0-9]/.test(pw) : pw.length >= 6;

async function safeGet(path) {
  try {
    const snap = await get(ref(db, path));
    return snap.exists() ? snap.val() : null;
  } catch { return null; }
}
const logActivity = (action, actor, detail = "") => push(ref(db, "activityLog"), { ts: Date.now(), action, actor, detail });

// unified scope addressing: global channel | private room | server channel | dm
const scopeKey = (s) => {
  if (s.kind === "global") return `global:${s.channelId}`;
  if (s.kind === "room") return `room:${s.roomId}`;
  if (s.kind === "server") return `server:${s.serverId}:${s.channelId}`;
  if (s.kind === "dm") return `dm:${s.dmId}`;
  return "unknown";
};
const dmIdFor = (a, b) => [a, b].sort().join("__");

const playBeep = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 720;
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch {}
};

const AvatarBadge = ({ color, shape, size = 26, onClick }) => {
  const found = AVATAR_SHAPES.find((s) => s.key === shape) || AVATAR_SHAPES[0];
  const Icon = found.Icon;
  return (
    <div
      onClick={onClick}
      style={{ width: size, height: size, borderRadius: 8, background: `${color}22`, border: `1.5px solid ${color}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: onClick ? "pointer" : "default" }}
    >
      <Icon size={size * 0.55} color={color} fill={color} />
    </div>
  );
};

export default function App() {
  const [session, setSession] = useState(null);
  const [authView, setAuthView] = useState("login");
  const [authForm, setAuthForm] = useState({ username: "", password: "", confirm: "", question: SECURITY_QUESTIONS[0], answer: "", captchaInput: "" });
  const [captcha, setCaptcha] = useState(() => ({ a: 1 + Math.floor(Math.random() * 8), b: 1 + Math.floor(Math.random() * 8) }));
  const [authError, setAuthError] = useState("");
  const [recoverStep, setRecoverStep] = useState(1);
  const [recoverAnswer, setRecoverAnswer] = useState("");
  const [recoverNewPw, setRecoverNewPw] = useState("");
  const [pickColor, setPickColor] = useState(AVATAR_COLORS[0]);
  const [pickShape, setPickShape] = useState("circle");

  const [theme, setTheme] = useState(() => localStorage.getItem("dagsx19_theme") || "dark");
  const [view, setView] = useState("landing");
  const [activeScope, setActiveScope] = useState(null);
  const [rooms, setRooms] = useState({});
  const [servers, setServers] = useState({});
  const [dms, setDms] = useState({});
  const [expandedServers, setExpandedServers] = useState({});
  const [roles, setRoles] = useState({});
  const [messages, setMessages] = useState({});
  const [presence, setPresence] = useState({});
  const [pinnedId, setPinnedId] = useState(null);
  const [input, setInput] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [logPanelOpen, setLogPanelOpen] = useState(false);
  const [reportsPanelOpen, setReportsPanelOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastText, setBroadcastText] = useState("");
  const [activityLog, setActivityLog] = useState([]);
  const [reports, setReports] = useState({});
  const [profileCard, setProfileCard] = useState(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createTab, setCreateTab] = useState("room");
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomPassword, setNewRoomPassword] = useState("");
  const [newServerName, setNewServerName] = useState("");
  const [createdInvite, setCreatedInvite] = useState(null);
  const [joinModal, setJoinModal] = useState(null);
  const [joinPasswordInput, setJoinPasswordInput] = useState("");
  const [joinError, setJoinError] = useState("");
  const [toast, setToast] = useState("");
  const [pendingInvite, setPendingInvite] = useState(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [dmTargetInput, setDmTargetInput] = useState("");
  const [dmModalOpen, setDmModalOpen] = useState(false);
  const scrollRef = useRef(null);
  const msgTimestampsRef = useRef([]);
  const typingTimeoutRef = useRef(null);
  const knownMsgIdsRef = useRef(new Set());

  const usernameLower = session?.username?.toLowerCase();
  const myRole = usernameLower ? roles[usernameLower] : null;
  const isDeveloper = myRole === "developer";
  const isRoomStaff = isDeveloper || myRole === "admin" || myRole === "mod";
  const activeRoom = activeScope?.kind === "room" ? rooms[activeScope.roomId] : null;
  const activeServer = activeScope?.kind === "server" ? servers[activeScope.serverId] : null;
  const isServerOwner = activeServer?.ownerUsername === session?.username;
  const isRoomOwner = activeRoom?.creatorUsername === session?.username;

  const flashToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2600); };

  // ---------- theme persistence ----------
  useEffect(() => { localStorage.setItem("dagsx19_theme", theme); }, [theme]);
  const T = theme === "dark" ? darkPalette : lightPalette;

  // ---------- restore session ----------
  useEffect(() => {
    try {
      const raw = localStorage.getItem("dagsx19_session");
      if (raw) setSession(JSON.parse(raw));
    } catch {}
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get("room");
    const serverParam = params.get("server");
    if (roomParam) setPendingInvite({ kind: "room", id: roomParam });
    else if (serverParam) setPendingInvite({ kind: "server", id: serverParam });
  }, []);

  useEffect(() => { if (session) localStorage.setItem("dagsx19_session", JSON.stringify(session)); }, [session]);

  // ---------- global ban watch (force logout if banned) ----------
  useEffect(() => {
    if (!usernameLower) return;
    const unsub = onValue(ref(db, `globalBans/${usernameLower}`), (snap) => {
      if (snap.exists()) {
        flashToast("Hesabın site genelinde yasaklandı.");
        logout();
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usernameLower]);

  useEffect(() => {
    const unsub = onValue(ref(db, "roles"), (snap) => setRoles(snap.val() || {}));
    return () => unsub();
  }, []);

  // ---------- load user's joined rooms/servers/dms ----------
  useEffect(() => {
    if (!usernameLower) return;
    (async () => {
      const joined = await safeGet(`users/${usernameLower}/joinedRooms`);
      if (joined) {
        const entries = await Promise.all(Object.keys(joined).map(async (id) => [id, await safeGet(`rooms/${id}`)]));
        setRooms((prev) => ({ ...prev, ...Object.fromEntries(entries.filter(([, r]) => r)) }));
      }
      const joinedServers = await safeGet(`users/${usernameLower}/joinedServers`);
      if (joinedServers) {
        const entries = await Promise.all(Object.keys(joinedServers).map(async (id) => [id, await safeGet(`servers/${id}`)]));
        setServers((prev) => ({ ...prev, ...Object.fromEntries(entries.filter(([, s]) => s)) }));
      }
      const dmList = await safeGet(`users/${usernameLower}/dms`);
      if (dmList) setDms(dmList);
    })();
  }, [usernameLower]);

  // ---------- handle pending invite ----------
  useEffect(() => {
    if (!session || !pendingInvite) return;
    (async () => {
      if (pendingInvite.kind === "room") {
        const room = await safeGet(`rooms/${pendingInvite.id}`);
        if (!room) { flashToast("Bu davet linki geçersiz."); setPendingInvite(null); return; }
        setRooms((prev) => ({ ...prev, [pendingInvite.id]: room }));
        tryJoinPrivate(pendingInvite.id, room);
      } else if (pendingInvite.kind === "server") {
        const server = await safeGet(`servers/${pendingInvite.id}`);
        if (!server) { flashToast("Bu sunucu daveti geçersiz."); setPendingInvite(null); return; }
        if (server.banned?.[usernameLower]) { flashToast("Bu sunucudan yasaklandınız."); setPendingInvite(null); return; }
        await set(ref(db, `servers/${pendingInvite.id}/members/${usernameLower}`), true);
        await set(ref(db, `users/${usernameLower}/joinedServers/${pendingInvite.id}`), true);
        setServers((prev) => ({ ...prev, [pendingInvite.id]: server }));
        setExpandedServers((prev) => ({ ...prev, [pendingInvite.id]: true }));
        flashToast(`"${server.name}" sunucusuna katıldın.`);
        const firstCh = Object.keys(server.channels || {})[0];
        if (firstCh) openScope({ kind: "server", serverId: pendingInvite.id, channelId: firstCh });
      }
      setPendingInvite(null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, pendingInvite]);

  // ---------- active scope listeners ----------
  useEffect(() => {
    if (view !== "room" || !activeScope || !session) return;
    const key = scopeKey(activeScope);
    knownMsgIdsRef.current = new Set();

    const msgsRef = ref(db, `messages/${key}`);
    const unsubMsgs = onValue(msgsRef, (snap) => {
      const val = snap.val() || {};
      const ids = Object.keys(val);
      const isFirstLoad = knownMsgIdsRef.current.size === 0 && ids.length > 0 && messages !== val;
      const newOnes = ids.filter((id) => !knownMsgIdsRef.current.has(id));
      if (!isFirstLoad) {
        newOnes.forEach((id) => {
          const m = val[id];
          if (m.type === "user" && m.username !== session.username) playBeep();
        });
      }
      knownMsgIdsRef.current = new Set(ids);
      setMessages(val);
    });

    const unsubPin = onValue(ref(db, `pinned/${key}`), (snap) => setPinnedId(snap.exists() ? snap.val() : null));

    let presRef = null;
    let hb = null;
    let unsubPres = null;
    let prune = null;

    if (activeScope.kind !== "dm") {
      presRef = ref(db, `presence/${key}/${usernameLower}`);
      const setOnline = (typing = false) => set(presRef, { username: session.username, avatarColor: session.avatarColor, avatarShape: session.avatarShape, lastSeen: Date.now(), typing });
      get(presRef).then((snap) => {
        if (!snap.exists()) {
          const sysRef = push(ref(db, `messages/${key}`));
          set(sysRef, { type: "system", text: `${session.username} katıldı`, ts: Date.now() });
        }
        setOnline(false);
      });
      hb = setInterval(() => setOnline(false), 8000);
      unsubPres = onValue(ref(db, `presence/${key}`), (snap) => {
        const val = snap.val() || {};
        const now = Date.now();
        setPresence(Object.fromEntries(Object.entries(val).filter(([, p]) => now - p.lastSeen < 20000)));
      });
    } else {
      setPresence({});
    }

    prune = setInterval(async () => {
      const snap = await get(msgsRef);
      const val = snap.val() || {};
      const now = Date.now();
      Object.entries(val).forEach(([id, m]) => { if (now - m.ts > MSG_TTL_MS) remove(ref(db, `messages/${key}/${id}`)); });
    }, 15000);

    return () => {
      unsubMsgs(); unsubPin();
      if (unsubPres) unsubPres();
      if (hb) clearInterval(hb);
      if (prune) clearInterval(prune);
      if (presRef) remove(presRef);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, activeScope && scopeKey(activeScope), session]);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);

  // ---------- developer panels data ----------
  useEffect(() => {
    if (!isDeveloper) return;
    const unsub = onValue(query(ref(db, "activityLog"), orderByChild("ts"), limitToLast(60)), (snap) => {
      const val = snap.val() || {};
      setActivityLog(Object.values(val).sort((a, b) => b.ts - a.ts));
    });
    const unsub2 = onValue(ref(db, "reports"), (snap) => setReports(snap.val() || {}));
    return () => { unsub(); unsub2(); };
  }, [isDeveloper]);

  // ---------- auth actions ----------
  const submitRegister = async () => {
    setAuthError("");
    const uname = authForm.username.trim();
    const unameLower = uname.toLowerCase();
    if (!uname || uname.length < 3) return setAuthError("Kullanıcı adı en az 3 karakter olmalı.");
    if (!/^[a-zA-Z0-9_]+$/.test(uname)) return setAuthError("Kullanıcı adı sadece harf, rakam ve alt çizgi içerebilir.");
    if (authForm.password !== authForm.confirm) return setAuthError("Şifreler eşleşmiyor.");
    if (parseInt(authForm.captchaInput, 10) !== captcha.a + captcha.b) {
      setCaptcha({ a: 1 + Math.floor(Math.random() * 8), b: 1 + Math.floor(Math.random() * 8) });
      return setAuthError("Doğrulama işlemi yanlış, tekrar dene.");
    }
    const isGhosty = unameLower === "ghosty";
    if (!checkPasswordStrength(authForm.password, isGhosty)) {
      return setAuthError(isGhosty ? "Ghosty hesabı için güçlü şifre gerekli (10+ karakter, büyük/küçük harf, rakam, sembol)." : "Şifre en az 6 karakter olmalı.");
    }
    if (!authForm.answer.trim()) return setAuthError("Güvenlik sorusu cevabı boş bırakılamaz.");
    if (await safeGet(`globalBans/${unameLower}`)) return setAuthError("Bu kullanıcı adı yasaklı.");
    const existing = await safeGet(`users/${unameLower}`);
    if (existing) return setAuthError("Bu kullanıcı adı zaten alınmış.");

    await set(ref(db, `users/${unameLower}`), {
      username: uname, passwordHash: simpleHash(authForm.password), securityQuestion: authForm.question,
      securityAnswerHash: simpleHash(authForm.answer.trim().toLowerCase()), avatarColor: pickColor, avatarShape: pickShape, createdAt: Date.now(),
    });
    if (isGhosty) await set(ref(db, `roles/${unameLower}`), "developer");
    setSession({ username: uname, avatarColor: pickColor, avatarShape: pickShape });
    flashToast(`Hoş geldin, ${uname}!`);
  };

  const submitLogin = async () => {
    setAuthError("");
    const uname = authForm.username.trim();
    const unameLower = uname.toLowerCase();
    if (!uname || !authForm.password) return setAuthError("Kullanıcı adı ve şifre gerekli.");
    if (await safeGet(`globalBans/${unameLower}`)) return setAuthError("Bu hesap site genelinde yasaklı.");
    const record = await safeGet(`users/${unameLower}`);
    if (!record || record.passwordHash !== simpleHash(authForm.password)) return setAuthError("Kullanıcı adı veya şifre hatalı.");
    setSession({ username: record.username, avatarColor: record.avatarColor, avatarShape: record.avatarShape });
    flashToast(`Tekrar hoş geldin, ${record.username}!`);
  };

  const submitRecoverCheck = async () => {
    setAuthError("");
    const unameLower = authForm.username.trim().toLowerCase();
    const record = await safeGet(`users/${unameLower}`);
    if (!record) return setAuthError("Böyle bir kullanıcı bulunamadı.");
    if (simpleHash(recoverAnswer.trim().toLowerCase()) !== record.securityAnswerHash) return setAuthError("Cevap yanlış.");
    setRecoverStep(2);
  };
  const submitRecoverReset = async () => {
    setAuthError("");
    const unameLower = authForm.username.trim().toLowerCase();
    const isGhosty = unameLower === "ghosty";
    if (!checkPasswordStrength(recoverNewPw, isGhosty)) return setAuthError(isGhosty ? "Ghosty için güçlü şifre gerekli." : "Şifre en az 6 karakter olmalı.");
    await set(ref(db, `users/${unameLower}/passwordHash`), simpleHash(recoverNewPw));
    flashToast("Şifre sıfırlandı, giriş yapabilirsin.");
    setAuthView("login"); setRecoverStep(1); setRecoverAnswer(""); setRecoverNewPw("");
  };

  const logout = () => {
    setSession(null);
    localStorage.removeItem("dagsx19_session");
    setView("landing"); setActiveScope(null);
  };

  // ---------- chat actions ----------
  const openScope = (scope) => {
    setActiveScope(scope); setMessages({}); setView("room");
    setPanelOpen(false); setSearchOpen(false); setSearchQuery(""); setLogPanelOpen(false); setReportsPanelOpen(false);
  };

  const createRoom = async () => {
    const name = newRoomName.trim();
    if (!name) return;
    if (!newRoomPassword) return flashToast("Özel oda için şifre gerekli.");
    const id = genCode();
    const room = { name, passwordHash: simpleHash(newRoomPassword), createdAt: Date.now(), creatorUsername: session.username, banned: {}, muted: {} };
    await set(ref(db, `rooms/${id}`), room);
    await set(ref(db, `users/${usernameLower}/joinedRooms/${id}`), true);
    setRooms((prev) => ({ ...prev, [id]: room }));
    setCreatedInvite({ id, link: `${window.location.origin}${window.location.pathname}?room=${id}`, type: "room" });
    setNewRoomName(""); setNewRoomPassword("");
  };

  const createServer = async () => {
    const name = newServerName.trim();
    if (!name) return;
    const id = genCode();
    const channels = Object.fromEntries(DEFAULT_SERVER_CHANNELS.map((n) => [genCode(), { name: n }]));
    const server = { name, ownerUsername: session.username, createdAt: Date.now(), channels, members: { [usernameLower]: true }, banned: {} };
    await set(ref(db, `servers/${id}`), server);
    await set(ref(db, `users/${usernameLower}/joinedServers/${id}`), true);
    setServers((prev) => ({ ...prev, [id]: server }));
    setExpandedServers((prev) => ({ ...prev, [id]: true }));
    setCreatedInvite({ id, link: `${window.location.origin}${window.location.pathname}?server=${id}`, type: "server" });
    setNewServerName("");
  };

  const addChannelToServer = async (serverId) => {
    const name = window.prompt("Yeni kanal adı:");
    if (!name || !name.trim()) return;
    const chId = genCode();
    await set(ref(db, `servers/${serverId}/channels/${chId}`), { name: name.trim() });
    setServers((prev) => ({ ...prev, [serverId]: { ...prev[serverId], channels: { ...prev[serverId].channels, [chId]: { name: name.trim() } } } }));
  };

  const finishCreateAndEnter = () => {
    if (!createdInvite) return;
    setCreateModalOpen(false);
    if (createdInvite.type === "room") openScope({ kind: "room", roomId: createdInvite.id });
    else {
      const server = servers[createdInvite.id];
      const firstCh = Object.keys(server?.channels || {})[0];
      if (firstCh) openScope({ kind: "server", serverId: createdInvite.id, channelId: firstCh });
    }
    setCreatedInvite(null);
  };

  const tryJoinPrivate = (id, room) => {
    if (room.banned?.[usernameLower]) { flashToast("Bu odadan yasaklandınız."); return; }
    setJoinModal({ id, room }); setJoinPasswordInput(""); setJoinError("");
  };
  const confirmJoinPrivate = async () => {
    if (simpleHash(joinPasswordInput) !== joinModal.room.passwordHash) return setJoinError("Şifre yanlış.");
    setRooms((prev) => ({ ...prev, [joinModal.id]: joinModal.room }));
    await set(ref(db, `users/${usernameLower}/joinedRooms/${joinModal.id}`), true);
    openScope({ kind: "room", roomId: joinModal.id });
    setJoinModal(null);
  };

  const leaveView = () => { setView("landing"); setActiveScope(null); setPanelOpen(false); setMessages({}); setPresence({}); };

  const handleTyping = (val) => {
    setInput(val);
    if (!session || !activeScope || activeScope.kind === "dm") return;
    const key = scopeKey(activeScope);
    const presRef = ref(db, `presence/${key}/${usernameLower}`);
    set(presRef, { username: session.username, avatarColor: session.avatarColor, avatarShape: session.avatarShape, lastSeen: Date.now(), typing: true });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => set(presRef, { username: session.username, avatarColor: session.avatarColor, avatarShape: session.avatarShape, lastSeen: Date.now(), typing: false }), TYPING_TIMEOUT_MS);
  };

  const sendMessage = async () => {
    const raw = input.trim();
    if (!raw || !activeScope) return;
    if (activeRoom?.muted?.[usernameLower]) return flashToast("Bu odada susturuldunuz.");
    const now = Date.now();
    msgTimestampsRef.current = msgTimestampsRef.current.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (msgTimestampsRef.current.length >= RATE_LIMIT_COUNT) {
      setRateLimited(true); flashToast("Çok hızlı mesaj gönderiyorsun, biraz yavaşla.");
      setTimeout(() => setRateLimited(false), RATE_LIMIT_COOLDOWN_MS);
      return;
    }
    msgTimestampsRef.current.push(now);
    const text = censorText(raw);
    const key = scopeKey(activeScope);
    const msgRef = push(ref(db, `messages/${key}`));
    await set(msgRef, { type: "user", username: session.username, avatarColor: session.avatarColor, avatarShape: session.avatarShape, text, ts: now });
    setInput("");
  };

  const deleteMessage = (msgId) => remove(ref(db, `messages/${scopeKey(activeScope)}/${msgId}`));

  const toggleReaction = async (msgId, emoji) => {
    const path = `messages/${scopeKey(activeScope)}/${msgId}/reactions/${emoji}/${usernameLower}`;
    const existing = await safeGet(path);
    await set(ref(db, path), existing ? null : true);
  };

  const togglePin = async (msgId) => {
    const path = `pinned/${scopeKey(activeScope)}`;
    await set(ref(db, path), pinnedId === msgId ? null : msgId);
  };

  const reportMessage = async (msg) => {
    const reason = window.prompt("Bu mesajı neden bildiriyorsun? (kısa açıklama)");
    if (reason === null) return;
    await push(ref(db, "reports"), { scopeKey: scopeKey(activeScope), msgId: msg.id, msgText: msg.text || "", msgAuthor: msg.username, reporterUsername: session.username, reason: reason.trim(), ts: Date.now() });
    flashToast("Bildirim gönderildi, yöneticiler inceleyecek.");
  };

  const updateActiveRoom = async (mutateFn) => {
    const current = await safeGet(`rooms/${activeScope.roomId}`);
    const updated = mutateFn(current || activeRoom);
    await set(ref(db, `rooms/${activeScope.roomId}`), updated);
    setRooms((prev) => ({ ...prev, [activeScope.roomId]: updated }));
  };
  const toggleMute = (t) => updateActiveRoom((r) => ({ ...r, muted: { ...(r.muted || {}), [t]: r.muted?.[t] ? null : true } }));
  const banUserFromRoom = (t) => { updateActiveRoom((r) => ({ ...r, banned: { ...(r.banned || {}), [t]: true } })); flashToast("Kullanıcı odadan yasaklandı."); logActivity("room_ban", session.username, t); };
  const unbanUserFromRoom = (t) => updateActiveRoom((r) => ({ ...r, banned: { ...(r.banned || {}), [t]: null } }));

  const banUserFromServer = async (t) => {
    const s = await safeGet(`servers/${activeScope.serverId}`);
    await set(ref(db, `servers/${activeScope.serverId}/banned/${t}`), true);
    setServers((prev) => ({ ...prev, [activeScope.serverId]: { ...s, banned: { ...(s.banned || {}), [t]: true } } }));
    flashToast("Kullanıcı sunucudan yasaklandı.");
    logActivity("server_ban", session.username, t);
  };

  const promote = async (t, role) => { await set(ref(db, `roles/${t}`), role); flashToast(`Yetki güncellendi: ${role}`); logActivity("promote", session.username, `${t} -> ${role}`); };
  const revokeRole = (t) => { remove(ref(db, `roles/${t}`)); logActivity("revoke_role", session.username, t); };

  const globalBan = async (t) => {
    if (!window.confirm(`${t} kullanıcısını TÜM SİTEDEN yasaklamak istediğine emin misin?`)) return;
    await set(ref(db, `globalBans/${t}`), true);
    flashToast("Kullanıcı site genelinde yasaklandı.");
    logActivity("global_ban", session.username, t);
  };

  const deleteRoom = async () => {
    await remove(ref(db, `rooms/${activeScope.roomId}`));
    await remove(ref(db, `messages/${scopeKey(activeScope)}`));
    await remove(ref(db, `presence/${scopeKey(activeScope)}`));
    setRooms((prev) => { const cp = { ...prev }; delete cp[activeScope.roomId]; return cp; });
    logActivity("delete_room", session.username, activeScope.roomId);
    leaveView(); flashToast("Oda silindi.");
  };

  const copyInvite = (link) => { navigator.clipboard?.writeText(link); flashToast("Bağlantı kopyalandı."); };

  const startDm = async () => {
    const target = dmTargetInput.trim();
    if (!target) return;
    const targetLower = target.toLowerCase();
    if (targetLower === usernameLower) return flashToast("Kendine mesaj gönderemezsin.");
    const targetUser = await safeGet(`users/${targetLower}`);
    if (!targetUser) return flashToast("Böyle bir kullanıcı bulunamadı.");
    const dmId = dmIdFor(usernameLower, targetLower);
    await set(ref(db, `users/${usernameLower}/dms/${targetLower}`), true);
    await set(ref(db, `users/${targetLower}/dms/${usernameLower}`), true);
    setDms((prev) => ({ ...prev, [targetLower]: true }));
    setDmModalOpen(false); setDmTargetInput("");
    openScope({ kind: "dm", dmId, otherUser: targetUser.username });
  };

  const openDmFromProfile = async (targetUsername) => {
    const targetLower = targetUsername.toLowerCase();
    if (targetLower === usernameLower) return;
    const dmId = dmIdFor(usernameLower, targetLower);
    await set(ref(db, `users/${usernameLower}/dms/${targetLower}`), true);
    await set(ref(db, `users/${targetLower}/dms/${usernameLower}`), true);
    setDms((prev) => ({ ...prev, [targetLower]: true }));
    setProfileCard(null);
    openScope({ kind: "dm", dmId, otherUser: targetUsername });
  };

  const sendBroadcast = async () => {
    const text = broadcastText.trim();
    if (!text) return;
    await Promise.all(CHANNELS.map((c) => push(ref(db, `messages/global:${c.id}`), { type: "system", text: `📢 DUYURU: ${text}`, ts: Date.now() })));
    logActivity("broadcast", session.username, text);
    setBroadcastText(""); setBroadcastOpen(false);
    flashToast("Duyuru gönderildi.");
  };

  const openProfile = async (username) => {
    const record = await safeGet(`users/${username.toLowerCase()}`);
    setProfileCard({ username: record?.username || username, avatarColor: record?.avatarColor, avatarShape: record?.avatarShape, createdAt: record?.createdAt });
  };

  const messageList = useMemo(() => {
    let list = Object.entries(messages).map(([id, m]) => ({ id, ...m })).filter((m) => Date.now() - m.ts < MSG_TTL_MS).sort((a, b) => a.ts - b.ts);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((m) => m.type === "system" || (m.text || "").toLowerCase().includes(q));
    }
    return list;
  }, [messages, searchQuery]);

  const pinnedMessage = pinnedId ? messageList.find((m) => m.id === pinnedId) || (messages[pinnedId] ? { id: pinnedId, ...messages[pinnedId] } : null) : null;
  const presenceList = Object.entries(presence).map(([u, p]) => ({ unameLower: u, ...p }));
  const typingUsers = presenceList.filter((p) => p.typing && p.unameLower !== usernameLower);

  const renderMessageContent = (text) => {
    const urls = text.match(URL_REGEX) || [];
    const imgUrl = urls.find(isImageUrl);
    const parts = text.split(URL_REGEX);
    return (
      <>
        <div>
          {parts.map((part, i) =>
            URL_REGEX.test(part) ? (
              <span key={i} style={{ ...styles.linkText, color: T.link }} onClick={() => { if (window.confirm("Bu bağlantı harici bir siteye gidiyor, güvenilir olmayabilir. Devam etmek istiyor musun?")) window.open(part, "_blank", "noopener,noreferrer"); }}>
                {part}
              </span>
            ) : (
              <span key={i}>{part}</span>
            )
          )}
        </div>
        {imgUrl && <img src={imgUrl} alt="paylaşılan görsel" style={styles.sharedImage} onClick={() => window.open(imgUrl, "_blank")} />}
      </>
    );
  };

  // ================= AUTH SCREENS =================
  if (!session) {
    return (
      <div style={{ ...styles.app, background: T.bg, color: T.text }}>
        <style>{globalCss}</style>
        <div style={styles.authWrap}>
          <div style={styles.authBrand}>
            <Radio size={22} color="#39FF88" style={{ animation: "pulse 2s infinite" }} />
            <span style={styles.brandText}>DAGSx19</span>
          </div>

          {authView === "login" && (
            <div style={{ ...styles.authCard, background: T.panel, borderColor: T.border }}>
              <h2 style={{ ...styles.authTitle, color: T.textStrong }}>Giriş yap</h2>
              <input style={{ ...styles.input, background: T.inputBg, borderColor: T.border, color: T.textStrong }} placeholder="Kullanıcı adı" value={authForm.username} onChange={(e) => setAuthForm({ ...authForm, username: e.target.value })} />
              <input style={{ ...styles.input, background: T.inputBg, borderColor: T.border, color: T.textStrong }} placeholder="Şifre" type="password" value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} onKeyDown={(e) => e.key === "Enter" && submitLogin()} />
              {authError && <span style={styles.errorText}>{authError}</span>}
              <button style={styles.primaryBtn} onClick={submitLogin}>Giriş yap</button>
              <div style={styles.authLinks}>
                <span style={styles.authLink} onClick={() => { setAuthView("register"); setAuthError(""); }}>Hesabın yok mu? Kayıt ol</span>
                <span style={styles.authLink} onClick={() => { setAuthView("recover"); setAuthError(""); setRecoverStep(1); }}>Şifremi unuttum</span>
              </div>
            </div>
          )}

          {authView === "register" && (
            <div style={{ ...styles.authCard, background: T.panel, borderColor: T.border }}>
              <h2 style={{ ...styles.authTitle, color: T.textStrong }}>Kayıt ol</h2>
              <input style={{ ...styles.input, background: T.inputBg, borderColor: T.border, color: T.textStrong }} placeholder="Kullanıcı adı" value={authForm.username} onChange={(e) => setAuthForm({ ...authForm, username: e.target.value })} />
              <input style={{ ...styles.input, background: T.inputBg, borderColor: T.border, color: T.textStrong }} placeholder="Şifre" type="password" value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} />
              <input style={{ ...styles.input, background: T.inputBg, borderColor: T.border, color: T.textStrong }} placeholder="Şifre (tekrar)" type="password" value={authForm.confirm} onChange={(e) => setAuthForm({ ...authForm, confirm: e.target.value })} />
              <select style={{ ...styles.input, background: T.inputBg, borderColor: T.border, color: T.textStrong }} value={authForm.question} onChange={(e) => setAuthForm({ ...authForm, question: e.target.value })}>
                {SECURITY_QUESTIONS.map((q) => <option key={q} value={q}>{q}</option>)}
              </select>
              <input style={{ ...styles.input, background: T.inputBg, borderColor: T.border, color: T.textStrong }} placeholder="Güvenlik cevabın" value={authForm.answer} onChange={(e) => setAuthForm({ ...authForm, answer: e.target.value })} />

              <div style={styles.avatarPickLabel}>Avatar rengi</div>
              <div style={styles.colorRow}>
                {AVATAR_COLORS.map((c) => <button key={c} onClick={() => setPickColor(c)} style={{ ...styles.colorSwatch, background: c, outline: pickColor === c ? "2px solid #fff" : "none" }} />)}
              </div>
              <div style={styles.avatarPickLabel}>Avatar şekli</div>
              <div style={styles.colorRow}>
                {AVATAR_SHAPES.map((s) => (
                  <button key={s.key} onClick={() => setPickShape(s.key)} style={{ ...styles.shapeSwatch, borderColor: pickShape === s.key ? pickColor : T.border }}>
                    <s.Icon size={16} color={pickColor} fill={pickShape === s.key ? pickColor : "none"} />
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "center", margin: "4px 0" }}>
                <AvatarBadge color={pickColor} shape={pickShape} size={40} />
              </div>

              <div style={styles.captchaRow}>
                <span style={{ color: T.textStrong, fontSize: 13 }}>Doğrulama: {captcha.a} + {captcha.b} = ?</span>
                <input style={{ ...styles.captchaInput, background: T.inputBg, borderColor: T.border, color: T.textStrong }} value={authForm.captchaInput} onChange={(e) => setAuthForm({ ...authForm, captchaInput: e.target.value })} />
              </div>

              {authError && <span style={styles.errorText}>{authError}</span>}
              <button style={styles.primaryBtn} onClick={submitRegister}>Kayıt ol ve gir</button>
              <div style={styles.authLinks}>
                <span style={styles.authLink} onClick={() => { setAuthView("login"); setAuthError(""); }}>Zaten hesabın var mı? Giriş yap</span>
              </div>
            </div>
          )}

          {authView === "recover" && (
            <div style={{ ...styles.authCard, background: T.panel, borderColor: T.border }}>
              <h2 style={{ ...styles.authTitle, color: T.textStrong }}>Şifre kurtarma</h2>
              {recoverStep === 1 && (
                <>
                  <input style={{ ...styles.input, background: T.inputBg, borderColor: T.border, color: T.textStrong }} placeholder="Kullanıcı adı" value={authForm.username} onChange={(e) => setAuthForm({ ...authForm, username: e.target.value })} />
                  <input style={{ ...styles.input, background: T.inputBg, borderColor: T.border, color: T.textStrong }} placeholder="Güvenlik sorusu cevabın" value={recoverAnswer} onChange={(e) => setRecoverAnswer(e.target.value)} />
                  {authError && <span style={styles.errorText}>{authError}</span>}
                  <button style={styles.primaryBtn} onClick={submitRecoverCheck}>Devam et</button>
                </>
              )}
              {recoverStep === 2 && (
                <>
                  <input style={{ ...styles.input, background: T.inputBg, borderColor: T.border, color: T.textStrong }} placeholder="Yeni şifre" type="password" value={recoverNewPw} onChange={(e) => setRecoverNewPw(e.target.value)} />
                  {authError && <span style={styles.errorText}>{authError}</span>}
                  <button style={styles.primaryBtn} onClick={submitRecoverReset}>Şifreyi sıfırla</button>
                </>
              )}
              <div style={styles.authLinks}>
                <span style={styles.authLink} onClick={() => { setAuthView("login"); setAuthError(""); }}>Girişe dön</span>
              </div>
            </div>
          )}

          <p style={{ ...styles.authNote, color: T.textDim }}>
            <Shield size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
            Bu platform IP veya cihaz bilgisi toplamaz. Sadece kullanıcı adın görünür.
          </p>
        </div>
      </div>
    );
  }

  // ================= MAIN APP =================
  return (
    <div style={{ ...styles.app, background: T.bg, color: T.text }}>
      <style>{globalCss}</style>
      {toast && <div style={{ ...styles.toast, background: T.panel, borderColor: "#39FF8855", color: T.textStrong }}>{toast}</div>}

      <header style={{ ...styles.header, borderColor: T.border, background: T.headerBg }}>
        <div style={styles.brand}>
          <Radio size={20} color="#39FF88" style={{ animation: "pulse 2s infinite" }} />
          <span style={styles.brandText}>DAGSx19</span>
        </div>
        <div style={styles.headerRight}>
          <button style={{ ...styles.ghostBtn, borderColor: T.border, color: T.text }} onClick={() => setTheme(theme === "dark" ? "light" : "dark")} title="Tema değiştir">
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          {isDeveloper && (
            <>
              <button style={{ ...styles.ghostBtn, borderColor: T.border, color: T.text }} onClick={() => setBroadcastOpen(true)} title="Duyuru gönder"><Megaphone size={14} /></button>
              <button style={{ ...styles.ghostBtn, borderColor: T.border, color: T.text }} onClick={() => setLogPanelOpen(true)} title="Aktivite kaydı"><ScrollText size={14} /></button>
              <button style={{ ...styles.ghostBtn, borderColor: T.border, color: T.text }} onClick={() => setReportsPanelOpen(true)} title="Raporlar">
                <Flag size={14} /> {Object.keys(reports).length > 0 && <span style={styles.reportBadge}>{Object.keys(reports).length}</span>}
              </button>
            </>
          )}
          <AvatarBadge color={session.avatarColor} shape={session.avatarShape} size={24} onClick={() => openProfile(session.username)} />
          <span style={{ ...styles.nickBadge, color: T.textStrong }}>{session.username}</span>
          {isDeveloper && <span style={styles.roleBadge}><Crown size={12} /> geliştirici</span>}
          <button style={{ ...styles.ghostBtn, borderColor: T.border, color: T.text }} onClick={logout}><LogOut size={14} /></button>
        </div>
      </header>

      <div style={styles.body}>
        <aside style={{ ...styles.sidebar, borderColor: T.border }}>
          <div style={styles.sidebarSectionLabel}>Kanallar</div>
          {CHANNELS.map((c) => {
            const sc = { kind: "global", channelId: c.id };
            const active = activeScope && scopeKey(activeScope) === scopeKey(sc);
            return (
              <button key={c.id} style={{ ...styles.channelBtn, color: active ? "#39FF88" : T.textDim, background: active ? "#39FF8815" : "transparent" }} onClick={() => openScope(sc)}>
                <Hash size={15} />{c.name}
              </button>
            );
          })}

          <div style={{ ...styles.sidebarSectionLabel, marginTop: 16 }}>Sunucularım</div>
          {Object.keys(servers).length === 0 && <div style={styles.emptyNoteSmall}>Henüz yok</div>}
          {Object.entries(servers).map(([sid, s]) => (
            <div key={sid}>
              <button style={{ ...styles.channelBtn, color: T.textDim }} onClick={() => setExpandedServers((p) => ({ ...p, [sid]: !p[sid] }))}>
                {expandedServers[sid] ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <Server size={14} />{s.name}
              </button>
              {expandedServers[sid] && (
                <div style={{ paddingLeft: 18 }}>
                  {Object.entries(s.channels || {}).map(([cid, ch]) => {
                    const sc = { kind: "server", serverId: sid, channelId: cid };
                    const active = activeScope && scopeKey(activeScope) === scopeKey(sc);
                    return (
                      <button key={cid} style={{ ...styles.channelBtn, color: active ? "#39FF88" : T.textDim, background: active ? "#39FF8815" : "transparent", fontSize: 12.5 }} onClick={() => openScope(sc)}>
                        <Hash size={13} />{ch.name}
                      </button>
                    );
                  })}
                  {(s.ownerUsername === session.username || isDeveloper) && (
                    <button style={{ ...styles.newRoomBtn, fontSize: 11.5, padding: "5px 9px" }} onClick={() => addChannelToServer(sid)}><Plus size={12} /> Kanal ekle</button>
                  )}
                </div>
              )}
            </div>
          ))}

          <div style={{ ...styles.sidebarSectionLabel, marginTop: 16 }}>Özel Odalarım</div>
          {Object.keys(rooms).length === 0 && <div style={styles.emptyNoteSmall}>Henüz yok</div>}
          {Object.entries(rooms).map(([id, r]) => {
            const sc = { kind: "room", roomId: id };
            const active = activeScope && scopeKey(activeScope) === scopeKey(sc);
            return (
              <button key={id} style={{ ...styles.channelBtn, color: active ? "#39FF88" : T.textDim, background: active ? "#39FF8815" : "transparent" }} onClick={() => openScope(sc)}>
                <Lock size={13} />{r.name}
              </button>
            );
          })}

          <div style={{ ...styles.sidebarSectionLabel, marginTop: 16 }}>Mesajlar</div>
          {Object.keys(dms).length === 0 && <div style={styles.emptyNoteSmall}>Henüz yok</div>}
          {Object.keys(dms).map((otherLower) => {
            const dmId = dmIdFor(usernameLower, otherLower);
            const sc = { kind: "dm", dmId, otherUser: otherLower };
            const active = activeScope && scopeKey(activeScope) === scopeKey(sc);
            return (
              <button key={otherLower} style={{ ...styles.channelBtn, color: active ? "#39FF88" : T.textDim, background: active ? "#39FF8815" : "transparent" }} onClick={() => openScope(sc)}>
                <MessageSquare size={13} />{otherLower}
              </button>
            );
          })}
          <button style={styles.newRoomBtn} onClick={() => setDmModalOpen(true)}><Plus size={14} /> Yeni mesaj</button>

          <button style={{ ...styles.newRoomBtn, marginTop: 14 }} onClick={() => { setCreateModalOpen(true); setCreatedInvite(null); }}><Plus size={14} /> Oda / Sunucu oluştur</button>
        </aside>

        <main style={styles.mainArea}>
          {view === "landing" && (
            <div style={styles.landingHint}><Radio size={34} color={T.border} /><p style={{ color: T.textDim }}>Soldan bir kanal seç ya da yeni bir şey oluştur.</p></div>
          )}

          {view === "room" && activeScope && (
            <>
              <div style={{ ...styles.roomHeader, borderColor: T.border }}>
                <div style={styles.roomHeaderLeft}>
                  {activeScope.kind === "global" && <Hash size={16} color="#39FF88" />}
                  {activeScope.kind === "room" && <Lock size={14} color={T.textDim} />}
                  {activeScope.kind === "server" && <Hash size={16} color="#39FF88" />}
                  {activeScope.kind === "dm" && <MessageSquare size={15} color="#39FF88" />}
                  <span style={{ ...styles.roomTitle, color: T.textStrong }}>
                    {activeScope.kind === "global" && CHANNELS.find((c) => c.id === activeScope.channelId)?.name}
                    {activeScope.kind === "room" && activeRoom?.name}
                    {activeScope.kind === "server" && `${activeServer?.name} / ${activeServer?.channels?.[activeScope.channelId]?.name}`}
                    {activeScope.kind === "dm" && activeScope.otherUser}
                  </span>
                  {activeScope.kind !== "dm" && <span style={styles.presenceCount}><Users size={13} /> {presenceList.length}</span>}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {activeScope.kind === "room" && <button style={{ ...styles.iconBtn, borderColor: T.border }} title="Davet linkini kopyala" onClick={() => copyInvite(`${window.location.origin}${window.location.pathname}?room=${activeScope.roomId}`)}><Link2 size={15} /></button>}
                  {activeScope.kind === "server" && <button style={{ ...styles.iconBtn, borderColor: T.border }} title="Davet linkini kopyala" onClick={() => copyInvite(`${window.location.origin}${window.location.pathname}?server=${activeScope.serverId}`)}><Link2 size={15} /></button>}
                  <button style={{ ...styles.iconBtn, borderColor: T.border }} onClick={() => setSearchOpen((s) => !s)}><Search size={15} /></button>
                  {((activeScope.kind === "room" && (isRoomStaff || isRoomOwner)) || (activeScope.kind === "server" && (isDeveloper || isServerOwner))) && (
                    <button style={{ ...styles.ghostBtn, borderColor: T.border, color: T.text }} onClick={() => setPanelOpen(true)}><ShieldCheck size={14} /> Panel</button>
                  )}
                </div>
              </div>

              {pinnedMessage && (
                <div style={styles.pinnedBar}>
                  <Pin size={12} color="#39FF88" />
                  <span style={{ fontWeight: 700, marginRight: 4 }}>{pinnedMessage.username}:</span>
                  <span>{pinnedMessage.text}</span>
                </div>
              )}

              {searchOpen && (
                <div style={{ ...styles.searchBar, borderColor: T.border, background: T.inputBg }}>
                  <Search size={14} color={T.textDim} />
                  <input style={{ ...styles.searchInput, color: T.textStrong }} placeholder="Mesajlarda ara..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} autoFocus />
                  <X size={14} style={{ cursor: "pointer" }} onClick={() => { setSearchOpen(false); setSearchQuery(""); }} />
                </div>
              )}

              <div style={styles.messages} ref={scrollRef}>
                {messageList.length === 0 && <div style={{ ...styles.emptyNote, color: T.textDim }}>Henüz mesaj yok. İlk mesajı sen yaz.</div>}
                {messageList.map((m) => {
                  if (m.type === "system") return <div key={m.id} style={styles.systemMsg}>{m.text}</div>;
                  const age = (Date.now() - m.ts) / MSG_TTL_MS;
                  const reactions = m.reactions || {};
                  const canModerate = (activeScope.kind === "room" && (isRoomStaff || isRoomOwner)) || (activeScope.kind === "server" && (isDeveloper || isServerOwner));
                  return (
                    <div key={m.id} style={{ ...styles.msgRow, animation: "fadein .25s ease", opacity: age > 0.7 ? 0.5 : 1 }}>
                      <AvatarBadge color={m.avatarColor || "#39FF88"} shape={m.avatarShape || "circle"} size={28} onClick={() => openProfile(m.username)} />
                      <div style={{ ...styles.msgBubble, background: T.panel, borderColor: T.border }}>
                        <div style={styles.msgHead}>
                          <span style={{ ...styles.msgNick, color: m.username === session.username ? "#39FF88" : T.mention, cursor: "pointer" }} onClick={() => openProfile(m.username)}>{m.username}</span>
                          <span style={{ ...styles.msgTime, color: T.textDim }}>{new Date(m.ts).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span>
                          <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                            {canModerate && <button style={styles.msgIconBtn} onClick={() => togglePin(m.id)} title="Sabitle"><Pin size={12} color={pinnedId === m.id ? "#39FF88" : T.textDim} /></button>}
                            {m.username !== session.username && <button style={styles.msgIconBtn} onClick={() => reportMessage(m)} title="Bildir"><Flag size={12} color={T.textDim} /></button>}
                            {canModerate && <button style={styles.msgIconBtn} onClick={() => deleteMessage(m.id)} title="Sil"><Trash2 size={12} color={T.textDim} /></button>}
                          </div>
                        </div>
                        <div style={{ ...styles.msgText, color: "#39FF88" }}>{renderMessageContent(m.text)}</div>
                        <div style={styles.reactionRow}>
                          {REACTION_EMOJIS.map((emoji) => {
                            const count = Object.keys(reactions[emoji] || {}).length;
                            const mine = reactions[emoji]?.[usernameLower];
                            return (
                              <button key={emoji} style={{ ...styles.reactionBtn, borderColor: mine ? "#39FF88" : T.border, color: mine ? "#39FF88" : T.textDim }} onClick={() => toggleReaction(m.id, emoji)}>
                                {emoji} {count > 0 && count}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {typingUsers.length > 0 && <div style={styles.typingRow}>{typingUsers.map((t) => t.username).join(", ")} yazıyor...</div>}
              </div>

              <div style={{ ...styles.inputRow, borderColor: T.border }}>
                <input style={{ ...styles.chatInput, background: T.inputBg, borderColor: T.border }} placeholder={rateLimited ? "Biraz bekle..." : "Mesaj yaz..."} value={input} onChange={(e) => handleTyping(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMessage()} maxLength={500} disabled={rateLimited} />
                <button style={styles.sendBtn} onClick={sendMessage} disabled={rateLimited}><Send size={16} /></button>
              </div>
            </>
          )}
        </main>
      </div>

      {/* create room/server modal */}
      {createModalOpen && (
        <div style={styles.overlay} onClick={() => { setCreateModalOpen(false); setCreatedInvite(null); }}>
          <div style={{ ...styles.modal, background: T.panel, borderColor: T.border }} onClick={(e) => e.stopPropagation()}>
            <div style={{ ...styles.modalHead, color: T.textStrong }}>
              <span>{createdInvite ? "Oluşturuldu!" : "Oluştur"}</span>
              <X size={16} style={{ cursor: "pointer" }} onClick={() => { setCreateModalOpen(false); setCreatedInvite(null); }} />
            </div>

            {!createdInvite ? (
              <>
                <div style={styles.tabRow}>
                  <button style={{ ...styles.tabBtn, ...(createTab === "room" ? styles.tabBtnActive : {}) }} onClick={() => setCreateTab("room")}>Özel Oda</button>
                  <button style={{ ...styles.tabBtn, ...(createTab === "server" ? styles.tabBtnActive : {}) }} onClick={() => setCreateTab("server")}>Sunucu</button>
                </div>
                {createTab === "room" ? (
                  <>
                    <input style={{ ...styles.input, background: T.inputBg, borderColor: T.border, color: T.textStrong }} placeholder="Oda adı" value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} />
                    <input style={{ ...styles.input, background: T.inputBg, borderColor: T.border, color: T.textStrong }} placeholder="Oda şifresi" type="password" value={newRoomPassword} onChange={(e) => setNewRoomPassword(e.target.value)} />
                    <p style={{ ...styles.modalNote, color: T.textDim }}><AlertTriangle size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Bu oda listelenmez, sadece davet linkini bilenler girebilir.</p>
                    <button style={styles.primaryBtn} onClick={createRoom}>Oluştur</button>
                  </>
                ) : (
                  <>
                    <input style={{ ...styles.input, background: T.inputBg, borderColor: T.border, color: T.textStrong }} placeholder="Sunucu adı" value={newServerName} onChange={(e) => setNewServerName(e.target.value)} />
                    <p style={{ ...styles.modalNote, color: T.textDim }}>Discord gibi kendi kanalları olan bir sunucu oluşturulur (#genel, #duyuru, #sohbet). Katılım sadece davet linkiyle olur.</p>
                    <button style={styles.primaryBtn} onClick={createServer}>Sunucu oluştur</button>
                  </>
                )}
              </>
            ) : (
              <>
                <p style={{ ...styles.modalNote, color: T.textDim }}>{createdInvite.type === "room" ? "Oda" : "Sunucu"} oluşturuldu! Bu linki paylaşarak davet edebilirsin:</p>
                <div style={{ ...styles.inviteBox, background: T.inputBg, borderColor: T.border }}>
                  <span style={styles.inviteLink}>{createdInvite.link}</span>
                  <button style={styles.iconBtnSmall} onClick={() => copyInvite(createdInvite.link)}><Copy size={13} /></button>
                </div>
                <button style={styles.primaryBtn} onClick={finishCreateAndEnter}>Gir</button>
              </>
            )}
          </div>
        </div>
      )}

      {joinModal && (
        <div style={styles.overlay} onClick={() => setJoinModal(null)}>
          <div style={{ ...styles.modal, background: T.panel, borderColor: T.border }} onClick={(e) => e.stopPropagation()}>
            <div style={{ ...styles.modalHead, color: T.textStrong }}>
              <span>"{joinModal.room.name}" için şifre</span>
              <X size={16} style={{ cursor: "pointer" }} onClick={() => setJoinModal(null)} />
            </div>
            <input style={{ ...styles.input, background: T.inputBg, borderColor: T.border, color: T.textStrong }} placeholder="Şifre" type="password" value={joinPasswordInput} onChange={(e) => setJoinPasswordInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && confirmJoinPrivate()} autoFocus />
            {joinError && <span style={styles.errorText}>{joinError}</span>}
            <button style={styles.primaryBtn} onClick={confirmJoinPrivate}>Katıl</button>
          </div>
        </div>
      )}

      {dmModalOpen && (
        <div style={styles.overlay} onClick={() => setDmModalOpen(false)}>
          <div style={{ ...styles.modal, background: T.panel, borderColor: T.border }} onClick={(e) => e.stopPropagation()}>
            <div style={{ ...styles.modalHead, color: T.textStrong }}>
              <span>Yeni mesaj</span>
              <X size={16} style={{ cursor: "pointer" }} onClick={() => setDmModalOpen(false)} />
            </div>
            <input style={{ ...styles.input, background: T.inputBg, borderColor: T.border, color: T.textStrong }} placeholder="Kullanıcı adı" value={dmTargetInput} onChange={(e) => setDmTargetInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && startDm()} autoFocus />
            <button style={styles.primaryBtn} onClick={startDm}>Mesaj gönder</button>
          </div>
        </div>
      )}

      {profileCard && (
        <div style={styles.overlay} onClick={() => setProfileCard(null)}>
          <div style={{ ...styles.modal, background: T.panel, borderColor: T.border, alignItems: "center", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
            <AvatarBadge color={profileCard.avatarColor || "#39FF88"} shape={profileCard.avatarShape || "circle"} size={54} />
            <div style={{ fontSize: 16, fontWeight: 700, color: T.textStrong }}>{profileCard.username}</div>
            {profileCard.createdAt && <div style={{ fontSize: 11.5, color: T.textDim }}>Katılma: {new Date(profileCard.createdAt).toLocaleDateString("tr-TR")}</div>}
            {profileCard.username !== session.username && (
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <button style={styles.primaryBtn} onClick={() => openDmFromProfile(profileCard.username)}>Mesaj gönder</button>
                {isDeveloper && <button style={styles.dangerBtnSmall} onClick={() => globalBan(profileCard.username.toLowerCase())}><Ban size={13} /> Siteden yasakla</button>}
              </div>
            )}
            <button style={{ ...styles.ghostBtn, borderColor: T.border, color: T.text, marginTop: 4 }} onClick={() => setProfileCard(null)}>Kapat</button>
          </div>
        </div>
      )}

      {broadcastOpen && (
        <div style={styles.overlay} onClick={() => setBroadcastOpen(false)}>
          <div style={{ ...styles.modal, background: T.panel, borderColor: T.border }} onClick={(e) => e.stopPropagation()}>
            <div style={{ ...styles.modalHead, color: T.textStrong }}><span><Megaphone size={15} style={{ marginRight: 6, verticalAlign: -2 }} />Duyuru gönder</span><X size={16} style={{ cursor: "pointer" }} onClick={() => setBroadcastOpen(false)} /></div>
            <p style={{ ...styles.modalNote, color: T.textDim }}>3 sabit kanala aynı anda gönderilir.</p>
            <textarea style={{ ...styles.input, minHeight: 80 }} value={broadcastText} onChange={(e) => setBroadcastText(e.target.value)} />
            <button style={styles.primaryBtn} onClick={sendBroadcast}>Gönder</button>
          </div>
        </div>
      )}

      {logPanelOpen && (
        <div style={styles.overlay} onClick={() => setLogPanelOpen(false)}>
          <div style={{ ...styles.modal, background: T.panel, borderColor: T.border, maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ ...styles.modalHead, color: T.textStrong }}><span><ScrollText size={15} style={{ marginRight: 6, verticalAlign: -2 }} />Aktivite kaydı</span><X size={16} style={{ cursor: "pointer" }} onClick={() => setLogPanelOpen(false)} /></div>
            <div style={styles.panelList}>
              {activityLog.length === 0 && <span style={styles.emptyNote}>Henüz kayıt yok.</span>}
              {activityLog.map((l, i) => (
                <div key={i} style={{ ...styles.panelRow, background: T.inputBg, borderColor: T.border, flexDirection: "column", alignItems: "flex-start" }}>
                  <span style={{ fontSize: 11.5, color: T.textStrong }}>{l.action} — {l.actor}</span>
                  {l.detail && <span style={{ fontSize: 11, color: T.textDim }}>{l.detail}</span>}
                  <span style={{ fontSize: 10, color: T.textDim }}>{new Date(l.ts).toLocaleString("tr-TR")}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {reportsPanelOpen && (
        <div style={styles.overlay} onClick={() => setReportsPanelOpen(false)}>
          <div style={{ ...styles.modal, background: T.panel, borderColor: T.border, maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ ...styles.modalHead, color: T.textStrong }}><span><Flag size={15} style={{ marginRight: 6, verticalAlign: -2 }} />Raporlar</span><X size={16} style={{ cursor: "pointer" }} onClick={() => setReportsPanelOpen(false)} /></div>
            <div style={styles.panelList}>
              {Object.keys(reports).length === 0 && <span style={styles.emptyNote}>Bekleyen rapor yok.</span>}
              {Object.entries(reports).map(([id, r]) => (
                <div key={id} style={{ ...styles.panelRow, background: T.inputBg, borderColor: T.border, flexDirection: "column", alignItems: "flex-start" }}>
                  <span style={{ fontSize: 11.5, color: T.textStrong }}>{r.msgAuthor}: "{r.msgText}"</span>
                  <span style={{ fontSize: 11, color: T.textDim }}>Bildiren: {r.reporterUsername} — {r.reason}</span>
                  <button style={{ ...styles.iconBtnSmall, marginTop: 4 }} onClick={() => remove(ref(db, `reports/${id}`))}>Kapat</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {panelOpen && activeScope && (
        <div style={styles.overlay} onClick={() => setPanelOpen(false)}>
          <div style={{ ...styles.modal, background: T.panel, borderColor: T.border, maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ ...styles.modalHead, color: T.textStrong }}><span><ShieldCheck size={15} style={{ marginRight: 6, verticalAlign: -2 }} />Yönetim paneli</span><X size={16} style={{ cursor: "pointer" }} onClick={() => setPanelOpen(false)} /></div>
            <div style={styles.panelSectionLabel}>Aktif kullanıcılar ({presenceList.length})</div>
            <div style={styles.panelList}>
              {presenceList.length === 0 && <span style={styles.emptyNote}>Kimse yok.</span>}
              {presenceList.map((p) => (
                <div key={p.unameLower} style={{ ...styles.panelRow, background: T.inputBg, borderColor: T.border }}>
                  <span style={styles.panelNick}>{p.username} {roles[p.unameLower] && <span style={styles.roleTag}>{roles[p.unameLower]}</span>}</span>
                  <div style={styles.panelActions}>
                    {activeScope.kind === "room" && (
                      <>
                        <button style={styles.iconBtnSmall} onClick={() => toggleMute(p.unameLower)}>{activeRoom?.muted?.[p.unameLower] ? "🔇" : "🔊"}</button>
                        <button style={styles.iconBtnSmall} onClick={() => banUserFromRoom(p.unameLower)}><Ban size={13} /></button>
                      </>
                    )}
                    {activeScope.kind === "server" && (isDeveloper || isServerOwner) && (
                      <button style={styles.iconBtnSmall} onClick={() => banUserFromServer(p.unameLower)}><Ban size={13} /></button>
                    )}
                    {isDeveloper && p.unameLower !== usernameLower && (
                      <button style={styles.iconBtnSmall} onClick={() => (roles[p.unameLower] ? revokeRole(p.unameLower) : promote(p.unameLower, "admin"))}><Crown size={13} /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {activeScope.kind === "room" && activeRoom?.banned && Object.keys(activeRoom.banned).length > 0 && (
              <>
                <div style={styles.panelSectionLabel}>Yasaklılar</div>
                <div style={styles.panelList}>
                  {Object.keys(activeRoom.banned).map((u) => (
                    <div key={u} style={{ ...styles.panelRow, background: T.inputBg, borderColor: T.border }}>
                      <span style={styles.panelNick}>{u}</span>
                      <button style={styles.iconBtnSmall} onClick={() => unbanUserFromRoom(u)}><UserX size={13} /></button>
                    </div>
                  ))}
                </div>
              </>
            )}
            {activeScope.kind === "room" && (isDeveloper || isRoomOwner) && <button style={styles.dangerBtn} onClick={deleteRoom}><Trash2 size={14} /> Odayı sil</button>}
          </div>
        </div>
      )}
    </div>
  );
}

const globalCss = `
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
  @keyframes fadein { from{opacity:0; transform:translateY(4px)} to{opacity:1; transform:translateY(0)} }
  * { box-sizing: border-box; }
  ::selection { background: #39FF8844; }
  input::placeholder, textarea::placeholder { color: #4b5560; }
`;

const darkPalette = { bg: "#0A0C10", panel: "#12161D", inputBg: "#0F1319", border: "#1B2028", text: "#C9D1D9", textStrong: "#E6EDF3", textDim: "#5c6572", headerBg: "#0A0C10CC", link: "#4FD1C5", mention: "#8fb4b0" };
const lightPalette = { bg: "#F4F6F8", panel: "#FFFFFF", inputBg: "#F0F2F5", border: "#D8DEE4", text: "#2A2F36", textStrong: "#12161D", textDim: "#6b7280", headerBg: "#FFFFFFCC", link: "#0E7C86", mention: "#1f6f5c" };

const styles = {
  app: { minHeight: "100vh", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", display: "flex", flexDirection: "column" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px", borderBottom: "1px solid", backdropFilter: "blur(6px)", zIndex: 10, flexWrap: "wrap", gap: 8 },
  brand: { display: "flex", alignItems: "center", gap: 8 },
  brandText: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontWeight: 700, letterSpacing: 2, fontSize: 14, color: "#39FF88" },
  headerRight: { display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" },
  nickBadge: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 },
  roleBadge: { display: "flex", alignItems: "center", gap: 4, fontSize: 11, padding: "5px 9px", borderRadius: 6, fontWeight: 600, background: "#39FF8822", color: "#39FF88" },
  reportBadge: { background: "#F27171", color: "#fff", fontSize: 9, borderRadius: 8, padding: "1px 5px", marginLeft: 3 },
  ghostBtn: { display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "1px solid", padding: "6px 10px", borderRadius: 7, fontSize: 12, cursor: "pointer" },
  body: { flex: 1, display: "flex", overflow: "hidden", height: "calc(100vh - 60px)" },
  sidebar: { width: 200, borderRight: "1px solid", padding: "16px 10px", display: "flex", flexDirection: "column", gap: 3, overflowY: "auto", flexShrink: 0 },
  sidebarSectionLabel: { fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.5, color: "#5c6572", fontWeight: 700, padding: "4px 8px 6px" },
  channelBtn: { display: "flex", alignItems: "center", gap: 8, background: "transparent", border: "none", padding: "7px 9px", borderRadius: 7, fontSize: 13.5, cursor: "pointer", textAlign: "left", width: "100%" },
  emptyNoteSmall: { fontSize: 11.5, color: "#4b5560", padding: "0 9px 4px" },
  newRoomBtn: { display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "1px dashed #39FF8855", color: "#39FF88", padding: "8px 9px", borderRadius: 7, fontSize: 12.5, cursor: "pointer", marginTop: 8 },
  mainArea: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 },
  landingHint: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, fontSize: 13.5 },
  roomHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px", borderBottom: "1px solid", flexWrap: "wrap", gap: 8 },
  roomHeaderLeft: { display: "flex", alignItems: "center", gap: 9 },
  roomTitle: { fontWeight: 700, fontSize: 14.5 },
  presenceCount: { display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#5c6572", marginLeft: 4 },
  iconBtn: { background: "transparent", border: "1px solid", padding: 7, borderRadius: 8, cursor: "pointer", display: "flex" },
  pinnedBar: { display: "flex", alignItems: "center", gap: 6, padding: "6px 18px", background: "#39FF8811", fontSize: 12, color: "#39FF88" },
  searchBar: { display: "flex", alignItems: "center", gap: 8, padding: "8px 18px", borderBottom: "1px solid" },
  searchInput: { flex: 1, background: "transparent", border: "none", fontSize: 13, outline: "none" },
  messages: { flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 },
  systemMsg: { textAlign: "center", fontSize: 11.5, color: "#5c6572", fontStyle: "italic", margin: "4px 0" },
  msgRow: { display: "flex", gap: 8 },
  msgBubble: { border: "1px solid", borderRadius: 10, padding: "8px 12px", maxWidth: "82%" },
  msgHead: { display: "flex", alignItems: "center", gap: 8, marginBottom: 3 },
  msgNick: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11.5, fontWeight: 700 },
  msgTime: { fontSize: 10.5 },
  msgIconBtn: { background: "transparent", border: "none", cursor: "pointer", display: "flex" },
  msgText: { fontSize: 14, lineHeight: 1.5, wordBreak: "break-word" },
  linkText: { textDecoration: "underline", cursor: "pointer" },
  sharedImage: { maxWidth: "100%", maxHeight: 220, borderRadius: 8, marginTop: 6, cursor: "pointer" },
  reactionRow: { display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" },
  reactionBtn: { background: "transparent", border: "1px solid", borderRadius: 12, padding: "2px 7px", fontSize: 11.5, cursor: "pointer" },
  typingRow: { fontSize: 11.5, color: "#5c6572", fontStyle: "italic", paddingLeft: 4 },
  emptyNote: { fontSize: 13, padding: "10px 0" },
  inputRow: { display: "flex", gap: 8, padding: "12px 18px", borderTop: "1px solid" },
  chatInput: { flex: 1, border: "1px solid", color: "#39FF88", padding: "12px 14px", borderRadius: 9, fontSize: 14, outline: "none" },
  sendBtn: { background: "#39FF88", border: "none", color: "#0A0C10", padding: "0 16px", borderRadius: 9, cursor: "pointer", display: "flex", alignItems: "center" },
  input: { border: "1px solid", padding: "11px 13px", borderRadius: 8, fontSize: 13.5, outline: "none", width: "100%" },
  overlay: { position: "fixed", inset: 0, background: "#000000AA", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 },
  modal: { border: "1px solid", borderRadius: 14, padding: 20, width: "100%", maxWidth: 380, display: "flex", flexDirection: "column", gap: 12, maxHeight: "85vh", overflowY: "auto" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: 700, fontSize: 14.5 },
  modalNote: { fontSize: 12, lineHeight: 1.5, margin: 0 },
  tabRow: { display: "flex", gap: 6 },
  tabBtn: { flex: 1, background: "transparent", border: "1px solid #1B2028", color: "#8b949e", padding: "8px", borderRadius: 7, fontSize: 12.5, cursor: "pointer" },
  tabBtnActive: { borderColor: "#39FF88", color: "#39FF88" },
  errorText: { color: "#F27171", fontSize: 12 },
  captchaRow: { display: "flex", alignItems: "center", gap: 8 },
  captchaInput: { width: 60, border: "1px solid", padding: "8px 10px", borderRadius: 8, fontSize: 13.5 },
  inviteBox: { display: "flex", alignItems: "center", gap: 8, border: "1px solid", borderRadius: 8, padding: "10px 12px" },
  inviteLink: { flex: 1, fontSize: 11.5, color: "#39FF88", wordBreak: "break-all", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
  panelSectionLabel: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "#5c6572", fontWeight: 700, marginTop: 6 },
  panelList: { display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" },
  panelRow: { display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid", padding: "7px 10px", borderRadius: 8 },
  panelNick: { fontSize: 12.5, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
  roleTag: { fontSize: 10, color: "#39FF88", marginLeft: 6 },
  panelActions: { display: "flex", gap: 4 },
  iconBtnSmall: { background: "transparent", border: "1px solid #1B2028", borderRadius: 6, padding: "4px 7px", cursor: "pointer", fontSize: 12, color: "#C9D1D9" },
  dangerBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "#2A1418", border: "1px solid #4A1F26", color: "#F27171", padding: "10px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, marginTop: 4 },
  dangerBtnSmall: { display: "flex", alignItems: "center", gap: 5, background: "#2A1418", border: "1px solid #4A1F26", color: "#F27171", padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 },
  toast: { position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", border: "1px solid", padding: "10px 18px", borderRadius: 9, fontSize: 13, zIndex: 200 },
  primaryBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "#39FF88", color: "#0A0C10", border: "none", padding: "11px 15px", borderRadius: 8, fontWeight: 700, fontSize: 13.5, cursor: "pointer" },
  authWrap: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20, gap: 18 },
  authBrand: { display: "flex", alignItems: "center", gap: 8, marginBottom: 4 },
  authCard: { border: "1px solid", borderRadius: 14, padding: 22, width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", gap: 11 },
  authTitle: { fontSize: 17, margin: "0 0 4px", fontWeight: 700 },
  authLinks: { display: "flex", flexDirection: "column", gap: 6, marginTop: 4 },
  authLink: { fontSize: 12, color: "#4FD1C5", cursor: "pointer", textAlign: "center" },
  authNote: { fontSize: 11.5, maxWidth: 340, textAlign: "center", lineHeight: 1.6 },
  avatarPickLabel: { fontSize: 11.5, color: "#7d8590", marginTop: 2 },
  colorRow: { display: "flex", gap: 8, flexWrap: "wrap" },
  colorSwatch: { width: 26, height: 26, borderRadius: 8, border: "none", cursor: "pointer" },
  shapeSwatch: { width: 30, height: 30, borderRadius: 8, background: "#0F1319", border: "1.5px solid", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
};
