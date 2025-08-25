export type Readiness = 'ready' | 'review' | 'blocked'
export type Reason = { code: string; message?: string }

export type Transform =
    | { take: { from: string } }
    | { trim: {} }
    | { lower: {} }
    | { title: {} }
    | { mapEnum: { map: Record<string, unknown>; caseInsensitive?: boolean } }
    | { default: { value: unknown; reason?: string } }
    | { toInt: {} }
    | { toBool: {} }
    | { invertBool: {} }
    | { split: { from: string; by: string } }
    | { arrayOf: { from: string } }
    | { coalesce: Transform[] }               // first non-empty transform result
    | { now: {} }
    | { if: { when: { isTrue?: { from: string } }; then: Transform; else?: Transform } }
    | { call: { fn: 'computeLifecycleStage'; ver: 1; args: Record<string, unknown> } }

export type FieldPipeline = Transform[]
export type Mapping = Record<string, FieldPipeline>

export interface RowResult {
    rowNumber: number
    dtoType: string
    data: Record<string, unknown>
    readiness: Readiness
    reasons: Reason[]
}

export interface FnCtx { env: { clock: { run_started_at: string } } }
export interface FnRegistry {
    computeLifecycleStage_v1(args: Record<string, unknown>, ctx: FnCtx): { value: string; reasons?: Reason[] }
}
