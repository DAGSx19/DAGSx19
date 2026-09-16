import { useState, useEffect, useRef, useMemo, useCallback, memo, Component } from "react";
import { db } from "./firebase";
import { ref, onValue, set, push, remove, get, query, orderByChild, limitToLast } from "firebase/database";
import {
  Radio, Lock, Plus, Shield, Trash2, UserX, Crown, LogOut, Send, X, ShieldCheck, Users, Ban,
  Hash, Circle, Square, Triangle, Hexagon, Star, Link2, Search, Copy, AlertTriangle, Pin,
  Flag, Sun, Moon, MessageSquare, ChevronDown, ChevronRight, ScrollText, Megaphone, Server,
  Bell, UserPlus, Settings, Check, Globe, ArrowLeft, Image as ImageIcon, CornerUpLeft, ArrowDown, Palette, ArrowRight, QrCode, Pencil, Volume2, VolumeX, UserMinus,
} from "lucide-react";

// ---------- DAGSx19 logo (inline SVG, no Tailwind needed) ----------
const DagsLogo = ({ size = 32 }) => (
  <svg viewBox="0 0 100 100" fill="none" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
    <path d="M20 20H55C71.5685 20 85 33.4315 85 50C85 66.5685 71.5685 80 55 80H20V20Z" stroke="#39FF88" strokeWidth="15" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M20 50H50L35 35" stroke="#39FF88" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// ---------- helpers ----------
const simpleHash = (str) => {
  let h1 = 0, h2 = 0;
  for (let i = 0; i < str.length; i++) {
    h1 = (Math.imul(31, h1) + str.charCodeAt(i)) | 0;
    h2 = (Math.imul(33, h2) + str.charCodeAt(i) * 7) | 0;
  }
  return `${h1}.${h2}.${str.length}`;
};

// ---------- secure password hashing (PBKDF2-SHA256 via WebCrypto) ----------
const bufToHex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
const randomSaltHex = () => bufToHex(crypto.getRandomValues(new Uint8Array(16)));
async function hashSecret(secret, saltHex) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(saltHex), iterations: 150000, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return bufToHex(bits);
}
const genCode = () => Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 6);

const MSG_TTL_MS = 10 * 60 * 1000;
const RATE_LIMIT_COUNT = 5;
const RATE_LIMIT_WINDOW_MS = 10000;
const RATE_LIMIT_COOLDOWN_MS = 12000;
const TYPING_TIMEOUT_MS = 3000;

const AVATAR_COLORS = ["#39FF88", "#4FD1C5", "#F2B705", "#F27171", "#8B5CF6", "#38BDF8", "#FB923C"];
const CHAT_BG_PRESETS = [
  { label: "Varsayılan", type: "none", value: null },
  { label: "Koyu Yeşil", type: "color", value: "#0A140F" },
  { label: "Lacivert", type: "color", value: "#0A1020" },
  { label: "Mor", type: "color", value: "#160B22" },
  { label: "Kahve", type: "color", value: "#1A130B" },
  { label: "Açık Gri", type: "color", value: "#EDEFF2" },
  { label: "Krem", type: "color", value: "#F6F1E7" },
];
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

const CHANNELS = [{ id: "genel-1", name: "genel-1" }, { id: "genel-2", name: "genel-2" }, { id: "genel-3", name: "genel-3" }];
const DEFAULT_SERVER_CHANNELS = ["genel", "duyuru", "sohbet"];
const CHANNEL_PERMISSIONS = {
  "genel-1": {
    view: ["everyone"],
    send: ["everyone"],
    attach: ["everyone"],
    react: ["everyone"],
    pin: ["mod", "admin", "developer"],
    deleteOwn: ["everyone"],
    deleteAny: ["mod", "admin", "developer"],
    manage: ["admin", "developer"],
  },

  "genel-2": {
    view: ["everyone"],
    send: ["everyone"],
    attach: ["everyone"],
    react: ["everyone"],
    pin: ["mod", "admin", "developer"],
    deleteOwn: ["everyone"],
    deleteAny: ["mod", "admin", "developer"],
    manage: ["admin", "developer"],
  },

  "genel-3": {
    view: ["everyone"],
    send: ["everyone"],
    attach: ["everyone"],
    react: ["everyone"],
    pin: ["mod", "admin", "developer"],
    deleteOwn: ["everyone"],
    deleteAny: ["mod", "admin", "developer"],
    manage: ["admin", "developer"],
  },
};
const getChannelPermissions = (channelId) =>
  CHANNEL_PERMISSIONS[channelId] || {
    view: ["everyone"],
    send: ["everyone"],
    attach: ["everyone"],
    react: ["everyone"],
    pin: ["mod", "admin", "developer"],
    deleteOwn: ["everyone"],
    deleteAny: ["mod", "admin", "developer"],
    manage: ["admin", "developer"],
  };

const hasChannelPermission = (
  permission,
  channelId,
  role,
  isDeveloper
) => {
  const allowed = getChannelPermissions(channelId)[permission] || [];

  if (allowed.includes("everyone")) return true;

  if (isDeveloper && allowed.includes("developer")) {
    return true;
  }

  return !!role && allowed.includes(role);
};
const REACTION_EMOJIS = ["👍", "❤️", "😂", "🔥", "😢"];
const EXTRA_EMOJIS = ["👍", "❤️", "😂", "🔥", "😢", "😮", "😡", "🎉", "👏", "🙏", "💀", "😍", "🤔", "😴", "👀", "✅", "❌", "💯", "🥳", "😎", "🤡", "🙄", "😭", "🚀"];

const checkPasswordStrength = (pw, strong) =>
  strong ? pw.length >= 10 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw) && /[^A-Za-z0-9]/.test(pw) : pw.length >= 6;

async function safeGet(path) {
  try {
    const snap = await get(ref(db, path));
    return snap.exists() ? snap.val() : null;
  } catch { return null; }
}
const logActivity = (action, actor, detail = "") => push(ref(db, "activityLog"), { ts: Date.now(), action, actor, detail });

const scopeKey = (s) => {
  if (s.kind === "global") return `global:${s.channelId}`;
  if (s.kind === "room") return `room:${s.roomId}`;
  if (s.kind === "server") return `server:${s.serverId}:${s.channelId}`;
  if (s.kind === "dm") return `dm:${s.dmId}`;
  return "unknown";
};
const dmIdFor = (a, b) => [a, b].sort().join("__");

const formatLastSeen = (ts) => {
  if (!ts) return null;
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "az önce";
  if (min < 60) return `${min} dakika önce`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} saat önce`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "dün";
  if (day < 7) return `${day} gün önce`;
  return new Date(ts).toLocaleDateString("tr-TR");
};

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

// ---------- i18n ----------
const LANGS = [{ code: "tr", label: "TR" }, { code: "en", label: "EN" }, { code: "de", label: "DE" }, { code: "ru", label: "RU" }];

const SECURITY_QUESTIONS_BY_LANG = {
  tr: ["En sevdiğin oyun hangisi?", "İlk evcil hayvanının adı neydi?", "En sevdiğin renk hangisi?", "Doğduğun şehir neresi?", "En sevdiğin yemek nedir?"],
  en: ["What is your favorite game?", "What was your first pet's name?", "What is your favorite color?", "What city were you born in?", "What is your favorite food?"],
  de: ["Was ist dein Lieblingsspiel?", "Wie hieß dein erstes Haustier?", "Was ist deine Lieblingsfarbe?", "In welcher Stadt wurdest du geboren?", "Was ist dein Lieblingsessen?"],
  ru: ["Какая твоя любимая игра?", "Как звали твоего первого питомца?", "Какой твой любимый цвет?", "В каком городе ты родился?", "Какая твоя любимая еда?"],
};

const TR = {
  login: "Giriş yap", register: "Kayıt ol", forgotPw: "Şifremi unuttum", noAccount: "Hesabın yok mu? Kayıt ol",
  haveAccount: "Zaten hesabın var mı? Giriş yap", backToLogin: "Girişe dön", username: "Kullanıcı adı", password: "Şifre",
  passwordAgain: "Şifre (tekrar)", securityAnswer: "Güvenlik cevabın", avatarColor: "Avatar rengi", avatarShape: "Avatar şekli",
  registerAndEnter: "Kayıt ol ve gir", recoverTitle: "Şifre kurtarma", newPassword: "Yeni şifre", resetPassword: "Şifreyi sıfırla",
  continueBtn: "Devam et", privacyNote: "Bu platform IP veya cihaz bilgisi toplamaz. Sadece kullanıcı adın görünür.",
  verification: "Doğrulama", channels: "Kanallar", myServers: "Sunucularım", myRooms: "Özel Odalarım", messages: "Mesajlar",
  friends: "Arkadaşlar", none: "Henüz yok", addChannel: "Kanal ekle", newMessage: "Yeni mesaj", createRoomOrServer: "Oda / Sunucu oluştur",
  pickChannelHint: "Soldan bir kanal seç ya da yeni bir şey oluştur.", searchPlaceholder: "Mesajlarda ara...",
  noMessages: "Henüz mesaj yok. İlk mesajı sen yaz.", typing: "yazıyor...", messagePlaceholder: "Mesaj yaz...", wait: "Biraz bekle...",
  createRoom: "Özel oda", createServer: "Sunucu", roomName: "Oda adı", roomPassword: "Oda şifresi",
  roomHint: "Bu oda listelenmez, sadece davet linkini bilenler girebilir.", create: "Oluştur",
  serverName: "Sunucu adı", serverHint: "Discord gibi kendi kanalları olan bir sunucu oluşturulur. Katılım sadece davet linkiyle olur.",
  createServerBtn: "Sunucu oluştur", createdInviteRoom: "Oda oluşturuldu! Bu linki paylaşarak davet edebilirsin:",
  createdInviteServer: "Sunucu oluşturuldu! Bu linki paylaşarak davet edebilirsin:", enter: "Gir", join: "Katıl",
  sendMessageBtn: "Mesaj gönder", profileSettings: "Profil ayarları", note: "Not", saveBtn: "Kaydet", deleteAccountBtn: "Hesabı sil",
  currentPassword: "Mevcut şifre", changePassword: "Şifreyi değiştir", close: "Kapat", addFriend: "Arkadaş ekle",
  requestSent: "İstek gönderildi", alreadyFriends: "Arkadaşsın", friendRequests: "Arkadaşlık istekleri", accept: "Kabul et",
  decline: "Reddet", noRequests: "Bekleyen istek yok", joinDate: "Katılma", globalBanBtn: "Siteden yasakla",
  activePanel: "Aktif kullanıcılar", banned: "Yasaklılar", deleteRoomBtn: "Odayı sil", managementPanel: "Yönetim paneli",
  broadcastTitle: "Duyuru gönder", broadcastHint: "3 sabit kanala aynı anda gönderilir.", send: "Gönder",
  activityLogTitle: "Aktivite kaydı", reportsTitle: "Raporlar", noReports: "Bekleyen rapor yok", noLog: "Henüz kayıt yok",
};
const EN = {
  login: "Log in", register: "Sign up", forgotPw: "Forgot password", noAccount: "No account? Sign up",
  haveAccount: "Already have an account? Log in", backToLogin: "Back to login", username: "Username", password: "Password",
  passwordAgain: "Password (again)", securityAnswer: "Your security answer", avatarColor: "Avatar color", avatarShape: "Avatar shape",
  registerAndEnter: "Sign up and enter", recoverTitle: "Password recovery", newPassword: "New password", resetPassword: "Reset password",
  continueBtn: "Continue", privacyNote: "This platform doesn't collect IP or device info. Only your username is visible.",
  verification: "Verification", channels: "Channels", myServers: "My servers", myRooms: "My private rooms", messages: "Messages",
  friends: "Friends", none: "Nothing yet", addChannel: "Add channel", newMessage: "New message", createRoomOrServer: "Create room / server",
  pickChannelHint: "Pick a channel on the left or create something new.", searchPlaceholder: "Search messages...",
  noMessages: "No messages yet. Be the first to write.", typing: "typing...", messagePlaceholder: "Type a message...", wait: "Please wait...",
  createRoom: "Private room", createServer: "Server", roomName: "Room name", roomPassword: "Room password",
  roomHint: "This room isn't listed anywhere, only people with the invite link can join.", create: "Create",
  serverName: "Server name", serverHint: "Creates a Discord-like server with its own channels. Joining is invite-link only.",
  createServerBtn: "Create server", createdInviteRoom: "Room created! Share this link to invite people:",
  createdInviteServer: "Server created! Share this link to invite people:", enter: "Enter", join: "Join",
  sendMessageBtn: "Send message", profileSettings: "Profile settings", note: "Note", saveBtn: "Save", deleteAccountBtn: "Delete account",
  currentPassword: "Current password", changePassword: "Change password", close: "Close", addFriend: "Add friend",
  requestSent: "Request sent", alreadyFriends: "Friends", friendRequests: "Friend requests", accept: "Accept",
  decline: "Decline", noRequests: "No pending requests", joinDate: "Joined", globalBanBtn: "Ban from site",
  activePanel: "Active users", banned: "Banned", deleteRoomBtn: "Delete room", managementPanel: "Management panel",
  broadcastTitle: "Send announcement", broadcastHint: "Sent to all 3 fixed channels at once.", send: "Send",
  activityLogTitle: "Activity log", reportsTitle: "Reports", noReports: "No pending reports", noLog: "No entries yet",
};
const DE = {
  login: "Anmelden", register: "Registrieren", forgotPw: "Passwort vergessen", noAccount: "Kein Konto? Registrieren",
  haveAccount: "Schon ein Konto? Anmelden", backToLogin: "Zurück zur Anmeldung", username: "Benutzername", password: "Passwort",
  passwordAgain: "Passwort (wiederholen)", securityAnswer: "Deine Sicherheitsantwort", avatarColor: "Avatarfarbe", avatarShape: "Avatarform",
  registerAndEnter: "Registrieren und betreten", recoverTitle: "Passwort wiederherstellen", newPassword: "Neues Passwort", resetPassword: "Passwort zurücksetzen",
  continueBtn: "Weiter", privacyNote: "Diese Plattform sammelt keine IP- oder Geräteinformationen. Nur dein Benutzername ist sichtbar.",
  verification: "Verifizierung", channels: "Kanäle", myServers: "Meine Server", myRooms: "Meine privaten Räume", messages: "Nachrichten",
  friends: "Freunde", none: "Noch nichts", addChannel: "Kanal hinzufügen", newMessage: "Neue Nachricht", createRoomOrServer: "Raum / Server erstellen",
  pickChannelHint: "Wähle links einen Kanal oder erstelle etwas Neues.", searchPlaceholder: "Nachrichten durchsuchen...",
  noMessages: "Noch keine Nachrichten. Schreib die erste.", typing: "tippt...", messagePlaceholder: "Nachricht schreiben...", wait: "Bitte warten...",
  createRoom: "Privater Raum", createServer: "Server", roomName: "Raumname", roomPassword: "Raumpasswort",
  roomHint: "Dieser Raum wird nirgends gelistet, nur mit dem Einladungslink erreichbar.", create: "Erstellen",
  serverName: "Servername", serverHint: "Erstellt einen Discord-ähnlichen Server mit eigenen Kanälen. Beitritt nur per Einladungslink.",
  createServerBtn: "Server erstellen", createdInviteRoom: "Raum erstellt! Teile diesen Link zur Einladung:",
  createdInviteServer: "Server erstellt! Teile diesen Link zur Einladung:", enter: "Betreten", join: "Beitreten",
  sendMessageBtn: "Nachricht senden", profileSettings: "Profileinstellungen", note: "Notiz", saveBtn: "Speichern", deleteAccountBtn: "Konto löschen",
  currentPassword: "Aktuelles Passwort", changePassword: "Passwort ändern", close: "Schließen", addFriend: "Freund hinzufügen",
  requestSent: "Anfrage gesendet", alreadyFriends: "Befreundet", friendRequests: "Freundschaftsanfragen", accept: "Annehmen",
  decline: "Ablehnen", noRequests: "Keine ausstehenden Anfragen", joinDate: "Beigetreten", globalBanBtn: "Von der Seite sperren",
  activePanel: "Aktive Nutzer", banned: "Gesperrt", deleteRoomBtn: "Raum löschen", managementPanel: "Verwaltungspanel",
  broadcastTitle: "Ankündigung senden", broadcastHint: "Wird gleichzeitig an alle 3 festen Kanäle gesendet.", send: "Senden",
  activityLogTitle: "Aktivitätsprotokoll", reportsTitle: "Meldungen", noReports: "Keine offenen Meldungen", noLog: "Noch keine Einträge",
};
const RU = {
  login: "Войти", register: "Регистрация", forgotPw: "Забыли пароль", noAccount: "Нет аккаунта? Зарегистрироваться",
  haveAccount: "Уже есть аккаунт? Войти", backToLogin: "Назад ко входу", username: "Имя пользователя", password: "Пароль",
  passwordAgain: "Пароль (ещё раз)", securityAnswer: "Твой ответ", avatarColor: "Цвет аватара", avatarShape: "Форма аватара",
  registerAndEnter: "Зарегистрироваться и войти", recoverTitle: "Восстановление пароля", newPassword: "Новый пароль", resetPassword: "Сбросить пароль",
  continueBtn: "Продолжить", privacyNote: "Эта платформа не собирает IP или данные устройства. Виден только твой ник.",
  verification: "Проверка", channels: "Каналы", myServers: "Мои серверы", myRooms: "Мои приватные комнаты", messages: "Сообщения",
  friends: "Друзья", none: "Пока пусто", addChannel: "Добавить канал", newMessage: "Новое сообщение", createRoomOrServer: "Создать комнату / сервер",
  pickChannelHint: "Выбери канал слева или создай что-то новое.", searchPlaceholder: "Поиск сообщений...",
  noMessages: "Сообщений пока нет. Напиши первым.", typing: "печатает...", messagePlaceholder: "Написать сообщение...", wait: "Подожди немного...",
  createRoom: "Приватная комната", createServer: "Сервер", roomName: "Название комнаты", roomPassword: "Пароль комнаты",
  roomHint: "Эта комната нигде не отображается, войти можно только по ссылке-приглашению.", create: "Создать",
  serverName: "Название сервера", serverHint: "Создаётся сервер в стиле Discord со своими каналами. Вход только по ссылке-приглашению.",
  createServerBtn: "Создать сервер", createdInviteRoom: "Комната создана! Поделись этой ссылкой для приглашения:",
  createdInviteServer: "Сервер создан! Поделись этой ссылкой для приглашения:", enter: "Войти", join: "Присоединиться",
  sendMessageBtn: "Отправить сообщение", profileSettings: "Настройки профиля", note: "Заметка", saveBtn: "Сохранить", deleteAccountBtn: "Удалить аккаунт",
  currentPassword: "Текущий пароль", changePassword: "Сменить пароль", close: "Закрыть", addFriend: "Добавить в друзья",
  requestSent: "Запрос отправлен", alreadyFriends: "В друзьях", friendRequests: "Заявки в друзья", accept: "Принять",
  decline: "Отклонить", noRequests: "Нет ожидающих заявок", joinDate: "Регистрация", globalBanBtn: "Забанить на сайте",
  activePanel: "Активные пользователи", banned: "Забаненные", deleteRoomBtn: "Удалить комнату", managementPanel: "Панель управления",
  broadcastTitle: "Отправить объявление", broadcastHint: "Отправляется сразу во все 3 фиксированных канала.", send: "Отправить",
  activityLogTitle: "Журнал активности", reportsTitle: "Жалобы", noReports: "Нет ожидающих жалоб", noLog: "Записей пока нет",
};
const DICTS = { tr: TR, en: EN, de: DE, ru: RU };

const AvatarBadge = ({ color, shape, size = 26, onClick, online }) => {
  const found = AVATAR_SHAPES.find((s) => s.key === shape) || AVATAR_SHAPES[0];
  const Icon = found.Icon;
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <div onClick={onClick} style={{ width: size, height: size, borderRadius: 8, background: `${color}22`, border: `1.5px solid ${color}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: onClick ? "pointer" : "default" }}>
        <Icon size={size * 0.55} color={color} fill={color} />
      </div>
      {online !== undefined && <span style={{ position: "absolute", bottom: -1, right: -1, width: 8, height: 8, borderRadius: "50%", background: online ? "#39FF88" : "#4b5560", border: "1.5px solid #0A0C10" }} />}
    </div>
  );
};

const serverColorFor = (name) => AVATAR_COLORS[Math.abs(simpleHash(name || "?").split(".").reduce((a, c) => a + (parseInt(c, 10) || 0), 0)) % AVATAR_COLORS.length];

