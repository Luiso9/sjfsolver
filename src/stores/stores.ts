import { defineStore } from 'pinia'

type PhaseType = 'P' | 'I' | 'O'

interface Phase {
  type: PhaseType
  duration: number
  remaining: number
}

interface Process {
  pid: string
  arrivalTime: number
  phases: Phase[]
  phaseIndex: number
  queueArrivalTime: number
  arrived: boolean
  completed: boolean
  completionTime: number | null
}

export interface Block {
  pid: string
  start: number
  end: number
  label: string
}

export interface Snapshot {
  time: number
  processes: {
    pid: string
    remaining: number
  }[]
}

interface SimulationState {
  time: number
  processes: Process[]
  cpuQueue: string[]
  inputQueue: string[]
  outputQueue: string[]
  cpuActivePid: string | null
  inputActivePid: string | null
  outputActivePid: string | null
}

interface SimulationOutput {
  cpuBlocks: Block[]
  inputBlocks: Block[]
  outputBlocks: Block[]
  rqSnapshots: Snapshot[]
  eventTimes: number[]
  totalTime: number
}

const MAX_TIME = 100000

const cloneState = (state: SimulationState): SimulationState => {
  return structuredClone(state)
}

const getProcess = (state: SimulationState, pid: string): Process => {
  const process = state.processes.find((item) => item.pid === pid)

  if (!process) {
    throw new Error(`Process not found: ${pid}`)
  }

  return process
}

const currentPhase = (state: SimulationState, pid: string): Phase => {
  const process = getProcess(state, pid)
  const phase = process.phases[process.phaseIndex]

  if (!phase) {
    throw new Error(`Process ${pid} has no current phase`)
  }

  return phase
}

const pidNumber = (pid: string): number => {
  const value = Number(pid.replace(/^P/i, ''))
  return Number.isFinite(value) ? value : 0
}

const parsePhaseToken = (token: string): Phase | null => {
  const clean = token.trim().toUpperCase()

  if (!clean) return null

  const match = clean.match(/^([PIO0])(\d+)$/)

  if (!match) return null

  const rawType = match[1]
  const duration = Number(match[2])

  if (!Number.isInteger(duration) || duration <= 0) return null

  const type: PhaseType = rawType === '0' ? 'O' : (rawType as PhaseType)

  return {
    type,
    duration,
    remaining: duration,
  }
}

const parseInput = (inputData: string): Process[] => {
  const lines = inputData
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  return lines.map((line, index) => {
    const parts = line.split(/\s+/)

    if (parts.length < 3) {
      throw new Error(`Line ${index + 1}: invalid format`)
    }

    const rawPid = parts[0]
    const rawArrivalTime = parts[1]

    if (!rawPid || !rawArrivalTime) {
      throw new Error(`Line ${index + 1}: missing PID or arrival time`)
    }

    const pid = rawPid.toUpperCase()
    const arrivalTime = Number(rawArrivalTime)

    if (!/^P\d+$/i.test(pid)) {
      throw new Error(`Line ${index + 1}: invalid process id "${parts[0]}"`)
    }

    if (!Number.isInteger(arrivalTime) || arrivalTime < 0) {
      throw new Error(`Line ${index + 1}: invalid arrival time "${parts[1]}"`)
    }

    const phaseText = parts.slice(2).join('')
    const phaseTokens = phaseText.includes('-')
      ? phaseText.split('-')
      : (phaseText.match(/[PIO0]\d+/gi) ?? [])

    const phases = phaseTokens
      .map(parsePhaseToken)
      .filter((phase): phase is Phase => phase !== null)

    if (phases.length === 0) {
      throw new Error(`Line ${index + 1}: no valid burst phases found`)
    }

    const firstPhase = phases[0]

    if (!firstPhase) {
      throw new Error(`Line ${index + 1}: no valid burst phases found`)
    }

    if (firstPhase.type !== 'P') {
      throw new Error(`Line ${index + 1}: first phase must be a CPU burst`)
    }

    return {
      pid,
      arrivalTime,
      phases,
      phaseIndex: 0,
      queueArrivalTime: arrivalTime,
      arrived: false,
      completed: false,
      completionTime: null,
    }
  })
}

