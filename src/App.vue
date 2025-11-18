<script setup>
import { computed, ref } from 'vue';

// Merge real sessions (nested by date) and fallback examples.
const fetchSessionIndex = async () => {
  try {
    const res = await fetch('/__sessions_index');
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn('Failed to fetch sessions index', err);
    return [];
  }
};

const loadSessions = async () => {
  const index = await fetchSessionIndex();
  const items = await Promise.all(
    index.map(async ({ rel, url }) => {
      try {
        const res = await fetch(`${url}?t=${Date.now()}`);
        if (!res.ok) return null;
        const raw = await res.text();
        return { path: rel, raw };
      } catch (err) {
        console.warn('Failed to load session', url, err);
        return null;
      }
    }),
  );
  return items.filter(Boolean);
};

const rawSessionFiles = ref([]);

const isInstructionText = (text) => {
  if (typeof text !== 'string') return false;
  const trimmed = text.trim();
  return trimmed.startsWith('<') && trimmed.endsWith('>');
};

const NO_REQUEST_TEXT = 'No user request found';

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

const formatDate = (value) => {
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

const formatDuration = (ms) => {
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
const parseJsonBlocks = (raw) => {
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

const parseSessions = () => {
  return rawSessionFiles.value.map(({ path, raw }) => {
    const entries = parseJsonBlocks(raw);
    const messages = collectMessages(entries);
    const userCommandCount = messages.filter((msg) => msg.role === 'user').length;

    const computeActiveDuration = () => {
      let total = 0;
      let lastTs = null;

      for (const entry of entries) {
        const ts = new Date(entry?.timestamp || 0).getTime();
        if (Number.isNaN(ts)) continue;

        if (lastTs !== null) {
          const diff = ts - lastTs;
          if (diff > 0) {
            total += Math.min(diff, MAX_GAP_MS);
          }
        }

        lastTs = ts;
      }

      return total;
    };

    const activeMs = computeActiveDuration();

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
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

const showEmpty = ref(false);

const sessions = computed(() => {
  let list = parseSessions();
  if (!showEmpty.value) {
    list = list.filter((session) => session.firstRequest !== NO_REQUEST_TEXT);
  }
  return list;
});

const sessionsList = computed(() => {
  const unique = new Map();
  sessions.value.forEach((s) => {
    const key = s.sessionId || s.id;
    const current = unique.get(key);
    if (!current) {
      unique.set(key, s);
      return;
    }
    const currentTime = new Date(current.createdAt || 0).getTime();
    const newTime = new Date(s.createdAt || 0).getTime();
    if (newTime > currentTime) {
      unique.set(key, s);
    }
  });
  return Array.from(unique.values());
});

const groupBy = ref('project');

const groupOptions = [
  { title: 'By project', value: 'project' },
  { title: 'By date', value: 'date' },
  { title: 'No grouping', value: 'none' },
];

const formatDay = (value) => {
  if (!value) return 'Unknown date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

const groupedSessions = computed(() => {
  const list = sessionsList.value;
  if (groupBy.value === 'none') {
    return [{ label: null, items: list }];
  }

  const map = new Map();
  list.forEach((session) => {
    const key =
      groupBy.value === 'project'
        ? session.projectName || 'Unknown project'
        : formatDay(session.createdAt);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(session);
  });

  let sorted;
  if (groupBy.value === 'date') {
    sorted = Array.from(map.entries()).sort((a, b) =>
      new Date(b[0]).getTime() - new Date(a[0]).getTime(),
    );
  } else {
    sorted = Array.from(map.entries()).sort((a, b) =>
      String(a[0]).localeCompare(String(b[0])),
    );
  }

  return sorted.map(([label, items]) => {
    const totalActiveMs = items.reduce((sum, session) => sum + (session.activeMs || 0), 0);
    const totalUserCommands = items.reduce(
      (sum, session) => sum + (session.userCommandCount || 0),
      0,
    );
    return {
      label,
      items,
      summary: {
        active: formatDuration(totalActiveMs),
        userCommands: totalUserCommands,
      },
    };
  });
});

const dialogSession = ref(null);
const dialogOpen = ref(false);

const refreshSessions = async () => {
  rawSessionFiles.value = await loadSessions();
};

refreshSessions();

const MAX_GAP_MS = 20 * 60 * 1000; // cap inactivity gaps at 20 minutes

const projectColors = [
  '#eef2ff', // indigo 50
  '#ecfeff', // cyan 50
  '#f0fdf4', // green 50
  '#fff7ed', // orange 50
  '#fdf2f8', // pink 50
  '#f0f9ff', // sky 50
  '#fef3c7', // amber 100
  '#e0f2fe', // blue 100
  '#f5f3ff', // violet 50
  '#e7f5ff', // light blue
  '#fff0f6', // rose 50
  '#f2fce7', // lime 50
  '#fef9c3', // yellow 100
  '#e4e8ff', // periwinkle
  '#e8fff3', // mint
  '#fdf4ff', // fuchsia 50
];

const projectTone = (projectName) => {
  let hash = 0;
  for (const ch of projectName || '') {
    hash = (hash + ch.charCodeAt(0)) % 997;
  }
  return projectColors[hash % projectColors.length];
};

const removeRoot = (import.meta.env.SESSIONS_ROOT_PATH || '').replace(/\/$/, '');

const openSession = (session) => {
  dialogSession.value = session;
  dialogOpen.value = true;
};

const closeSession = () => {
  dialogOpen.value = false;
  dialogSession.value = null;
};

const copyResume = async (session) => {
  const cmd = `cd ${session.cwd} && codex resume ${session.sessionId}`;
  try {
    await navigator.clipboard.writeText(cmd);
  } catch (err) {
    console.warn('Clipboard copy failed', err);
  }
};

const copyNewSession = async (session) => {
  const cmd = `cd ${session.cwd} && codex`;
  try {
    await navigator.clipboard.writeText(cmd);
  } catch (err) {
    console.warn('Clipboard copy failed', err);
  }
};

const copyRemove = async (session) => {
  const rel = (session.relativePath || session.fullPath || '').replace(/^\/+/, '');
  const base = removeRoot ? `${removeRoot}/${rel}` : rel;
  const cmd = `rm ${base}`;
  try {
    await navigator.clipboard.writeText(cmd);
  } catch (err) {
    console.warn('Clipboard copy failed', err);
  }
};
</script>

<template>
  <v-app>
    <v-main>
      <v-container fluid class="pt-0 pb-6 px-0">
        <div class="header-sticky d-flex align-center justify-space-between flex-wrap px-4 px-md-6">
          <div>
            <h1 class="text-h4 font-weight-bold mb-1">Codex Sessions Manager</h1>
            <p class="text-body-2 text-medium-emphasis">
              Showcase of recorded coding agent sessions parsed from JSONL archives.
            </p>
          </div>
          <div class="d-flex align-center gap-3 flex-wrap">
            <v-btn-toggle
              v-model="groupBy"
              divided
              density="comfortable"
              class="group-toggle mr-3"
            >
              <v-btn
                v-for="option in groupOptions"
                :key="option.value"
                :value="option.value"
                variant="outlined"
              >
                {{ option.title }}
              </v-btn>
            </v-btn-toggle>
            <v-chip color="primary" variant="flat" class="text-body-2">
              {{ sessions.length }} sessions
            </v-chip>
            <v-checkbox
              v-model="showEmpty"
              density="compact"
              hide-details
              label="Show empty sessions"
              class="ml-2"
            />
            <v-btn
              color="primary"
              variant="flat"
              size="small"
              class="refresh-btn"
              @click="refreshSessions"
            >
              <v-icon size="16" class="mr-1" icon="mdi-refresh"></v-icon>
              Refresh
            </v-btn>
          </div>
        </div>

        <div class="page-pad">
          <div v-for="group in groupedSessions" :key="group.label || 'all'" class="mb-6">
            <div v-if="group.label" class="d-flex align-center mb-2">
              <div class="text-subtitle-1 font-weight-semibold text-medium-emphasis mr-2">
                {{ group.label }}
              </div>
              <div class="text-body-2 text-medium-emphasis mr-3">
                {{ group.summary.userCommands }} user cmds • {{ group.summary.active }} active
              </div>
              <v-spacer />
              <v-btn
                v-if="groupBy === 'project'"
                color="primary"
                variant="text"
                size="small"
                title="Copy to clipboard"
                @click="copyNewSession(group.items[0])"
              >
                <v-icon size="16" class="mr-1" icon="mdi-plus-circle-outline"></v-icon>
                New session cmd
              </v-btn>
            </div>
            <v-row dense>
              <v-col
                v-for="session in group.items"
                :key="session.id"
                cols="12"
                md="6"
                lg="4"
              >
                <v-card
                  elevation="2"
                  class="h-100 card-shaded"
                  :style="{ backgroundColor: projectTone(session.projectName) }"
                >
                  <v-card-item>
                    <div class="d-flex align-center justify-space-between mb-2">
                      <v-avatar color="primary" variant="tonal" size="40" class="mr-3">
                        <v-icon icon="mdi-folder-cog" color="primary"></v-icon>
                      </v-avatar>
                      <div class="mr-auto">
                        <div class="text-subtitle-1 font-weight-bold">
                          {{ session.projectName }}
                        </div>
                        <div class="text-caption text-medium-emphasis">
                          ID: {{ session.sessionId }}
                        </div>
                      </div>
                      <v-chip size="small" color="primary" variant="tonal" class="ml-2">
                        {{ session.entryCount }} entries
                      </v-chip>
                    </div>

                    <v-divider class="my-3" />

                    <div class="d-flex flex-column flex-md-row justify-space-between gap-4">
                      <div class="d-flex align-center">
                        <v-icon icon="mdi-calendar-start" color="primary" size="18" class="mr-2"></v-icon>
                        <div>
                          <div class="text-caption text-medium-emphasis">Created</div>
                          <div class="text-body-2">{{ formatDate(session.createdAt) }}</div>
                        </div>
                      </div>
                      <div class="d-flex align-center">
                        <v-icon icon="mdi-clock-outline" color="primary" size="18" class="mr-2"></v-icon>
                        <div>
                          <div class="text-caption text-medium-emphasis">Last message</div>
                          <div class="text-body-2">{{ formatDate(session.lastMessageAt) }}</div>
                        </div>
                      </div>
                      <div class="d-flex align-center">
                        <v-icon icon="mdi-timer-sand" color="primary" size="18" class="mr-2"></v-icon>
                        <div>
                          <div class="text-caption text-medium-emphasis">Active</div>
                          <div class="text-body-2">{{ session.activeDuration }}</div>
                        </div>
                      </div>
                    </div>
                  </v-card-item>

                  <v-divider />

                  <v-card-text>
                    <div class="text-caption text-medium-emphasis mb-2">First user request</div>
                    <div class="text-body-2 line-clamp">
                      {{ session.firstRequest }}
                    </div>
                  </v-card-text>

                  <v-card-actions class="action-row">
                    <div class="d-flex align-center action-buttons">
                      <v-btn
                        color="primary"
                        variant="flat"
                        size="small"
                        title="Copy to clipboard"
                        @click="copyResume(session)"
                      >
                        <v-icon size="16" class="mr-1" icon="mdi-play-circle-outline"></v-icon>
                        Resume cmd
                      </v-btn>
                      <v-btn
                        color="red"
                        variant="flat"
                        size="small"
                        class="ml-2"
                        title="Copy to clipboard"
                        @click="copyRemove(session)"
                      >
                        <v-icon size="16" class="mr-1" icon="mdi-delete-outline"></v-icon>
                        Remove cmd
                      </v-btn>
                      <v-spacer />
                      <v-btn
                        color="primary"
                        variant="flat"
                        size="small"
                        @click="openSession(session)"
                      >
                        <v-icon size="16" class="mr-1" icon="mdi-chat-outline"></v-icon>
                        Show more
                      </v-btn>
                    </div>
                  </v-card-actions>
                </v-card>
              </v-col>
            </v-row>
          </div>

          <v-alert
          v-if="!sessions.length"
          type="info"
          variant="tonal"
          class="mt-4"
            >
              No session files found in the examples folder.
            </v-alert>
        </div>
      </v-container>

      <v-dialog
        v-model="dialogOpen"
        max-width="800"
        scrollable
      >
        <v-card v-if="dialogSession">
          <v-card-title class="d-flex align-center">
            <div>
              <div class="text-subtitle-1 font-weight-bold">
                {{ dialogSession.projectName }}
              </div>
              <div class="text-caption text-medium-emphasis">
                ID: {{ dialogSession.sessionId }}
              </div>
            </div>
            <v-spacer />
            <v-btn
              color="primary"
              variant="flat"
              size="small"
              class="mr-2"
              title="Copy to clipboard"
              @click="copyResume(dialogSession)"
            >
              <v-icon size="16" class="mr-1" icon="mdi-play-circle-outline"></v-icon>
              Resume cmd
            </v-btn>
            <v-btn icon="mdi-close" variant="text" @click="closeSession" />
          </v-card-title>

          <v-card-text class="chat-scroll">
            <div class="d-flex flex-column gap-3">
              <div
                v-for="(msg, idx) in dialogSession.messages"
                :key="`${dialogSession.id}-${idx}`"
                :class="[
                  'chat-row',
                  msg.role === 'assistant' ? 'is-assistant' : 'is-user',
                ]"
              >
                <div class="chat-meta text-caption text-medium-emphasis mb-1">
                  <v-icon
                    size="16"
                    class="mr-1"
                    :icon="msg.role === 'assistant' ? 'mdi-robot-outline' : 'mdi-account-circle'"
                  />
                  <span class="mr-2 text-uppercase">
                    {{ msg.role }}
                  </span>
                  <span>{{ formatDate(msg.timestamp) }}</span>
                </div>
                <div class="chat-bubble text-body-2">
                  <pre class="ma-0">{{ msg.text }}</pre>
                </div>
              </div>
            </div>
          </v-card-text>

          <v-card-actions>
            <v-spacer />
            <v-btn color="primary" variant="flat" @click="closeSession">Close</v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </v-main>
  </v-app>
</template>

<style scoped>
.line-clamp {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.chat-scroll {
  max-height: 70vh;
}

.chat-row {
  display: flex;
  flex-direction: column;
  margin-bottom: 20px;
}

.chat-row.is-user {
  align-items: flex-start;
}

.chat-row.is-assistant {
  align-items: flex-end;
}

.chat-bubble {
  background: #f4f6f8;
  border-radius: 10px;
  padding: 10px 12px;
  max-width: 100%;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.chat-row.is-assistant .chat-bubble {
  background: #e0e7ff;
}

.chat-bubble pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.card-shaded {
  border: 1px solid rgba(0, 0, 0, 0.04);
}

.group-toggle {
  min-width: 260px;
}

.action-buttons {
  width: 100%;
  align-items: center;
}

.header-sticky {
  position: sticky;
  top: 0;
  z-index: 10;
  padding: 16px 0 22px;
  margin: 0;
  background: rgba(244, 246, 248, 0.88);
  backdrop-filter: blur(6px);
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.06);
}

.page-pad {
  padding: 28px 16px 0;
}

@media (min-width: 960px) {
  .page-pad {
    padding: 24px 24px 0;
  }
}

:global(.v-main) {
  padding-top: 0 !important;
}

.refresh-btn {
  margin-left: 8px;
}

.card-shaded {
  border: 1px solid rgba(0, 0, 0, 0.04);
  position: relative;
  overflow: hidden;
}

.group-toggle {
  min-width: 260px;
}

.action-row {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -10px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease, transform 0.25s ease;
  background: rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(4px);
  color: #fff;
  border-top-left-radius: 0;
  border-top-right-radius: 0;
  border-bottom-left-radius: 10px;
  border-bottom-right-radius: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.15);
  padding: 14px 12px 22px;
  transform: translateY(10px);
}

.card-shaded:hover .action-row {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}
</style>
