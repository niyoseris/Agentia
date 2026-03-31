# 🤖 Agentia

**Agentia** is an agentic Chrome extension powered by **Ollama** (local or cloud). It autonomously controls your browser by calling tools, recording actions, replaying with adaptive selectors, and executing complex multi-step tasks with native LLM tool calling.

[English below](#english) | [Türkçe](#türkçe)

---

## Türkçe

### ✨ Özellikler

- **Otonom Görev Yürütme** — Llama, Mistral, Gemma vb. modelleri kullanarak doğal dilde görevleri otomatikleştir
- **Native Tool Calling** — Ollama'nın native tool calling desteğiyle hassas tarayıcı kontrol
- **Lokal + Cloud** — Ollama Cloud (`ollama.com`) veya lokal Ollama server'ı seç
- **Kayıt & Tekrarlama** — Tarayıcı eylemlerini kaydet, basit veya adaptif modda tekrarla
- **Adaptif Tekrarlama** — Element seçicisi başarısız olsa da AI otomatik alternatif bulur
- **Görev Geçmişi** — Tamamlanan görevleri sakla, geçmiş görevlerle konuşmaya devam et
- **Dosya Oluşturma** — Agent görev sonuçlarını HTML, Markdown, JSON olarak dosya haline getirip göster
- **Devam Edilebilir Oturumlar** — Görev bittiğinde yeni talimatlarla agent'ı kaldığı yerden devam ettir
- **Light Theme** — Modern, aydınlık tema

### 🚀 Kurulum

1. **Chrome'u aç**, `chrome://extensions` git
2. **Sağ üstte** "Geliştirici modunu aç" (Developer mode toggle)
3. **"Paketlenmemiş uzantı yükle"** → Agentia klasörünü seç
4. Uzantı simgesi görünecek, yan panel açılacak

### 🔧 Yapılandırma

#### Ollama Bağlantısı

1. **Yan Panel → Ayarlar** tab'ına git
2. **Modu seç:**
   - **Cloud:** `ollama.com` → API key gir (`ollama.com/settings/keys`)
   - **Lokal:** Ollama server URL'sini gir (varsayılan: `http://localhost:11434`)
3. Model adını gir (ör: `llama3.2`, `mistral`, `qwen2.5`)
4. **"Bağlantıyı Test Et"** butonu ile kontrol et

#### Model İndirme (Lokal)

Lokal modda model yoksa:
1. **Ayarlar → Model Yükle** bölümüne git
2. Model adı gir (ör: `llama3.2`)
3. **"İndir"** butonuna bas — indirme sırasında ilerleme görünür

### 💬 Kullanım

#### Sohbet (Chat)
- Normal sohbet — Ollama'ya soru sor, cevap al
- Model context'ini saklanır

#### ⚡ Görev (Task)
1. **Görev Tanımı** gir — ör: "Google'da 'Web3 nedir' ara ve ilk sonucu aç"
2. **"▶ Görevi Çalıştır"** — Agent otomatik eylemler yürütür
3. **Log** — Her araç çağrısını, sonuçları, hataları görür
4. **Devam Et** — Görev bitince, alt bölüme yeni talimat gir → kaldığı yerden devam eder

#### ⏺ Kayıtlar (Recordings)
1. **"⏺ Kayıt Başlat"** — Tarayıcı eylemlerini kaydeder (tıkla, yaz, kaydır, türle, etc.)
2. **"⏹ Kaydı Durdur"** — Kaydı saklar
3. **Listeden seç → "▶ Tekrarla"** — Basit tekrarlama veya **"Adaptif Tekrar"** toggle'ı aç
4. **Adaptif:** Element bulunamadığında AI alternatif selector bulur

#### 🕓 Geçmiş (History)
- Tamamlanan görevleri listeler
- **"💬 Konuşmaya Devam Et"** — Görevin tam mesaj geçmişini Chat tab'ına yükler
- Yapılan görevler hakkında soru sorabilirsin

### 📋 Sistem Komutları

**Yan Panel:**
- `💬 Sohbet` — Model ile serbest sohbet
- `⚡ Görev` — Otonomgörev çalıştırma & devam
- `🕓 Geçmiş` — Yapılan görevleri gözden geçir
- `⏺ Kayıtlar` — Eylem kayıtlarını yönet
- `⚙️ Ayarlar` — Ollama, model, parametreler, sistem prompt

### ⚙️ Ayarlar

| Ayar | Açıklama |
|------|----------|
| **Model** | Kullanılacak model adı |
| **Sıcaklık (Temperature)** | 0.0–1.0 (düşük = deterministik, yüksek = creative) |
| **Max Token** | Maksimum cevap uzunluğu |
| **Max Iterasyon** | Görev başına maksimum tool call sayısı |
| **Sistem Prompt** | Agent davranışını özelleştir (opsiyonel) |
| **Tekrar Gecikmesi** | Kayıt tekrarlaması arasında bekleme (ms) |

### 🔐 Güvenlik Notları

- **API Key:** `chrome.storage.local` 'da şifreli saklanır — eğer cihazı paylaşıyorsan dikkat et
- **İzinler:** Uzantı yalnızca etkin tab'a erişebilir
- **Veriler:** Görev log'ları lokal tarayıcı storage'da saklanır — cloud'a gönderilmez

---

## English

### ✨ Features

- **Autonomous Task Execution** — Automate browser tasks in natural language using Llama, Mistral, Gemma, etc.
- **Native Tool Calling** — Precise browser control via Ollama's native tool calling support
- **Local + Cloud** — Choose between Ollama Cloud (`ollama.com`) or self-hosted Ollama
- **Recording & Playback** — Record browser actions, replay in standard or adaptive mode
- **Adaptive Replay** — Even if element selectors fail, AI finds equivalent alternatives
- **Task History** — Save completed tasks and continue conversations about past work
- **File Creation** — Agent can create HTML, Markdown, JSON files and display results in browser
- **Continuable Sessions** — Resume agent from where it stopped with new instructions
- **Light Theme** — Modern, clean UI

### 🚀 Installation

1. Open **Chrome**, go to `chrome://extensions`
2. **Toggle "Developer mode"** in top right
3. Click **"Load unpacked"** → select Agentia folder
4. Extension icon appears in toolbar, side panel opens

### 🔧 Setup

#### Ollama Connection

1. **Side Panel → Settings** tab
2. **Choose mode:**
   - **Cloud:** Use `ollama.com` → enter API key (get from `ollama.com/settings/keys`)
   - **Local:** Enter Ollama server URL (default: `http://localhost:11434`)
3. Enter model name (e.g., `llama3.2`, `mistral`, `qwen2.5`)
4. Click **"Test Connection"** to verify

#### Download Models (Local mode)

If model is missing:
1. **Settings → Download Model** section
2. Enter model name (e.g., `llama3.2`)
3. Click **"Download"** — watch progress bar

### 💬 Usage

#### Chat
- Free-form conversation with the model
- Context is preserved across messages

#### ⚡ Task
1. **Enter task description** — e.g., "Search Google for 'machine learning' and open the first result"
2. **Click "▶ Run Task"** — Agent autonomously executes actions
3. **View log** — See every tool call, result, and error
4. **Continue** — After task completes, enter new instruction in the continuation area below the log

#### ⏺ Recordings
1. **Click "⏺ Start Recording"** — Captures browser actions (clicks, typing, scrolling, etc.)
2. **Click "⏹ Stop Recording"** — Saves the recording
3. **Select from list → "▶ Replay"** — Play back actions, optionally with **"Adaptive Replay"** enabled
4. **Adaptive Mode:** If an element isn't found, AI finds a semantically equivalent selector

#### 🕓 History
- Lists all completed tasks
- **"💬 Continue Conversation"** — Loads a task's full message history into Chat tab
- Ask follow-up questions about completed tasks

### 📋 Side Panel Tabs

- `💬 Chat` — Free chat with model
- `⚡ Task` — Run autonomous tasks & continue from completion
- `🕓 History` — Review past tasks
- `⏺ Recordings` — Manage action recordings
- `⚙️ Settings` — Ollama/model config, parameters, system prompt

### ⚙️ Settings

| Setting | Description |
|---------|-------------|
| **Model** | Model name to use |
| **Temperature** | 0.0–1.0 (lower = deterministic, higher = creative) |
| **Max Tokens** | Maximum response length |
| **Max Iterations** | Max tool calls per task |
| **System Prompt** | Customize agent behavior (optional) |
| **Replay Delay** | Wait time between actions (ms) |

### 🔐 Security Notes

- **API Key:** Stored locally in `chrome.storage.local` — be careful on shared machines
- **Permissions:** Extension only accesses the active tab
- **Data:** Task logs stored locally — never sent to cloud

---

## 🏗 Architecture

### Files

| File | Purpose |
|------|---------|
| `manifest.json` | Chrome extension configuration (MV3) |
| `background.js` | Service worker — Ollama communication, tab/DOM control, tool execution |
| `agent-core.js` | AgentCore class — LLM loop, native tool calling, message management |
| `sidepanel.js` | Side panel UI logic — chat, task, recordings, history, settings |
| `sidepanel.html` / `sidepanel.css` | Side panel layout and styling |
| `content.js` | Content script — page injection, event capture, recording |
| `action-store.js` | Recording storage & management |
| `viewer.html` | File viewer page — display HTML, JSON, Markdown, text results |
| `injected.js` | Web-accessible helper for DOM manipulation |
| `popup.html` / `popup.js` | Quick-action popup |

### Data Flow

```
User Input (Chat/Task)
    ↓
sidepanel.js → chrome.runtime.sendMessage()
    ↓
background.js (handleMessage)
    ↓
AgentCore.chat() or .runTask()
    ↓
fetch() → Ollama API (/api/chat)
    ↓
Tool Calls Loop:
  - LLM returns { tool_calls: [...] }
  - For each tool:
    - AgentCore._executeTool() → background.handleDomAction() / handleTabAction()
    - chrome.scripting.executeScript() → Content Script / Page
    - Store result as { role: 'tool', content: JSON.stringify(result) }
  - Append to messages → next LLM call
    ↓
Final Response → sidepanel.js → User
```

### Tool Definitions

AgentCore exposes **24 tools** via native Ollama tool calling:

**Tab Management:**
- `tab_create`, `tab_close`, `tab_navigate`, `tab_get_active`, `tab_get_all`, `tab_reload`, `tab_back`, `tab_forward`, `tab_screenshot`

**DOM Interaction:**
- `dom_click`, `dom_type`, `dom_clear`, `dom_scroll`, `dom_hover`, `dom_select`, `dom_keypress`, `dom_get_text`, `dom_exists`, `dom_query_all`, `dom_get_summary`, `dom_extract`

**Page Info:**
- `page_get_info`

**Recording:**
- `recording_start`, `recording_stop`, `replay`

**Utility:**
- `wait`, `create_file`

### Context Sanitization

To prevent token overflow, tool results are sanitized before LLM:
- `tab_screenshot` → stripped (too large)
- `page_get_info` → URL + title only
- `dom_query_all` → first 15 elements, 80-char text
- `dom_get_summary` → first 20 interactive elements
- Generic large results → truncated to 2000 chars

### Adaptive Replay

When a recorded action's selector fails:
1. Capture current DOM summary + page info
2. Send to LLM with original action & current page state
3. LLM suggests new selector based on context
4. Execute with new selector if confidence > 0.3

---

## 🛠 Development

### Local Ollama Setup

```bash
# Install Ollama from https://ollama.ai
ollama serve

# In another terminal, pull a model
ollama pull llama3.2
ollama pull mistral
```

### Cloud Ollama (ollama.com)

1. Sign up at https://ollama.com
2. Go to Settings → API Keys
3. Generate an API key
4. In Agentia: Settings → Cloud Mode → paste API key

### Extension Structure (MV3)

- **Service Worker:** `background.js` — persistent background logic
- **Side Panel:** `sidepanel.html` + `sidepanel.js` — UI
- **Content Script:** `content.js` — runs on all pages
- **Host Permissions:** `<all_urls>` — can access any page

### Debugging

1. Open `chrome://extensions`
2. Click "Details" on Agentia
3. **"Service worker"** → see background.js console
4. **"Inspect views" → sidepanel.html** → see side panel console
5. **"Inspect" on specific page** → see content.js console

---

## 📄 License

MIT

---

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repo
2. Create a feature branch
3. Test thoroughly
4. Submit a pull request

---

## ❓ FAQ

**Q: Can I use Agentia without Ollama?**
A: No, an Ollama instance (local or cloud) is required for the LLM.

**Q: Is my data sent to cloud?**
A: Only if you use Ollama Cloud mode. Local mode keeps everything on your machine.

**Q: Does it work on all websites?**
A: Most sites, yes. Some may have anti-bot protections or complex JavaScript frameworks that interfere.

**Q: How much does Ollama Cloud cost?**
A: Check [ollama.com](https://ollama.com) for pricing.

**Q: Can I customize the agent's behavior?**
A: Yes, via the "System Prompt" field in Settings.

---

**Made with ❤️ by Niyoseris**

For issues, feature requests, or questions, [open an issue](https://github.com/niyoseris/Agentia/issues).
