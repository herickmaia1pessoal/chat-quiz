import { compareFlowValues } from '@/lib/funnel/flow'
import type { ComparisonOperator } from '@/lib/funnel'

const VARIABLE_PATTERN = /\{\{\s*([A-Za-z][A-Za-z0-9_.-]*)\s*\}\}/g

export function interpolateFunnelText(
  value: unknown,
  variables: Record<string, unknown>,
) {
  if (typeof value !== 'string') return ''
  return value.replace(VARIABLE_PATTERN, (token, key: string) => {
    const replacement = variables[key]
    return replacement === undefined || replacement === null || replacement === ''
      ? token
      : String(replacement)
  })
}

export function evaluateCondition(
  actual: unknown,
  operator: string,
  expected: unknown,
) {
  if (!['equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'is_empty', 'is_not_empty'].includes(operator)) {
    return false
  }
  return compareFlowValues(
    actual,
    operator as ComparisonOperator,
    typeof expected === 'string' || typeof expected === 'number' || typeof expected === 'boolean'
      ? expected
      : undefined,
  )
}
