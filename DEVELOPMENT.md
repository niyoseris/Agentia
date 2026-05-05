# Agentia Development Log

## Genel Bakış
Agentia, Ollama ile çalışan ajan tabanlı bir Chrome MV3 tarayıcı asistanı. Bu dosya, tüm session'larda yapılan değişikliklerin kaydıdır.

---

## AŞAMA 1: Güvenlik Düzeltmeleri (Tamamlandı)

### 1.1 INJECT_SCRIPT arbitrary code execution kaldırıldı
- **Dosya:** `background.js`
- `new Function(payload.code)` ile herhangi bir gönderenin kod çalıştırabilmesi kapatıldı
- Tüm `INJECT_SCRIPT` case bloğu silindi

### 1.2 Viewer iframe sandbox XSS düzeltildi
- **Dosya:** `viewer.js`
- `allow-same-origin` sandbox attribute kaldırıldı
- Sandbox: `'allow-scripts allow-popups allow-forms'`

### 1.3 Memory tab XSS — inline onclick düzeltildi
- **Dosya:** `sidepanel.js`
- `onclick="deleteLearned('${l.id}')"` → Event delegation kullanıma geçildi
- `data-action="delete-learned" data-id="..."` + addEventListener

### 1.4 fileKey namespace validation eklendi
- **Dosya:** `background.js`
- `FILE_UPDATE`/`FILE_OPEN` artık `fileKey.startsWith('agentia_file_')` doğrulaması yapıyor

### 1.5 Kullanılmayan izinler kaldırıldı
- **Dosya:** `manifest.json`
- Kaldırılanlar: `history`, `bookmarks`, `downloads`, `clipboardRead`, `clipboardWrite`, `notifications`
- Kalanlar: `activeTab, tabs, scripting, storage, sidePanel, contextMenus, alarms`

---

## AŞAMA 2: Kararlılık Düzeltmeleri (Tamamlandı)

### 2.1 Task abort race condition düzeltildi
- **Dosya:** `background.js`
- `activeTaskId` değişkeni eklendi
- `finally()` sadece kendi ID'si eşleşirse temizliyor

### 2.2 Sessiz hata yutma düzeltildi
- **Dosyalar:** background.js, agent-core.js, content.js, sidepanel.js (~20 yer)
- `.catch(() => {})` → `console.warn` veya `console.error`

### 2.3 Kayıt durumunu service worker restart'tan koruma
- **Dosya:** `background.js`, `recording-handler.js`
- `chrome.storage.session` kullanılıyor
- startRecording/stopRecording sırasında oku/yaz

### 2.4 Content script kayıt listener'larını navigation sonrası geri yükleme
- **Dosya:** `content.js`
- CHECK_RECORDING_STATUS mesajı init'te gönderiliyor
- Background `chrome.tabs.onUpdated` ile proaktif START_RECORDING gönderiyor

---

## AŞAMA 3: Yeni Özellikler (Tamamlandı)

### 3.1 Markdown rendering eklendi
- **Dosyalar:** sidepanel.html, sidepanel.js
- `lib/marked.min.js` + `lib/purify.min.js` eklendi
- `appendMessage` ve `handleStreamChunk`'ta assistant mesajları markdown olarak render ediliyor
- Streaming sırasında text, tamamlandığında markdown re-render

### 3.2 Chat geçmişi kalıcı yapıldı
- **Dosya:** sidepanel.js
- `chrome.storage.local`'a kaydediliyor (MAX 100 mesaj)
- DOMContentLoaded'ta geri yükleniyor
- "Sohbeti Temizle" butonu eklendi

### 3.3 Dark mode eklendi
- **Dosyalar:** sidepanel.css, sidepanel.js, sidepanel.html
- `[data-theme="dark"]` CSS variable overrides
- Sistem tercih algılama + header'da tema toggle butonu
- `localStorage` ile kalıcı

### 3.4 Klavye kısayolları eklendi
- **Dosya:** sidepanel.js
- `Ctrl+1-6` tab geçişi
- `Escape` görevi durdur
- `/` chat'e odaklan

---

