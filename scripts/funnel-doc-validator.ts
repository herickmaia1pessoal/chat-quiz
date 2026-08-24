// Structural validation for a generated FunnelDocument, independent of the
// SQL emission — mirrors the Postgres-side checks (apply_funnel_document +
// the published-funnel unreachable-page / terminal-path triggers) so
// problems surface locally before ever touching the database. Shared by
// validate-system-templates.ts and any other generator script.
import type { FunnelDocument, FunnelElement } from '../src/lib/funnel/types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function fail(label: string, msg: string): never {
  console.error(`[FAIL] ${label}: ${msg}`)
  process.exit(1)
}

export function validate(doc: FunnelDocument, label: string) {
  if (doc.schemaVersion !== 2) fail(label, 'schemaVersion must be 2')
  if (!UUID_RE.test(doc.funnelId)) fail(label, 'funnelId not a UUID')
  if (doc.pages.length < 1 || doc.pages.length > 100) fail(label, 'page count out of range')

  const pageIds = new Set<string>()
  for (const p of doc.pages) {
    if (!UUID_RE.test(p.id)) fail(label, `page id not UUID: ${p.id}`)
    if (pageIds.has(p.id)) fail(label, `duplicate page id ${p.id}`)
    pageIds.add(p.id)
    if (!SLUG_RE.test(p.slug)) fail(label, `bad page slug: ${p.slug}`)
    if (p.name.length < 1 || p.name.length > 160) fail(label, `bad page name length: ${p.name}`)
  }
  const slugs = new Set(doc.pages.map((p) => p.slug.toLowerCase()))
  if (slugs.size !== doc.pages.length) fail(label, 'duplicate page slugs')

  const elementIds = new Set<string>()
  for (const e of doc.elements) {
    if (!UUID_RE.test(e.id)) fail(label, `element id not UUID: ${e.id}`)
    if (elementIds.has(e.id)) fail(label, `duplicate element id ${e.id}`)
    elementIds.add(e.id)
  }
  for (const e of doc.elements) {
    if (!pageIds.has(e.pageId)) fail(label, `element ${e.id} (${e.type}) has unknown pageId ${e.pageId}`)
    if (e.parentId !== null && !elementIds.has(e.parentId)) fail(label, `element ${e.id} (${e.type}) has dangling parentId ${e.parentId}`)
    if (e.parentId === e.id) fail(label, `element ${e.id} is its own parent`)
  }
  // Every non-section element must resolve, through its parent chain, to a
  // section that belongs to the same page (mirrors what the runtime tree
  // build effectively requires, even though the DB doesn't enforce it
  // directly beyond the FK).
  const byId = new Map(doc.elements.map((e) => [e.id, e]))
  for (const e of doc.elements) {
    if (e.type === 'section') {
      if (e.parentId !== null) fail(label, `section ${e.id} must be root (parentId null)`)
      continue
    }
    let cursor: FunnelElement | undefined = e
    let hops = 0
    while (cursor && cursor.parentId !== null) {
      const parent = byId.get(cursor.parentId)
      if (!parent) fail(label, `element ${e.id} parent chain broken at ${cursor.parentId}`)
      if (parent.pageId !== e.pageId) fail(label, `element ${e.id} parent chain crosses pages`)
      cursor = parent
      hops += 1
      if (hops > 50) fail(label, `element ${e.id} parent chain too deep / cyclic`)
    }
  }

  // Content/style/logic sanity: every field referenced by score rules must
  // exist among that element's own options (only meaningful for
  // quiz_choice, mirrors ScoringEditor's own domain in the builder).
  for (const e of doc.elements) {
    if (e.type !== 'quiz_choice') continue
    const options = Array.isArray(e.content.options)
      ? e.content.options.filter((o): o is string => typeof o === 'string')
      : []
    for (const rule of e.logic.scoring ?? []) {
      if (rule.value !== undefined && !options.includes(String(rule.value))) {
        fail(label, `element ${e.id} scoring rule references unknown option "${String(rule.value)}"`)
      }
    }
  }

  // Flow: connections/result ranges reference real pages.
  const flow = doc.flow
  if (flow?.entryPageId && !pageIds.has(flow.entryPageId)) fail(label, 'flow.entryPageId unknown')
  for (const c of flow?.connections ?? []) {
    if (!pageIds.has(c.sourcePageId)) fail(label, `connection sourcePageId unknown: ${c.sourcePageId}`)
    if (!pageIds.has(c.targetPageId)) fail(label, `connection targetPageId unknown: ${c.targetPageId}`)
  }
  for (const r of flow?.resultRanges ?? []) {
    if (!pageIds.has(r.sourcePageId)) fail(label, `resultRange sourcePageId unknown: ${r.sourcePageId}`)
    if (!pageIds.has(r.targetPageId)) fail(label, `resultRange targetPageId unknown: ${r.targetPageId}`)
  }

  // Result ranges from the same source page must not overlap, and together
  // should not leave gaps an achievable score could fall into (informational
  // — only checked across all ranges' own declared bounds).
  const rangesBySource = new Map<string, NonNullable<typeof flow>['resultRanges']>()
  for (const r of flow?.resultRanges ?? []) {
    const list = rangesBySource.get(r.sourcePageId) ?? []
    list.push(r)
    rangesBySource.set(r.sourcePageId, list)
  }
  for (const [sourceId, ranges] of rangesBySource) {
    const sorted = [...(ranges ?? [])].sort((a, b) => (a.minScore ?? -Infinity) - (b.minScore ?? -Infinity))
    for (let i = 1; i < sorted.length; i += 1) {
      const prevMax = sorted[i - 1].maxScore
      const curMin = sorted[i].minScore
      if (prevMax !== undefined && curMin !== undefined && curMin <= prevMax) {
        fail(label, `resultRanges on page ${sourceId} overlap: "${sorted[i - 1].label}" (max ${prevMax}) and "${sorted[i].label}" (min ${curMin})`)
      }
      if (prevMax !== undefined && curMin !== undefined && curMin > prevMax + 1) {
        console.log(`  [note] resultRanges on page ${sourceId} leave a gap between ${prevMax} and ${curMin} — a score in that gap falls through to the default connection (or terminal/submit if none exists).`)
      }
    }
  }

  // Edges for both the "unreachable page" and "terminal path" publish
  // triggers (20260823003506_...sql): flow.connections, flow.resultRanges,
  // and go_to_page action targets ONLY. Critically, a plain next_page
  // button never counts as an edge here — the DB trigger doesn't treat it
  // as one, and neither does the runtime once flow.connections is
  // explicitly set (see getEffectiveFlowConnections()/hasExplicitFlow() in
  // src/lib/funnel/flow.ts). Every real hop must be declared explicitly.
  const entryId = flow?.entryPageId ?? doc.pages.slice().sort((a, b) => a.order - b.order)[0].id
  const edges: Array<{ from: string; to: string }> = []
  for (const c of flow?.connections ?? []) edges.push({ from: c.sourcePageId, to: c.targetPageId })
  for (const r of flow?.resultRanges ?? []) edges.push({ from: r.sourcePageId, to: r.targetPageId })
  for (const e of doc.elements) {
    if ((e.type === 'button' || e.type === 'cta') && e.content.action === 'go_to_page' && typeof e.content.target === 'string') {
      const targetPage = doc.pages.find((p) => p.id === e.content.target || p.slug === e.content.target)
      if (targetPage) edges.push({ from: e.pageId, to: targetPage.id })
    }
  }

  const reachable = new Set([entryId])
  let grew = true
  while (grew) {
    grew = false
    for (const edge of edges) {
      if (reachable.has(edge.from) && !reachable.has(edge.to)) { reachable.add(edge.to); grew = true }
    }
  }
  for (const p of doc.pages) {
    if (!reachable.has(p.id)) fail(label, `page "${p.name}" (${p.id}) is unreachable — would fail publish ("contains an unreachable page")`)
  }

  const submitPages = new Set(
    doc.elements
      .filter((e) => (e.type === 'button' || e.type === 'cta') && e.content.action === 'submit')
      .map((e) => e.pageId),
  )
  const nextPageOnlyPages = new Set(
    doc.elements
      .filter((e) => (e.type === 'button' || e.type === 'cta') && e.content.action === 'next_page')
      .map((e) => e.pageId),
  )
  const hasOutgoing = new Set(edges.map((e) => e.from))

  const canExit = new Set<string>()
  for (const p of doc.pages) {
    if (submitPages.has(p.id)) canExit.add(p.id)
    else if (nextPageOnlyPages.has(p.id) && !hasOutgoing.has(p.id)) canExit.add(p.id)
  }
  grew = true
  while (grew) {
    grew = false
    for (const edge of edges) {
      if (canExit.has(edge.to) && !canExit.has(edge.from)) { canExit.add(edge.from); grew = true }
    }
  }

  for (const pageId of reachable) {
    if (!canExit.has(pageId)) {
      const p = doc.pages.find((x) => x.id === pageId)
      fail(label, `page "${p?.name}" (${pageId}) is reachable but cannot reach a submit control — would fail publish`)
    }
  }

  // Critical for score-routed funnels: a page whose only button is
  // action:'submit' NEVER consults resultRanges (handleAction's 'submit'
  // case in funnel-player.tsx calls submit() directly, bypassing
  // resolveFunnelDecision entirely) — so a resultRange declared with that
  // page as sourcePageId would silently never fire. Flag this loudly.
  for (const r of flow?.resultRanges ?? []) {
    if (submitPages.has(r.sourcePageId) && !nextPageOnlyPages.has(r.sourcePageId)) {
      fail(label, `resultRange "${r.label}" has sourcePageId ${r.sourcePageId}, but that page's button uses action:'submit' — resultRanges are only evaluated on next_page, so this range would never be reached. Use action:'next_page' on that button instead.`)
    }
  }

  // Informational: flag next_page buttons with no declared outgoing edge
  // (once flow.connections is explicit) so a genuinely-missing hop is easy
  // to spot by eye, even though such a page is technically still "valid"
  // (it just becomes an implicit completion point at runtime).
  if (flow?.connections !== undefined) {
    for (const pageId of nextPageOnlyPages) {
      if (!hasOutgoing.has(pageId) && !submitPages.has(pageId)) {
        const p = doc.pages.find((x) => x.id === pageId)
        console.log(`  [note] "${p?.name}" has a next_page button with no declared connection — will implicitly submit/complete instead of advancing. Intentional only for true dead ends.`)
      }
    }
  }

  console.log(`[OK] ${label}: ${doc.pages.length} pages, ${doc.elements.length} elements, reachable=${reachable.size}, canExit=${canExit.size}`)
}
