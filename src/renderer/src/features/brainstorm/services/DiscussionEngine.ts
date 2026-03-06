/**
 * DiscussionEngine - AI专家团会议系统
 * 基于 CrewAI 架构：主控Agent + 专家Agent + 质疑Agent + 决策Agent
 * 流程：发散阶段 → 碰撞阶段 → 收敛阶段
 */

import { loggerService } from '@logger'
import type { Model, Provider } from '@renderer/types'

import type { AgentRole, BrainstormSession, DiscussionMessage, DiscussionStatus } from '../types'
import { generateId } from '../utils/idGenerator'
import { streamAI } from './AiService'

const logger = loggerService.withContext('DiscussionEngine')

export interface DiscussionEngineOptions {
  onMessage?: (message: DiscussionMessage) => void
  onStatusChange?: (status: DiscussionStatus) => void
  onDecision?: (decision: DecisionReport) => void
  onPhaseChange?: (phase: DiscussionPhase) => void
  onError?: (error: Error) => void
  onMessageChunk?: (messageId: string, chunk: string) => void
}

// 讨论阶段
export type DiscussionPhase = 'divergence' | 'collision' | 'convergence' | 'completed'

// 决策报告
export interface DecisionReport {
  expertEvaluations: ExpertEvaluation[]
  finalDecision: string
  selectedOption: string
  alternativeOptions: string[]
  rejectedReasons: string
  riskAssessment: RiskItem[]
  actionItems: ActionItem[]
  reasoning: string
}

export interface ExpertEvaluation {
  expertName: string
  score: number
  comment: string
}

export interface RiskItem {
  description: string
  severity: 'high' | 'medium' | 'low'
  mitigation: string
}

export interface ActionItem {
  task: string
  owner: string
  deadline: string
  priority: 'high' | 'medium' | 'low'
}

// 观点结构
interface Viewpoint {
  roleId: string
  roleName: string
  content: string
  keyPoints: string[]
}

export class DiscussionEngine {
  private session: BrainstormSession
  private options: DiscussionEngineOptions
  private abortController: AbortController | null = null
  private isRunning = false
  private model: Model
  private provider: Provider
  private viewpoints: Viewpoint[] = []
  private internalMessages: DiscussionMessage[] = []

  constructor(session: BrainstormSession, model: Model, provider: Provider, options: DiscussionEngineOptions = {}) {
    this.session = session
    this.model = model
    this.provider = provider
    this.options = options
    this.internalMessages = [...session.messages]
  }

  /**
   * 开始专家团会议
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Discussion is already running')
      return
    }

    this.isRunning = true
    this.abortController = new AbortController()
    this.viewpoints = []

    try {
      this.options.onStatusChange?.('discussing')

      // 阶段1: 发散阶段 - 专家独立输出观点
      await this.runDivergencePhase()

      if (!this.isRunning || this.abortController?.signal.aborted) return

      // 阶段2: 碰撞阶段 - 质疑与辩论（如果检测到分歧）
      const hasDisagreement = await this.detectDisagreement()
      if (hasDisagreement) {
        await this.runCollisionPhase()
      }

      if (!this.isRunning || this.abortController?.signal.aborted) return

      // 阶段3: 收敛阶段 - 决策
      await this.runConvergencePhase()
    } catch (error) {
      logger.error('Discussion error:', error as Error)
      this.options.onError?.(error as Error)
    } finally {
      this.isRunning = false
    }
  }

  /**
   * 暂停讨论
   */
  pause(): void {
    this.isRunning = false
    this.options.onStatusChange?.('paused')
  }

  /**
   * 停止讨论
   */
  stop(): void {
    this.isRunning = false
    this.abortController?.abort()
    this.options.onStatusChange?.('idle')
  }

  /**
   * 阶段1: 发散阶段 - 头脑风暴
   * 专家独立输出观点，不互相干扰
   */
  private async runDivergencePhase(): Promise<void> {
    this.options.onPhaseChange?.('divergence')

    logger.info('Starting divergence phase')

    const experts = this.getExpertRoles()

    for (const expert of experts) {
      if (!this.isRunning || this.abortController?.signal.aborted) break

      const viewpoint = await this.collectViewpoint(expert)
      if (viewpoint) {
        this.viewpoints.push(viewpoint)
      }

      await this.delay(500)
    }
  }

