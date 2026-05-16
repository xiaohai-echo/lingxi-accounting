import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useSelector } from 'react-redux'
import { Modal, Input, Button, Spin, Typography, App } from 'antd'
import {
  AudioOutlined,
  CameraOutlined,
  PictureOutlined,
  SendOutlined,
  ReloadOutlined
} from '@ant-design/icons'
import type { RootState } from '../store'
import { getApi } from '../api/mock'
import {
  getApiKeyStatus,
  analyzeAccounting,
  transcribeVoice
} from '../services/ai'
import type { AccountItem, CategoryItem } from '../services/ai'

const { TextArea } = Input
const { Text } = Typography

export type AIMode = 'text' | 'screenshot' | 'camera' | 'voice'

interface AIRecordModalProps {
  open: boolean
  mode: AIMode
  onClose: () => void
  onSuccess: () => void
}

const MODE_LABELS: Record<AIMode, string> = {
  text: '文字输入',
  screenshot: '截图识别',
  camera: '拍照记账',
  voice: '语音记账'
}

// ==================== Error Handler ====================

function handleError(e: Error, msg: { error: (content: string) => void }): void {
  switch (e.message) {
    case 'NO_API_KEY':
      msg.error('请先在设置页配置智谱 API Key')
      break
    case 'INVALID_API_KEY':
      msg.error('API Key 无效，请前往设置页重新配置')
      break
    case 'PARSE_ERROR':
      msg.error('AI 解析失败，请重试')
      break
    case 'AMOUNT_INVALID':
      msg.error('未能识别有效金额，请重新描述')
      break
    case 'VOICE_ERROR':
      msg.error('语音识别失败，请重试')
      break
    case 'NO_INPUT':
      msg.error('请输入记账描述或上传图片')
      break
    default:
      msg.error('网络连接失败，请检查网络后重试')
      break
  }
}

// ==================== Undo Notification ====================

