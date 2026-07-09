# Agentia Development Log

## Genel Bakış
Agentia, Ollama ile çalışan ajan tabanlı bir Chrome MV3 tarayıcı asistanı. Bu dosya, tüm session'larda yapılan değişikliklerin kaydıdır.

---

## AŞAMA 13: XSS Alert Tespiti — MAIN world + reload-kalıcı (seed v5)

Gözlem: Bir XSS payload'ı gerçekten çalışıp alert() tetikledi, ama `dialog_get_intercepted` count:0 döndürdü — ajan XSS'i kaçırdı.

Kök nedenler:
1. **Yanlış JS dünyası**: alert override'ı isolated content-script world'de yapılıyordu; XSS ise sayfanın MAIN world'ünde çalışır → override'ı görmez.
2. **Reload'da siliniyor**: `tab_reload` sonrası override kaybolur; load anında patlayan XSS yakalanmaz.

Çözüm:
- Yeni `xss-watch.js`: MAIN world'de gerçek alert/confirm/prompt/print'i override eder, tetiklenenleri `sessionStorage`'a yazar (popup göstermez).
- `background.js`: `XSS_WATCH_ON/GET/OFF` — anlık MAIN-world enjeksiyon + `chrome.scripting.registerContentScripts` ile origin'e **document_start** kalıcı kayıt (reload/navigasyonda scriptlerden ÖNCE kurulur) + görev sonunda otomatik temizlik (unregister).
- `agent-core.js`: `dialog_alert_intercept`→XSS_WATCH_ON (persist), `dialog_get_intercepted`→XSS_WATCH_GET; sanitizer `{count, xssConfirmed, alerts}` döndürür (count>0 = XSS KANITLANDI).
- `tools.js`: dialog şemaları güncellendi (persist parametresi, "yakalanan alert = XSS kanıtı").
- `builtins.js` (pentest skill, seed v5): "önce watch'ı kur (reload'dan önce), sonra payload/yükle, sonra oku; alert yoksa bile payload'ın DOM'a çalıştırılabilir düşüp düşmediğini doğrula".

---

## AŞAMA 12: Kapsamlı Güvenlik Testi İyileştirmeleri (seed v4)

Gözlem: Bir XSS tarama görevinde ajan KB'deki geniş payload listesini kullanamadı (kb_search sadece top-K getirdi, yanlış chunk'lar geldi) ve birkaç payload deneyip "güvenli" dedi; rapor da otomatik-fallback ile üretildi.