  /**
   * 收集单个专家的观点
   */
  private async collectViewpoint(expert: AgentRole): Promise<Viewpoint | null> {
    const messageId = generateId()

    // 分析问题复杂度，如果问题太简单，自动扩展
    const problemAnalysis = this.analyzeProblemComplexity(this.session.problem)

    // 创建消息对象
    const msg: DiscussionMessage = {
      id: messageId,
      roleId: expert.id,
      roleName: expert.name,
      roleColor: expert.color,
      content: '',
      timestamp: Date.now(),
      type: 'analysis'
    }

    const prompt = `【发散阶段 - 头脑风暴】

你是${expert.name}。

【核心问题】
${this.session.problem}

${problemAnalysis}

【你的任务】
作为${expert.name}，请针对上述问题，输出你的专业分析。

⚠️ **强制规则（违反任何一条，你的回答将被视为无效）**：
1. **绝对禁止**说以下套话："这是一个很好的问题"、"需要综合考虑"、"建议制定计划"、"从XX角度出发"、"我认为需要平衡"
2. **必须直接给出具体观点**，不要任何铺垫和过渡
3. **每个观点都要有具体内容**，不能是抽象概念
4. **用第一人称"我"表达**，像真人专家一样自然说话
5. **如果发现自己在说废话，立即停止并重新思考**

请按以下结构输出：

**我对这个问题的理解**：
（用1-2句话直接点明问题本质，不要说"这个问题涉及多个方面"这类废话）

**我的专业建议**：
（直接给出具体方案，包括：
- 具体做什么（不是"需要优化"而是"增加XX功能"）
- 怎么做（步骤123）
- 为什么这样做（数据或经验支撑））

**关键风险点**：
（直接指出可能哪里会失败，不要说"需要注意风险"）`

    try {
      this.options.onMessage?.(msg)
      this.internalMessages.push(msg)

      // 流式调用
      let fullContent = ''
      await streamAI({
        model: this.model,
        provider: this.provider,
        systemPrompt: this.buildExpertSystemPrompt(expert),
        userPrompt: prompt,
        temperature: 0.8,
        maxTokens: 1500,
        abortController: this.abortController || undefined,
        onChunk: (chunk) => {
          fullContent += chunk
          this.options.onMessageChunk?.(messageId, chunk)
        }
      })

      // 更新内部消息的内容，以便后续 Prompt 使用
      msg.content = fullContent.trim()
      const keyPoints = await this.extractKeyPoints(fullContent)

      return {
        roleId: expert.id,
        roleName: expert.name,
        content: fullContent,
        keyPoints
      }
    } catch (error) {
      logger.error(`Error collecting viewpoint from ${expert.name}:`, error as Error)
      this.options.onMessageChunk?.(
        messageId,
        `❌ **讨论出错**\n\n${(error as Error).message}\n\n请检查模型配置或 API Key 是否正确。`
      )
      return null
    }
  }

  /**
   * 检测是否存在分歧（智能辩论触发）
   */
  private async detectDisagreement(): Promise<boolean> {
    if (this.viewpoints.length < 2) return false

    logger.info('Detecting disagreement among viewpoints')

    const prompt = `【分歧检测】

【核心问题】
${this.session.problem}

【各专家观点摘要】
${this.viewpoints.map((v, i) => `${i + 1}. ${v.roleName}: ${v.content.substring(0, 200)}...`).join('\n')}

【任务】
分析以上观点，判断：
1. 专家们是否存在实质性分歧？（是/否）
2. 分歧的主要焦点是什么？
3. 分歧的严重程度（1-10分）

请只输出JSON格式：
{
  "hasDisagreement": true/false,
  "focus": "分歧焦点描述",
  "severity": 7
}`

    try {
      const result = await streamAI({
        model: this.model,
        provider: this.provider,
        systemPrompt: '你是一个客观的分析助手，只输出JSON格式的分析结果。',
        userPrompt: prompt,
        temperature: 0.3,
        maxTokens: 500,
        abortController: this.abortController || undefined
      })

      const analysis = JSON.parse(result.content)
      logger.info('Disagreement detection result:', analysis)

      // 严重度>=5或明确有分歧才进入辩论阶段
      return analysis.hasDisagreement || analysis.severity >= 5
    } catch (error) {
      logger.error('Error detecting disagreement:', error as Error)
      // 出错时默认进入辩论阶段，确保充分讨论
      return true
    }
  }

