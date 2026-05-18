export type PhaseType = 'P' | 'I' | 'O'

export type ProcessState =
  | 'NOT_ARRIVED'
  | 'READY_CPU'
  | 'READY_INPUT'
  | 'READY_OUTPUT'
  | 'RUNNING_CPU'
  | 'RUNNING_INPUT'
  | 'RUNNING_OUTPUT'
  | 'COMPLETED'

export interface Phase {
  type: PhaseType
  duration: number
  remaining: number
}

export interface SchedulerProcess {
  pid: string
  arrivalTime: number
  phases: Phase[]
  phaseIndex: number
  state: ProcessState
  queueArrivalTime: number
  completionTime: number | null
}

export interface GanttBlock {
  pid: string
  start: number
  end: number
  label: string
  phaseType: PhaseType
}

export interface ReadyQueueSnapshot {
  time: number
  processes: {
    pid: string
    remaining: number
  }[]
}

export interface ProcessStat {
  pid: string
  arrivalTime: number
  completionTime: number
  turnaroundTime: number
  totalCpuBurst: number
  totalInputBurst: number
  totalOutputBurst: number
}

export interface SimulationResult {
  cpuBlocks: GanttBlock[]
  inputBlocks: GanttBlock[]
  outputBlocks: GanttBlock[]
  rqSnapshots: ReadyQueueSnapshot[]
  eventTimes: number[]
  totalTime: number
  stats: ProcessStat[]
  errors: string[]
}

interface ActiveUnit {
  process: SchedulerProcess | null
}

const MAX_TIME = 100000

const clonePhase = (type: PhaseType, duration: number): Phase => ({
  type,
  duration,
  remaining: duration,
})

const currentPhase = (process: SchedulerProcess): Phase => {
  const phase = process.phases[process.phaseIndex]

  if (!phase) {
    throw new Error(`Process ${process.pid} has no current phase`)
  }

  return phase
}

const phasePrefix = (phaseType: PhaseType, pid: string): string => {
  if (phaseType === 'P') return pid

  const numberPart = pid.replace(/^P/i, '')

  if (phaseType === 'I') return `Pi${numberPart}`

  return `Po${numberPart}`
}

const pushBlock = (blocks: GanttBlock[], process: SchedulerProcess, start: number, end: number) => {
  const phase = currentPhase(process)
  const prefix = phasePrefix(phase.type, process.pid)
  const last = blocks[blocks.length - 1]

  if (last && last.pid === process.pid && last.phaseType === phase.type && last.end === start) {
    last.end = end
    last.label = `${prefix}(${last.end - last.start})`
    return
  }

  blocks.push({
    pid: process.pid,
    start,
    end,
    label: `${prefix}(${end - start})`,
    phaseType: phase.type,
  })
}

const sortCpuQueue = (a: SchedulerProcess, b: SchedulerProcess): number => {
  const aPhase = currentPhase(a)
  const bPhase = currentPhase(b)

  if (aPhase.remaining !== bPhase.remaining) {
    return aPhase.remaining - bPhase.remaining
  }

  if (a.queueArrivalTime !== b.queueArrivalTime) {
    return a.queueArrivalTime - b.queueArrivalTime
  }

  return a.pid.localeCompare(b.pid, undefined, { numeric: true })
}

const sortIoQueue = (a: SchedulerProcess, b: SchedulerProcess): number => {
  if (a.queueArrivalTime !== b.queueArrivalTime) {
    return a.queueArrivalTime - b.queueArrivalTime
  }

  return a.pid.localeCompare(b.pid, undefined, { numeric: true })
}

const addUniqueTime = (times: Set<number>, value: number) => {
  if (Number.isFinite(value) && value >= 0) {
    times.add(value)
  }
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

  return clonePhase(type, duration)
}

