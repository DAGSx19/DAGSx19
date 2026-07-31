import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { db } from "./firebase";
import { ref, onValue, set, push, remove, get } from "firebase/database";
import {
  Radio,
  Lock,
  Plus,
  Shield,
  Trash2,
  UserX,
  Crown,
  LogOut,
  Send,
  X,
  ShieldCheck,
  Users,
  Ban,
  Hash,
  Circle,
  Square,
  Triangle,
  Hexagon,
  Star,
  Link2,
  Search,
  Copy,
  AlertTriangle,
} from "lucide-react";

// ---------- helpers ----------
const simpleHash = (str) => {
  let h1 = 0,
    h2 = 0;
  for (let i = 0; i < str.length; i++) {
    h1 = (Math.imul(31, h1) + str.charCodeAt(i)) | 0;
    h2 = (Math.imul(33, h2) + str.charCodeAt(i) * 7) | 0;
  }
  return `${h1}.${h2}.${str.length}`;
};
const genId = () => (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const genInviteCode = () => Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6);

const MSG_TTL_MS = 10 * 60 * 1000;
const RATE_LIMIT_COUNT = 5;
const RATE_LIMIT_WINDOW_MS = 10000;
const RATE_LIMIT_COOLDOWN_MS = 12000;
const TYPING_TIMEOUT_MS = 3000;

const AVATAR_COLORS = ["#39FF88", "#4FD1C5", "#F2B705", "#F27171", "#8B5CF6", "#38BDF8", "#FB923C"];
const AVATAR_SHAPES = [
  { key: "circle", Icon: Circle },
  { key: "square", Icon: Square },
  { key: "triangle", Icon: Triangle },
  { key: "hexagon", Icon: Hexagon },
  { key: "star", Icon: Star },
];

// Basit kelime filtresi — istersen bu listeye kendi kelimelerini ekleyebilirsin
const BAD_WORDS = ["aptal", "salak", "gerizekalı"];
const censorText = (text) => {
  let out = text;
  BAD_WORDS.forEach((w) => {
    const re = new RegExp(w, "gi");
    out = out.replace(re, "*".repeat(w.length));
  });
  return out;
};

const URL_REGEX = /(https?:\/\/[^\s]+)/g;

const SECURITY_QUESTIONS = [
  "En sevdiğin oyun hangisi?",
  "İlk evcil hayvanının adı neydi?",
  "En sevdiğin renk hangisi?",
  "Doğduğun şehir neresi?",
  "En sevdiğin yemek nedir?",
];

const CHANNELS = [
  { id: "genel-1", name: "genel-1" },
  { id: "genel-2", name: "genel-2" },
  { id: "genel-3", name: "genel-3" },
];

const checkPasswordStrength = (pw, strong) => {
  if (strong) {
    return pw.length >= 10 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw) && /[^A-Za-z0-9]/.test(pw);
  }
  return pw.length >= 6;
};

async function safeGet(path) {
  try {
    const snap = await get(ref(db, path));
    return snap.exists() ? snap.val() : null;
  } catch {
    return null;
  }
}

