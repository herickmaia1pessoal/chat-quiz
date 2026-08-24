'use client'

import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Numeric input(s) feeding a small set of *fixed* formulas — deliberately
// not a free-form formula editor. Evaluating an author-supplied expression
// client-side would mean running arbitrary code in every visitor's browser;
// a closed list of named, reviewed formulas gets the documented "IMC
// calculator" use case without that exposure.
export type NumericFormula = 'bmi' | 'difference' | 'none'

interface FieldConfig {
  label: string
  placeholder?: string
}

export function NumericCalcStep({
  fieldA,
  fieldB,
  formula,
  onSubmit,
}: {
  fieldA: FieldConfig
  fieldB?: FieldConfig
  formula: NumericFormula
  onSubmit: (values: { a: number; b?: number; result?: number }) => void
}) {
  const [valueA, setValueA] = useState('')
  const [valueB, setValueB] = useState('')

  const numA = parseFloat(valueA.replace(',', '.'))
  const numB = valueB ? parseFloat(valueB.replace(',', '.')) : undefined
  const isValid = !isNaN(numA) && (!fieldB || (numB !== undefined && !isNaN(numB)))

  const handleContinue = () => {
    if (!isValid) return
    let result: number | undefined
    if (formula === 'bmi' && numB) {
      // BMI = weight(kg) / height(m)^2 — height entered in meters (e.g. 1.75)
      result = numA / (numB * numB)
    } else if (formula === 'difference' && numB !== undefined) {
      result = numA - numB
    }
    onSubmit({ a: numA, b: numB, result })
  }

  return (
    <div className="space-y-4 pt-2">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-muted-foreground text-xs">{fieldA.label}</Label>
          <Input
            type="text"
            inputMode="decimal"
            value={valueA}
            onChange={(e) => setValueA(e.target.value)}
            placeholder={fieldA.placeholder}
            className="h-12 border-border bg-background text-foreground placeholder:text-muted-foreground"
          />
        </div>
        {fieldB && (
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs">{fieldB.label}</Label>
            <Input
              type="text"
              inputMode="decimal"
              value={valueB}
              onChange={(e) => setValueB(e.target.value)}
              placeholder={fieldB.placeholder}
              className="h-12 border-border bg-background text-foreground placeholder:text-muted-foreground"
            />
          </div>
        )}
      </div>
      <Button
        onClick={handleContinue}
        disabled={!isValid}
        className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white gap-2 font-medium"
      >
        Continuar <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  )
}
