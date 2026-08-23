export const FUNNEL_SCHEMA_VERSION = 2 as const

export type Breakpoint = 'desktop' | 'tablet' | 'mobile'

export type ElementCategory =
  | 'layout'
  | 'content'
  | 'form'
  | 'interactive'
  | 'marketing'

export type ElementType =
  | 'section'
  | 'container'
  | 'spacer'
  | 'divider'
  | 'heading'
  | 'text'
  | 'image'
  | 'video'
  | 'button'
  | 'icon'
  | 'embed'
  | 'audio'
  | 'short_text'
  | 'email'
  | 'phone'
  | 'number'
  | 'date'
  | 'select'
  | 'checkbox'
  | 'radio'
  | 'upload'
  | 'quiz_choice'
  | 'slider'
  | 'rating'
  | 'progress'
  | 'countdown'
  | 'accordion'
  | 'offer'
  | 'price'
  | 'testimonial'
  | 'faq'
  | 'benefits'
  | 'cta'
  | 'social_proof'
  | 'logo_cloud'

export type VariableKind = 'custom' | 'answer' | 'lead' | 'system' | 'utm'

export interface StyleProperties {
  display?: 'block' | 'flex' | 'grid' | 'none'
  flexDirection?: 'row' | 'column'
  alignItems?: 'start' | 'center' | 'end' | 'stretch'
  justifyContent?: 'start' | 'center' | 'end' | 'between'
  columns?: number
  gap?: number
  width?: string
  maxWidth?: string
  minHeight?: number
  paddingX?: number
  paddingY?: number
  marginTop?: number
  marginBottom?: number
  backgroundColor?: string
  textColor?: string
  accentColor?: string
  borderColor?: string
  borderWidth?: number
  borderRadius?: number
  fontSize?: number
  fontWeight?: number
  lineHeight?: number
  textAlign?: 'left' | 'center' | 'right'
  opacity?: number
  shadow?: 'none' | 'sm' | 'md' | 'lg' | 'glow'
  objectFit?: 'cover' | 'contain'
}

export interface ResponsiveStyles {
  desktop: StyleProperties
  tablet?: Partial<StyleProperties>
  mobile?: Partial<StyleProperties>
}

export type ComparisonOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'greater_than'
  | 'less_than'
  | 'is_empty'
  | 'is_not_empty'

export interface VisibilityCondition {
  id: string
  variable: string
  operator: ComparisonOperator
  value?: string | number | boolean
}

export interface ConditionGroup {
  operator: 'and' | 'or'
  conditions: VisibilityCondition[]
}

export type FlowConditionSource = 'answer' | 'variable' | 'score' | 'utm'

export interface FlowCondition {
  id: string
  source: FlowConditionSource
  key: string
  operator: ComparisonOperator
  value?: string | number | boolean
}

export interface FlowConditionGroup {
  operator: 'and' | 'or'
  conditions: FlowCondition[]
}

export interface FunnelFlowConnection {
  id: string
  sourcePageId: string
  targetPageId: string
  label?: string
  priority?: number
  isDefault?: boolean
  condition?: FlowConditionGroup
}

export interface FunnelFlowScoringRule {
  id: string
  label?: string
  points: number
  condition: FlowConditionGroup
}

export interface FunnelResultRange {
  id: string
  label: string
  sourcePageId: string
  targetPageId: string
  minScore?: number
  maxScore?: number
  resultKey?: string
}

export interface FunnelFlowDefinition {
  entryPageId?: string
  connections?: FunnelFlowConnection[]
  scoringRules?: FunnelFlowScoringRule[]
  resultRanges?: FunnelResultRange[]
}

export type ElementActionType =
  | 'next_page'
  | 'previous_page'
  | 'go_to_page'
  | 'submit'
  | 'open_url'

export interface ElementAction {
  id: string
  trigger: 'click' | 'change' | 'complete'
  type: ElementActionType
  target?: string
}

export interface ScoringRule {
  id: string
  value?: string | number | boolean
  points: number
}

export interface ElementLogic {
  visibility?: ConditionGroup
  actions?: ElementAction[]
  scoring?: ScoringRule[]
}

export interface FunnelElement {
  id: string
  type: ElementType
  pageId: string
  parentId: string | null
  slot: string
  order: number
  content: Record<string, unknown>
  styles: ResponsiveStyles
  logic: ElementLogic
}

export interface FunnelPage {
  id: string
  name: string
  slug: string
  order: number
  settings: Record<string, unknown>
}

export interface FunnelVariable {
  id: string
  key: string
  label?: string
  kind: VariableKind
  value?: string | number | boolean | null
  settings?: Record<string, unknown>
}

export interface FunnelSettings {
  theme?: 'dark' | 'light'
  backgroundColor?: string
  fontFamily?: string
  seoTitle?: string
  seoDescription?: string
  [key: string]: unknown
}

/**
 * Canonical editor/persistence shape. Pages, elements and variables are kept
 * normalized so the API can diff records without parsing a recursive tree.
 */
export interface FunnelDocument {
  schemaVersion: typeof FUNNEL_SCHEMA_VERSION
  funnelId: string
  title: string
  slug: string
  settings: FunnelSettings
  pages: FunnelPage[]
  elements: FunnelElement[]
  variables: FunnelVariable[]
  /**
   * Optional so snapshots created before the visual flow editor keep their
   * original, ordered-page navigation semantics.
   */
  flow?: FunnelFlowDefinition
}

export type InspectorControl =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'toggle'
  | 'color'
  | 'options'
  | 'url'

export interface InspectorFieldDefinition {
  key: string
  label: string
  control: InspectorControl
  target: 'content' | 'style' | 'logic'
  options?: Array<{ label: string; value: string }>
  placeholder?: string
}

export interface InspectorDefinition {
  id: string
  label: string
  fields: InspectorFieldDefinition[]
}

export interface ElementDefinition {
  type: ElementType
  category: ElementCategory
  label: string
  description: string
  icon: string
  defaultContent: Record<string, unknown>
  defaultStyles: StyleProperties
  allowedParents: ElementType[]
  inspectorSections: InspectorDefinition[]
  interactive: boolean
  implementedInV1: boolean
}

export interface SaveDraftInput {
  funnelId: string
  expectedRevision: number
  document: FunnelDocument
  label?: string
}

export interface SaveDraftResult {
  ok: boolean
  revision?: number
  error?: string
  conflict?: boolean
}

export interface PublishFunnelInput {
  funnelId: string
  expectedRevision: number
  document: FunnelDocument
}

export interface PublishFunnelResult extends SaveDraftResult {
  publishedUrl?: string
}
