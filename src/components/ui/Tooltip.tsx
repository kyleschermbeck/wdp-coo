'use client'

import { useState, useRef, useLayoutEffect, ReactNode } from 'react'

interface TooltipProps {
  content: ReactNode
  children: ReactNode
  /** placement preference — falls back to above if no room below */
  placement?: 'top' | 'bottom'
  /** max width of tooltip bubble */
  maxWidth?: number
  /** delay before showing (ms) */
  delay?: number
}

/**
 * Lightweight hover tooltip.
 *
 * Wrap any element:
 *   <Tooltip content="Revenue minus COGS"><span>42%</span></Tooltip>
 *
 * For richer content pass a ReactNode:
 *   <Tooltip content={<><b>Open Rate</b><br/>Opened / Received emails</>}>…</Tooltip>
 */
export function Tooltip({ content, children, placement = 'top', maxWidth = 260, delay = 120 }: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0, above: true })
  const wrapRef = useRef<HTMLSpanElement>(null)
  const tipRef  = useRef<HTMLDivElement>(null)
  const timer   = useRef<ReturnType<typeof setTimeout> | null>(null)

  function show() {
    timer.current = setTimeout(() => {
      if (!wrapRef.current) return
      const rect = wrapRef.current.getBoundingClientRect()
      const tipH = tipRef.current?.offsetHeight ?? 40
      const above = placement === 'top' || rect.top > tipH + 16

      setCoords({
        top:  above ? rect.top  - tipH - 8 : rect.bottom + 8,
        left: rect.left + rect.width / 2,
        above,
      })
      setVisible(true)
    }, delay)
  }

  function hide() {
    if (timer.current) clearTimeout(timer.current)
    setVisible(false)
  }

  // Reposition on each visibility toggle so the size is known
  useLayoutEffect(() => {
    if (!visible || !wrapRef.current || !tipRef.current) return
    const rect = wrapRef.current.getBoundingClientRect()
    const tipH = tipRef.current.offsetHeight
    const above = placement === 'top' || rect.top > tipH + 16

    setCoords({
      top:  above ? rect.top  - tipH - 8 : rect.bottom + 8,
      left: rect.left + rect.width / 2,
      above,
    })
  }, [visible, placement])

  return (
    <>
      <span
        ref={wrapRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        style={{ display: 'inline-flex', alignItems: 'center', position: 'relative' }}
      >
        {children}
      </span>

      {/* Portal-level fixed tooltip — renders over everything */}
      <div
        ref={tipRef}
        role="tooltip"
        style={{
          position: 'fixed',
          top: coords.top,
          left: coords.left,
          transform: 'translateX(-50%)',
          maxWidth,
          zIndex: 9999,
          pointerEvents: 'none',

          background: '#1A1A1A',
          color: 'rgba(250,249,246,0.92)',
          fontFamily: "'Jost', system-ui, sans-serif",
          fontSize: 12,
          fontWeight: 400,
          lineHeight: 1.5,
          borderRadius: 8,
          padding: '7px 11px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.22)',
          whiteSpace: 'pre-wrap',
          textAlign: 'center',

          opacity: visible ? 1 : 0,
          transition: 'opacity 0.12s ease',
        }}
      >
        {content}
        {/* Arrow */}
        <span
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            width: 0,
            height: 0,
            ...(coords.above
              ? { bottom: -5, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '5px solid #1A1A1A' }
              : { top: -5,    borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: '5px solid #1A1A1A' }
            ),
          }}
        />
      </div>
    </>
  )
}
