<script setup>
const props = defineProps({
  session: {
    type: Object,
    required: true,
  },
  tone: {
    type: String,
    default: '#eef2ff',
  },
  formatDate: {
    type: Function,
    required: true,
  },
});

const emit = defineEmits(['open', 'copy-resume', 'copy-remove']);

const handleOpen = () => emit('open', props.session);
const handleCopyResume = () => emit('copy-resume', props.session);
const handleCopyRemove = () => emit('copy-remove', props.session);
</script>

<template>
  <v-card
    elevation="2"
    class="h-100 card-shaded"
    :style="{ backgroundColor: tone }"
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
        <v-btn color="primary" variant="flat" size="small" title="Copy to clipboard" @click="handleCopyResume">
          <v-icon size="16" class="mr-1" icon="mdi-play-circle-outline"></v-icon>
          Resume cmd
        </v-btn>
        <v-btn
          color="red"
          variant="flat"
          size="small"
          class="ml-2"
          title="Copy to clipboard"
          @click="handleCopyRemove"
        >
          <v-icon size="16" class="mr-1" icon="mdi-delete-outline"></v-icon>
          Remove cmd
        </v-btn>
        <v-spacer />
        <v-btn color="primary" variant="flat" size="small" @click="handleOpen">
          <v-icon size="16" class="mr-1" icon="mdi-chat-outline"></v-icon>
          Show more
        </v-btn>
      </div>
    </v-card-actions>
  </v-card>
</template>

<style scoped>
.line-clamp {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-shaded {
  border: 1px solid rgba(0, 0, 0, 0.04);
  position: relative;
  overflow: hidden;
}

.action-buttons {
  width: 100%;
  align-items: center;
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