  /**
   * 阶段2: 碰撞阶段 - 辩论与质疑
   */
  private async runCollisionPhase(): Promise<void> {
    this.options.onPhaseChange?.('collision')

    logger.info('Starting collision phase')

    // 获取质疑者和专家
    const skeptic = this.getSkepticRole()
    const experts = this.getExpertRoles()

    // 质疑者提出质疑
    if (skeptic) {
      await this.runSkepticChallenge(skeptic)
    }

    // 专家回应质疑
    for (const expert of experts) {
      if (!this.isRunning || this.abortController?.signal.aborted) break
      await this.runExpertResponse(expert)
    }
  }

  /**
   * 质疑者提出挑战
   */
  private async runSkepticChallenge(skeptic: AgentRole): Promise<void> {
    const messageId = generateId()

    const prompt = `【碰撞阶段 - 深度质疑与压力测试】

你是${skeptic.name}，一个极其冷酷、专业、不留情面的质疑者。你的目标是通过挑刺和极端场景测试，摧毁不切实际的幻想。

【核心问题】
${this.session.problem}

【各专家提出的观点】
${this.viewpoints
  .map(
    (v) => `专家 [${v.roleName}] 的观点：
${v.content}`
  )
  .join('\n\n')}

【你的质疑任务】
你必须针对以上所有观点，进行深度的"压力测试"：

1️⃣ **致命漏洞（Fatal Flaws）**：
   - 指出方案中逻辑不自洽的地方。
   - 哪些假设是盲目乐观的？（例如：假设用户会主动点击、假设开发只需一周）
   - 如果XX环节失败了，整个方案是不是就崩了？

2️⃣ **成本与复杂性陷阱（Complexity Trap）**：
   - 哪些方案虽然听起来美好，但实际执行起来会变成噩梦？
   - 技术实现上是否有过度设计的嫌疑？

3️⃣ **极端场景（Edge Cases）**：
   - 考虑：如果没有网络怎么办？如果用户是老年人怎么办？如果并发量突然暴涨100倍怎么办？

4️⃣ **点名批评**：
   - 必须针对具体专家的具体观点进行反驳，不能泛泛而谈。

【风格要求】
- **言辞犀利**：不要说"我觉得可能有点问题"，要说"这个方案在XX场景下必死无疑"。
- **禁止废话**：不准说"我很欣赏大家的努力"，直接开火。
- **建设性反击**：在摧毁旧方案的同时，逼迫专家们思考更稳健的替代方案。`

    const message: DiscussionMessage = {
      id: messageId,
      roleId: skeptic.id,
      roleName: skeptic.name,
      roleColor: skeptic.color,
      content: '',
      timestamp: Date.now(),
      type: 'question'
    }

    try {
      // 在这里我们不直接 push 到 this.session.messages，而是通过 onMessage 广播
      // 让 context 来处理 state 的一致性
      this.options.onMessage?.(message)
      this.internalMessages.push(message)

      let fullContent = ''
      await streamAI({
        model: this.model,
        provider: this.provider,
        systemPrompt: this.buildSkepticSystemPrompt(skeptic),
        userPrompt: prompt,
        temperature: 0.7,
        maxTokens: 1500,
        abortController: this.abortController || undefined,
        onChunk: (chunk) => {
          fullContent += chunk
          this.options.onMessageChunk?.(messageId, chunk)
        }
      })

      message.content = fullContent.trim()
    } catch (error) {
      logger.error(`Error in skeptic challenge:`, error as Error)
      this.options.onMessageChunk?.(messageId, `❌ **质疑过程出错**\n\n${(error as Error).message}`)
    }
  }

