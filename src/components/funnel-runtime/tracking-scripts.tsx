'use client'

import Script from 'next/script'
import { useEffect, useMemo, useRef } from 'react'
import type { FunnelSettings } from '@/lib/funnel'

const META_PIXEL_PATTERN = /^\d{5,20}$/
const GOOGLE_TAG_PATTERN = /^(?:G|GT|GTM|AW)-[A-Z0-9]{4,20}$/

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void
    gtag?: (...args: unknown[]) => void
    dataLayer?: Array<Record<string, unknown> | IArguments>
  }
}

function safeExternalScriptUrl(value: unknown) {
  if (typeof value !== 'string' || value.length > 2048) return ''
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    if (
      url.protocol !== 'https:'
      || url.username
      || url.password
      || (url.port && url.port !== '443')
      || !hostname.includes('.')
      || /^(?:localhost|\d+(?:\.\d+){3}|\[[0-9a-f:]+\])$/i.test(hostname)
      || /(?:^|\.)(?:local|internal|localhost|home\.arpa)$/i.test(hostname)
    ) return ''
    return url.toString()
  } catch {
    return ''
  }
}

function escapeAttribute(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function FunnelTrackingScripts({ settings }: { settings: FunnelSettings }) {
  const customFrame = useRef<HTMLIFrameElement>(null)
  const rawMetaPixelId = typeof settings.metaPixelId === 'string' ? settings.metaPixelId.trim() : ''
  const rawGoogleTagId = typeof settings.googleTagId === 'string' ? settings.googleTagId.trim().toUpperCase() : ''
  const metaPixelId = META_PIXEL_PATTERN.test(rawMetaPixelId) ? rawMetaPixelId : ''
  const googleTagId = GOOGLE_TAG_PATTERN.test(rawGoogleTagId) ? rawGoogleTagId : ''
  const isGoogleTagManager = googleTagId.startsWith('GTM-')
  const customScriptUrls = Array.isArray(settings.customScriptUrls)
    ? settings.customScriptUrls.slice(0, 5).map(safeExternalScriptUrl).filter(Boolean)
    : []
  const customScriptKey = customScriptUrls.join('|')
  const sandboxDocument = useMemo(() => {
    if (!customScriptKey) return ''
    const scripts = customScriptUrls.map((url) => `<script src="${escapeAttribute(url)}" async></script>`).join('')
    return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https:; connect-src https:; img-src https: data:"></head><body><script>window.funnelFlowEvents=[];window.addEventListener('message',function(e){if(!e.data||e.data.source!=='funnelflow')return;window.funnelFlowEvents.push(e.data);window.dispatchEvent(new CustomEvent(e.data.event,{detail:e.data.detail||{}}));});</script>${scripts}</body></html>`
    // The joined key is the stable serialization used to rebuild this isolated document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customScriptKey])

  useEffect(() => {
    if (!metaPixelId && !googleTagId && !customScriptKey) return
    const onStart = () => {
      if (metaPixelId) window.fbq?.('trackCustom', 'FunnelStart')
      if (isGoogleTagManager) window.dataLayer?.push({ event: 'funnelflow_start' })
      else if (googleTagId) window.gtag?.('event', 'funnel_start')
      customFrame.current?.contentWindow?.postMessage({ source: 'funnelflow', event: 'funnelflow:start' }, '*')
    }
    const onComplete = () => {
      if (metaPixelId) window.fbq?.('track', 'Lead')
      if (isGoogleTagManager) window.dataLayer?.push({ event: 'funnelflow_complete' })
      else if (googleTagId) window.gtag?.('event', 'generate_lead')
      customFrame.current?.contentWindow?.postMessage({ source: 'funnelflow', event: 'funnelflow:complete' }, '*')
    }
    window.addEventListener('funnelflow:start', onStart)
    window.addEventListener('funnelflow:complete', onComplete)
    return () => {
      window.removeEventListener('funnelflow:start', onStart)
      window.removeEventListener('funnelflow:complete', onComplete)
    }
  }, [customScriptKey, googleTagId, isGoogleTagManager, metaPixelId])

  return (
    <>
      {googleTagId && !isGoogleTagManager && (
        <>
          <Script
            id={`google-tag-loader-${googleTagId}`}
            src={`https://www.googletagmanager.com/gtag/js?id=${googleTagId}`}
            strategy="afterInteractive"
          />
          <Script id={`google-tag-init-${googleTagId}`} strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${googleTagId}',{send_page_view:true});`}
          </Script>
        </>
      )}

      {googleTagId && isGoogleTagManager && (
        <>
          <Script id={`google-tag-manager-${googleTagId}`} strategy="afterInteractive">
            {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${googleTagId}');`}
          </Script>
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${googleTagId}`}
              height="0"
              width="0"
              className="hidden"
              title="Google Tag Manager"
            />
          </noscript>
        </>
      )}

      {metaPixelId && (
        <>
          <Script id={`meta-pixel-loader-${metaPixelId}`} strategy="afterInteractive">
            {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${metaPixelId}');fbq('track','PageView');`}
          </Script>
          <noscript>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt=""
              height="1"
              width="1"
              className="hidden"
              src={`https://www.facebook.com/tr?id=${metaPixelId}&ev=PageView&noscript=1`}
            />
          </noscript>
        </>
      )}

      {sandboxDocument && (
        <iframe
          ref={customFrame}
          title="Scripts personalizados isolados"
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          srcDoc={sandboxDocument}
          className="pointer-events-none absolute size-px opacity-0"
          aria-hidden="true"
          tabIndex={-1}
        />
      )}
    </>
  )
}
