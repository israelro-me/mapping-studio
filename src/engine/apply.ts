import type { Mapping, RowResult, Reason, Readiness, Transform, FnCtx } from './types'
import { functions } from './functions'

function toTitleCase(input: unknown): unknown {
    if (typeof input !== 'string') return input
    return input.replace(/\w\S*/g, (w: string) => {
        if (w.length === 0) return w
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    })
}

function isEmpty(v: unknown): boolean {
    return v == null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0)
}

function get(obj: any, path: string): unknown {
    if (!path) return undefined
    const parts = path.split('.')
    let cur: any = obj
    for (const p of parts) {
        if (cur == null) return undefined
        cur = cur[p]
    }
    return cur
}

function toInt(v: unknown): number | null {
    const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10)
    return Number.isFinite(n) ? n : null
}

function toBool(v: unknown): boolean | null {
    if (typeof v === 'boolean') return v
    const s = String(v ?? '').trim().toLowerCase()
    if (s === 'true' || s === '1' || s === 'yes' || s === 'y') return true
    if (s === 'false' || s === '0' || s === 'no' || s === 'n') return false
    return null
}

function applyOne(step: Transform, scope: { src: any; out: any; ctx: FnCtx }, reasons: Reason[]): unknown {
    // steps that directly return a value
    if ('take' in step) return get(scope.src, step.take.from)
    if ('trim' in step) {
        const prior = scope.out.__tmp as unknown
        return typeof prior === 'string' ? prior.trim() : prior
    }
    if ('lower' in step) {
        const prior = scope.out.__tmp as unknown
        return typeof prior === 'string' ? prior.toLowerCase() : prior
    }
    if ('title' in step) {
        const prior = scope.out.__tmp as unknown
        return toTitleCase(prior)
    }
    if ('mapEnum' in step) {
        const prior = scope.out.__tmp as unknown
        if (prior == null) return prior
        const m = step.mapEnum.map
        const key = String(prior)
        if (step.mapEnum.caseInsensitive) {
            for (const k of Object.keys(m)) if (k.toLowerCase() === key.toLowerCase()) return m[k]
            return undefined
        }
        return Object.prototype.hasOwnProperty.call(m, key) ? m[key] : undefined
    }
    if ('default' in step) {
        const prior = scope.out.__tmp as unknown
        if (isEmpty(prior)) {
            if (step.default.reason) reasons.push({ code: step.default.reason })
            return step.default.value
        }
        return prior
    }
    if ('toInt' in step) return toInt(scope.out.__tmp)
    if ('toBool' in step) return toBool(scope.out.__tmp)
    if ('invertBool' in step) {
        const v = toBool(scope.out.__tmp)
        return v == null ? v : !v
    }
    if ('split' in step) {
        const s = get(scope.src, step.split.from)
        if (s == null) return []
        const parts = String(s).split(step.split.by).map(x => x.trim()).filter(x => x.length > 0)
        return parts
    }
    if ('arrayOf' in step) {
        const v = get(scope.src, step.arrayOf.from)
        return isEmpty(v) ? [] : [v]
    }
    if ('coalesce' in step) {
        for (const inner of step.coalesce) {
            const val = runPipeline([inner], scope, reasons)
            if (!isEmpty(val)) return val
        }
        return undefined
    }
    if ('now' in step) return scope.ctx.env.clock.run_started_at
    if ('if' in step) {
        const cond = step.if.when.isTrue ? !!toBool(get(scope.src, step.if.when.isTrue.from)) : false
        return runPipeline([cond ? step.if.then : step.if.else ?? { default: { value: null } }], scope, reasons)
    }
    if ('call' in step) {
        if (step.call.fn === 'computeLifecycleStage' && step.call.ver === 1) {
            const res = functions.computeLifecycleStage_v1(step.call.args, scope.ctx)
            if (res.reasons?.length) reasons.push(...res.reasons)
            return res.value
        }
    }
    return scope.out.__tmp
}

function runPipeline(pipeline: Transform[], scope: { src: any; out: any; ctx: FnCtx }, reasons: Reason[]): unknown {
    let tmp: unknown = undefined
    for (const step of pipeline) {
        scope.out.__tmp = tmp
        tmp = applyOne(step, scope, reasons)
    }
    delete scope.out.__tmp
    return tmp
}

function basicEmailInvalid(s: unknown): boolean {
    if (typeof s !== 'string') return true
    // deliberately simple, not production-grade, of course
    return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

export function transformWithDoc(opts: {
    row: Record<string, unknown>
    doc: { dto?: string; mappings: Mapping; readiness?: any }
    rowNumber?: number
    ctx: FnCtx
}): RowResult {
    const { row, doc, rowNumber = 1, ctx } = opts
    const out: Record<string, unknown> = {}
    const reasons: Reason[] = []

    // Evaluate mappings
    for (const [field, pipeline] of Object.entries(doc.mappings ?? {})) {
        const val = runPipeline(pipeline as Transform[], { src: row, out, ctx }, reasons)
        out[field] = val
    }

    // Readiness (please note this is a tiny predicate set)
    let readiness: Readiness = 'ready'
    const rules = doc.readiness ?? {}
    const missing = (names: string[]) => names.some(n => isEmpty(get(out, n)))

    if (Array.isArray(rules.blocked)) {
        for (const r of rules.blocked) {
            if (r?.when?.missing && missing(r.when.missing)) {
                if (r.reason) reasons.push({ code: r.reason })
                readiness = 'blocked'
                break
            }
        }
    }

    if (readiness !== 'blocked' && Array.isArray(rules.review)) {
        for (const r of rules.review) {
            if (r?.when?.invalidEmail?.ref) {
                const ref = r.when.invalidEmail.ref
                if (basicEmailInvalid(get(out, ref))) {
                    if (r.reason) reasons.push({ code: r.reason })
                    readiness = 'review'
                    break
                }
            }
        }
    }

    return {
        rowNumber,
        dtoType: String(doc.dto ?? 'AttendeeDto'),
        data: out,
        readiness,
        reasons
    }
}