  /**
   * 专家回应质疑
   */
  private async runExpertResponse(expert: AgentRole): Promise<void> {
    const messageId = generateId()

    // 获取该专家之前的观点
    const myViewpoint = this.viewpoints.find((v) => v.roleId === expert.id)
    if (!myViewpoint) return

    // 获取质疑内容 (从最新的消息中找 question 类型的)
    // 注意：使用 internalMessages 而不是 this.session.messages
    const challengeMessage = this.internalMessages.filter((m) => m.type === 'question').pop()

    if (!challengeMessage) return

    const prompt = `【碰撞阶段 - 方案保卫战】

你是${expert.name}。

你刚受到了针对你方案的严厉质疑。你必须证明你的专业性：要么保卫你的观点，要么勇敢承认不足并给出优化后的方案。

【你的原方案】
${myViewpoint.content}

【受到的质疑】
${challengeMessage.content}

【你的任务】
针对刚才的质疑，给出专业、冷静、有说服力的反击或修正：

1️⃣ **直接回应质疑（Counter-arguments）**：
   - 对方指出的"逻辑漏洞"是否存在？如果不存在，说明理由；如果存在，你的补救措施是什么？
   - 对方提到的"极端场景"，你的方案如何应对？

2️⃣ **方案强化（Reinforcement）**：
   - 如果对方的质疑有道理，你必须立即修改方案并补充细节。
   - 提供具体的技术参数、数据参考或实际案例。

3️⃣ **向对方发问（Turn the tables）**：
   - 如果你觉得质疑者太片面，反过来指出他在某些实际场景下的经验盲区。

【风格要求】
- **专业且自信**：不要道歉，直接用逻辑说话。
- **事实胜于雄辩**：多用具体的细节来回应对方。
- **禁止套话**：严禁说"感谢质疑"、"我会考虑"。`

    const message: DiscussionMessage = {
      id: messageId,
      roleId: expert.id,
      roleName: expert.name,
      roleColor: expert.color,
      content: '',
      timestamp: Date.now(),
      type: 'suggestion'
    }

    try {
      this.options.onMessage?.(message)
      this.internalMessages.push(message)

      let fullContent = ''
      await streamAI({
        model: this.model,
        provider: this.provider,
        systemPrompt: this.buildExpertSystemPrompt(expert),
        userPrompt: prompt,
        temperature: 0.7,
        maxTokens: 1500,
        abortController: this.abortController || undefined,
        onChunk: (chunk) => {
          fullContent += chunk
          this.options.onMessageChunk?.(messageId, chunk)
        }
      })

      message.content = fullContent.trim()
    } catch (error) {
      logger.error(`Error in expert response:`, error as Error)
      this.options.onMessageChunk?.(messageId, `❌ **回应过程出错**\n\n${(error as Error).message}`)
    }
  }

