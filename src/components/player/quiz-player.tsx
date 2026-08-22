'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import Script from 'next/script'
import {
  ArrowRight,
  CheckCircle2,
  Lock,
  ChevronRight,
  ShieldCheck,
  Loader2,
  ArrowLeft,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { submitQuizResponse } from '@/app/q/[id]/actions'
import { trackQuizView, trackQuizDropoff } from '@/app/q/[id]/tracking-actions'
import { ProcessingScreen } from '@/components/player/processing-screen'
import { ScoredResultScreen } from '@/components/player/scored-result-screen'
import { ImageChoiceStep } from '@/components/player/image-choice-step'
import { LikertStep } from '@/components/player/likert-step'
import { ContentInterstitial } from '@/components/player/content-interstitial'
import { ComparisonStep } from '@/components/player/comparison-step'
import { TimerStep } from '@/components/player/timer-step'
import { NumericCalcStep, type NumericFormula } from '@/components/player/numeric-calc-step'
import { AlertStep, type AlertVariant } from '@/components/player/alert-step'
import { TestimonialStep } from '@/components/player/testimonial-step'
import { SocialProofToast } from '@/components/player/social-proof-toast'
import { ButtonStep } from '@/components/player/button-step'
import { SpacerStep } from '@/components/player/spacer-step'
import { ChartStep } from '@/components/player/chart-step'
import { QuadrantStep } from '@/components/player/quadrant-step'
import { AudioStep } from '@/components/player/audio-step'
import { interpolateVariables } from '@/lib/interpolate-variables'

interface BranchingRule {
  option_id: string
  go_to_order: number
}

interface Option {
  id: string
  text: string
  order_num?: number
  image_url?: string
}

interface ComparisonRow {
  label: string
  left_text: string
  right_text: string
}

interface ChartBar {
  label: string
  value: number
}

interface QuadrantPoint {
  label: string
  x: number
  y: number
  highlighted?: boolean
}

interface QuestionSettings {
  body?: string
  testimonial_text?: string
  testimonial_author?: string
  cta_label?: string
  left_label?: string
  right_label?: string
  rows?: ComparisonRow[]
  duration_seconds?: number
  field_a_label?: string
  field_a_placeholder?: string
  field_b_label?: string
  field_b_placeholder?: string
  formula?: NumericFormula
  alert_variant?: AlertVariant
  author_role?: string
  rating?: number
  avatar_url?: string
  notification_name?: string
  notification_action?: string
  notification_time_label?: string
  button_url?: string
  button_open_new_tab?: boolean
  chart_bars?: ChartBar[]
  chart_unit?: string
  quadrant_x_label?: string
  quadrant_y_label?: string
  quadrant_points?: QuadrantPoint[]
  audio_url?: string
}

interface Question {
  id: string
  title: string
  description?: string
  type: string
  order_num: number
  options?: Option[]
  branching_rules?: BranchingRule[]
  settings?: QuestionSettings
}

// Narrative blocks are not questions — they don't get answered or scored,
// so they're excluded from the "Pergunta X de Y" count and from
// drop-off/progress math the same way the lead-capture gate is.
// numeric_calc *does* produce an answer (the values typed + the computed
// result), so it's treated as answerable like multiple_choice/text.
const NARRATIVE_TYPES = [
  'content', 'comparison', 'timer',
  'alert', 'testimonial', 'social_proof', 'button', 'spacer', 'chart', 'quadrant', 'audio',
]
const isContentBlock = (type: string) => NARRATIVE_TYPES.includes(type)

export function QuizPlayer({
  quiz,
  questions,
}: {
  quiz: any
  questions: Question[]
}) {
  const searchParams = useSearchParams()
  const viewTracked = useRef(false)

  const utms = {
    utm_source: searchParams.get('utm_source') || undefined,
    utm_medium: searchParams.get('utm_medium') || undefined,
    utm_campaign: searchParams.get('utm_campaign') || undefined,
    utm_content: searchParams.get('utm_content') || undefined,
    utm_term: searchParams.get('utm_term') || undefined,
  }

  // Navigation history stack for "back" support
  const [history, setHistory] = useState<number[]>([0])
  const currentStepIndex = history[history.length - 1]

  const [answers, setAnswers] = useState<{
    [qId: string]: { optionId?: string; optionText?: string; textValue?: string }
  }>({})
  const [leadName, setLeadName] = useState('')
  const [leadPhone, setLeadPhone] = useState('')
  const [leadEmail, setLeadEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCompleted, setIsCompleted] = useState(false)
  const [redirectingUrl, setRedirectingUrl] = useState<string | null>(null)

  // When the quiz has scoring enabled and produced a level, the flow is:
  // lead capture submit → fake "processing" sequence → ruler result screen
  // → then the normal completed/thank-you screen. Quizzes without scoring
  // configured skip straight to `isCompleted`, unchanged from before.
  const [showProcessing, setShowProcessing] = useState(false)
  const [scoredResult, setScoredResult] = useState<{
    score: number
    levelName: string
    levelDescription: string | null
    levelColor: string
    allLevels: Array<{ name: string; minScore: number; maxScore: number; color: string }>
  } | null>(null)
  const [showScoredResult, setShowScoredResult] = useState(false)

  // Total steps = questions + 1 (lead capture gate)
  const totalSteps = questions.length + 1
  const isLeadCaptureStep = currentStepIndex === questions.length
  const progressPercentage = Math.round(((currentStepIndex + 1) / totalSteps) * 100)
  const currentQuestion = questions[currentStepIndex]

  // Content/comparison blocks aren't "questions" the visitor answers — count
  // only actual answerable questions up to and including the current step so
  // "Pergunta X de Y" doesn't include narrative interstitials in either number.
  const answerableQuestions = questions.filter((q) => !isContentBlock(q.type))
  const answerableIndex = questions
    .slice(0, currentStepIndex + 1)
    .filter((q) => !isContentBlock(q.type)).length

  // {{resposta_N}} refers to the Nth answerable question (1-indexed, matching
  // the numbering shown in the builder) — not the raw array index, which
  // would also count content/comparison blocks that are never "answered".
  const answersByPosition: Record<number, string> = {}
  answerableQuestions.forEach((q, idx) => {
    const ans = answers[q.id]
    const value = ans?.optionText || ans?.textValue
    if (value) answersByPosition[idx + 1] = value
  })

  const interpolate = (text: string | undefined | null) =>
    interpolateVariables(text, {
      leadName,
      leadPhone,
      leadEmail,
      answersByPosition,
    })

  // Declared before the effects that call it — `const` functions are not
  // usable prior to their declaration line (temporal dead zone), and this
  // one used to sit after the mount effect that calls it, throwing a
  // ReferenceError on every load of the public quiz page.
  const triggerPixelEvent = (eventName: string, params?: Record<string, any>) => {
    // Meta Pixel
    if (typeof window !== 'undefined' && (window as any).fbq) {
      if (eventName.startsWith('Custom:')) {
        ;(window as any).fbq('trackCustom', eventName.replace('Custom:', ''), params)
      } else {
        ;(window as any).fbq('track', eventName, params)
      }
    }
    // GA4
    if (typeof window !== 'undefined' && (window as any).gtag) {
      const ga4EventMap: Record<string, string> = {
        'PageView': 'page_view',
        'Lead': 'generate_lead',
        'Custom:QuizStart': 'quiz_start',
      }
      const ga4Event = ga4EventMap[eventName]
      if (ga4Event) {
        ;(window as any).gtag('event', ga4Event, params)
      }
    }
  }

  // Track view once on mount
  useEffect(() => {
    if (!viewTracked.current) {
      viewTracked.current = true
      trackQuizView(quiz.id, {
        utm_source: utms.utm_source,
        utm_medium: utms.utm_medium,
        utm_campaign: utms.utm_campaign,
      })
      triggerPixelEvent('Custom:QuizStart', { quiz_title: quiz.title })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Track drop-off when leaving the page mid-quiz
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!isCompleted && currentQuestion) {
        trackQuizDropoff(quiz.id, currentQuestion.id, currentQuestion.order_num)
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isCompleted, currentQuestion, quiz.id])

  // Determine next question index with branching logic
  const getNextIndex = (question: Question, selectedOptionId?: string): number => {
    const rules = question.branching_rules || []
    if (selectedOptionId && rules.length > 0) {
      const matchingRule = rules.find((r) => r.option_id === selectedOptionId)
      if (matchingRule) {
        const targetIndex = questions.findIndex((q) => q.order_num === matchingRule.go_to_order)
        if (targetIndex !== -1) return targetIndex
      }
    }
    // No rule → go to next in sequence
    return currentStepIndex + 1
  }

  const goBack = () => {
    if (history.length > 1) {
      setHistory((prev) => prev.slice(0, -1))
    }
  }

  const handleSelectOption = (option: Option) => {
    if (!currentQuestion) return

    setAnswers({
      ...answers,
      [currentQuestion.id]: { optionId: option.id, optionText: option.text },
    })

    setTimeout(() => {
      const nextIndex = getNextIndex(currentQuestion, option.id)
      setHistory((prev) => [...prev, nextIndex])
    }, 200)
  }

  const handleTextAnswer = (text: string) => {
    if (!currentQuestion) return
    setAnswers({ ...answers, [currentQuestion.id]: { textValue: text } })
  }

  const handleNumericCalcSubmit = (values: { a: number; b?: number; result?: number }) => {
    if (!currentQuestion) return
    // The stored/displayable answer is the computed result when a formula
    // produced one, otherwise just the single value typed in.
    const textValue = values.result !== undefined ? values.result.toFixed(1) : String(values.a)
    setAnswers({ ...answers, [currentQuestion.id]: { textValue } })
    handleNext()
  }

  const handleNext = () => {
    if (!currentQuestion) return
    const nextIndex = getNextIndex(currentQuestion)
    setHistory((prev) => [...prev, nextIndex])
  }

  const formatPhone = (val: string) => {
    const raw = val.replace(/\D/g, '')
    if (raw.length <= 10) {
      return raw.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').trim()
    }
    return raw.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3').trim()
  }

  const handleSubmitLead = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!leadName.trim() || !leadPhone.trim()) return

    setIsSubmitting(true)
    try {
      triggerPixelEvent('Lead', { content_name: quiz.title, status: 'completed' })

      const formattedAnswers = questions.map((q) => ({
        questionId: q.id,
        questionTitle: q.title,
        optionId: answers[q.id]?.optionId,
        optionText: answers[q.id]?.optionText,
        textValue: answers[q.id]?.textValue,
      }))

      const result = await submitQuizResponse({
        quizId: quiz.id,
        name: leadName,
        phone: leadPhone,
        email: leadEmail,
        utms,
        answers: formattedAnswers,
      })

      if (result.result) {
        // Scored quiz: stash the redirect for after the result is shown
        // (rather than firing it immediately) so the visitor actually sees
        // the ruler they just answered questions for.
        setScoredResult(result.result)
        if (result.redirectUrl) setRedirectingUrl(result.redirectUrl)
        setShowProcessing(true)
      } else {
        setIsCompleted(true)
        if (result.redirectUrl) {
          setRedirectingUrl(result.redirectUrl)
          setTimeout(() => {
            window.location.href = result.redirectUrl!
          }, 1800)
        }
      }
    } catch (err) {
      console.error(err)
      alert('Erro ao enviar dados. Tente novamente.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleProcessingComplete = () => {
    setShowProcessing(false)
    setShowScoredResult(true)
  }

  const handleFinishFromResult = () => {
    if (redirectingUrl) {
      window.location.href = redirectingUrl
    } else {
      setShowScoredResult(false)
      setIsCompleted(true)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-between relative selection:bg-indigo-500 selection:text-white">
      {/* Meta Pixel Script */}
      {quiz.meta_pixel_id && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${quiz.meta_pixel_id}');
            fbq('track', 'PageView');
          `}
        </Script>
      )}

      {/* GA4 Script Injection */}
      {quiz.ga4_measurement_id && (
        <>
          <Script
            id="ga4-script"
            strategy="afterInteractive"
            src={`https://www.googletagmanager.com/gtag/js?id=${quiz.ga4_measurement_id}`}
          />
          <Script id="ga4-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${quiz.ga4_measurement_id}', { send_page_view: true });
            `}
          </Script>
        </>
      )}

      {/* Background Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-lg h-72 bg-gradient-to-b from-indigo-600/15 via-transparent to-transparent pointer-events-none blur-3xl" />

      {/* Top Header & Progress — hidden once the scored-result sequence starts,
          since "back" and "% through the questions" no longer apply */}
      {!showProcessing && !showScoredResult && (
        <header className="w-full max-w-xl mx-auto px-6 pt-6 z-10">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-2.5 font-medium">
            <div className="flex items-center gap-2">
              {history.length > 1 && !isCompleted && (
                <button
                  type="button"
                  onClick={goBack}
                  className="text-zinc-500 hover:text-zinc-200 transition"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
              <span className="truncate max-w-[200px]">{quiz.title}</span>
            </div>
            <span className="font-mono text-indigo-400">{progressPercentage}%</span>
          </div>
          <div className="w-full h-1.5 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all duration-500 rounded-full"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </header>
      )}

      {/* Main Stage */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 z-10 w-full max-w-xl mx-auto">
        {showProcessing ? (
          <ProcessingScreen
            messages={quiz.loading_messages || []}
            onComplete={handleProcessingComplete}
          />
        ) : showScoredResult && scoredResult ? (
          <div className="w-full space-y-4">
            <ScoredResultScreen
              result={{
                ...scoredResult,
                levelDescription: interpolate(scoredResult.levelDescription),
              }}
            />
            <Button
              onClick={handleFinishFromResult}
              className="w-full h-12 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold gap-2"
            >
              Continuar <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        ) : isCompleted ? (
          /* COMPLETED SCREEN */
          <div className="w-full text-center space-y-6 animate-in fade-in zoom-in-95 duration-500 py-10">
            <div className="h-16 w-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/10">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                Avaliação Concluída!
              </h2>
              <p className="text-zinc-400 text-sm max-w-sm mx-auto">
                Obrigado, <span className="text-zinc-200 font-semibold">{leadName}</span>! Suas respostas foram computadas.
              </p>
            </div>
            {redirectingUrl ? (
              <div className="flex items-center justify-center gap-2 text-xs text-indigo-400 pt-4 animate-pulse">
                <Loader2 className="h-4 w-4 animate-spin" />
                Redirecionando para o seu resultado...
              </div>
            ) : (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 backdrop-blur-xl max-w-md mx-auto text-left space-y-2">
                <p className="text-xs text-zinc-400 uppercase tracking-wider font-semibold">Próximo Passo:</p>
                <p className="text-sm text-zinc-300">
                  Nossa equipe entrará em contato pelo WhatsApp informado ({leadPhone}).
                </p>
              </div>
            )}
          </div>
        ) : isLeadCaptureStep ? (
          /* LEAD CAPTURE GATE */
          <div className="w-full rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6 sm:p-8 backdrop-blur-2xl shadow-2xl space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="space-y-2 text-center">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold">
                <Lock className="h-3.5 w-3.5" /> Quase pronto!
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                Onde devemos enviar seu resultado personalizado?
              </h2>
              <p className="text-zinc-400 text-xs sm:text-sm">
                Informe seus dados para liberar a sua avaliação imediatamente.
              </p>
            </div>

            <form onSubmit={handleSubmitLead} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="leadName" className="text-zinc-300 text-xs">Seu Nome Completo</Label>
                <Input
                  id="leadName"
                  value={leadName}
                  onChange={(e) => setLeadName(e.target.value)}
                  placeholder="Ex: João da Silva"
                  className="h-11 border-zinc-700 bg-zinc-950 text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="leadPhone" className="text-zinc-300 text-xs">WhatsApp com DDD</Label>
                <Input
                  id="leadPhone"
                  value={leadPhone}
                  onChange={(e) => setLeadPhone(formatPhone(e.target.value))}
                  placeholder="(11) 99999-9999"
                  maxLength={15}
                  className="h-11 border-zinc-700 bg-zinc-950 text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500 font-mono"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="leadEmail" className="text-zinc-300 text-xs">E-mail (opcional)</Label>
                <Input
                  id="leadEmail"
                  type="email"
                  value={leadEmail}
                  onChange={(e) => setLeadEmail(e.target.value)}
                  placeholder="joao@gmail.com"
                  className="h-11 border-zinc-700 bg-zinc-950 text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-500"
                />
              </div>
              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-12 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-600 text-white font-semibold shadow-lg shadow-indigo-500/25 transition gap-2"
                >
                  {isSubmitting ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Calculando seu resultado...</>
                  ) : (
                    <>Ver Meu Resultado Agora <ArrowRight className="h-4 w-4" /></>
                  )}
                </Button>
              </div>
              <div className="flex items-center justify-center gap-1.5 text-[11px] text-zinc-500 pt-1">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                <span>Seus dados estão protegidos. Não enviamos spam.</span>
              </div>
            </form>
          </div>
        ) : currentQuestion.type === 'content' ? (
          /* CONTENT INTERSTITIAL — narrative screen, not a question */
          <div key={currentStepIndex} className="w-full">
            <ContentInterstitial
              title={interpolate(currentQuestion.title)}
              body={interpolate(currentQuestion.settings?.body)}
              testimonialText={interpolate(currentQuestion.settings?.testimonial_text)}
              testimonialAuthor={interpolate(currentQuestion.settings?.testimonial_author)}
              ctaLabel={interpolate(currentQuestion.settings?.cta_label)}
              onContinue={handleNext}
            />
          </div>
        ) : currentQuestion.type === 'comparison' ? (
          /* COMPARISON — two-column before/after table, not a question */
          <div key={currentStepIndex} className="w-full">
            <ComparisonStep
              title={interpolate(currentQuestion.title)}
              leftLabel={interpolate(currentQuestion.settings?.left_label) || 'Antes'}
              rightLabel={interpolate(currentQuestion.settings?.right_label) || 'Depois'}
              rows={(currentQuestion.settings?.rows || []).map((row) => ({
                label: interpolate(row.label),
                left_text: interpolate(row.left_text),
                right_text: interpolate(row.right_text),
              }))}
              onContinue={handleNext}
            />
          </div>
        ) : currentQuestion.type === 'timer' ? (
          /* SCARCITY TIMER — countdown urgency screen, not a question */
          <div key={currentStepIndex} className="w-full">
            <TimerStep
              title={interpolate(currentQuestion.title)}
              body={interpolate(currentQuestion.settings?.body)}
              durationSeconds={currentQuestion.settings?.duration_seconds || 300}
              ctaLabel={interpolate(currentQuestion.settings?.cta_label)}
              onContinue={handleNext}
            />
          </div>
        ) : currentQuestion.type === 'alert' ? (
          /* ALERT — highlighted warning/info banner, not a question */
          <div key={currentStepIndex} className="w-full">
            <AlertStep
              title={interpolate(currentQuestion.title)}
              body={interpolate(currentQuestion.settings?.body)}
              variant={currentQuestion.settings?.alert_variant}
              onContinue={handleNext}
            />
          </div>
        ) : currentQuestion.type === 'testimonial' ? (
          /* TESTIMONIAL — standalone social-proof card, not a question */
          <div key={currentStepIndex} className="w-full">
            <TestimonialStep
              title={interpolate(currentQuestion.title)}
              text={interpolate(currentQuestion.settings?.testimonial_text)}
              author={interpolate(currentQuestion.settings?.testimonial_author)}
              authorRole={interpolate(currentQuestion.settings?.author_role)}
              rating={currentQuestion.settings?.rating}
              avatarUrl={currentQuestion.settings?.avatar_url}
              onContinue={handleNext}
            />
          </div>
        ) : currentQuestion.type === 'social_proof' ? (
          /* SOCIAL PROOF — floating toast; the step has no main-stage
             content of its own, it just shows the toast (rendered as a
             fixed overlay below, outside this stage) and holds long enough
             for it to be noticed before auto-advancing. */
          <SpacerStep key={currentStepIndex} heightPx={260} onContinue={handleNext} />
        ) : currentQuestion.type === 'button' ? (
          /* STANDALONE BUTTON — CTA screen, not a question */
          <div key={currentStepIndex} className="w-full">
            <ButtonStep
              title={interpolate(currentQuestion.title)}
              body={interpolate(currentQuestion.settings?.body)}
              ctaLabel={interpolate(currentQuestion.settings?.cta_label)}
              url={currentQuestion.settings?.button_url}
              openNewTab={currentQuestion.settings?.button_open_new_tab}
              onContinue={handleNext}
            />
          </div>
        ) : currentQuestion.type === 'spacer' ? (
          /* SPACER — pure pacing gap, auto-advances */
          <SpacerStep
            key={currentStepIndex}
            heightPx={currentQuestion.settings?.duration_seconds || 24}
            onContinue={handleNext}
          />
        ) : currentQuestion.type === 'chart' ? (
          /* CHART — bar chart backing a statistic, not a question */
          <div key={currentStepIndex} className="w-full">
            <ChartStep
              title={interpolate(currentQuestion.title)}
              body={interpolate(currentQuestion.settings?.body)}
              bars={(currentQuestion.settings?.chart_bars || []).map((bar) => ({
                label: interpolate(bar.label) || '',
                value: bar.value,
              }))}
              unit={currentQuestion.settings?.chart_unit}
              onContinue={handleNext}
            />
          </div>
        ) : currentQuestion.type === 'quadrant' ? (
          /* QUADRANT — cartesian X/Y plot, not a question */
          <div key={currentStepIndex} className="w-full">
            <QuadrantStep
              title={interpolate(currentQuestion.title)}
              body={interpolate(currentQuestion.settings?.body)}
              xLabel={interpolate(currentQuestion.settings?.quadrant_x_label)}
              yLabel={interpolate(currentQuestion.settings?.quadrant_y_label)}
              points={(currentQuestion.settings?.quadrant_points || []).map((p) => ({
                ...p,
                label: interpolate(p.label) || '',
              }))}
              onContinue={handleNext}
            />
          </div>
        ) : currentQuestion.type === 'audio' ? (
          /* AUDIO — embedded player, not a question */
          <div key={currentStepIndex} className="w-full">
            <AudioStep
              title={interpolate(currentQuestion.title)}
              body={interpolate(currentQuestion.settings?.body)}
              audioUrl={currentQuestion.settings?.audio_url}
              onContinue={handleNext}
            />
          </div>
        ) : (
          /* QUESTION STEP */
          <div
            key={currentStepIndex}
            className="w-full rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6 sm:p-8 backdrop-blur-2xl shadow-2xl space-y-6 animate-in fade-in slide-in-from-right-4 duration-300"
          >
            <div className="space-y-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-full border border-indigo-500/20">
                Pergunta {answerableIndex} de {answerableQuestions.length}
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-white leading-tight">
                {interpolate(currentQuestion.title)}
              </h2>
              {currentQuestion.description && (
                <p className="text-zinc-400 text-xs sm:text-sm">{interpolate(currentQuestion.description)}</p>
              )}
            </div>

            {/* Multiple Choice */}
            {currentQuestion.type === 'multiple_choice' && (
              <div className="space-y-3 pt-2">
                {currentQuestion.options?.map((opt, optIdx) => {
                  const isSelected = answers[currentQuestion.id]?.optionId === opt.id
                  return (
                    <button
                      key={opt.id || optIdx}
                      type="button"
                      onClick={() => handleSelectOption(opt)}
                      className={`w-full text-left p-4 rounded-2xl border transition-all flex items-center justify-between group ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-600/15 text-white shadow-md shadow-indigo-500/10'
                          : 'border-zinc-800 bg-zinc-950/60 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900/80'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`h-7 w-7 rounded-lg text-xs font-semibold flex items-center justify-center transition ${
                          isSelected
                            ? 'bg-indigo-600 text-white'
                            : 'bg-zinc-800 text-zinc-400 group-hover:bg-zinc-700 group-hover:text-zinc-200'
                        }`}>
                          {String.fromCharCode(65 + optIdx)}
                        </span>
                        <span className="text-sm font-medium">{opt.text}</span>
                      </div>
                      <ChevronRight className={`h-4 w-4 transition ${isSelected ? 'text-indigo-400 translate-x-1' : 'text-zinc-600 group-hover:text-zinc-400'}`} />
                    </button>
                  )
                })}
              </div>
            )}

            {/* Image Choice */}
            {currentQuestion.type === 'image_choice' && (
              <ImageChoiceStep
                options={currentQuestion.options || []}
                selectedOptionId={answers[currentQuestion.id]?.optionId}
                onSelect={handleSelectOption}
              />
            )}

            {/* Likert Agreement Scale */}
            {currentQuestion.type === 'likert' && (
              <LikertStep
                options={currentQuestion.options || []}
                selectedOptionId={answers[currentQuestion.id]?.optionId}
                onSelect={handleSelectOption}
              />
            )}

            {/* Text Input */}
            {currentQuestion.type === 'text' && (
              <div className="space-y-4 pt-2">
                <Input
                  value={answers[currentQuestion.id]?.textValue || ''}
                  onChange={(e) => handleTextAnswer(e.target.value)}
                  placeholder="Digite sua resposta aqui..."
                  className="h-12 border-zinc-700 bg-zinc-950 text-zinc-100 text-sm placeholder:text-zinc-600"
                />
                <Button
                  onClick={handleNext}
                  disabled={!answers[currentQuestion.id]?.textValue?.trim()}
                  className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white gap-2 font-medium"
                >
                  Continuar <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Scale 1-5 */}
            {currentQuestion.type === 'scale' && (
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5].map((num) => {
                    const isSelected = answers[currentQuestion.id]?.textValue === String(num)
                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => {
                          handleTextAnswer(String(num))
                          setTimeout(() => handleNext(), 200)
                        }}
                        className={`h-14 rounded-xl border font-bold text-lg transition flex items-center justify-center ${
                          isSelected
                            ? 'border-indigo-500 bg-indigo-600 text-white'
                            : 'border-zinc-800 bg-zinc-950/60 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800'
                        }`}
                      >
                        {num}
                      </button>
                    )
                  })}
                </div>
                <div className="flex justify-between text-[11px] text-zinc-500 px-1 font-medium">
                  <span>1 (Muito Baixo)</span>
                  <span>5 (Muito Alto)</span>
                </div>
              </div>
            )}

            {/* Numeric Calculation */}
            {currentQuestion.type === 'numeric_calc' && (
              <NumericCalcStep
                fieldA={{
                  label: currentQuestion.settings?.field_a_label || 'Valor',
                  placeholder: currentQuestion.settings?.field_a_placeholder,
                }}
                fieldB={
                  currentQuestion.settings?.field_b_label
                    ? {
                        label: currentQuestion.settings.field_b_label,
                        placeholder: currentQuestion.settings.field_b_placeholder,
                      }
                    : undefined
                }
                formula={currentQuestion.settings?.formula || 'none'}
                onSubmit={handleNumericCalcSubmit}
              />
            )}
          </div>
        )}
      </main>

      {/* Social proof toast — floats over whichever step is active */}
      {currentQuestion?.type === 'social_proof' && (
        <SocialProofToast
          key={currentStepIndex}
          name={interpolate(currentQuestion.settings?.notification_name)}
          action={interpolate(currentQuestion.settings?.notification_action)}
          timeLabel={interpolate(currentQuestion.settings?.notification_time_label)}
        />
      )}

      {/* Footer — White-label aware */}
      {quiz.show_branding !== false && (
        <footer className="w-full py-4 text-center text-zinc-600 text-[11px] z-10">
          Criado com <span className="text-zinc-400 font-semibold">QuizFlow</span>
        </footer>
      )}
    </div>
  )
}
