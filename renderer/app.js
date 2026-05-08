// === State ===
const state = {
  sessionId: null,
  isStreaming: false,
  currentAssistantMsg: null,
  currentThinkingEl: null,
  settings: {
    cwd: '',
    systemPrompt: '',
    temperature: 0.7,
    permissionMode: 'default',
    model: '',
  },
};

// === DOM ===
const dom = {
  chatContainer: document.getElementById('chat-container'),
  messagesArea: document.getElementById('messages-area'),
  welcomeScreen: document.getElementById('welcome-screen'),
  input: document.getElementById('message-input'),
  btnSend: document.getElementById('btn-send'),
  statusIndicator: document.getElementById('status-indicator'),
  modelSelector: document.getElementById('model-selector'),
  sessionIndicator: document.getElementById('session-indicator'),
  sessionIdDisplay: document.getElementById('session-id-display'),
  btnNewSession: document.getElementById('btn-new-session'),
  btnNewChat: document.getElementById('btn-new-chat'),
  btnSettings: document.getElementById('btn-sidebar-settings'),
  btnCloseSettings: document.getElementById('btn-close-settings'),
  settingsOverlay: document.getElementById('settings-overlay'),
  settingsPanel: document.getElementById('settings-panel'),
  settingsCwd: document.getElementById('settings-cwd'),
  settingsSystemPrompt: document.getElementById('settings-system-prompt'),
  settingsTemperature: document.getElementById('settings-temperature'),
  settingsPermission: document.getElementById('settings-permission'),
  tempDisplay: document.getElementById('temp-display'),
};

// === Markdown renderer ===
function renderMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
    .replace(/\n/g, '<br>');
}

// === Helpers ===
function autoResize() {
  dom.input.style.height = 'auto';
  dom.input.style.height = Math.min(dom.input.scrollHeight, 150) + 'px';
}

function setStatus(type, text) {
  dom.statusIndicator.className = 'status-badge ' + type;
  dom.statusIndicator.textContent = text || type;
}

function scrollBottom() {
  requestAnimationFrame(() => {
    dom.chatContainer.scrollTop = dom.chatContainer.scrollHeight;
  });
}

function timeStr() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// === Build message elements ===
function createUserMsg(text) {
  const el = document.createElement('div');
  el.className = 'message user';
  el.innerHTML = `
    <div class="msg-avatar">U</div>
    <div class="msg-content">
      <div class="msg-header">
        <span class="msg-role">You</span>
        <span class="msg-time">${timeStr()}</span>
      </div>
      <div class="msg-body">${renderMarkdown(text)}</div>
    </div>
  `;
  return el;
}

function createAssistantMsg() {
  const el = document.createElement('div');
  el.className = 'message assistant';
  el.innerHTML = `
    <div class="msg-avatar">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
      </svg>
    </div>
    <div class="msg-content">
      <div class="msg-header">
        <span class="msg-role">Claude Code</span>
        <span class="msg-time">${timeStr()}</span>
      </div>
      <div class="thinking-area"></div>
      <div class="tools-strip"></div>
      <div class="msg-body"></div>
      <div class="msg-meta hidden"></div>
    </div>
  `;
  return el;
}

function addThinkingBlock(container, text) {
  const div = document.createElement('div');
  div.className = 'thinking-block';
  div.innerHTML = `
    <div class="thinking-header">
      <span>Thinking</span>
      <div class="thinking-dots"><span></span><span></span><span></span></div>
    </div>
    <div class="thinking-body">${text || ''}</div>
  `;
  container.appendChild(div);
  return div.querySelector('.thinking-body');
}

function addToolChip(container, name) {
  const labels = {
    Bash: 'Run command', Edit: 'Edit file', Read: 'Read file',
    Write: 'Write file', Glob: 'Search files', Grep: 'Search content',
    WebFetch: 'Fetch URL', WebSearch: 'Search web', Task: 'Task',
  };
  const chip = document.createElement('span');
  chip.className = 'tool-chip';
  chip.textContent = labels[name] || name;
  container.appendChild(chip);
}