  /**
   * 阶段3: 收敛阶段 - 决策
   */
  private async runConvergencePhase(): Promise<void> {
    this.options.onPhaseChange?.('convergence')

    logger.info('Starting convergence phase')

    const decisionMaker = this.getDecisionMaker()
    if (!decisionMaker) {
      logger.warn('No decision maker found')
      return
    }

    const messageId = generateId()

    // 提取各专家的核心观点
    // 注意：使用 internalMessages 而不是 this.session.messages
    const expertMessages = this.internalMessages.filter((m) => m.type === 'analysis' || m.type === 'suggestion')
    const expertViewpoints = expertMessages.map((m) => ({
      name: m.roleName,
      summary: m.content.substring(0, 300)
    }))

    const prompt = `【收敛阶段 - 最终决策】

你是${decisionMaker.name}，需要综合所有讨论，做出最终决策。

【核心问题】
${this.session.problem}

【各专家核心观点】
${expertViewpoints.map((v, i) => `${i + 1}. ${v.name}：${v.summary}...`).join('\n')}

【完整讨论记录】
${this.internalMessages.map((m) => `${m.roleName} (${m.type}): ${m.content.substring(0, 200)}...`).join('\n\n')}

【你的任务】
作为决策者，你必须：

⚠️ **强制规则（违反任何一条，决策无效）**：
1. **必须引用具体专家的观点**，不能说"综合各方意见"这类空话
2. **必须明确说行还是不行**，不能模棱两可
3. **必须给出具体的执行方案**，不是"需要优化"而是"做XX事"
4. **必须评估每个专家的观点并给出评分**（1-10分）及理由
5. **如果发现讨论不充分，明确指出并说明需要什么信息**

请按以下格式输出JSON：
{
  "expertEvaluations": [
    {"expertName": "专家名", "score": 8, "comment": "观点有价值，但忽略了XX方面"}
  ],
  "finalDecision": "用1-2句话明确说出决定做什么",
  "selectedOption": "选择的具体方案名称",
  "alternativeOptions": ["被放弃的方案1", "被放弃的方案2"],
  "rejectedReasons": "为什么放弃其他方案，引用专家观点",
  "riskAssessment": [
    {"description": "具体风险描述", "severity": "high/medium/low", "mitigation": "具体应对措施"}
  ],
  "actionItems": [
    {"task": "具体任务", "owner": "建议负责人", "deadline": "具体时间", "priority": "high/medium/low"}
  ],
  "reasoning": "决策逻辑：引用专家A的观点...，考虑到...，因此决定..."
}`

    const message: DiscussionMessage = {
      id: messageId,
      roleId: decisionMaker.id,
      roleName: decisionMaker.name,
      roleColor: decisionMaker.color,
      content: '',
      timestamp: Date.now(),
      type: 'decision'
    }

    this.options.onMessage?.(message)
    this.internalMessages.push(message)

    try {
      let fullContent = ''
      await streamAI({
        model: this.model,
        provider: this.provider,
        systemPrompt: this.buildDecisionMakerSystemPrompt(decisionMaker),
        userPrompt: prompt,
        temperature: 0.5,
        maxTokens: 2500,
        abortController: this.abortController || undefined,
        onChunk: (chunk) => {
          fullContent += chunk
          this.options.onMessageChunk?.(messageId, chunk)
        }
      })

      message.content = fullContent.trim()

      // 解析决策报告
      const report = this.parseDecisionReport(fullContent)

      this.options.onPhaseChange?.('completed')
      this.options.onDecision?.(report)
      this.options.onStatusChange?.('decided')
    } catch (error) {
      logger.error('Error in convergence phase:', error as Error)
      this.options.onError?.(error as Error)
    }
  }

