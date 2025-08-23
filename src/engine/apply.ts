import type { Mapping, RowResult } from './types'

function toTitleCase(input: unknown): unknown {
  if (typeof input !== 'string') return input
  return input.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
}

function applyPipeline(row: Record<string, unknown>, pipeline: any[]): unknown {
  let val: unknown = undefined
  for (const step of pipeline) {
    if ('take' in step) {
      val = row[step.take.from]
      continue
    }
    if ('trim' in step) {
      if (typeof val === 'string') val = val.trim()
      continue
    }
    if ('lower' in step) {
      if (typeof val === 'string') val = val.toLowerCase()
      continue
    }
    if ('title' in step) {
      val = toTitleCase(val)
      continue
    }
    // future: mapEnum, lookupOne, etc.
  }
  return val
}

export function transformRow(opts: {
  row: Record<string, unknown>
  rowNumber?: number
  dtoType?: string
  mappings: Mapping
}): RowResult {
  const { row, mappings } = opts
  const out: Record<string, unknown> = {}
  for (const [field, pipeline] of Object.entries(mappings)) {
    out[field] = applyPipeline(row, pipeline as any[])
  }
  // readiness/reasons are stubbed for now
  return {
    rowNumber: opts.rowNumber ?? 1,
    dtoType: opts.dtoType ?? 'demoDto',
    data: out,
    readiness: 'ready',
    reasons: []
  }
}
