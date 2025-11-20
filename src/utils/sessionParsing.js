export const NO_REQUEST_TEXT = 'No user request found';
export const MAX_GAP_MS = 25 * 60 * 1000; // cap normal inactivity gaps at 25 minutes
export const INTERRUPT_GAP_MS = 60 * 60 * 1000; // treat gaps over an hour as session breaks

const isInstructionText = (text) => {
  if (typeof text !== 'string') return false;
  const trimmed = text.trim();
  return trimmed.startsWith('<') && trimmed.endsWith('>');
};

const getFirstUserRequest = (entries) => {
  for (const entry of entries) {
    const content = entry?.payload?.content;
    if (!Array.isArray(content)) continue;
    for (const piece of content) {
      if (piece?.type === 'input_text' && typeof piece.text === 'string') {
        const trimmed = piece.text.trim();
        const isAgentsPreface = trimmed.startsWith('# AGENTS.md instructions for');
        if (!isInstructionText(trimmed) && !isAgentsPreface) {
          return trimmed;
        }
      }
    }
  }
  return NO_REQUEST_TEXT;
};

export const formatDate = (value) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
};

export const formatDuration = (ms) => {
  if (!ms || ms < 1000) return '0s';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (!hours && !minutes && seconds) parts.push(`${seconds}s`);
  return parts.join(' ') || '0s';
};

// JSONL files here are pretty-printed blocks, so we collect full JSON objects
// by tracking brace depth (ignoring braces inside strings) before parsing.
export const parseJsonBlocks = (raw) => {
  const blocks = [];
  let buffer = [];
  let depth = 0;

  const flushBuffer = () => {
    if (!buffer.length) return;
    const block = buffer.join('\n').trim();
    buffer = [];
    if (!block) return;
    try {
      blocks.push(JSON.parse(block));
    } catch (err) {
      console.warn('Skipped malformed JSON block:', err);
    }
  };

  for (const line of (raw || '').split('\n')) {
    if (!buffer.length && !line.trim()) {
      continue;
    }

    const clean = line.replace(/"(?:\\.|[^"\\])*"/g, '');
    depth += (clean.match(/{/g) || []).length;
    depth -= (clean.match(/}/g) || []).length;

    buffer.push(line);

    if (depth === 0) {
      flushBuffer();
    }
  }

  if (depth === 0) {
    flushBuffer();
  }

  return blocks;
};

const collectMessages = (entries) => {
  return entries
    .filter((entry) => entry?.payload?.type === 'message')
    .map((entry) => {
      const role = entry?.payload?.role || 'unknown';
      const pieces = entry?.payload?.content || [];
      const text = pieces
        .map((piece) => {
          if (typeof piece?.text === 'string' && piece.text.trim()) {
            return piece.text.trim();
          }
          return '';
        })
        .filter(Boolean)
        .join('\n\n');
      return {
        role,
        text: text || '[no text]',
        timestamp: entry?.timestamp,
      };
    })
    .filter((msg) => msg.role === 'user' || msg.role === 'assistant');
};

const computeActiveDuration = (entries) => {
  let total = 0;
  let lastTs = null;

  for (const entry of entries) {
    const ts = new Date(entry?.timestamp || 0).getTime();
    if (Number.isNaN(ts)) continue;

    if (lastTs !== null) {
      const diff = ts - lastTs;
      if (diff > 0) {
        if (diff > INTERRUPT_GAP_MS) {
          // Very large gaps indicate the user left entirely; skip counting them.
        } else {
          total += Math.min(diff, MAX_GAP_MS);
        }
      }
    }

    lastTs = ts;
  }

  return total;
};

const parseSingleSession = ({ path, raw }) => {
  const entries = parseJsonBlocks(raw);
  const messages = collectMessages(entries);
  const userCommandCount = messages.filter((msg) => msg.role === 'user').length;
  const activeMs = computeActiveDuration(entries);

  const first = entries[0] || {};
  const last = entries[entries.length - 1] || {};

  const cwd = first?.payload?.cwd || '';
  const cwdParts = cwd.split('/').filter(Boolean);
  const projectName = cwdParts[cwdParts.length - 1] || 'Unknown project';

  return {
    id: path,
    fileName: path.split('/').pop(),
    projectName,
    createdAt: first?.timestamp || '',
    lastMessageAt: last?.timestamp || '',
    firstRequest: getFirstUserRequest(entries),
    entryCount: messages.length,
    messages,
    userCommandCount,
    sessionId: first?.payload?.id || 'unknown-id',
    cwd,
    relativePath: path.replace(/^(\.\.\/)+sessions\//, ''),
    fullPath: path.replace('../', ''),
    activeMs,
    activeDuration: formatDuration(activeMs),
  };
};

export const parseSessions = (rawFiles) =>
  (rawFiles || [])
    .map((file) => parseSingleSession(file))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
