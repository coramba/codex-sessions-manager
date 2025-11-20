<script setup>
import { computed, ref } from 'vue';
import ChatDialog from './components/ChatDialog.vue';
import SessionCard from './components/SessionCard.vue';
import SessionHeader from './components/SessionHeader.vue';
import { loadSessions } from './utils/sessionApi';
import { NO_REQUEST_TEXT, formatDate, formatDuration, parseSessions } from './utils/sessionParsing';
import { projectTone } from './utils/projectTone';

const rawSessionFiles = ref([]);

const showEmpty = ref(false);

const sessions = computed(() => {
  let list = parseSessions(rawSessionFiles.value);
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
        <SessionHeader
          v-model:group-by="groupBy"
          v-model:show-empty="showEmpty"
          :group-options="groupOptions"
          :sessions-count="sessions.length"
          @refresh="refreshSessions"
        />

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
                <SessionCard
                  :session="session"
                  :tone="projectTone(session.projectName)"
                  :format-date="formatDate"
                  @copy-resume="copyResume"
                  @copy-remove="copyRemove"
                  @open="openSession"
                />
              </v-col>
            </v-row>
          </div>

          <v-alert
            v-if="!sessions.length"
            type="info"
            variant="tonal"
            class="mt-4"
          >
            No session files found.
          </v-alert>
        </div>
      </v-container>

      <ChatDialog
        v-model="dialogOpen"
        :session="dialogSession"
        :format-date="formatDate"
        @copy-resume="copyResume"
        @close="closeSession"
      />
    </v-main>
  </v-app>
</template>

<style scoped>
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
</style>
