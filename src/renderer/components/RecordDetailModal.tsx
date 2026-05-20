import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Modal, Descriptions, Tag, Image, Button, Spin, Popconfirm, App } from 'antd'
import {
  SwapOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  SoundOutlined,
  EditOutlined,
  DeleteOutlined,
  RollbackOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'
import type { Record as RecordType } from '../../main/database/schema'
import { getApi } from '../api/mock'
import { ACCOUNT_TYPE_ICONS, ACCOUNT_TYPE_COLORS } from '../utils/constants'

interface RecordDetailModalProps {
  open: boolean
  record: RecordType | null
  onClose: () => void
  accounts: Array<{ id?: number; name: string; type: string; cardNo?: string; bankName?: string }>
  categories: Array<{ id?: number; name: string; type: string; icon?: string; color?: string }>
  onEdit?: (record: RecordType) => void
  onDelete?: (id: number) => void
  onRefund?: (record: RecordType) => void
}

const SOURCE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  manual: { label: '手动', color: '#8c8c8c', icon: '✏️' },
  ai_text: { label: 'AI文本', color: '#667eea', icon: '💬' },
  ai_voice: { label: 'AI语音', color: '#faad14', icon: '🎙️' },
  ai_image: { label: 'AI图片', color: '#13c2c2', icon: '📷' },
}

