'use client'

import { useMemo, useRef, useState } from 'react'
import { Task, Project, Subtask } from '@/lib/types'
import { addDays, differenceInDays, eachMonthOfInterval, format, startOfMonth } from 'date-fns'

const DAY_W = 16
const ROW_H = 36
const SUB_ROW_H = 26
const MONTH_H = 24
const DAY_H = 28
const HEADER_H = MONTH_H + DAY_H
const GROUP_H = 28
const LEFT_W = 220

const COLOR_HEX: Record<string, string> = {
  sage: '#9BAE9A',
  terracotta: '#C27A54',
  butter: '#DFC97B',
  tomato: '#C14B3A',
  blueberry: '#78B7C5',
  thyme: '#5A7A5C',
  candy: '#D4789A',
  citrus: '#E8A23A',
}

const FONT = { fontFamily: "'Jost', system-ui, sans-serif" }
const DAY_BG = (w: number) =>
  `repeating-linear-gradient(to right, rgba(216,210,198,0.22) 0px, rgba(216,210,198,0.22) 1px, transparent 1px, transparent ${w}px)`

interface Props {
  tasks: Task[]
  projects: Project[]
  subtasks: Subtask[]
  onOpenTask: (t: Task) => void
  onOpenSubtask?: (s: Subtask) => void
}