const createInitialState = (processes: Process[]): SimulationState => {
  return {
    time: 0,
    processes,
    cpuQueue: [],
    inputQueue: [],
    outputQueue: [],
    cpuActivePid: null,
    inputActivePid: null,
    outputActivePid: null,
  }
}

const sortCpuQueue = (state: SimulationState, queue: string[]): string[] => {
  return [...queue].sort((aPid, bPid) => {
    const aPhase = currentPhase(state, aPid)
    const bPhase = currentPhase(state, bPid)
    const aProcess = getProcess(state, aPid)
    const bProcess = getProcess(state, bPid)

    if (aPhase.remaining !== bPhase.remaining) {
      return aPhase.remaining - bPhase.remaining
    }

    if (aProcess.queueArrivalTime !== bProcess.queueArrivalTime) {
      return aProcess.queueArrivalTime - bProcess.queueArrivalTime
    }

    return pidNumber(aPid) - pidNumber(bPid)
  })
}

const sortIoQueue = (state: SimulationState, queue: string[]): string[] => {
  return [...queue].sort((aPid, bPid) => {
    const aProcess = getProcess(state, aPid)
    const bProcess = getProcess(state, bPid)

    if (aProcess.queueArrivalTime !== bProcess.queueArrivalTime) {
      return aProcess.queueArrivalTime - bProcess.queueArrivalTime
    }

    return pidNumber(aPid) - pidNumber(bPid)
  })
}

const addEventTime = (eventTimes: Set<number> | null, time: number) => {
  if (!eventTimes) return
  eventTimes.add(time)
}

const enqueueCurrentPhase = (
  state: SimulationState,
  pid: string,
  readyTime: number,
  eventTimes: Set<number> | null,
) => {
  const process = getProcess(state, pid)

  if (process.completed) return

  const phase = currentPhase(state, pid)
  process.queueArrivalTime = readyTime

  if (phase.type === 'P') {
    state.cpuQueue.push(pid)
  } else if (phase.type === 'I') {
    state.inputQueue.push(pid)
  } else {
    state.outputQueue.push(pid)
  }

  addEventTime(eventTimes, readyTime)
}

const moveToNextPhase = (
  state: SimulationState,
  pid: string,
  readyTime: number,
  eventTimes: Set<number> | null,
) => {
  const process = getProcess(state, pid)

  process.phaseIndex += 1

  if (process.phaseIndex >= process.phases.length) {
    process.completed = true
    process.completionTime = readyTime
    addEventTime(eventTimes, readyTime)
    return
  }

  enqueueCurrentPhase(state, pid, readyTime, eventTimes)
}

const makeLabelPrefix = (state: SimulationState, pid: string): string => {
  const phase = currentPhase(state, pid)
  const numberPart = pid.replace(/^P/i, '')

  if (phase.type === 'P') return pid
  if (phase.type === 'I') return `Pi${numberPart}`

  return `Po${numberPart}`
}

const pushBlock = (state: SimulationState, blocks: Block[], pid: string, time: number) => {
  const labelPrefix = makeLabelPrefix(state, pid)
  const last = blocks[blocks.length - 1]

  if (last && last.pid === pid && last.end === time) {
    last.end = time + 1
    last.label = `${labelPrefix}(${last.end - last.start})`
    return
  }

  blocks.push({
    pid,
    start: time,
    end: time + 1,
    label: `${labelPrefix}(1)`,
  })
}

const makeStateKey = (state: SimulationState): string => {
  return JSON.stringify({
    time: state.time,
    processes: state.processes.map((process) => ({
      pid: process.pid,
      arrived: process.arrived,
      completed: process.completed,
      phaseIndex: process.phaseIndex,
      queueArrivalTime: process.queueArrivalTime,
      remaining: process.phases.map((phase) => phase.remaining),
    })),
    cpuQueue: state.cpuQueue,
    inputQueue: state.inputQueue,
    outputQueue: state.outputQueue,
    cpuActivePid: state.cpuActivePid,
    inputActivePid: state.inputActivePid,
    outputActivePid: state.outputActivePid,
  })
}

const fallbackTie = (
  state: SimulationState,
  currentBestPid: string,
  candidatePid: string,
): string => {
  const bestProcess = getProcess(state, currentBestPid)
  const candidateProcess = getProcess(state, candidatePid)

  if (candidateProcess.queueArrivalTime < bestProcess.queueArrivalTime) {
    return candidatePid
  }

  if (candidateProcess.queueArrivalTime > bestProcess.queueArrivalTime) {
    return currentBestPid
  }

  return pidNumber(candidatePid) < pidNumber(currentBestPid) ? candidatePid : currentBestPid
}

