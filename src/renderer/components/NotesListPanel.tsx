import React, { memo, useState, useRef, useEffect, useCallback } from "react";
import type { Note, NoteStatus, Folder } from "../types/models";
import './NotesListPanel.css';
import buttonIcon from '../assets/icons/button.png';
import pauseIcon from '../assets/icons/pause.png';
import checkedIcon from '../assets/icons/checked.png';
import removeIcon from '../assets/icons/remove.png';
import NoteContextMenu from "./NoteContextMenu";

interface NotesListPanelProps {
  notes: Note[];
  currentNoteId: number | null;
  onAddNote: () => void;
  onSelect: (n: Note) => void;
  isTrashView?: boolean;
  title?: string;
  onNoteDrag?: (noteId: number, targetFolderId: number) => void;
  onPopOut?: (noteId: number, screenX: number, screenY: number) => void;
  folders: Folder[];
  onPin: (note: Note) => void;
  onSetStatus: (note: Note) => void;
  onMoveToFolder: (noteId: number, folderId: number | null) => void;
  onDuplicate: (note: Note) => void;
  onDelete: (note: Note) => void;
  onExport: (note: Note, format: 'json' | 'md') => void;
  onImport: () => void;
  isPremium: boolean;
}

// Crear un Intl.DateTimeFormat por nota y por render era el mayor coste de
// repintado de la lista mientras se escribe. Se instancian una sola vez.
const timeFormatter = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
const weekdayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
const monthDayFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const fullDateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// Las fechas pueden llegar como epoch ms o como cadena ISO (API). Restar dos
// formatos distintos da NaN, y un comparador con NaN no ordena nada, así que
// la nota recién creada se quedaba al final. Se normaliza antes de comparar.
function toEpoch(value?: number | string): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string' && value) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatDate(timestamp?: number): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();

  const timeStr = timeFormatter.format(date);
  if (date.toDateString() === now.toDateString()) {
    return timeStr;
  }
  const startOfWeek = new Date(now);
  const dayOfWeek = now.getDay();
  startOfWeek.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  startOfWeek.setHours(0, 0, 0, 0);

  if (date >= startOfWeek) {
    return `${weekdayFormatter.format(date)} ${timeStr}`;
  }
  if (date.getFullYear() === now.getFullYear()) {
    return `${monthDayFormatter.format(date)}, ${timeStr}`;
  }
  return `${fullDateFormatter.format(date)}, ${timeStr}`;
}

function getIconForStatus(s?: NoteStatus): string | null {
  if (s === 'active') return buttonIcon;
  if (s === 'onhold') return pauseIcon;
  if (s === 'completed') return checkedIcon;
  if (s === 'dropped') return removeIcon;
  return null;
}

interface NoteListItemProps {
  note: Note;
  isActive: boolean;
  isTrashView?: boolean;
  onSelect: (n: Note) => void;
  onContextMenu: (note: Note, x: number, y: number) => void;
  onPopOut?: (noteId: number, screenX: number, screenY: number) => void;
}