export const parseSchedulerInput = (
  input: string,
): {
  processes: SchedulerProcess[]
  errors: string[]
} => {
  const errors: string[] = []
  const processes: SchedulerProcess[] = []

  const lines = input
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  lines.forEach((line, lineIndex) => {
    const parts = line.split(/\s+/)

    if (parts.length < 3) {
      errors.push(`Line ${lineIndex + 1}: expected PID, arrival time, and phases`)
      return
    }

    const rawPid = parts[0]
    const rawArrivalTime = parts[1]

    if (!rawPid || !rawArrivalTime) {
      errors.push(`Line ${lineIndex + 1}: missing PID or arrival time`)
      return
    }

    const pid = rawPid.toUpperCase()
    const arrivalTime = Number(rawArrivalTime)

    if (!/^P\d+$/i.test(pid)) {
      errors.push(`Line ${lineIndex + 1}: invalid process id "${parts[0]}"`)
      return
    }

    if (!Number.isInteger(arrivalTime) || arrivalTime < 0) {
      errors.push(`Line ${lineIndex + 1}: invalid arrival time "${parts[1]}"`)
      return
    }

    const phaseText = parts.slice(2).join('')
    const phaseTokens = phaseText.includes('-')
      ? phaseText.split('-')
      : (phaseText.match(/[PIO0]\d+/gi) ?? [])

    const phases = phaseTokens
      .map(parsePhaseToken)
      .filter((phase): phase is Phase => phase !== null)

    if (phases.length === 0) {
      errors.push(`Line ${lineIndex + 1}: no valid phases found`)
      return
    }

    const firstPhase = phases[0]

    if (!firstPhase) {
      errors.push(`Line ${lineIndex + 1}: no valid phases found`)
      return
    }

    if (firstPhase.type !== 'P') {
      errors.push(`Line ${lineIndex + 1}: first phase should be a CPU phase`)
      return
    }

    processes.push({
      pid,
      arrivalTime,
      phases,
      phaseIndex: 0,
      state: 'NOT_ARRIVED',
      queueArrivalTime: arrivalTime,
      completionTime: null,
    })
  })

  const pidSet = new Set<string>()

  processes.forEach((process) => {
    if (pidSet.has(process.pid)) {
      errors.push(`Duplicate process id "${process.pid}"`)
    }

    pidSet.add(process.pid)
  })

  processes.sort((a, b) => {
    if (a.arrivalTime !== b.arrivalTime) {
      return a.arrivalTime - b.arrivalTime
    }

    return a.pid.localeCompare(b.pid, undefined, { numeric: true })
  })

  return { processes, errors }
}

