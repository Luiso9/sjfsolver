<template>
  <section class="card">
    <h1>SJF Preemptive Solver</h1>

    <p class="hint">Format: PID arrivalTime phase sequence. Example: P1 0 P6 - I8 - O6 - P5</p>

    <textarea v-model="store.inputData" spellcheck="false" />

    <div class="actions">
      <button type="button" @click="store.solve()">Solve</button>
      <button type="button" class="secondary" @click="store.reset()">Reset</button>
    </div>

    <div v-if="store.errorMessage" class="errors">
      <div v-for="error in store.errorMessage" :key="error">
        {{ error }}
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useSchedulerStore } from '../stores/stores'

const store = useSchedulerStore()
</script>

<style scoped>
.card {
  border-radius: 10px;
  padding: 16px;
}

h1 {
  margin: 0 0 8px;
  font-size: 22px;
}

.hint {
  margin: 0 0 12px;
  color: #bdbdbd;
  font-size: 14px;
}

textarea {
  width: 100%;
  min-height: 180px;
  resize: vertical;
  background: #111;
  color: #f5f5f5;
  border: 1px solid #444;
  border-radius: 8px;
  padding: 12px;
  font-family: Consolas, Monaco, monospace;
  font-size: 14px;
  line-height: 1.5;
  box-sizing: border-box;
}

.actions {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}

button {
  border: 0;
  border-radius: 8px;
  padding: 10px 16px;
  background: #ffe699;
  color: #111;
  font-weight: 700;
  cursor: pointer;
}

button.secondary {
  background: #555;
  color: #fff;
}

.errors {
  margin-top: 12px;
  padding: 10px;
  border-radius: 8px;
  background: #4a1f1f;
  color: #ffd2d2;
  font-size: 14px;
}
</style>