const AvatarBadge = ({ color, shape, size = 26 }) => {
  const found = AVATAR_SHAPES.find((s) => s.key === shape) || AVATAR_SHAPES[0];
  const Icon = found.Icon;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        background: `${color}22`,
        border: `1.5px solid ${color}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Icon size={size * 0.55} color={color} fill={color} />
    </div>
  );
};

export default function App() {
  const [session, setSession] = useState(null); // {username, avatarColor, avatarShape}
  const [authView, setAuthView] = useState("login"); // login | register | recover
  const [authForm, setAuthForm] = useState({ username: "", password: "", confirm: "", question: SECURITY_QUESTIONS[0], answer: "" });
  const [authError, setAuthError] = useState("");
  const [recoverStep, setRecoverStep] = useState(1);
  const [recoverAnswer, setRecoverAnswer] = useState("");
  const [recoverNewPw, setRecoverNewPw] = useState("");
  const [pickColor, setPickColor] = useState(AVATAR_COLORS[0]);
  const [pickShape, setPickShape] = useState("circle");

  const [view, setView] = useState("landing"); // landing | room
  const [activeChannelId, setActiveChannelId] = useState(null);
  const [rooms, setRooms] = useState({}); // private rooms user created/joined this session (by id)
  const [roles, setRoles] = useState({});
  const [messages, setMessages] = useState({});
  const [presence, setPresence] = useState({});
  const [input, setInput] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomPassword, setNewRoomPassword] = useState("");
  const [createdInvite, setCreatedInvite] = useState(null);
  const [joinModal, setJoinModal] = useState(null);
  const [joinPasswordInput, setJoinPasswordInput] = useState("");
  const [joinError, setJoinError] = useState("");
  const [toast, setToast] = useState("");
  const [pendingInviteRoom, setPendingInviteRoom] = useState(null);
  const [rateLimited, setRateLimited] = useState(false);
  const scrollRef = useRef(null);
  const msgTimestampsRef = useRef([]);
  const typingTimeoutRef = useRef(null);

  const activeIsChannel = activeChannelId && CHANNELS.some((c) => c.id === activeChannelId);
  const activeRoom = activeChannelId && !activeIsChannel ? rooms[activeChannelId] : null;
  const activeChannelMeta = activeIsChannel ? CHANNELS.find((c) => c.id === activeChannelId) : null;

  const usernameLower = session?.username?.toLowerCase();
  const myRole = usernameLower ? roles[usernameLower] : null;
  const isDeveloper = myRole === "developer";
  const isRoomStaff = isDeveloper || myRole === "admin" || myRole === "mod";

  const flashToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2600);
  };

  // ---------- restore session from localStorage ----------
  useEffect(() => {
    try {
      const raw = localStorage.getItem("dagsx19_session");
      if (raw) setSession(JSON.parse(raw));
    } catch {}
    // check for invite link ?room=xxxx
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get("room");
    if (roomParam) setPendingInviteRoom(roomParam);
  }, []);

  useEffect(() => {
    if (session) localStorage.setItem("dagsx19_session", JSON.stringify(session));
  }, [session]);

  // ---------- global roles listener ----------
  useEffect(() => {
    const unsub = onValue(ref(db, "roles"), (snap) => setRoles(snap.val() || {}));
    return () => unsub();
  }, []);

  // ---------- handle pending invite after login ----------
  useEffect(() => {
    if (!session || !pendingInviteRoom) return;
    (async () => {
      const room = await safeGet(`rooms/${pendingInviteRoom}`);
      if (!room) {
        flashToast("Bu davet linki geçersiz veya oda silinmiş.");
        setPendingInviteRoom(null);
        return;
      }
      setRooms((prev) => ({ ...prev, [pendingInviteRoom]: room }));
      tryJoinPrivate(pendingInviteRoom, room);
      setPendingInviteRoom(null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, pendingInviteRoom]);

  // ---------- channel/room scoped listeners ----------
  useEffect(() => {
    if (view !== "room" || !activeChannelId || !session) return;

    const msgsRef = ref(db, `messages/${activeChannelId}`);
    const unsubMsgs = onValue(msgsRef, (snap) => setMessages(snap.val() || {}));

    const presRef = ref(db, `presence/${activeChannelId}/${usernameLower}`);
    const setPresenceOnline = (typing = false) =>
      set(presRef, { username: session.username, avatarColor: session.avatarColor, avatarShape: session.avatarShape, lastSeen: Date.now(), typing });

    // detect first join for welcome system message
    get(presRef).then((snap) => {
      if (!snap.exists()) {
        const sysRef = push(ref(db, `messages/${activeChannelId}`));
        set(sysRef, { type: "system", text: `${session.username} katıldı`, ts: Date.now() });
      }
      setPresenceOnline(false);
    });

    const hb = setInterval(() => setPresenceOnline(false), 8000);

    const unsubPres = onValue(ref(db, `presence/${activeChannelId}`), (snap) => {
      const val = snap.val() || {};
      const now = Date.now();
      const alive = Object.fromEntries(Object.entries(val).filter(([, p]) => now - p.lastSeen < 20000));
      setPresence(alive);
    });

    const prune = setInterval(async () => {
      const snap = await get(msgsRef);
      const val = snap.val() || {};
      const now = Date.now();
      Object.entries(val).forEach(([id, m]) => {
        if (now - m.ts > MSG_TTL_MS) remove(ref(db, `messages/${activeChannelId}/${id}`));
      });
    }, 15000);

    return () => {
      unsubMsgs();
      unsubPres();
      clearInterval(hb);
      clearInterval(prune);
      remove(presRef);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, activeChannelId, session]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // ---------- auth actions ----------
  const submitRegister = async () => {
    setAuthError("");
    const uname = authForm.username.trim();
    const unameLower = uname.toLowerCase();
    if (!uname || uname.length < 3) return setAuthError("Kullanıcı adı en az 3 karakter olmalı.");
    if (!/^[a-zA-Z0-9_]+$/.test(uname)) return setAuthError("Kullanıcı adı sadece harf, rakam ve alt çizgi içerebilir.");
    if (authForm.password !== authForm.confirm) return setAuthError("Şifreler eşleşmiyor.");
    const isGhosty = unameLower === "ghosty";
    if (!checkPasswordStrength(authForm.password, isGhosty)) {
      return setAuthError(
        isGhosty
          ? "Ghosty hesabı için güçlü şifre gerekli: en az 10 karakter, büyük/küçük harf, rakam ve sembol içermeli."
          : "Şifre en az 6 karakter olmalı."
      );
    }
    if (!authForm.answer.trim()) return setAuthError("Güvenlik sorusu cevabı boş bırakılamaz.");

    const existing = await safeGet(`users/${unameLower}`);
    if (existing) return setAuthError("Bu kullanıcı adı zaten alınmış.");

    const userRecord = {
      username: uname,
      passwordHash: simpleHash(authForm.password),
      securityQuestion: authForm.question,
      securityAnswerHash: simpleHash(authForm.answer.trim().toLowerCase()),
      avatarColor: pickColor,
      avatarShape: pickShape,
      createdAt: Date.now(),
    };
    await set(ref(db, `users/${unameLower}`), userRecord);
    if (isGhosty) await set(ref(db, `roles/${unameLower}`), "developer");

    const sess = { username: uname, avatarColor: pickColor, avatarShape: pickShape };
    setSession(sess);
    flashToast(`Hoş geldin, ${uname}!`);
  };

  const submitLogin = async () => {
    setAuthError("");
    const uname = authForm.username.trim();
    const unameLower = uname.toLowerCase();
    if (!uname || !authForm.password) return setAuthError("Kullanıcı adı ve şifre gerekli.");
    const record = await safeGet(`users/${unameLower}`);
    if (!record || record.passwordHash !== simpleHash(authForm.password)) {
      return setAuthError("Kullanıcı adı veya şifre hatalı.");
    }
    const sess = { username: record.username, avatarColor: record.avatarColor, avatarShape: record.avatarShape };
    setSession(sess);
    flashToast(`Tekrar hoş geldin, ${record.username}!`);
  };

  const submitRecoverCheck = async () => {
    setAuthError("");
    const unameLower = authForm.username.trim().toLowerCase();
    const record = await safeGet(`users/${unameLower}`);
    if (!record) return setAuthError("Böyle bir kullanıcı bulunamadı.");
    if (simpleHash(recoverAnswer.trim().toLowerCase()) !== record.securityAnswerHash) {
      return setAuthError("Cevap yanlış.");
    }
    setRecoverStep(2);
  };

  const submitRecoverReset = async () => {
    setAuthError("");
    const unameLower = authForm.username.trim().toLowerCase();
    const isGhosty = unameLower === "ghosty";
    if (!checkPasswordStrength(recoverNewPw, isGhosty)) {
      return setAuthError(isGhosty ? "Ghosty için güçlü şifre gerekli." : "Şifre en az 6 karakter olmalı.");
    }
    await set(ref(db, `users/${unameLower}/passwordHash`), simpleHash(recoverNewPw));
    flashToast("Şifre sıfırlandı, şimdi giriş yapabilirsin.");
    setAuthView("login");
    setRecoverStep(1);
    setRecoverAnswer("");
    setRecoverNewPw("");
  };

  const logout = () => {
    setSession(null);
    localStorage.removeItem("dagsx19_session");
    setView("landing");
    setActiveChannelId(null);
  };

  // ---------- chat actions ----------
  const openChannel = (id) => {
    setActiveChannelId(id);
    setMessages({});
    setView("room");
    setPanelOpen(false);
    setSearchOpen(false);
    setSearchQuery("");
  };

  const createRoom = async () => {
    const name = newRoomName.trim();
    if (!name) return;
    if (!newRoomPassword) return flashToast("Özel oda için şifre gerekli.");
    const id = genInviteCode();
    const room = {
      name,
      passwordHash: simpleHash(newRoomPassword),
      createdAt: Date.now(),
      creatorUsername: session.username,
      banned: {},
      muted: {},
    };
    await set(ref(db, `rooms/${id}`), room);
    setRooms((prev) => ({ ...prev, [id]: room }));
    const link = `${window.location.origin}${window.location.pathname}?room=${id}`;
    setCreatedInvite({ id, link });
    setNewRoomName("");
    setNewRoomPassword("");
  };

  const finishCreateAndEnter = () => {
    if (!createdInvite) return;
    setCreateModalOpen(false);
    openChannel(createdInvite.id);
    setCreatedInvite(null);
  };

  const tryJoinPrivate = (id, room) => {
    if (room.banned && room.banned[usernameLower]) {
      flashToast("Bu odadan yasaklandınız.");
      return;
    }
    setJoinModal({ id, room });
    setJoinPasswordInput("");
    setJoinError("");
  };

  const confirmJoinPrivate = () => {
    if (simpleHash(joinPasswordInput) !== joinModal.room.passwordHash) {
      setJoinError("Şifre yanlış.");
      return;
    }
    setRooms((prev) => ({ ...prev, [joinModal.id]: joinModal.room }));
    openChannel(joinModal.id);
    setJoinModal(null);
  };

  const leaveRoom = () => {
    setView("landing");
    setActiveChannelId(null);
    setPanelOpen(false);
    setMessages({});
    setPresence({});
  };

  const handleTyping = (val) => {
    setInput(val);
    if (!session || !activeChannelId) return;
    const presRef = ref(db, `presence/${activeChannelId}/${usernameLower}`);
    set(presRef, { username: session.username, avatarColor: session.avatarColor, avatarShape: session.avatarShape, lastSeen: Date.now(), typing: true });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      set(presRef, { username: session.username, avatarColor: session.avatarColor, avatarShape: session.avatarShape, lastSeen: Date.now(), typing: false });
    }, TYPING_TIMEOUT_MS);
  };

  const sendMessage = async () => {
    const raw = input.trim();
    if (!raw || !activeChannelId) return;
    if (activeRoom?.muted && activeRoom.muted[usernameLower]) {
      flashToast("Bu odada susturuldunuz, mesaj gönderemezsiniz.");
      return;
    }
    const now = Date.now();
    msgTimestampsRef.current = msgTimestampsRef.current.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (msgTimestampsRef.current.length >= RATE_LIMIT_COUNT) {
      setRateLimited(true);
      flashToast("Çok hızlı mesaj gönderiyorsun, biraz yavaşla.");
      setTimeout(() => setRateLimited(false), RATE_LIMIT_COOLDOWN_MS);
      return;
    }
    msgTimestampsRef.current.push(now);

    const text = censorText(raw);
    const msgRef = push(ref(db, `messages/${activeChannelId}`));
    await set(msgRef, {
      type: "user",
      username: session.username,
      avatarColor: session.avatarColor,
      avatarShape: session.avatarShape,
      text,
      ts: now,
    });
    setInput("");
  };

  const deleteMessage = (msgId) => remove(ref(db, `messages/${activeChannelId}/${msgId}`));

  const toggleReaction = async (msgId, emoji) => {
    const path = `messages/${activeChannelId}/${msgId}/reactions/${emoji}/${usernameLower}`;
    const existing = await safeGet(path);
    await set(ref(db, path), existing ? null : true);
  };

  const updateActiveRoom = async (mutateFn) => {
    const current = await safeGet(`rooms/${activeChannelId}`);
    const updated = mutateFn(current || activeRoom);
    await set(ref(db, `rooms/${activeChannelId}`), updated);
    setRooms((prev) => ({ ...prev, [activeChannelId]: updated }));
  };

  const toggleMute = (targetUnameLower) =>
    updateActiveRoom((r) => ({
      ...r,
      muted: { ...(r.muted || {}), [targetUnameLower]: r.muted?.[targetUnameLower] ? null : true },
    }));

  const banUser = (targetUnameLower) => {
    updateActiveRoom((r) => ({ ...r, banned: { ...(r.banned || {}), [targetUnameLower]: true } }));
    flashToast("Kullanıcı odadan yasaklandı.");
  };
  const unbanUser = (targetUnameLower) => updateActiveRoom((r) => ({ ...r, banned: { ...(r.banned || {}), [targetUnameLower]: null } }));

  const promote = async (targetUnameLower, role) => {
    await set(ref(db, `roles/${targetUnameLower}`), role);
    flashToast(`Yetki güncellendi: ${role}`);
  };
  const revokeRole = (targetUnameLower) => remove(ref(db, `roles/${targetUnameLower}`));

  const deleteRoom = async () => {
    await remove(ref(db, `rooms/${activeChannelId}`));
    await remove(ref(db, `messages/${activeChannelId}`));
    await remove(ref(db, `presence/${activeChannelId}`));
    setRooms((prev) => {
      const cp = { ...prev };
      delete cp[activeChannelId];
      return cp;
    });
    leaveRoom();
    flashToast("Oda silindi.");
  };

  const copyInvite = (link) => {
    navigator.clipboard?.writeText(link);
    flashToast("Bağlantı kopyalandı.");
  };

  const messageList = useMemo(() => {
    let list = Object.entries(messages)
      .map(([id, m]) => ({ id, ...m }))
      .filter((m) => Date.now() - m.ts < MSG_TTL_MS)
      .sort((a, b) => a.ts - b.ts);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((m) => m.type === "system" || (m.text || "").toLowerCase().includes(q));
    }
    return list;
  }, [messages, searchQuery]);

  const presenceList = Object.entries(presence).map(([u, p]) => ({ unameLower: u, ...p }));
  const typingUsers = presenceList.filter((p) => p.typing && p.unameLower !== usernameLower);

  const renderMessageText = (text) => {
    const parts = text.split(URL_REGEX);
    return parts.map((part, i) =>
      URL_REGEX.test(part) ? (
        <span
          key={i}
          style={styles.linkText}
          onClick={() => {
            if (window.confirm("Bu bağlantı harici bir siteye gidiyor, güvenilir olmayabilir. Devam etmek istiyor musun?")) {
              window.open(part, "_blank", "noopener,noreferrer");
            }
          }}
        >
          {part}
        </span>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  };

  // ================= AUTH SCREENS =================
  if (!session) {
    return (
      <div style={styles.app}>
        <style>{globalCss}</style>
        <div style={styles.authWrap}>
          <div style={styles.authBrand}>
            <Radio size={22} color="#39FF88" style={{ animation: "pulse 2s infinite" }} />
            <span style={styles.brandText}>DAGSx19</span>
          </div>

          {authView === "login" && (
            <div style={styles.authCard}>
              <h2 style={styles.authTitle}>Giriş yap</h2>
              <input style={styles.input} placeholder="Kullanıcı adı" value={authForm.username} onChange={(e) => setAuthForm({ ...authForm, username: e.target.value })} />
              <input
                style={styles.input}
                placeholder="Şifre"
                type="password"
                value={authForm.password}
                onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && submitLogin()}
              />
              {authError && <span style={styles.errorText}>{authError}</span>}
              <button style={styles.primaryBtn} onClick={submitLogin}>
                Giriş yap
              </button>
              <div style={styles.authLinks}>
                <span style={styles.authLink} onClick={() => { setAuthView("register"); setAuthError(""); }}>
                  Hesabın yok mu? Kayıt ol
                </span>
                <span style={styles.authLink} onClick={() => { setAuthView("recover"); setAuthError(""); setRecoverStep(1); }}>
                  Şifremi unuttum
                </span>
              </div>
            </div>
          )}

          {authView === "register" && (
            <div style={styles.authCard}>
              <h2 style={styles.authTitle}>Kayıt ol</h2>
              <input style={styles.input} placeholder="Kullanıcı adı" value={authForm.username} onChange={(e) => setAuthForm({ ...authForm, username: e.target.value })} />
              <input style={styles.input} placeholder="Şifre" type="password" value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} />
              <input style={styles.input} placeholder="Şifre (tekrar)" type="password" value={authForm.confirm} onChange={(e) => setAuthForm({ ...authForm, confirm: e.target.value })} />
              <select style={styles.input} value={authForm.question} onChange={(e) => setAuthForm({ ...authForm, question: e.target.value })}>
                {SECURITY_QUESTIONS.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
              <input style={styles.input} placeholder="Güvenlik cevabın" value={authForm.answer} onChange={(e) => setAuthForm({ ...authForm, answer: e.target.value })} />

              <div style={styles.avatarPickLabel}>Avatar rengi</div>
              <div style={styles.colorRow}>
                {AVATAR_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setPickColor(c)}
                    style={{ ...styles.colorSwatch, background: c, outline: pickColor === c ? "2px solid #fff" : "none" }}
                  />
                ))}
              </div>
              <div style={styles.avatarPickLabel}>Avatar şekli</div>
              <div style={styles.colorRow}>
                {AVATAR_SHAPES.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setPickShape(s.key)}
                    style={{ ...styles.shapeSwatch, borderColor: pickShape === s.key ? pickColor : "#1B2028" }}
                  >
                    <s.Icon size={16} color={pickColor} fill={pickShape === s.key ? pickColor : "none"} />
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "center", margin: "6px 0" }}>
                <AvatarBadge color={pickColor} shape={pickShape} size={40} />
              </div>

              {authError && <span style={styles.errorText}>{authError}</span>}
              <button style={styles.primaryBtn} onClick={submitRegister}>
                Kayıt ol ve gir
              </button>
              <div style={styles.authLinks}>
                <span style={styles.authLink} onClick={() => { setAuthView("login"); setAuthError(""); }}>
                  Zaten hesabın var mı? Giriş yap
                </span>
              </div>
            </div>
          )}

          {authView === "recover" && (
            <div style={styles.authCard}>
              <h2 style={styles.authTitle}>Şifre kurtarma</h2>
              {recoverStep === 1 && (
                <>
                  <input style={styles.input} placeholder="Kullanıcı adı" value={authForm.username} onChange={(e) => setAuthForm({ ...authForm, username: e.target.value })} />
                  <input style={styles.input} placeholder="Güvenlik sorusu cevabın" value={recoverAnswer} onChange={(e) => setRecoverAnswer(e.target.value)} />
                  {authError && <span style={styles.errorText}>{authError}</span>}
                  <button style={styles.primaryBtn} onClick={submitRecoverCheck}>
                    Devam et
                  </button>
                </>
              )}
              {recoverStep === 2 && (
                <>
                  <input style={styles.input} placeholder="Yeni şifre" type="password" value={recoverNewPw} onChange={(e) => setRecoverNewPw(e.target.value)} />
                  {authError && <span style={styles.errorText}>{authError}</span>}
                  <button style={styles.primaryBtn} onClick={submitRecoverReset}>
                    Şifreyi sıfırla
                  </button>
                </>
              )}
              <div style={styles.authLinks}>
                <span style={styles.authLink} onClick={() => { setAuthView("login"); setAuthError(""); }}>
                  Girişe dön
                </span>
              </div>
            </div>
          )}

          <p style={styles.authNote}>
            <Shield size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
            Bu platform IP veya cihaz bilgisi toplamaz. Sadece kullanıcı adın görünür.
          </p>
        </div>
      </div>
    );
  }

  // ================= MAIN APP =================
  return (
    <div style={styles.app}>
      <style>{globalCss}</style>
      {toast && <div style={styles.toast}>{toast}</div>}

      <header style={styles.header}>
        <div style={styles.brand}>
          <Radio size={20} color="#39FF88" style={{ animation: "pulse 2s infinite" }} />
          <span style={styles.brandText}>DAGSx19</span>
        </div>
        <div style={styles.headerRight}>
          <AvatarBadge color={session.avatarColor} shape={session.avatarShape} size={24} />
          <span style={styles.nickBadge}>{session.username}</span>
          {isDeveloper && (
            <span style={{ ...styles.roleBadge, background: "#39FF8822", color: "#39FF88" }}>
              <Crown size={12} /> geliştirici
            </span>
          )}
          <button style={styles.ghostBtn} onClick={logout}>
            <LogOut size={14} />
          </button>
        </div>
      </header>

      <div style={styles.body}>
        <aside style={styles.sidebar}>
          <div style={styles.sidebarSectionLabel}>Kanallar</div>
          {CHANNELS.map((c) => (
            <button key={c.id} style={{ ...styles.channelBtn, ...(activeChannelId === c.id ? styles.channelBtnActive : {}) }} onClick={() => openChannel(c.id)}>
              <Hash size={15} />
              {c.name}
            </button>
          ))}

          <div style={{ ...styles.sidebarSectionLabel, marginTop: 18 }}>Özel Odalarım</div>
          {Object.entries(rooms).length === 0 && <div style={styles.emptyNoteSmall}>Henüz yok</div>}
          {Object.entries(rooms).map(([id, r]) => (
            <button key={id} style={{ ...styles.channelBtn, ...(activeChannelId === id ? styles.channelBtnActive : {}) }} onClick={() => openChannel(id)}>
              <Lock size={13} />
              {r.name}
            </button>
          ))}
          <button style={styles.newRoomBtn} onClick={() => setCreateModalOpen(true)}>
            <Plus size={14} /> Özel oda aç
          </button>
        </aside>

        <main style={styles.mainArea}>
          {view === "landing" && (
            <div style={styles.landingHint}>
              <Radio size={34} color="#1B2028" />
              <p>Soldan bir kanal seç ya da özel oda oluştur.</p>
            </div>
          )}

          {view === "room" && activeChannelId && (
            <>
              <div style={styles.roomHeader}>
                <div style={styles.roomHeaderLeft}>
                  {activeIsChannel ? <Hash size={16} color="#39FF88" /> : <Lock size={14} color="#7d8590" />}
                  <span style={styles.roomTitle}>{activeIsChannel ? activeChannelMeta.name : activeRoom?.name}</span>
                  <span style={styles.presenceCount}>
                    <Users size={13} /> {presenceList.length}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {!activeIsChannel && (
                    <button
                      style={styles.iconBtn}
                      title="Davet linkini kopyala"
                      onClick={() => copyInvite(`${window.location.origin}${window.location.pathname}?room=${activeChannelId}`)}
                    >
                      <Link2 size={15} />
                    </button>
                  )}
                  <button style={styles.iconBtn} onClick={() => setSearchOpen((s) => !s)}>
                    <Search size={15} />
                  </button>
                  {(isRoomStaff || (!activeIsChannel && activeRoom?.creatorUsername === session.username)) && (
                    <button style={styles.ghostBtn} onClick={() => setPanelOpen(true)}>
                      <ShieldCheck size={14} /> Panel
                    </button>
                  )}
                </div>
              </div>

              {searchOpen && (
                <div style={styles.searchBar}>
                  <Search size={14} color="#5c6572" />
                  <input style={styles.searchInput} placeholder="Mesajlarda ara..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} autoFocus />
                  <X size={14} style={{ cursor: "pointer" }} onClick={() => { setSearchOpen(false); setSearchQuery(""); }} />
                </div>
              )}

              <div style={styles.messages} ref={scrollRef}>
                {messageList.length === 0 && <div style={styles.emptyNote}>Henüz mesaj yok. İlk mesajı sen yaz.</div>}
                {messageList.map((m) => {
                  if (m.type === "system") {
                    return (
                      <div key={m.id} style={styles.systemMsg}>
                        {m.text}
                      </div>
                    );
                  }
                  const age = (Date.now() - m.ts) / MSG_TTL_MS;
                  const fading = age > 0.7;
                  const reactions = m.reactions || {};
                  return (
                    <div key={m.id} style={{ ...styles.msgRow, animation: "fadein .25s ease", opacity: fading ? 0.5 : 1 }}>
                      <AvatarBadge color={m.avatarColor || "#39FF88"} shape={m.avatarShape || "circle"} size={28} />
                      <div style={styles.msgBubble}>
                        <div style={styles.msgHead}>
                          <span style={{ ...styles.msgNick, color: m.username === session.username ? "#39FF88" : "#8fb4b0" }}>{m.username}</span>
                          <span style={styles.msgTime}>{new Date(m.ts).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span>
                          {isRoomStaff && (
                            <button style={styles.msgDelete} onClick={() => deleteMessage(m.id)} title="Mesajı sil">
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                        <div style={styles.msgText}>{renderMessageText(m.text)}</div>
                        <div style={styles.reactionRow}>
                          {["👍", "❤️", "😂", "🔥", "😢"].map((emoji) => {
                            const count = Object.keys(reactions[emoji] || {}).length;
                            const mine = reactions[emoji]?.[usernameLower];
                            return (
                              <button
                                key={emoji}
                                style={{ ...styles.reactionBtn, ...(mine ? styles.reactionBtnActive : {}) }}
                                onClick={() => toggleReaction(m.id, emoji)}
                              >
                                {emoji} {count > 0 && count}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {typingUsers.length > 0 && (
                  <div style={styles.typingRow}>{typingUsers.map((t) => t.username).join(", ")} yazıyor...</div>
                )}
              </div>

              <div style={styles.inputRow}>
                <input
                  style={styles.chatInput}
                  placeholder={rateLimited ? "Biraz bekle..." : "Mesaj yaz..."}
                  value={input}
                  onChange={(e) => handleTyping(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                  maxLength={500}
                  disabled={rateLimited}
                />
                <button style={styles.sendBtn} onClick={sendMessage} disabled={rateLimited}>
                  <Send size={16} />
                </button>
              </div>
            </>
          )}
        </main>
      </div>

      {/* create room modal */}
      {createModalOpen && (
        <div
          style={styles.overlay}
          onClick={() => {
            setCreateModalOpen(false);
            setCreatedInvite(null);
          }}
        >
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHead}>
              <span>Özel oda oluştur</span>
              <X
                size={16}
                style={{ cursor: "pointer" }}
                onClick={() => {
                  setCreateModalOpen(false);
                  setCreatedInvite(null);
                }}
              />
            </div>

            {!createdInvite ? (
              <>
                <input style={styles.input} placeholder="Oda adı" value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} />
                <input style={styles.input} placeholder="Oda şifresi" type="password" value={newRoomPassword} onChange={(e) => setNewRoomPassword(e.target.value)} />
                <p style={styles.modalNote}>
                  <AlertTriangle size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
                  Bu oda herkese açık listede görünmez, sadece davet linkini bilenler girebilir.
                </p>
                <button style={styles.primaryBtn} onClick={createRoom}>
                  Oluştur
                </button>
              </>
            ) : (
              <>
                <p style={styles.modalNote}>Oda oluşturuldu! Bu linki paylaşarak davet edebilirsin:</p>
                <div style={styles.inviteBox}>
                  <span style={styles.inviteLink}>{createdInvite.link}</span>
                  <button style={styles.iconBtnSmall} onClick={() => copyInvite(createdInvite.link)}>
                    <Copy size={13} />
                  </button>
                </div>
                <button style={styles.primaryBtn} onClick={finishCreateAndEnter}>
                  Odaya gir
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* join private room modal (from invite link) */}
      {joinModal && (
        <div style={styles.overlay} onClick={() => setJoinModal(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHead}>
              <span>"{joinModal.room.name}" için şifre</span>
              <X size={16} style={{ cursor: "pointer" }} onClick={() => setJoinModal(null)} />
            </div>
            <input
              style={styles.input}
              placeholder="Şifre"
              type="password"
              value={joinPasswordInput}
              onChange={(e) => setJoinPasswordInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmJoinPrivate()}
              autoFocus
            />
            {joinError && <span style={styles.errorText}>{joinError}</span>}
            <button style={styles.primaryBtn} onClick={confirmJoinPrivate}>
              Katıl
            </button>
          </div>
        </div>
      )}

      {/* staff panel */}
      {panelOpen && activeChannelId && (
        <div style={styles.overlay} onClick={() => setPanelOpen(false)}>
          <div style={{ ...styles.modal, maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHead}>
              <span>
                <ShieldCheck size={15} style={{ marginRight: 6, verticalAlign: -2 }} />
                Yönetim paneli
              </span>
              <X size={16} style={{ cursor: "pointer" }} onClick={() => setPanelOpen(false)} />
            </div>

            <div style={styles.panelSectionLabel}>Aktif kullanıcılar ({presenceList.length})</div>
            <div style={styles.panelList}>
              {presenceList.length === 0 && <span style={styles.emptyNote}>Kimse yok.</span>}
              {presenceList.map((p) => (
                <div key={p.unameLower} style={styles.panelRow}>
                  <span style={styles.panelNick}>
                    {p.username} {roles[p.unameLower] && <span style={styles.roleTag}>{roles[p.unameLower]}</span>}
                  </span>
                  <div style={styles.panelActions}>
                    {!activeIsChannel && (
                      <>
                        <button style={styles.iconBtnSmall} title="Sustur" onClick={() => toggleMute(p.unameLower)}>
                          {activeRoom?.muted?.[p.unameLower] ? "🔇" : "🔊"}
                        </button>
                        <button style={styles.iconBtnSmall} title="Yasakla" onClick={() => banUser(p.unameLower)}>
                          <Ban size={13} />
                        </button>
                      </>
                    )}
                    {isDeveloper && p.unameLower !== usernameLower && (
                      <button
                        style={styles.iconBtnSmall}
                        title={roles[p.unameLower] ? "Yetkiyi al" : "Moderatör yap"}
                        onClick={() => (roles[p.unameLower] ? revokeRole(p.unameLower) : promote(p.unameLower, "admin"))}
                      >
                        <Crown size={13} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {!activeIsChannel && activeRoom?.banned && Object.keys(activeRoom.banned).length > 0 && (
              <>
                <div style={styles.panelSectionLabel}>Yasaklılar</div>
                <div style={styles.panelList}>
                  {Object.keys(activeRoom.banned).map((u) => (
                    <div key={u} style={styles.panelRow}>
                      <span style={styles.panelNick}>{u}</span>
                      <button style={styles.iconBtnSmall} onClick={() => unbanUser(u)}>
                        <UserX size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {!activeIsChannel && (isDeveloper || activeRoom?.creatorUsername === session.username) && (
              <button style={styles.dangerBtn} onClick={deleteRoom}>
                <Trash2 size={14} /> Odayı sil
              </button>
            )}
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
  input::placeholder { color: #4b5560; }
`;

const styles = {
  app: { minHeight: "100vh", background: "#0A0C10", color: "#C9D1D9", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", display: "flex", flexDirection: "column" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px", borderBottom: "1px solid #1B2028", background: "#0A0C10CC", backdropFilter: "blur(6px)", zIndex: 10 },
  brand: { display: "flex", alignItems: "center", gap: 8 },
  brandText: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontWeight: 700, letterSpacing: 2, fontSize: 14, color: "#39FF88" },
  headerRight: { display: "flex", alignItems: "center", gap: 8 },
  nickBadge: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, color: "#C9D1D9" },
  roleBadge: { display: "flex", alignItems: "center", gap: 4, fontSize: 11, padding: "5px 9px", borderRadius: 6, fontWeight: 600 },
  ghostBtn: { display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "1px solid #1B2028", color: "#C9D1D9", padding: "6px 12px", borderRadius: 7, fontSize: 12, cursor: "pointer" },
  body: { flex: 1, display: "flex", overflow: "hidden", height: "calc(100vh - 55px)" },
  sidebar: { width: 190, borderRight: "1px solid #1B2028", padding: "16px 10px", display: "flex", flexDirection: "column", gap: 4, overflowY: "auto", flexShrink: 0 },
  sidebarSectionLabel: { fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.5, color: "#5c6572", fontWeight: 700, padding: "4px 8px 6px" },
  channelBtn: { display: "flex", alignItems: "center", gap: 8, background: "transparent", border: "none", color: "#8b949e", padding: "8px 9px", borderRadius: 7, fontSize: 13.5, cursor: "pointer", textAlign: "left" },
  channelBtnActive: { background: "#39FF8815", color: "#39FF88" },
  emptyNoteSmall: { fontSize: 11.5, color: "#4b5560", padding: "0 9px 4px" },
  newRoomBtn: { display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "1px dashed #1B2028", color: "#7d8590", padding: "8px 9px", borderRadius: 7, fontSize: 12.5, cursor: "pointer", marginTop: 10 },
  mainArea: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 },
  landingHint: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: "#4b5560", fontSize: 13.5 },
  roomHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px", borderBottom: "1px solid #1B2028" },
  roomHeaderLeft: { display: "flex", alignItems: "center", gap: 9 },
  roomTitle: { fontWeight: 700, fontSize: 14.5, color: "#E6EDF3" },
  presenceCount: { display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#5c6572", marginLeft: 4 },
  iconBtn: { background: "#14181F", border: "1px solid #1B2028", color: "#C9D1D9", padding: 7, borderRadius: 8, cursor: "pointer", display: "flex" },
  searchBar: { display: "flex", alignItems: "center", gap: 8, padding: "8px 18px", borderBottom: "1px solid #1B2028", background: "#0F1319" },
  searchInput: { flex: 1, background: "transparent", border: "none", color: "#E6EDF3", fontSize: 13, outline: "none" },
  messages: { flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 },
  systemMsg: { textAlign: "center", fontSize: 11.5, color: "#4b5560", fontStyle: "italic", margin: "4px 0" },
  msgRow: { display: "flex", gap: 8 },
  msgBubble: { background: "#14181F", border: "1px solid #1B2028", borderRadius: 10, padding: "8px 12px", maxWidth: "82%" },
  msgHead: { display: "flex", alignItems: "center", gap: 8, marginBottom: 3 },
  msgNick: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11.5, fontWeight: 700 },
  msgTime: { fontSize: 10.5, color: "#4b5560" },
  msgDelete: { marginLeft: "auto", background: "transparent", border: "none", color: "#5c6572", cursor: "pointer", display: "flex" },
  msgText: { fontSize: 14, lineHeight: 1.5, color: "#39FF88", wordBreak: "break-word" },
  linkText: { color: "#4FD1C5", textDecoration: "underline", cursor: "pointer" },
  reactionRow: { display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" },
  reactionBtn: { background: "#0F1319", border: "1px solid #1B2028", borderRadius: 12, padding: "2px 7px", fontSize: 11.5, cursor: "pointer", color: "#8b949e" },
  reactionBtnActive: { borderColor: "#39FF88", color: "#39FF88" },
  typingRow: { fontSize: 11.5, color: "#4b5560", fontStyle: "italic", paddingLeft: 4 },
  emptyNote: { color: "#5c6572", fontSize: 13, padding: "10px 0" },
  inputRow: { display: "flex", gap: 8, padding: "12px 18px", borderTop: "1px solid #1B2028" },
  chatInput: { flex: 1, background: "#14181F", border: "1px solid #1B2028", color: "#39FF88", padding: "12px 14px", borderRadius: 9, fontSize: 14, outline: "none" },
  sendBtn: { background: "#39FF88", border: "none", color: "#0A0C10", padding: "0 16px", borderRadius: 9, cursor: "pointer", display: "flex", alignItems: "center" },
  input: { background: "#0F1319", border: "1px solid #1B2028", color: "#E6EDF3", padding: "11px 13px", borderRadius: 8, fontSize: 13.5, outline: "none", width: "100%" },
  overlay: { position: "fixed", inset: 0, background: "#000000AA", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 },
  modal: { background: "#12161D", border: "1px solid #1B2028", borderRadius: 14, padding: 20, width: "100%", maxWidth: 380, display: "flex", flexDirection: "column", gap: 12, maxHeight: "85vh", overflowY: "auto" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: 700, color: "#E6EDF3", fontSize: 14.5 },
  modalNote: { fontSize: 12, color: "#5c6572", lineHeight: 1.5, margin: 0 },
  errorText: { color: "#F27171", fontSize: 12 },
  inviteBox: { display: "flex", alignItems: "center", gap: 8, background: "#0F1319", border: "1px solid #1B2028", borderRadius: 8, padding: "10px 12px" },
  inviteLink: { flex: 1, fontSize: 11.5, color: "#39FF88", wordBreak: "break-all", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
  panelSectionLabel: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "#5c6572", fontWeight: 700, marginTop: 6 },
  panelList: { display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflowY: "auto" },
  panelRow: { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0F1319", border: "1px solid #1B2028", padding: "7px 10px", borderRadius: 8 },
  panelNick: { fontSize: 12.5, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
  roleTag: { fontSize: 10, color: "#39FF88", marginLeft: 6 },
  panelActions: { display: "flex", gap: 4 },
  iconBtnSmall: { background: "#14181F", border: "1px solid #1B2028", borderRadius: 6, padding: "4px 7px", cursor: "pointer", fontSize: 12, color: "#C9D1D9" },
  dangerBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "#2A1418", border: "1px solid #4A1F26", color: "#F27171", padding: "10px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, marginTop: 4 },
  toast: { position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "#14181F", border: "1px solid #39FF8855", color: "#E6EDF3", padding: "10px 18px", borderRadius: 9, fontSize: 13, zIndex: 200 },
  primaryBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "#39FF88", color: "#0A0C10", border: "none", padding: "11px 15px", borderRadius: 8, fontWeight: 700, fontSize: 13.5, cursor: "pointer" },
  authWrap: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20, gap: 18 },
  authBrand: { display: "flex", alignItems: "center", gap: 8, marginBottom: 4 },
  authCard: { background: "#12161D", border: "1px solid #1B2028", borderRadius: 14, padding: 22, width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", gap: 11 },
  authTitle: { fontSize: 17, color: "#E6EDF3", margin: "0 0 4px", fontWeight: 700 },
  authLinks: { display: "flex", flexDirection: "column", gap: 6, marginTop: 4 },
  authLink: { fontSize: 12, color: "#4FD1C5", cursor: "pointer", textAlign: "center" },
  authNote: { fontSize: 11.5, color: "#4b5560", maxWidth: 340, textAlign: "center", lineHeight: 1.6 },
  avatarPickLabel: { fontSize: 11.5, color: "#7d8590", marginTop: 2 },
  colorRow: { display: "flex", gap: 8, flexWrap: "wrap" },
  colorSwatch: { width: 26, height: 26, borderRadius: 8, border: "none", cursor: "pointer" },
  shapeSwatch: { width: 30, height: 30, borderRadius: 8, background: "#0F1319", border: "1.5px solid #1B2028", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
};
