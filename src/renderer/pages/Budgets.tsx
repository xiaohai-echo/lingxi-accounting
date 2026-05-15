import React, { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Card, List, Button, Modal, Form, Select, InputNumber, App, Progress, Row, Col, Statistic, Dropdown, Tag } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, EllipsisOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import type { RootState, AppDispatch } from '../store'
import { addBudget, updateBudget, deleteBudget } from '../store/slices/budgetsSlice'
import type { Budget } from '../../main/database/schema'

const { Option } = Select

const Budgets: React.FC = () => {
  const { message } = App.useApp()
  const dispatch = useDispatch<AppDispatch>()
  const { items: budgets } = useSelector((state: RootState) => state.budgets)
  const { items: records } = useSelector((state: RootState) => state.records)
  const { items: categories } = useSelector((state: RootState) => state.categories)
  const { currentLedgerId } = useSelector((state: RootState) => state.ledgers)

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null)
  const [form] = Form.useForm()

  const currentYear = dayjs().year()
  const currentMonth = dayjs().month() + 1

  const getCategoryById = (id: number) => categories.find(c => c.id === id)

  const calculateSpent = (budget: Budget) => {
    return records
      .filter(r => {
        if (r.type !== 'expense' || r.categoryId !== budget.categoryId) return false
        
        const recordDate = dayjs(r.date)
        if (recordDate.year() !== budget.year) return false
        
        if (budget.period === 'monthly' && budget.month && recordDate.month() + 1 !== budget.month) return false
        if (budget.period === 'quarterly' && budget.quarter) {
          const recordQuarter = Math.floor(recordDate.month() / 3) + 1
          if (recordQuarter !== budget.quarter) return false
        }
        
        return true
      })
      .reduce((sum, r) => sum + r.amount, 0)
  }

  const handleAdd = () => {
    setEditingBudget(null)
    form.resetFields()
    form.setFieldsValue({
      period: 'monthly',
      year: currentYear,
      month: currentMonth
    })
    setIsModalOpen(true)
  }

  const handleEdit = (budget: Budget) => {
    setEditingBudget(budget)
    form.setFieldsValue({
      categoryId: budget.categoryId,
      amount: budget.amount,
      period: budget.period,
      year: budget.year,
      month: budget.month,
      quarter: budget.quarter
    })
    setIsModalOpen(true)
  }

  const handleDelete = async (id: number) => {
    try {
      await dispatch(deleteBudget(id)).unwrap()
      message.success('预算删除成功！')
    } catch (error) {
      message.error('删除失败，请重试')
    }
  }

  const handleOk = async () => {
    try {
      const values = await form.validateFields()
      
      const budget: Omit<Budget, 'id' | 'createdAt' | 'updatedAt'> = {
        categoryId: values.categoryId,
        ledgerId: currentLedgerId ?? undefined,
        amount: values.amount,
        period: values.period,
        year: values.year,
        ...(values.period === 'monthly' && values.month != null ? { month: values.month } : {}),
        ...(values.period === 'quarterly' && values.quarter != null ? { quarter: values.quarter } : {})
      }
      
      if (editingBudget) {
        await dispatch(updateBudget({ id: editingBudget.id!, budget })).unwrap()
        message.success('预算更新成功！')
      } else {
        await dispatch(addBudget(budget)).unwrap()
        message.success('预算添加成功！')
      }
      setIsModalOpen(false)
    } catch (error: any) {
      if (error?.errorFields) {
        message.error('请填写完整信息')
        return
      }
      message.error('操作失败，请重试')
    }
  }

  const expenseCategories = categories.filter(c => c.type === 'expense')

  return (
    <div>
      <Card 
        title="预算管理"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            添加预算
          </Button>
        }
        style={{ marginBottom: 24 }}
      >
        <Row gutter={16}>
          <Col span={8}>
            <Statistic 
              title="总预算" 
              value={budgets.reduce((sum, b) => sum + b.amount, 0)} 
              precision={2} 
              valueStyle={{ color: '#1890ff' }}
            />
          </Col>
          <Col span={8}>
            <Statistic 
              title="已支出" 
              value={budgets.reduce((sum, b) => sum + calculateSpent(b), 0)} 
              precision={2} 
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Col>
          <Col span={8}>
            <Statistic 
              title="剩余预算" 
              value={budgets.reduce((sum, b) => sum + (b.amount - calculateSpent(b)), 0)} 
              precision={2} 
              valueStyle={{ color: '#52c41a' }}
            />
          </Col>
        </Row>
      </Card>

      <Card title="预算列表">
        <List
          dataSource={budgets}
          renderItem={(budget) => {
            const category = getCategoryById(budget.categoryId)
            const spent = calculateSpent(budget)
            const percentage = budget.amount > 0 ? Math.min((spent / budget.amount) * 100, 100) : 0
            const isOverBudget = spent > budget.amount
            const periodLabel = budget.period === 'monthly' ? `${budget.year}年${budget.month}月` : 
             budget.period === 'quarterly' ? `${budget.year}年Q${budget.quarter}` : 
             `${budget.year}年`
            const actionItems = [
              {
                key: 'edit',
                label: <span onClick={() => handleEdit(budget)}><EditOutlined style={{ marginRight: 8 }} />编辑</span>
              },
              {
                key: 'delete',
                danger: true,
                label: <span onClick={() => {
                  Modal.confirm({
                    title: '确定要删除这个预算吗？',
                    onOk: () => handleDelete(budget.id!),
                    okText: '确定',
                    cancelText: '取消'
                  })
                }}><DeleteOutlined style={{ marginRight: 8 }} />删除</span>
              }
            ]
            
            return (
              <List.Item
                actions={[
                  <Dropdown menu={{ items: actionItems }} trigger={['click']} placement="bottomRight">
                    <Button type="text" size="small" style={{ width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} icon={<EllipsisOutlined style={{ fontSize: 14 }} />} />
                  </Dropdown>
                ]}
              >
                <List.Item.Meta
                  avatar={
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                      <span style={{ fontSize: '24px' }}>{category?.icon || '📊'}</span>
                      <span style={{ fontSize: 11, color: '#8c8c8c', whiteSpace: 'nowrap' }}>{category?.name || `分类#${budget.categoryId}`}</span>
                    </div>
                  }
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Tag color={budget.period === 'monthly' ? 'blue' : budget.period === 'quarterly' ? 'purple' : 'orange'} style={{ fontSize: 11, margin: 0 }}>
                        {budget.period === 'monthly' ? '月度' : budget.period === 'quarterly' ? '季度' : '年度'}
                      </Tag>
                      <span style={{ color: '#8c8c8c', fontSize: 13 }}>{periodLabel}</span>
                    </div>
                  }
                  description={
                    <div style={{ marginTop: 8 }}>
                      <Progress 
                        percent={percentage} 
                        status={isOverBudget ? 'exception' : percentage > 80 ? 'active' : 'normal'}
                        format={() => `${spent.toFixed(2)} / ${budget.amount.toFixed(2)}`}
                      />
                      {isOverBudget && (
                        <div style={{ color: '#ff4d4f', marginTop: 4 }}>
                          ⚠️ 已超预算！
                        </div>
                      )}
                    </div>
                  }
                />
              </List.Item>
            )
          }}
        />
      </Card>

      <Modal
        title={editingBudget ? "编辑预算" : "添加预算"}
        open={isModalOpen}
        onOk={handleOk}
        onCancel={() => setIsModalOpen(false)}
        okText="确定"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="categoryId"
            label="分类"
            rules={[{ required: true, message: '请选择分类' }]}
          >
            <Select placeholder="请选择分类">
              {expenseCategories.map(category => (
                <Option key={category.id} value={category.id}>
                  <span style={{ marginRight: 8 }}>{category.icon}</span>
                  {category.name}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="amount"
            label="预算金额"
            rules={[{ required: true, message: '请输入预算金额' }]}
          >
            <InputNumber
              style={{ width: '100%' }}
              placeholder="请输入预算金额"
              precision={2}
              min={0.01}
            />
          </Form.Item>

          <Form.Item
            name="period"
            label="预算周期"
            rules={[{ required: true, message: '请选择预算周期' }]}
          >
            <Select placeholder="请选择预算周期" onChange={() => {
              form.setFieldValue('month', undefined)
              form.setFieldValue('quarter', undefined)
            }}>
              <Option value="monthly">月度</Option>
              <Option value="quarterly">季度</Option>
              <Option value="yearly">年度</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="year"
            label="年份"
            rules={[{ required: true, message: '请选择年份' }]}
          >
            <InputNumber style={{ width: '100%' }} min={2020} max={2030} />
          </Form.Item>

          <Form.Item
            shouldUpdate={(prevValues, currentValues) => prevValues.period !== currentValues.period}
            noStyle
          >
            {({ getFieldValue }) => {
              const period = getFieldValue('period')
              if (period === 'monthly') {
                return (
                  <Form.Item
                    name="month"
                    label="月份"
                    rules={[{ required: true, message: '请选择月份' }]}
                  >
                    <Select placeholder="请选择月份">
                      {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                        <Option key={m} value={m}>{m}月</Option>
                      ))}
                    </Select>
                  </Form.Item>
                )
              }
              if (period === 'quarterly') {
                return (
                  <Form.Item
                    name="quarter"
                    label="季度"
                    rules={[{ required: true, message: '请选择季度' }]}
                  >
                    <Select placeholder="请选择季度">
                      <Option value={1}>Q1</Option>
                      <Option value={2}>Q2</Option>
                      <Option value={3}>Q3</Option>
                      <Option value={4}>Q4</Option>
                    </Select>
                  </Form.Item>
                )
              }
              return null
            }}
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default Budgets
