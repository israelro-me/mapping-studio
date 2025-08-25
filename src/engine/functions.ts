import type { FnCtx, Reason } from './types'

function toISO(x: unknown): string | null {
    if (!x) return null
    const t = new Date(String(x))
    return isNaN(+t) ? null : t.toISOString()
}

export const functions = {
    computeLifecycleStage_v1(args: Record<string, unknown>, _ctx: FnCtx) {
        const status = String(args.status ?? '').toLowerCase()
        const reg = toISO(args.registered_at)
        const last = toISO(args.last_checkin)

        let value = 'LEAD'
        if (status.includes('inactive')) value = 'EXPIRED'
        else if (status.includes('registered')) value = last ? 'ATTENDED' : 'REGISTERED'
        else if (status.includes('attended')) value = 'ATTENDED'
        else if (status.includes('no-show')) value = 'NO_SHOW'
        else if (reg) value = 'REGISTERED'

        const reasons: Reason[] = []
        return { value, reasons }
    }
}
