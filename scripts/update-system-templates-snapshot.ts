// Regenerates the UPDATE statements that refresh an already-seeded system
// template's `snapshot` in place (matched by name, workspace_id IS NULL) —
// used when build-system-templates.ts's output changes for an existing
// template (e.g. a registry default like section.maxWidth changes) and the
// live rows need to catch up without re-inserting or losing their id/
// created_at. Run with:
//   npx tsx scripts/update-system-templates-snapshot.ts > /tmp/update.sql
import { buildTemplates } from './build-system-templates'

function sqlString(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

const statements = buildTemplates().map(({ doc }) => {
  const snapshot = JSON.stringify(doc).replace(/'/g, "''")
  return `update public.funnel_templates
set snapshot = '${snapshot}'::jsonb, updated_at = now()
where workspace_id is null and name = ${sqlString(doc.title)};`
})

console.log(statements.join('\n\n'))
