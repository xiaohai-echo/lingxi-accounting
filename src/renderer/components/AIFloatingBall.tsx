import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { ThunderboltOutlined, AudioOutlined, CameraOutlined, ScissorOutlined, EditOutlined, CloseOutlined } from '@ant-design/icons'
import AIRecordModal, { type AIMode } from './AIRecordModal'

const AI_MODES: { key: AIMode; icon: React.ReactNode; label: string; color: string }[] = [
  { key: 'text', icon: <EditOutlined />, label: '文本', color: '#667eea' },
  { key: 'screenshot', icon: <ScissorOutlined />, label: '截图', color: '#52c41a' },
  { key: 'camera', icon: <CameraOutlined />, label: '拍照', color: '#fa8c16' },
  { key: 'voice', icon: <AudioOutlined />, label: '语音', color: '#f5222d' },
]

const FAB_SIZE = 48
const ITEM_SIZE = 40
const RADIUS = 68

type ExpandDir = 'up' | 'down' | 'left' | 'right'

function getExpandDirFromPos(x: number, y: number): ExpandDir {
  const w = window.innerWidth
  const h = window.innerHeight
  const distTop = y
  const distBottom = h - y - FAB_SIZE
  const distLeft = x
  const distRight = w - x - FAB_SIZE
  const minDist = Math.min(distTop, distBottom, distLeft, distRight)
  if (minDist === distTop) return 'down'
  if (minDist === distBottom) return 'up'
  if (minDist === distLeft) return 'right'
  return 'left'
}

function getItemOffset(index: number, dir: ExpandDir): { tx: number; ty: number } {
  const total = AI_MODES.length
  const arcSpan = 80
  let baseAngle: number
  switch (dir) {
    case 'up': baseAngle = 90; break
    case 'down': baseAngle = 270; break
    case 'left': baseAngle = 180; break
    case 'right': baseAngle = 0; break
  }
  const step = total > 1 ? arcSpan / (total - 1) : 0
  const angle = (baseAngle - arcSpan / 2 + step * index) * (Math.PI / 180)
  return {
    tx: Math.cos(angle) * RADIUS,
    ty: -Math.sin(angle) * RADIUS,
  }
}

export default function AIFloatingBall() {
  const [expanded, setExpanded] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [aiMode, setAiMode] = useState<AIMode>('text')
  const [pos, setPos] = useState({
    x: window.innerWidth - FAB_SIZE - 20,
    y: window.innerHeight * 0.5,
  })
  const dragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 })
  const hasMoved = useRef(false)
  const ballRef = useRef<HTMLDivElement>(null)

  const expandDir = useMemo(() => getExpandDirFromPos(pos.x, pos.y), [pos.x, pos.y])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true
    hasMoved.current = false
    dragStart.current = { x: e.clientX, y: e.clientY, posX: pos.x, posY: pos.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [pos])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    const dx = e.clientX - dragStart.current.x
    const dy = e.clientY - dragStart.current.y
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved.current = true
    const mobileBottom = window.innerWidth < 768 ? 52 : 0
    setPos({
      x: Math.max(0, Math.min(window.innerWidth - FAB_SIZE, dragStart.current.posX + dx)),
      y: Math.max(0, Math.min(window.innerHeight - FAB_SIZE - mobileBottom, dragStart.current.posY + dy)),
    })
  }, [])

  const handlePointerUp = useCallback(() => {
    dragging.current = false
    if (!hasMoved.current) {
      setExpanded(prev => !prev)
    }
  }, [])

  useEffect(() => {
    if (expanded) {
      const handler = (e: MouseEvent | TouchEvent) => {
        if (ballRef.current && !ballRef.current.contains(e.target as Node)) {
          setExpanded(false)
        }
      }
      setTimeout(() => document.addEventListener('mousedown', handler), 0)
      setTimeout(() => document.addEventListener('touchstart', handler), 0)
      return () => {
        document.removeEventListener('mousedown', handler)
        document.removeEventListener('touchstart', handler)
      }
    }
  }, [expanded])

  const handleModeSelect = (mode: AIMode) => {
    setAiMode(mode)
    setModalOpen(true)
    setExpanded(false)
  }

  return (
    <>
      <div
        ref={ballRef}
        style={{
          position: 'fixed',
          left: pos.x,
          top: pos.y,
          zIndex: 1000,
          touchAction: 'none',
        }}
      >
        {expanded && AI_MODES.map((item, i) => {
          const { tx, ty } = getItemOffset(i, expandDir)
          return (
            <div
              key={item.key}
              onClick={() => handleModeSelect(item.key)}
              style={{
                position: 'absolute',
                left: FAB_SIZE / 2 - ITEM_SIZE / 2,
                top: FAB_SIZE / 2 - ITEM_SIZE / 2,
                width: ITEM_SIZE,
                height: ITEM_SIZE,
                borderRadius: '50%',
                background: item.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                cursor: 'pointer',
                transform: `translate(${tx}px, ${ty}px)`,
                opacity: 1,
                transition: 'all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
                boxShadow: `0 2px 8px ${item.color}55`,
                fontSize: 15,
              }}
              title={item.label}
            >
              {item.icon}
            </div>
          )
        })}

        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{
            width: FAB_SIZE,
            height: FAB_SIZE,
            borderRadius: '50%',
            background: expanded
              ? 'linear-gradient(135deg, #ff4d4f 0%, #cf1322 100%)'
              : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'grab',
            boxShadow: expanded
              ? '0 4px 16px rgba(255,77,79,0.4)'
              : '0 4px 16px rgba(102,126,234,0.4)',
            transition: 'background 0.3s, box-shadow 0.3s',
            color: '#fff',
            fontSize: 20,
            userSelect: 'none',
          }}
        >
          {expanded ? <CloseOutlined style={{ fontSize: 16 }} /> : <ThunderboltOutlined />}
        </div>
      </div>

      <AIRecordModal
        open={modalOpen}
        mode={aiMode}
        onClose={() => setModalOpen(false)}
        onSuccess={() => setModalOpen(false)}
      />
    </>
  )
}
