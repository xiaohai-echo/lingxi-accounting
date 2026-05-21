import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { Modal, Input, Button, Spin, Typography, App } from 'antd'
import {
  AudioOutlined,
  CameraOutlined,
  PictureOutlined,
  SendOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  EditOutlined
} from '@ant-design/icons'
import type { RootState, AppDispatch } from '../store'
import { store } from '../store'
import { getApi } from '../api/mock'
import { getDefaultAccountId } from '../utils/constants'
import {
  getApiKeyStatus,
  analyzeAccounting,
  findMissingAccounts,
  transcribeVoice
} from '../services/ai'
import type { AccountItem, CategoryItem, RecordInput } from '../services/ai'
import { fetchRecords } from '../store/slices/recordsSlice'
import { fetchAccounts } from '../store/slices/accountsSlice'
import { addAccount } from '../store/slices/accountsSlice'

const { TextArea } = Input
const { Text } = Typography

export type AIMode = 'text' | 'screenshot' | 'camera' | 'voice'

interface AIRecordModalProps {
  open: boolean
  mode?: AIMode
  onClose: () => void
  onSuccess: () => void
}

const MODE_LABELS: Record<AIMode, string> = {
  text: '文字输入',
  screenshot: '截图识别',
  camera: '拍照记账',
  voice: '语音记账'
}

const MODE_SOURCE: Record<AIMode, 'ai_text' | 'ai_voice' | 'ai_image'> = {
  text: 'ai_text',
  screenshot: 'ai_image',
  camera: 'ai_image',
  voice: 'ai_voice'
}

// ==================== Error Handler ====================

function handleError(e: Error, msg: { error: (content: string) => void }): void {
  const m = e.message
  if (m === 'NO_API_KEY' || m === 'API_KEY_MISSING') {
    msg.error('请先在设置页配置智谱 API Key')
  } else if (m === 'INVALID_API_KEY') {
    msg.error('API Key 无效，请前往设置页重新配置')
  } else if (m === 'PARSE_ERROR') {
    msg.error('AI 解析失败，请重试')
  } else if (m === 'AMOUNT_INVALID') {
    msg.error('未能识别有效金额，请重新描述')
  } else if (m === 'VOICE_ERROR') {
    msg.error('语音识别失败，请重试')
  } else if (m === 'NO_INPUT') {
    msg.error('请输入记账描述或上传图片')
  } else if (m.startsWith('ASR_ERROR')) {
    msg.error('语音转文字失败，请确保录音清晰且时长在30秒内')
  } else if (m.includes('语音识别结果为空')) {
    msg.error(m)
  } else if (m === 'API_ERROR') {
    msg.error('网络连接失败，请检查网络后重试')
  } else {
    msg.error('操作失败，请重试')
  }
}

// ==================== Notifications ====================