function renderMeta(msgEl, data) {
  const meta = msgEl.querySelector('.msg-meta');
  if (!meta) return;
  const parts = [];
  if (data.duration) {
    const d = data.duration < 1000 ? data.duration + 'ms' : (data.duration / 1000).toFixed(1) + 's';
    parts.push(`<span class="meta-chip">${d}</span>`);
  }
  if (data.cost) {
    parts.push(`<span class="meta-chip">$${data.cost.toFixed(4)}</span>`);
  }
  if (data.usage) {
    parts.push(`<span class="meta-chip">${(data.usage.input_tokens || 0).toLocaleString()} → ${(data.usage.output_tokens || 0).toLocaleString()} tok</span>`);
  }
  if (data.modelUsage) {
    const k = Object.keys(data.modelUsage)[0];
    if (k) parts.push(`<span class="meta-chip">${k}</span>`);
  }
  if (parts.length) {
    meta.innerHTML = parts.join('');
    meta.classList.remove('hidden');
  }
}

// === Send ===
async function sendMessage() {
  const text = dom.input.value.trim();
  if (!text || state.isStreaming) return;

  dom.input.value = '';
  autoResize();
  dom.welcomeScreen.classList.add('hidden');

  // User message
  dom.messagesArea.appendChild(createUserMsg(text));
  scrollBottom();

  // Assistant container
  state.currentAssistantMsg = createAssistantMsg();
  dom.messagesArea.appendChild(state.currentAssistantMsg);
  scrollBottom();

  const msgBody = state.currentAssistantMsg.querySelector('.msg-body');
  const thinkArea = state.currentAssistantMsg.querySelector('.thinking-area');
  const toolsStrip = state.currentAssistantMsg.querySelector('.tools-strip');

  // Thinking indicator
  const thinkEl = addThinkingBlock(thinkArea, '');
  state.currentThinkingEl = thinkEl;

  // UI state
  state.isStreaming = true;
  dom.btnSend.classList.add('stop');
  dom.btnSend.title = 'Stop';
  setStatus('sending', 'Sending...');

  // Streaming DOM — build up front to avoid TDZ
  const textSpan = document.createElement('span');
  msgBody.appendChild(textSpan);
  const cursor = document.createElement('span');
  cursor.className = 'streaming-cursor';
  msgBody.appendChild(cursor);

  const removeCursor = () => { if (cursor && cursor.parentNode) cursor.remove(); };

  // IPC listeners
  const unsub = [];

  unsub.push(window.claudeAPI.onStreamText((data) => {
    setStatus('streaming', 'Streaming');
    if (state.currentThinkingEl) {
      const p = state.currentThinkingEl.closest('.thinking-block');
      if (p) p.remove();
      state.currentThinkingEl = null;
    }
    textSpan.textContent += data.text;
    msgBody.appendChild(cursor);
    scrollBottom();
  }));

  unsub.push(window.claudeAPI.onStreamThinking((data) => {
    if (state.currentThinkingEl) state.currentThinkingEl.textContent = data.thinking;
    scrollBottom();
  }));

  unsub.push(window.claudeAPI.onStreamToolUse((data) => {
    addToolChip(toolsStrip, data.name);
    scrollBottom();
  }));

  unsub.push(window.claudeAPI.onSessionInit((data) => {
    state.sessionId = data.sessionId;
    dom.sessionIndicator.classList.remove('hidden');
    dom.sessionIdDisplay.textContent = data.sessionId.substring(0, 8) + '…';
  }));

  try {
    const result = await window.claudeAPI.sendMessage({
      message: text,
      sessionId: state.sessionId,
      model: state.settings.model || undefined,
      systemPrompt: state.settings.systemPrompt || undefined,
      cwd: state.settings.cwd || undefined,
    });

    unsub.forEach(fn => fn());

    if (result.sessionId) {
      state.sessionId = result.sessionId;
      dom.sessionIndicator.classList.remove('hidden');
      dom.sessionIdDisplay.textContent = result.sessionId.substring(0, 8) + '…';
    }

    if (result.isError && !textSpan.textContent) {
      textSpan.textContent = 'Error: ' + (result.error || 'Request failed');
      setStatus('error', 'Error');
    } else {
      removeCursor();
      renderMeta(state.currentAssistantMsg, result);
      setStatus('idle', 'Idle');
    }
  } catch (err) {
    unsub.forEach(fn => fn());
    removeCursor();
    textSpan.textContent = 'Error: ' + err.message;
    setStatus('error', 'Error');
  }

  state.isStreaming = false;
  state.currentAssistantMsg = null;
  state.currentThinkingEl = null;
  dom.btnSend.classList.remove('stop');
  dom.btnSend.title = 'Send';
}

