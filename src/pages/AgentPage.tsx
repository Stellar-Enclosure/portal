import { ArrowRightOutlined, RobotOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Result, Space, Tag, Typography } from 'antd'
import { standaloneEntry } from '../manifest/loader'
import type { PlatformKey } from '../manifest/types'
import { useOptionalWorkbenchNavigation } from '../app/workbench/WorkbenchTabs'

export interface AgentDeepLinkSpec {
  readonly id: string
  readonly platformKey: PlatformKey
  readonly title: string
  readonly description: string
  readonly canonicalUrl: string
  readonly expectedPattern: string
}

export const AGENT_DEEP_LINKS: readonly AgentDeepLinkSpec[] = [
  {
    id: 'agent.task.configs',
    platformKey: 'tianshu',
    title: '配置发布',
    description: '查看并编辑配置发布任务与版本快照',
    canonicalUrl: '/xingyuan/tianshu/publish-tasks',
    expectedPattern: '/publish-tasks',
  },
  {
    id: 'agent.task.apis',
    platformKey: 'yuheng',
    title: 'API 接口',
    description: '检视网关接口目录、路由与限流策略',
    canonicalUrl: '/xingyuan/yuheng/interface-catalog',
    expectedPattern: '/interface-catalog',
  },
  {
    id: 'agent.task.roles',
    platformKey: 'tianquan-jianshen',
    title: '角色权限',
    description: '管理角色图谱、授权约束与权限清单',
    canonicalUrl: '/xingyuan/tianquan-jianshen/iam/roles',
    expectedPattern: '/iam/roles',
  },
] as const

export interface AgentPageProps {
  readonly hasSession?: boolean
}

export const AgentPage = ({ hasSession = false }: AgentPageProps) => {
  const workbench = useOptionalWorkbenchNavigation()

  return (
    <div className="portal-agent-page" data-testid="agent-page">
      <Card
        size="small"
        title={(
          <Space size={8}>
            <RobotOutlined />
            <span>星垣 Agent 助手</span>
          </Space>
        )}
        extra={<Typography.Text type="secondary">固定入口 · 保留业务工作页签</Typography.Text>}
      >
        <div className="portal-agent-tasks">
          {AGENT_DEEP_LINKS.map((task) => {
            const catalog = workbench?.catalogs[task.platformKey]
            const bindingConfigured = Boolean(standaloneEntry(task.platformKey))
            const deniedByCatalog =
              catalog?.status === 'denied'
              || catalog?.status === 'failed'
              || (catalog?.status === 'ready'
                && !catalog.pages.some((page) => page.pattern === task.expectedPattern))
            const disabledReason = !bindingConfigured
              ? '子应用入口未配置'
              : deniedByCatalog
                ? '当前身份无权访问'
                : undefined

            return (
              <Card key={task.id} size="small" className="portal-agent-task-card">
                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Typography.Text strong>{task.title}</Typography.Text>
                    {disabledReason && <Tag color="warning">{disabledReason}</Tag>}
                  </Space>
                  <Typography.Text type="secondary">{task.description}</Typography.Text>
                  <Button
                    type="link"
                    size="small"
                    disabled={Boolean(disabledReason)}
                    icon={<ArrowRightOutlined />}
                    onClick={() => workbench?.openUrl(task.canonicalUrl)}
                    style={{ paddingInline: 0 }}
                  >
                    {`进入${task.title}`}
                  </Button>
                </Space>
              </Card>
            )
          })}
        </div>
      </Card>

      {!hasSession ? (
        <Result
          status="info"
          title="登录后可使用星垣知识助手"
          subTitle="瑶光知识库权限将在当前会话验证后挂载，Portal 不缓存知识内容。"
        />
      ) : !standaloneEntry('yaoguang') ? (
        <Alert
          type="warning"
          showIcon
          title="瑶光知识助手未配置子应用入口，业务快捷任务仍可正常使用。"
        />
      ) : null}
    </div>
  )
}
