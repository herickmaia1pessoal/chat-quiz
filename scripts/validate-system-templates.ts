// Runs the shared structural validator (funnel-doc-validator.ts) against
// the 3 curated system templates.
import { validate } from './funnel-doc-validator'
import { buildTemplates } from './build-system-templates'

for (const { doc, category } of buildTemplates()) {
  validate(doc, `${doc.title} (${category})`)
}
console.log('\nAll templates passed structural validation.')