function showUndoNotification(
  recordId: number,
  amount: number,
  categoryName: string,
  accountName: string,
  notification: any,
  onSuccess: () => void
): void {
  const key = `ai-record-${Date.now()}`
  notification.success({
    message: `AI记账: ¥${amount.toFixed(2)} · ${categoryName} - ${accountName}`,
    duration: 5,
    key,
    btn: (
      <Button
        danger
        size="small"
        onClick={async () => {
          try {
            await getApi().deleteRecord(recordId)
            notification.destroy(key)
            onSuccess()
          } catch {
            // Silent fail on undo error
          }
        }}
      >
        撤销
      </Button>
    )
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

const AIRecordModal: React.FC<AIRecordModalProps> = ({ open, mode, onClose, onSuccess }) => {
  const { message, notification } = App.useApp()

  // Redux state
  const accounts = useSelector((state: RootState) => state.accounts.items)
  const categories = useSelector((state: RootState) => state.categories.items)
  const currentLedgerId = useSelector((state: RootState) => state.ledgers.currentLedgerId)

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
        recognitionRef.current.stop()
        recognitionRef.current = null
      }
      speechResultRef.current = ''
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
        recognitionRef.current.stop()
        recognitionRef.current = null
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

      // Check API key
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

        setLoadingText('正在写入…')

        const recordId = await getApi().addRecord({
          amount: recordInput.amount,
          type: recordInput.type,
          categoryId: recordInput.categoryId ?? 0,
          accountId: recordInput.accountId ?? (accounts[0]?.id ?? 1),
          ledgerId: currentLedgerId ?? undefined,
          date: recordInput.time && recordInput.time !== '00:00:00'
            ? `${recordInput.date} ${recordInput.time}`
            : recordInput.date,
          note: recordInput.note
        })

        setLoading(false)
        setLoadingText('')

        // Determine display names for notification
        const category = categories.find((c) => c.id === recordInput.categoryId)
        const account = accounts.find((a) => a.id === recordInput.accountId)
        const categoryName = category?.name ?? '未分类'
        const accountName = account?.name ?? '默认账户'

        showUndoNotification(recordId, recordInput.amount, categoryName, accountName, notification, onSuccess)
        onClose()
        onSuccess()
      } catch (e) {
        setLoading(false)
        setLoadingText('')
        handleError(e instanceof Error ? e : new Error(String(e)), message)
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

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      voiceStreamRef.current = stream

      // Start Web Speech API recognition as primary voice input
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      let recognition: any = null
      if (SpeechRecognition) {
        recognition = new SpeechRecognition()
        recognition.lang = 'zh-CN'
        recognition.interimResults = true
        recognition.continuous = true
        recognition.onresult = (e: any) => {
          for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) {
              speechResultRef.current += e.results[i][0].transcript
            }
          }
        }
        recognition.onerror = () => { /* silent fallback to GLM-4-Voice */ }
        recognition.start()
        recognitionRef.current = recognition
      }

      // Setup volume meter
      let audioCtx: AudioContext | null = null
      let analyser: AnalyserNode | null = null
      let volumeTimer: ReturnType<typeof setInterval> | null = null
      try {
        audioCtx = new AudioContext()
        analyser = audioCtx.createAnalyser()
        analyser.fftSize = 256
        const source = audioCtx.createMediaStreamSource(stream)
        source.connect(analyser)
        const dataArray = new Uint8Array(analyser.frequencyBinCount)
        volumeTimer = setInterval(() => {
          if (!analyser) return
          analyser.getByteFrequencyData(dataArray)
          const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
          setVolume(Math.min(1, avg / 128))
        }, 100)
      } catch { /* AudioContext not available */ }

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'

      const recorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = recorder
      audioChunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data)
        }
      }

      recorder.onstop = async () => {
        setIsRecording(false)
        setVolume(0)
        if (volumeTimer) clearInterval(volumeTimer)
        if (audioCtx) audioCtx.close().catch(() => {})
        stopMediaStream(stream)
        voiceStreamRef.current = null

        // Check if Web Speech API produced a result first
        if (speechResultRef.current.trim()) {
          const speechText = speechResultRef.current.trim()
          speechResultRef.current = ''
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
            const recordId = await getApi().addRecord({
              amount: recordInput.amount, type: recordInput.type,
              categoryId: recordInput.categoryId ?? 0,
              accountId: recordInput.accountId ?? (accounts[0]?.id ?? 1),
              ledgerId: currentLedgerId ?? undefined,
              date: recordInput.time && recordInput.time !== '00:00:00'
                ? `${recordInput.date} ${recordInput.time}`
                : recordInput.date,
              note: recordInput.note
            })
            setLoading(false)
            setLoadingText('')
            const category = categories.find((c) => c.id === recordInput.categoryId)
            const account = accounts.find((a) => a.id === recordInput.accountId)
            const categoryName = category?.name ?? '未分类'
            const accountName = account?.name ?? '默认账户'
            showUndoNotification(recordId, recordInput.amount, categoryName, accountName, notification, onSuccess)
            onClose()
            onSuccess()
            return
          } catch (e) {
            setLoading(false)
            setLoadingText('')
            const err = e instanceof Error ? e : new Error(String(e))
            handleError(new Error(err.message === 'API_ERROR' ? 'VOICE_ERROR' : err.message), message)
            return
          }
        }

        if (audioChunksRef.current.length === 0) return

        const blob = new Blob(audioChunksRef.current, { type: mimeType })

        // Read blob as base64
        const reader = new FileReader()
        reader.onload = async () => {
          const base64 = (reader.result as string).split(',')[1] || (reader.result as string)

          setLoading(true)
          setLoadingText('AI 正在识别…')

          try {
            // Step 1: Transcribe voice to text
            const transcription = await transcribeVoice(base64, mimeType)

            // Step 2: Analyze accounting from transcribed text
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
              text: transcription,
              accounts: accountsForAI,
              categories: categoriesForAI
            })

            setLoadingText('正在写入…')

            const recordId = await getApi().addRecord({
              amount: recordInput.amount,
              type: recordInput.type,
              categoryId: recordInput.categoryId ?? 0,
              accountId: recordInput.accountId ?? (accounts[0]?.id ?? 1),
              ledgerId: currentLedgerId ?? undefined,
              date: recordInput.time && recordInput.time !== '00:00:00'
                ? `${recordInput.date} ${recordInput.time}`
                : recordInput.date,
              note: recordInput.note
            })

            setLoading(false)
            setLoadingText('')

            const category = categories.find((c) => c.id === recordInput.categoryId)
            const account = accounts.find((a) => a.id === recordInput.accountId)
            const categoryName = category?.name ?? '未分类'
            const accountName = account?.name ?? '默认账户'

            showUndoNotification(recordId, recordInput.amount, categoryName, accountName, notification, onSuccess)
            onClose()
            onSuccess()
          } catch (e) {
            setLoading(false)
            setLoadingText('')
            const err = e instanceof Error ? e : new Error(String(e))
            // Map network/API errors during voice flow to VOICE_ERROR
            const mappedMessage = (err.message === 'API_ERROR' || err.message.includes('voice') || err.message.includes('audio'))
              ? 'VOICE_ERROR'
              : err.message
            handleError(new Error(mappedMessage), message)
          }
        }
        reader.onerror = () => {
          setLoading(false)
          setLoadingText('')
          message.error('音频读取失败')
        }
        reader.readAsDataURL(blob)
      }

      recorder.start()
      setIsRecording(true)
    } catch {
      message.error('无法访问麦克风，请检查权限设置')
    }
  }, [accounts, categories, currentLedgerId, message, notification, onClose, onSuccess])

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
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

  const renderVoiceMode = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
      <div
        onClick={isRecording ? stopRecording : startRecording}
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
          transition: 'all 0.3s',
          animation: isRecording ? 'pulse 1.5s infinite' : 'none'
        }}
      >
        <AudioOutlined
          style={{
            fontSize: 48,
            color: isRecording ? '#ff4d4f' : '#8c8c8c'
          }}
        />
      </div>
      <div style={{ width: 120, height: 6, background: '#f0f0f0', borderRadius: 3, marginTop: 12, overflow: 'hidden' }}>
        <div style={{
          width: `${volume * 100}%`,
          height: '100%',
          background: volume > 0.7 ? '#52c41a' : volume > 0.3 ? '#667eea' : '#d9d9d9',
          borderRadius: 3,
          transition: 'width 0.1s ease, background 0.2s'
        }} />
      </div>
      <Text type="secondary" style={{ fontSize: 14, marginTop: 8 }}>
        {isRecording ? '正在录音，点击停止…' : '点击开始录音'}
      </Text>
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
      `}</style>
    </div>
  )

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

  return (
    <Modal
      title={`AI 智能记账 - ${MODE_LABELS[mode] || mode}`}
      open={open}
      onCancel={onClose}
      footer={null}
      width={520}
      destroyOnClose
    >
      <Spin spinning={loading} tip={loadingText || undefined}>
        {renderContent()}
      </Spin>
    </Modal>
  )
}

export default AIRecordModal
