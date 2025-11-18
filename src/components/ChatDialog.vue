<script setup>
const props = defineProps({
  modelValue: {
    type: Boolean,
    required: true,
  },
  session: {
    type: Object,
    default: null,
  },
  formatDate: {
    type: Function,
    required: true,
  },
});

const emit = defineEmits(['update:modelValue', 'copy-resume', 'close']);

const close = () => {
  emit('update:modelValue', false);
  emit('close');
};

const copyResume = () => {
  if (!props.session) return;
  emit('copy-resume', props.session);
};
</script>

<template>
  <v-dialog
    :model-value="modelValue"
    max-width="800"
    scrollable
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card v-if="session">
      <v-card-title class="d-flex align-center">
        <div>
          <div class="text-subtitle-1 font-weight-bold">
            {{ session.projectName }}
          </div>
          <div class="text-caption text-medium-emphasis">
            ID: {{ session.sessionId }}
          </div>
        </div>
        <v-spacer />
        <v-btn
          color="primary"
          variant="flat"
          size="small"
          class="mr-2"
          title="Copy to clipboard"
          @click="copyResume"
        >
          <v-icon size="16" class="mr-1" icon="mdi-play-circle-outline"></v-icon>
          Resume cmd
        </v-btn>
        <v-btn icon="mdi-close" variant="text" @click="close" />
      </v-card-title>

      <v-card-text class="chat-scroll">
        <div class="d-flex flex-column gap-3">
          <div
            v-for="(msg, idx) in session.messages"
            :key="`${session.id}-${idx}`"
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
        <v-btn color="primary" variant="flat" @click="close">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
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
</style>