// memo con comparación superficial: mientras se escribe sólo cambia el objeto
// de la nota activa, así que el resto de ítems no se vuelven a renderizar.
const NoteListItem = memo(function NoteListItem({
  note: n,
  isActive,
  isTrashView,
  onSelect,
  onContextMenu,
  onPopOut,
}: NoteListItemProps) {
  const previewClass = n.noteType === 'drawing'
    ? 'note-list-item-preview note-list-item-drawing'
    : (n.preview || n.content)
      ? 'note-list-item-preview'
      : 'note-list-item-preview note-list-item-empty';

  return (
    <div
      className={`note-list-item${isActive ? ' active' : ''}`}
      onClick={() => onSelect(n)}
      draggable={!isTrashView}
      onContextMenu={(e) => {
        if (isTrashView) return;
        e.preventDefault();
        onContextMenu(n, e.clientX, e.clientY);
      }}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', String(n.id));
        e.dataTransfer.effectAllowed = 'move';
        (e.target as HTMLElement).classList.add('dragging');
      }}
      onDragEnd={async (e) => {
        (e.target as HTMLElement).classList.remove('dragging');
        if (!onPopOut) return;
        const [winX, winY] = await window.api.getWindowPosition();
        const [winW, winH] = await window.api.getWindowSize();
        const sx = e.screenX;
        const sy = e.screenY;
        if (sx < winX || sx > winX + winW || sy < winY || sy > winY + winH) {
          onPopOut(n.id, sx, sy);
        }
      }}
    >
      <div className="note-list-item-title" title={n.name || 'Untitled'}>
        {n.status && (
          <span
            className={`status-icon status-icon-${n.status}`}
            style={{
              backgroundImage: `url(${getIconForStatus(n.status)})`,
              marginRight: '6px'
            }}
          />
        )}
        {n.pinned && (
          <svg
            className="pin-icon"
            width={12}
            height={12}
            viewBox="0 0 24 24"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth={2}
            style={{ marginRight: '6px' }}
          >
            <path d="M12 17v5" />
            <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
          </svg>
        )}
        <span>{n.name || 'Untitled'}</span>
      </div>
      {n.tags && n.tags.length > 0 && (
        <div className="note-list-item-tags">
          {n.tags.map((tag: string) => (
            <span key={tag} className="note-tag">#{tag}</span>
          ))}
        </div>
      )}
      <div className={previewClass}>
        {n.noteType === 'drawing'
          ? (n.hasDrawingData ? 'Drawing note' : 'Empty canvas')
          : (n.preview || n.content) || 'Empty note'
        }
      </div>
      {n.updatedAt && (
        <div className="note-list-item-meta">
          <span>{formatDate(n.updatedAt)}</span>
        </div>
      )}
    </div>
  );
});

const PAGE_SIZE = 100;

