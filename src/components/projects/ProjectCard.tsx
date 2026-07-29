import Link from 'next/link'
import { Calendar, CheckSquare, ArrowRight } from 'lucide-react'
import { Project } from '@/lib/types'
import { StatusBadge } from '@/components/ui/Badge'
import { TagChip } from '@/components/ui/TagPicker'
import { cn } from '@/lib/utils'
import { format, parseISO } from 'date-fns'

const colorMap: Record<string, { border: string; dot: string; bar: string }> = {
  sage:       { border: 'border-sage',       dot: 'bg-sage',       bar: 'bg-sage' },
  terracotta: { border: 'border-terracotta', dot: 'bg-terracotta', bar: 'bg-terracotta' },
  butter:     { border: 'border-butter',     dot: 'bg-butter',     bar: 'bg-butter' },
  tomato:     { border: 'border-tomato',     dot: 'bg-tomato',     bar: 'bg-tomato' },
  blueberry:  { border: 'border-blueberry',  dot: 'bg-blueberry',  bar: 'bg-blueberry' },
  thyme:      { border: 'border-thyme',      dot: 'bg-thyme',      bar: 'bg-thyme' },
  candy:      { border: 'border-candy',      dot: 'bg-candy',      bar: 'bg-candy' },
  citrus:     { border: 'border-citrus',     dot: 'bg-citrus',     bar: 'bg-citrus' },
}

export function ProjectCard({ project, onOpenDetail }: { project: Project; onOpenDetail?: () => void }) {
  const colors = colorMap[project.color] ?? colorMap.sage
  const taskCount = project.task_count ?? 0
  const doneCount = project.completed_task_count ?? 0
  const progress = taskCount > 0 ? Math.round((doneCount / taskCount) * 100) : 0

  return (
    <Link
      href={`/projects/${project.id}`}
      className="group block"
      onClick={onOpenDetail ? (e) => { e.preventDefault(); onOpenDetail() } : undefined}
    >
      <div className={cn(
        'bg-white rounded-2xl p-5 border-l-4 transition-all duration-200',
        'hover:shadow-md hover:-translate-y-0.5',
        colors.border
      )}>
        {/* Top row */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className={cn('w-2 h-2 rounded-full shrink-0', colors.dot)} />
            <h3
              className="text-xl leading-snug text-ink-dark truncate"
              style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 700 }}
            >
              {project.name}
            </h3>
          </div>
          <StatusBadge status={project.status} />
        </div>

        {/* Description */}
        {project.description && (
          <p className="text-sm text-ink line-clamp-2 mb-4"
            style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
            {project.description}
          </p>
        )}

        {/* Progress bar */}
        {taskCount > 0 && (
          <div className="mb-4">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-xs text-ink" style={{ fontFamily: "'Jost', system-ui, sans-serif" }}>
                Progress
              </span>
              <span className="text-xs font-semibold text-ink-dark">{progress}%</span>
            </div>
            <div className="h-1.5 bg-mushroom/50 rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', colors.bar)}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Tags */}
        {project.tags && project.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {project.tags.map(t => <TagChip key={t.id} tag={t} />)}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-ink">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <CheckSquare className="w-3.5 h-3.5" />
              {doneCount}/{taskCount} tasks
            </span>
            {project.due_date && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {format(parseISO(project.due_date), 'MMM d')}
              </span>
            )}
          </div>
          <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
    </Link>
  )
}