## AŞAMA 4: Refactoring (Tamamlandı)

### 4.1 background.js modüllere ayrıldı
- **Orijinal:** ~1230 satır → **Şimdi:** ~560 satır + modüller
- `tab-handler.js` — tab işlemleri
- `dom-handler.js` — DOM işlemleri
- `search-handler.js` — web arama (DuckDuckGo)
- `pdf-handler.js` — PDF okuma
- `recording-handler.js` — kayıt/replay
- `settings-handler.js` — ayarlar
- `ollama-handler.js` — görev geçmişi
- `utils.js` — sleep, getActiveTabId, waitForTabLoad

### 4.2 Tool tanımları ve system prompt ayrıldı
- `tools.js` (~520 satır) — AGENT_TOOLS array
- `prompts.js` (~130 satır) — AGENT_SYSTEM_PROMPT_BASE + buildSystemPrompt()

### 4.3 System prompt injection DRY yapıldı
- `buildSystemPrompt()` hem `runTask` hem `_withSystem`'de kullanılıyor

### 4.4 Viewer regex markdown parser değiştirildi
- **Dosya:** viewer.js, viewer.html
- Kırılgan regex → `marked.js` + `DOMPurify`

---

## AŞAMA 5: Ajan Hız İyileştirmeleri (Tamamlandı)

### 5.1 dom_get_summary iyileştirildi
- **Dosya:** dom-handler.js
- Düz liste yerine gruplandırılmış format: `buttons`, `links`, `inputs`, `other`
- Seçiciler `data-testid`, `aria-label` öncelikli
- `position: fixed` elementler artık görünür (eski kod offsetParent===null ile filtreliyordu — bug düzeltildi)
- `iconButton: true` + `position: {x, y}` — SVG icon butonlar için
- Login tespiti: `loggedIn: true/false` + `loginHint`
- Action link'ler (Post, Compose vb.) `buttons` array'ine ekleniyor
- Daha iyi seçici üretimi: nth-child path, role attribute

### 5.2 Stuck detection eklendi
- **Dosya:** agent-core.js
- 3 ardışık DOM hatası sonrası otomatik rehberlik mesajı enjeksiyonu
- `consecutiveDomFailures` sayacı ile takip

### 5.3 Text bazlı tıklama eklendi
- **Dosya:** dom-handler.js, tools.js
- `dom_click({ selector: "Post" })` — düz metin ile buton bulma
- `findElement` artık text, aria-label, data-testid eşleşmesi yapıyor
- Sadece CSS selector değil, "Post", "Sign In" gibi metinlerle de çalışıyor

### 5.4 Koordinat bazlı tıklama eklendi
- **Dosya:** dom-handler.js, tools.js, agent-core.js
- `dom_click({ x: 722, y: 29, tabId: ... })` — icon/FAB butonlar için
- `document.elementFromPoint(x, y)` ile click

### 5.5 Error page retry eklendi
- **Dosya:** dom-handler.js
- SPA sayfalarında "Frame with ID 0 is showing error page" hatası için 3 deneme
- Her deneme arası 2s-4s bekleme

### 5.6 SPA settle time eklendi
- **Dosya:** utils.js
- `waitForTabLoad` artık `complete` event'ten sonra 1.5s bekliyor
- React SPA'lar tam render olmadan DOM action'a izin vermiyordu

---

## AŞAMA 6: Vision Screenshot Desteği (Tamamlandı)

### 6.1 Vision model algılama
- **Dosya:** agent-core.js
- `_checkVisionCapability()` — async, Ollama `/api/show` API'sinden model capability çekiyor
- `_isVisionModel()` — sync, cache'den okuyor, cache yoksa isim heuristic'i
- `_isVisionByModelName()` — llava, gemma3, gemma4, llama4, qwen2.5-vl vb. tanıyor
- Ayarlardan `visionEnabled`: 'auto' (algıla), 'on' (zorla), 'off' (kapat)