export function GanttChart({ tasks, projects, subtasks, onOpenTask, onOpenSubtask }: Props) {
  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())

  function toggleExpanded(taskId: number) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId)
      return next
    })
  }

  const activeTasks = useMemo(
    () => tasks.filter(t => t.status !== 'done'),
    [tasks]
  )
  const scheduledTasks = useMemo(
    () => activeTasks.filter(t => t.start_date || t.due_date),
    [activeTasks]
  )
  const unscheduledCount = activeTasks.length - scheduledTasks.length

  const { windowStart, windowEnd } = useMemo(() => {
    if (scheduledTasks.length === 0) {
      return { windowStart: addDays(today, -14), windowEnd: addDays(today, 75) }
    }
    const dates: number[] = []
    for (const t of scheduledTasks) {
      if (t.start_date) dates.push(new Date(t.start_date + 'T00:00:00').getTime())
      if (t.due_date) dates.push(new Date(t.due_date + 'T00:00:00').getTime())
    }
    // Also include subtask dates in window
    for (const s of subtasks) {
      if (s.status === 'done') continue
      if (s.start_date) dates.push(new Date(s.start_date + 'T00:00:00').getTime())
      if (s.due_date) dates.push(new Date(s.due_date + 'T00:00:00').getTime())
    }
    const minD = new Date(Math.min(...dates))
    const maxD = new Date(Math.max(...dates))
    return {
      windowStart: startOfMonth(addDays(minD, -7)),
      windowEnd: addDays(maxD, 28),
    }
  }, [scheduledTasks, subtasks, today])

  const totalDays = differenceInDays(windowEnd, windowStart) + 1
  const totalWidth = totalDays * DAY_W
  const todayX = differenceInDays(today, windowStart) * DAY_W

  const months = useMemo(
    () => eachMonthOfInterval({ start: windowStart, end: windowEnd }),
    [windowStart, windowEnd]
  )

  const weekStarts = useMemo(() => {
    const result: Date[] = []
    let d = new Date(windowStart)
    while (d <= windowEnd) {
      result.push(new Date(d))
      d = addDays(d, 7)
    }
    return result
  }, [windowStart, windowEnd])

  const grouped = useMemo(() => {
    const byProject: Record<string, { project: Project | null; color: string; tasks: Task[] }> = {}
    for (const t of scheduledTasks) {
      const key = t.project_id != null ? String(t.project_id) : 'none'
      if (!byProject[key]) {
        const proj = t.project_id != null ? projects.find(p => p.id === t.project_id) ?? null : null
        byProject[key] = {
          project: proj,
          color: proj ? (COLOR_HEX[proj.color] ?? '#9BAE9A') : '#B8AFA6',
          tasks: [],
        }
      }
      byProject[key].tasks.push(t)
    }
    return Object.entries(byProject).sort(([a], [b]) => {
      if (a === 'none') return 1
      if (b === 'none') return -1
      return 0
    })
  }, [scheduledTasks, projects])

  const scrollRef = useRef<HTMLDivElement>(null)

  function barGeometry(startDate: string | null, dueDate: string | null) {
    const barStart = startDate
      ? new Date(startDate + 'T00:00:00')
      : new Date(dueDate! + 'T00:00:00')
    const barEnd = dueDate
      ? new Date(dueDate + 'T00:00:00')
      : addDays(barStart, 1)
    const x = Math.max(differenceInDays(barStart, windowStart), 0) * DAY_W
    const rawWidth = (differenceInDays(barEnd, barStart) + 1) * DAY_W
    const barW = Math.max(rawWidth, 6)
    const isPoint = !startDate || !dueDate
    return { x, barW, isPoint }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        <div style={{ minWidth: LEFT_W + totalWidth, position: 'relative' }}>

          {/* ── Sticky header ── */}
          <div style={{ display: 'flex', position: 'sticky', top: 0, zIndex: 20, background: '#FAF9F6', borderBottom: '1px solid #D8D2C6' }}>
            <div style={{ width: LEFT_W, flexShrink: 0, height: HEADER_H, position: 'sticky', left: 0, zIndex: 21, background: '#FAF9F6', borderRight: '1px solid #D8D2C6' }} />
            <div style={{ position: 'relative', flex: 1 }}>
              {/* Month row */}
              <div style={{ position: 'relative', height: MONTH_H, borderBottom: '1px solid rgba(216,210,198,0.7)' }}>
                {months.map(month => {
                  const x = Math.max(differenceInDays(month, windowStart), 0) * DAY_W
                  return (
                    <div key={month.toISOString()} style={{ position: 'absolute', left: x, top: 0, bottom: 0, display: 'flex', alignItems: 'center' }}>
                      <div style={{ position: 'absolute', left: 0, top: 3, bottom: 3, width: 1, background: 'rgba(216,210,198,0.9)' }} />
                      <span style={{ ...FONT, fontSize: 10.5, fontWeight: 700, color: '#5A5A5A', whiteSpace: 'nowrap', paddingLeft: 8 }}>
                        {format(month, 'MMM yyyy')}
                      </span>
                    </div>
                  )
                })}
              </div>
              {/* Day row */}
              <div style={{ position: 'relative', height: DAY_H }}>
                {weekStarts.map(d => {
                  const x = differenceInDays(d, windowStart) * DAY_W
                  if (x < 0) return null
                  const isToday = d.getTime() === today.getTime()
                  return (
                    <div key={d.toISOString()} style={{ position: 'absolute', left: x, top: 0, bottom: 0, display: 'flex', alignItems: 'center' }}>
                      <div style={{ position: 'absolute', left: 0, top: 4, bottom: 4, width: 1, background: 'rgba(216,210,198,0.5)' }} />
                      <span style={{ ...FONT, fontSize: 9.5, fontWeight: isToday ? 700 : 400, color: isToday ? '#C14B3A' : '#9BA69A', whiteSpace: 'nowrap', paddingLeft: 3 }}>
                        {format(d, 'd')}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* ── Groups ── */}
          {grouped.map(([key, { project, color, tasks: grpTasks }]) => (
            <div key={key}>
              {/* Group header */}
              <div style={{ display: 'flex', background: '#F5EFE8', borderBottom: '1px solid #D8D2C6', position: 'sticky', top: HEADER_H, zIndex: 10 }}>
                <div style={{
                  width: LEFT_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 11,
                  background: '#F5EFE8', borderRight: '1px solid #D8D2C6',
                  height: GROUP_H, display: 'flex', alignItems: 'center', gap: 7, padding: '0 12px',
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
                  <span style={{ ...FONT, fontSize: 10.5, fontWeight: 700, color: '#2C2C2C', textTransform: 'uppercase', letterSpacing: '0.07em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {project?.name ?? 'No Project'}
                  </span>
                </div>
                <div style={{ flex: 1, height: GROUP_H, position: 'relative', backgroundImage: DAY_BG(DAY_W) }}>
                  {todayX >= 0 && <div style={{ position: 'absolute', top: 0, bottom: 0, left: todayX, width: 1, background: 'rgba(193,75,58,0.25)' }} />}
                </div>
              </div>

              {/* Task rows + subtask rows */}
              {grpTasks.flatMap(t => {
                const allTaskSubs = subtasks.filter(s => s.task_id === t.id)
                const totalSubCount = allTaskSubs.length
                const doneSubCount = allTaskSubs.filter(s => s.status === 'done').length
                const scheduledSubs = allTaskSubs.filter(s => s.status !== 'done' && (s.start_date || s.due_date))
                const isExpanded = expandedIds.has(t.id)
                const hasScheduledSubs = scheduledSubs.length > 0
                const { x, barW, isPoint } = barGeometry(t.start_date, t.due_date)

                const taskRow = (
                  <div key={t.id} style={{ display: 'flex', height: ROW_H, borderBottom: '1px solid rgba(216,210,198,0.5)' }}>
                    {/* Label */}
                    <div style={{
                      width: LEFT_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 5,
                      background: '#FAF9F6', borderRight: '1px solid #D8D2C6',
                      display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px 0 10px',
                      cursor: 'pointer',
                    }}>
                      {totalSubCount > 0 && (
                        <button
                          onClick={e => { e.stopPropagation(); toggleExpanded(t.id) }}
                          style={{
                            background: 'none', border: 'none', padding: '0 2px', cursor: 'pointer',
                            color: '#9BA69A', fontSize: 8, flexShrink: 0,
                            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                            transition: 'transform 0.15s',
                          }}
                        >▶</button>
                      )}
                      <span
                        onClick={() => onOpenTask(t)}
                        style={{ ...FONT, fontSize: 12, color: '#2C2C2C', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {t.title}
                      </span>
                      {totalSubCount > 0 && (
                        <span style={{
                          ...FONT, fontSize: 9.5, fontWeight: 700, flexShrink: 0,
                          padding: '1px 5px', borderRadius: 99,
                          background: doneSubCount === totalSubCount ? 'rgba(120,183,197,0.15)' : 'rgba(44,44,44,0.07)',
                          color: doneSubCount === totalSubCount ? '#3d7684' : '#747474',
                          border: `1px solid ${doneSubCount === totalSubCount ? 'rgba(120,183,197,0.3)' : 'rgba(44,44,44,0.13)'}`,
                        }}>
                          {doneSubCount}/{totalSubCount}
                        </span>
                      )}
                    </div>

                    {/* Timeline */}
                    <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', backgroundImage: DAY_BG(DAY_W) }}>
                      {todayX >= 0 && <div style={{ position: 'absolute', top: 0, bottom: 0, left: todayX, width: 1, background: 'rgba(193,75,58,0.3)', pointerEvents: 'none' }} />}
                      <div
                        onClick={() => onOpenTask(t)}
                        title={`${t.title}${t.start_date ? `\nStart: ${t.start_date}` : ''}${t.due_date ? `\nDue: ${t.due_date}` : ''}`}
                        style={{
                          position: 'absolute', left: x, top: 6, height: ROW_H - 12, width: barW,
                          background: color, opacity: 0.82, borderRadius: 4, cursor: 'pointer',
                          border: isPoint ? `2px dashed ${color}` : 'none',
                          boxSizing: 'border-box', transition: 'opacity 0.12s',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0.82' }}
                      />
                    </div>
                  </div>
                )

                const subRows = (hasScheduledSubs && isExpanded) ? scheduledSubs.map(s => {
                  const { x: sx, barW: sbW, isPoint: sPoint } = barGeometry(s.start_date, s.due_date)
                  return (
                    <div key={`sub-${s.id}`} style={{ display: 'flex', height: SUB_ROW_H, borderBottom: '1px solid rgba(216,210,198,0.35)', background: 'rgba(250,249,246,0.7)' }}>
                      {/* Indented label */}
                      <div style={{
                        width: LEFT_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 5,
                        background: 'rgba(250,249,246,0.95)', borderRight: '1px solid #D8D2C6',
                        display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 24, paddingRight: 8,
                      }}>
                        <span style={{ color: 'rgba(216,210,198,0.9)', fontSize: 10, flexShrink: 0 }}>└</span>
                        <span
                          onClick={() => onOpenSubtask?.(s)}
                          style={{ ...FONT, fontSize: 11, color: '#5A5A5A', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: onOpenSubtask ? 'pointer' : 'default' }}
                        >
                          {s.title}
                        </span>
                      </div>
                      {/* Timeline */}
                      <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', backgroundImage: DAY_BG(DAY_W) }}>
                        {todayX >= 0 && <div style={{ position: 'absolute', top: 0, bottom: 0, left: todayX, width: 1, background: 'rgba(193,75,58,0.2)', pointerEvents: 'none' }} />}
                        <div
                          onClick={() => onOpenSubtask?.(s)}
                          title={`${s.title}${s.start_date ? `\nStart: ${s.start_date}` : ''}${s.due_date ? `\nDue: ${s.due_date}` : ''}`}
                          style={{
                            position: 'absolute', left: sx, top: 5, height: SUB_ROW_H - 10, width: sbW,
                            background: color, opacity: 0.55, borderRadius: 3, cursor: onOpenSubtask ? 'pointer' : 'default',
                            border: sPoint ? `2px dashed ${color}` : 'none',
                            boxSizing: 'border-box', transition: 'opacity 0.12s',
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.8' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0.55' }}
                        />
                      </div>
                    </div>
                  )
                }) : []

                return [taskRow, ...subRows]
              })}
            </div>
          ))}

        </div>
      </div>

      {/* Footer */}
      {unscheduledCount > 0 && (
        <div style={{ padding: '7px 16px', borderTop: '1px solid #D8D2C6', ...FONT, fontSize: 11.5, color: '#9BA69A', background: '#FAF9F6' }}>
          {unscheduledCount} task{unscheduledCount !== 1 ? 's' : ''} without dates not shown · open a task to add a start or due date
        </div>
      )}
    </div>
  )
}