// === Stop ===
async function stopGeneration() {
  if (!state.isStreaming) return;
  await window.claudeAPI.abortMessage();
  state.isStreaming = false;
  if (state.currentAssistantMsg) {
    const c = state.currentAssistantMsg.querySelector('.streaming-cursor');
    if (c) c.remove();
  }
  dom.btnSend.classList.remove('stop');
  dom.btnSend.title = 'Send';
  setStatus('idle', 'Idle');
}

// === New session ===
async function newSession() {
  await window.claudeAPI.clearSession();
  state.sessionId = null;
  dom.sessionIndicator.classList.add('hidden');
  dom.messagesArea.innerHTML = '';
  dom.welcomeScreen.classList.remove('hidden');
}

// === Settings ===
function openSettings() {
  dom.settingsOverlay.classList.remove('hidden');
  dom.settingsPanel.classList.remove('hidden');
}

function closeSettings() {
  dom.settingsOverlay.classList.add('hidden');
  dom.settingsPanel.classList.add('hidden');
}

// === Init ===
async function init() {
  const env = await window.claudeAPI.getEnv();
  console.log('Env:', env);

  const cc = await window.claudeAPI.checkClaude();
  if (cc.available) {
    console.log('Claude Code', cc.version);
    setStatus('idle', 'Idle');
  } else {
    const err = document.createElement('div');
    err.style.cssText = 'color:var(--red);font-size:13px;padding:16px 24px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:8px;margin:16px 24px;';
    err.textContent = 'Claude Code CLI not found. Run: npm install -g @anthropic-ai/claude-code';
    dom.welcomeScreen.appendChild(err);
    dom.input.disabled = true;
    dom.btnSend.disabled = true;
  }
}

// === Events ===
dom.input.addEventListener('input', autoResize);

dom.btnSend.addEventListener('click', () => {
  state.isStreaming ? stopGeneration() : sendMessage();
});

dom.input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  } else if (e.key === 'Escape') {
    if (state.isStreaming) stopGeneration();
  }
});

dom.btnNewSession.addEventListener('click', newSession);
dom.btnNewChat.addEventListener('click', newSession);

dom.btnSettings.addEventListener('click', openSettings);
dom.btnCloseSettings.addEventListener('click', closeSettings);
dom.settingsOverlay.addEventListener('click', closeSettings);

dom.modelSelector.addEventListener('change', () => {
  state.settings.model = dom.modelSelector.value;
});

dom.settingsTemperature.addEventListener('input', () => {
  state.settings.temperature = parseFloat(dom.settingsTemperature.value);
  dom.tempDisplay.textContent = state.settings.temperature.toFixed(1);
});

dom.settingsPermission.addEventListener('change', () => {
  state.settings.permissionMode = dom.settingsPermission.value;
});

dom.settingsCwd.addEventListener('change', () => {
  state.settings.cwd = dom.settingsCwd.value;
});

dom.settingsSystemPrompt.addEventListener('change', () => {
  state.settings.systemPrompt = dom.settingsSystemPrompt.value;
});

document.addEventListener('keydown', (e) => {
  if ((e.key === ',' || e.key === 's') && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    if (e.key === ',') openSettings();
  }
});

init();
