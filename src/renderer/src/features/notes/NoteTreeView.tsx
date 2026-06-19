import { useState, useMemo, type JSX } from 'react'
import type { Note } from '@/types/domain'

type TreeNode = {
  note: Note
  children: TreeNode[]
  level: number
}

type NoteTreeViewProps = {
  notes: Note[]
  selectedNoteId: string | null
  highlightedNoteId?: string | null
  onSelectNote: (id: string, ctrlKey?: boolean) => void
  onCreateChildNote: (parentId: string) => Promise<void>
  stripText: (content: string) => string
  noteGlyph: (note: Note) => string
  isImageIcon: (icon: string) => boolean
}

function buildTree(notes: Note[], parentId: string | null | undefined = null, level: number = 0): TreeNode[] {
  return notes
    .filter((note) => (note.parentId ?? null) === (parentId ?? null))
    .map((note) => ({
      note,
      level,
      children: buildTree(notes, note.id, level + 1)
    }))
}

function TreeNodeComponent({
  node,
  selectedNoteId,
  highlightedNoteId,
  onSelectNote,
  onCreateChildNote,
  stripText,
  noteGlyph,
  isImageIcon
}: {
  node: TreeNode
  selectedNoteId: string | null
  highlightedNoteId?: string | null
  onSelectNote: (id: string, ctrlKey?: boolean) => void
  onCreateChildNote: (parentId: string) => Promise<void>
  stripText: (content: string) => string
  noteGlyph: (note: Note) => string
  isImageIcon: (icon: string) => boolean
}): JSX.Element {
  const [isExpanded, setIsExpanded] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const isActive = node.note.id === selectedNoteId

  const handleCreateChild = async () => {
    setIsCreating(true)
    try {
      await onCreateChildNote(node.note.id)
      setIsExpanded(true)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div>
      <div
        className="group flex w-full items-center gap-1.5 px-1.5 py-1 text-left transition-all"
        style={{ paddingLeft: `${node.level * 1.2 + 0.375}rem` }}
      >
        {/* Expand/Collapse Button */}
        {node.children.length > 0 && (
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex h-6 w-6 items-center justify-center rounded-lg transition hover:bg-white/[0.08] text-[var(--sd-muted)] hover:text-[var(--sd-text)]"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            <svg
              className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
        {node.children.length === 0 && <div className="h-6 w-6" />}

        {/* Main Note Button */}
        <button
          type="button"
          onClick={(event) => onSelectNote(node.note.id, event.ctrlKey || event.metaKey)}
          style={{
            boxShadow: isActive
              ? `0 0 0 2px ${node.note.color || 'rgba(139,211,255,0.5)'}`
              : undefined
          }}
          className={[
            'flex flex-1 items-start gap-2.5 rounded-lg px-2.5 py-2 transition-all duration-150',
            isActive 
              ? 'bg-white/[0.12] border border-white/[0.1] shadow-lg' 
              : 'hover:bg-white/[0.06] border border-transparent hover:border-white/[0.08]'
          ].join(' ')}
        >
          {/* Icon/Dot */}
          <span
            className="mt-1 h-2 w-2 shrink-0 rounded-full ring-1 ring-offset-1"
            style={{ 
              backgroundColor: node.note.color || 'var(--sd-accent)',
              ringColor: 'rgba(255,255,255,0.1)'
            }}
          />
          
          {/* Content */}
          <div className="min-w-0 flex-1 text-left">
            <p className="truncate text-xs font-semibold text-[var(--sd-text)]">
              {node.note.title.trim() || 'Untitled'}
            </p>
          </div>
        </button>

        {/* Add Child Button */}
        <button
          type="button"
          onClick={handleCreateChild}
          disabled={isCreating}
          className="flex h-6 w-6 items-center justify-center rounded-lg opacity-0 transition-all hover:bg-white/[0.1] group-hover:opacity-100 disabled:opacity-50 text-[var(--sd-muted)] hover:text-[var(--sd-accent)]"
          title="Add child note"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Children */}
      {isExpanded && node.children.length > 0 && (
        <div className="border-l border-white/[0.05]" style={{ marginLeft: `${(node.level + 0.5) * 1.2 + 0.375}rem` }}>
          {node.children.map((child) => (
            <TreeNodeComponent
              key={child.note.id}
              node={child}
              selectedNoteId={selectedNoteId}
              highlightedNoteId={highlightedNoteId}
              onSelectNote={onSelectNote}
              onCreateChildNote={onCreateChildNote}
              stripText={stripText}
              noteGlyph={noteGlyph}
              isImageIcon={isImageIcon}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function NoteTreeView({
  notes,
  selectedNoteId,
  highlightedNoteId,
  onSelectNote,
  onCreateChildNote,
  stripText,
  noteGlyph,
  isImageIcon
}: NoteTreeViewProps): JSX.Element {
  const tree = useMemo(() => buildTree(notes), [notes])

  if (tree.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center">
        <p className="text-sm text-[var(--sd-muted)]">No notes yet. Create one to get started.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0">
      {tree.map((node) => (
        <TreeNodeComponent
          key={node.note.id}
          node={node}
          selectedNoteId={selectedNoteId}
          highlightedNoteId={highlightedNoteId}
          onSelectNote={onSelectNote}
          onCreateChildNote={onCreateChildNote}
          stripText={stripText}
          noteGlyph={noteGlyph}
          isImageIcon={isImageIcon}
        />
      ))}
    </div>
  )
}