  /**
   * 解析决策报告
   */
  private parseDecisionReport(content: string): DecisionReport {
    try {
      // 尝试提取JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        return {
          expertEvaluations: parsed.expertEvaluations || [],
          finalDecision: parsed.finalDecision || content,
          selectedOption: parsed.selectedOption || '',
          alternativeOptions: parsed.alternativeOptions || [],
          rejectedReasons: parsed.rejectedReasons || '',
          riskAssessment: parsed.riskAssessment || [],
          actionItems: parsed.actionItems || [],
          reasoning: parsed.reasoning || ''
        }
      }
    } catch (error) {
      logger.error('Error parsing decision report:', error as Error)
    }

    // 解析失败时返回原始内容
    return {
      expertEvaluations: [],
      finalDecision: content,
      selectedOption: '',
      alternativeOptions: [],
      rejectedReasons: '',
      riskAssessment: [],
      actionItems: [],
      reasoning: ''
    }
  }

  /**
   * 提取关键论点
   */
  private async extractKeyPoints(content: string): Promise<string[]> {
    const prompt = `从以下观点中提取3-5个关键论点：

${content.substring(0, 1000)}

只输出论点列表，每行一个，不要编号。`

    try {
      const result = await streamAI({
        model: this.model,
        provider: this.provider,
        systemPrompt: '你是一个提取关键信息的助手，只输出简洁的论点列表。',
        userPrompt: prompt,
        temperature: 0.3,
        maxTokens: 300,
        abortController: this.abortController || undefined
      })

      return result.content.split('\n').filter((line) => line.trim().length > 0)
    } catch (error) {
      return []
    }
  }

  /**
   * 构建专家系统提示词
   */
  private buildExpertSystemPrompt(role: AgentRole): string {
    return `你是${role.name}。

${role.systemPrompt}

【强制约束】
1. 只干专家的事，不干其他角色的活
2. 禁止说套话，每个观点都要有具体内容
3. 用第一人称"我"表达，像真人一样自然
4. 直接给出观点，不要铺垫
5. 如果问题不清晰，明确指出`
  }

  /**
   * 构建质疑者系统提示词
   */
  private buildSkepticSystemPrompt(role: AgentRole): string {
    return `你是${role.name}，魔鬼代言人。

你的唯一职责是找漏洞、提风险、反证。

【强制约束】
1. 只质疑，不提出新方案
2. 每个质疑都要有具体依据
3. 直接指出问题，不绕弯子
4. 避免人身攻击，聚焦方案本身
5. 提出建设性的改进建议`
  }

  /**
   * 构建决策者系统提示词
   */
  private buildDecisionMakerSystemPrompt(role: AgentRole): string {
    return `你是${role.name}，最终决策者。

${role.systemPrompt}

【强制约束】
1. 必须基于讨论内容做决策，不能引入新方案
2. 明确说行还是不行，不模棱两可
3. 给出清晰的决策理由，引用具体观点
4. 输出必须结构化，便于执行
5. 如果讨论不充分，明确指出`
  }

  /**
   * 获取专家角色（非决策者、非质疑者）
   */
  private getExpertRoles(): AgentRole[] {
    return this.session.roles
      .filter((r) => !r.isDecisionMaker && !this.isSkeptic(r))
      .sort((a, b) => (a.order || 0) - (b.order || 0))
  }

  /**
   * 获取质疑者角色
   */
  private getSkepticRole(): AgentRole | undefined {
    return this.session.roles.find((r) => this.isSkeptic(r))
  }

  /**
   * 判断是否为质疑者
   */
  private isSkeptic(role: AgentRole): boolean {
    return role.name.includes('质疑') || role.name.includes('魔鬼') || role.name.includes('批评')
  }

  /**
   * 获取决策者
   */
  private getDecisionMaker(): AgentRole | undefined {
    return this.session.roles.find((r) => r.isDecisionMaker)
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, ms)
      this.abortController?.signal.addEventListener('abort', () => {
        clearTimeout(timeout)
        reject(new Error('Aborted'))
      })
    })
  }

  /**
   * 分析问题复杂度，如果问题太简单，自动扩展分析维度
   */
  private analyzeProblemComplexity(problem: string): string {
    const length = problem.length

    // 如果问题已经很详细，不需要扩展
    if (length > 100) {
      return ''
    }

    // 根据问题关键词自动补充分析维度
    const keywords = {
      小程序: ['用户群体', '核心功能', '商业模式', '技术栈'],
      开发: ['技术选型', '开发周期', '团队配置', '维护成本'],
      产品: ['目标用户', '竞品分析', '核心功能', '迭代计划'],
      设计: ['用户体验', '视觉风格', '交互流程', '设计规范'],
      有趣: ['趣味性来源', '用户粘性', '传播机制', '差异化'],
      好玩: ['核心玩法', '用户动机', '社交属性', '留存策略']
    }

    // 检测关键词
    const matchedDimensions: string[] = []
    for (const [keyword, dimensions] of Object.entries(keywords)) {
      if (problem.includes(keyword)) {
        matchedDimensions.push(...dimensions)
      }
    }

    // 去重并限制数量
    const uniqueDimensions = [...new Set(matchedDimensions)].slice(0, 4)

    if (uniqueDimensions.length === 0) {
      // 通用扩展
      return `【问题分析提示】
这个问题描述比较简洁，请从以下维度深入分析：
- 目标受众是谁？他们有什么痛点？
- 核心要解决什么问题？
- 有哪些约束条件（时间、预算、技术）？
- 成功的标准是什么？`
    }

    return `【问题分析提示】
基于"${problem}"，请重点分析以下维度：
${uniqueDimensions.map((d) => `- ${d}`).join('\n')}

请给出具体的、可操作的建议，不要泛泛而谈。`
  }
}