### 12.1 Full-doküman KB erişimi (kök neden)
- `background.js`: `KB_LIST_ALL_DOCS` (tüm KB'lerdeki dokümanları listeler)
- `tools.js`: `kb_list_documents {kbId?}` + `kb_get_document {docId}` — top-K değil, dokümanın TAMAMINI okur (ajan tüm payload listesini/kontrol listesini eline alır)
- `agent-core.js`: case'ler + sanitizer (`kb_get_document` ~40KB cap) + READ_ONLY set + kb_search açıklaması "tam içerik için kb_get_document kullan" uyarısı

### 12.2 Sızma-testi skill'i genişletildi (`builtins.js`, `sizma-testi-ileri`)
- **Payload tüketimi**: kb_list_documents→kb_get_document ile tam listeyi al, kategori kategori (HTML/attr/JS/URL/SVG/fragment/encoding/filter/WAF/AngularJS/meta/host-header/CRLF/open-redirect) sistematik dene, "Kapsam Tablosu" tut, birkaç payload'la yetinme
- **DOM XSS için JS kaynak okuma**: statik/SPA sitelerde reflected yoksa DOM-based riski var — JS'i http_request ile çekip source→sink (location.hash→innerHTML vb.) izle, fragment payload'ları test et
- **Zorunlu yapılandırılmış rapor**: ajan raporu kendi yazsın (file_update ile), otomatik fallback'e bırakmasın; Kapsam Tablosu + "Doğrulanamayan Bulgular" (moderasyon bekleyen stored XSS) + "Bırakılan Payload'lar & Temizlik" bölümleri
- **Kalıcı iz takibi**: gönderilen stored payload'lar not edilip temizlik talimatıyla raporlanır

### 12.3 Diğer
- `agent-core.js`: güvenlik bağlamında (aktif test açık veya persona "Güvenlik Denetçisi") recipe auto-save bastırıldı — "XSS gönderme adımları" recipe olarak kaydedilmesin, tekrar payload plantlanmasın
- Seed v4: built-in skill talimatları da persona gibi edit-safe parmak-izi ile tazeleniyor (kullanıcı düzenlemişse ezilmez)

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

## AŞAMA 9: RAG + Bilgi Tabanları + Kişilikler + Yetenekler (Tamamlandı)

### 9.1 Bilgi Tabanları (Knowledge Base) + RAG
- **Yeni dosyalar:** `kb-store.js` (IndexedDB `agentia_kb`: kbs/docs/chunks), `rag.js` (chunking, embedding, hibrit arama)
- İçerik kaynakları: metin yapıştırma, .txt/.md/.pdf yükleme (PDF base64 → pdf.js), "Bu Sayfayı Kaydet" (`document.body.innerText`)
- Chunking: ~1200 kr hedef, 200 kr cümle-hizalı overlap, markdown başlık sınırları; PDF sayfaları `meta.page` ile
- Embedding: Ollama `/api/embed`, 16'lık batch, chunk başına anında persist (SW restart dayanıklılığı)
- Hibrit arama: embedding modeli varsa cosine; yoksa/erişilemezse BM25-lite keyword fallback (60s hata cache)
- `resumePendingEmbeddings()` init'te yarım kalan indekslemeyi sürdürür; `KB_REINDEX` model değişiminde yeniden indeksler
- RAG enjeksiyonu: aktif personanın bağlı KB'lerinden top-k parça system prompta (`[KB_CONTEXT_INJECTED_HERE]`), kaynak atıflı, 4000 kr bütçe
- Yeni tool: `kb_search(query, topK)` — ajan isteğe bağlı derin arama yapar
- KB bağlamı varken `num_ctx ≥ 16384` (Ollama'nın 4096 sessiz kesmesine karşı)

### 9.2 Kişilikler (Personalar)
- **Yeni dosya:** `persona-store.js` (chrome.storage.local `agentia_personas`)
- Persona = kişilik promptu + bağlı KB'ler + bağlı yetenekler + model/sıcaklık override
- `effectiveModel`/`effectiveTemperature` getter'ları tüm API çağrılarında kullanılıyor
- Header'da hızlı geçiş dropdown'u; silinemez `default` (Agentia) personası; aktif silinirse default'a düşer
- `PERSONA_LIST/SAVE/DELETE/SET_ACTIVE/GET_ACTIVE` mesajları

### 9.3 Yetenekler (Skills)
- **Yeni dosya:** `skill-store.js` (chrome.storage.local `agentia_skills`)
- İki tip: `prompt` (talimat paketi) ve `macro` (aksiyon dizisi)
- Progressive disclosure: system prompta sadece ad+açıklama listesi; `skill_use(name)` tam talimatı yükler
- `skill_run_macro(name)` makro adımlarını `replayEvents` (yeni export, recording-handler) ile oynatır; adaptive destekli
- Kayıtlardan içe aktarma: `SKILL_FROM_RECORDING`
- `SKILL_LIST/GET/SAVE/DELETE/SET_ENABLED/FROM_RECORDING/RUN_MACRO` mesajları

### 9.4 UI: 🧩 Profil tabı
- Tek yeni tab, içinde alt-nav: Kişilikler | Bilgi Tabanları | Yetenekler
- KB drill-down: doküman listesi, embed durum rozetleri (KB_EVENT ile canlı progress), arama test kutusu
- Settings'e "Bilgi Tabanı (RAG)" bölümü: embedding modeli, RAG toggle, top-K
- Ctrl+1-7 tab kısayolları

### 9.5 Hazır İçerik: 🛡️ Güvenlik Denetçisi modu
- **Yeni dosya:** `builtins.js` — uzantıyla gelen hazır persona + skill, ilk init'te bir kez seed edilir (`agentia_builtins_version` bayrağıyla korunur; kullanıcı silerse geri gelmez)
- **Persona "Güvenlik Denetçisi"**: saldırgan gibi düşünüp white-hat gibi raporlayan AppSec denetçisi; yetkilendirme + yıkıcı-test-yasağı kuralları; bağlı `guvenlik-denetimi` skill'i; temperature 0.3
- **Skill "guvenlik-denetimi"** (prompt): tarayıcı ajanının gözlemleyebildiğine odaklı PASİF metodoloji — güvenlik başlıkları, açığa çıkmış dosyalar (.env/.git/backup), auth/oturum, girdi doğrulama (kavramsal, payload firlatmadan), CORS/TLS/hata ifşası, CVE kontrolü; her bulgu için önem + kanıt + somut kapatma adımları; ilerlemeli HTML rapor çıktısı

### 9.5b İleri sızma testi: yaratıcı + ısrarcı AKTİF test (seed v2)
- **Skill "sizma-testi-ileri"** (prompt): bilinen teknikleri ilkeller olarak görüp KOMBİNLEYEN, saldırı ağacı kuran, hipotez üretip iterasyonla varyasyonlayan (kodlama/bağlam/vektör değiştirme), tek payload ile yetinmeyen metodoloji. Güvenli PoC doğrulama (XSS canary, boolean/zaman-tabanlı SQLi çıkarımı, OOB kendi dinleyicine), iş-mantığı/race/zincirleme senaryoları. "Yaratıcı Saldırı Senaryoları" rapor bölümü.
- **Aktif test kapısı (3 katmanlı koruma):**
  - `settings.activeSecurityTesting` (varsayılan KAPALI) — açılmadıkça yalnızca pasif analiz
  - `settings.securityAuthorizedTargets` — aktif test SADECE bu alan adlarında
  - `agent-core._buildSecurityPolicy()` — aktif açıkken system prompta yetkili hedef listesi + yıkıcı-işlem yasağı + PoC-only bloğu enjekte eder; kapalıyken hiçbir şey enjekte edilmez
- Ayarlar'a "🛡️ Güvenlik Testi" bölümü: aktif test toggle + yetkili hedefler textarea + uyarı metni
- `seedBuiltins` idempotent + upgrade-farkında (v1→v2: yeni skill'i mevcut personaya bağlar, çift kayıt yok)

## AŞAMA 10: Self-Learn + Yerel Dosya/Dialog + Dayanıklılık + RAG Oto-Araştırma

### 10.1 Genel Self-Learn (sessiz, kategorili)
- `memory-store.js`: `learned` şemasına `category` (varsayılan `genel`); `addLearned(topic, info, category)`; migration; cap 30→60; `buildMemoryPrompt` kategori-gruplu (`### <kategori>`); `getLearnedCategories()`
- `agent-core.js`: TASK_COMPLETE sonrası `_extractLearnings()` — ayrı hafif LLM çağrısı (format:json) ile 0–5 genel/taşınabilir bilgi çıkarır, `_parseLearnings` toleranslı parse, sessizce kaydeder
- `tools.js`: `memory_save`'e `category`; `sidepanel.js`: Memory sekmesinde kategori rozeti + filtre dropdown

### 10.2 Dosya kaydetme (chrome.downloads)
- `manifest.json`: `downloads` izni geri; `tools.js` `file_download`; `background.js` FILE_DOWNLOAD (metin→data URL, saveAs opsiyonel)

### 10.3 Panel-kapalı dayanıklılık
- `agent-core.js`: `_notify`→`_recordEvent` ring-buffer (son 120 olay) `chrome.storage.session`'a; durum-geçişlerinde anında flush, ara olaylarda 400ms throttle; `markTaskError`
- `background.js`: `GET_ACTIVE_TASK`; `sidepanel.js`: açılışta `resyncActiveTask()` — 'running' görevi olaylardan rehidrate edip canlı akışa bağlanır
- **Offscreen lifeline**: `manifest` `offscreen`; `offscreen.html/js` (runtime port + sessiz WebAudio); `background` ensureOffscreen/closeOffscreen görev ömrüne bağlı. Not: tab/scripting SW'de kalır, offscreen yalnızca ömür uzatıcı

### 10.4 Yerel dosya erişimi (File System Access API)
- Yeni `local-files.js` (panel context): `pickFiles/pickDirectory`, handle'lar IndexedDB'de, `queryPermission/requestPermission`, `listOp/readOp/writeOp` (20MB cap)
- `background.js` `requestFromPanel()` köprüsü: LOCAL_FILE_LIST/READ/WRITE → panele forward (panel kapalıysa net hata)
- `tools.js`: `local_file_list/read/write`; `sidepanel`: Studio'da "📁 Dosyalar" alt paneli (seç/listele/kaldır) + LOCAL_FILE_REQUEST listener
- **Dialog**: `dialog_suppress_beforeunload` tool → `dom-handler` MAIN-world override ("sayfadan ayrıl?" pop-up'ını bastırır). Native OS dosya-seçici desteklenmez (Chrome sınırı)

### 10.5 RAG oto-araştırma
- `tools.js` `kb_add_document {kbId, name, text, sourceUrl}` → `KB_ADD_DOC` sourceType `research` → mevcut ingest/embed
- `sidepanel`: KB detayında "🔎 Konu Araştır ve Ekle" → hedef kbId'yi göreve gömüp `AGENT_RUN_TASK` başlatır
- `background.js` `KB_GET_DOC_TEXT`; doküman kartında "Görüntüle" → viewer

## AŞAMA 11: Derin Araştırma + HTTP İstekleri + Ajanın HTML Araçları/Scanner'ı

### 11.1 http_request tool (GET/POST/…)
- Yeni `http-handler.js` `handleHttpRequest`: AbortController timeout (default 30s, max 60s), gövde 1MB read cap (streaming reader), textual/binary tespiti, headers→obj; hata/timeout throw etmez `{error}` döner
- `tools.js` `http_request {url!, method, headers, body, timeoutMs}`; `background.js` HTTP_REQUEST case; `agent-core.js` _executeTool case + sanitizer (gövde ≤8KB önizleme) + researchBuffer capture (http_request GET sonuçları da kaynak)
- SW `<all_urls>` → CORS yok. SSRF/localhost kasıtlı serbest (self-host + yetkili test); yıkıcı kullanım güvenlik politikası kapsamında

### 11.2 Derin & Dinamik (Recursive) Araştırma
- `prompts.js`: "yeterli olunca dur" yalnızca basit sorularda; yeni "Deep & Dynamic Research" bölümü — sayfayı oku/yorumla, varlık/referans/açık-soru çıkar, hedefe gerekiyorsa dinamik araştır, zincirle (bulgu→soru→arama→sentez), açık-sorular listesi, iterasyon limiti fren. web_search bir başlangıç noktası

### 11.3 Ajanın kendi HTML/JS araçları + scanner
- `viewer.js`: `type:'tool'` dalı — blob iframe'e `agentiaHttp(url,opts)` preamble'ı eklenir; viewer köprü listener'ı (`e.source===htmlIframe.contentWindow` doğrular, yalnızca 'tool') postMessage → HTTP_REQUEST → geri postMessage. Böylece üretilen scanner HTML'i CORS'suz istek atar
- `type:'html'` raporları ağ yetkisi ALMAZ (blast-radius sınırlı). `tools.js` file_create type enum'a `tool` + belge
- `prompts.js`: "Building Interactive Tools & Scanners" — self-contained araç için type:'html'; ağ gerektiren için type:'tool'+agentiaHttp VEYA ajan-orkestralı http_request+file_update

### 9.6 Altyapı düzeltmeleri
- **Bug fix:** `runTask` system prompta `this.systemPrompt`'u iki kez ekliyordu (agent-core.js:383)
- `getSettings()` artık default'ları merge ediyor (yeni ayar anahtarları eski kullanıcılarda undefined kalmaz)
- `buildSystemPrompt` imzası options objesine geçti; `_withSystem` async oldu
- Keepalive refcount'lu (görev + KB ingest çakışması)
- `extractPdfText({url?, data?, pages?})` export'u; `pages: 'all-full'` tüm sayfaları okur (10 sayfa cap'siz)
- `KB_ADD_DOC` hemen `{started:true}` döner, progress `KB_EVENT` broadcast'iyle akar (mesaj kanalı timeout önlenir)

---

## Bilinen Sorunlar / Gelecek İyileştirmeler
- `_buildFinalHtml` araştırma verisinden HTML üretiyor, ama kalitesi LLM'in ürettiği kadar iyi değil
- Facebook gibi obfuscated DOM'lu sitelerde scraping hâlâ zor
- Vision modeller için screenshot kalitesi 768px ile sınırlı — daha yüksek çözünürlük seçeneği eklenebilir
- Recipe adımlarının doğruluğu — başarısız adımların filtrelenmesi iyileştirilebilir