
class SyntaxAIChat extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.history = [];
    this.files = [];
    this.initialized = false;
    this._personalData = null;
    this.aiBusy = false;
  }

  connectedCallback() {
    if (this.initialized) return;
    this.initialized = true;
    this.render();
    this.bindEvents();
    this.buildEmojiPicker();
  }

  get mode() {
    return this.getAttribute("mode") || "inline";
  }

  get title() {
    return this.getAttribute("title") || "SYNTAX AI";
  }

  get endpoint() {
    return this.getAttribute("endpoint") || "";
  }

  // Personal Assistant profile data
  set personalData(data) {
    this._personalData = data || {};
  }

  get personalData() {
    if (this._personalData) return this._personalData;

    return {
      PROFILE: window.PROFILE || {},
      PROJECTS: window.PROJECTS || [],
      EXPERIENCE: window.EXPERIENCE || [],
      API: window.API || {}
    };
  }

  configurePersonalAssistant(data) {
    this.personalData = data;
    return this;
  }

  escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[c]);
  }

  render() {
    const floating = this.mode === "floating";

    this.shadowRoot.innerHTML = `
<style>
:host {
  display:block;
  width:100%;
  color:#edf7ff;
  font-family:Inter,Arial,sans-serif;
  --cyan:#70eaff;
  --purple:#a78bfa;
}

* { box-sizing:border-box; }
button,input { font:inherit; }

.widget {
  width:100%;
  height:var(--chat-height,440px);
  min-height:320px;
  display:flex;
  justify-content:center;
  align-items:center;
  perspective:1300px;
  position:relative;
}

.floating-widget {
  position:fixed;
  z-index:999999;
  right:64px;
  bottom:24px;
  width:min(430px,calc(100vw - 28px));
  height:min(590px,calc(100vh - 95px));
  display:flex;
  align-items:flex-end;
  justify-content:flex-end;
  pointer-events:none;
}

.floating-widget .stage {
  display:none;
  width:100%;
  height:100%;
  pointer-events:auto;
}

.floating-widget.open .stage { display:block; }

.launcher {
  display:none;
  pointer-events:auto;
  width:66px;
  height:66px;
  border-radius:22px;
  border:1px solid #8beeff;
  color:#eaffff;
  font-size:23px;
  font-weight:800;
  cursor:pointer;
  background:linear-gradient(145deg,#1a3851,#17132e);
  box-shadow:0 0 18px #65eaff99,0 0 42px #9a75ff66;
  transition:.25s;
}

.launcher:hover {
  transform:translateY(-4px) scale(1.04);
}

.floating-widget:not(.open) .launcher {
  display:flex;
  align-items:center;
  justify-content:center;
}

.floating-widget.open .launcher { display:none; }

.stage {
  width:min(490px,96%);
  height:410px;
  position:relative;
  transform-style:preserve-3d;
  transform:rotateY(-7deg) rotateX(4deg) rotateZ(-2deg);
  transition:transform .2s ease;
  animation:float 6s ease-in-out infinite;
}

@keyframes float {
  0%,100% { translate:0 0; }
  50% { translate:0 -7px; }
}

.frame {
  position:absolute;
  inset:-5px;
  border-radius:29px;
  padding:2px;
  background:linear-gradient(
    135deg,
    #b28dff,
    #66edff 35%,
    #5869b9 70%,
    #bc92ff
  );
  box-shadow:
    0 0 14px #64dcffbb,
    0 0 38px #64dcff77,
    0 0 72px #a078ff55,
    0 18px 48px #000a;
  animation:glow 4s ease-in-out infinite alternate;
  transform:translateZ(-2px);
}

@keyframes glow {
  from { filter:brightness(.85); }
  to { filter:brightness(1.25); }
}

.card {
  position:absolute;
  inset:0;
  border-radius:25px;
  overflow:hidden;
  display:flex;
  flex-direction:column;
  background:linear-gradient(145deg,#101a2a,#050912);
  border:1px solid #ffffff35;
  box-shadow:inset 0 0 35px #64c8ff10;
  transform:translateZ(10px);
}

.header {
  height:68px;
  min-height:68px;
  display:flex;
  align-items:center;
  padding:0 15px;
  gap:11px;
  border-bottom:1px solid #ffffff1c;
  background:#ffffff08;
}

.logo {
  width:37px;
  height:37px;
  display:flex;
  align-items:center;
  justify-content:center;
  position:relative;
  font-size:22px;
  font-weight:900;
  color:#9cf4ff;
  text-shadow:0 0 12px #5feaff;
}

.logo:after {
  content:"";
  width:8px;
  height:8px;
  position:absolute;
  right:0;
  bottom:1px;
  background:#49ef9a;
  border-radius:50%;
  box-shadow:0 0 9px #49ef9a;
}

.brand { flex:1; min-width:0; }

.brand h3 {
  font-size:14px;
  letter-spacing:1.1px;
  margin:0;
}

.brand p {
  font-size:11px;
  color:#a8b7c6;
  margin:4px 0 0;
}

.online { color:#51e99b; }

.actions {
  display:flex;
  gap:10px;
  align-items:center;
}

.actions button {
  color:#b7c8d6;
  background:none;
  border:0;
  font-size:21px;
  cursor:pointer;
  padding:3px;
}

.actions button:hover {
  color:var(--cyan);
  text-shadow:0 0 12px var(--cyan);
}

.messages {
  flex:1;
  padding:18px 15px;
  display:flex;
  flex-direction:column;
  gap:15px;
  overflow-y:auto;
  scrollbar-width:thin;
  scrollbar-color:#34465b transparent;
}

.message {
  display:flex;
  align-items:flex-end;
  gap:9px;
  max-width:91%;
  animation:appear .25s ease;
}

.message.user {
  align-self:flex-end;
  flex-direction:row-reverse;
}

.message.ai { align-self:flex-start; }

@keyframes appear {
  from { opacity:0; transform:translateY(8px); }
  to { opacity:1; transform:translateY(0); }
}

.avatar {
  width:30px;
  height:30px;
  min-width:30px;
  display:flex;
  justify-content:center;
  align-items:center;
  border-radius:50%;
  background:linear-gradient(145deg,#304a70,#0c1728);
  color:#9df3ff;
  font-size:13px;
  font-weight:bold;
  box-shadow:0 0 10px #64d2ff33;
}

.user-avatar {
  background:linear-gradient(145deg,#9674c9,#45678c);
  color:white;
}

.bubble {
  padding:10px 13px;
  border-radius:15px;
  background:linear-gradient(135deg,#4b556199,#313847b3);
  border:1px solid #ffffff16;
  font-size:13px;
  line-height:1.5;
  color:#e7edf3;
  white-space:pre-wrap;
  overflow-wrap:anywhere;
}

.user .bubble {
  background:linear-gradient(125deg,#283a54,#4b3064);
  border:1px solid #88dfff88;
  box-shadow:0 0 12px #64c8ff22;
}

.typing {
  display:none;
  padding:0 20px 8px;
  color:var(--cyan);
  font-size:10px;
  letter-spacing:1px;
}

.typing.active { display:block; }

.typing span { animation:blink 1s infinite; }
.typing span:nth-child(2) { animation-delay:.2s; }
.typing span:nth-child(3) { animation-delay:.4s; }

@keyframes blink {
  50% { opacity:.15; }
}

.footer {
  min-height:68px;
  padding:9px 12px;
  border-top:1px solid #ffffff1c;
  background:#ffffff08;
}

.input-box {
  min-height:47px;
  display:flex;
  align-items:center;
  gap:8px;
  padding:5px 7px 5px 13px;
  border:1px solid #8cc8e159;
  border-radius:13px;
  background:#0000004d;
}

.input-box:focus-within {
  border-color:var(--cyan);
  box-shadow:0 0 13px #65eaff44;
}

.input-box input[type=text] {
  flex:1;
  min-width:0;
  background:none;
  border:0;
  outline:0;
  color:white;
  font-size:13px;
}

.input-box input::placeholder { color:#82909e; }

.icon-btn {
  display:flex;
  align-items:center;
  justify-content:center;
  padding:4px;
  border:0;
  background:none;
  color:#a8b5c2;
  cursor:pointer;
}

.icon-btn:hover {
  color:var(--cyan);
  filter:drop-shadow(0 0 5px var(--cyan));
  transform:scale(1.1);
}

.send {
  width:35px;
  height:35px;
  min-width:35px;
  border:0;
  border-radius:10px;
  background:linear-gradient(135deg,#50edff,#5373ff);
  color:white;
  font-size:19px;
  cursor:pointer;
  box-shadow:0 0 14px #55caff77;
}

.send:hover { transform:scale(1.07); }
.send:disabled { opacity:.5; cursor:not-allowed; }

.emoji-picker {
  display:none;
  position:absolute;
  bottom:78px;
  right:10px;
  width:min(315px,calc(100% - 20px));
  max-height:275px;
  overflow-y:auto;
  padding:12px;
  background:#0c1525;
  border:1px solid #64e1ff99;
  border-radius:15px;
  box-shadow:0 0 20px #50dcff44,0 0 35px #8c64ff33;
  z-index:30;
}

.emoji-picker.active {
  display:block;
  animation:appear .2s ease;
}

.emoji-header {
  display:flex;
  justify-content:space-between;
  align-items:center;
  padding:2px 0 11px;
  color:#80eaff;
  font-size:13px;
  font-weight:bold;
  position:sticky;
  top:-12px;
  background:#0c1525;
  z-index:2;
}

.emoji-header button {
  color:white;
  background:none;
  border:0;
  font-size:21px;
  cursor:pointer;
}

.emoji-category { margin-bottom:13px; }

.emoji-title {
  font-size:11px;
  color:#8da4ba;
  margin-bottom:7px;
}

.emoji-grid {
  display:grid;
  grid-template-columns:repeat(8,1fr);
  gap:4px;
}

.emoji-grid button {
  min-width:0;
  min-height:32px;
  padding:0;
  border:0;
  border-radius:7px;
  background:transparent;
  font-size:20px;
  cursor:pointer;
}

.emoji-grid button:hover {
  background:#64dcff33;
  transform:scale(1.18);
}

.search { display:none; padding:8px 13px; }
.search.active { display:block; }

.search input {
  width:100%;
  padding:8px;
  border-radius:8px;
  background:#172333;
  border:1px solid #526a7e;
  color:white;
  outline:0;
}

.menu {
  position:absolute;
  top:60px;
  right:10px;
  display:none;
  flex-direction:column;
  min-width:165px;
  background:#172536;
  border:1px solid #54718c;
  border-radius:10px;
  overflow:hidden;
  z-index:40;
  box-shadow:0 10px 30px #0008;
}

.menu.active { display:flex; }

.menu button {
  padding:11px 12px;
  color:white;
  text-align:left;
  background:transparent;
  border:0;
  cursor:pointer;
}

.menu button:hover { background:#30475e; }

.quick-questions {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  padding: 0 15px 13px;
}

.quick-questions button {
  padding: 8px 11px;
  border-radius: 20px;
  border: 1px solid #65dfff77;
  background: linear-gradient(135deg,#172d43,#242044);
  color: #a8edff;
  font-size: 11px;
  cursor: pointer;
  transition: .2s;
}

.quick-questions button:hover {
  background: linear-gradient(135deg,#24516b,#49336e);
  border-color: #70eaff;
  box-shadow: 0 0 12px #65eaff66;
  transform: translateY(-2px);
}

@media(max-width:550px) {
  .stage { width:94%; height:370px; }
  .header { height:60px; min-height:60px; padding:0 10px; }
  .brand h3 { font-size:12px; }
  .actions { gap:7px; }
  .actions button { font-size:19px; }
  .bubble { font-size:12px; padding:9px 11px; }
  .floating-widget {
    right:12px;
    bottom:12px;
    width:calc(100vw - 24px);
    height:min(520px,calc(100vh - 80px));
  }
}

@media(prefers-reduced-motion:reduce) {
  *,*:before,*:after {
    animation-duration:.01ms!important;
    animation-iteration-count:1!important;
    transition-duration:.01ms!important;
  }
}
</style>

<div class="${floating ? "floating-widget" : "widget"}" id="widget">

  <button class="launcher" id="launcher" aria-label="Open Syntax AI">
    S:
  </button>

  <div class="stage" id="stage">
    <div class="frame"></div>

    <section class="card" aria-label="Syntax AI chat">

      <header class="header">
        <div class="logo">S:</div>

        <div class="brand">
          <h3>${this.escapeHTML(this.title)}</h3>
          <p><span class="online">●</span> Active now</p>
        </div>

        <div class="actions">
          <button id="searchBtn" title="Search" aria-label="Search">⌕</button>
          <button id="callBtn" title="Voice action" aria-label="Voice action">♬</button>
          <button id="menuBtn" title="More options" aria-label="More options">⋮</button>
          ${floating ? '<button id="closeBtn" title="Close" aria-label="Close">×</button>' : ""}
        </div>
      </header>

      <div class="search" id="search">
        <input id="searchInput" placeholder="Search messages...">
      </div>

      <div class="menu" id="menu">
        <button id="clearBtn">🗑 Clear chat</button>
        <button id="exportBtn">⬇ Export chat</button>
        <button id="aboutBtn">ℹ About Syntax AI</button>
      </div>

      <main class="messages" id="messages" aria-live="polite">

  <div class="message ai">
    <div class="avatar">S:</div>
    <div class="bubble">
      Hello! 👋 I'm your personal AI assistant.

      Ask me anything about my skills, projects,
      experience and technologies. 😊
    </div>
  </div>

</main>

<div class="quick-questions">

  <button data-question="What are your skills?">
    💡 My Skills
  </button>

  <button data-question="Tell me about your projects.">
    🚀 My Projects
  </button>

  <button data-question="What is your experience?">
    👨‍💻 Experience
  </button>

  <button data-question="What technologies do you use?">
    ⚙️ Technologies
  </button>

</div>
      </main>

      <div class="typing" id="typing">
        SYNTAX AI IS THINKING
        <span>.</span><span>.</span><span>.</span>
      </div>

      <footer class="footer">
        <div class="input-box">

          <button class="icon-btn" id="emojiBtn"
            title="Emoji" aria-label="Choose emoji">😊</button>

          <button class="icon-btn" id="attachBtn"
            title="Attach file" aria-label="Attach file">
            <svg width="20" height="20" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" stroke-width="1.8"
              stroke-linecap="round" stroke-linejoin="round">
              <path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>
            </svg>
          </button>

          <input id="fileInput" type="file" multiple hidden>

          <input
            type="text"
            id="messageInput"
            placeholder="Message Syntax AI..."
            autocomplete="off"
          >

          <button class="send" id="sendBtn"
            title="Send" aria-label="Send message">➤</button>
        </div>
      </footer>

      <div class="emoji-picker" id="emojiPicker">
        <div class="emoji-header">
          Choose an emoji
          <button id="emojiClose" aria-label="Close emoji picker">×</button>
        </div>
        <div id="emojiCategories"></div>
      </div>

    </section>
  </div>
</div>
`;
  }

  bindEvents() {
    const $ = id => this.shadowRoot.getElementById(id);

this.shadowRoot
  .querySelectorAll(".quick-questions [data-question]")
  .forEach(button => {

    button.addEventListener("click", () => {

      const question = button.dataset.question;

      this.shadowRoot.getElementById("messageInput").value = question;

      this.sendMessage();

    });

  });

    $("sendBtn").addEventListener("click", () => this.sendMessage());

    $("messageInput").addEventListener("keydown", event => {
      if (event.key === "Enter") this.sendMessage();
    });

    $("emojiBtn").addEventListener("click", () => this.toggleEmoji());
    $("emojiClose").addEventListener("click", () => this.toggleEmoji(false));

    $("attachBtn").addEventListener("click", () => $("fileInput").click());

    $("fileInput").addEventListener("change", event => {
      this.attachFiles(event.target.files);
    });

    $("menuBtn").addEventListener("click", () => {
      $("menu").classList.toggle("active");
    });

    $("clearBtn").addEventListener("click", () => this.clearChat());
    $("exportBtn").addEventListener("click", () => this.exportChat());

    $("aboutBtn").addEventListener("click", () => {
      this.addMessage(
        "Syntax AI is a reusable neon 3D chat widget with personal assistant and API integration features.",
        "ai"
      );
      $("menu").classList.remove("active");
    });

    $("searchBtn").addEventListener("click", () => {
      $("search").classList.toggle("active");
      if ($("search").classList.contains("active")) $("searchInput").focus();
      else this.searchMessages("");
    });

    $("searchInput").addEventListener("input", event => {
      this.searchMessages(event.target.value);
    });

    $("callBtn").addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("syntax-call", {
        bubbles: true,
        composed: true
      }));
    });

    const launcher = $("launcher");
    if (launcher) launcher.addEventListener("click", () => this.open());

    const close = $("closeBtn");
    if (close) close.addEventListener("click", () => this.close());

    const stage = $("stage");

    stage.addEventListener("pointermove", event => {
      if (event.pointerType === "touch" || window.innerWidth < 700) return;

      const r = stage.getBoundingClientRect();
      const x = (event.clientX - r.left) / r.width - .5;
      const y = (event.clientY - r.top) / r.height - .5;

      stage.style.animation = "none";
      stage.style.transform =
        `rotateY(${-7 + x * 14}deg) rotateX(${4 - y * 12}deg) rotateZ(-2deg)`;
    });

    stage.addEventListener("pointerleave", () => {
      stage.style.transform = "rotateY(-7deg) rotateX(4deg) rotateZ(-2deg)";
      stage.style.animation = "";
    });
  }

  open() {
    this.shadowRoot.getElementById("widget").classList.add("open");

    this.dispatchEvent(new CustomEvent("syntax-open", {
      bubbles: true,
      composed: true
    }));
  }

  close() {
    this.shadowRoot.getElementById("widget").classList.remove("open");

    this.dispatchEvent(new CustomEvent("syntax-close", {
      bubbles: true,
      composed: true
    }));
  }

  buildEmojiPicker() {
    const data = {
      "Smileys & emotions":
        "😊 😂 🤣 😍 🥰 😘 😎 🤔 😢 😭 😡 🤯 🥳 😴 🙄 😇 😉 😁 😆 😋 🤗 🫡 🥹 🤩 😜 🤪 😏 😌 😬 🫠 🤭 🤫 😱 😨 😤 😈 👻 💀 🤖 👽",

      "Hands & gestures":
        "👍 👎 👏 🙌 👐 🤝 🙏 💪 👋 ✋ 🤞 ✌️ 🤟 👌 ☝️ 👆 👇 👉 👈 🫶 🖐️ 🤌 ✊ 👊",

      "Hearts & love":
        "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💖 💗 💓 💞 💕 💘 💝 💔 ❤️‍🔥 💟 ❣️ 💌 💋",

      "Animals & nature":
        "🐶 🐱 🐼 🦊 🐻 🐸 🐵 🦁 🐯 🐨 🐰 🐷 🐮 🦋 🌸 🌈 🐬 🦄 🐢 🐧 🦉 🐝 🌻 🌹",

      "Food & drinks":
        "🍕 🍔 🍟 🍩 🍰 🎂 🍎 🍉 🍓 🍒 🍇 ☕ 🍵 🧋 🍺 🍹 🍦 🍪 🍫 🥐 🍜 🍣 🥗 🍿",

      "Activities & celebration":
        "🎉 🎊 🎁 🎈 🚀 ⚽ 🏆 🎮 🎵 🎸 🎤 🎯 🎨 🏖️ ✈️ 🚗 🎓 🏅 🎭 🎬 🎧 🎹 🏋️ 🧘",

      "Objects & symbols":
        "💡 🔥 ⭐ ✨ 💎 💻 📱 📷 📌 🔔 💬 ⚡ ✅ ❌ 💯 🔑 📁 📂 📎 📝 📊 📈 🔍 ⚙️"
    };

    const container = this.shadowRoot.getElementById("emojiCategories");

    Object.entries(data).forEach(([name, values]) => {
      const section = document.createElement("div");
      section.className = "emoji-category";

      const title = document.createElement("div");
      title.className = "emoji-title";
      title.textContent = name;

      const grid = document.createElement("div");
      grid.className = "emoji-grid";

      values.split(" ").forEach(emoji => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = emoji;
        btn.title = emoji;

        btn.addEventListener("click", () => this.insertEmoji(emoji));

        grid.appendChild(btn);
      });

      section.append(title, grid);
      container.appendChild(section);
    });
  }

  toggleEmoji(force) {
    const picker = this.shadowRoot.getElementById("emojiPicker");

    picker.classList.toggle(
      "active",
      force === undefined ? !picker.classList.contains("active") : force
    );
  }

  insertEmoji(emoji) {
    const input = this.shadowRoot.getElementById("messageInput");

    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;

    input.value =
      input.value.slice(0, start) +
      emoji +
      input.value.slice(end);

    input.focus();

    const pos = start + emoji.length;
    input.setSelectionRange(pos, pos);
  }

  attachFiles(fileList) {
    Array.from(fileList || []).forEach(file => {
      this.files.push(file);

      this.addMessage("📎 Attached: " + file.name, "user");

      this.dispatchEvent(new CustomEvent("syntax-file", {
        detail: { file },
        bubbles: true,
        composed: true
      }));
    });

    this.shadowRoot.getElementById("fileInput").value = "";
  }

  addMessage(text, sender) {
    const message = document.createElement("div");
    message.className = "message " + sender;

    const avatar = document.createElement("div");
    avatar.className = "avatar " +
      (sender === "user" ? "user-avatar" : "");

    avatar.textContent = sender === "user" ? "👤" : "S:";

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = String(text);

    message.append(avatar, bubble);

    this.shadowRoot.getElementById("messages").appendChild(message);

    this.scrollToBottom();

    return message;
  }

  scrollToBottom() {
    const messages = this.shadowRoot.getElementById("messages");
    messages.scrollTop = messages.scrollHeight;
  }

  async sendMessage() {
    if (this.aiBusy) return;

    const input = this.shadowRoot.getElementById("messageInput");
    const text = input.value.trim();

    if (!text) return;

    this.aiBusy = true;

    const sendBtn = this.shadowRoot.getElementById("sendBtn");
    sendBtn.disabled = true;

    this.addMessage(text, "user");

    this.history.push({
      role: "user",
      content: text
    });

    input.value = "";
    this.toggleEmoji(false);

    const typing = this.shadowRoot.getElementById("typing");
    typing.classList.add("active");

    try {
      const api = this.personalData.API || {};

      const hasEndpoint = !!(
        this.endpoint ||
        (api.baseUrl && api.aiEndpoint)
      );

      const reply = hasEndpoint
        ? await this.callAPI(text)
        : await this.demoResponse(text);

      typing.classList.remove("active");

      this.addMessage(reply, "ai");

      this.history.push({
        role: "assistant",
        content: reply
      });

      this.dispatchEvent(new CustomEvent("syntax-message", {
        detail: {
          user: text,
          assistant: reply
        },
        bubbles: true,
        composed: true
      }));

    } catch (error) {
      console.error(error);

      typing.classList.remove("active");

      this.addMessage(
        "Sorry, something went wrong connecting to the AI service.",
        "ai"
      );

      this.dispatchEvent(new CustomEvent("syntax-error", {
        detail: { error },
        bubbles: true,
        composed: true
      }));

    } finally {
      this.aiBusy = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  // Optional real AI backend
  async callAPI(text) {
    const api = this.personalData.API || {};

    const url = this.endpoint ||
      (api.baseUrl && api.aiEndpoint
        ? api.baseUrl + api.aiEndpoint
        : "");

    if (!url) {
      throw new Error("No AI endpoint configured");
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify({
        message: text,
        history: this.history
      })
    });

    if (!response.ok) {
      throw new Error("AI API request failed: " + response.status);
    }

    const data = await response.json();

    return String(
      data.reply ??
      data.response ??
      data.message ??
      "No response received."
    );
  }

  // ==========================================
  // PERSONAL AI ASSISTANT
  // ==========================================

  getPersonalAssistantResponse(question) {
    const q = question.toLowerCase();

    const {
      PROFILE = {},
      PROJECTS = [],
      EXPERIENCE = []
    } = this.personalData;

    const skills = Array.isArray(PROFILE.skills)
      ? PROFILE.skills
      : ["Tekla Structures",
        "Trimble Connect",
        "SketchUp",
        "MCP Integration",
        "AI Agents",
        "Workflow Automation",
        "BIM",
        "API Development"];

    const projects = Array.isArray(PROJECTS)
      ? PROJECTS
      : [];

    const experience = Array.isArray(EXPERIENCE)
      ? EXPERIENCE
      : [];

    // Skills and expertise
    if (q.includes("skill") || q.includes("expertise")) {
      return skills.length
        ? "My areas of expertise include:\n\n" +
          skills.map(item => "• " + item).join("\n")
        : "My skills have not been added to the profile yet.";
    }

    // Projects and portfolio
    if (
      q.includes("project") ||
      q.includes("portfolio") ||
      q.includes("work")
    ) {
      return projects.length
        ? "Here are some projects in my portfolio:\n\n" +
          projects.map(item =>
            "• " + (item.title || "Project") +
            "\n" + (item.description || "")
          ).join("\n\n")
        : "There are no portfolio projects available in the profile yet.";
    }

    // Experience and career
    if (
      q.includes("experience") ||
      q.includes("career") ||
      q.includes("background")
    ) {
      return experience.length
        ? "Here are the professional milestones shown in my profile:\n\n" +
          experience.map(item =>
            "• " + (item.title || "Experience") +
            (item.date ? " (" + item.date + ")" : "") +
            "\n" + (item.description || "")
          ).join("\n\n")
        : "Professional experience has not been added to the profile yet.";
    }

    // Technologies and software
    if (
      q.includes("technology") ||
      q.includes("software") ||
      q.includes("tool")
    ) {
      return "Technologies featured in my profile include Tekla Structures, Trimble Connect, SketchUp, BIM, MCP, AI agents, JavaScript, C# and API integrations.";
    }

    // Contact details
    if (
      q.includes("contact") ||
      q.includes("email") ||
      q.includes("phone")
    ) {
      return "You can contact me through:\n\n" +
        "Email: " + (PROFILE.email || "Not provided") + "\n" +
        "Phone: " + (PROFILE.phone || "Not provided") + "\n" +
        "Location: " + (PROFILE.location || "Not provided");
    }

    // Personal introduction
    if (
      q.includes("name") ||
      q.includes("who are you")
    ) {
      return "I'm " +
        (PROFILE.name || "the profile owner") +
        ". " +
        (PROFILE.tagline || "Welcome to my profile!");
    }

    // BIM and construction technology
    if (
      ["tekla", "trimble", "sketchup", "mcp", "bim"]
        .some(word => q.includes(word))
    ) {
      return "My profile focuses on digital construction technologies, including Tekla Structures, Trimble Connect, SketchUp, BIM integration, MCP tools and AI-powered automation.";
    }

    return "Thanks for your question! I can provide information about my skills, projects, professional experience, technologies and contact details. Try asking one of those questions.";
  }

  // Local demonstration assistant
  async demoResponse(text) {
    await new Promise(resolve => setTimeout(resolve, 700));

    const q = text.toLowerCase();
    const profile = this.personalData.PROFILE || {};

    const hasPersonalProfile = !!(
      profile.name ||
      profile.skills ||
      this.personalData.PROJECTS ||
      this.personalData.EXPERIENCE
    );

    if (hasPersonalProfile) {
      return this.getPersonalAssistantResponse(text);
    }

    if (q.includes("hello") || q.includes("hi")) {
      return "Hello! 👋 Welcome to Syntax AI. How can I help you today?";
    }

    if (q.includes("api")) {
      return "You can connect Syntax AI through a REST API or an MCP-enabled backend. Let's configure your integration! 🚀";
    }

    if (q.includes("help")) {
      return "Absolutely! Tell me what you need help with.";
    }

    if (q.includes("who are you")) {
      return "I'm Syntax AI, your intelligent digital assistant. 🤖";
    }

    return "Thanks for your message! This is demo mode. Connect an API endpoint to receive real AI responses. ✨";
  }

  searchMessages(query) {
    const q = query.toLowerCase();

    this.shadowRoot.querySelectorAll(".message").forEach(message => {
      message.style.display =
        message.textContent.toLowerCase().includes(q)
          ? "flex"
          : "none";
    });
  }

  clearChat() {
    if (!window.confirm("Clear conversation?")) return;

    this.shadowRoot.getElementById("messages").replaceChildren();

    this.history = [];
    this.files = [];

    this.shadowRoot.getElementById("menu").classList.remove("active");
  }

  exportChat() {
    const content = this.history
      .map(item => `${item.role}: ${item.content}`)
      .join("\n\n");

    const blob = new Blob([content], {
      type: "text/plain;charset=utf-8"
    });

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "Syntax-AI-Chat.txt";
    a.click();

    setTimeout(() => URL.revokeObjectURL(url), 1000);

    this.shadowRoot.getElementById("menu").classList.remove("active");
  }
}

if (!customElements.get("syntax-ai-chat")) {
  customElements.define("syntax-ai-chat", SyntaxAIChat);
}