export const simulateSjfPreemptive = (input: string): SimulationResult => {
  const { processes, errors } = parseSchedulerInput(input)

  const cpuBlocks: GanttBlock[] = []
  const inputBlocks: GanttBlock[] = []
  const outputBlocks: GanttBlock[] = []
  const rqSnapshots: ReadyQueueSnapshot[] = []
  const eventTimes = new Set<number>()

  const cpuQueue: SchedulerProcess[] = []
  const inputQueue: SchedulerProcess[] = []
  const outputQueue: SchedulerProcess[] = []

  const cpu: ActiveUnit = { process: null }
  const inputDevice: ActiveUnit = { process: null }
  const outputDevice: ActiveUnit = { process: null }

  let time = 0

  const enqueueCurrentPhase = (process: SchedulerProcess, readyTime: number) => {
    const phase = currentPhase(process)

    process.queueArrivalTime = readyTime

    if (phase.type === 'P') {
      process.state = 'READY_CPU'
      cpuQueue.push(process)
      return
    }

    if (phase.type === 'I') {
      process.state = 'READY_INPUT'
      inputQueue.push(process)
      return
    }

    process.state = 'READY_OUTPUT'
    outputQueue.push(process)
  }

  const advanceProcess = (process: SchedulerProcess, readyTime: number) => {
    process.phaseIndex += 1

    if (process.phaseIndex >= process.phases.length) {
      process.state = 'COMPLETED'
      process.completionTime = readyTime
      addUniqueTime(eventTimes, readyTime)
      return
    }

    enqueueCurrentPhase(process, readyTime)
    addUniqueTime(eventTimes, readyTime)
  }

  const addArrivals = () => {
    processes.forEach((process) => {
      if (process.state !== 'NOT_ARRIVED') return
      if (process.arrivalTime !== time) return

      enqueueCurrentPhase(process, time)
      addUniqueTime(eventTimes, time)
    })
  }

  const assignInputOutput = () => {
    if (!inputDevice.process && inputQueue.length > 0) {
      inputQueue.sort(sortIoQueue)
      inputDevice.process = inputQueue.shift() ?? null

      if (inputDevice.process) {
        inputDevice.process.state = 'RUNNING_INPUT'
        addUniqueTime(eventTimes, time)
      }
    }

    if (!outputDevice.process && outputQueue.length > 0) {
      outputQueue.sort(sortIoQueue)
      outputDevice.process = outputQueue.shift() ?? null

      if (outputDevice.process) {
        outputDevice.process.state = 'RUNNING_OUTPUT'
        addUniqueTime(eventTimes, time)
      }
    }
  }

  const assignCpu = () => {
    cpuQueue.sort(sortCpuQueue)

    if (cpu.process && cpuQueue.length > 0) {
      const candidate = cpuQueue[0]

      if (!candidate) {
        return
      }

      const candidateRemaining = currentPhase(candidate).remaining
      const activeRemaining = currentPhase(cpu.process).remaining

      if (candidateRemaining < activeRemaining) {
        cpu.process.state = 'READY_CPU'
        cpu.process.queueArrivalTime = time
        cpuQueue.push(cpu.process)
        cpu.process = null
        addUniqueTime(eventTimes, time)
      }
    }

    cpuQueue.sort(sortCpuQueue)

    if (!cpu.process && cpuQueue.length > 0) {
      cpu.process = cpuQueue.shift() ?? null

      if (cpu.process) {
        cpu.process.state = 'RUNNING_CPU'
        addUniqueTime(eventTimes, time)
      }
    }
  }

  const snapshotReadyQueue = () => {
    cpuQueue.sort(sortCpuQueue)

    rqSnapshots.push({
      time,
      processes: cpuQueue.map((process) => ({
        pid: process.pid,
        remaining: currentPhase(process).remaining,
      })),
    })
  }

  const runOneTick = (unit: ActiveUnit, blocks: GanttBlock[], runningState: ProcessState) => {
    const process = unit.process

    if (!process) return

    process.state = runningState

    pushBlock(blocks, process, time, time + 1)

    const phase = currentPhase(process)
    phase.remaining -= 1

    if (phase.remaining === 0) {
      advanceProcess(process, time + 1)
      unit.process = null
    }
  }

  if (errors.length > 0) {
    return {
      cpuBlocks,
      inputBlocks,
      outputBlocks,
      rqSnapshots,
      eventTimes: [],
      totalTime: 0,
      stats: [],
      errors,
    }
  }

  while (time <= MAX_TIME) {
    if (processes.every((process) => process.state === 'COMPLETED')) {
      break
    }

    addArrivals()
    assignInputOutput()
    assignCpu()
    snapshotReadyQueue()

    runOneTick(cpu, cpuBlocks, 'RUNNING_CPU')
    runOneTick(inputDevice, inputBlocks, 'RUNNING_INPUT')
    runOneTick(outputDevice, outputBlocks, 'RUNNING_OUTPUT')

    time += 1
  }

  if (time > MAX_TIME) {
    errors.push('Simulation stopped because it exceeded the maximum time limit')
  }

  const allBlocks = [...cpuBlocks, ...inputBlocks, ...outputBlocks]

  allBlocks.forEach((block) => {
    addUniqueTime(eventTimes, block.start)
    addUniqueTime(eventTimes, block.end)
  })

  addUniqueTime(eventTimes, 0)
  addUniqueTime(eventTimes, time)

  const stats: ProcessStat[] = processes
    .filter((process) => process.completionTime !== null)
    .map((process) => {
      const totalCpuBurst = process.phases
        .filter((phase) => phase.type === 'P')
        .reduce((sum, phase) => sum + phase.duration, 0)

      const totalInputBurst = process.phases
        .filter((phase) => phase.type === 'I')
        .reduce((sum, phase) => sum + phase.duration, 0)

      const totalOutputBurst = process.phases
        .filter((phase) => phase.type === 'O')
        .reduce((sum, phase) => sum + phase.duration, 0)

      const completionTime = process.completionTime ?? time

      return {
        pid: process.pid,
        arrivalTime: process.arrivalTime,
        completionTime,
        turnaroundTime: completionTime - process.arrivalTime,
        totalCpuBurst,
        totalInputBurst,
        totalOutputBurst,
      }
    })

  return {
    cpuBlocks,
    inputBlocks,
    outputBlocks,
    rqSnapshots,
    eventTimes: [...eventTimes].sort((a, b) => a - b),
    totalTime: time,
    stats,
    errors,
  }
}
