<template>
  <div class="chart-wrapper" v-if="store.totalTime > 0">
    <div class="chart-container" :style="{ width: store.totalTime * 35 + 150 + 'px' }">
      <div class="ruler">
        <div
          v-for="t in store.eventTimes"
          :key="'r-' + t"
          class="ruler-mark"
          :style="{ left: t * 35 + 90 + 'px' }"
        >
          {{ t }}
        </div>
      </div>

      <div class="lane">
        <div class="lane-label cpu-label">CPU</div>
        <div class="lane-content">
          <div
            v-for="(blk, i) in store.cpuBlocks"
            :key="'cpu-' + i"
            class="block"
            :style="{
              left: blk.start * 35 + 'px',
              width: (blk.end - blk.start) * 35 + 'px',
              backgroundColor: getColor(blk.pid),
            }"
          >
            {{ blk.label }}
          </div>
        </div>
      </div>

      <div class="lane rq-lane">
        <div class="lane-label rq-label">RQ</div>
        <div class="lane-content">
          <div
            v-for="(snap, i) in store.rqSnapshots"
            :key="'rq-' + i"
            class="snap-col"
            :style="{ left: snap.time * 35 + 'px' }"
          >
            <div
              v-for="(p, j) in snap.processes"
              :key="'p-' + j"
              class="snap-item"
              :style="{ color: getColor(p.pid) }"
            >
              {{ p.pid }}({{ p.remaining }})
            </div>
          </div>
        </div>
      </div>

      <div class="lane">
        <div class="lane-label in-label">INPUT</div>
        <div class="lane-content">
          <div
            v-for="(blk, i) in store.inputBlocks"
            :key="'in-' + i"
            class="block"
            :style="{
              left: blk.start * 35 + 'px',
              width: (blk.end - blk.start) * 35 + 'px',
              backgroundColor: getColor(blk.pid),
            }"
          >
            {{ blk.label }}
          </div>
        </div>
      </div>

      <div class="lane">
        <div class="lane-label out-label">OUTPUT</div>
        <div class="lane-content">
          <div
            v-for="(blk, i) in store.outputBlocks"
            :key="'out-' + i"
            class="block"
            :style="{
              left: blk.start * 35 + 'px',
              width: (blk.end - blk.start) * 35 + 'px',
              backgroundColor: getColor(blk.pid),
            }"
          >
            {{ blk.label }}
          </div>
        </div>
      </div>

      <div
        v-for="t in store.eventTimes"
        :key="'line-' + t"
        class="grid-line"
        :style="{ left: t * 35 + 90 + 'px' }"
      ></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useSchedulerStore } from '../stores/stores'
const store = useSchedulerStore()

const colors: Record<string, string> = {
  P1: '#a0c4ff',
  P2: '#ffc6ff',
  P3: '#caffbf',
  P4: '#ffd6a5',
  P5: '#fdffb6',
  P6: '#9bf6ff',
}

const getColor = (pid: string) => colors[pid] || '#e0e0e0'
</script>

<style scoped>
.chart-wrapper {
  overflow-x: auto;
  background: #333;
  padding: 20px;
  border-radius: 8px;
  font-family: sans-serif;
  margin-top: 20px;
}
.chart-container {
  position: relative;
  min-width: 100%;
}
.ruler {
  height: 30px;
  position: relative;
  border-bottom: 1px solid #555;
  margin-bottom: 10px;
}
.ruler-mark {
  position: absolute;
  top: 10px;
  font-size: 12px;
  color: #ccc;
  transform: translateX(-50%);
}
.lane {
  display: flex;
  position: relative;
  height: 100px;
  border-bottom: 1px dashed #555;
}
.rq-lane {
  height: 120px;
}
.lane-label {
  width: 80px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  color: black;
  z-index: 10;
  margin-right: 10px;
  height: 40px;
  margin-top: 30px;
  border-radius: 4px;
}
.cpu-label,
.rq-label,
.in-label,
.out-label {
  background: #ffe699;
}
.lane-content {
  position: relative;
  flex-grow: 1;
}
.block {
  position: absolute;
  height: 40px;
  top: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #000;
  font-size: 12px;
  font-weight: bold;
  border: 1px solid rgba(0, 0, 0, 0.2);
  box-sizing: border-box;
}
.snap-col {
  position: absolute;
  top: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  transform: translateX(-50%);
  z-index: 5;
}
.snap-item {
  font-size: 11px;
  line-height: 1.2;
  white-space: nowrap;
}
.grid-line {
  position: absolute;
  top: 40px;
  bottom: 0;
  width: 1px;
  border-left: 1px dashed rgba(255, 255, 255, 0.3);
  pointer-events: none;
  z-index: 0;
}
</style>
