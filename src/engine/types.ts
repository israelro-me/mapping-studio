export type Readiness = 'ready' | 'review' | 'blocked'

export type Transform =
  | { take: { from: string } }
  | { trim: {} }
  | { lower: {} }
  | { title: {} }

export type FieldPipeline = Transform[]
export type Mapping = Record<string, FieldPipeline>

export interface RowResult {
  rowNumber: number
  dtoType: string
  data: Record<string, unknown>
  readiness: Readiness
  reasons: { code: string; message?: string }[]
}
