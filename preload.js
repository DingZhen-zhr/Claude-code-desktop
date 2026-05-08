const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('claudeAPI', {
  sendMessage: (opts) => ipcRenderer.invoke('send-message', opts),
  abortMessage: () => ipcRenderer.invoke('abort-message'),
  getSession: () => ipcRenderer.invoke('get-session'),
  clearSession: () => ipcRenderer.invoke('clear-session'),
  checkClaude: () => ipcRenderer.invoke('check-claude'),
  getEnv: () => ipcRenderer.invoke('get-env'),

  // Event listeners
  onStreamText: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('stream-text', listener);
    return () => ipcRenderer.removeListener('stream-text', listener);
  },
  onStreamThinking: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('stream-thinking', listener);
    return () => ipcRenderer.removeListener('stream-thinking', listener);
  },
  onStreamToolUse: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('stream-tool-use', listener);
    return () => ipcRenderer.removeListener('stream-tool-use', listener);
  },
  onSessionInit: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('session-init', listener);
    return () => ipcRenderer.removeListener('session-init', listener);
  },
  onProcessOutput: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('process-output', listener);
    return () => ipcRenderer.removeListener('process-output', listener);
  },
});