const runSimulation = (
  state: SimulationState,
  shouldRecord: boolean,
  cache: Map<string, number>,
): SimulationOutput => {
  const cpuBlocks: Block[] = []
  const inputBlocks: Block[] = []
  const outputBlocks: Block[] = []
  const rqSnapshots: Snapshot[] = []
  const eventTimes = shouldRecord ? new Set<number>() : null

  const chooseBestByLookahead = (candidatePids: string[]): string => {
    const firstCandidatePid = candidatePids[0]

    if (!firstCandidatePid) {
      throw new Error('No CPU candidates found')
    }

    let bestPid: string = firstCandidatePid
    let bestTotalTime = Number.POSITIVE_INFINITY

    for (const candidatePidMaybe of candidatePids) {
      const candidatePid = candidatePidMaybe

      if (!candidatePid) {
        continue
      }

      const futureState = cloneState(state)

      futureState.cpuQueue = futureState.cpuQueue.filter((pid) => pid !== candidatePid)
      futureState.cpuActivePid = candidatePid

      const key = makeStateKey(futureState)
      let totalTime = cache.get(key)

      if (totalTime === undefined) {
        const futureResult = runSimulation(futureState, false, cache)
        totalTime = futureResult.totalTime
        cache.set(key, totalTime)
      }

      if (totalTime < bestTotalTime) {
        bestPid = candidatePid
        bestTotalTime = totalTime
        continue
      }

      if (totalTime === bestTotalTime) {
        bestPid = fallbackTie(state, bestPid, candidatePid)
      }
    }

    return bestPid
  }

  const addArrivals = () => {
    for (const process of state.processes) {
      if (process.arrived) continue
      if (process.arrivalTime !== state.time) continue

      process.arrived = true
      enqueueCurrentPhase(state, process.pid, state.time, eventTimes)
    }
  }

  const takeInput = () => {
    if (state.inputActivePid) return
    if (state.inputQueue.length === 0) return

    state.inputQueue = sortIoQueue(state, state.inputQueue)
    state.inputActivePid = state.inputQueue.shift() ?? null

    addEventTime(eventTimes, state.time)
  }

  const takeOutput = () => {
    if (state.outputActivePid) return
    if (state.outputQueue.length === 0) return

    state.outputQueue = sortIoQueue(state, state.outputQueue)
    state.outputActivePid = state.outputQueue.shift() ?? null

    addEventTime(eventTimes, state.time)
  }

  const takeCpu = () => {
    state.cpuQueue = sortCpuQueue(state, state.cpuQueue)

    if (state.cpuActivePid && state.cpuQueue.length > 0) {
      const candidatePid = state.cpuQueue[0]

      if (!candidatePid) {
        return
      }

      const candidateRemaining = currentPhase(state, candidatePid).remaining
      const activeRemaining = currentPhase(state, state.cpuActivePid).remaining

      if (candidateRemaining < activeRemaining) {
        const activeProcess = getProcess(state, state.cpuActivePid)
        activeProcess.queueArrivalTime = state.time

        state.cpuQueue.push(state.cpuActivePid)
        state.cpuActivePid = null

        addEventTime(eventTimes, state.time)
      }
    }

    state.cpuQueue = sortCpuQueue(state, state.cpuQueue)

    if (state.cpuActivePid || state.cpuQueue.length === 0) {
      return
    }

    const firstQueuedPid = state.cpuQueue[0]

    if (!firstQueuedPid) {
      return
    }

    const shortestRemaining = currentPhase(state, firstQueuedPid).remaining

    const tiedPids = state.cpuQueue.filter((pid): pid is string => {
      return currentPhase(state, pid).remaining === shortestRemaining
    })

    const selectedPidMaybe = tiedPids.length === 1 ? tiedPids[0] : chooseBestByLookahead(tiedPids)

    if (!selectedPidMaybe) {
      return
    }

    const selectedPid: string = selectedPidMaybe

    state.cpuQueue = state.cpuQueue.filter((pid) => pid !== selectedPid)
    state.cpuActivePid = selectedPid

    addEventTime(eventTimes, state.time)
  }

  const addReadyQueueSnapshot = () => {
    if (!shouldRecord) return

    state.cpuQueue = sortCpuQueue(state, state.cpuQueue)

    rqSnapshots.push({
      time: state.time,
      processes: state.cpuQueue.map((pid) => ({
        pid,
        remaining: currentPhase(state, pid).remaining,
      })),
    })
  }

  const runCpuOneTick = () => {
    if (!state.cpuActivePid) return

    const pid = state.cpuActivePid

    if (shouldRecord) {
      pushBlock(state, cpuBlocks, pid, state.time)
    }

    const phase = currentPhase(state, pid)
    phase.remaining -= 1

    if (phase.remaining === 0) {
      moveToNextPhase(state, pid, state.time + 1, eventTimes)
      state.cpuActivePid = null
    }
  }

  const runInputOneTick = () => {
    if (!state.inputActivePid) return

    const pid = state.inputActivePid

    if (shouldRecord) {
      pushBlock(state, inputBlocks, pid, state.time)
    }

    const phase = currentPhase(state, pid)
    phase.remaining -= 1

    if (phase.remaining === 0) {
      moveToNextPhase(state, pid, state.time + 1, eventTimes)
      state.inputActivePid = null
    }
  }

  const runOutputOneTick = () => {
    if (!state.outputActivePid) return

    const pid = state.outputActivePid

    if (shouldRecord) {
      pushBlock(state, outputBlocks, pid, state.time)
    }

    const phase = currentPhase(state, pid)
    phase.remaining -= 1

    if (phase.remaining === 0) {
      moveToNextPhase(state, pid, state.time + 1, eventTimes)
      state.outputActivePid = null
    }
  }

  while (state.time <= MAX_TIME) {
    if (state.processes.every((process) => process.completed)) {
      break
    }

    addArrivals()

    takeInput()
    takeOutput()
    takeCpu()

    addReadyQueueSnapshot()

    runCpuOneTick()
    runInputOneTick()
    runOutputOneTick()

    state.time += 1
  }

  if (state.time > MAX_TIME) {
    throw new Error('Simulation exceeded maximum time')
  }

  if (eventTimes) {
    eventTimes.add(0)
    eventTimes.add(state.time)

    for (const block of [...cpuBlocks, ...inputBlocks, ...outputBlocks]) {
      eventTimes.add(block.start)
      eventTimes.add(block.end)
    }
  }

  return {
    cpuBlocks,
    inputBlocks,
    outputBlocks,
    rqSnapshots,
    eventTimes: eventTimes ? [...eventTimes].sort((a, b) => a - b) : [],
    totalTime: state.time,
  }
}