const NotesListPanel = memo(function NotesListPanel({ notes, currentNoteId, onAddNote, onSelect, isTrashView, title,
  onNoteDrag, onPopOut, folders, onPin, onSetStatus, onMoveToFolder, onDuplicate, onDelete, onExport, onImport, isPremium }: NotesListPanelProps) {
  const [panelWidth, setPanelWidth] = useState(320);
  const panelRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<{ note: Note; x: number; y: number } | null>(null);

  // 3: debounce para no filtrar 5.800 notas en cada tecla.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 180);
    return () => clearTimeout(t);
  }, [searchQuery]);
  // 1+2: paginar la lista (100 iniciales + infinite scroll) para no meter
  // miles de tarjetas al DOM. Al paginar, formatDate/preview solo se
  // calculan para lo visible (punto 2: antes se formateaban las ~5.800).
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const listBodyRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isResizing.current = true;
    e.preventDefault();
  }, []);

  const handleContextMenu = useCallback((note: Note, x: number, y: number) => {
    setContextMenu({ note, x, y });
  }, []);

  // 3+4: índice de búsqueda y epoch precalculados una vez por cambio de
  // notas (no por tecla ni por comparación del sort). Mismo resultado,
  // sin cambios visuales.
  const prepared = React.useMemo(() => (
    notes.map((n) => ({
      n,
      hay: (n.name || '').toLowerCase(),
      epoch: toEpoch(n.updatedAt),
    }))
  ), [notes]);

  // Filtrado + orden memoizados: un solo sort por render de lista.
  const lowerQuery = debouncedQuery.toLowerCase();
  const sortedFiltered = React.useMemo(() => {
    const filtered = lowerQuery
      ? prepared.filter((p) => p.hay.includes(lowerQuery))
      : prepared.slice();
    filtered.sort((a, b) => {
      if (a.n.pinned && !b.n.pinned) return -1;
      if (!a.n.pinned && b.n.pinned) return 1;
      return b.epoch - a.epoch;
    });
    return filtered.map((p) => p.n);
  }, [prepared, lowerQuery]);

  // Resetear la ventana al buscar; recortarla si la lista se achica.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    listBodyRef.current?.scrollTo({ top: 0 });
  }, [lowerQuery]);
  useEffect(() => {
    setVisibleCount((c) => Math.min(Math.max(c, PAGE_SIZE), Math.max(sortedFiltered.length, PAGE_SIZE)));
  }, [sortedFiltered.length]);

  // Si la nota activa queda fuera de la ventana (p. ej. viene de Brain),
  // ampliar hasta incluirla para no perder el resaltado.
  useEffect(() => {
    if (currentNoteId == null) return;
    const idx = sortedFiltered.findIndex(n => n.id === currentNoteId);
    if (idx >= 0) setVisibleCount((c) => Math.min(sortedFiltered.length, Math.max(c, idx + 1)));
  }, [currentNoteId, sortedFiltered]);

  const visibleNotes = sortedFiltered.slice(0, visibleCount);

  const handleListScroll = useCallback(() => {
    const el = listBodyRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 600) {
      setVisibleCount((c) => c >= sortedFiltered.length ? c : Math.min(c + PAGE_SIZE, sortedFiltered.length));
    }
  }, [sortedFiltered.length]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current || !panelRef.current) return;

      const rect = panelRef.current.getBoundingClientRect();
      const newWidth = e.clientX - rect.left;

      if (newWidth >= 180 && newWidth <= 400) {
        setPanelWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      isResizing.current = false;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  return (
    <div className="notes-list-panel" ref={panelRef} style={{ width: `${panelWidth}px` }}>
      <div className="panel-header">
        <input
          type="text"
          className="search-input"
          id="contentTitle"
          placeholder="Search notes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div className="panel-actions">
          {!isTrashView && (
            <>
              <button className={`action-btn${!isPremium ? " disabled-premium" : ""}`} id="importNoteBtn" title={isPremium ? "Import Note" : "Premium feature"} onClick={onImport} disabled={!isPremium}>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </button>
              <button className="action-btn" id="addNoteBtn" title="Add Note" onClick={onAddNote}>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8z" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              </button>
            </>
          )}
        </div>
      </div>
      <div className="notes-list-body" id="notesListPanel" ref={listBodyRef} onScroll={handleListScroll}>
        {sortedFiltered.length === 0 ? (
          <div className="no-items-message">
            {searchQuery ? 'No notes found' : 'No notes'}
          </div>
        ) : (
          <>
            {visibleNotes.map(n => (
              <NoteListItem
                key={n.id}
                note={n}
                isActive={currentNoteId === n.id}
                isTrashView={isTrashView}
                onSelect={onSelect}
                onContextMenu={handleContextMenu}
                onPopOut={onPopOut}
              />
            ))}
            {visibleCount < sortedFiltered.length && (
              <div style={{ padding: '12px 20px', textAlign: 'center' }}>
                <div style={{ color: '#666', fontSize: 12, marginBottom: 8 }}>
                  Showing {visibleNotes.length} of {sortedFiltered.length}
                </div>
                <button
                  className="action-btn"
                  style={{ width: 'auto', padding: '6px 16px', fontSize: 12, margin: '0 auto' }}
                  onClick={() => setVisibleCount((c) => Math.min(c + PAGE_SIZE, sortedFiltered.length))}
                >
                  Show more
                </button>
              </div>
            )}
          </>
        )}
      </div>
      {contextMenu && (
        <NoteContextMenu
          note={contextMenu.note}
          x={contextMenu.x}
          y={contextMenu.y}
          folders={folders}
          onPin={onPin}
          onSetStatus={onSetStatus}
          onMoveToFolder={onMoveToFolder}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onClose={() => setContextMenu(null)}
          onExport={onExport}
          isPremium={isPremium}
        />
      )}
      <div
        className="notes-list-resize-handle"
        onMouseDown={handleMouseDown}
      />
    </div>
  );
});
export default NotesListPanel;
