import { useState, useEffect, useRef, useCallback } from "react";
import { db } from "./firebase";
import {
  ref,
  onValue,
  set,
  push,
  remove,
  update,
  get,
  serverTimestamp,
} from "firebase/database";
import { Radio, Lock, Unlock, Plus, Shield, Trash2, UserX, Crown, LogOut, Send, X, ShieldCheck, Users, Ban } from "lucide-react";

// ---------- helpers ----------
const simpleHash = (str) => {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return String(h);
};
const genId = () => (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const genNick = () => `Anon-${Math.floor(1000 + Math.random() * 9000)}`;

const MSG_TTL_MS = 10 * 60 * 1000;

export default function App() {
  const [session] = useState(() => ({ id: genId(), nick: genNick() }));
  const [view, setView] = useState("landing");
  const [rooms, setRooms] = useState({});
  const [roles, setRoles] = useState({});
  const [activeRoomId, setActiveRoomId] = useState(null);
  const [messages, setMessages] = useState({});
  const [presence, setPresence] = useState({});
  const [input, setInput] = useState("");
  const [devModalOpen, setDevModalOpen] = useState(false);
  const [devPasswordInput, setDevPasswordInput] = useState("");
  const [devError, setDevError] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomPassword, setNewRoomPassword] = useState("");
  const [newRoomPrivate, setNewRoomPrivate] = useState(false);
  const [joinModal, setJoinModal] = useState(null);
  const [joinPasswordInput, setJoinPasswordInput] = useState("");
  const [joinError, setJoinError] = useState("");
  const [toast, setToast] = useState("");
  const scrollRef = useRef(null);

  const activeRoom = activeRoomId ? rooms[activeRoomId] : null;
  const myRole = roles[session.id] || null;
  const isDeveloper = myRole === "developer";
  const isRoomStaff = isDeveloper || myRole === "admin" || myRole === "mod";

  const flashToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  // ---------- global listeners: rooms + roles ----------
  useEffect(() => {
    const unsubRooms = onValue(ref(db, "rooms"), (snap) => setRooms(snap.val() || {}));
    const unsubRoles = onValue(ref(db, "roles"), (snap) => setRoles(snap.val() || {}));
    return () => {
      unsubRooms();
      unsubRoles();
    };
  }, []);

  // ---------- room-scoped listeners: messages + presence ----------
  useEffect(() => {
    if (view !== "room" || !activeRoomId) return;

    const msgsRef = ref(db, `messages/${activeRoomId}`);
    const unsubMsgs = onValue(msgsRef, (snap) => {
      const val = snap.val() || {};
      setMessages(val);
    });

    const presRef = ref(db, `presence/${activeRoomId}/${session.id}`);
    set(presRef, { nick: session.nick, lastSeen: Date.now() });
    const hb = setInterval(() => set(presRef, { nick: session.nick, lastSeen: Date.now() }), 8000);

    const unsubPres = onValue(ref(db, `presence/${activeRoomId}`), (snap) => {
      const val = snap.val() || {};
      const now = Date.now();
      const alive = Object.fromEntries(Object.entries(val).filter(([, p]) => now - p.lastSeen < 20000));
      setPresence(alive);
    });

    // prune expired messages periodically
    const prune = setInterval(async () => {
      const snap = await get(msgsRef);
      const val = snap.val() || {};
      const now = Date.now();
      Object.entries(val).forEach(([id, m]) => {
        if (now - m.ts > MSG_TTL_MS) remove(ref(db, `messages/${activeRoomId}/${id}`));
      });
    }, 15000);

    return () => {
      unsubMsgs();
      unsubPres();
      clearInterval(hb);
      clearInterval(prune);
      remove(presRef);
    };
  }, [view, activeRoomId, session.id, session.nick]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // ---------- actions ----------
  const createRoom = async () => {
    const name = newRoomName.trim();
    if (!name) return;
    const id = genId();
    const room = {
      name,
      hasPassword: newRoomPrivate,
      passwordHash: newRoomPrivate ? simpleHash(newRoomPassword) : null,
      createdAt: Date.now(),
      creatorId: session.id,
      banned: {},
      muted: {},
    };
    await set(ref(db, `rooms/${id}`), room);
    setCreateModalOpen(false);
    setNewRoomName("");
    setNewRoomPassword("");
    setNewRoomPrivate(false);
    enterRoom(id, room);
  };

  const enterRoom = (id, room) => {
    if (room.banned && room.banned[session.id]) {
      flashToast("Bu odadan yasaklandınız.");
      return;
    }
    setActiveRoomId(id);
    setMessages({});
    setView("room");
  };

  const tryJoinPrivate = (id, room) => {
    setJoinModal({ id, room });
    setJoinPasswordInput("");
    setJoinError("");
  };

  const confirmJoinPrivate = () => {
    if (simpleHash(joinPasswordInput) !== joinModal.room.passwordHash) {
      setJoinError("Şifre yanlış.");
      return;
    }
    enterRoom(joinModal.id, joinModal.room);
    setJoinModal(null);
  };

  const leaveRoom = () => {
    setView("landing");
    setActiveRoomId(null);
    setPanelOpen(false);
    setMessages({});
    setPresence({});
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || !activeRoomId) return;
    if (activeRoom.muted && activeRoom.muted[session.id]) {
      flashToast("Bu odada susturuldunuz, mesaj gönderemezsiniz.");
      return;
    }
    const msgRef = push(ref(db, `messages/${activeRoomId}`));
    await set(msgRef, { sessionId: session.id, nick: session.nick, text, ts: Date.now() });
    setInput("");
  };

  const deleteMessage = (msgId) => remove(ref(db, `messages/${activeRoomId}/${msgId}`));

  const toggleMute = async (targetId) => {
    const isMuted = activeRoom.muted && activeRoom.muted[targetId];
    await set(ref(db, `rooms/${activeRoomId}/muted/${targetId}`), isMuted ? null : true);
  };

  const banUser = async (targetId) => {
    await set(ref(db, `rooms/${activeRoomId}/banned/${targetId}`), true);
    flashToast("Kullanıcı odadan yasaklandı.");
  };

  const unbanUser = (targetId) => set(ref(db, `rooms/${activeRoomId}/banned/${targetId}`), null);

  const promote = async (targetId, role) => {
    await set(ref(db, `roles/${targetId}`), role);
    flashToast(`Yetki güncellendi: ${role}`);
  };
  const revokeRole = (targetId) => remove(ref(db, `roles/${targetId}`));

  const deleteRoom = async () => {
    await remove(ref(db, `rooms/${activeRoomId}`));
    await remove(ref(db, `messages/${activeRoomId}`));
    await remove(ref(db, `presence/${activeRoomId}`));
    leaveRoom();
    flashToast("Oda silindi.");
  };

  const submitDevLogin = async () => {
    const snap = await get(ref(db, "developerPasswordHash"));
    const storedHash = snap.val();
    if (!storedHash) {
      await set(ref(db, "developerPasswordHash"), simpleHash(devPasswordInput));
      await promote(session.id, "developer");
      setDevModalOpen(false);
      setDevPasswordInput("");
      flashToast("Geliştirici şifresi belirlendi ve giriş yapıldı.");
      return;
    }
    if (simpleHash(devPasswordInput) === storedHash) {
      await promote(session.id, "developer");
      setDevModalOpen(false);
      setDevPasswordInput("");
      setDevError("");
    } else {
      setDevError("Şifre yanlış.");
    }
  };

  const roomList = Object.entries(rooms);
  const publicRooms = roomList.filter(([, r]) => !r.hasPassword);
  const messageList = Object.entries(messages)
    .map(([id, m]) => ({ id, ...m }))
    .filter((m) => Date.now() - m.ts < MSG_TTL_MS)
    .sort((a, b) => a.ts - b.ts);
  const presenceList = Object.entries(presence).map(([sessionId, p]) => ({ sessionId, ...p }));

  return (
    <div style={styles.app}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
        @keyframes fadein { from{opacity:0; transform:translateY(4px)} to{opacity:1; transform:translateY(0)} }
        * { box-sizing: border-box; }
        ::selection { background: #F2B70544; }
      `}</style>

      {toast && <div style={styles.toast}>{toast}</div>}

      <header style={styles.header}>
        <div style={styles.brand}>
          <Radio size={20} color="#F2B705" style={{ animation: "pulse 2s infinite" }} />
          <span style={styles.brandText}>SİNYAL</span>
        </div>
        <div style={styles.headerRight}>
          <span style={styles.nickBadge}>{session.nick}</span>
          {isDeveloper && (
            <span style={{ ...styles.roleBadge, background: "#F2B70522", color: "#F2B705" }}>
              <Crown size={12} /> geliştirici
            </span>
          )}
          {!isDeveloper && (
            <button style={styles.ghostBtn} onClick={() => setDevModalOpen(true)}>
              <Shield size={14} /> Yönetici girişi
            </button>
          )}
        </div>
      </header>

      {view === "landing" && (
        <main style={styles.landing}>
          <div style={styles.heroBlock}>
            <h1 style={styles.heroTitle}>kimsin, önemli değil.</h1>
            <p style={styles.heroSub}>
              İsim yok, hesap yok. Bir oda seç ya da şifreyle özel bir odaya katıl. Mesajlar 10 dakika sonra kendiliğinden kaybolur.
            </p>
          </div>

          <div style={styles.sectionRow}>
            <h2 style={styles.sectionTitle}>
              <Unlock size={16} /> Herkese açık odalar
            </h2>
            <button style={styles.primaryBtn} onClick={() => setCreateModalOpen(true)}>
              <Plus size={15} /> Yeni oda
            </button>
          </div>

          <div style={styles.roomGrid}>
            {publicRooms.length === 0 && <div style={styles.emptyNote}>Henüz açık oda yok. İlk odayı sen aç.</div>}
            {publicRooms.map(([id, r]) => (
              <button key={id} style={styles.roomCard} onClick={() => enterRoom(id, r)}>
                <div style={styles.roomCardTop}>
                  <span style={styles.roomDot} />
                  <span style={styles.roomName}>{r.name}</span>
                </div>
                <span style={styles.roomMeta}>katılmak için tıkla</span>
              </button>
            ))}
          </div>

          <div style={styles.sectionRow}>
            <h2 style={styles.sectionTitle}>
              <Lock size={16} /> Şifreli özel oda
            </h2>
          </div>
          <div style={styles.privateJoinRow}>
            <input style={styles.input} placeholder="Oda adı" id="priv-name-input" />
            <button
              style={styles.secondaryBtn}
              onClick={() => {
                const name = document.getElementById("priv-name-input").value.trim();
                const found = roomList.find(([, r]) => r.hasPassword && r.name.toLowerCase() === name.toLowerCase());
                if (!found) {
                  flashToast("Bu isimde şifreli oda bulunamadı.");
                  return;
                }
                tryJoinPrivate(found[0], found[1]);
              }}
            >
              Odayı bul
            </button>
          </div>
        </main>
      )}

      {view === "room" && activeRoom && (
        <main style={styles.roomView}>
          <div style={styles.roomHeader}>
            <div style={styles.roomHeaderLeft}>
              <button style={styles.iconBtn} onClick={leaveRoom}>
                <LogOut size={16} />
              </button>
              <span style={styles.roomDot} />
              <span style={styles.roomTitle}>{activeRoom.name}</span>
              {activeRoom.hasPassword && <Lock size={13} color="#7d8590" />}
              <span style={styles.presenceCount}>
                <Users size={13} /> {presenceList.length}
              </span>
            </div>
            {isRoomStaff && (
              <button style={styles.ghostBtn} onClick={() => setPanelOpen(true)}>
                <ShieldCheck size={14} /> Panel
              </button>
            )}
          </div>

          <div style={styles.messages} ref={scrollRef}>
            {messageList.length === 0 && <div style={styles.emptyNote}>Henüz mesaj yok. İlk mesajı sen yaz.</div>}
            {messageList.map((m) => {
              const age = (Date.now() - m.ts) / MSG_TTL_MS;
              const fading = age > 0.7;
              return (
                <div key={m.id} style={{ ...styles.msgRow, animation: "fadein .25s ease", opacity: fading ? 0.5 : 1 }}>
                  <div style={styles.msgBubble}>
                    <div style={styles.msgHead}>
                      <span style={{ ...styles.msgNick, color: m.sessionId === session.id ? "#F2B705" : "#8fb4b0" }}>{m.nick}</span>
                      <span style={styles.msgTime}>{new Date(m.ts).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span>
                      {isRoomStaff && (
                        <button style={styles.msgDelete} onClick={() => deleteMessage(m.id)} title="Mesajı sil">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                    <div style={styles.msgText}>{m.text}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={styles.inputRow}>
            <input
              style={styles.chatInput}
              placeholder="Mesaj yaz..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              maxLength={500}
            />
            <button style={styles.sendBtn} onClick={sendMessage}>
              <Send size={16} />
            </button>
          </div>
        </main>
      )}

      {createModalOpen && (
        <div style={styles.overlay} onClick={() => setCreateModalOpen(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHead}>
              <span>Yeni oda oluştur</span>
              <X size={16} style={{ cursor: "pointer" }} onClick={() => setCreateModalOpen(false)} />
            </div>
            <input style={styles.input} placeholder="Oda adı" value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} />
            <label style={styles.checkboxRow}>
              <input type="checkbox" checked={newRoomPrivate} onChange={(e) => setNewRoomPrivate(e.target.checked)} />
              Şifreli özel oda
            </label>
            {newRoomPrivate && (
              <input style={styles.input} placeholder="Oda şifresi" type="password" value={newRoomPassword} onChange={(e) => setNewRoomPassword(e.target.value)} />
            )}
            <button style={styles.primaryBtn} onClick={createRoom}>
              Oluştur ve katıl
            </button>
          </div>
        </div>
      )}

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

      {devModalOpen && (
        <div style={styles.overlay} onClick={() => setDevModalOpen(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHead}>
              <span>Yönetici / Geliştirici girişi</span>
              <X size={16} style={{ cursor: "pointer" }} onClick={() => setDevModalOpen(false)} />
            </div>
            <p style={styles.modalNote}>
              İlk kez giriş yapılıyorsa girdiğin şifre geliştirici şifresi olarak kaydedilir. Sonraki girişlerde aynı şifreyi kullan.
            </p>
            <input
              style={styles.input}
              placeholder="Geliştirici şifresi"
              type="password"
              value={devPasswordInput}
              onChange={(e) => setDevPasswordInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitDevLogin()}
              autoFocus
            />
            {devError && <span style={styles.errorText}>{devError}</span>}
            <button style={styles.primaryBtn} onClick={submitDevLogin}>
              Giriş yap
            </button>
          </div>
        </div>
      )}

      {panelOpen && activeRoom && (
        <div style={styles.overlay} onClick={() => setPanelOpen(false)}>
          <div style={{ ...styles.modal, maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHead}>
              <span>
                <ShieldCheck size={15} style={{ marginRight: 6, verticalAlign: -2 }} />
                Oda yönetim paneli
              </span>
              <X size={16} style={{ cursor: "pointer" }} onClick={() => setPanelOpen(false)} />
            </div>

            <div style={styles.panelSectionLabel}>Aktif kullanıcılar ({presenceList.length})</div>
            <div style={styles.panelList}>
              {presenceList.length === 0 && <span style={styles.emptyNote}>Kimse yok.</span>}
              {presenceList.map((p) => (
                <div key={p.sessionId} style={styles.panelRow}>
                  <span style={styles.panelNick}>
                    {p.nick} {roles[p.sessionId] && <span style={styles.roleTag}>{roles[p.sessionId]}</span>}
                  </span>
                  <div style={styles.panelActions}>
                    <button
                      style={styles.iconBtnSmall}
                      title={activeRoom.muted?.[p.sessionId] ? "Susturmayı kaldır" : "Sustur"}
                      onClick={() => toggleMute(p.sessionId)}
                    >
                      {activeRoom.muted?.[p.sessionId] ? "🔇" : "🔊"}
                    </button>
                    <button style={styles.iconBtnSmall} title="Odadan yasakla" onClick={() => banUser(p.sessionId)}>
                      <Ban size={13} />
                    </button>
                    {isDeveloper && p.sessionId !== session.id && (
                      <button
                        style={styles.iconBtnSmall}
                        title={roles[p.sessionId] ? "Yetkiyi al" : "Moderatör yap"}
                        onClick={() => (roles[p.sessionId] ? revokeRole(p.sessionId) : promote(p.sessionId, "admin"))}
                      >
                        <Crown size={13} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {activeRoom.banned && Object.keys(activeRoom.banned).length > 0 && (
              <>
                <div style={styles.panelSectionLabel}>Yasaklılar</div>
                <div style={styles.panelList}>
                  {Object.keys(activeRoom.banned).map((id) => (
                    <div key={id} style={styles.panelRow}>
                      <span style={styles.panelNick}>{id.slice(0, 8)}…</span>
                      <button style={styles.iconBtnSmall} onClick={() => unbanUser(id)}>
                        <UserX size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {(isDeveloper || activeRoom.creatorId === session.id) && (
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

const styles = {
  app: { minHeight: "100vh", background: "#0A0C10", color: "#C9D1D9", fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", display: "flex", flexDirection: "column" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: "1px solid #1B2028", position: "sticky", top: 0, background: "#0A0C10CC", backdropFilter: "blur(6px)", zIndex: 10 },
  brand: { display: "flex", alignItems: "center", gap: 8 },
  brandText: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontWeight: 700, letterSpacing: 3, fontSize: 14, color: "#E6EDF3" },
  headerRight: { display: "flex", alignItems: "center", gap: 10 },
  nickBadge: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, color: "#7d8590", background: "#14181F", padding: "5px 10px", borderRadius: 6, border: "1px solid #1B2028" },
  roleBadge: { display: "flex", alignItems: "center", gap: 4, fontSize: 11, padding: "5px 9px", borderRadius: 6, fontWeight: 600 },
  ghostBtn: { display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "1px solid #1B2028", color: "#C9D1D9", padding: "6px 12px", borderRadius: 7, fontSize: 12, cursor: "pointer" },
  landing: { maxWidth: 720, margin: "0 auto", padding: "48px 20px 80px", width: "100%" },
  heroBlock: { marginBottom: 44 },
  heroTitle: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 34, color: "#E6EDF3", margin: 0, letterSpacing: -0.5 },
  heroSub: { color: "#7d8590", fontSize: 14.5, marginTop: 10, lineHeight: 1.6, maxWidth: 480 },
  sectionRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 36, marginBottom: 14 },
  sectionTitle: { display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: "#7d8590", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, margin: 0 },
  primaryBtn: { display: "flex", alignItems: "center", gap: 6, background: "#F2B705", color: "#0A0C10", border: "none", padding: "9px 15px", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" },
  secondaryBtn: { background: "#14181F", color: "#E6EDF3", border: "1px solid #1B2028", padding: "10px 16px", borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600 },
  roomGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 },
  roomCard: { background: "#14181F", border: "1px solid #1B2028", borderRadius: 10, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6, cursor: "pointer", textAlign: "left", color: "#C9D1D9" },
  roomCardTop: { display: "flex", alignItems: "center", gap: 8 },
  roomDot: { width: 7, height: 7, borderRadius: "50%", background: "#3ECF8E", display: "inline-block", animation: "pulse 2s infinite" },
  roomName: { fontWeight: 600, fontSize: 14, color: "#E6EDF3" },
  roomMeta: { fontSize: 11.5, color: "#5c6572" },
  emptyNote: { color: "#5c6572", fontSize: 13, padding: "10px 0" },
  privateJoinRow: { display: "flex", gap: 8 },
  input: { flex: 1, background: "#0F1319", border: "1px solid #1B2028", color: "#E6EDF3", padding: "11px 13px", borderRadius: 8, fontSize: 13.5, outline: "none", width: "100%" },
  roomView: { flex: 1, display: "flex", flexDirection: "column", maxWidth: 720, margin: "0 auto", width: "100%", height: "calc(100vh - 60px)" },
  roomHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: "1px solid #1B2028" },
  roomHeaderLeft: { display: "flex", alignItems: "center", gap: 10 },
  roomTitle: { fontWeight: 700, fontSize: 14.5, color: "#E6EDF3" },
  presenceCount: { display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#5c6572", marginLeft: 6 },
  iconBtn: { background: "#14181F", border: "1px solid #1B2028", color: "#C9D1D9", padding: 8, borderRadius: 8, cursor: "pointer", display: "flex" },
  messages: { flex: 1, overflowY: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10 },
  msgRow: { display: "flex" },
  msgBubble: { background: "#14181F", border: "1px solid #1B2028", borderRadius: 10, padding: "9px 13px", maxWidth: "88%" },
  msgHead: { display: "flex", alignItems: "center", gap: 8, marginBottom: 3 },
  msgNick: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11.5, fontWeight: 700 },
  msgTime: { fontSize: 10.5, color: "#4b5560" },
  msgDelete: { marginLeft: "auto", background: "transparent", border: "none", color: "#5c6572", cursor: "pointer", display: "flex" },
  msgText: { fontSize: 14, lineHeight: 1.5, color: "#C9D1D9", wordBreak: "break-word" },
  inputRow: { display: "flex", gap: 8, padding: "14px 20px", borderTop: "1px solid #1B2028" },
  chatInput: { flex: 1, background: "#14181F", border: "1px solid #1B2028", color: "#E6EDF3", padding: "12px 14px", borderRadius: 9, fontSize: 14, outline: "none" },
  sendBtn: { background: "#F2B705", border: "none", color: "#0A0C10", padding: "0 16px", borderRadius: 9, cursor: "pointer", display: "flex", alignItems: "center" },
  overlay: { position: "fixed", inset: 0, background: "#000000AA", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 16 },
  modal: { background: "#12161D", border: "1px solid #1B2028", borderRadius: 14, padding: 20, width: "100%", maxWidth: 380, display: "flex", flexDirection: "column", gap: 12 },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: 700, color: "#E6EDF3", fontSize: 14.5 },
  modalNote: { fontSize: 12, color: "#5c6572", lineHeight: 1.5, margin: 0 },
  checkboxRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#C9D1D9" },
  errorText: { color: "#F27171", fontSize: 12 },
  panelSectionLabel: { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "#5c6572", fontWeight: 700, marginTop: 6 },
  panelList: { display: "flex", flexDirection: "column", gap: 6, maxHeight: 180, overflowY: "auto" },
  panelRow: { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#0F1319", border: "1px solid #1B2028", padding: "7px 10px", borderRadius: 8 },
  panelNick: { fontSize: 12.5, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
  roleTag: { fontSize: 10, color: "#F2B705", marginLeft: 6 },
  panelActions: { display: "flex", gap: 4 },
  iconBtnSmall: { background: "#14181F", border: "1px solid #1B2028", borderRadius: 6, padding: "4px 7px", cursor: "pointer", fontSize: 12, color: "#C9D1D9" },
  dangerBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "#2A1418", border: "1px solid #4A1F26", color: "#F27171", padding: "10px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, marginTop: 4 },
  toast: { position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "#14181F", border: "1px solid #F2B70555", color: "#E6EDF3", padding: "10px 18px", borderRadius: 9, fontSize: 13, zIndex: 200 },
};