### 6.2 Screenshot sıkıştırma
- **Dosya:** tab-handler.js, agent-core.js
- `captureVisibleTab` JPEG format, quality 60 kullanıyor (PNG yerine)
- `_compressScreenshot()` — OffscreenCanvas ile 768px'e resize + JPEG quality 0.5
- 800KB üstü screenshot'lar reddediliyor (500 hatası engelleniyor)
- `pendingScreenshot` mekanizması — screenshot son LLM çağrısına `images: [base64]` olarak ekleniyor

### 6.3 Ayarlar UI
- **Dosyalar:** sidepanel.html, sidepanel.js, settings-handler.js
- "Görüntü (Vision) Desteği" dropdown: Otomatik / Açık / Kapalı

---

## AŞAMA 7: Site Reçeteleri (Recipes) (Tamamlandı)

### 7.1 MemoryStore recipes
- **Dosya:** memory-store.js
- `recipes[]` array eklendi (migration: eski veri için `if (!this.data.recipes)`)
- `addRecipe(site, task, steps)` — aynı site+task varsa günceller, yoksa yeni ekler
- `deleteRecipe(id)` — reçete silme
- `findMatchingRecipes()` — basit domain eşleşmesi

### 7.2 Recipe injection system prompt'a
- **Dosya:** memory-store.js
- `buildMemoryPrompt` tüm recipe'leri system prompt'a ekliyor
- LLM kendisi hangi recipe'nin ilgili olduğuna karar veriyor
- "Learned Site Workflows" bölümü — task eşleşirse adımları takip et

### 7.3 memory_save_recipe tool
- **Dosya:** tools.js, agent-core.js, background.js
- `memory_save_recipe(site, task, steps)` — agent başarılı etkileşimden sonra kaydediyor
- Steps: `{ action, selector, value, note }` formatında

### 7.4 Auto-save recipe
- **Dosya:** agent-core.js
- Görev tamamlanınca, 2+ başarılı DOM adımı varsa otomatik recipe kaydediyor
- Sadece başarılı adımlar (error'suz) dahil
- Son 8 adım alınıyor (başarılı akış genelde en sonda)
- `researchBuffer` ile site tespiti (URL'den domain çıkarma)

### 7.5 Recipe UI
- **Dosyalar:** sidepanel.html, sidepanel.js, background.js
- Memory tab'ında "Site Reçeteleri" bölümü
- Her recipe: site, task, adım sayısı, kullanım sayısı
- Silme butonu

---

## AŞAMA 8: Otomatik Rapor Oluşturma (Tamamlandı)

### 8.1 Auto-generate report
- **Dosya:** agent-core.js
- Araştırma görevi bittikten sonra, eğer agent `file_create` çağırmadıysa:
  - `researchBuffer` 2+ kaynak içeriyorsa → `_buildFinalHtml()` ile otomatik HTML rapor
  - `FILE_CREATE` ile kaydediliyor
  - `activeFileKey` güncelleniyor

### 8.2 Task history reportFileKey
- **Dosya:** ollama-handler.js
- `saveTaskHistory` artık `reportFileKey` kaydediyor
- Rapor sonradan görüntülenebilir

### 8.3 "Raporu Görüntüle" butonu
- **Dosya:** sidepanel.js
- Görev geçmişi panelinde `reportFileKey` varsa buton gösteriliyor
- Tıklandığında `FILE_OPEN` ile yeni tabda açılıyor

---

## System Prompt (Generic)
- **Dosya:** prompts.js
- Tüm site-specific bölümler kaldırıldı (Twitter, Bluesky, Amazon)
- Her şey generic kurallarla çalışıyor
- Login check, text clicking, coordinate clicking, stuck detection hepsi generic

---

## Bilinen Sorunlar / Gelecek İyileştirmeler
- `_buildFinalHtml` araştırma verisinden HTML üretiyor, ama kalitesi LLM'in ürettiği kadar iyi değil
- Facebook gibi obfuscated DOM'lu sitelerde scraping hâlâ zor
- Vision modeller için screenshot kalitesi 768px ile sınırlı — daha yüksek çözünürlük seçeneği eklenebilir
- Recipe adımlarının doğruluğu — başarısız adımların filtrelenmesi iyileştirilebilir