const ServerIcon = ({ name, iconUrl, size = 42, active, onClick, rounded = "34%" }) => {
  const color = serverColorFor(name);
  const initials = (name || "?").trim().slice(0, 2).toUpperCase();
  return (
    <div
      onClick={onClick}
      style={{
        width: size, height: size, borderRadius: active ? "30%" : rounded, overflow: "hidden", cursor: onClick ? "pointer" : "default",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "border-radius .15s ease",
        background: iconUrl ? "#0002" : `${color}22`, border: `1.5px solid ${iconUrl ? "#ffffff22" : color}`,
      }}
    >
      {iconUrl ? <img src={iconUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ color, fontWeight: 800, fontSize: size * 0.34, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{initials}</span>}
    </div>
  );
};

const renderMessageContent = (text, linkColor) => {
  const urls = text.match(URL_REGEX) || [];
  const imgUrl = urls.find(isImageUrl);
  const parts = text.split(URL_REGEX);
  return (
    <>
      <div>
        {parts.map((part, i) =>
          URL_REGEX.test(part) ? (
            <span key={i} style={{ ...styles.linkText, color: linkColor }} onClick={() => { if (window.confirm("Bu bağlantı harici bir siteye gidiyor, güvenilir olmayabilir. Devam etmek istiyor musun?")) window.open(part, "_blank", "noopener,noreferrer"); }}>{part}</span>
          ) : <span key={i}>{part}</span>
        )}
      </div>
      {imgUrl && <img src={imgUrl} alt="" style={styles.sharedImage} onClick={() => window.open(imgUrl, "_blank")} />}
    </>
  );
};




const MessageRow = memo(function MessageRow({
  m,
  T,
  sessionUsername,
  usernameLower,
  isPinned,
  canModerate,
  isPickerOpen,
  onOpenProfile,
  onTogglePin,
  onReport,
  onDelete,
  onToggleReaction,
  onTogglePicker,
  onSelectEmoji,
  onReply,
  onCopyLink,
  isHighlighted,
}) {
  const mobileActionStyle = {
    width: 36,
    height: 36,
    borderRadius: 9,
    border: "1px solid",
    background: "transparent",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  };

  const [hovered, setHovered] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const longPressTimer = useRef(null);

  if (m.type === "system") {
    return <div style={styles.systemMsg}>{m.text}</div>;
  }

  const age = (Date.now() - m.ts) / MSG_TTL_MS;
  const reactions = m.reactions || {};

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(m.text || "");
    } catch {}
    setMobileMenu(false);
  };

  const startLongPress = () => {
    longPressTimer.current = setTimeout(() => {
      setMobileMenu(true);
    }, 550);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  return (
    <div
      id={`msg-${m.id}`}
      style={{
        ...styles.msgRow,
        animation: isHighlighted ? "highlightFlash 2s ease" : "fadein .25s ease",
        opacity: age > 0.7 ? 0.5 : 1,
        position: "relative",
        borderRadius: 10,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onTouchStart={startLongPress}
      onTouchEnd={cancelLongPress}
      onTouchMove={cancelLongPress}
    >
      <AvatarBadge
        color={m.avatarColor || "#39FF88"}
        shape={m.avatarShape || "circle"}
        size={28}
        onClick={() => onOpenProfile(m.username)}
      />

      <div
        style={{
          ...styles.msgBubble,
          background: T.panel,
          borderColor: T.border,
          position: "relative",
        }}
      >
        {m.replyTo && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11.5,
              color: T.textDim,
              borderLeft: `2px solid ${T.border}`,
              paddingLeft: 8,
              marginBottom: 5,
              opacity: 0.85,
            }}
          >
            <CornerUpLeft size={11} style={{ flexShrink: 0 }} />
            <span style={{ fontWeight: 700 }}>{m.replyTo.username}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.replyTo.text}</span>
          </div>
        )}
        <div style={styles.msgHead}>
          <span
            style={{
              ...styles.msgNick,
              color:
                m.username === sessionUsername
                  ? "#39FF88"
                  : T.mention,
              cursor: "pointer",
            }}
            onClick={() => onOpenProfile(m.username)}
          >
            {m.username}
          </span>

          <span
            style={{
              ...styles.msgTime,
              color: T.textDim,
            }}
          >
            {new Date(m.ts).toLocaleTimeString("tr-TR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>

        <div
          style={{
            ...styles.msgText,
            color: "#39FF88",
          }}
        >
          {renderMessageContent(m.text, T.link)}
        </div>

        <div
          style={{
            ...styles.reactionRow,
            position: "relative",
          }}
        >
          {Object.keys(reactions)
            .filter(
              (emoji) =>
                Object.keys(reactions[emoji] || {}).length > 0
            )
            .map((emoji) => {
              const count = Object.keys(
                reactions[emoji] || {}
              ).length;

              const mine =
                reactions[emoji]?.[usernameLower];

              return (
                <button
                  key={emoji}
                  style={{
                    ...styles.reactionBtn,
                    borderColor: mine
                      ? "#39FF88"
                      : T.border,
                    color: mine
                      ? "#39FF88"
                      : T.textDim,
                  }}
                  onClick={() =>
                    onToggleReaction(m.id, emoji)
                  }
                >
                  {emoji} {count}
                </button>
              );
            })}

          <button
            style={{
              ...styles.reactionBtn,
              borderColor: T.border,
              color: T.textDim,
              fontWeight: 700,
            }}
            onClick={() => onTogglePicker(m.id)}
          >
            +
          </button>

          {isPickerOpen && (
            <div
              style={{
                position: "absolute",
                bottom: "100%",
                left: 0,
                marginBottom: 4,
                display: "flex",
                flexWrap: "wrap",
                gap: 3,
                width: 190,
                padding: 6,
                borderRadius: 8,
                border: "1px solid",
                borderColor: T.border,
                background: T.panel,
                zIndex: 20,
                animation: "modalIn .12s ease",
              }}
            >
              {EXTRA_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  style={{
                    background: "transparent",
                    border: "none",
                    fontSize: 16,
                    cursor: "pointer",
                    padding: 3,
                  }}
                  onClick={() =>
                    onSelectEmoji(m.id, emoji)
                  }
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Discord tarzı hover action bar */}
        {hovered && (
          <div
            style={{
              position: "absolute",
              top: -18,
              right: 8,
              display: "flex",
              gap: 4,
              padding: 4,
              borderRadius: 10,
              background: T.panel,
              border: `1px solid ${T.border}`,
              boxShadow: "0 8px 24px #0005",
              zIndex: 10,
              animation: "modalIn .12s ease",
            }}
          >
            <button
              style={{
                ...mobileActionStyle,
                borderColor: T.border,
                color: T.textDim,
              }}
              title="Yanıtla"
              onClick={() => onReply(m)}
            >
              <CornerUpLeft size={15} />
            </button>

            <button
              style={{
                ...mobileActionStyle,
                borderColor: T.border,
                color: T.textDim,
              }}
              title="Mesaj linki"
              onClick={() => onCopyLink(m)}
            >
              <Link2 size={15} />
            </button>

            <button
              style={{
                ...mobileActionStyle,
                borderColor: T.border,
                color: T.textDim,
              }}
              title="Kopyala"
              onClick={copyMessage}
            >
              <Copy size={15} />
            </button>

            {canModerate && (
              <button
                style={{
                  ...mobileActionStyle,
                  borderColor: T.border,
                  color: isPinned
                    ? "#39FF88"
                    : T.textDim,
                }}
                title="Sabitle"
                onClick={() => onTogglePin(m.id)}
              >
                <Pin size={15} />
              </button>
            )}

            {m.username !== sessionUsername && (
              <button
                style={{
                  ...mobileActionStyle,
                  borderColor: T.border,
                  color: T.textDim,
                }}
                title="Raporla"
                onClick={() => onReport(m)}
              >
                <Flag size={15} />
              </button>
            )}

            {canModerate && (
              <button
                style={{
                  ...mobileActionStyle,
                  borderColor: T.border,
                  color: "#F27171",
                }}
                title="Sil"
                onClick={() => onDelete(m.id)}
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        )}

        {/* Mobil uzun basma menüsü */}
        {mobileMenu && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              right: 8,
              marginTop: 6,
              minWidth: 170,
              padding: 6,
              borderRadius: 10,
              background: T.panel,
              border: `1px solid ${T.border}`,
              boxShadow: "0 12px 30px #0006",
              zIndex: 30,
              animation: "modalIn .14s ease",
            }}
          >
            <button
              onClick={() => {
                onReply(m);
                setMobileMenu(false);
              }}
              style={{
                width: "100%",
                padding: "9px 10px",
                border: "none",
                borderRadius: 7,
                background: "transparent",
                color: T.text,
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <CornerUpLeft size={14} style={{ marginRight: 8 }} />
              Yanıtla
            </button>

            <button
              onClick={() => {
                onCopyLink(m);
                setMobileMenu(false);
              }}
              style={{
                width: "100%",
                padding: "9px 10px",
                border: "none",
                borderRadius: 7,
                background: "transparent",
                color: T.text,
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <Link2 size={14} style={{ marginRight: 8 }} />
              Mesaj linki
            </button>

            <button
              onClick={copyMessage}
              style={{
                width: "100%",
                padding: "9px 10px",
                border: "none",
                borderRadius: 7,
                background: "transparent",
                color: T.text,
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <Copy size={14} style={{ marginRight: 8 }} />
              Kopyala
            </button>

            {canModerate && (
              <button
                onClick={() => {
                  onTogglePin(m.id);
                  setMobileMenu(false);
                }}
                style={{
                  width: "100%",
                  padding: "9px 10px",
                  border: "none",
                  borderRadius: 7,
                  background: "transparent",
                  color: T.text,
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <Pin size={14} style={{ marginRight: 8 }} />
                {isPinned ? "Sabitlemeyi kaldır" : "Sabitle"}
              </button>
            )}

            {m.username !== sessionUsername && (
              <button
                onClick={() => {
                  onReport(m);
                  setMobileMenu(false);
                }}
                style={{
                  width: "100%",
                  padding: "9px 10px",
                  border: "none",
                  borderRadius: 7,
                  background: "transparent",
                  color: T.text,
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <Flag size={14} style={{ marginRight: 8 }} />
                Raporla
              </button>
            )}

            {canModerate && (
              <button
                onClick={() => {
                  onDelete(m.id);
                  setMobileMenu(false);
                }}
                style={{
                  width: "100%",
                  padding: "9px 10px",
                  border: "none",
                  borderRadius: 7,
                  background: "transparent",
                  color: "#F27171",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <Trash2 size={14} style={{ marginRight: 8 }} />
                Sil
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

function AppInner() {
  const [session, setSession] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [firebaseConnected, setFirebaseConnected] = useState(true);
  const [lang, setLang] = useState(() => localStorage.getItem("dagsx19_lang") || "tr");
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const t = DICTS[lang];
  const securityQuestions = SECURITY_QUESTIONS_BY_LANG[lang];

  const [authView, setAuthView] = useState("landing");
  const [authForm, setAuthForm] = useState({ username: "", password: "", confirm: "", question: securityQuestions[0], answer: "", captchaInput: "" });
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
  const [globalPresence, setGlobalPresence] = useState({});
  const [pinnedId, setPinnedId] = useState(null);
  const [input, setInput] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [memberListOpen, setMemberListOpen] = useState(false);
  const [memberProfiles, setMemberProfiles] = useState({});
  const [logPanelOpen, setLogPanelOpen] = useState(false);
  const [reportsPanelOpen, setReportsPanelOpen] = useState(false);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastText, setBroadcastText] = useState("");
  const [activityLog, setActivityLog] = useState([]);
  const [reports, setReports] = useState({});
  const [profileCard, setProfileCard] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsForm, setSettingsForm] = useState({ note: "", bio: "", currentPassword: "", newPassword: "" });
  const [chatBackground, setChatBackground] = useState(null);
  const [settingsError, setSettingsError] = useState("");
  const [friends, setFriends] = useState({});
  const [friendRequests, setFriendRequests] = useState({});
  const [requestsModalOpen, setRequestsModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createTab, setCreateTab] = useState("room");
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomPassword, setNewRoomPassword] = useState("");
  const [newServerName, setNewServerName] = useState("");
  const [newServerIconUrl, setNewServerIconUrl] = useState("");
  const [newServerPublic, setNewServerPublic] = useState(false);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [publicServers, setPublicServers] = useState({});
  const [createdInvite, setCreatedInvite] = useState(null);
  const [joinModal, setJoinModal] = useState(null);
  const [joinPasswordInput, setJoinPasswordInput] = useState("");
  const [joinError, setJoinError] = useState("");
  const [toast, setToast] = useState("");
  const [reactionPickerFor, setReactionPickerFor] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem("dagsx19_sound") !== "off");
  const soundEnabledRef = useRef(soundEnabled);
  useEffect(() => { localStorage.setItem("dagsx19_sound", soundEnabled ? "on" : "off"); soundEnabledRef.current = soundEnabled; }, [soundEnabled]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [lastMessageMap, setLastMessageMap] = useState({});
  const [myLastRead, setMyLastRead] = useState({});
  const [totalUsers, setTotalUsers] = useState(0);
  const [isMobile, setIsMobile] = useState(() => (typeof window !== "undefined" ? window.matchMedia("(max-width: 720px)").matches : false));
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 720px)");
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener ? mq.addEventListener("change", handler) : mq.addListener(handler);
    return () => (mq.removeEventListener ? mq.removeEventListener("change", handler) : mq.removeListener(handler));
  }, []);
    const [viewState, setViewState] = useState("landing");
  
  const [pendingInvite, setPendingInvite] = useState(null);
  const [pendingMsgId, setPendingMsgId] = useState(null);
  const [highlightMsgId, setHighlightMsgId] = useState(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [dmTargetInput, setDmTargetInput] = useState("");
  const [dmModalOpen, setDmModalOpen] = useState(false);
  const scrollRef = useRef(null);
  const chatInputRef = useRef(null);
  const searchInputRef = useRef(null);
  const msgTimestampsRef = useRef([]);
  const typingTimeoutRef = useRef(null);
  const knownMsgIdsRef = useRef(new Set());
  const latestMessagesRef = useRef({});

  const usernameLower = session?.username?.toLowerCase();
  const myRole = usernameLower ? roles[usernameLower] : null;
  const isDeveloper = myRole === "developer";
  const isRoomStaff = isDeveloper || myRole === "admin" || myRole === "mod";
  const activeRoom = activeScope?.kind === "room" ? rooms[activeScope.roomId] : null;
  const activeServer = activeScope?.kind === "server" ? servers[activeScope.serverId] : null;
  const isServerOwner = activeServer?.ownerUsername === session?.username;
  const isRoomOwner = activeRoom?.creatorUsername === session?.username;
  const pendingRequestCount = Object.keys(friendRequests).length;

  const flashToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2600); };

  useEffect(() => { localStorage.setItem("dagsx19_theme", theme); document.documentElement.setAttribute("data-theme", theme); }, [theme]);
  useEffect(() => { localStorage.setItem("dagsx19_lang", lang); }, [lang]);
  const T = theme === "dark" ? darkPalette : lightPalette;

  useEffect(() => {
    try {
      const raw = localStorage.getItem("dagsx19_session");
      if (raw) setSession(JSON.parse(raw));
    } catch {}
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get("room");
    const serverParam = params.get("server");
    const channelParam = params.get("channel");
    const msgParam = params.get("msg");
    if (roomParam) setPendingInvite({ kind: "room", id: roomParam });
    else if (serverParam) setPendingInvite({ kind: "server", id: serverParam, channelId: channelParam });
    else if (channelParam) setPendingInvite({ kind: "channel", id: channelParam });
    if (msgParam) setPendingMsgId(msgParam);
    setAuthChecked(true);
  }, []);

  // ---------- Firebase connection status ----------
  useEffect(() => {
    const unsub = onValue(ref(db, ".info/connected"), (snap) => setFirebaseConnected(snap.val() === true));
    return () => unsub();
  }, []);

  // ---------- keyboard shortcuts ----------
  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName;
      const isTyping = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      if (e.key === "Escape") {
        setSettingsOpen(false); setCreateModalOpen(false); setJoinModal(null); setDmModalOpen(false);
        setDiscoverOpen(false); setMemberListOpen(false); setBroadcastOpen(false); setLogPanelOpen(false);
        setReportsPanelOpen(false); setPanelOpen(false); setProfileCard(null); setRequestsModalOpen(false);
        setSearchOpen(false); setReactionPickerFor(null); setReplyTo(null);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 0);
        return;
      }

      if (e.key === "/" && !isTyping) {
        e.preventDefault();
        chatInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => { if (session) localStorage.setItem("dagsx19_session", JSON.stringify(session)); }, [session]);

  useEffect(() => {
    if (!usernameLower) return;
    const unsub = onValue(ref(db, `globalBans/${usernameLower}`), (snap) => {
      if (snap.exists()) { flashToast("Hesabın site genelinde yasaklandı."); logout(); }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usernameLower]);

  useEffect(() => {
    const unsub = onValue(ref(db, "roles"), (snap) => setRoles(snap.val() || {}));
    return () => unsub();
  }, []);

  // ---------- global presence heartbeat (for friends online status) ----------
  useEffect(() => {
    if (!usernameLower) return;
    const presRef = ref(db, `presence/global/${usernameLower}`);
    const lastSeenRef = ref(db, `users/${usernameLower}/lastSeen`);
    const beat = () => { set(presRef, { username: session.username, lastSeen: Date.now() }); set(lastSeenRef, Date.now()); };
    beat();
    const hb = setInterval(beat, 10000);
    const unsub = onValue(ref(db, "presence/global"), (snap) => {
      const val = snap.val() || {};
      const now = Date.now();
      setGlobalPresence(Object.fromEntries(Object.entries(val).filter(([, p]) => now - p.lastSeen < 25000)));
    });
    return () => { clearInterval(hb); unsub(); remove(presRef); set(lastSeenRef, Date.now()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usernameLower]);

  // ---------- friends + requests listeners ----------
  useEffect(() => {
    if (!usernameLower) return;
    const unsub1 = onValue(ref(db, `friends/${usernameLower}`), (snap) => setFriends(snap.val() || {}));
    const unsub2 = onValue(ref(db, `friendRequests/${usernameLower}`), (snap) => setFriendRequests(snap.val() || {}));
    return () => { unsub1(); unsub2(); };
  }, [usernameLower]);

  // ---------- unread tracking ----------
  useEffect(() => {
    if (!usernameLower) return;
    const unsub1 = onValue(ref(db, "lastMessage"), (snap) => setLastMessageMap(snap.val() || {}));
    const unsub2 = onValue(ref(db, `users/${usernameLower}/lastRead`), (snap) => setMyLastRead(snap.val() || {}));
    return () => { unsub1(); unsub2(); };
  }, [usernameLower]);

  // ---------- discoverable public servers ----------
  useEffect(() => {
    if (!discoverOpen) return;
    const unsub = onValue(ref(db, "publicServers"), (snap) => setPublicServers(snap.val() || {}));
    return () => unsub();
  }, [discoverOpen]);

  // ---------- member list panel ----------
  useEffect(() => {
    if (!memberListOpen || !activeServer) return;
    let cancelled = false;
    (async () => {
      const usernames = Object.keys(activeServer.members || {});
      const entries = await Promise.all(usernames.map(async (u) => [u, await safeGet(`users/${u}`)]));
      if (cancelled) return;
      setMemberProfiles(Object.fromEntries(entries.filter(([, rec]) => rec)));
    })();
    return () => { cancelled = true; };
  }, [memberListOpen, activeServer]);

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
      const record = await safeGet(`users/${usernameLower}`);
      if (record) {
        setSettingsForm((prev) => ({ ...prev, note: record.note || "", bio: record.bio || "" }));
        if (record.chatBackground) setChatBackground(record.chatBackground);
      }
    })();
  }, [usernameLower]);

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
        const alreadyMember = !!server.members?.[usernameLower];
        if (!alreadyMember) {
          await set(ref(db, `servers/${pendingInvite.id}/members/${usernameLower}`), true);
          await set(ref(db, `users/${usernameLower}/joinedServers/${pendingInvite.id}`), true);
          flashToast(`"${server.name}" sunucusuna katıldın.`);
        }
        setServers((prev) => ({ ...prev, [pendingInvite.id]: server }));
        setExpandedServers((prev) => ({ ...prev, [pendingInvite.id]: true }));
        const targetCh = (pendingInvite.channelId && server.channels?.[pendingInvite.channelId]) ? pendingInvite.channelId : Object.keys(server.channels || {})[0];
        if (targetCh) openScope({ kind: "server", serverId: pendingInvite.id, channelId: targetCh });
      } else if (pendingInvite.kind === "channel") {
        openScope({ kind: "global", channelId: pendingInvite.id });
      }
      setPendingInvite(null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, pendingInvite]);

  useEffect(() => {
    if (view !== "room" || !activeScope || !session) return;
    const key = scopeKey(activeScope);
    knownMsgIdsRef.current = new Set();
    setMessagesLoading(true);

    const msgsRef = ref(db, `messages/${key}`);
    const unsubMsgs = onValue(msgsRef, (snap) => {
      const val = snap.val() || {};
      const ids = Object.keys(val);
      const isFirstLoad = knownMsgIdsRef.current.size === 0;
      const newOnes = ids.filter((id) => !knownMsgIdsRef.current.has(id));
      if (!isFirstLoad) newOnes.forEach((id) => { if (val[id].type === "user" && val[id].username !== session.username && soundEnabledRef.current) playBeep(); });
      knownMsgIdsRef.current = new Set(ids);
      latestMessagesRef.current = val;
      setMessages(val);
      setMessagesLoading(false);
    });

    const unsubPin = onValue(ref(db, `pinned/${key}`), (snap) => setPinnedId(snap.exists() ? snap.val() : null));

    let presRef = null, hb = null, unsubPres = null;
    if (activeScope.kind !== "dm") {
      presRef = ref(db, `presence/${key}/${usernameLower}`);
      const setOnline = (typing = false) => set(presRef, { username: session.username, avatarColor: session.avatarColor, avatarShape: session.avatarShape, lastSeen: Date.now(), typing });
      get(presRef).then((snap) => {
        if (!snap.exists()) push(ref(db, `messages/${key}`)).then((r) => set(r, { type: "system", text: `${session.username} katıldı`, ts: Date.now() }));
        setOnline(false);
      });
      hb = setInterval(() => setOnline(false), 8000);
      unsubPres = onValue(ref(db, `presence/${key}`), (snap) => {
        const val = snap.val() || {};
        const now = Date.now();
        setPresence(Object.fromEntries(Object.entries(val).filter(([, p]) => now - p.lastSeen < 20000)));
      });
    } else setPresence({});

    const prune = setInterval(() => {
      const val = latestMessagesRef.current || {};
      const now = Date.now();
      Object.entries(val).forEach(([id, m]) => { if (now - m.ts > MSG_TTL_MS) remove(ref(db, `messages/${key}/${id}`)); });
    }, 15000);

    return () => {
      unsubMsgs(); unsubPin();
      if (unsubPres) unsubPres();
      if (hb) clearInterval(hb);
      clearInterval(prune);
      if (presRef) remove(presRef);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, activeScope && scopeKey(activeScope), session]);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);

  useEffect(() => {
    if (!isDeveloper) return;
    const unsub = onValue(query(ref(db, "activityLog"), orderByChild("ts"), limitToLast(60)), (snap) => {
      const val = snap.val() || {};
      setActivityLog(Object.values(val).sort((a, b) => b.ts - a.ts));
    });
    const unsub2 = onValue(ref(db, "reports"), (snap) => setReports(snap.val() || {}));
    const unsub3 = onValue(ref(db, "stats/totalUsers"), (snap) => setTotalUsers(snap.val() || 0));
    return () => { unsub(); unsub2(); unsub3(); };
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
      return setAuthError("Doğrulama yanlış, tekrar dene.");
    }
    const isGhosty = unameLower === "ghosty";
    if (!checkPasswordStrength(authForm.password, isGhosty)) {
      return setAuthError(isGhosty ? "Ghosty hesabı için güçlü şifre gerekli (10+ karakter, büyük/küçük harf, rakam, sembol)." : "Şifre en az 6 karakter olmalı.");
    }
    if (!authForm.answer.trim()) return setAuthError("Güvenlik sorusu cevabı boş bırakılamaz.");
    if (await safeGet(`globalBans/${unameLower}`)) return setAuthError("Bu kullanıcı adı yasaklı.");
    if (await safeGet(`users/${unameLower}`)) return setAuthError("Bu kullanıcı adı zaten alınmış.");

    const passwordSalt = randomSaltHex();
    const securityAnswerSalt = randomSaltHex();
    const passwordHash = await hashSecret(authForm.password, passwordSalt);
    const securityAnswerHash = await hashSecret(authForm.answer.trim().toLowerCase(), securityAnswerSalt);
    await set(ref(db, `users/${unameLower}`), {
      username: uname, passwordHash, passwordSalt, securityQuestion: authForm.question,
      securityAnswerHash, securityAnswerSalt, avatarColor: pickColor, avatarShape: pickShape, note: "", bio: "", createdAt: Date.now(),
    });
    if (isGhosty) await set(ref(db, `roles/${unameLower}`), "developer");
    const currentTotal = (await safeGet("stats/totalUsers")) || 0;
    await set(ref(db, "stats/totalUsers"), currentTotal + 1);
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
    if (!record) return setAuthError("Kullanıcı adı veya şifre hatalı.");
    const computed = record.passwordSalt ? await hashSecret(authForm.password, record.passwordSalt) : simpleHash(authForm.password);
    if (computed !== record.passwordHash) return setAuthError("Kullanıcı adı veya şifre hatalı.");
    setSession({ username: record.username, avatarColor: record.avatarColor, avatarShape: record.avatarShape });
    flashToast(`Tekrar hoş geldin, ${record.username}!`);
  };

  const submitRecoverCheck = async () => {
    setAuthError("");
    const unameLower = authForm.username.trim().toLowerCase();
    const record = await safeGet(`users/${unameLower}`);
    if (!record) return setAuthError("Böyle bir kullanıcı bulunamadı.");
    const answer = recoverAnswer.trim().toLowerCase();
    const computed = record.securityAnswerSalt ? await hashSecret(answer, record.securityAnswerSalt) : simpleHash(answer);
    if (computed !== record.securityAnswerHash) return setAuthError("Cevap yanlış.");
    setRecoverStep(2);
  };
  const submitRecoverReset = async () => {
    setAuthError("");
    const unameLower = authForm.username.trim().toLowerCase();
    const isGhosty = unameLower === "ghosty";
    if (!checkPasswordStrength(recoverNewPw, isGhosty)) return setAuthError(isGhosty ? "Ghosty için güçlü şifre gerekli." : "Şifre en az 6 karakter olmalı.");
    const passwordSalt = randomSaltHex();
    const passwordHash = await hashSecret(recoverNewPw, passwordSalt);
    await set(ref(db, `users/${unameLower}/passwordHash`), passwordHash);
    await set(ref(db, `users/${unameLower}/passwordSalt`), passwordSalt);
    flashToast("Şifre sıfırlandı, giriş yapabilirsin.");
    setAuthView("login"); setRecoverStep(1); setRecoverAnswer(""); setRecoverNewPw("");
  };

  const logout = () => { setSession(null); localStorage.removeItem("dagsx19_session"); setView("landing"); setActiveScope(null); };

  const deleteAccount = async () => {
    const confirmText = "SİL";
    const typed = window.prompt(`Hesabını kalıcı olarak silmek üzeresin. Bu işlem geri alınamaz; tüm mesajların, arkadaşlıkların ve odaların içindeki üyeliğin silinecek.\n\nOnaylamak için "${confirmText}" yaz:`);
    if (typed !== confirmText) return;
    const unameLower = session.username.toLowerCase();
    try {
      await remove(ref(db, `users/${unameLower}`));
      await remove(ref(db, `presence/${unameLower}`));
      const myFriends = await safeGet(`users/${unameLower}/friends`);
      if (myFriends) {
        await Promise.all(Object.keys(myFriends).map((f) => remove(ref(db, `users/${f}/friends/${unameLower}`))));
      }
      flashToast("Hesabın silindi.");
    } catch (e) {
      flashToast("Hesap silinirken bir hata oluştu, tekrar dene.");
      return;
    }
    logout();
  };

  // ---------- settings ----------
  const setChatBackgroundPref = async (bg) => {
    setChatBackground(bg);
    await set(ref(db, `users/${usernameLower}/chatBackground`), bg);
  };

  const saveSettings = async () => {
    setSettingsError("");
    if (settingsForm.newPassword) {
      const record = await safeGet(`users/${usernameLower}`);
      const currentComputed = record.passwordSalt ? await hashSecret(settingsForm.currentPassword, record.passwordSalt) : simpleHash(settingsForm.currentPassword);
      if (!record || record.passwordHash !== currentComputed) {
  return setSettingsError("Mevcut şifre yanlış.");
      }
      const isGhosty = usernameLower === "ghosty";
      if (!checkPasswordStrength(settingsForm.newPassword, isGhosty)) return setSettingsError("Yeni şifre çok kısa.");
      const newSalt = randomSaltHex();
      const newHash = await hashSecret(settingsForm.newPassword, newSalt);
      await set(ref(db, `users/${usernameLower}/passwordHash`), newHash);
      await set(ref(db, `users/${usernameLower}/passwordSalt`), newSalt);
    }
    await set(ref(db, `users/${usernameLower}/note`), settingsForm.note.slice(0, 100));
    await set(ref(db, `users/${usernameLower}/bio`), (settingsForm.bio || "").slice(0, 300));
    await set(ref(db, `users/${usernameLower}/avatarColor`), pickColor);
    await set(ref(db, `users/${usernameLower}/avatarShape`), pickShape);
    const updatedSession = { ...session, avatarColor: pickColor, avatarShape: pickShape };
    setSession(updatedSession);
    setSettingsForm((prev) => ({ ...prev, currentPassword: "", newPassword: "" }));
    setSettingsOpen(false);
    flashToast("Kaydedildi.");
  };

  const openSettings = () => { setPickColor(session.avatarColor); setPickShape(session.avatarShape); setSettingsOpen(true); setProfileCard(null); };

  // ---------- friends ----------
  const sendFriendRequest = async (targetUsername) => {
    const targetLower = targetUsername.toLowerCase();
    await set(ref(db, `friendRequests/${targetLower}/${usernameLower}`), { from: session.username, ts: Date.now() });
    flashToast(t.requestSent);
  };
  const acceptFriendRequest = async (fromLower) => {
    await set(ref(db, `friends/${usernameLower}/${fromLower}`), true);
    await set(ref(db, `friends/${fromLower}/${usernameLower}`), true);
    await remove(ref(db, `friendRequests/${usernameLower}/${fromLower}`));
  };
  const declineFriendRequest = (fromLower) => remove(ref(db, `friendRequests/${usernameLower}/${fromLower}`));
  const removeFriend = async (otherLower) => {
    await remove(ref(db, `friends/${usernameLower}/${otherLower}`));
    await remove(ref(db, `friends/${otherLower}/${usernameLower}`));
  };

  // ---------- chat actions ----------
  const openScope = (scope) => {
    setActiveScope(scope); setMessages({}); setView("room");
    setPanelOpen(false); setSearchOpen(false); setSearchQuery(""); setLogPanelOpen(false); setReportsPanelOpen(false); setReplyTo(null);
    if (usernameLower) set(ref(db, `users/${usernameLower}/lastRead/${scopeKey(scope)}`), Date.now());
  };

  const createRoom = async () => {
    const name = newRoomName.trim();
    if (!name) return;
    if (!newRoomPassword) return flashToast("Özel oda için şifre gerekli.");
    const id = genCode();
    const passwordSalt = randomSaltHex();
    const passwordHash = await hashSecret(newRoomPassword, passwordSalt);
    const room = { name, passwordHash, passwordSalt, createdAt: Date.now(), creatorUsername: session.username, banned: {}, muted: {} };
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
    const server = { name, iconUrl: newServerIconUrl.trim() || null, ownerUsername: session.username, createdAt: Date.now(), channels, members: { [usernameLower]: true }, banned: {}, public: newServerPublic };
    await set(ref(db, `servers/${id}`), server);
    await set(ref(db, `users/${usernameLower}/joinedServers/${id}`), true);
    if (newServerPublic) await set(ref(db, `publicServers/${id}`), { name, iconUrl: newServerIconUrl.trim() || null, createdAt: Date.now() });
    setServers((prev) => ({ ...prev, [id]: server }));
    setExpandedServers((prev) => ({ ...prev, [id]: true }));
    setCreatedInvite({ id, link: `${window.location.origin}${window.location.pathname}?server=${id}`, type: "server" });
    setNewServerName(""); setNewServerIconUrl(""); setNewServerPublic(false);
  };

  const updateServerIcon = async (serverId) => {
    const url = window.prompt("Sunucu ikonu için resim linki (boş bırakırsan ikon kaldırılır):", servers[serverId]?.iconUrl || "");
    if (url === null) return;
    await set(ref(db, `servers/${serverId}/iconUrl`), url.trim() || null);
    setServers((prev) => ({ ...prev, [serverId]: { ...prev[serverId], iconUrl: url.trim() || null } }));
  };

  const renameServer = async (serverId) => {
    const name = window.prompt("Yeni sunucu adı:", servers[serverId]?.name || "");
    if (!name || !name.trim()) return;
    await set(ref(db, `servers/${serverId}/name`), name.trim());
    setServers((prev) => ({ ...prev, [serverId]: { ...prev[serverId], name: name.trim() } }));
    if (servers[serverId]?.public) await set(ref(db, `publicServers/${serverId}/name`), name.trim());
    flashToast("Sunucu adı güncellendi.");
  };

  const updateServerDescription = async (serverId) => {
    const desc = window.prompt("Sunucu açıklaması (Keşfet listesinde görünür):", servers[serverId]?.description || "");
    if (desc === null) return;
    const trimmed = desc.trim().slice(0, 200);
    await set(ref(db, `servers/${serverId}/description`), trimmed || null);
    setServers((prev) => ({ ...prev, [serverId]: { ...prev[serverId], description: trimmed || null } }));
    if (servers[serverId]?.public) await set(ref(db, `publicServers/${serverId}/description`), trimmed || null);
    flashToast("Açıklama güncellendi.");
  };

  const renameRoom = async (roomId) => {
    const name = window.prompt("Yeni oda adı:", rooms[roomId]?.name || "");
    if (!name || !name.trim()) return;
    await set(ref(db, `rooms/${roomId}/name`), name.trim());
    setRooms((prev) => ({ ...prev, [roomId]: { ...prev[roomId], name: name.trim() } }));
    flashToast("Oda adı güncellendi.");
  };

  const joinPublicServer = async (id) => {
    const server = await safeGet(`servers/${id}`);
    if (!server) return flashToast("Bu sunucu artık mevcut değil.");
    if (server.banned?.[usernameLower]) return flashToast("Bu sunucudan yasaklandınız.");
    await set(ref(db, `servers/${id}/members/${usernameLower}`), true);
    await set(ref(db, `users/${usernameLower}/joinedServers/${id}`), true);
    setServers((prev) => ({ ...prev, [id]: server }));
    setExpandedServers((prev) => ({ ...prev, [id]: true }));
    setDiscoverOpen(false);
    flashToast(`"${server.name}" sunucusuna katıldın.`);
    const firstCh = Object.keys(server.channels || {})[0];
    if (firstCh) openScope({ kind: "server", serverId: id, channelId: firstCh });
  };

  const addChannelToServer = async (serverId) => {
    const name = window.prompt("Yeni kanal adı:");
    if (!name || !name.trim()) return;
    const chId = genCode();
    await set(ref(db, `servers/${serverId}/channels/${chId}`), { name: name.trim() });
    setServers((prev) => ({ ...prev, [serverId]: { ...prev[serverId], channels: { ...prev[serverId].channels, [chId]: { name: name.trim() } } } }));
  };

  const deleteChannelFromServer = async (serverId, channelId, channelName) => {
    const server = servers[serverId];
    const remainingCount = Object.keys(server?.channels || {}).length;
    if (remainingCount <= 1) { flashToast("Bir sunucuda en az bir kanal kalmalı."); return; }
    if (!window.confirm(`#${channelName} kanalını silmek istediğine emin misin? Kanaldaki tüm mesajlar da silinecek.`)) return;
    const chScopeKey = scopeKey({ kind: "server", serverId, channelId });
    await remove(ref(db, `servers/${serverId}/channels/${channelId}`));
    await remove(ref(db, `messages/${chScopeKey}`));
    await remove(ref(db, `presence/${chScopeKey}`));
    await remove(ref(db, `pinned/${chScopeKey}`));
    setServers((prev) => {
      const nextChannels = { ...prev[serverId].channels };
      delete nextChannels[channelId];
      return { ...prev, [serverId]: { ...prev[serverId], channels: nextChannels } };
    });
    logActivity("delete_channel", session.username, `${serverId}/${channelId}`);
    if (activeScope?.kind === "server" && activeScope.serverId === serverId && activeScope.channelId === channelId) {
      leaveView();
    }
    flashToast("Kanal silindi.");
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
    const computed = joinModal.room.passwordSalt ? await hashSecret(joinPasswordInput, joinModal.room.passwordSalt) : simpleHash(joinPasswordInput);
    if (computed !== joinModal.room.passwordHash) return setJoinError("Şifre yanlış.");
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

    if (activeRoom?.muted?.[usernameLower]) {
      return flashToast("Bu odada susturuldunuz.");
    }

    // Kanal mesaj gönderme izni (DM'lerde uygulanmaz)
    if (
      (activeScope.kind === "global" || activeScope.kind === "server") &&
      !hasChannelPermission("send", activeScope.channelId, myRole, isDeveloper)
    ) {
      return flashToast("Bu kanalda mesaj gönderme iznin yok.");
    }

    const now = Date.now();
    msgTimestampsRef.current = msgTimestampsRef.current.filter((tt) => now - tt < RATE_LIMIT_WINDOW_MS);
    if (msgTimestampsRef.current.length >= RATE_LIMIT_COUNT) {
      setRateLimited(true);
      flashToast("Çok hızlı mesaj gönderiyorsun, biraz yavaşla.");
      setTimeout(() => setRateLimited(false), RATE_LIMIT_COOLDOWN_MS);
      return;
    }
    msgTimestampsRef.current.push(now);

    const text = censorText(raw);
    const key = scopeKey(activeScope);
    const msgRef = push(ref(db, `messages/${key}`));
    const payload = { type: "user", username: session.username, avatarColor: session.avatarColor, avatarShape: session.avatarShape, text, ts: now };
    if (replyTo) payload.replyTo = { id: replyTo.id, username: replyTo.username, text: (replyTo.text || "").slice(0, 120) };
    await set(msgRef, payload);
    await set(ref(db, `lastMessage/${key}`), now);
    await set(ref(db, `users/${usernameLower}/lastRead/${key}`), now);
    setInput("");
    setReplyTo(null);
  };

  const deleteMessage = useCallback((msgId) => remove(ref(db, `messages/${scopeKey(activeScope)}/${msgId}`)), [activeScope]);
  const toggleReaction = useCallback(async (msgId, emoji) => {
    const path = `messages/${scopeKey(activeScope)}/${msgId}/reactions/${emoji}/${usernameLower}`;
    const existing = await safeGet(path);
    await set(ref(db, path), existing ? null : true);
  }, [activeScope, usernameLower]);
  const togglePin = useCallback(async (msgId) => { await set(ref(db, `pinned/${scopeKey(activeScope)}`), pinnedId === msgId ? null : msgId); }, [activeScope, pinnedId]);
  const toggleReactionPicker = useCallback((msgId) => setReactionPickerFor((prev) => (prev === msgId ? null : msgId)), []);
  const selectEmojiReaction = useCallback((msgId, emoji) => { toggleReaction(msgId, emoji); setReactionPickerFor(null); }, [toggleReaction]);
  const copyMessageLink = useCallback((msg) => {
    if (!activeScope || activeScope.kind === "dm") { flashToast("DM mesajları için link paylaşımı yok."); return; }
    const base = `${window.location.origin}${window.location.pathname}`;
    let link;
    if (activeScope.kind === "room") link = `${base}?room=${activeScope.roomId}&msg=${msg.id}`;
    else if (activeScope.kind === "server") link = `${base}?server=${activeScope.serverId}&channel=${activeScope.channelId}&msg=${msg.id}`;
    else link = `${base}?channel=${activeScope.channelId}&msg=${msg.id}`;
    navigator.clipboard?.writeText(link);
    flashToast("Mesaj linki kopyalandı.");
  }, [activeScope]);
  const reportMessage = useCallback(async (msg) => {
    const reason = window.prompt("Bu mesajı neden bildiriyorsun? (kısa açıklama)");
    if (reason === null) return;
    await push(ref(db, "reports"), { scopeKey: scopeKey(activeScope), msgId: msg.id, msgText: msg.text || "", msgAuthor: msg.username, reporterUsername: session.username, reason: reason.trim(), ts: Date.now() });
    flashToast("Bildirim gönderildi.");
  }, [activeScope, session]);

  const updateActiveRoom = async (mutateFn) => {
    const current = await safeGet(`rooms/${activeScope.roomId}`);
    const updated = mutateFn(current || activeRoom);
    await set(ref(db, `rooms/${activeScope.roomId}`), updated);
    setRooms((prev) => ({ ...prev, [activeScope.roomId]: updated }));
  };
  const toggleMute = (tt) => updateActiveRoom((r) => ({ ...r, muted: { ...(r.muted || {}), [tt]: r.muted?.[tt] ? null : true } }));
  const banUserFromRoom = (tt) => {
    if (!window.confirm(`${tt} kullanıcısını bu odadan yasaklamak istediğine emin misin?`)) return;
    updateActiveRoom((r) => ({ ...r, banned: { ...(r.banned || {}), [tt]: true } })); flashToast("Kullanıcı odadan yasaklandı."); logActivity("room_ban", session.username, tt);
  };
  const unbanUserFromRoom = (tt) => updateActiveRoom((r) => ({ ...r, banned: { ...(r.banned || {}), [tt]: null } }));
  const kickUserFromRoom = async (tt) => {
    if (!window.confirm(`${tt} kullanıcısını bu odadan çıkarmak istediğine emin misin? (Yasaklanmaz, tekrar davet linkiyle girebilir)`)) return;
    await remove(ref(db, `users/${tt}/joinedRooms/${activeScope.roomId}`));
    flashToast("Kullanıcı odadan çıkarıldı."); logActivity("room_kick", session.username, tt);
  };
  const banUserFromServer = async (tt) => {
    if (!window.confirm(`${tt} kullanıcısını bu sunucudan yasaklamak istediğine emin misin?`)) return;
    const s = await safeGet(`servers/${activeScope.serverId}`);
    await set(ref(db, `servers/${activeScope.serverId}/banned/${tt}`), true);
    setServers((prev) => ({ ...prev, [activeScope.serverId]: { ...s, banned: { ...(s.banned || {}), [tt]: true } } }));
    flashToast("Kullanıcı sunucudan yasaklandı."); logActivity("server_ban", session.username, tt);
  };
  const kickUserFromServer = async (tt) => {
    if (!window.confirm(`${tt} kullanıcısını bu sunucudan çıkarmak istediğine emin misin? (Yasaklanmaz, tekrar davet linkiyle girebilir)`)) return;
    await remove(ref(db, `servers/${activeScope.serverId}/members/${tt}`));
    await remove(ref(db, `users/${tt}/joinedServers/${activeScope.serverId}`));
    setServers((prev) => {
      const nextMembers = { ...(prev[activeScope.serverId]?.members || {}) };
      delete nextMembers[tt];
      return { ...prev, [activeScope.serverId]: { ...prev[activeScope.serverId], members: nextMembers } };
    });
    flashToast("Kullanıcı sunucudan çıkarıldı."); logActivity("server_kick", session.username, tt);
  };
  const promote = async (tt, role) => { await set(ref(db, `roles/${tt}`), role); flashToast(`Yetki güncellendi: ${role}`); logActivity("promote", session.username, `${tt} -> ${role}`); };
  const revokeRole = (tt) => { remove(ref(db, `roles/${tt}`)); logActivity("revoke_role", session.username, tt); };
  const globalBan = async (tt) => {
    if (!window.confirm(`${tt} kullanıcısını TÜM SİTEDEN yasaklamak istediğine emin misin?`)) return;
    await set(ref(db, `globalBans/${tt}`), true);
    flashToast("Kullanıcı site genelinde yasaklandı."); logActivity("global_ban", session.username, tt);
  };
  const deleteRoom = async () => {
    if (!window.confirm("Bu odayı ve tüm mesaj geçmişini kalıcı olarak silmek istediğine emin misin? Bu işlem geri alınamaz.")) return;
    await remove(ref(db, `rooms/${activeScope.roomId}`));
    await remove(ref(db, `messages/${scopeKey(activeScope)}`));
    await remove(ref(db, `presence/${scopeKey(activeScope)}`));
    setRooms((prev) => { const cp = { ...prev }; delete cp[activeScope.roomId]; return cp; });
    logActivity("delete_room", session.username, activeScope.roomId);
    leaveView(); flashToast("Oda silindi.");
  };
  const copyInvite = (link) => { navigator.clipboard?.writeText(link); flashToast("Bağlantı kopyalandı."); };
  const [qrModalLink, setQrModalLink] = useState(null);

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
    await Promise.all(CHANNELS.map((c) => push(ref(db, `messages/global:${c.id}`), { type: "system", text: `📢 ${text}`, ts: Date.now() })));
    logActivity("broadcast", session.username, text);
    setBroadcastText(""); setBroadcastOpen(false);
    flashToast("Duyuru gönderildi.");
  };

  const openProfile = useCallback(async (username) => {
    const record = await safeGet(`users/${username.toLowerCase()}`);
    setProfileCard({ username: record?.username || username, avatarColor: record?.avatarColor, avatarShape: record?.avatarShape, createdAt: record?.createdAt, note: record?.note, bio: record?.bio, lastSeen: record?.lastSeen });
  }, []);

  const messageList = useMemo(() => {
    let list = Object.entries(messages).map(([id, m]) => ({ id, ...m })).filter((m) => Date.now() - m.ts < MSG_TTL_MS).sort((a, b) => a.ts - b.ts);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((m) => m.type === "system" || (m.text || "").toLowerCase().includes(q));
    }
    return list;
  }, [messages, searchQuery]);

  const pinnedMessage = pinnedId ? messageList.find((m) => m.id === pinnedId) || (messages[pinnedId] ? { id: pinnedId, ...messages[pinnedId] } : null) : null;

  useEffect(() => {
    if (!pendingMsgId) return;
    const found = messageList.find((m) => m.id === pendingMsgId);
    if (!found) return;
    const targetId = pendingMsgId;
    setPendingMsgId(null);
    requestAnimationFrame(() => {
      const el = document.getElementById(`msg-${targetId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightMsgId(targetId);
      setTimeout(() => setHighlightMsgId((cur) => (cur === targetId ? null : cur)), 2200);
    });
  }, [pendingMsgId, messageList]);
  const presenceList = Object.entries(presence).map(([u, p]) => ({ unameLower: u, ...p }));
  const typingUsers = presenceList.filter((p) => p.typing && p.unameLower !== usernameLower);
  const friendList = Object.keys(friends).sort((a, b) => (globalPresence[b] ? 1 : 0) - (globalPresence[a] ? 1 : 0));
  const hasUnread = (scope) => {
    const key = scopeKey(scope);
    const last = lastMessageMap[key];
    if (!last) return false;
    if (activeScope && scopeKey(activeScope) === key && view === "room") return false;
    return last > (myLastRead[key] || 0);
  };
  const UnreadDot = () => <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#39FF88", flexShrink: 0, marginLeft: "auto" }} />;

  const memberGroups = useMemo(() => {
    if (!activeServer) return [];
    const usernames = Object.keys(activeServer.members || {});
    const roleRank = { developer: 0, admin: 1, mod: 2 };
    const roleLabel = { developer: "Geliştirici", admin: "Admin", mod: "Moderatör" };
    const groups = {};
    usernames.forEach((u) => {
      const isOwner = activeServer.ownerUsername?.toLowerCase() === u;
      const role = roles[u];
      const groupKey = isOwner ? "owner" : role && roleRank[role] !== undefined ? role : "member";
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(u);
    });
    const order = ["owner", "developer", "admin", "mod", "member"];
    return order
      .filter((k) => groups[k])
      .map((k) => ({
        key: k,
        label: k === "owner" ? "Sunucu Sahibi" : k === "member" ? "Üye" : roleLabel[k],
        members: groups[k].sort((a, b) => (globalPresence[b] ? 1 : 0) - (globalPresence[a] ? 1 : 0)),
      }));
  }, [activeServer, roles, globalPresence]);


  const LangPicker = ({ inline }) => (
    <div style={{ position: "relative" }}>
      <button style={{ ...styles.ghostBtn, borderColor: T.border, color: T.text }} onClick={() => setLangMenuOpen((v) => !v)}><Globe size={14} /> {lang.toUpperCase()}</button>
      {langMenuOpen && (
        <div style={{ ...styles.langMenu, background: T.panel, borderColor: T.border }}>
          {LANGS.map((l) => (
            <button key={l.code} style={{ ...styles.langOption, color: l.code === lang ? "#39FF88" : T.text }} onClick={() => { setLang(l.code); setLangMenuOpen(false); setAuthForm((f) => ({ ...f, question: SECURITY_QUESTIONS_BY_LANG[l.code][0] })); }}>{l.label}</button>
          ))}
        </div>
      )}
    </div>
  );

  // ================= BOOT CHECK =================
  if (!authChecked) {
    return (
      <div style={{ ...styles.app, background: T.bg, color: T.text, alignItems: "center", justifyContent: "center" }}>
        <style>{globalCss}</style>
        <Radio size={30} color="#39FF88" style={{ animation: "pulse 1.4s infinite" }} />
      </div>
    );
  }

  // ================= AUTH SCREENS =================
  if (!session) {
    return (
      <div style={{ ...styles.app, background: T.bg, color: T.text }}>
        <style>{globalCss}</style>
        {!firebaseConnected && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 300, background: "#F2B705", color: "#1a1400", fontSize: 12.5, fontWeight: 600, textAlign: "center", padding: "6px 10px" }}>
            Bağlantı koptu, yeniden bağlanılıyor…
          </div>
        )}
        <div style={styles.authHeroBg}>
          <img src="https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=2000&auto=format&fit=crop" alt="" style={styles.authHeroImg} />
          <div style={styles.authHeroOverlay} />
        </div>
        <div style={styles.authTopbar}><div style={styles.authSecure}><ShieldCheck size={13} /> <span>DAGSx19 • Secure session</span></div><LangPicker /></div>
        <div style={styles.authGlow} />
        <div style={styles.authWrap}>
          <div style={styles.authBrand}>
            <div style={styles.authLogo}><DagsLogo size={24} /></div>
            <div><div style={styles.brandText}>DAGSx19</div><div style={styles.authBrandSub}>COMMUNITY • CHAT • CONNECT</div></div>
          </div>

          {authView === "landing" && (
            isMobile ? (
            <div className="authLandingMobile">
              <div className="authMobileBadge"><span className="authMobileDot" /> DAGSx19 COMMUNITY</div>

              <div className="authMobileLogo">
                <DagsLogo size={42} />
              </div>

              <div className="authMobileBrand">
                <span>DAGS<span>x19</span></span>
                <small>COMMUNITY • CHAT • CONNECT</small>
              </div>

              <h1 className="authMobileTitle">
                Arkadaşlarınla konuş.
                <span>Topluluğunu keşfet.</span>
              </h1>

              <p className="authMobileText">
                Sohbet et, arkadaşlarınla bağlantıda kal ve kendi topluluğunu oluştur.
              </p>

              <div className="authMobileActions">
                <button className="authMobilePrimary" onClick={() => { setAuthView("register"); setAuthError(""); }}>
                  <UserPlus size={19} />
                  <span>Hesap Oluştur</span>
                  <ArrowRight size={18} />
                </button>
                <button className="authMobileSecondary" onClick={() => { setAuthView("login"); setAuthError(""); }}>
                  <Lock size={18} />
                  <span>Giriş Yap</span>
                  <ArrowRight size={18} />
                </button>
              </div>

              <div className="authMobileFeatures">
                <div><ShieldCheck size={15} /><span>Güvenli</span></div>
                <div><Circle size={8} fill="#39FF88" color="#39FF88" /><span>Gerçek zamanlı</span></div>
                <div><Users size={15} /><span>Topluluk</span></div>
              </div>
            </div>
            ) : (
            <div className="authLandingDesktop" style={styles.authLanding}>
              <div style={styles.authLandingCopy}>
                <div style={styles.authLandingBadge}><span style={styles.authLandingDot} /> DAGSx19 COMMUNITY</div>
                <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 14 }}>
                  <DagsLogo size={34} />
                  <span style={{ fontSize: 19, fontWeight: 900, letterSpacing: .7, color: T.textStrong }}>DAGS<span style={{ color: "#39FF88" }}>x19</span></span>
                </div>
                <h1 style={{ ...styles.authLandingTitle, color: T.textStrong }}>Arkadaşlarınla konuş.<br /><span style={{ color: "#39FF88" }}>Topluluğunu keşfet.</span></h1>
                <p style={{ ...styles.authLandingText, color: T.textDim }}>Sohbet et, arkadaşlarınla bağlantıda kal ve kendi topluluğunu oluştur. DAGSx19, topluluk deneyimini tek bir yerde toplar.</p>

                <div style={styles.authLandingActions}>
                  <button style={styles.authLandingPrimary} onClick={() => { setAuthView("register"); setAuthError(""); }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 9 }}><UserPlus size={18} /><span>Hesap Oluştur</span></span>
                    <ArrowRight size={18} />
                  </button>
                  <button style={{ ...styles.authLandingSecondary, borderColor: T.border, color: T.textStrong, background: T.panel }} onClick={() => { setAuthView("login"); setAuthError(""); }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 9 }}><Lock size={17} /><span>Giriş Yap</span></span>
                    <ArrowRight size={18} color={T.textDim} />
                  </button>
                </div>

                <div style={styles.authLandingTrust}>
                  <span><ShieldCheck size={13} color="#39FF88" /> Güvenli oturum</span>
                  <span><Circle size={8} fill="#39FF88" color="#39FF88" /> Gerçek zamanlı</span>
                  <span><Users size={13} /> Topluluk odaklı</span>
                </div>
              </div>

              <div style={styles.authPreviewWrap}>
                <div style={{ ...styles.authPreviewGlow, background: "radial-gradient(circle, #39FF8830 0%, transparent 68%)" }} />
                <div style={{ ...styles.authPreview, background: "#0D1117F2", borderColor: "#39FF8830" }}>
                  <div style={styles.authPreviewTop}>
                    <div style={styles.authPreviewBrand}><DagsLogo size={22} /><b>DAGSx19</b></div>
                    <div style={styles.authPreviewTopIcons}><Search size={12} /><Bell size={12} /><Circle size={7} fill="#39FF88" color="#39FF88" /></div>
                  </div>
                  <div style={styles.authPreviewBody}>
                    <div style={styles.authPreviewSidebar}>
                      <div style={styles.authPreviewServer}><DagsLogo size={25} /></div>
                      <div style={{ ...styles.authPreviewServer, opacity: .45 }}><Users size={15} /></div>
                      <div style={{ ...styles.authPreviewServer, opacity: .3 }}><Plus size={15} /></div>
                    </div>
                    <div style={styles.authPreviewChannels}>
                      <div style={styles.authPreviewServerName}>DAGSx19</div>
                      <div style={styles.authPreviewChannelLabel}>KANALLAR</div>
                      <div style={styles.authPreviewChannelActive}><Hash size={11} /> genellikle</div>
                      <div style={styles.authPreviewChannel}><Hash size={11} /> sohbet</div>
                      <div style={styles.authPreviewChannel}><Hash size={11} /> duyuru</div>
                      <div style={styles.authPreviewUser}><span style={styles.authPreviewAvatar}>M</span><div><b>Mami</b><small>çevrimiçi</small></div><Circle size={7} fill="#39FF88" color="#39FF88" /></div>
                    </div>
                    <div style={styles.authPreviewChat}>
                      <div style={styles.authPreviewChatHead}><Hash size={13} color="#39FF88" /><b>genellikle</b><span>•</span><small>Genel sohbet</small></div>
                      <div style={styles.authPreviewMessages}>
                        <div style={styles.authPreviewMsg}><span style={styles.authPreviewMsgAvatar}>D</span><div><b>DAGSx19</b><small> bugün 20:41</small><p>Topluluğa hoş geldin 👋</p></div></div>
                        <div style={styles.authPreviewMsg}><span style={{ ...styles.authPreviewMsgAvatar, background: "#25352D" }}>M</span><div><b>Mami</b><small> bugün 20:42</small><p>Burada görüşürüz!</p></div></div>
                      </div>
                      <div style={styles.authPreviewInput}><span>genellikle kanalına mesaj gönder</span><Send size={11} color="#39FF88" /></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            )
          )}

          {authView === "login" && (
            <div style={{ ...styles.authCard, background: T.panel, borderColor: T.border }}>
              <div style={styles.authCardHead}><div><div style={{ ...styles.authEyebrow, color: "#39FF88" }}>WELCOME BACK</div><h2 style={{ ...styles.authTitle, color: T.textStrong }}>Hesabına giriş yap</h2><p style={{ ...styles.authSubtitle, color: T.textDim }}>Sohbete kaldığın yerden devam et.</p></div><div style={styles.authHeadIcon}><Lock size={17} /></div></div>
              <div style={styles.authField}><span style={{ ...styles.authFieldLabel, color: T.textDim }}>{t.username}</span><input style={{ ...styles.authInput, background: T.inputBg, borderColor: T.border, color: T.textStrong }} placeholder="kullanici_adi" autoComplete="username" value={authForm.username} onChange={(e) => setAuthForm({ ...authForm, username: e.target.value })} /></div>
              <div style={styles.authField}><span style={{ ...styles.authFieldLabel, color: T.textDim }}>{t.password}</span><input style={{ ...styles.authInput, background: T.inputBg, borderColor: T.border, color: T.textStrong }} placeholder="••••••••" type="password" autoComplete="current-password" value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} onKeyDown={(e) => e.key === "Enter" && submitLogin()} /></div>
              {authError && <div style={styles.authError}><AlertTriangle size={14} /> <span>{authError}</span></div>}
              <button style={styles.authPrimaryBtn} onClick={submitLogin}><span>{t.login}</span><ArrowLeft size={16} style={{ transform: "rotate(180deg)" }} /></button>
              <div style={styles.authDivider}><span>veya</span></div>
              <div style={styles.authSwitch}>Hesabın yok mu? <span style={styles.authLink} onClick={() => { setAuthView("register"); setAuthError(""); }}>Kayıt ol</span></div>
              <span style={{ ...styles.authForgot, color: T.textDim }} onClick={() => { setAuthView("recover"); setAuthError(""); setRecoverStep(1); }}>{t.forgotPw}</span>
            </div>
          )}

          {authView === "register" && (
            <div style={{ ...styles.authCard, background: T.panel, borderColor: T.border, maxWidth: 470 }}>
              <div style={styles.authCardHead}><div><div style={{ ...styles.authEyebrow, color: "#39FF88" }}>CREATE ACCOUNT</div><h2 style={{ ...styles.authTitle, color: T.textStrong }}>DAGSx19'a katıl</h2><p style={{ ...styles.authSubtitle, color: T.textDim }}>Dakikalar içinde kendi hesabını oluştur.</p></div><div style={styles.authHeadIcon}><UserPlus size={17} /></div></div>
              <div style={styles.authGrid2}>
                <div style={styles.authField}><span style={{ ...styles.authFieldLabel, color: T.textDim }}>{t.username}</span><input style={{ ...styles.authInput, background: T.inputBg, borderColor: T.border, color: T.textStrong }} placeholder="kullanici_adi" autoComplete="username" value={authForm.username} onChange={(e) => setAuthForm({ ...authForm, username: e.target.value })} /></div>
                <div style={styles.authField}><span style={{ ...styles.authFieldLabel, color: T.textDim }}>{t.password}</span><input style={{ ...styles.authInput, background: T.inputBg, borderColor: T.border, color: T.textStrong }} placeholder="••••••••" type="password" autoComplete="new-password" value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} /></div>
              </div>
              <div style={styles.authField}><span style={{ ...styles.authFieldLabel, color: T.textDim }}>{t.passwordAgain}</span><input style={{ ...styles.authInput, background: T.inputBg, borderColor: T.border, color: T.textStrong }} placeholder="Şifreni tekrar gir" type="password" autoComplete="new-password" value={authForm.confirm} onChange={(e) => setAuthForm({ ...authForm, confirm: e.target.value })} /></div>
              <div style={styles.authGrid2}>
                <div style={styles.authField}><span style={{ ...styles.authFieldLabel, color: T.textDim }}>Güvenlik sorusu</span><select style={{ ...styles.authInput, background: T.inputBg, borderColor: T.border, color: T.textStrong }} value={authForm.question} onChange={(e) => setAuthForm({ ...authForm, question: e.target.value })}>{securityQuestions.map((q) => <option key={q} value={q}>{q}</option>)}</select></div>
                <div style={styles.authField}><span style={{ ...styles.authFieldLabel, color: T.textDim }}>{t.securityAnswer}</span><input style={{ ...styles.authInput, background: T.inputBg, borderColor: T.border, color: T.textStrong }} placeholder="Cevabın" value={authForm.answer} onChange={(e) => setAuthForm({ ...authForm, answer: e.target.value })} /></div>
              </div>
              <div style={styles.authSection}><div style={styles.authSectionTitle}>Avatarını özelleştir</div><div style={styles.authAvatarLine}><div style={{ ...styles.authAvatarPreview, borderColor: pickColor, boxShadow: `0 0 24px ${pickColor}25` }}><AvatarBadge color={pickColor} shape={pickShape} size={48} /></div><div style={{ flex: 1 }}><div style={styles.colorRow}>{AVATAR_COLORS.map((c) => <button aria-label="Avatar rengi" key={c} onClick={() => setPickColor(c)} style={{ ...styles.colorSwatch, background: c, outline: pickColor === c ? "2px solid #fff" : "none", boxShadow: pickColor === c ? `0 0 0 3px ${c}33` : "none" }} />)}</div><div style={{ ...styles.colorRow, marginTop: 8 }}>{AVATAR_SHAPES.map((s) => <button aria-label="Avatar şekli" key={s.key} onClick={() => setPickShape(s.key)} style={{ ...styles.shapeSwatch, borderColor: pickShape === s.key ? pickColor : T.border }}><s.Icon size={16} color={pickColor} fill={pickShape === s.key ? pickColor : "none"} /></button>)}</div></div></div></div>
              <div style={styles.captchaRow}><span style={{ color: T.textStrong, fontSize: 12.5, fontWeight: 700 }}>{t.verification}: {captcha.a} + {captcha.b}</span><span style={{ color: T.textDim }}>=</span><input aria-label="Doğrulama sonucu" style={{ ...styles.captchaInput, background: T.inputBg, borderColor: T.border, color: T.textStrong }} value={authForm.captchaInput} onChange={(e) => setAuthForm({ ...authForm, captchaInput: e.target.value })} /></div>
              {authError && <div style={styles.authError}><AlertTriangle size={14} /> <span>{authError}</span></div>}
              <button style={styles.authPrimaryBtn} onClick={submitRegister}><span>{t.registerAndEnter}</span><UserPlus size={16} /></button>
              <div style={styles.authSwitch}>Zaten hesabın var mı? <span style={styles.authLink} onClick={() => { setAuthView("login"); setAuthError(""); }}>Giriş yap</span></div>
            </div>
          )}

          {authView === "recover" && (
            <div style={{ ...styles.authCard, background: T.panel, borderColor: T.border }}>
              <div style={styles.authCardHead}><div><div style={{ ...styles.authEyebrow, color: "#39FF88" }}>ACCOUNT RECOVERY</div><h2 style={{ ...styles.authTitle, color: T.textStrong }}>{t.recoverTitle}</h2><p style={{ ...styles.authSubtitle, color: T.textDim }}>Hesabına güvenli şekilde yeniden eriş.</p></div><div style={styles.authHeadIcon}><ShieldCheck size={17} /></div></div>
              {recoverStep === 1 && <><div style={styles.authField}><span style={{ ...styles.authFieldLabel, color: T.textDim }}>{t.username}</span><input style={{ ...styles.authInput, background: T.inputBg, borderColor: T.border, color: T.textStrong }} placeholder="kullanici_adi" value={authForm.username} onChange={(e) => setAuthForm({ ...authForm, username: e.target.value })} /></div><div style={styles.authField}><span style={{ ...styles.authFieldLabel, color: T.textDim }}>{t.securityAnswer}</span><input style={{ ...styles.authInput, background: T.inputBg, borderColor: T.border, color: T.textStrong }} placeholder="Güvenlik cevabın" value={recoverAnswer} onChange={(e) => setRecoverAnswer(e.target.value)} /></div>{authError && <div style={styles.authError}><AlertTriangle size={14} /> <span>{authError}</span></div>}<button style={styles.authPrimaryBtn} onClick={submitRecoverCheck}><span>{t.continueBtn}</span><ChevronRight size={16} /></button></>}
              {recoverStep === 2 && <><div style={styles.authField}><span style={{ ...styles.authFieldLabel, color: T.textDim }}>{t.newPassword}</span><input style={{ ...styles.authInput, background: T.inputBg, borderColor: T.border, color: T.textStrong }} placeholder="Yeni şifre" type="password" value={recoverNewPw} onChange={(e) => setRecoverNewPw(e.target.value)} /></div>{authError && <div style={styles.authError}><AlertTriangle size={14} /> <span>{authError}</span></div>}<button style={styles.authPrimaryBtn} onClick={submitRecoverReset}><span>{t.resetPassword}</span><Check size={16} /></button></>}
              <div style={styles.authSwitch}><span style={styles.authLink} onClick={() => { setAuthView("login"); setAuthError(""); }}>{t.backToLogin}</span></div>
            </div>
          )}
          <p style={{ ...styles.authNote, color: T.textDim }}><Shield size={12} style={{ verticalAlign: -2, marginRight: 4 }} />{t.privacyNote}</p>
        </div>
      </div>
    );
  }

  // ================= MAIN APP =================
  return (
    <div style={{ ...styles.app, background: T.bg, color: T.text }}>
      <style>{globalCss}</style>
      {toast && <div style={{ ...styles.toast, background: T.panel, borderColor: "#39FF8855", color: T.textStrong }}>{toast}</div>}
      {!firebaseConnected && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 300, background: "#F2B705", color: "#1a1400", fontSize: 12.5, fontWeight: 600, textAlign: "center", padding: "6px 10px", animation: "fadein .2s ease" }}>
          Bağlantı koptu, yeniden bağlanılıyor…
        </div>
      )}

      <header className="appHeader" style={{ ...styles.header, borderColor: T.border, background: T.headerBg }}>
        <div className="appBrand" style={styles.brand}><Radio size={20} color="#39FF88" style={{ animation: "pulse 2s infinite" }} /><span style={styles.brandText}>DAGSx19</span></div>
        <div className="appHeaderRight" style={styles.headerRight}>
          <LangPicker />
          <button style={{ ...styles.ghostBtn, borderColor: T.border, color: T.text }} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}</button>
          <button style={{ ...styles.ghostBtn, borderColor: T.border, color: T.text }} title={soundEnabled ? "Bildirim sesini kapat" : "Bildirim sesini aç"} onClick={() => setSoundEnabled((s) => !s)}>{soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}</button>
          <div style={{ position: "relative" }}>
            <button style={{ ...styles.ghostBtn, borderColor: T.border, color: T.text }} onClick={() => setRequestsModalOpen(true)}><Bell size={14} />{pendingRequestCount > 0 && <span style={styles.reportBadge}>{pendingRequestCount}</span>}</button>
          </div>
          {isDeveloper && (
            <>
              <button style={{ ...styles.ghostBtn, borderColor: T.border, color: T.text }} onClick={() => setBroadcastOpen(true)}><Megaphone size={14} /></button>
              <button style={{ ...styles.ghostBtn, borderColor: T.border, color: T.text }} onClick={() => setLogPanelOpen(true)}><ScrollText size={14} /></button>
              <button style={{ ...styles.ghostBtn, borderColor: T.border, color: T.text }} onClick={() => setReportsPanelOpen(true)}><Flag size={14} />{Object.keys(reports).length > 0 && <span style={styles.reportBadge}>{Object.keys(reports).length}</span>}</button>
            </>
          )}
          <button style={{ ...styles.ghostBtn, borderColor: T.border, color: T.text }} onClick={openSettings}><Settings size={14} /></button>
          <AvatarBadge color={session.avatarColor} shape={session.avatarShape} size={24} onClick={() => openProfile(session.username)} />
          <span style={{ ...styles.nickBadge, color: T.textStrong }}>{session.username}</span>
          {isDeveloper && <span style={styles.roleBadge}><Crown size={12} /></span>}
          <button style={{ ...styles.ghostBtn, borderColor: T.border, color: T.text }} onClick={logout}><LogOut size={14} /></button>
        </div>
      </header>

      <div className="appBody" style={styles.body}>
        <aside className="appSidebar"
  style={{
    ...styles.sidebar,
    background: T.panel,
    borderColor: T.border,
    color: T.text,
    ...(isMobile ? { display: view === "room" ? "none" : "flex", width: "100%", animation: view === "room" ? "none" : "slideInLeft .16s ease" } : {}),
  }}
>
          <div style={styles.sidebarSectionLabel}>{t.channels}</div>
{CHANNELS.map((c) => {
  const sc = { kind: "global", channelId: c.id };
  const active = activeScope && scopeKey(activeScope) === scopeKey(sc);

  return (
    <button
      key={c.id}
      style={{
        ...styles.channelBtn,
        color: active ? "#39FF88" : T.text,
        background: active
          ? (theme === "dark" ? "#39FF8818" : "#39FF8810")
          : "transparent",
        borderColor: active ? "#39FF8840" : "transparent",
      }}
      onClick={() => openScope(sc)}
    >
      <Hash size={15} />
      {c.name}
    </button>
  );
})}

          <div style={{ ...styles.sidebarSectionLabel, marginTop: 16 }}>{t.friends}</div>
          {friendList.length === 0 && <div style={styles.emptyNoteSmall}>{t.none}</div>}
          {friendList.map((f) => (
            <button key={f} style={{
  ...styles.channelBtn,
  color: T.text,
  alignItems: "center",
  background: "transparent",
}} onClick={() => openDmFromProfile(f)}>
              <AvatarBadge color="#39FF88" shape="circle" size={16} online={!!globalPresence[f]} />
              {f}
            </button>
          ))}

          <div style={{ ...styles.sidebarSectionLabel, marginTop: 16 }}>{t.myServers}</div>
          {Object.keys(servers).length === 0 && <div style={styles.emptyNoteSmall}>{t.none}</div>}
          {Object.entries(servers).map(([sid, s]) => (
            <div key={sid}>
              <button
  style={{
    ...styles.channelBtn,
    color: T.text,
    background: "transparent",
  }} onClick={() => setExpandedServers((p) => ({ ...p, [sid]: !p[sid] }))}>
                {expandedServers[sid] ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <ServerIcon name={s.name} iconUrl={s.iconUrl} size={20} rounded="30%" />
                {s.name}
              </button>
              {expandedServers[sid] && (
                <div style={{ paddingLeft: 18 }}>
                  {Object.entries(s.channels || {}).map(([cid, ch]) => {
                    const sc = { kind: "server", serverId: sid, channelId: cid };
                    const active = activeScope && scopeKey(activeScope) === scopeKey(sc);
                    const canManage = s.ownerUsername === session.username || isDeveloper;
                     return (
  <div key={cid} style={{ display: "flex", alignItems: "center", gap: 2 }}>
  <button
    style={{
      ...styles.channelBtn,
      flex: 1,
      color: active ? "#39FF88" : T.text,
      background: active
        ? (theme === "dark" ? "#39FF8818" : "#39FF8810")
        : "transparent",
      borderColor: active ? "#39FF8840" : "transparent",
      fontSize: 12.5,
    }}
    onClick={() => openScope(sc)}
  >
    <Hash size={13} />
    {ch.name}
    {hasUnread(sc) && <UnreadDot />}
  </button>
  {canManage && (
    <button
      title="Kanalı sil"
      style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, color: T.textDim, flexShrink: 0 }}
      onClick={(e) => { e.stopPropagation(); deleteChannelFromServer(sid, cid, ch.name); }}
    >
      <Trash2 size={12} />
    </button>
  )}
  </div>
);
                  })}
                  {(s.ownerUsername === session.username || isDeveloper) && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button style={{ ...styles.newRoomBtn, fontSize: 11.5, padding: "5px 9px" }} onClick={() => addChannelToServer(sid)}><Plus size={12} /> {t.addChannel}</button>
                      <button style={{ ...styles.newRoomBtn, fontSize: 11.5, padding: "5px 9px" }} onClick={() => updateServerIcon(sid)}><ImageIcon size={12} /> İkon değiştir</button>
                      <button style={{ ...styles.newRoomBtn, fontSize: 11.5, padding: "5px 9px" }} onClick={() => renameServer(sid)}><Pencil size={12} /> Adını değiştir</button>
                      <button style={{ ...styles.newRoomBtn, fontSize: 11.5, padding: "5px 9px" }} onClick={() => updateServerDescription(sid)}><ScrollText size={12} /> Açıklama</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          <div style={{ ...styles.sidebarSectionLabel, marginTop: 16 }}>{t.myRooms}</div>
          {Object.keys(rooms).length === 0 && <div style={styles.emptyNoteSmall}>{t.none}</div>}
          {Object.entries(rooms).map(([id, r]) => {
            const sc = { kind: "room", roomId: id };
            const active = activeScope && scopeKey(activeScope) === scopeKey(sc);
            const canManage = r.creatorUsername === session.username || isDeveloper;
            return (
              <div key={id} style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <button style={{ ...styles.channelBtn, flex: 1, color: active ? "#39FF88" : T.textDim, background: active ? "#39FF8815" : "transparent" }} onClick={() => openScope(sc)}><Lock size={13} />{r.name}{hasUnread(sc) && <UnreadDot />}</button>
                {canManage && <button title="Adını değiştir" style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, color: T.textDim, flexShrink: 0 }} onClick={(e) => { e.stopPropagation(); renameRoom(id); }}><Pencil size={12} /></button>}
              </div>
            );
          })}

          <div style={{ ...styles.sidebarSectionLabel, marginTop: 16 }}>{t.messages}</div>
          {Object.keys(dms).length === 0 && <div style={styles.emptyNoteSmall}>{t.none}</div>}
{Object.keys(dms).map((otherLower) => {
  const dmId = dmIdFor(usernameLower, otherLower);
  const sc = { kind: "dm", dmId, otherUser: otherLower };
  const active = activeScope && scopeKey(activeScope) === scopeKey(sc);

  return (
    <button
      key={otherLower}
      style={{
        ...styles.channelBtn,
        color: active ? "#39FF88" : T.text,
        background: active
          ? (theme === "dark" ? "#39FF8818" : "#39FF8810")
          : "transparent",
        borderColor: active ? "#39FF8840" : "transparent",
      }}
      onClick={() => openScope(sc)}
    >
      <MessageSquare size={13} />
      {otherLower}
      {hasUnread(sc) && <UnreadDot />}
    </button>
  );
})}
          <button style={styles.newRoomBtn} onClick={() => setDmModalOpen(true)}><Plus size={14} /> {t.newMessage}</button>
          <button style={{ ...styles.newRoomBtn, marginTop: 14 }} onClick={() => { setCreateModalOpen(true); setCreatedInvite(null); }}><Plus size={14} /> {t.createRoomOrServer}</button>
          <button style={{ ...styles.newRoomBtn, marginTop: 8 }} onClick={() => setDiscoverOpen(true)}><Search size={14} /> Sunucu keşfet</button>
        </aside>

        <main className="appMain" style={{ ...styles.mainArea, ...(isMobile ? { display: view === "room" ? "flex" : "none", width: "100%", animation: view === "room" ? "slideInRight .16s ease" : "none" } : {}) }}>
          {view === "landing" && (
            <div className="homeDashboard" style={{ ...styles.homeDashboard, color: T.text }}>
              <div style={{ ...styles.homeHero, borderColor: T.border, background: T.panel }}>
                <div style={styles.homeHeroGlow} />
                <div style={styles.homeHeroContent}>
                  <div style={{ ...styles.homeEyebrow, color: "#39FF88" }}><span style={styles.homeLiveDot} /> DAGSx19 • COMMUNITY</div>
                  <h1 style={{ ...styles.homeTitle, color: T.textStrong }}>Hoş geldin, <span style={{ color: "#39FF88" }}>{session.username}</span>.</h1>
                  <p style={{ ...styles.homeSubtitle, color: T.textDim }}>Sohbete devam et, arkadaşlarınla konuş veya yeni bir topluluk keşfet.</p>
                  <div style={styles.homeQuickActions}>
                    <button style={styles.homePrimaryAction} onClick={() => openScope({ kind: "global", channelId: CHANNELS[0].id })}><MessageSquare size={16} /> Sohbete başla</button>
                    <button style={{ ...styles.homeSecondaryAction, borderColor: T.border, background: T.inputBg, color: T.textStrong }} onClick={() => setCreateModalOpen(true)}><Plus size={16} /> Topluluk oluştur</button>
                  </div>
                </div>
                <div style={styles.homeHeroMark}><DagsLogo size={96} /></div>
              </div>

              <div style={styles.homeStatsGrid}>
                <div style={{ ...styles.homeStatCard, borderColor: T.border, background: T.panel }}><div style={styles.homeStatIcon}><Users size={17} /></div><div><strong style={{ color: T.textStrong }}>{friendList.length}</strong><span style={{ color: T.textDim }}>Arkadaş</span></div></div>
                <div style={{ ...styles.homeStatCard, borderColor: T.border, background: T.panel }}><div style={styles.homeStatIcon}><Server size={17} /></div><div><strong style={{ color: T.textStrong }}>{Object.keys(servers).length}</strong><span style={{ color: T.textDim }}>Sunucu</span></div></div>
                <div style={{ ...styles.homeStatCard, borderColor: T.border, background: T.panel }}><div style={styles.homeStatIcon}><Lock size={17} /></div><div><strong style={{ color: T.textStrong }}>{Object.keys(rooms).length}</strong><span style={{ color: T.textDim }}>Özel oda</span></div></div>
                <div style={{ ...styles.homeStatCard, borderColor: T.border, background: T.panel }}><div style={styles.homeStatIcon}><Circle size={17} fill="#39FF88" /></div><div><strong style={{ color: T.textStrong }}>{Object.keys(globalPresence).length}</strong><span style={{ color: T.textDim }}>Çevrimiçi</span></div></div>
              </div>

              <div style={styles.homeSectionGrid}>
                <div style={{ ...styles.homeInfoCard, borderColor: T.border, background: T.panel }}>
                  <div style={styles.homeInfoHead}><div style={styles.homeInfoIcon}><Hash size={16} /></div><div><strong style={{ color: T.textStrong }}>Genel kanallar</strong><span style={{ color: T.textDim }}>Herkese açık sohbet alanları</span></div></div>
                  <div style={styles.homeChannelList}>
                    {CHANNELS.map((c) => <button key={c.id} style={{ ...styles.homeChannelBtn, borderColor: T.border, color: T.text }} onClick={() => openScope({ kind: "global", channelId: c.id })}><Hash size={14} color="#39FF88" />{c.name}<ArrowRight size={13} color={T.textDim} /></button>)}
                  </div>
                </div>
                <div style={{ ...styles.homeInfoCard, borderColor: T.border, background: T.panel }}>
                  <div style={styles.homeInfoHead}><div style={styles.homeInfoIcon}><Search size={16} /></div><div><strong style={{ color: T.textStrong }}>Keşfet</strong><span style={{ color: T.textDim }}>Yeni topluluklara göz at</span></div></div>
                  <p style={{ ...styles.homeInfoText, color: T.textDim }}>Herkese açık sunucuları keşfet ve tek dokunuşla katıl.</p>
                  <button style={{ ...styles.homeExploreBtn, borderColor: T.border, color: T.textStrong, background: T.inputBg }} onClick={() => setDiscoverOpen(true)}><Search size={15} /> Sunucuları keşfet <ArrowRight size={14} /></button>
                </div>
              </div>

              <div style={{ ...styles.homeTip, borderColor: T.border, color: T.textDim }}><ShieldCheck size={14} color="#39FF88" /> İpucu: Mesajlarda <b style={{ color: T.text }}>Ctrl + K</b> ile aramayı, <b style={{ color: T.text }}>/</b> ile hızlıca yazmayı açabilirsin.</div>
            </div>
          )}

          {view === "room" && activeScope && (
            <>
              <div className="roomHeader" style={{ ...styles.roomHeader, borderColor: T.border }}>
                <div className="roomHeaderLeft" style={styles.roomHeaderLeft}>
                  {isMobile && <button style={{ ...styles.iconBtn, borderColor: T.border }} onClick={leaveView}><ArrowLeft size={15} /></button>}
                  {activeScope.kind === "global" && <Hash size={16} color="#39FF88" />}
                  {activeScope.kind === "room" && <Lock size={14} color={T.textDim} />}
                  {activeScope.kind === "server" && <ServerIcon name={activeServer?.name} iconUrl={activeServer?.iconUrl} size={22} rounded="30%" />}
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
                  {activeScope.kind === "room" && <button style={{ ...styles.iconBtn, borderColor: T.border }} onClick={() => copyInvite(`${window.location.origin}${window.location.pathname}?room=${activeScope.roomId}`)}><Link2 size={15} /></button>}
                  {activeScope.kind === "room" && <button style={{ ...styles.iconBtn, borderColor: T.border }} onClick={() => setQrModalLink(`${window.location.origin}${window.location.pathname}?room=${activeScope.roomId}`)}><QrCode size={15} /></button>}
                  {activeScope.kind === "server" && <button style={{ ...styles.iconBtn, borderColor: T.border }} onClick={() => copyInvite(`${window.location.origin}${window.location.pathname}?server=${activeScope.serverId}`)}><Link2 size={15} /></button>}
                  {activeScope.kind === "server" && <button style={{ ...styles.iconBtn, borderColor: T.border }} onClick={() => setQrModalLink(`${window.location.origin}${window.location.pathname}?server=${activeScope.serverId}`)}><QrCode size={15} /></button>}
                  {activeScope.kind === "server" && <button style={{ ...styles.iconBtn, borderColor: T.border }} onClick={() => setMemberListOpen(true)}><Users size={15} /></button>}
                  <button style={{ ...styles.iconBtn, borderColor: T.border }} onClick={() => setSearchOpen((s) => !s)}><Search size={15} /></button>
                  {((activeScope.kind === "room" && (isRoomStaff || isRoomOwner)) || (activeScope.kind === "server" && (isDeveloper || isServerOwner))) && (
                    <button style={{ ...styles.ghostBtn, borderColor: T.border, color: T.text }} onClick={() => setPanelOpen(true)}><ShieldCheck size={14} /></button>
                  )}
                </div>
              </div>

              {pinnedMessage && <div style={styles.pinnedBar}><Pin size={12} color="#39FF88" /><span style={{ fontWeight: 700, marginRight: 4 }}>{pinnedMessage.username}:</span><span>{pinnedMessage.text}</span></div>}

              {searchOpen && (
                <div style={{ ...styles.searchBar, borderColor: T.border, background: T.inputBg }}>
                  <Search size={14} color={T.textDim} />
                  <input ref={searchInputRef} style={{ ...styles.searchInput, color: T.textStrong }} placeholder={t.searchPlaceholder} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} autoFocus />
                  <X size={14} style={{ cursor: "pointer" }} onClick={() => { setSearchOpen(false); setSearchQuery(""); }} />
                </div>
              )}

              <div
                style={{
                  ...styles.messages,
                  animation: "fadein .18s ease",
                  ...(chatBackground?.type === "color" ? { background: chatBackground.value } : {}),
                  ...(chatBackground?.type === "image" ? { backgroundImage: `url(${chatBackground.value})`, backgroundSize: "cover", backgroundPosition: "center" } : {}),
                }}
                ref={scrollRef}
                key={scopeKey(activeScope)}
              >
                {messagesLoading ? (
                  <>
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} style={{ display: "flex", gap: 9, opacity: 0.5 - i * 0.08 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: T.border, flexShrink: 0, animation: "skeletonPulse 1.2s ease infinite" }} />
                        <div style={{ flex: 1, maxWidth: "60%", display: "flex", flexDirection: "column", gap: 6 }}>
                          <div style={{ width: `${40 + i * 8}%`, height: 10, borderRadius: 5, background: T.border, animation: "skeletonPulse 1.2s ease infinite" }} />
                          <div style={{ width: "100%", height: 34, borderRadius: 10, background: T.border, animation: "skeletonPulse 1.2s ease infinite" }} />
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    {messageList.length === 0 && <div style={{ ...styles.emptyNote, color: T.textDim }}>{t.noMessages}</div>}
                    {messageList.map((m) => {
                  const canModerate = (activeScope.kind === "room" && (isRoomStaff || isRoomOwner)) || (activeScope.kind === "server" && (isDeveloper || isServerOwner));
                  return (
                    <MessageRow
                      key={m.id}
                      m={m}
                      T={T}
                      sessionUsername={session.username}
                      usernameLower={usernameLower}
                      isPinned={pinnedId === m.id}
                      canModerate={canModerate}
                      isPickerOpen={reactionPickerFor === m.id}
                      onOpenProfile={openProfile}
                      onTogglePin={togglePin}
                      onReport={reportMessage}
                      onDelete={deleteMessage}
                      onToggleReaction={toggleReaction}
                      onTogglePicker={toggleReactionPicker}
                      onSelectEmoji={selectEmojiReaction}
                      onReply={setReplyTo}
                      onCopyLink={copyMessageLink}
                      isHighlighted={highlightMsgId === m.id}
                    />
                  );
                })}
                  </>
                )}
                {typingUsers.length > 0 && <div style={styles.typingRow}>{typingUsers.map((tt) => tt.username).join(", ")} {t.typing}</div>}
              </div>

              {replyTo && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 16px", borderTop: `1px solid ${T.border}`, background: T.inputBg, fontSize: 12.5, color: T.textDim }}>
                  <CornerUpLeft size={13} style={{ flexShrink: 0, color: "#39FF88" }} />
                  <span style={{ fontWeight: 700, color: T.text }}>{replyTo.username}</span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{replyTo.text}</span>
                  <X size={14} style={{ cursor: "pointer", flexShrink: 0 }} onClick={() => setReplyTo(null)} />
                </div>
              )}
              <div style={{ ...styles.inputRow, borderColor: T.border }}>
                <input ref={chatInputRef} style={{ ...styles.chatInput, background: T.inputBg, borderColor: T.border }} placeholder={rateLimited ? t.wait : t.messagePlaceholder} value={input} onChange={(e) => handleTyping(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMessage()} maxLength={500} disabled={rateLimited} />
                <button style={styles.sendBtn} onClick={sendMessage} disabled={rateLimited}><Send size={16} /></button>
              </div>
            </>
          )}
        </main>
      </div>

      {createModalOpen && (
        <div style={styles.overlay} onClick={() => { setCreateModalOpen(false); setCreatedInvite(null); }}>
          <div style={{ ...styles.modal, background: T.panel, borderColor: T.border }} onClick={(e) => e.stopPropagation()}>
            <div style={{ ...styles.modalHead, color: T.textStrong }}><span>{createdInvite ? "✓" : t.createRoomOrServer}</span><X size={16} style={{ cursor: "pointer" }} onClick={() => { setCreateModalOpen(false); setCreatedInvite(null); }} /></div>
            {!createdInvite ? (
              <>
                <div style={styles.tabRow}>
                  <button style={{ ...styles.tabBtn, ...(createTab === "room" ? styles.tabBtnActive : {}) }} onClick={() => setCreateTab("room")}>{t.createRoom}</button>
                  <button style={{ ...styles.tabBtn, ...(createTab === "server" ? styles.tabBtnActive : {}) }} onClick={() => setCreateTab("server")}>{t.createServer}</button>
                </div>
                {createTab === "room" ? (
                  <>
                    <input style={{ ...styles.input, background: T.inputBg, borderColor: T.border, color: T.textStrong }} placeholder={t.roomName} value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} />
                    <input style={{ ...styles.input, background: T.inputBg, borderColor: T.border, color: T.textStrong }} placeholder={t.roomPassword} type="password" value={newRoomPassword} onChange={(e) => setNewRoomPassword(e.target.value)} />
                    <p style={{ ...styles.modalNote, color: T.textDim }}><AlertTriangle size={12} style={{ verticalAlign: -2, marginRight: 4 }} />{t.roomHint}</p>
                    <button style={styles.primaryBtn} onClick={createRoom}>{t.create}</button>
                  </>
                ) : (
                  <>
                    <input style={{ ...styles.input, background: T.inputBg, borderColor: T.border, color: T.textStrong }} placeholder={t.serverName} value={newServerName} onChange={(e) => setNewServerName(e.target.value)} />
                    <input style={{ ...styles.input, background: T.inputBg, borderColor: T.border, color: T.textStrong }} placeholder="Sunucu ikonu (resim linki, opsiyonel)" value={newServerIconUrl} onChange={(e) => setNewServerIconUrl(e.target.value)} />
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: T.textDim, cursor: "pointer" }}>
                      <input type="checkbox" checked={newServerPublic} onChange={(e) => setNewServerPublic(e.target.checked)} />
                      Herkese açık — Keşfet listesinde görünsün
                    </label>
                    {newServerName.trim() && <div style={{ display: "flex", justifyContent: "center" }}><ServerIcon name={newServerName} iconUrl={newServerIconUrl.trim()} size={48} /></div>}
                    <p style={{ ...styles.modalNote, color: T.textDim }}>{t.serverHint}</p>
                    <button style={styles.primaryBtn} onClick={createServer}>{t.createServerBtn}</button>
                  </>
                )}
              </>
            ) : (
              <>
                <p style={{ ...styles.modalNote, color: T.textDim }}>{createdInvite.type === "room" ? t.createdInviteRoom : t.createdInviteServer}</p>
                <div style={{ ...styles.inviteBox, background: T.inputBg, borderColor: T.border }}>
                  <span style={styles.inviteLink}>{createdInvite.link}</span>
                  <button style={styles.iconBtnSmall} onClick={() => copyInvite(createdInvite.link)}><Copy size={13} /></button>
                  <button style={styles.iconBtnSmall} onClick={() => setQrModalLink(createdInvite.link)}><QrCode size={13} /></button>
                </div>
                <button style={styles.primaryBtn} onClick={finishCreateAndEnter}>{t.enter}</button>
              </>
            )}
          </div>
        </div>
      )}

      {joinModal && (
        <div style={styles.overlay} onClick={() => setJoinModal(null)}>
          <div style={{ ...styles.modal, background: T.panel, borderColor: T.border }} onClick={(e) => e.stopPropagation()}>
            <div style={{ ...styles.modalHead, color: T.textStrong }}><span>"{joinModal.room.name}"</span><X size={16} style={{ cursor: "pointer" }} onClick={() => setJoinModal(null)} /></div>
            <input style={{ ...styles.input, background: T.inputBg, borderColor: T.border, color: T.textStrong }} placeholder={t.password} type="password" value={joinPasswordInput} onChange={(e) => setJoinPasswordInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && confirmJoinPrivate()} autoFocus />
            {joinError && <span style={styles.errorText}>{joinError}</span>}
            <button style={styles.primaryBtn} onClick={confirmJoinPrivate}>{t.join}</button>
          </div>
        </div>
      )}

      {dmModalOpen && (
        <div style={styles.overlay} onClick={() => setDmModalOpen(false)}>
          <div style={{ ...styles.modal, background: T.panel, borderColor: T.border }} onClick={(e) => e.stopPropagation()}>
            <div style={{ ...styles.modalHead, color: T.textStrong }}><span>{t.newMessage}</span><X size={16} style={{ cursor: "pointer" }} onClick={() => setDmModalOpen(false)} /></div>
            <input style={{ ...styles.input, background: T.inputBg, borderColor: T.border, color: T.textStrong }} placeholder={t.username} value={dmTargetInput} onChange={(e) => setDmTargetInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && startDm()} autoFocus />
            <button style={styles.primaryBtn} onClick={startDm}>{t.sendMessageBtn}</button>
          </div>
        </div>
      )}

      {qrModalLink && (
        <div style={styles.overlay} onClick={() => setQrModalLink(null)}>
          <div style={{ ...styles.modal, background: T.panel, borderColor: T.border, maxWidth: 300, alignItems: "center", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ ...styles.modalHead, color: T.textStrong, width: "100%" }}><span><QrCode size={15} style={{ marginRight: 6, verticalAlign: -2 }} />Davet QR kodu</span><X size={16} style={{ cursor: "pointer" }} onClick={() => setQrModalLink(null)} /></div>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrModalLink)}`}
              alt="QR kod"
              width={220}
              height={220}
              style={{ borderRadius: 10, background: "#fff", padding: 8 }}
            />
            <p style={{ fontSize: 11, color: T.textDim, wordBreak: "break-all" }}>{qrModalLink}</p>
            <button style={styles.primaryBtn} onClick={() => copyInvite(qrModalLink)}><Copy size={13} style={{ marginRight: 6 }} />Linki kopyala</button>
          </div>
        </div>
      )}

      {discoverOpen && (
        <div style={styles.overlay} onClick={() => setDiscoverOpen(false)}>
          <div style={{ ...styles.modal, background: T.panel, borderColor: T.border, maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ ...styles.modalHead, color: T.textStrong }}><span><Search size={15} style={{ marginRight: 6, verticalAlign: -2 }} />Sunucu keşfet</span><X size={16} style={{ cursor: "pointer" }} onClick={() => setDiscoverOpen(false)} /></div>
            <div style={styles.panelList}>
              {Object.keys(publicServers).length === 0 && <span style={styles.emptyNote}>Henüz herkese açık sunucu yok.</span>}
              {Object.entries(publicServers).map(([id, s]) => (
                <div key={id} style={{ ...styles.panelRow, background: T.inputBg, borderColor: T.border, flexDirection: "column", alignItems: "stretch", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <ServerIcon name={s.name} iconUrl={s.iconUrl} size={30} />
                      <span style={styles.panelNick}>{s.name}</span>
                    </div>
                    {servers[id] ? <span style={{ fontSize: 11, color: "#39FF88" }}>Üyesin</span> : <button style={styles.iconBtnSmall} onClick={() => joinPublicServer(id)}>{t.join}</button>}
                  </div>
                  {s.description && <p style={{ fontSize: 11.5, color: T.textDim, margin: 0, paddingLeft: 38 }}>{s.description}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {memberListOpen && activeServer && (
        <div style={styles.overlay} onClick={() => setMemberListOpen(false)}>
          <div style={{ ...styles.modal, background: T.panel, borderColor: T.border, maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ ...styles.modalHead, color: T.textStrong }}>
              <span><Users size={15} style={{ marginRight: 6, verticalAlign: -2 }} />Üyeler ({Object.keys(activeServer.members || {}).length})</span>
              <X size={16} style={{ cursor: "pointer" }} onClick={() => setMemberListOpen(false)} />
            </div>
            <div style={{ ...styles.panelList, maxHeight: 420 }}>
              {memberGroups.map((group) => (
                <div key={group.key}>
                  <div style={styles.panelSectionLabel}>{group.label} — {group.members.length}</div>
                  {group.members.map((u) => {
                    const profile = memberProfiles[u];
                    const online = !!globalPresence[u];
                    return (
                      <div key={u} style={{ ...styles.panelRow, background: T.inputBg, borderColor: T.border, cursor: "pointer" }} onClick={() => { setMemberListOpen(false); openProfile(profile?.username || u); }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <AvatarBadge color={profile?.avatarColor || "#39FF88"} shape={profile?.avatarShape || "circle"} size={24} online={online} />
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            <span style={styles.panelNick}>{profile?.username || u}</span>
                            {!online && profile?.lastSeen && <span style={{ fontSize: 10, color: T.textDim }}>{formatLastSeen(profile.lastSeen)}</span>}
                          </div>
                        </div>
                        {group.key === "owner" && <Crown size={13} color="#39FF88" />}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div style={styles.overlay} onClick={() => setSettingsOpen(false)}>
          <div style={{ ...styles.modal, background: T.panel, borderColor: T.border }} onClick={(e) => e.stopPropagation()}>
            <div style={{ ...styles.modalHead, color: T.textStrong }}><span><Settings size={15} style={{ marginRight: 6, verticalAlign: -2 }} />{t.profileSettings}</span><X size={16} style={{ cursor: "pointer" }} onClick={() => setSettingsOpen(false)} /></div>
            <div style={styles.avatarPickLabel}>{t.avatarColor}</div>
            <div style={styles.colorRow}>{AVATAR_COLORS.map((c) => <button key={c} onClick={() => setPickColor(c)} style={{ ...styles.colorSwatch, background: c, outline: pickColor === c ? "2px solid #fff" : "none" }} />)}</div>
            <div style={styles.avatarPickLabel}>{t.avatarShape}</div>
            <div style={styles.colorRow}>{AVATAR_SHAPES.map((s) => <button key={s.key} onClick={() => setPickShape(s.key)} style={{ ...styles.shapeSwatch, borderColor: pickShape === s.key ? pickColor : T.border }}><s.Icon size={16} color={pickColor} fill={pickShape === s.key ? pickColor : "none"} /></button>)}</div>
            <div style={{ display: "flex", justifyContent: "center" }}><AvatarBadge color={pickColor} shape={pickShape} size={40} /></div>
            <div style={styles.avatarPickLabel}>{t.note}</div>
            <input style={{ ...styles.input, background: T.inputBg, borderColor: T.border, color: T.textStrong }} value={settingsForm.note} maxLength={100} onChange={(e) => setSettingsForm({ ...settingsForm, note: e.target.value })} />
            <div style={styles.avatarPickLabel}>Hakkımda</div>
            <textarea style={{ ...styles.input, minHeight: 64, resize: "vertical" }} value={settingsForm.bio} maxLength={300} placeholder="Kendinden kısaca bahset..." onChange={(e) => setSettingsForm({ ...settingsForm, bio: e.target.value })} />
            <div style={styles.avatarPickLabel}>Sohbet arka planı</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {CHAT_BG_PRESETS.map((p) => {
                const isActive = p.type === "none" ? !chatBackground : chatBackground?.type === "color" && chatBackground?.value === p.value;
                return (
                  <button
                    key={p.label}
                    title={p.label}
                    onClick={() => setChatBackgroundPref(p.type === "none" ? null : { type: "color", value: p.value })}
                    style={{
                      width: 30, height: 30, borderRadius: 8, cursor: "pointer",
                      background: p.type === "none" ? T.inputBg : p.value,
                      border: isActive ? "2px solid #39FF88" : `1px solid ${T.border}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    {p.type === "none" && <X size={13} color={T.textDim} />}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                style={{ ...styles.input, flex: 1 }}
                placeholder="Resim linki (opsiyonel)"
                value={chatBackground?.type === "image" ? chatBackground.value : ""}
                onChange={(e) => setChatBackgroundPref(e.target.value.trim() ? { type: "image", value: e.target.value.trim() } : null)}
              />
            </div>
            <div style={styles.avatarPickLabel}>{t.changePassword}</div>
            <input style={{ ...styles.input, background: T.inputBg, borderColor: T.border, color: T.textStrong }} placeholder={t.currentPassword} type="password" value={settingsForm.currentPassword} onChange={(e) => setSettingsForm({ ...settingsForm, currentPassword: e.target.value })} />
            <input style={{ ...styles.input, background: T.inputBg, borderColor: T.border, color: T.textStrong }} placeholder={t.newPassword} type="password" value={settingsForm.newPassword} onChange={(e) => setSettingsForm({ ...settingsForm, newPassword: e.target.value })} />
            {settingsError && <span style={styles.errorText}>{settingsError}</span>}
            <button style={styles.primaryBtn} onClick={saveSettings}>{t.saveBtn}</button>
            <button style={styles.dangerBtn} onClick={deleteAccount}><Trash2 size={14} /> {t.deleteAccountBtn}</button>
          </div>
        </div>
      )}

      {requestsModalOpen && (
        <div style={styles.overlay} onClick={() => setRequestsModalOpen(false)}>
          <div style={{ ...styles.modal, background: T.panel, borderColor: T.border }} onClick={(e) => e.stopPropagation()}>
            <div style={{ ...styles.modalHead, color: T.textStrong }}><span><Bell size={15} style={{ marginRight: 6, verticalAlign: -2 }} />{t.friendRequests}</span><X size={16} style={{ cursor: "pointer" }} onClick={() => setRequestsModalOpen(false)} /></div>
            <div style={styles.panelList}>
              {Object.keys(friendRequests).length === 0 && <span style={styles.emptyNote}>{t.noRequests}</span>}
              {Object.entries(friendRequests).map(([fromLower, req]) => (
                <div key={fromLower} style={{ ...styles.panelRow, background: T.inputBg, borderColor: T.border }}>
                  <span style={styles.panelNick}>{req.from}</span>
                  <div style={styles.panelActions}>
                    <button style={styles.iconBtnSmall} onClick={() => acceptFriendRequest(fromLower)}><Check size={13} color="#39FF88" /></button>
                    <button style={styles.iconBtnSmall} onClick={() => declineFriendRequest(fromLower)}><X size={13} color="#F27171" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {profileCard && (
        <div style={styles.overlay} onClick={() => setProfileCard(null)}>
          <div style={{ ...styles.modal, background: T.panel, borderColor: T.border, alignItems: "center", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
            <AvatarBadge color={profileCard.avatarColor || "#39FF88"} shape={profileCard.avatarShape || "circle"} size={54} />
            <div style={{ fontSize: 16, fontWeight: 700, color: T.textStrong }}>{profileCard.username}</div>
            <div style={{ fontSize: 11.5, color: globalPresence[profileCard.username.toLowerCase()] ? "#39FF88" : T.textDim, display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: globalPresence[profileCard.username.toLowerCase()] ? "#39FF88" : "#4b5560" }} />
              {globalPresence[profileCard.username.toLowerCase()] ? "Çevrimiçi" : profileCard.lastSeen ? `Son görülme: ${formatLastSeen(profileCard.lastSeen)}` : "Çevrimdışı"}
            </div>
            {profileCard.note && <div style={{ fontSize: 12.5, color: T.textDim, fontStyle: "italic" }}>"{profileCard.note}"</div>}
            {profileCard.bio && <div style={{ fontSize: 12.5, color: T.text, maxWidth: 280, lineHeight: 1.5 }}>{profileCard.bio}</div>}
{profileCard.username === session.username ? (
  <button style={styles.primaryBtn} onClick={openSettings}>
    <Settings size={13} style={{ marginRight: 4 }} />
    {t.profileSettings}
  </button>
) : (
  <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap", justifyContent: "center" }}>
    <button
      style={styles.primaryBtn}
      onClick={() => openDmFromProfile(profileCard.username)}
    >
      <MessageSquare size={13} style={{ marginRight: 4 }} />
      {t.sendMessageBtn}
    </button>
    {friends[profileCard.username.toLowerCase()] ? (
      <span style={{ fontSize: 12, color: "#39FF88", alignSelf: "center" }}>{t.alreadyFriends}</span>
    ) : (
      <button style={{ ...styles.ghostBtn, borderColor: T.border, color: T.text }} onClick={() => sendFriendRequest(profileCard.username)}><UserPlus size={13} /> {t.addFriend}</button>
    )}
    {isDeveloper && <button style={styles.dangerBtnSmall} onClick={() => globalBan(profileCard.username.toLowerCase())}><Ban size={13} /> {t.globalBanBtn}</button>}
  </div>
)}
            <button style={{ ...styles.ghostBtn, borderColor: T.border, color: T.text, marginTop: 4 }} onClick={() => setProfileCard(null)}>{t.close}</button>
          </div>
        </div>
      )}

      {broadcastOpen && (
        <div style={styles.overlay} onClick={() => setBroadcastOpen(false)}>
          <div style={{ ...styles.modal, background: T.panel, borderColor: T.border }} onClick={(e) => e.stopPropagation()}>
            <div style={{ ...styles.modalHead, color: T.textStrong }}><span><Megaphone size={15} style={{ marginRight: 6, verticalAlign: -2 }} />{t.broadcastTitle}</span><X size={16} style={{ cursor: "pointer" }} onClick={() => setBroadcastOpen(false)} /></div>
            <p style={{ ...styles.modalNote, color: T.textDim }}>{t.broadcastHint}</p>
            <textarea style={{ ...styles.input, minHeight: 80 }} value={broadcastText} onChange={(e) => setBroadcastText(e.target.value)} />
            <button style={styles.primaryBtn} onClick={sendBroadcast}>{t.send}</button>
          </div>
        </div>
      )}

      {logPanelOpen && (
        <div style={styles.overlay} onClick={() => setLogPanelOpen(false)}>
          <div style={{ ...styles.modal, background: T.panel, borderColor: T.border, maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ ...styles.modalHead, color: T.textStrong }}><span><ScrollText size={15} style={{ marginRight: 6, verticalAlign: -2 }} />{t.activityLogTitle}</span><X size={16} style={{ cursor: "pointer" }} onClick={() => setLogPanelOpen(false)} /></div>
            <div style={{ display: "flex", gap: 10, fontSize: 12, color: T.textDim }}>
              <span>Toplam kullanıcı: <b style={{ color: T.textStrong }}>{totalUsers}</b></span>
              <span>Şu an aktif: <b style={{ color: "#39FF88" }}>{Object.keys(globalPresence).length}</b></span>
            </div>
            <div style={styles.panelList}>
              {activityLog.length === 0 && <span style={styles.emptyNote}>{t.noLog}</span>}
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
            <div style={{ ...styles.modalHead, color: T.textStrong }}><span><Flag size={15} style={{ marginRight: 6, verticalAlign: -2 }} />{t.reportsTitle}</span><X size={16} style={{ cursor: "pointer" }} onClick={() => setReportsPanelOpen(false)} /></div>
            <div style={styles.panelList}>
              {Object.keys(reports).length === 0 && <span style={styles.emptyNote}>{t.noReports}</span>}
              {Object.entries(reports).map(([id, r]) => (
                <div key={id} style={{ ...styles.panelRow, background: T.inputBg, borderColor: T.border, flexDirection: "column", alignItems: "flex-start" }}>
                  <span style={{ fontSize: 11.5, color: T.textStrong }}>{r.msgAuthor}: "{r.msgText}"</span>
                  <span style={{ fontSize: 11, color: T.textDim }}>{r.reporterUsername} — {r.reason}</span>
                  <button style={{ ...styles.iconBtnSmall, marginTop: 4 }} onClick={() => remove(ref(db, `reports/${id}`))}>{t.close}</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {panelOpen && activeScope && (
        <div style={styles.overlay} onClick={() => setPanelOpen(false)}>
          <div style={{ ...styles.modal, background: T.panel, borderColor: T.border, maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ ...styles.modalHead, color: T.textStrong }}><span><ShieldCheck size={15} style={{ marginRight: 6, verticalAlign: -2 }} />{t.managementPanel}</span><X size={16} style={{ cursor: "pointer" }} onClick={() => setPanelOpen(false)} /></div>
            <div style={styles.panelSectionLabel}>{t.activePanel} ({presenceList.length})</div>
            <div style={styles.panelList}>
              {presenceList.length === 0 && <span style={styles.emptyNote}>—</span>}
              {presenceList.map((p) => (
                <div key={p.unameLower} style={{ ...styles.panelRow, background: T.inputBg, borderColor: T.border }}>
                  <span style={styles.panelNick}>{p.username} {roles[p.unameLower] && <span style={styles.roleTag}>{roles[p.unameLower]}</span>}</span>
                  <div style={styles.panelActions}>
                    {activeScope.kind === "room" && (<><button style={styles.iconBtnSmall} onClick={() => toggleMute(p.unameLower)}>{activeRoom?.muted?.[p.unameLower] ? "🔇" : "🔊"}</button><button title="Odadan çıkar" style={styles.iconBtnSmall} onClick={() => kickUserFromRoom(p.unameLower)}><UserMinus size={13} /></button><button title="Yasakla" style={styles.iconBtnSmall} onClick={() => banUserFromRoom(p.unameLower)}><Ban size={13} /></button></>)}
                    {activeScope.kind === "server" && (isDeveloper || isServerOwner) && <button title="Sunucudan çıkar" style={styles.iconBtnSmall} onClick={() => kickUserFromServer(p.unameLower)}><UserMinus size={13} /></button>}
                    {activeScope.kind === "server" && (isDeveloper || isServerOwner) && <button title="Yasakla" style={styles.iconBtnSmall} onClick={() => banUserFromServer(p.unameLower)}><Ban size={13} /></button>}
                    {isDeveloper && p.unameLower !== usernameLower && <button style={styles.iconBtnSmall} onClick={() => (roles[p.unameLower] ? revokeRole(p.unameLower) : promote(p.unameLower, "admin"))}><Crown size={13} /></button>}
                  </div>
                </div>
              ))}
            </div>
            {activeScope.kind === "room" && activeRoom?.banned && Object.keys(activeRoom.banned).length > 0 && (
              <>
                <div style={styles.panelSectionLabel}>{t.banned}</div>
                <div style={styles.panelList}>
                  {Object.keys(activeRoom.banned).map((u) => (
                    <div key={u} style={{ ...styles.panelRow, background: T.inputBg, borderColor: T.border }}><span style={styles.panelNick}>{u}</span><button style={styles.iconBtnSmall} onClick={() => unbanUserFromRoom(u)}><UserX size={13} /></button></div>
                  ))}
                </div>
              </>
            )}
            {activeScope.kind === "room" && (isDeveloper || isRoomOwner) && <button style={styles.dangerBtn} onClick={deleteRoom}><Trash2 size={14} /> {t.deleteRoomBtn}</button>}
          </div>
        </div>
      )}
    </div>
  );
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    console.error("DAGSx19 crash:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, background: "#0A0C10", color: "#C9D1D9", fontFamily: "'Inter', sans-serif", padding: 24, textAlign: "center" }}>
          <Radio size={30} color="#39FF88" />
          <div style={{ fontSize: 16, fontWeight: 700, color: "#E6EDF3" }}>Bir şeyler ters gitti</div>
          <p style={{ fontSize: 13, color: "#8b949e", maxWidth: 320 }}>Beklenmedik bir hata oluştu. Sayfayı yenilemeyi dener misin?</p>
          <button
            onClick={() => window.location.reload()}
            style={{ background: "#39FF88", color: "#0A0C10", border: "none", padding: "10px 20px", borderRadius: 8, fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}
          >
            Sayfayı yenile
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}

const globalCss = `
  @keyframes pulse {
    0%,100% { opacity: 1; }
    50% { opacity: .35; }
  }

  @keyframes fadein {
    from {
      opacity: 0;
      transform: translateY(5px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes overlayIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes modalIn {
    from { opacity: 0; transform: translateY(10px) scale(.97); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  @keyframes highlightFlash {
    0% { background: rgba(57,255,136,.22); }
    100% { background: transparent; }
  }

  @keyframes skeletonPulse {
    0%, 100% { opacity: .35; }
    50% { opacity: .7; }
  }

  @keyframes slideInRight {
    from { opacity: 0; transform: translateX(14px); }
    to { opacity: 1; transform: translateX(0); }
  }

  @keyframes slideInLeft {
    from { opacity: 0; transform: translateX(-14px); }
    to { opacity: 1; transform: translateX(0); }
  }

  button {
    transition: background .12s ease, color .12s ease, border-color .12s ease, transform .08s ease;
  }
  button:active {
    transform: scale(0.96);
  }

  * {
    box-sizing: border-box;
  }

  html,
  body,
  #root {
    width: 100%;
    height: 100%;
    margin: 0;
  }

  body {
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  button,
  input,
  textarea {
    font: inherit;
  }

  button {
    -webkit-tap-highlight-color: transparent;
  }

  html, body {
    overscroll-behavior-y: contain;
  }

  button, a {
    touch-action: manipulation;
  }

  input, textarea, select {
    font-size: 16px;
  }

  aside, main, .messages, [data-scroll] {
    -webkit-overflow-scrolling: touch;
  }

  input::placeholder,
  textarea::placeholder {
    color: #5c6572;
    opacity: .8;
  }

  ::selection {
    background: #39FF8844;
  }

  * {
    scrollbar-width: thin;
    scrollbar-color: #39FF8830 transparent;
  }

  *::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  *::-webkit-scrollbar-track {
    background: transparent;
  }

  *::-webkit-scrollbar-thumb {
    background: #39FF8830;
    border-radius: 999px;
  }

  *::-webkit-scrollbar-thumb:hover {
    background: #39FF8860;
  }

  button:hover {
    filter: brightness(1.08);
  }

  button:active {
    transform: translateY(1px);
  }

  input:focus,
  textarea:focus {
    border-color: #39FF8870 !important;
    box-shadow: 0 0 0 3px #39FF8812;
  }

  [style*="animation"] {
    animation-fill-mode: both;
  }

  /* ================= MOBILE / PHONE LAYOUT ================= */
  @media (max-width: 720px) {
    html, body, #root {
      width: 100%;
      max-width: 100%;
      overflow: hidden;
    }

    /* Auth landing: tek kolon, ekran genişliğini asla aşma */
    .authWrap {
      width: 100%;
      max-width: 100%;
      padding: 66px 12px 18px !important;
      gap: 14px !important;
      overflow-x: hidden !important;
    }
    .authBrand {
      transform: scale(.92);
      transform-origin: center;
    }
    .authLanding {
      width: 100% !important;
      max-width: 100% !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 18px !important;
      align-items: center !important;
      text-align: center !important;
    }
    .authLandingCopy {
      width: 100% !important;
      max-width: 460px !important;
      min-width: 0 !important;
    }
    .authLandingTitle {
      font-size: clamp(30px, 9.5vw, 44px) !important;
      line-height: 1.04 !important;
      letter-spacing: -1.8px !important;
      margin: 14px 0 9px !important;
    }
    .authLandingText {
      width: 100% !important;
      max-width: 420px !important;
      font-size: 12px !important;
      line-height: 1.55 !important;
    }
    .authLandingActions {
      width: 100% !important;
      max-width: 420px !important;
      grid-template-columns: 1fr !important;
      margin-top: 18px !important;
    }
    .authLandingPrimary, .authLandingSecondary {
      width: 100% !important;
      min-height: 46px !important;
    }
    .authLandingTrust {
      width: 100%;
      justify-content: center !important;
      gap: 8px 11px !important;
      font-size: 9.5px !important;
    }
    .authPreviewWrap {
      width: 100% !important;
      max-width: 460px !important;
      min-width: 0 !important;
    }
    .authPreview {
      width: 100% !important;
      max-width: 100% !important;
      transform: none !important;
      border-radius: 14px !important;
    }
    .authPreviewBody {
      grid-template-columns: 34px 82px minmax(0, 1fr) !important;
      min-height: 205px !important;
    }
    .authPreviewTop {
      height: 38px !important;
      padding: 0 9px !important;
    }
    .authPreviewSidebar {
      padding-top: 9px !important;
      gap: 6px !important;
    }
    .authPreviewServer {
      width: 25px !important;
      height: 25px !important;
      border-radius: 8px !important;
    }
    .authPreviewChannels {
      padding: 9px 4px !important;
      min-width: 0 !important;
    }
    .authPreviewServerName {
      margin: 0 4px 10px !important;
      font-size: 9px !important;
    }
    .authPreviewChannelLabel {
      font-size: 6.5px !important;
      margin: 0 4px 4px !important;
    }
    .authPreviewChannel, .authPreviewChannelActive {
      gap: 4px !important;
      padding: 5px 4px !important;
      font-size: 7.5px !important;
      white-space: nowrap;
      overflow: hidden;
    }
    .authPreviewUser {
      margin-top: 26px !important;
      padding: 5px 3px !important;
      gap: 3px !important;
      font-size: 7px !important;
      min-width: 0 !important;
    }
    .authPreviewUserAvatar {
      width: 18px !important;
      height: 18px !important;
      flex-shrink: 0;
    }
    .authPreviewChat {
      min-width: 0 !important;
    }
    .authPreviewChatHead {
      height: 35px !important;
      padding: 0 7px !important;
      gap: 4px !important;
      font-size: 7.5px !important;
      white-space: nowrap;
      overflow: hidden;
    }
    .authPreviewMessages {
      padding: 10px 7px !important;
      gap: 9px !important;
      min-width: 0 !important;
    }
    .authPreviewMsg {
      gap: 5px !important;
      font-size: 7px !important;
      min-width: 0 !important;
    }
    .authPreviewMsgAvatar {
      width: 19px !important;
      height: 19px !important;
      border-radius: 6px !important;
      flex-shrink: 0;
    }
    .authPreviewMsg p {
      margin: 2px 0 0 !important;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .authPreviewInput {
      margin: 0 7px 7px !important;
      min-height: 25px !important;
      padding: 0 7px !important;
      font-size: 6.5px !important;
      min-width: 0 !important;
    }
    .authNote {
      max-width: 420px;
      text-align: center;
      font-size: 9px !important;
      line-height: 1.45;
    }

    /* Main app */
    header {
      min-height: 52px !important;
      height: auto !important;
      padding: 7px 9px !important;
      flex-wrap: nowrap !important;
      gap: 6px !important;
    }
    header .brand {
      flex: 0 0 auto;
    }
    header .brandText {
      font-size: 12px !important;
      letter-spacing: 1.3px !important;
    }
    header .headerRight {
      flex: 1 1 auto;
      min-width: 0;
      justify-content: flex-end;
      flex-wrap: nowrap !important;
      gap: 4px !important;
      overflow: hidden;
    }
    header .headerRight > * {
      flex-shrink: 0;
    }
    header .headerRight > .nickBadge,
    header .headerRight > .roleBadge {
      display: none !important;
    }
    header .ghostBtn {
      min-width: 32px !important;
      width: 32px !important;
      height: 32px !important;
      min-height: 32px !important;
      padding: 0 !important;
      border-radius: 8px !important;
    }
    header .headerRight > button[title],
    header .headerRight button {
      font-size: 0 !important;
    }
    header .headerRight button svg {
      width: 14px !important;
      height: 14px !important;
    }

    .body {
      width: 100% !important;
      max-width: 100% !important;
      min-width: 0 !important;
      height: calc(100dvh - 52px) !important;
    }
    .sidebar {
      width: 100% !important;
      max-width: 100% !important;
      min-width: 0 !important;
      padding: 10px 8px !important;
      overflow-x: hidden !important;
    }
    .mainArea {
      width: 100% !important;
      max-width: 100% !important;
      min-width: 0 !important;
      overflow: hidden !important;
    }
    .homeDashboard {
      width: 100% !important;
      max-width: 100% !important;
      padding: 14px 10px 24px !important;
      overflow-x: hidden !important;
    }
    .homeHero {
      min-height: 0 !important;
      padding: 22px 17px !important;
      border-radius: 16px !important;
    }
    .homeHeroMark {
      right: 8px !important;
      bottom: -10px !important;
      transform: scale(.65) rotate(-7deg) !important;
    }
    .homeTitle {
      font-size: clamp(25px, 8vw, 34px) !important;
      letter-spacing: -1px !important;
      max-width: 100%;
      overflow-wrap: anywhere;
    }
    .homeSubtitle {
      font-size: 12px !important;
      max-width: 100% !important;
    }
    .homeQuickActions {
      display: grid !important;
      grid-template-columns: 1fr !important;
      width: 100% !important;
    }
    .homePrimaryAction, .homeSecondaryAction {
      width: 100% !important;
      justify-content: center !important;
    }
    .homeStatsGrid {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 8px !important;
    }
    .homeStatCard {
      min-width: 0 !important;
      min-height: 66px !important;
      padding: 10px !important;
    }
    .homeSectionGrid {
      grid-template-columns: 1fr !important;
      gap: 9px !important;
    }
    .homeInfoCard {
      min-width: 0 !important;
      padding: 13px !important;
    }
    .homeTip {
      font-size: 9.5px !important;
    }

    .roomHeader {
      min-width: 0 !important;
      padding: 8px 9px !important;
      gap: 7px !important;
    }
    .roomHeaderLeft {
      min-width: 0 !important;
      flex: 1 1 auto;
      overflow: hidden;
    }
    .roomTitle {
      min-width: 0 !important;
      max-width: calc(100vw - 105px) !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      white-space: nowrap !important;
      font-size: 12.5px !important;
    }

    /* Mesajlar telefonda yatay taşmasın */
    main, main > *, [style*="overflow"] {
      max-width: 100%;
    }
    textarea, input {
      max-width: 100%;
    }
  }

  @media (max-width: 700px) {
    body {
      overflow: hidden;
    }

    /* Header sıkışmasın */
    header {
      padding-left: 11px !important;
      padding-right: 11px !important;
    }

    /* Mesaj alanı */
    main {
      min-width: 0;
    }
  }

  /* ================= MOBILE AUTH LANDING ================= */
  /* Görünürlük artık JS (isMobile) ile seçiliyor; burada sadece düzen tanımlanır. */
  .authLandingDesktop { display: grid; }

  @media (max-width: 720px) {
    .authLandingMobile {
      width: 100%;
      min-height: calc(100dvh - 150px);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 12px 22px 24px;
      box-sizing: border-box;
      animation: authCardIn .32s ease;
    }
    .authMobileBadge {
      display: inline-flex; align-items: center; gap: 7px; padding: 7px 11px;
      border: 1px solid #39FF8830; border-radius: 999px; background: #39FF880A;
      color: #8b949e; font-size: 9px; font-weight: 800; letter-spacing: 1px;
    }
    .authMobileDot { width: 6px; height: 6px; border-radius: 50%; background: #39FF88; box-shadow: 0 0 12px #39FF88; }
    .authMobileLogo {
      width: 72px; height: 72px; margin-top: 22px; display: flex; align-items: center; justify-content: center;
      border-radius: 22px; background: linear-gradient(145deg,#39FF8820,#39FF8808);
      border: 1px solid #39FF8845; box-shadow: 0 0 45px #39FF8818, inset 0 0 24px #39FF8808;
    }
    .authMobileBrand { display: flex; flex-direction: column; align-items: center; margin-top: 11px; }
    .authMobileBrand > span { color:#F0F6FC; font-size:21px; font-weight:900; letter-spacing:.5px; }
    .authMobileBrand > span span { color:#39FF88; }
    .authMobileBrand small { margin-top:3px; color:#69727e; font-size:7px; font-weight:700; letter-spacing:1.4px; }
    .authMobileTitle { max-width:360px; margin:22px 0 0; color:#F0F6FC; font-size:clamp(34px,10.5vw,44px); line-height:1; letter-spacing:-2px; font-weight:950; }
    .authMobileTitle span { display:block; margin-top:5px; color:#39FF88; }
    .authMobileText { max-width:330px; margin:13px 0 0; color:#8b949e; font-size:12px; line-height:1.5; }
    .authMobileActions { width:100%; max-width:360px; display:grid; gap:9px; margin-top:20px; }
    .authMobileActions button { width:100%; min-height:52px; box-sizing:border-box; border-radius:13px; display:flex; align-items:center; gap:10px; padding:0 15px; font-size:13.5px; font-weight:850; cursor:pointer; }
    .authMobileActions button span { flex:1; text-align:left; }
    .authMobilePrimary { border:1px solid #39FF88; background:#39FF88; color:#07100b; box-shadow:0 10px 35px #39FF8818; }
    .authMobileSecondary { border:1px solid #ffffff16; background:#11161d; color:#F0F6FC; }
    .authMobileFeatures { width:100%; max-width:350px; display:grid; grid-template-columns:repeat(3,1fr); gap:5px; margin-top:20px; }
    .authMobileFeatures div { min-width:0; display:flex; align-items:center; justify-content:center; gap:5px; color:#69727e; font-size:8.5px; white-space:nowrap; }
    .authMobileFeatures svg { color:#39FF88; flex-shrink:0; }
  }

  @media (max-width: 700px) and (max-height: 720px) {
    .authMobileLogo { width:58px; height:58px; margin-top:12px; border-radius:18px; }
    .authMobileLogo svg { width:34px; height:34px; }
    .authMobileBrand { margin-top:7px; }
    .authMobileTitle { margin-top:14px; font-size:31px; }
    .authMobileText { margin-top:8px; font-size:11px; }
    .authMobileActions { margin-top:13px; }
    .authMobileActions button { min-height:46px; }
    .authMobileFeatures { margin-top:11px; }
  }

  @media (max-width: 900px) {
    .authLanding { grid-template-columns: 1fr !important; gap: 28px !important; text-align: center !important; max-width: 760px !important; }
    .authLandingCopy { display: flex; flex-direction: column; align-items: center; }
    .authPreview { transform: none !important; }
    .authPreviewWrap { max-width: 620px; }
  }

  @media (max-width: 520px) {
    .authLanding { gap: 20px !important; }
    .authLandingTitle { font-size: clamp(34px, 11vw, 48px) !important; letter-spacing: -2px !important; }
    .authLandingText { font-size: 12.5px !important; }
    .authLandingActions { grid-template-columns: 1fr !important; max-width: 360px !important; }
    .authLandingTrust { justify-content: center; gap: 9px 12px; }
    .authPreviewBody { grid-template-columns: 38px 92px 1fr; min-height: 250px; }
    .authPreviewChannels { padding: 10px 5px; }
    .authPreviewUser { margin-top: 45px; }
    .authPreviewMsg p { margin-bottom: 0 !important; }

    header {
      min-height: 54px !important;
    }

    /* Uzun kullanıcı adları mobilde taşmasın */
    header > div {
      min-width: 0;
    }

    /* Kanal isimleri */
    aside button {
      font-size: 12.5px !important;
    }
  }
`;

const darkPalette = { bg: "#0A0C10", panel: "#12161D", inputBg: "#0F1319", border: "#1B2028", text: "#C9D1D9", textStrong: "#E6EDF3", textDim: "#5c6572", headerBg: "#0A0C10CC", link: "#4FD1C5", mention: "#8fb4b0" };
const lightPalette = { bg: "#F4F6F8", panel: "#FFFFFF", inputBg: "#F0F2F5", border: "#D8DEE4", text: "#2A2F36", textStrong: "#12161D", textDim: "#6b7280", headerBg: "#FFFFFFCC", link: "#0E7C86", mention: "#1f6f5c" };

const styles = {
  app: {
    minHeight: "100dvh",
    height: "100dvh",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    display: "flex",
    flexDirection: "column",
    position: "relative",
    overflow: "hidden",
    WebkitFontSmoothing: "antialiased",
    paddingTop: "env(safe-area-inset-top)",
    paddingBottom: "env(safe-area-inset-bottom)",
    paddingLeft: "env(safe-area-inset-left)",
    paddingRight: "env(safe-area-inset-right)",
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 16px",
    minHeight: 58,
    borderBottom: "1px solid",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    zIndex: 10,
    flexWrap: "wrap",
    gap: 8,
    boxShadow: "0 1px 0 rgba(57,255,136,.04)",
  },

  brand: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    minWidth: 0,
  },

  brandText: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontWeight: 800,
    letterSpacing: 2,
    fontSize: 15,
    color: "#39FF88",
    textShadow: "0 0 18px rgba(57,255,136,.18)",
    whiteSpace: "nowrap",
  },

  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    flexWrap: "wrap",
  },

  nickBadge: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 12,
    opacity: 0.9,
  },

  roleBadge: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontSize: 11,
    padding: "5px 8px",
    borderRadius: 8,
    fontWeight: 700,
    background: "#39FF8814",
    color: "#39FF88",
    border: "1px solid #39FF8828",
  },

  reportBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    background: "#F27171",
    color: "#fff",
    fontSize: 9,
    borderRadius: 10,
    padding: "2px 5px",
    fontWeight: 700,
    boxShadow: "0 2px 8px rgba(242,113,113,.25)",
  },

  ghostBtn: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    background: "transparent",
    border: "1px solid currentColor",
    padding: "7px 10px",
    minHeight: 34,
    borderRadius: 9,
    fontSize: 12,
    cursor: "pointer",
    transition: "all .18s ease",
  },

  langMenu: {
    position: "absolute",
    top: "calc(100% + 8px)",
    right: 0,
    border: "1px solid currentColor",
    borderRadius: 10,
    padding: 5,
    display: "flex",
    flexDirection: "column",
    zIndex: 50,
    minWidth: 80,
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    boxShadow: "0 14px 35px rgba(0,0,0,.28)",
  },

  langOption: {
    background: "transparent",
    border: "none",
    padding: "8px 10px",
    fontSize: 12,
    cursor: "pointer",
    textAlign: "left",
    borderRadius: 7,
    transition: "background .15s ease",
  },

  body: {
    flex: 1,
    display: "flex",
    overflow: "hidden",
    height: "calc(100dvh - 58px)",
    minHeight: 0,
  },

  sidebar: {
  width: 220,
  borderRight: "1px solid",
  padding: "14px 10px",
  display: "flex",
  flexDirection: "column",
  gap: 5,
  overflowY: "auto",
  flexShrink: 0,
  minHeight: 0,
  scrollbarWidth: "thin",
  background: "transparent",
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
},
sidebarSectionLabel: {
  fontSize: "10px",
  textTransform: "uppercase",
  letterSpacing: 1.2,
  color: "#6b7280",
  fontWeight: 800,
  padding: "9px 9px 6px",
},

  channelBtn: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    background: "transparent",
    border: "1px solid transparent",
    padding: "9px 10px",
    borderRadius: 9,
    fontSize: 13.5,
    cursor: "pointer",
    textAlign: "left",
    width: "100%",
    minHeight: 38,
    transition: "background .16s ease, border-color .16s ease, transform .16s ease",
  },

  emptyNoteSmall: {
    fontSize: 11.5,
    color: "#4b5560",
    padding: "2px 9px 6px",
  },

  newRoomBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    background: "#39FF8808",
    border: "1px dashed #39FF8855",
    color: "#39FF88",
    padding: "9px 10px",
    borderRadius: 9,
    fontSize: 12.5,
    cursor: "pointer",
    marginTop: 9,
    transition: "all .18s ease",
  },

  mainArea: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    minHeight: 0,
    overflow: "hidden",
  },

  landingHint: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    fontSize: 13.5,
    textAlign: "center",
    padding: 24,
  },

  homeDashboard: {
    width: "100%",
    maxWidth: 980,
    margin: "0 auto",
    padding: "34px clamp(16px, 4vw, 44px) 42px",
    overflowY: "auto",
    minHeight: 0,
    animation: "fadein .24s ease",
  },
  homeHero: {
    position: "relative",
    overflow: "hidden",
    minHeight: 235,
    border: "1px solid",
    borderRadius: 22,
    padding: "34px clamp(22px, 5vw, 44px)",
    display: "flex",
    alignItems: "center",
    boxShadow: "0 24px 70px rgba(0,0,0,.20)",
  },
  homeHeroGlow: {
    position: "absolute",
    width: 330,
    height: 330,
    borderRadius: "50%",
    right: -80,
    top: -90,
    background: "radial-gradient(circle, #39FF8820 0%, transparent 68%)",
    pointerEvents: "none",
  },
  homeHeroContent: { position: "relative", zIndex: 2, maxWidth: 650 },
  homeEyebrow: { display: "flex", alignItems: "center", gap: 7, fontSize: 9.5, fontWeight: 900, letterSpacing: "1.5px" },
  homeLiveDot: { width: 6, height: 6, borderRadius: "50%", background: "#39FF88", boxShadow: "0 0 12px #39FF88", animation: "pulse 1.8s infinite" },
  homeTitle: { margin: "11px 0 8px", fontSize: "clamp(27px, 4vw, 43px)", lineHeight: 1.08, letterSpacing: "-1.5px", fontWeight: 900 },
  homeSubtitle: { margin: 0, maxWidth: 580, fontSize: 13.5, lineHeight: 1.65 },
  homeQuickActions: { display: "flex", gap: 9, flexWrap: "wrap", marginTop: 21 },
  homePrimaryAction: { minHeight: 42, border: "1px solid #39FF88", borderRadius: 10, padding: "0 14px", background: "#39FF88", color: "#07100b", display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 850, cursor: "pointer", boxShadow: "0 8px 28px #39FF8818" },
  homeSecondaryAction: { minHeight: 42, border: "1px solid", borderRadius: 10, padding: "0 14px", display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 800, cursor: "pointer" },
  homeHeroMark: { position: "absolute", right: "clamp(24px, 7vw, 76px)", bottom: -3, opacity: .14, transform: "rotate(-7deg)", pointerEvents: "none" },
  homeStatsGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 12 },
  homeStatCard: { minHeight: 76, border: "1px solid", borderRadius: 14, padding: "12px 14px", display: "flex", alignItems: "center", gap: 11 },
  homeStatIcon: { width: 34, height: 34, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "#39FF88", background: "#39FF880C", border: "1px solid #39FF8820" },
  "homeStatCard strong": { display: "block", fontSize: 18, lineHeight: 1.1 },
  "homeStatCard span": { display: "block", marginTop: 4, fontSize: 10.5 },
  homeSectionGrid: { display: "grid", gridTemplateColumns: "1.25fr .75fr", gap: 12, marginTop: 12 },
  homeInfoCard: { border: "1px solid", borderRadius: 16, padding: 16 },
  homeInfoHead: { display: "flex", alignItems: "center", gap: 10, marginBottom: 13 },
  homeInfoIcon: { width: 32, height: 32, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", color: "#39FF88", background: "#39FF880C", border: "1px solid #39FF8820" },
  "homeInfoHead strong": { display: "block", fontSize: 12.5, fontWeight: 850 },
  "homeInfoHead span": { display: "block", fontSize: 10.5, marginTop: 3 },
  homeChannelList: { display: "grid", gap: 7 },
  homeChannelBtn: { minHeight: 38, border: "1px solid", borderRadius: 9, background: "transparent", display: "flex", alignItems: "center", gap: 7, padding: "0 10px", fontSize: 12, cursor: "pointer", textAlign: "left" },
  "homeChannelBtn svg:last-child": { marginLeft: "auto" },
  homeInfoText: { fontSize: 12, lineHeight: 1.65, margin: "4px 0 16px" },
  homeExploreBtn: { width: "100%", minHeight: 40, border: "1px solid", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, fontSize: 12, fontWeight: 800, cursor: "pointer" },
  homeTip: { marginTop: 12, minHeight: 40, border: "1px solid", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "8px 12px", fontSize: 10.5, textAlign: "center" },

  roomHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "11px 18px",
    minHeight: 54,
    borderBottom: "1px solid",
    flexWrap: "wrap",
    gap: 8,
  },

  roomHeaderLeft: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    minWidth: 0,
  },

  roomTitle: {
    fontWeight: 750,
    fontSize: 14.5,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  presenceCount: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontSize: 12,
    color: "#5c6572",
    marginLeft: 3,
    whiteSpace: "nowrap",
  },

  iconBtn: {
    background: "transparent",
    border: "1px solid currentColor",
    padding: 7,
    minWidth: 34,
    minHeight: 34,
    borderRadius: 9,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all .16s ease",
  },

  pinnedBar: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    padding: "7px 18px",
    background: "#39FF8809",
    borderBottom: "1px solid #39FF8812",
    fontSize: 12,
    color: "#39FF88",
  },

  searchBar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 18px",
    borderBottom: "1px solid",
    minHeight: 45,
  },

  searchInput: {
    flex: 1,
    background: "transparent",
    border: "none",
    fontSize: 16,
    outline: "none",
    minWidth: 0,
  },

  messages: {
    flex: 1,
    overflowY: "auto",
    padding: "18px 20px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    minHeight: 0,
    scrollbarWidth: "thin",
  },

  systemMsg: {
    textAlign: "center",
    fontSize: 11.5,
    color: "#5c6572",
    fontStyle: "italic",
    margin: "5px 0",
    opacity: 0.9,
  },

  msgRow: {
    display: "flex",
    gap: 9,
    minWidth: 0,
  },

  msgBubble: {
    border: "1px solid",
    borderRadius: 12,
    padding: "9px 13px",
    maxWidth: "min(82%, 760px)",
    minWidth: 0,
    boxShadow: "0 3px 12px rgba(0,0,0,.08)",
    transition: "border-color .16s ease, box-shadow .16s ease",
  },

  msgHead: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
    minWidth: 0,
  },

  msgNick: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 11.5,
    fontWeight: 750,
  },

  msgTime: {
    fontSize: 10.5,
    opacity: 0.55,
  },

  msgIconBtn: {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 3,
    borderRadius: 6,
    transition: "background .15s ease",
  },

  msgText: {
    fontSize: 14,
    lineHeight: 1.55,
    wordBreak: "break-word",
    overflowWrap: "anywhere",
  },

  linkText: {
    textDecoration: "underline",
    textUnderlineOffset: 2,
    cursor: "pointer",
  },

  sharedImage: {
    maxWidth: "100%",
    maxHeight: 280,
    borderRadius: 10,
    marginTop: 7,
    cursor: "pointer",
    display: "block",
    objectFit: "cover",
  },

  reactionRow: {
    display: "flex",
    gap: 5,
    marginTop: 7,
    flexWrap: "wrap",
  },

  reactionBtn: {
    background: "transparent",
    border: "1px solid currentColor",
    borderRadius: 999,
    padding: "3px 8px",
    minHeight: 25,
    fontSize: 11.5,
    cursor: "pointer",
    transition: "all .15s ease",
  },

  typingRow: {
    fontSize: 11.5,
    color: "#5c6572",
    fontStyle: "italic",
    paddingLeft: 4,
    minHeight: 18,
  },

  emptyNote: {
    fontSize: 13,
    padding: "10px 0",
    color: "#5c6572",
  },

  inputRow: {
    display: "flex",
    gap: 8,
    padding: "10px 16px 14px",
    borderTop: "1px solid",
    alignItems: "stretch",
  },

  chatInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    border: "1px solid",
    color: "inherit",
    background: "transparent",
    padding: "11px 14px",
    borderRadius: 11,
    fontSize: 16,
    outline: "none",
    transition: "border-color .18s ease, box-shadow .18s ease",
  },

  sendBtn: {
    background: "#39FF88",
    border: "none",
    color: "#0A0C10",
    padding: "0 16px",
    minWidth: 46,
    minHeight: 44,
    borderRadius: 11,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
    boxShadow: "0 0 18px rgba(57,255,136,.12)",
    transition: "transform .15s ease, box-shadow .15s ease",
  },

  input: {
    border: "1px solid",
    background: "transparent",
    color: "inherit",
    padding: "11px 13px",
    minHeight: 44,
    borderRadius: 9,
    fontSize: 16,
    outline: "none",
    width: "100%",
    transition: "border-color .18s ease, box-shadow .18s ease",
  },

  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,.68)",
    backdropFilter: "blur(5px)",
    WebkitBackdropFilter: "blur(5px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    padding: 16,
    animation: "overlayIn .15s ease",
  },

  modal: {
    border: "1px solid",
    borderRadius: 17,
    padding: 21,
    width: "100%",
    maxWidth: 420,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    maxHeight: "85vh",
    overflowY: "auto",
    boxShadow: "0 24px 70px rgba(0,0,0,.38)",
    animation: "modalIn .18s cubic-bezier(.2,.9,.3,1)",
  },

  modalHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontWeight: 750,
    fontSize: 14.5,
    gap: 10,
  },

  modalNote: {
    fontSize: 12,
    lineHeight: 1.55,
    margin: 0,
    opacity: 0.78,
  },

  tabRow: {
    display: "flex",
    gap: 6,
    padding: 3,
    borderRadius: 10,
  },

  tabBtn: {
    flex: 1,
    background: "transparent",
    border: "1px solid currentColor",
    color: "inherit",
    padding: "9px 8px",
    minHeight: 38,
    borderRadius: 8,
    fontSize: 12.5,
    cursor: "pointer",
    opacity: 0.7,
    transition: "all .16s ease",
  },

  tabBtnActive: {
    borderColor: "#39FF88",
    color: "#39FF88",
    opacity: 1,
    background: "#39FF880A",
  },

  errorText: {
    color: "#F27171",
    fontSize: 12,
    lineHeight: 1.4,
  },

  captchaRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },

  captchaInput: {
    width: 68,
    border: "1px solid",
    background: "transparent",
    color: "inherit",
    padding: "8px 10px",
    minHeight: 44,
    borderRadius: 8,
    fontSize: 16,
    outline: "none",
  },

  inviteBox: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    border: "1px solid",
    borderRadius: 9,
    padding: "10px 12px",
    background: "#39FF8806",
  },

  inviteLink: {
    flex: 1,
    minWidth: 0,
    fontSize: 11.5,
    color: "#39FF88",
    wordBreak: "break-all",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    lineHeight: 1.4,
  },

  panelSectionLabel: {
    fontSize: 10.5,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: "#5c6572",
    fontWeight: 800,
    marginTop: 6,
  },

  panelList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    maxHeight: 240,
    overflowY: "auto",
    paddingRight: 2,
  },

  panelRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    border: "1px solid",
    padding: "8px 10px",
    borderRadius: 9,
    minHeight: 40,
  },

  panelNick: {
    fontSize: 12.5,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  roleTag: {
    fontSize: 10,
    color: "#39FF88",
    marginLeft: 6,
    fontWeight: 700,
  },

  panelActions: {
    display: "flex",
    gap: 4,
    flexShrink: 0,
  },

  iconBtnSmall: {
    background: "transparent",
    border: "1px solid currentColor",
    borderRadius: 7,
    padding: "5px 7px",
    minHeight: 30,
    cursor: "pointer",
    fontSize: 12,
    color: "inherit",
    opacity: 0.8,
    transition: "all .15s ease",
  },

  dangerBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    background: "#F271710B",
    border: "1px solid #F2717138",
    color: "#F27171",
    padding: "10px",
    minHeight: 40,
    borderRadius: 9,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 700,
    marginTop: 4,
    transition: "all .16s ease",
  },

  dangerBtnSmall: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    background: "#F271710B",
    border: "1px solid #F2717138",
    color: "#F27171",
    padding: "7px 11px",
    minHeight: 32,
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 700,
    transition: "all .16s ease",
  },

  toast: {
    position: "fixed",
    bottom: 20,
    left: "50%",
    transform: "translateX(-50%)",
    border: "1px solid",
    padding: "10px 18px",
    borderRadius: 10,
    fontSize: 13,
    zIndex: 200,
    maxWidth: "calc(100vw - 32px)",
    textAlign: "center",
    boxShadow: "0 12px 35px rgba(0,0,0,.28)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
  },

  primaryBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    background: "#39FF88",
    color: "#0A0C10",
    border: "none",
    padding: "11px 15px",
    minHeight: 42,
    borderRadius: 9,
    fontWeight: 800,
    fontSize: 13.5,
    cursor: "pointer",
    boxShadow: "0 0 18px rgba(57,255,136,.10)",
    transition: "transform .15s ease, box-shadow .15s ease",
  },

  authTopbar: { position: "fixed", top: 0, left: 0, right: 0, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", zIndex: 5 },
  authSecure: { display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, color: "#7d8590", letterSpacing: ".4px", textTransform: "uppercase" },
  authGlow: { position: "fixed", width: 520, height: 520, borderRadius: "50%", top: "50%", left: "50%", transform: "translate(-50%,-55%)", background: "radial-gradient(circle, #39FF8812 0%, transparent 68%)", pointerEvents: "none" },
  authHeroBg: { position: "fixed", inset: 0, zIndex: 0, overflow: "hidden" },
  authHeroImg: { width: "100%", height: "100%", objectFit: "cover", opacity: 0.35 },
  authHeroOverlay: { position: "absolute", inset: 0, background: "linear-gradient(180deg, #07090Ecc 0%, #07090Ee6 55%, #07090E 100%)" },
  authLandingIconRow: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, width: "100%", maxWidth: 420, marginTop: 24 },
  authLandingIconItem: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6, fontSize: 11, padding: "6px 2px" },
  authWrap: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "72px 18px 24px", gap: 18, overflowY: "auto", position: "relative", zIndex: 1 },
  authBrand: { display: "flex", alignItems: "center", gap: 11, marginBottom: 2 },
  authLogo: { width: 42, height: 42, borderRadius: 13, display: "flex", alignItems: "center", justifyContent: "center", background: "#39FF8810", border: "1px solid #39FF8840", boxShadow: "0 0 28px #39FF8814" },
  authBrandSub: { fontSize: 8.5, letterSpacing: "1.6px", color: "#69727e", marginTop: 2 },
  authLanding: { width: "100%", maxWidth: 1120, display: "grid", gridTemplateColumns: "minmax(0, .92fr) minmax(420px, 1.08fr)", alignItems: "center", gap: 44, textAlign: "left", animation: "authCardIn .32s ease" },
  authLandingCopy: { minWidth: 0 },
  authLandingTrust: { display: "flex", flexWrap: "wrap", gap: 14, marginTop: 18, color: "#69727e", fontSize: 10.5 },
  authPreviewWrap: { position: "relative", width: "100%", minWidth: 0, perspective: 1200 },
  authPreviewGlow: { position: "absolute", width: 380, height: 380, top: "50%", left: "50%", transform: "translate(-50%,-50%)", borderRadius: "50%", pointerEvents: "none" },
  authPreview: { position: "relative", overflow: "hidden", width: "100%", border: "1px solid", borderRadius: 20, boxShadow: "0 35px 100px rgba(0,0,0,.48), 0 0 60px #39FF8810", transform: "rotateY(-5deg) rotateX(2deg)", transformStyle: "preserve-3d" },
  authPreviewTop: { height: 43, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 13px", borderBottom: "1px solid #ffffff09", background: "#0A0D12" },
  authPreviewBrand: { display: "flex", alignItems: "center", gap: 7, color: "#E6EDF3", fontSize: 11 },
  authPreviewTopIcons: { display: "flex", alignItems: "center", gap: 9, color: "#69727e" },
  authPreviewBody: { display: "grid", gridTemplateColumns: "46px 128px 1fr", minHeight: 305 },
  authPreviewSidebar: { display: "flex", flexDirection: "column", alignItems: "center", gap: 9, paddingTop: 12, background: "#080B0F", borderRight: "1px solid #ffffff08" },
  authPreviewServer: { width: 31, height: 31, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: "#121A16", border: "1px solid #39FF8825", color: "#39FF88" },
  authPreviewChannels: { padding: "12px 8px", background: "#0C1015", borderRight: "1px solid #ffffff08", color: "#69727e" },
  authPreviewServerName: { color: "#E6EDF3", fontSize: 11, fontWeight: 850, margin: "0 5px 18px" },
  authPreviewChannelLabel: { fontSize: 7.5, fontWeight: 800, letterSpacing: 1, margin: "0 5px 6px", color: "#4e5864" },
  authPreviewChannel: { display: "flex", alignItems: "center", gap: 6, padding: "6px 6px", borderRadius: 6, fontSize: 9.5, marginBottom: 2 },
  authPreviewChannelActive: { display: "flex", alignItems: "center", gap: 6, padding: "6px 6px", borderRadius: 6, fontSize: 9.5, marginBottom: 2, color: "#E6EDF3", background: "#39FF8812" },
  authPreviewUser: { display: "flex", alignItems: "center", gap: 5, marginTop: 70, padding: "7px 5px", borderTop: "1px solid #ffffff08", fontSize: 8.5 },
  authPreviewUserAvatar: { width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "#39FF88", color: "#07100b", fontWeight: 900 },
  authPreviewChat: { minWidth: 0, display: "flex", flexDirection: "column", background: "#0F141A" },
  authPreviewChatHead: { height: 40, display: "flex", alignItems: "center", gap: 6, padding: "0 12px", borderBottom: "1px solid #ffffff08", color: "#E6EDF3", fontSize: 10 },
  authPreviewMessages: { flex: 1, padding: "18px 13px", display: "flex", flexDirection: "column", gap: 17 },
  authPreviewMsg: { display: "flex", gap: 8, color: "#C9D1D9", fontSize: 9.5 },
  authPreviewMsgAvatar: { width: 25, height: 25, flexShrink: 0, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: "#39FF88", color: "#07100b", fontWeight: 900 },
  authPreviewInput: { margin: "0 12px 12px", minHeight: 30, borderRadius: 7, border: "1px solid #ffffff0d", background: "#090C11", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 9px", color: "#4e5864", fontSize: 8.5 },
  authLandingBadge: { display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 11px", borderRadius: 999, border: "1px solid #39FF8830", background: "#39FF880A", color: "#7d8590", fontSize: 10, fontWeight: 800, letterSpacing: "1px" },
  authLandingDot: { width: 6, height: 6, borderRadius: "50%", background: "#39FF88", boxShadow: "0 0 12px #39FF88" },
  authLandingTitle: { margin: "18px 0 10px", fontSize: "clamp(38px, 7vw, 68px)", lineHeight: 1.02, letterSpacing: "-3px", fontWeight: 900 },
  authLandingText: { maxWidth: 540, margin: 0, fontSize: 14, lineHeight: 1.7 },
  authLandingActions: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, width: "100%", maxWidth: 470, marginTop: 25 },
  authLandingPrimary: { minHeight: 48, border: "1px solid #39FF88", borderRadius: 11, background: "#39FF88", color: "#07100b", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 13.5, fontWeight: 850, cursor: "pointer", boxShadow: "0 0 35px #39FF8818", transition: "transform .16s ease, box-shadow .16s ease" },
  authLandingSecondary: { minHeight: 48, border: "1px solid", borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 13.5, fontWeight: 800, cursor: "pointer", transition: "transform .16s ease, background .16s ease" },
  authLandingFeatures: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, width: "100%", maxWidth: 620, marginTop: 28 },
  authFeature: { display: "flex", alignItems: "flex-start", gap: 10, textAlign: "left", padding: 14, border: "1px solid", borderRadius: 13 },
  authLandingFoot: { marginTop: 18, fontSize: 11.5 },
  authCard: { border: "1px solid", borderRadius: 20, padding: 25, width: "100%", maxWidth: 410, display: "flex", flexDirection: "column", gap: 13, boxShadow: "0 28px 90px rgba(0,0,0,.34), 0 0 0 1px #ffffff03 inset", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", animation: "authCardIn .28s ease" },
  authCardHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, marginBottom: 4 },
  authEyebrow: { fontSize: 9.5, fontWeight: 900, letterSpacing: "1.4px", marginBottom: 5 },
  authTitle: { fontSize: 22, margin: 0, fontWeight: 850, letterSpacing: -0.5 },
  authSubtitle: { fontSize: 12, margin: "6px 0 0", lineHeight: 1.45 },
  authHeadIcon: { width: 34, height: 34, flexShrink: 0, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "#39FF88", background: "#39FF880D", border: "1px solid #39FF8828" },
  authField: { display: "flex", flexDirection: "column", gap: 6 },
  authFieldLabel: { fontSize: 10.5, fontWeight: 700, letterSpacing: ".2px" },
  authInput: { width: "100%", boxSizing: "border-box", minHeight: 44, border: "1px solid", borderRadius: 10, padding: "10px 12px", outline: "none", fontSize: 13, transition: "border-color .16s ease, box-shadow .16s ease, background .16s ease" },
  authGrid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  authSection: { padding: "11px 12px", borderRadius: 12, border: "1px solid #ffffff0b", background: "#ffffff03" },
  authSectionTitle: { fontSize: 10.5, fontWeight: 800, color: "#7d8590", marginBottom: 9 },
  authAvatarLine: { display: "flex", alignItems: "center", gap: 12 },
  authAvatarPreview: { width: 58, height: 58, flexShrink: 0, borderRadius: 15, border: "1px solid", display: "flex", alignItems: "center", justifyContent: "center", background: "#0002" },
  authError: { display: "flex", alignItems: "center", gap: 7, padding: "9px 10px", borderRadius: 9, background: "#F271710D", border: "1px solid #F2717130", color: "#F58A8A", fontSize: 11.5, lineHeight: 1.4 },
  authPrimaryBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", minHeight: 45, border: "none", borderRadius: 10, background: "#39FF88", color: "#07100b", fontSize: 13.5, fontWeight: 850, cursor: "pointer", boxShadow: "0 8px 28px #39FF8818", transition: "transform .15s ease, box-shadow .15s ease, filter .15s ease" },
  authDivider: { display: "flex", alignItems: "center", gap: 9, color: "#5e6670", fontSize: 10.5, margin: "0 2px" },
  authSwitch: { textAlign: "center", color: "#7d8590", fontSize: 11.5, lineHeight: 1.5 },
  authForgot: { fontSize: 10.5, textAlign: "center", cursor: "pointer", transition: "color .15s ease" },
  authNote: { fontSize: 10.5, maxWidth: 360, textAlign: "center", lineHeight: 1.6, opacity: 0.68, margin: 0 },
  authLinks: { display: "flex", flexDirection: "column", gap: 7, marginTop: 5 },
  authLink: { fontSize: 11.5, color: "#39FF88", cursor: "pointer", textAlign: "center", fontWeight: 750, transition: "opacity .15s ease" },

  avatarPickLabel: {
    fontSize: 11.5,
    color: "#7d8590",
    marginTop: 2,
  },

  colorRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },

  colorSwatch: {
    width: 28,
    height: 28,
    borderRadius: 9,
    border: "1px solid rgba(255,255,255,.08)",
    cursor: "pointer",
    transition: "transform .15s ease, box-shadow .15s ease",
  },

  shapeSwatch: {
    width: 31,
    height: 31,
    borderRadius: 9,
    background: "transparent",
    border: "1.5px solid currentColor",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all .15s ease",
  },
};
