import React, { useState } from 'react'
import { Form, Input, Button, App, theme } from 'antd'
import { UserOutlined, LockOutlined, SmileOutlined } from '@ant-design/icons'
import { useDispatch, useSelector } from 'react-redux'
import { loginUser, registerUser, clearError } from '../store/slices/userSlice'
import type { AppDispatch, RootState } from '../store'
import logoImg from '../assets/logo.png'

const HIGHLIGHTS = [
  { icon: '💰', title: '多账户管理', desc: '现金/银行卡/微信/支付宝统一管理' },
  { icon: '📒', title: '多账本支持', desc: '日常账本/旅行基金等多场景独立记账' },
  { icon: '🤖', title: '智能记账', desc: 'AI OCR 识别截图快捷记账' },
  { icon: '🎯', title: '预算管理', desc: '月度/季度/年度预算与超支提醒' },
  { icon: '📊', title: '数据统计', desc: '收支趋势/分类占比/账户分析图表' },
  { icon: '🔄', title: '退款管理', desc: '支持消费退款/部分退款/运费处理' },
  { icon: '🌓', title: '深色模式', desc: '自动适配系统主题偏好' },
  { icon: '☁️', title: '数据同步', desc: 'JSON 备份/CSV 表格/飞书同步' }
]

const Login: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>()
  const { loading, error } = useSelector((state: RootState) => state.user)
  const { message } = App.useApp()
  const { token } = theme.useToken()
  const [isLogin, setIsLogin] = useState(true)
  const [loginForm] = Form.useForm()
  const [registerForm] = Form.useForm()

  const isDarkMode = token.colorBgBase === '#141414' || token.colorBgBase === '#000' || (token.colorBgBase && token.colorBgBase.startsWith('#0'))

  const handleLogin = async (values: { username: string; password: string }) => {
    const result = await dispatch(loginUser(values))
    if (loginUser.fulfilled.match(result)) {
      message.success('登录成功')
    } else {
      message.error((result.payload as string) || '登录失败')
    }
  }

  const handleRegister = async (values: { username: string; password: string; nickname?: string }) => {
    const result = await dispatch(registerUser({ username: values.username, password: values.password, nickname: values.nickname }))
    if (registerUser.fulfilled.match(result)) {
      message.success('注册成功，欢迎使用！')
    } else {
      message.error((result.payload as string) || '注册失败')
    }
  }

  const switchMode = (toLogin: boolean) => {
    dispatch(clearError())
    setIsLogin(toLogin)
  }

  const BG = isDarkMode ? '#141414' : '#f5f5f5'
  const CARD_BG = isDarkMode ? '#1f1f1f' : '#fff'
  const TEXT_PRIMARY = isDarkMode ? '#e0e0e0' : '#1a1a1a'
  const TEXT_SECONDARY = isDarkMode ? 'rgba(255,255,255,0.45)' : '#8c8c8c'
  const HINT_BG = isDarkMode ? 'rgba(255,255,255,0.06)' : '#f5f5f5'
  const ICON_COLOR = isDarkMode ? 'rgba(255,255,255,0.3)' : '#bfbfbf'

  return (
    <div style={{
      height: '100vh', display: 'flex', background: BG
    }}>
      {/* 左侧品牌区 */}
      <div style={{
        flex: 1,
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        color: '#fff', padding: 40,
        position: 'relative', overflow: 'hidden'
      }} className="login-brand-area">
        {/* 背景装饰 */}
        <div style={{ position: 'absolute', top: -80, right: -80, width: 260, height: 260, borderRadius: '50%', background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ position: 'absolute', bottom: -60, left: -60, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
        <div style={{ position: 'absolute', top: '40%', left: '10%', width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.03)' }} />

        {/* Logo */}
        <div style={{
          width: 90, height: 90, borderRadius: 22,
          background: 'rgba(255,255,255,0.15)',
          backdropFilter: 'blur(10px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 24,
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          zIndex: 1
        }}>
          <img
            src={logoImg}
            alt="灵析记账"
            style={{ width: 66, height: 66, borderRadius: 14, objectFit: 'cover' }}
          />
        </div>

        {/* 标题 */}
        <h1 style={{
          fontSize: 34, fontWeight: 700, color: '#fff',
          marginBottom: 10, letterSpacing: 2, zIndex: 1
        }}>灵析记账</h1>
        <p style={{
          fontSize: 16, color: 'rgba(255,255,255,0.8)',
          fontWeight: 300, letterSpacing: 1, marginBottom: 40, zIndex: 1
        }}>智能记账，轻松理财</p>

        {/* 核心特色 */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 12, maxWidth: 480, zIndex: 1
        }}>
          {HIGHLIGHTS.map(item => (
            <div key={item.title} style={{
              background: 'rgba(255,255,255,0.1)',
              backdropFilter: 'blur(5px)',
              borderRadius: 12, padding: '12px 14px',
              display: 'flex', alignItems: 'center', gap: 10,
              transition: 'background 0.2s'
            }}>
              <span style={{ fontSize: 22, flexShrink: 0 }}>{item.icon}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 2 }}>{item.title}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', lineHeight: 1.4 }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 右侧表单区 */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 40, background: CARD_BG
      }} className="login-form-area">
        <div style={{ width: '100%', maxWidth: 400 }}>
          <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, color: TEXT_PRIMARY }}>
            {isLogin ? '欢迎回来' : '创建账号'}
          </h2>
          <p style={{ color: TEXT_SECONDARY, marginBottom: 32, fontSize: 14 }}>
            {isLogin ? '登录您的账号以继续使用' : '注册一个新账号开始记账'}
          </p>

          {isLogin ? (
            <Form form={loginForm} onFinish={handleLogin} size="large">
              <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
                <Input prefix={<UserOutlined style={{ color: ICON_COLOR }} />} placeholder="用户名" style={{ borderRadius: 10, height: 46 }} />
              </Form.Item>
              <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
                <Input.Password prefix={<LockOutlined style={{ color: ICON_COLOR }} />} placeholder="密码" style={{ borderRadius: 10, height: 46 }} />
              </Form.Item>
              {error && <div style={{ color: '#ff4d4f', marginBottom: 16, fontSize: 13, textAlign: 'center' }}>{error}</div>}
              <Form.Item>
                <Button type="primary" htmlType="submit" loading={loading} block
                  style={{ height: 46, borderRadius: 10, fontWeight: 600, fontSize: 16, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', border: 'none' }}>
                  登 录
                </Button>
              </Form.Item>
              <div style={{ textAlign: 'center', color: TEXT_SECONDARY }}>
                还没有账号？<a onClick={() => switchMode(false)} style={{ color: '#667eea', marginLeft: 4, fontWeight: 500 }}>立即注册</a>
              </div>
            </Form>
          ) : (
            <Form form={registerForm} onFinish={handleRegister} size="large">
              <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }, { min: 3, message: '用户名至少3个字符' }]}>
                <Input prefix={<UserOutlined style={{ color: ICON_COLOR }} />} placeholder="用户名" style={{ borderRadius: 10, height: 46 }} />
              </Form.Item>
              <Form.Item name="nickname">
                <Input prefix={<SmileOutlined style={{ color: ICON_COLOR }} />} placeholder="昵称（可选）" style={{ borderRadius: 10, height: 46 }} />
              </Form.Item>
              <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }, { min: 4, message: '密码至少4位' }]}>
                <Input.Password prefix={<LockOutlined style={{ color: ICON_COLOR }} />} placeholder="密码" style={{ borderRadius: 10, height: 46 }} />
              </Form.Item>
              <Form.Item name="confirmPassword" dependencies={['password']}
                rules={[
                  { required: true, message: '请确认密码' },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('password') === value) return Promise.resolve()
                      return Promise.reject(new Error('两次输入的密码不一致'))
                    }
                  })
                ]}>
                <Input.Password prefix={<LockOutlined style={{ color: ICON_COLOR }} />} placeholder="确认密码" style={{ borderRadius: 10, height: 46 }} />
              </Form.Item>
              {error && <div style={{ color: '#ff4d4f', marginBottom: 16, fontSize: 13, textAlign: 'center' }}>{error}</div>}
              <Form.Item>
                <Button type="primary" htmlType="submit" loading={loading} block
                  style={{ height: 46, borderRadius: 10, fontWeight: 600, fontSize: 16, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', border: 'none' }}>
                  注 册
                </Button>
              </Form.Item>
              <div style={{ textAlign: 'center', color: TEXT_SECONDARY }}>
                已有账号？<a onClick={() => switchMode(true)} style={{ color: '#667eea', marginLeft: 4, fontWeight: 500 }}>返回登录</a>
              </div>
            </Form>
          )}

          <div style={{
            marginTop: 32, padding: 16, background: HINT_BG, borderRadius: 10,
            textAlign: 'center', fontSize: 12, color: TEXT_SECONDARY
          }}>
            演示账号：demo / demo123
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .login-brand-area { display: none !important; }
          .login-form-area { flex: 1 !important; }
        }
      `}</style>
    </div>
  )
}

export default Login
