const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;

function getClaudeCommand() {
  return 'claude';
}

function createWindow() {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: Math.min(1200, sw),
    height: Math.min(850, sh),
    minWidth: 700,
    minHeight: 500,
    frame: true,
    titleBarStyle: 'default',
    backgroundColor: '#0f0f1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

let claudeProcess = null;
let currentSessionId = null;

// IPC Handlers
ipcMain.handle('send-message', async (event, { message, sessionId, model, cwd, systemPrompt }) => {
  return new Promise((resolve, reject) => {
    const claudePath = getClaudeCommand();
    const workDir = cwd || app.getPath('documents');
    const args = [
      '--print',
      '--output-format', 'stream-json',
      '--verbose',
    ];

    if (sessionId) {
      args.push('--resume', sessionId);
    }
    if (model) {
      args.push('--model', model);
    }
    if (systemPrompt) {
      args.push('--append-system-prompt', systemPrompt);
    }

    const isWindows = process.platform === 'win32';

    if (isWindows) {
      // On Windows, use cmd /c to run claude through npm
      claudeProcess = spawn('cmd', ['/c', 'claude', ...args], {
        cwd: workDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });
    } else {
      claudeProcess = spawn('claude', args, {
        cwd: workDir,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      });
    }

    let buffer = '';
    let streamData = [];
    let resultData = null;

    claudeProcess.stdout.on('data', (data) => {
      buffer += data.toString();

      // Process complete JSON lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);

          if (parsed.type === 'system' && parsed.subtype === 'init') {
            currentSessionId = parsed.session_id;
            event.sender.send('session-init', {
              sessionId: parsed.session_id,
              model: parsed.model,
              tools: parsed.tools,
              skills: parsed.skills,
            });
          } else if (parsed.type === 'assistant') {
            const content = parsed.message?.content || [];
            for (const block of content) {
              if (block.type === 'text') {
                event.sender.send('stream-text', { text: block.text });
              } else if (block.type === 'thinking') {
                event.sender.send('stream-thinking', { thinking: block.thinking });
              } else if (block.type === 'tool_use') {
                event.sender.send('stream-tool-use', {
                  name: block.name,
                  input: block.input,
                });
              }
            }
            streamData.push(parsed);
          } else if (parsed.type === 'result') {
            resultData = parsed;
          }
        } catch (e) {
          // Skip malformed JSON lines
        }
      }
    });

    claudeProcess.stderr.on('data', (data) => {
      const text = data.toString();
      // Forward permission prompts and errors
      if (text.includes('Allow') || text.includes('permission') || text.includes('Error')) {
        event.sender.send('process-output', { type: 'stderr', text });
      }
    });

    claudeProcess.on('close', (code) => {
      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer);
          if (parsed.type === 'result') {
            resultData = parsed;
          }
        } catch (e) {}
      }

      if (resultData) {
        resolve({
          result: resultData.result,
          sessionId: resultData.session_id || currentSessionId,
          usage: resultData.usage,
          cost: resultData.total_cost_usd,
          duration: resultData.duration_ms,
          modelUsage: resultData.modelUsage,
          stopReason: resultData.stop_reason,
          isError: resultData.is_error,
          terminalReason: resultData.terminal_reason,
        });
      } else if (streamData.length > 0) {
        // Fallback: reconstruct from stream data
        const text = streamData
          .map(s => s.message?.content?.filter(c => c.type === 'text').map(c => c.text).join('') || '')
          .join('');
        resolve({
          result: text,
          sessionId: currentSessionId,
          isError: code !== 0,
        });
      } else {
        resolve({
          result: '',
          sessionId: currentSessionId,
          isError: true,
          error: `Process exited with code ${code}`,
        });
      }

      claudeProcess = null;
    });

    claudeProcess.on('error', (err) => {
      claudeProcess = null;
      reject(err);
    });

    // Send the message to Claude Code's stdin
    claudeProcess.stdin.write(message + '\n');
    claudeProcess.stdin.end();
  });
});

ipcMain.handle('abort-message', async () => {
  if (claudeProcess) {
    claudeProcess.kill('SIGTERM');
    claudeProcess = null;
    return { aborted: true };
  }
  return { aborted: false };
});

ipcMain.handle('get-session', async () => {
  return { sessionId: currentSessionId };
});

ipcMain.handle('clear-session', async () => {
  currentSessionId = null;
  return { cleared: true };
});

ipcMain.handle('check-claude', async () => {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    const proc = isWindows
      ? spawn('cmd', ['/c', 'claude', '--version'], { stdio: ['pipe', 'pipe', 'pipe'] })
      : spawn('claude', ['--version'], { stdio: ['pipe', 'pipe', 'pipe'] });

    let out = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    proc.on('close', (code) => {
      resolve({ available: code === 0, version: out.trim(), error: null });
    });
    proc.on('error', (err) => {
      resolve({ available: false, version: null, error: err.message });
    });
  });
});

ipcMain.handle('get-env', async () => {
  return {
    platform: process.platform,
    claudePath: getClaudeCommand(),
    homeDir: app.getPath('home'),
    documentsDir: app.getPath('documents'),
  };
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (claudeProcess) {
    claudeProcess.kill();
  }
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