function AudioWaveform({ base64Data, isDark }: { base64Data: string; isDark: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height
    ctx.clearRect(0, 0, width, height)

    const barCount = 40
    const barWidth = 3
    const gap = (width - barCount * barWidth) / (barCount + 1)
    const primaryColor = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)'

    for (let i = 0; i < barCount; i++) {
      const centerDist = Math.abs(i - (barCount - 1) / 2) / ((barCount - 1) / 2)
      const baseH = 6 + (1 - centerDist) * 14
      const h = baseH + Math.random() * 12
      const x = gap + i * (barWidth + gap)
      const y = (height - h) / 2

      ctx.fillStyle = primaryColor
      ctx.beginPath()
      ctx.roundRect(x, y, barWidth, h, 1.5)
      ctx.fill()
    }
  }, [base64Data, isDark])

  useEffect(() => {
    const audioUrl = `data:audio/webm;base64,${base64Data}`
    const audio = new Audio(audioUrl)
    audioRef.current = audio

    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration)
    })
    audio.addEventListener('timeupdate', () => {
      setCurrentTime(audio.currentTime)
    })
    audio.addEventListener('ended', () => {
      setIsPlaying(false)
      setCurrentTime(0)
    })

    return () => {
      audio.pause()
      audio.src = ''
      audioRef.current = null
    }
  }, [base64Data])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
    } else {
      audio.play()
      setIsPlaying(true)
    }
  }, [isPlaying])

  const formatDuration = (s: number) => {
    if (!s || isNaN(s)) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <Button
        type="text"
        shape="circle"
        size="large"
        icon={isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
        onClick={togglePlay}
        style={{ color: '#667eea', fontSize: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      />
      <div style={{ flex: 1 }}>
        <canvas
          ref={canvasRef}
          width={280}
          height={40}
          style={{ width: '100%', height: 40, display: 'block' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)', marginTop: 2 }}>
          <span>{formatDuration(currentTime)}</span>
          <span>{formatDuration(duration)}</span>
        </div>
      </div>
    </div>
  )
}

const RecordDetailModal: React.FC<RecordDetailModalProps> = ({
  open, record, onClose, accounts, categories,
  onEdit, onDelete, onRefund
}) => {
  const { modal } = App.useApp()
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [audioBase64, setAudioBase64] = useState<string | null>(null)
  const [loadingAttachment, setLoadingAttachment] = useState(false)
  const [imagePreviewVisible, setImagePreviewVisible] = useState(false)

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
    window.matchMedia('(prefers-color-scheme: dark)').matches

  useEffect(() => {
    if (!open || !record) {
      setImageBase64(null)
      setAudioBase64(null)
      setLoadingAttachment(false)
      return
    }

    const filePath = record.rawFilePath
    if (!filePath) return

    const isImage = record.source === 'ai_image'
    const isAudio = record.source === 'ai_voice'

    if (!isImage && !isAudio) return

    setLoadingAttachment(true)
    getApi().readAttachment(filePath).then((result: { success: boolean; base64?: string }) => {
      if (result.success && result.base64) {
        if (isImage) {
          setImageBase64(result.base64)
        } else if (isAudio) {
          setAudioBase64(result.base64)
        }
      }
    }).catch(() => {
    }).finally(() => {
      setLoadingAttachment(false)
    })
  }, [open, record])

  if (!record) return null

  const account = accounts.find(a => a.id === record.accountId)
  const targetAccount = record.targetAccountId ? accounts.find(a => a.id === record.targetAccountId) : undefined
  const category = categories.find(c => c.id === record.categoryId)

  const accountIcon = ACCOUNT_TYPE_ICONS[account?.type || ''] || '💰'
  const accountColor = ACCOUNT_TYPE_COLORS[account?.type || ''] || '#667eea'

  const typeLabel = record.type === 'income' ? '收入' : record.type === 'transfer' ? '转账' : '支出'
  const typeColor = record.type === 'income' ? '#52c41a' : record.type === 'transfer' ? '#667eea' : '#ff4d4f'

  const sourceCfg = SOURCE_CONFIG[record.source || 'manual'] || SOURCE_CONFIG.manual

  const isImageRecord = record.source === 'ai_image'
  const isAudioRecord = record.source === 'ai_voice'

  const isRefunded = record.refundStatus && record.refundStatus !== 'none'
  const canRefund = record.type === 'expense' && !isRefunded
  const canEdit = record.type !== 'transfer'

  const handleEdit = () => {
    onClose()
    onEdit?.(record)
  }

  const handleDelete = () => {
    if (!record.id) return
    modal.confirm({
      title: record.type === 'transfer' ? '确定要删除这条转账记录吗？' : '确定要删除这条记录吗？',
      content: '删除后无法恢复',
      okText: '确定删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        onClose()
        onDelete?.(record.id!)
      }
    })
  }

  const handleRefund = () => {
    onClose()
    onRefund?.(record)
  }

  const dateStr = dayjs(record.date).format('YYYY年MM月DD日')
  const fullTimeStr = record.createdAt
    ? dayjs(record.createdAt).format('HH:mm:ss')
    : '--'

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: typeColor, fontWeight: 700 }}>{typeLabel}</span>
          <span style={{ fontSize: 14 }}>
            {record.type === 'transfer' ? (
              <>
                {account?.name || '未知'}
                <SwapOutlined style={{ margin: '0 6px', color: '#667eea' }} />
                {targetAccount?.name || '未知'}
              </>
            ) : (
              record.title || category?.name || '未分类'
            )}
          </span>
        </div>
      }
      open={open}
      onCancel={onClose}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {canRefund && (
              <Button
                icon={<RollbackOutlined />}
                onClick={handleRefund}
                style={{ color: '#faad14', borderColor: '#faad1440' }}
              >
                退款
              </Button>
            )}
            {canEdit && (
              <Button
                icon={<EditOutlined />}
                onClick={handleEdit}
              >
                修改
              </Button>
            )}
            <Popconfirm
              title="确定要删除这条记录吗？"
              description="删除后无法恢复"
              onConfirm={handleDelete}
              okText="确定"
              cancelText="取消"
              okButtonProps={{ danger: true }}
            >
              <Button
                danger
                icon={<DeleteOutlined />}
              >
                删除
              </Button>
            </Popconfirm>
          </div>
        </div>
      }
      width={560}
      destroyOnHidden
    >
      <Descriptions column={2} size="small" bordered style={{ marginTop: 16 }}>
        <Descriptions.Item label="金额" span={2}>
          <span style={{ color: typeColor, fontSize: 20, fontWeight: 700, fontFamily: 'Inter, monospace' }}>
            ¥{record.amount.toFixed(2)}
          </span>
          {record.type === 'transfer' && record.fee ? (
            <span style={{ fontSize: 12, color: '#faad14', marginLeft: 8 }}>手续费 ¥{record.fee.toFixed(2)}</span>
          ) : null}
        </Descriptions.Item>

        {record.type !== 'transfer' && (
          <Descriptions.Item label="分类">
            <span>{category?.icon} {category?.name || '未分类'}</span>
          </Descriptions.Item>
        )}

        <Descriptions.Item label={record.type === 'transfer' ? '转出账户' : '账户'}>
          <Tag color={accountColor} style={{ margin: 0 }}>
            {accountIcon} {account?.name || '未知'}
            {account?.cardNo ? ` ${account.cardNo}` : ''}
          </Tag>
        </Descriptions.Item>

        {record.type === 'transfer' && targetAccount && (
          <Descriptions.Item label="转入账户">
            <Tag color={ACCOUNT_TYPE_COLORS[targetAccount.type] || '#667eea'} style={{ margin: 0 }}>
              {ACCOUNT_TYPE_ICONS[targetAccount.type] || '💰'} {targetAccount.name}
              {targetAccount.cardNo ? ` ${targetAccount.cardNo}` : ''}
            </Tag>
          </Descriptions.Item>
        )}

        {record.type === 'transfer' && record.transferType && (
          <Descriptions.Item label="转账类型">
            {record.transferType === 'recharge' ? '充值' :
             record.transferType === 'withdraw' ? '提现' : '转账'}
          </Descriptions.Item>
        )}

        {record.type === 'transfer' && record.transferType ? (
          <Descriptions.Item label="记账方式">
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 8px', borderRadius: 4, fontSize: 12,
              background: sourceCfg.color + '18', color: sourceCfg.color,
              border: `1px solid ${sourceCfg.color}30`
            }}>
              {sourceCfg.icon} {sourceCfg.label}
            </span>
          </Descriptions.Item>
        ) : (
          <Descriptions.Item label="记账方式" span={2}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 8px', borderRadius: 4, fontSize: 12,
              background: sourceCfg.color + '18', color: sourceCfg.color,
              border: `1px solid ${sourceCfg.color}30`
            }}>
              {sourceCfg.icon} {sourceCfg.label}
            </span>
          </Descriptions.Item>
        )}

        <Descriptions.Item label="日期时间" span={2}>
          {dateStr} {fullTimeStr}
        </Descriptions.Item>

        {record.note && (
          <Descriptions.Item label={
            isAudioRecord ? '语音转写' :
            isImageRecord ? 'AI识别结果' :
            '备注'
          } span={2}>
            <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{record.note}</span>
          </Descriptions.Item>
        )}

        {record.rawFilePath && !isImageRecord && !isAudioRecord && (
          <Descriptions.Item label="附件路径" span={2}>
            <span style={{ fontSize: 12, color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)' }}>
              {record.rawFilePath}
            </span>
          </Descriptions.Item>
        )}
      </Descriptions>

      {(isImageRecord || isAudioRecord) && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>
            {isImageRecord ? '📷 支付截图' : '🎙️ 录音文件'}
          </div>
          <Spin spinning={loadingAttachment}>
            {isImageRecord && imageBase64 ? (
              <div>
                <img
                  src={`data:image/png;base64,${imageBase64}`}
                  alt="支付截图"
                  style={{
                    maxWidth: '100%', maxHeight: 200, borderRadius: 8,
                    objectFit: 'contain', cursor: 'pointer',
                    border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
                  }}
                  onClick={() => setImagePreviewVisible(true)}
                />
                <Image
                  style={{ display: 'none' }}
                  src={`data:image/png;base64,${imageBase64}`}
                  preview={{
                    visible: imagePreviewVisible,
                    onVisibleChange: (vis) => setImagePreviewVisible(vis),
                  }}
                />
              </div>
            ) : isImageRecord && !imageBase64 && !loadingAttachment ? (
              <div style={{
                padding: '24px 16px', textAlign: 'center', borderRadius: 8,
                background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)', fontSize: 13
              }}>
                截图文件未找到（演示数据无实际附件）
              </div>
            ) : null}

            {isAudioRecord && audioBase64 ? (
              <div style={{
                padding: '12px 16px', borderRadius: 8,
                background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`
              }}>
                <AudioWaveform base64Data={audioBase64} isDark={isDark} />
              </div>
            ) : isAudioRecord && !audioBase64 && !loadingAttachment ? (
              <div style={{
                padding: '24px 16px', textAlign: 'center', borderRadius: 8,
                background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)', fontSize: 13
              }}>
                <SoundOutlined style={{ fontSize: 24, marginBottom: 8, display: 'block' }} />
                录音文件未找到（演示数据无实际附件）
              </div>
            ) : null}
          </Spin>
        </div>
      )}

      {record.refundStatus && record.refundStatus !== 'none' && (
        <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: 'rgba(250,173,20,0.08)', border: '1px solid rgba(250,173,20,0.15)' }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
            🔄 退款信息
            <Tag color={record.refundStatus === 'full' ? 'orange' : 'gold'} style={{ marginLeft: 8 }}>
              {record.refundStatus === 'full' ? '已全额退款' : '部分退款'}
            </Tag>
          </div>
          <div style={{ fontSize: 13, color: isDark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.65)' }}>
            退款金额：¥{record.refundAmount?.toFixed(2)}
            {record.shippingFee ? ` | 运费：¥${record.shippingFee.toFixed(2)}` : ''}
          </div>
          {record.refundNote && (
            <div style={{ fontSize: 12, color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)', marginTop: 4 }}>
              {record.refundNote}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

export default RecordDetailModal
