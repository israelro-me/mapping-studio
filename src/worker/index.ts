/// <reference lib="webworker" />
import { parse } from 'yaml'
import { transformWithDoc } from '../engine'

const RUN_STARTED_AT = new Date().toISOString()
const ctx = { env: { clock: { run_started_at: RUN_STARTED_AT } } }

type Msg =
    | { type: 'ping' }
    | { type: 'transform'; row: Record<string, unknown>; mappingYaml: string }

self.addEventListener('message', (ev: MessageEvent<Msg>) => {
    const msg = ev.data
    if (msg.type === 'ping') { ; (self as any).postMessage({ type: 'pong' }); return }

    if (msg.type === 'transform') {
        try {
            const doc: any = parse(msg.mappingYaml)
            const res = transformWithDoc({
                row: msg.row,
                doc: { dto: doc?.dto, mappings: doc?.mappings ?? {}, readiness: doc?.readiness },
                ctx
            })
                ; (self as any).postMessage({ type: 'transform_result', ok: true, result: res })
        } catch (err: any) {
            ; (self as any).postMessage({ type: 'transform_result', ok: false, error: String(err?.message || err) })
        }
    }
})
