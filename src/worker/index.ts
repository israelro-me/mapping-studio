/// <reference lib="webworker" />
import { parse } from 'yaml'
import { transformRow, type Mapping } from '../engine'

type Msg =
  | { type: 'ping' }
  | { type: 'transform'; row: Record<string, unknown>; mappingYaml: string }

self.addEventListener('message', (ev: MessageEvent<Msg>) => {
  const msg = ev.data
  if (msg.type === 'ping') {
    ;(self as any).postMessage({ type: 'pong' })
    return
  }
  if (msg.type === 'transform') {
    try {
      const doc: any = parse(msg.mappingYaml)
      const mapping: Mapping = doc?.mappings ?? {}
      const res = transformRow({ row: msg.row, mappings: mapping })
      ;(self as any).postMessage({ type: 'transform_result', ok: true, result: res })
    } catch (err: any) {
      ;(self as any).postMessage({ type: 'transform_result', ok: false, error: String(err?.message || err) })
    }
  }
})