function showSuccessNotification(
  recordInput: RecordInput,
  categoryName: string,
  accountName: string,
  targetAccountName: string | undefined,
  notification: any
): void {
  const typeLabel = recordInput.type === 'income' ? '收入' : recordInput.type === 'transfer' ? '转账' : '支出'
  const typeColor = recordInput.type === 'income' ? '#52c41a' : recordInput.type === 'transfer' ? '#667eea' : '#ff4d4f'
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
    window.matchMedia('(prefers-color-scheme: dark)').matches
  const now = new Date()
  const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  notification.success({
    message: 'AI 记账成功',
    description: (
      <div style={{
        fontSize: 13, lineHeight: 1.8,
        background: isDark
          ? `linear-gradient(135deg, ${typeColor}20, ${typeColor}0c)`
          : `linear-gradient(135deg, ${typeColor}0d, ${typeColor}05)`,
        padding: '8px 12px', borderRadius: 8, margin: '-4px -4px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><span style={{ color: typeColor, fontWeight: 600 }}>{typeLabel}</span> ¥{recordInput.amount.toFixed(2)}</div>
          <span style={{ fontSize: 11, opacity: isDark ? 0.55 : 0.45 }}>{timeStr}</span>
        </div>
        <div>记录：{recordInput.title}</div>
        {recordInput.type === 'transfer' && targetAccountName ? (
          <div>账户：{accountName} → {targetAccountName}</div>
        ) : (
          <div>付款账户：{accountName}</div>
        )}
        {recordInput.type !== 'transfer' && <div>消费类别：{categoryName}</div>}
      </div>
    ),
    icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
    duration: 5,
    placement: 'topRight',
  })
}

function showFailureNotification(
  errorMessage: string,
  notification: any
): void {
  notification.error({
    message: 'AI 记账失败',
    description: errorMessage,
    icon: <CloseCircleOutlined style={{ color: '#ff4d4f' }} />,
    duration: 4,
    placement: 'topRight',
  })
}

// ==================== Helper: read file as base64 ====================

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Strip data URI prefix, keep only base64 content
      const base64 = result.split(',')[1] || result
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}

// ==================== Helper: stop media stream tracks ====================

function stopMediaStream(stream: MediaStream | null): void {
  if (stream) {
    stream.getTracks().forEach(track => track.stop())
  }
}

// ==================== Component ====================

const AIRecordModal: React.FC<AIRecordModalProps> = ({ open, mode: externalMode, onClose, onSuccess }) => {
  const { message, notification } = App.useApp()
  const dispatch = useDispatch<AppDispatch>()

  const accounts = useSelector((state: RootState) => state.accounts.items)
  const categories = useSelector((state: RootState) => state.categories.items)
  const currentLedgerId = useSelector((state: RootState) => state.ledgers.currentLedgerId)

  const [internalMode, setInternalMode] = useState<AIMode | null>(null)
  const mode = externalMode ?? internalMode

  // Shared state
  const [loading, setLoading] = useState(false)
  const [loadingText, setLoadingText] = useState('')

  // --- Text mode ---
  const [textInput, setTextInput] = useState('')

  // --- Screenshot mode ---
  const [screenshotBase64, setScreenshotBase64] = useState<string | null>(null)
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // --- Camera mode ---
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const [photoBase64, setPhotoBase64] = useState<string | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // --- Voice mode ---
  const [isRecording, setIsRecording] = useState(false)
  const [volume, setVolume] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const voiceStreamRef = useRef<MediaStream | null>(null)
  const speechResultRef = useRef<string>('')
  const recognitionRef = useRef<any>(null)
  const volumeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)

  // ==================== Cleanup on close ====================

  useEffect(() => {
    if (!open) {
      // Reset all state
      setLoading(false)
      setLoadingText('')
      setTextInput('')
      setScreenshotBase64(null)
      setScreenshotPreview(null)
      setPhotoBase64(null)
      setPhotoPreview(null)
      setIsRecording(false)
      stopMediaStream(cameraStream)
      setCameraStream(null)
      stopMediaStream(voiceStreamRef.current)
      voiceStreamRef.current = null
      if (recognitionRef.current) {
        try { recognitionRef.current.stop() } catch { /* already stopped */ }
        recognitionRef.current = null
      }
      speechResultRef.current = ''
      if (volumeTimerRef.current) {
        clearInterval(volumeTimerRef.current)
        volumeTimerRef.current = null
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {})
        audioCtxRef.current = null
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
      mediaRecorderRef.current = null
      audioChunksRef.current = []
    }
  }, [open])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMediaStream(cameraStream)
      stopMediaStream(voiceStreamRef.current)
      if (recognitionRef.current) {
        try { recognitionRef.current.stop() } catch { /* already stopped */ }
        recognitionRef.current = null
      }
      if (volumeTimerRef.current) {
        clearInterval(volumeTimerRef.current)
        volumeTimerRef.current = null
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {})
        audioCtxRef.current = null
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
    }
  }, [cameraStream])

  // ==================== AI Submission Flow ====================

  const submitAI = useCallback(
    async (options: { text?: string; imageBase64?: string }) => {
      const { text, imageBase64 } = options

      if (!text && !imageBase64) {
        message.error('请输入记账描述或上传图片')
        return
      }

      if (getApiKeyStatus() === 'missing') {
        message.error('请先在设置页配置智谱 API Key')
        return
      }

      setLoading(true)
      setLoadingText('AI 正在识别…')

      try {
        const accountsForAI: AccountItem[] = accounts.map((a) => ({
          id: a.id,
          name: a.name,
          type: a.type,
          cardNo: a.cardNo,
          bankName: a.bankName,
          holderName: a.holderName
        }))

        const categoriesForAI: CategoryItem[] = categories.map((c) => ({
          id: c.id!,
          name: c.name,
          type: c.type,
          icon: c.icon,
          color: c.color
        }))

        const recordInput = await analyzeAccounting({
          text,
          imageBase64,
          accounts: accountsForAI,
          categories: categoriesForAI
        })

        const missingAccounts = findMissingAccounts(
          {
            amount: recordInput.amount,
            type: recordInput.type,
            description: recordInput.note,
            date: recordInput.date,
            time: undefined,
            paymentMethod: recordInput.paymentMethod,
            cardLast4: recordInput.cardLast4,
            transferType: recordInput.transferType,
            targetPaymentMethod: recordInput.targetPaymentMethod,
            targetCardLast4: recordInput.targetCardLast4,
            accountId: recordInput.accountId ?? null,
            categoryId: recordInput.categoryId ?? null,
            targetAccountId: recordInput.targetAccountId ?? null,
          },
          accountsForAI
        )

        if (missingAccounts.length > 0) {
          setLoadingText('正在创建账户…')
          for (const acc of missingAccounts) {
            await dispatch(addAccount({
              name: acc.name,
              type: acc.type as any,
              balance: acc.balance,
              cardNo: acc.cardNo,
              bankName: acc.bankName,
              uniqueId: acc.uniqueId,
              ledgerId: currentLedgerId || (accounts[0]?.ledgerId ?? 1),
              isDeleted: 0,
            })).unwrap()
          }
          await dispatch(fetchAccounts(currentLedgerId as any))
          const freshState = store.getState() as RootState
          const freshAccounts = freshState.accounts.items
          const freshAccountsForAI: AccountItem[] = freshAccounts.map((a: any) => ({
            id: a.id!, name: a.name, type: a.type, cardNo: a.cardNo, bankName: a.bankName
          }))
          const reanalyzed = await analyzeAccounting({
            text,
            imageBase64,
            accounts: freshAccountsForAI,
            categories: categoriesForAI
          })
          Object.assign(recordInput, reanalyzed)

          const createdNames = missingAccounts.map(a => a.name).join('、')
          notification.info({
            message: '已自动创建账户',
            description: `识别到银行卡尾号，已自动创建：${createdNames}`,
            duration: 4,
            placement: 'topRight',
          })
        }

        setLoadingText('正在写入…')

        let filePath: string | undefined
        if (mode !== 'text' && imageBase64) {
          const ext = mode === 'voice' ? 'webm' : 'png'
          const subDir = mode === 'voice' ? 'audio' : 'images'
          filePath = `${subDir}/record_${Date.now()}.${ext}`
          try {
            await getApi().saveAttachment(filePath, imageBase64)
          } catch { /* fallback: continue even if save fails */ }
        }

        await getApi().addRecord({
          amount: recordInput.amount,
          type: recordInput.type,
          categoryId: recordInput.categoryId ?? 0,
          accountId: recordInput.accountId ?? getDefaultAccountId() ?? (accounts[0]?.id ?? 1),
          targetAccountId: recordInput.type === 'transfer' ? recordInput.targetAccountId : undefined,
          transferType: recordInput.type === 'transfer' ? recordInput.transferType : undefined,
          fee: recordInput.type === 'transfer' ? recordInput.fee : undefined,
          ledgerId: currentLedgerId || (accounts[0]?.ledgerId ?? 1),
          date: recordInput.date,
          title: recordInput.title,
          note: mode === 'voice'
            ? `语音转写：${text || ''}`
            : mode === 'text'
              ? (text || '')
              : [
                  `图片识别：${recordInput.note}`,
                  recordInput.paymentMethod ? `支付方式：${recordInput.paymentMethod}${recordInput.cardLast4 ? `(${recordInput.cardLast4})` : ''}` : '',
                  recordInput.type === 'transfer' && recordInput.targetPaymentMethod ? `目标账户：${recordInput.targetPaymentMethod}${recordInput.targetCardLast4 ? `(${recordInput.targetCardLast4})` : ''}` : '',
                  filePath ? `附件：${filePath}` : '',
                ].filter(Boolean).join('，'),
          rawFilePath: filePath,
          source: mode ? MODE_SOURCE[mode] : 'ai_text',
          createdAt: recordInput.time
            ? `${recordInput.date}T${recordInput.time}`
            : new Date().toISOString()
        })

        setLoading(false)
        setLoadingText('')

        const category = categories.find((c) => c.id === recordInput.categoryId)
        const account = accounts.find((a) => a.id === recordInput.accountId)
        const targetAccount = recordInput.type === 'transfer' ? accounts.find((a) => a.id === recordInput.targetAccountId) : undefined
        const categoryName = category?.name ?? '未分类'
        const accountName = account?.name ?? '默认账户'
        const targetAccountName = targetAccount?.name

        const typeLabel = recordInput.type === 'income' ? '收入' : recordInput.type === 'transfer' ? '转账' : '支出'

        getApi().addLog('ai_record', `AI记账(${typeLabel}): ¥${recordInput.amount.toFixed(2)} ${recordInput.title}`, `${categoryName} | ${accountName}`)

        dispatch(fetchRecords(currentLedgerId as any))
        dispatch(fetchAccounts(currentLedgerId as any))

        showSuccessNotification(recordInput, categoryName, accountName, targetAccountName, notification)
        onClose()
        onSuccess()
      } catch (e) {
        setLoading(false)
        setLoadingText('')
        const err = e instanceof Error ? e : new Error(String(e))
        handleError(err, message)
        showFailureNotification(err.message, notification)
      }
    },
    [accounts, categories, currentLedgerId, message, notification, onClose, onSuccess]
  )

  // ==================== Mode: Text ====================

  const handleTextSubmit = useCallback(() => {
    if (!textInput.trim()) {
      message.error('请输入记账描述')
      return
    }
    submitAI({ text: textInput.trim() })
  }, [textInput, message, submitAI])

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          e.preventDefault()
          const file = items[i].getAsFile()
          if (file) {
            if (file.size > 10 * 1024 * 1024) {
              message.error('图片大小不能超过 10MB')
              return
            }
            readFileAsBase64(file)
              .then((b64) => {
                setScreenshotBase64(b64)
                setScreenshotPreview(URL.createObjectURL(file))
              })
              .catch(() => message.error('图片读取失败'))
          }
          return
        }
      }
    },
    [message]
  )

  // ==================== Mode: Screenshot ====================

  const handleScreenshotFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      if (!file.type.startsWith('image/')) {
        message.error('请选择图片文件')
        return
      }

      if (file.size > 10 * 1024 * 1024) {
        message.error('图片大小不能超过 10MB')
        return
      }

      readFileAsBase64(file)
        .then((b64) => {
          setScreenshotBase64(b64)
          setScreenshotPreview(URL.createObjectURL(file))
        })
        .catch(() => message.error('图片读取失败'))

      // Reset file input so same file can be re-selected
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    },
    [message]
  )

  const handleScreenshotDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const file = e.dataTransfer.files?.[0]
      if (!file) return

      if (!file.type.startsWith('image/')) {
        message.error('请拖入图片文件')
        return
      }

      if (file.size > 10 * 1024 * 1024) {
        message.error('图片大小不能超过 10MB')
        return
      }

      readFileAsBase64(file)
        .then((b64) => {
          setScreenshotBase64(b64)
          setScreenshotPreview(URL.createObjectURL(file))
        })
        .catch(() => message.error('图片读取失败'))
    },
    [message]
  )

  const handleScreenshotSubmit = useCallback(() => {
    if (!screenshotBase64) {
      message.error('请先上传图片')
      return
    }
    submitAI({ imageBase64: screenshotBase64 })
  }, [screenshotBase64, message, submitAI])

  const resetScreenshot = useCallback(() => {
    setScreenshotBase64(null)
    if (screenshotPreview) {
      URL.revokeObjectURL(screenshotPreview)
    }
    setScreenshotPreview(null)
  }, [screenshotPreview])

  const handleScreenshotPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          e.preventDefault()
          const file = items[i].getAsFile()
          if (file) {
            if (file.size > 10 * 1024 * 1024) {
              message.error('图片大小不能超过 10MB')
              return
            }

            // Clean up previous preview
            if (screenshotPreview) {
              URL.revokeObjectURL(screenshotPreview)
            }

            readFileAsBase64(file)
              .then((b64) => {
                setScreenshotBase64(b64)
                setScreenshotPreview(URL.createObjectURL(file))
              })
              .catch(() => message.error('图片读取失败'))
          }
          return
        }
      }
    },
    [message, screenshotPreview]
  )

  // ==================== Mode: Camera ====================

  const startCamera = useCallback(async () => {
    try {
      stopMediaStream(cameraStream)
      setCameraStream(null)

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      })
      setCameraStream(stream)

      // Attach stream to video element on next render
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      })
    } catch {
      message.error('无法访问摄像头，请检查权限设置')
    }
  }, [cameraStream, message])

  // Start camera when mode changes to camera and modal opens
  useEffect(() => {
    if (open && mode === 'camera') {
      startCamera()
    }
    // We only want this to run on open + mode change, not on every deps change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode])

  const takePhoto = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(video, 0, 0)

    const jpegBase64 = canvas.toDataURL('image/jpeg', 0.9).split(',')[1]
    // Canvas returns a full data URI; extract base64 part
    setPhotoBase64(jpegBase64)
    setPhotoPreview(canvas.toDataURL('image/jpeg', 0.9))
  }, [])

  const handleCameraSubmit = useCallback(() => {
    if (!photoBase64) {
      message.error('请先拍照')
      return
    }
    submitAI({ imageBase64: photoBase64 })
  }, [photoBase64, message, submitAI])

  const resetPhoto = useCallback(() => {
    setPhotoBase64(null)
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview)
    }
    setPhotoPreview(null)
  }, [photoPreview])

  // ==================== Mode: Voice ====================

  const startRecording = useCallback(async () => {
    try {
      stopMediaStream(voiceStreamRef.current)
      voiceStreamRef.current = null
      speechResultRef.current = ''

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      voiceStreamRef.current = stream

      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition()
        recognition.lang = 'zh-CN'
        recognition.interimResults = true
        recognition.continuous = true
        recognition.onresult = (e: any) => {
          let finalTranscript = ''
          for (let i = 0; i < e.results.length; i++) {
            if (e.results[i].isFinal) {
              finalTranscript += e.results[i][0].transcript
            }
          }
          if (finalTranscript) {
            speechResultRef.current = finalTranscript
          }
        }
        recognition.onerror = (e: any) => {
          console.warn('[Voice] SpeechRecognition error:', e.error)
        }
        recognition.onend = () => {
          console.log('[Voice] SpeechRecognition ended')
        }
        try {
          recognition.start()
          recognitionRef.current = recognition
        } catch (e) {
          console.warn('[Voice] SpeechRecognition start failed:', e)
          recognitionRef.current = null
        }
      }

      try {
        const audioCtx = new AudioContext()
        const analyser = audioCtx.createAnalyser()
        analyser.fftSize = 256
        const source = audioCtx.createMediaStreamSource(stream)
        source.connect(analyser)
        const dataArray = new Uint8Array(analyser.frequencyBinCount)
        audioCtxRef.current = audioCtx
        volumeTimerRef.current = setInterval(() => {
          if (!analyser) return
          analyser.getByteFrequencyData(dataArray)
          const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
          setVolume(Math.min(1, avg / 128))
        }, 100)
      } catch { /* AudioContext not available */ }

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4'

      const recorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = recorder
      audioChunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data)
        }
      }

      recorder.onstop = async () => {
        setIsRecording(false)
        setVolume(0)
        if (volumeTimerRef.current) {
          clearInterval(volumeTimerRef.current)
          volumeTimerRef.current = null
        }
        if (audioCtxRef.current) {
          audioCtxRef.current.close().catch(() => {})
          audioCtxRef.current = null
        }
        stopMediaStream(stream)
        voiceStreamRef.current = null

        await new Promise<void>((resolve) => {
          if (recognitionRef.current) {
            try {
              recognitionRef.current.stop()
            } catch { /* already stopped */ }
            recognitionRef.current = null
            setTimeout(resolve, 500)
          } else {
            resolve()
          }
        })

        const speechText = speechResultRef.current.trim()
        speechResultRef.current = ''

        if (speechText) {
          setLoading(true)
          setLoadingText('AI 正在识别…')
          try {
            const accountsForAI: AccountItem[] = accounts.map((a) => ({
              id: a.id, name: a.name, type: a.type,
              cardNo: a.cardNo, bankName: a.bankName, holderName: a.holderName
            }))
            const categoriesForAI: CategoryItem[] = categories.map((c) => ({
              id: c.id!, name: c.name, type: c.type, icon: c.icon, color: c.color
            }))
            const recordInput = await analyzeAccounting({
              text: speechText, accounts: accountsForAI, categories: categoriesForAI
            })
            setLoadingText('正在写入…')

            let voicePath: string | undefined
            if (audioChunksRef.current.length > 0) {
              voicePath = `audio/record_${Date.now()}.webm`
              const audioBlob = new Blob(audioChunksRef.current, { type: mimeType })
              const audioBase64 = await new Promise<string>((resolve) => {
                const reader = new FileReader()
                reader.onload = () => {
                  const result = reader.result as string
                  resolve(result.split(',')[1] || result)
                }
                reader.onerror = () => resolve('')
                reader.readAsDataURL(audioBlob)
              })
              if (audioBase64) {
                try { await getApi().saveAttachment(voicePath, audioBase64) } catch { /* fallback */ }
              }
            }

            await getApi().addRecord({
              amount: recordInput.amount, type: recordInput.type,
              categoryId: recordInput.categoryId ?? 0,
              accountId: recordInput.accountId ?? getDefaultAccountId() ?? (accounts[0]?.id ?? 1),
              targetAccountId: recordInput.type === 'transfer' ? recordInput.targetAccountId : undefined,
              transferType: recordInput.type === 'transfer' ? recordInput.transferType : undefined,
              fee: recordInput.type === 'transfer' ? recordInput.fee : undefined,
              ledgerId: currentLedgerId || (accounts[0]?.ledgerId ?? 1),
              date: recordInput.date,
              title: recordInput.title,
              note: `语音转写：${speechText}`,
              rawFilePath: voicePath,
              source: 'ai_voice',
              createdAt: recordInput.time
                ? `${recordInput.date}T${recordInput.time}`
                : new Date().toISOString()
            })
            setLoading(false)
            setLoadingText('')
            const category = categories.find((c) => c.id === recordInput.categoryId)
            const account = accounts.find((a) => a.id === recordInput.accountId)
            const targetAccount = recordInput.type === 'transfer' ? accounts.find((a) => a.id === recordInput.targetAccountId) : undefined
            const categoryName = category?.name ?? '未分类'
            const accountName = account?.name ?? '默认账户'
            const targetAccountName = targetAccount?.name
            const typeLabel = recordInput.type === 'income' ? '收入' : recordInput.type === 'transfer' ? '转账' : '支出'

            getApi().addLog('ai_record', `AI记账(${typeLabel}): ¥${recordInput.amount.toFixed(2)} ${recordInput.title}`, `${categoryName} | ${accountName}`)

            dispatch(fetchRecords(currentLedgerId as any))
            dispatch(fetchAccounts(currentLedgerId as any))

            showSuccessNotification(recordInput, categoryName, accountName, targetAccountName, notification)
            onClose()
            onSuccess()
            return
          } catch (e) {
            setLoading(false)
            setLoadingText('')
            const err = e instanceof Error ? e : new Error(String(e))
            handleError(err, message)
            showFailureNotification(err.message, notification)
            return
          }
        }

        if (audioChunksRef.current.length === 0) {
          message.error('未录制到音频，请检查麦克风权限后重试')
          return
        }

        setLoading(true)
        setLoadingText('AI 正在识别语音…')

        try {
          const blob = new Blob(audioChunksRef.current, { type: mimeType })
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => {
              const result = reader.result as string
              resolve(result.split(',')[1] || result)
            }
            reader.onerror = () => reject(new Error('音频读取失败'))
            reader.readAsDataURL(blob)
          })

          const transcription = await transcribeVoice(base64, mimeType)
          if (!transcription.trim()) {
            throw new Error('语音识别结果为空，请重新录制')
          }

          const accountsForAI: AccountItem[] = accounts.map((a) => ({
            id: a.id, name: a.name, type: a.type,
            cardNo: a.cardNo, bankName: a.bankName, holderName: a.holderName
          }))
          const categoriesForAI: CategoryItem[] = categories.map((c) => ({
            id: c.id!, name: c.name, type: c.type, icon: c.icon, color: c.color
          }))

          const recordInput = await analyzeAccounting({
            text: transcription, accounts: accountsForAI, categories: categoriesForAI
          })

          setLoadingText('正在写入…')

          const voicePath = `audio/record_${Date.now()}.webm`
          try { await getApi().saveAttachment(voicePath, base64) } catch { /* fallback */ }

          await getApi().addRecord({
            amount: recordInput.amount, type: recordInput.type,
            categoryId: recordInput.categoryId ?? 0,
            accountId: recordInput.accountId ?? getDefaultAccountId() ?? (accounts[0]?.id ?? 1),
            targetAccountId: recordInput.type === 'transfer' ? recordInput.targetAccountId : undefined,
            transferType: recordInput.type === 'transfer' ? recordInput.transferType : undefined,
            fee: recordInput.type === 'transfer' ? recordInput.fee : undefined,
            ledgerId: currentLedgerId || (accounts[0]?.ledgerId ?? 1),
            date: recordInput.date,
            title: recordInput.title,
            note: `语音转写：${transcription}`,
            rawFilePath: voicePath,
            source: 'ai_voice',
            createdAt: recordInput.time
              ? `${recordInput.date}T${recordInput.time}`
              : new Date().toISOString()
          })

          setLoading(false)
          setLoadingText('')

          const category = categories.find((c) => c.id === recordInput.categoryId)
          const account = accounts.find((a) => a.id === recordInput.accountId)
          const targetAccount = recordInput.type === 'transfer' ? accounts.find((a) => a.id === recordInput.targetAccountId) : undefined
          const categoryName = category?.name ?? '未分类'
          const accountName = account?.name ?? '默认账户'
          const targetAccountName = targetAccount?.name
          const typeLabel = recordInput.type === 'income' ? '收入' : recordInput.type === 'transfer' ? '转账' : '支出'

          getApi().addLog('ai_record', `AI记账(${typeLabel}): ¥${recordInput.amount.toFixed(2)} ${recordInput.title}`, `${categoryName} | ${accountName}`)

          dispatch(fetchRecords(currentLedgerId as any))
          dispatch(fetchAccounts(currentLedgerId as any))

          showSuccessNotification(recordInput, categoryName, accountName, targetAccountName, notification)
          onClose()
          onSuccess()
        } catch (e) {
          setLoading(false)
          setLoadingText('')
          const err = e instanceof Error ? e : new Error(String(e))
          handleError(err, message)
          showFailureNotification(err.message, notification)
        }
      }

      recorder.start(1000)
      setIsRecording(true)
    } catch {
      message.error('无法访问麦克风，请检查权限设置')
    }
  }, [accounts, categories, currentLedgerId, message, notification, onClose, onSuccess])

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch { /* already stopped */ }
      recognitionRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
  }, [])

  // ==================== Render: Modal Content ====================

  const renderTextMode = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <TextArea
        rows={4}
        placeholder="描述你的消费，例如：午餐买了一份黄焖鸡35元用微信支付"
        value={textInput}
        onChange={(e) => setTextInput(e.target.value)}
        onPaste={handlePaste}
        disabled={loading}
      />
      <Text type="secondary" style={{ fontSize: 12 }}>
        支持粘贴截图：Ctrl+V
      </Text>
      <Button
        type="primary"
        icon={<SendOutlined />}
        onClick={handleTextSubmit}
        loading={loading}
        block
      >
        AI 识别记账
      </Button>
    </div>
  )

  const renderScreenshotMode = () => {
    if (screenshotPreview && screenshotBase64) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
          <img
            src={screenshotPreview}
            alt="截图预览"
            style={{ maxWidth: '100%', maxHeight: 360, borderRadius: 8, objectFit: 'contain' }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              icon={<ReloadOutlined />}
              onClick={resetScreenshot}
              disabled={loading}
            >
              重新选择
            </Button>
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleScreenshotSubmit}
              loading={loading}
            >
              AI 识别
            </Button>
          </div>
        </div>
      )
    }

    return (
      <div
        onPaste={handleScreenshotPaste}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleScreenshotDrop}
        style={{
          border: '2px dashed #d9d9d9',
          borderRadius: 8,
          padding: '40px 20px',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'border-color 0.3s',
          background: 'rgba(0,0,0,0.02)'
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        <PictureOutlined style={{ fontSize: 48, color: '#bfbfbf', marginBottom: 16 }} />
        <div style={{ fontSize: 14, color: '#8c8c8c' }}>
          点击上传或拖拽图片，或直接粘贴截图
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleScreenshotFileChange}
        />
      </div>
    )
  }

  const renderCameraMode = () => {
    if (photoPreview && photoBase64) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
          <img
            src={photoPreview}
            alt="拍照预览"
            style={{ maxWidth: '100%', maxHeight: 360, borderRadius: 8, objectFit: 'contain' }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              icon={<ReloadOutlined />}
              onClick={resetPhoto}
              disabled={loading}
            >
              重新拍摄
            </Button>
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleCameraSubmit}
              loading={loading}
            >
              AI 识别
            </Button>
          </div>
        </div>
      )
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
        <div
          style={{
            width: '100%',
            maxWidth: 400,
            borderRadius: 8,
            overflow: 'hidden',
            background: '#000'
          }}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            style={{ width: '100%', display: 'block', filter: 'brightness(1.3) contrast(1.1)' }}
          />
        </div>
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        <Button
          type="primary"
          icon={<CameraOutlined />}
          onClick={takePhoto}
          size="large"
          disabled={loading || !cameraStream}
        >
          拍照
        </Button>
        {!cameraStream && (
          <Button icon={<ReloadOutlined />} onClick={startCamera}>
            重新开启摄像头
          </Button>
        )}
      </div>
    )
  }

  const renderVoiceMode = () => {
    const barCount = 24
    const bars = Array.from({ length: barCount }, (_, i) => {
      const centerDist = Math.abs(i - (barCount - 1) / 2) / ((barCount - 1) / 2)
      const baseH = 8 + (1 - centerDist) * 16
      const h = isRecording ? baseH + volume * (40 - centerDist * 20) : baseH
      return h
    })

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
        <div
          onClick={isRecording ? stopRecording : startRecording}
          className={isRecording ? 'voice-recording-pulse' : ''}
          style={{
            width: 120,
            height: 120,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            border: isRecording ? '3px solid #ff4d4f' : '3px solid #d9d9d9',
            background: isRecording ? 'rgba(255,77,79,0.08)' : 'rgba(0,0,0,0.02)',
            transition: 'all 0.3s'
          }}
        >
          <AudioOutlined
            style={{
              fontSize: 48,
              color: isRecording ? '#ff4d4f' : '#8c8c8c'
            }}
          />
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3,
          height: 56,
          marginTop: 8,
          padding: '0 8px'
        }}>
          {bars.map((h, i) => (
            <div
              key={i}
              style={{
                width: 3,
                height: h,
                borderRadius: 2,
                background: isRecording
                  ? `linear-gradient(180deg, ${volume > 0.5 ? '#ff4d4f' : '#667eea'}, ${volume > 0.3 ? '#667eea' : '#bfbfbf'})`
                  : '#d9d9d9',
                transition: 'height 0.1s ease, background 0.2s'
              }}
            />
          ))}
        </div>
        <Text type="secondary" style={{ fontSize: 14, marginTop: 4 }}>
          {isRecording ? '正在录音，点击停止…' : '点击开始录音'}
        </Text>
        {!isRecording && !navigator.mediaDevices && (
          <Text type="warning" style={{ fontSize: 12 }}>
            当前浏览器不支持麦克风录音，请使用 Chrome 或 Edge 浏览器
          </Text>
        )}
      </div>
    )
  }

  const renderContent = () => {
    switch (mode) {
      case 'text':
        return renderTextMode()
      case 'screenshot':
        return renderScreenshotMode()
      case 'camera':
        return renderCameraMode()
      case 'voice':
        return renderVoiceMode()
      default:
        return null
    }
  }

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
    window.matchMedia?.('(prefers-color-scheme: dark)').matches

  const MODE_CARDS: { key: AIMode; icon: React.ReactNode; label: string; desc: string; color: string }[] = [
    { key: 'text', icon: <EditOutlined style={{ fontSize: 28 }} />, label: '文字记账', desc: '输入描述，AI智能识别', color: '#1677ff' },
    { key: 'voice', icon: <AudioOutlined style={{ fontSize: 28 }} />, label: '语音记账', desc: '说话即可记账', color: '#52c41a' },
    { key: 'screenshot', icon: <PictureOutlined style={{ fontSize: 28 }} />, label: '图片记账', desc: '上传截图识别', color: '#fa8c16' },
    { key: 'camera', icon: <CameraOutlined style={{ fontSize: 28 }} />, label: '拍照记账', desc: '拍照识别账单', color: '#eb2f96' },
  ]

  const renderModeSelector = () => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '8px 0' }}>
      {MODE_CARDS.map(card => (
        <div
          key={card.key}
          onClick={() => setInternalMode(card.key)}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '20px 12px', borderRadius: 12, cursor: 'pointer',
            background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)',
            border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'}`,
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = card.color; e.currentTarget.style.transform = 'translateY(-2px)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'; e.currentTarget.style.transform = 'none' }}
        >
          <div style={{ color: card.color, marginBottom: 8 }}>{card.icon}</div>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{card.label}</div>
          <div style={{ fontSize: 12, opacity: 0.55 }}>{card.desc}</div>
        </div>
      ))}
    </div>
  )

  return (
    <Modal
      title={mode ? `AI 智能记账 - ${MODE_LABELS[mode]}` : 'AI 智能记账'}
      open={open}
      onCancel={onClose}
      footer={mode ? null : undefined}
      width={520}
      destroyOnHidden
    >
      {mode ? (
        <Spin spinning={loading} tip={loadingText || undefined}>
          {renderContent()}
        </Spin>
      ) : (
        renderModeSelector()
      )}
    </Modal>
  )
}

export default AIRecordModal
