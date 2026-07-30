# Sinyal — Kurulum Rehberi (Telefondan)

Hepsi telefon tarayıcısından (Chrome önerilir, "Masaüstü sitesi" modu açık) yapılabilir.

## 1) Firebase projesi oluştur (veritabanı)

1. https://console.firebase.google.com adresine git, Google hesabınla giriş yap
2. "Add project" / "Proje ekle" → bir isim ver (örn. `sinyal-chat`) → devam et
3. Sol menüden **Build > Realtime Database** → "Create Database" → konum seç → **test mode** ile başlat (sonra kuralları sıkılaştırırız)
4. Sol üstteki dişli ikonu (⚙️) → **Project settings** → aşağı kaydır → "Your apps" → **Web (`</>`)** ikonuna tıkla → bir takma isim ver → "Register app"
5. Karşına çıkan `firebaseConfig` değerlerini not al (apiKey, authDomain, databaseURL, projectId, storageBucket, messagingSenderId, appId) — birazdan bunları Vercel'e gireceksin

## 2) GitHub'a yükle

1. https://github.com üzerinde hesap aç (yoksa)
2. Sağ üstten **+ > New repository** → isim ver (örn. `sinyal-chat`) → **Create repository**
3. Repo sayfasında **"uploading an existing file"** linkine tıkla
4. Bu klasördeki tüm dosyaları (package.json, vite.config.js, index.html, src/ klasörü, .gitignore) sürükleyip bırak veya seç
5. Alt kısımdan **Commit changes**

## 3) Vercel ile yayınla

1. https://vercel.com adresine git, **"Continue with GitHub"** ile giriş yap
2. **Add New > Project** → az önce yüklediğin `sinyal-chat` reposunu seç → **Import**
3. **Environment Variables** kısmına Firebase'den aldığın değerleri gir:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_DATABASE_URL`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
4. **Deploy** butonuna bas, birkaç dakika bekle
5. Sana `sinyal-chat-xxxx.vercel.app` gibi bir link verecek — bu artık canlı sitenin!

## 4) Telefonunda kullan

- Linki Chrome/Safari'de aç
- İstersen tarayıcı menüsünden **"Ana ekrana ekle"** yaparsan normal bir uygulama gibi ikon olarak durur

## 5) (Önemli) Firebase güvenlik kuralları

Test mode 30 gün sonra kapanır ve herkes okuma/yazma yapabilir hale gelir demek — bu proje zaten herkese açık anonim sohbet olduğu için sorun değil, ama istersen
Firebase Console > Realtime Database > **Rules** sekmesinden aşağıdaki gibi bırakabilirsin:

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

Bu, herkesin okuyup yazabildiği açık bir sohbet — projenin amacına uygun. İstersen ileride daha sıkı kurallar yazabiliriz.