export const useSchedulerStore = defineStore('scheduler', {
  state: () => ({
    inputData: `P1 0 P6 - I8 - O6 - P5 - I2 - P6
P2 3 P3 - O3 - P6 - I2 - O6 - P3
P3 4 P6 - I6 - O3 - P3 - I2 - P1
P4 5 P1 - O6 - I1 - P6 - O1`,

    cpuBlocks: [] as Block[],
    inputBlocks: [] as Block[],
    outputBlocks: [] as Block[],
    rqSnapshots: [] as Snapshot[],
    eventTimes: [] as number[],
    totalTime: 0,
    errorMessage: '',
  }),

  actions: {
    solve() {
      this.cpuBlocks = []
      this.inputBlocks = []
      this.outputBlocks = []
      this.rqSnapshots = []
      this.eventTimes = []
      this.totalTime = 0
      this.errorMessage = ''

      try {
        const processes = parseInput(this.inputData)
        const state = createInitialState(processes)
        const cache = new Map<string, number>()

        const result = runSimulation(state, true, cache)

        this.cpuBlocks = result.cpuBlocks
        this.inputBlocks = result.inputBlocks
        this.outputBlocks = result.outputBlocks
        this.rqSnapshots = result.rqSnapshots
        this.eventTimes = result.eventTimes
        this.totalTime = result.totalTime
      } catch (error) {
        this.errorMessage = error instanceof Error ? error.message : 'Unknown simulation error'
      }
    },

    reset() {
      this.cpuBlocks = []
      this.inputBlocks = []
      this.outputBlocks = []
      this.rqSnapshots = []
      this.eventTimes = []
      this.totalTime = 0
      this.errorMessage = ''
    },
  },
})
