/**
 * BrainstormOrchestrator - AI专家团会议主持人
 * 负责：
 * 1. 控制讨论流程和轮次
 * 2. 评估讨论质量，决定是否继续
 * 3. 识别问题，引导解决方向
 * 4. 最终总结和决策
 */

import { loggerService } from '@logger'
import type { Model, Provider } from '@renderer/types'

import type { AgentRole, BrainstormSession, DiscussionMessage } from '../types'
import { generateId } from '../utils/idGenerator'
import { streamAI } from './AiService'

const logger = loggerService.withContext('BrainstormOrchestrator')

export interface OrchestratorOptions {
  onMessage?: (message: DiscussionMessage) => void
  onRoundComplete?: (round: number, assessment: RoundAssessment) => void
  onFinalDecision?: (decision: FinalDecision) => void
  onPhaseChange?: (phase: DiscussionPhase) => void
  onError?: (error: Error) => void
  onMessageChunk?: (messageId: string, chunk: string) => void
}

export type DiscussionPhase = 'research' | 'discussion' | 'evaluation' | 'conclusion'

// 轮次评估结果
export interface RoundAssessment {
  round: number
  problemIdentified: string
  solutionProposed: string
  isProblemSolved: boolean
  confidence: number // 0-100
  shouldContinue: boolean
  reason: string
  nextFocus?: string
}

// 最终决策
export interface FinalDecision {
  problem: string
  solution: string
  implementation: string
  risks: string[]
  actionItems: ActionItem[]
  summary: string
}

export interface ActionItem {
  task: string
  owner: string
  priority: 'high' | 'medium' | 'low'
}

// 讨论上下文
interface DiscussionContext {
  allMessages: DiscussionMessage[]
  currentRound: number
  roundMessages: DiscussionMessage[]
  previousRoundsSummary: string[]
}

export class BrainstormOrchestrator {
  private session: BrainstormSession
  private options: OrchestratorOptions
  private abortController: AbortController | null = null
  private isRunning = false
  private model: Model
  private provider: Provider
  private _currentPhase: DiscussionPhase = 'research'
  private currentRound = 0
  private maxRounds = 5
  private context: DiscussionContext

  get currentPhase(): DiscussionPhase {
    return this._currentPhase
  }

  set currentPhase(phase: DiscussionPhase) {
    this._currentPhase = phase
  }

  constructor(session: BrainstormSession, model: Model, provider: Provider, options: OrchestratorOptions = {}) {
    this.session = session
    this.model = model
    this.provider = provider
    this.options = options
    this.context = {
      allMessages: [],
      currentRound: 0,
      roundMessages: [],
      previousRoundsSummary: []
    }
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
    this.currentRound = 0
    this.context = {
      allMessages: [],
      currentRound: 0,
      roundMessages: [],
      previousRoundsSummary: []
    }

    try {
      // 阶段1: 研究阶段 - 产品经理调研
      await this.runResearchPhase()

      if (!this.isRunning || this.abortController?.signal.aborted) return

      // 阶段2: 多轮讨论
      let shouldContinue = true
      while (shouldContinue && this.currentRound < this.maxRounds) {
        this.currentRound++
        this.context.currentRound = this.currentRound
        this.context.roundMessages = []

        await this.runDiscussionRound()

        if (!this.isRunning || this.abortController?.signal.aborted) return

        // 主持人评估本轮讨论
        const assessment = await this.evaluateRound()
        this.options.onRoundComplete?.(this.currentRound, assessment)

        shouldContinue = assessment.shouldContinue

        if (shouldContinue && this.currentRound < this.maxRounds) {
          // 保存本轮摘要
          this.context.previousRoundsSummary.push(
            `第${this.currentRound}轮：${assessment.problemIdentified} -> ${assessment.solutionProposed}`
          )
        }
      }

      if (!this.isRunning || this.abortController?.signal.aborted) return

      // 阶段3: 最终总结
      await this.runConclusion()
    } catch (error) {
      logger.error('Discussion error:', error as Error)
      this.options.onError?.(error as Error)
    } finally {
      this.isRunning = false
    }
  }

  /**
   * 停止讨论
   */
  stop(): void {
    this.isRunning = false
    this.abortController?.abort()
  }

  /**
   * 阶段1: 研究阶段
   * 产品经理先进行调研，提出具体的产品建议
   */
  private async runResearchPhase(): Promise<void> {
    const phase: DiscussionPhase = 'research'
    this.currentPhase = phase
    this.options.onPhaseChange?.(phase)
    logger.info('Starting research phase')

    const productManager = this.session.roles.find((r) => r.name.includes('产品经理'))
    if (!productManager) {
      logger.warn('No product manager found, skipping research phase')
      return
    }

    const messageId = generateId()

    const prompt = `【研究阶段】

你是${productManager.name}。

用户提出了一个需求："${this.session.problem}"

你的任务是进行深度调研，输出具体的产品方案：

1️⃣ **需求分析**：
   - 用户真正的痛点是什么？
   - 目标用户群体是谁？
   - 市场上有哪些类似产品？

2️⃣ **产品定位**：
   - 给这个产品起一个具体的名称
   - 产品的核心卖点是什么？
   - 与竞品的差异化在哪里？

3️⃣ **功能规划**：
   - MVP版本必须包含哪些功能？（列出3-5个核心功能）
   - 每个功能要解决什么具体问题？

4️⃣ **初步方案**：
   - 产品形态（小程序/App/网页）
   - 核心交互流程
   - 商业模式（如果有）

⚠️ **重要**：
- 不要只说"需要调研"，直接给出你的专业判断
- 产品名称要具体，不要叫"XX平台"
- 功能描述要具体，不要"优化用户体验"这种空话
- 基于你的专业知识，给出合理的假设和数据`

    const message: DiscussionMessage = {
      id: messageId,
      roleId: productManager.id,
      roleName: productManager.name,
      roleColor: productManager.color,
      content: '',
      timestamp: Date.now(),
      type: 'analysis'
    }

    this.session.messages.push(message)
    this.context.allMessages.push(message)
    this.options.onMessage?.(message)

    let fullContent = ''
    await streamAI({
      model: this.model,
      provider: this.provider,
      systemPrompt: this.buildRoleSystemPrompt(productManager),
      userPrompt: prompt,
      temperature: 0.8,
      maxTokens: 2000,
      onChunk: (chunk) => {
        fullContent += chunk
        this.options.onMessageChunk?.(messageId, chunk)
      }
    })

    message.content = fullContent.trim()
    this.context.roundMessages.push(message)
  }

  /**
   * 执行一轮讨论
   * 每个角色基于之前的讨论发表意见
   */
  private async runDiscussionRound(): Promise<void> {
    const phase: DiscussionPhase = 'discussion'
    this.currentPhase = phase
    this.options.onPhaseChange?.(phase)
    logger.info(`Starting discussion round ${this.currentRound}`)

    // 获取非产品经理的专家角色
    const experts = this.session.roles.filter((r) => !r.name.includes('产品经理') && !r.isDecisionMaker)

    for (const expert of experts) {
      if (!this.isRunning || this.abortController?.signal.aborted) break

      await this.runExpertDiscussion(expert)
      await this.delay(500)
    }
  }

  /**
   * 单个专家参与讨论
   */
  private async runExpertDiscussion(expert: AgentRole): Promise<void> {
    const messageId = generateId()

    // 构建上下文：之前所有的讨论内容
    const previousDiscussion = this.buildDiscussionContext()

    const prompt = `【第${this.currentRound}轮讨论】

你是${expert.name}。

原始需求："${this.session.problem}"

${previousDiscussion}

【你的任务】
基于以上讨论，从${expert.name}的角度发表你的专业意见：

1️⃣ **对之前观点的评价**：
   - 你同意哪些观点？为什么？
   - 你不同意哪些观点？为什么？
   - 有哪些被忽视的问题？

2️⃣ **你的专业建议**：
   - 针对当前方案，你有什么改进建议？
   - 从${expert.name}的角度，还需要考虑什么？
   - 给出具体的、可操作的建议

3️⃣ **风险评估**：
   - 按照当前方向推进，可能会遇到什么坑？
   - 有什么预防措施？

⚠️ **重要**：
- 必须先回应之前的讨论，不能自说自话
- 给出具体建议，不要抽象概念
- 如果你认为方向错了，直接指出来`

    const message: DiscussionMessage = {
      id: messageId,
      roleId: expert.id,
      roleName: expert.name,
      roleColor: expert.color,
      content: '',
      timestamp: Date.now(),
      type: 'suggestion'
    }

    this.session.messages.push(message)
    this.context.allMessages.push(message)
    this.context.roundMessages.push(message)
    this.options.onMessage?.(message)

    let fullContent = ''
    await streamAI({
      model: this.model,
      provider: this.provider,
      systemPrompt: this.buildRoleSystemPrompt(expert),
      userPrompt: prompt,
      temperature: 0.7,
      maxTokens: 1500,
      onChunk: (chunk) => {
        fullContent += chunk
        this.options.onMessageChunk?.(messageId, chunk)
      }
    })

    message.content = fullContent.trim()
  }

  /**
   * 主持人评估本轮讨论
   */
  private async evaluateRound(): Promise<RoundAssessment> {
    const phase: DiscussionPhase = 'evaluation'
    this.currentPhase = phase
    this.options.onPhaseChange?.(phase)
    logger.info(`Evaluating round ${this.currentRound}`)

    const roundContent = this.context.roundMessages.map((m) => `${m.roleName}: ${m.content}`).join('\n\n')

    const prompt = `【主持人评估】

你是本次会议的主持人，负责把控讨论质量。

原始需求："${this.session.problem}"

${this.currentRound === 1 ? '产品经理的初步方案：' : `前${this.currentRound - 1}轮讨论摘要：\n${this.context.previousRoundsSummary.join('\n')}`}

本轮讨论内容：
${roundContent}

【你的评估任务】

1️⃣ **问题识别**：
   - 经过本轮讨论，核心问题是什么？
   - 问题是否已经被充分理解？

2️⃣ **方案评估**：
   - 目前提出的解决方案是什么？
   - 这个方案是否可行？

3️⃣ **解决程度**：
   - 问题是否已经得到解决？（是/否）
   - 你的信心度是多少？（0-100%）

4️⃣ **决策**：
   - 是否需要继续讨论？（是/否）
   - 如果继续，下一轮应该聚焦什么问题？
   - 如果结束，为什么？

请输出JSON格式：
{
  "problemIdentified": "识别出的核心问题",
  "solutionProposed": "当前提出的解决方案",
  "isProblemSolved": true/false,
  "confidence": 85,
  "shouldContinue": true/false,
  "reason": "详细的评估理由",
  "nextFocus": "下一轮聚焦的问题（如果需要继续）"
}`

    try {
      const result = await streamAI({
        model: this.model,
        provider: this.provider,
        systemPrompt: `你是专家团会议的主持人，经验丰富，善于把控讨论方向。

你的职责：
1. 确保讨论不跑题
2. 识别真正的问题
3. 判断问题是否已解决
4. 决定是否需要继续讨论

风格：
- 客观理性
- 直击要害
- 不废话`,
        userPrompt: prompt,
        temperature: 0.5,
        maxTokens: 1500
      })

      const jsonMatch = result.content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        return {
          round: this.currentRound,
          problemIdentified: parsed.problemIdentified || '',
          solutionProposed: parsed.solutionProposed || '',
          isProblemSolved: parsed.isProblemSolved || false,
          confidence: parsed.confidence || 0,
          shouldContinue: parsed.shouldContinue || false,
          reason: parsed.reason || '',
          nextFocus: parsed.nextFocus
        }
      }
    } catch (error) {
      logger.error('Error evaluating round:', error as Error)
    }

    // 默认继续讨论
    return {
      round: this.currentRound,
      problemIdentified: '',
      solutionProposed: '',
      isProblemSolved: false,
      confidence: 50,
      shouldContinue: this.currentRound < this.maxRounds,
      reason: '评估失败，默认继续',
      nextFocus: '深入讨论解决方案'
    }
  }

  /**
   * 最终总结阶段
   */
  private async runConclusion(): Promise<void> {
    const phase: DiscussionPhase = 'conclusion'
    this.currentPhase = phase
    this.options.onPhaseChange?.(phase)
    logger.info('Running conclusion phase')

    const decisionMaker = this.session.roles.find((r) => r.isDecisionMaker)
    if (!decisionMaker) {
      logger.warn('No decision maker found')
      return
    }

    const allDiscussion = this.context.allMessages.map((m) => `${m.roleName}: ${m.content}`).join('\n\n')

    const prompt = `【最终总结】

你是${decisionMaker.name}，需要基于所有讨论给出最终方案。

原始需求："${this.session.problem}"

完整讨论记录：
${allDiscussion}

【你的任务】
输出最终的执行方案：

1️⃣ **问题定义**：
   - 经过讨论，我们最终要解决什么问题？

2️⃣ **解决方案**：
   - 最终的解决方案是什么？
   - 为什么选择这个方案？

3️⃣ **实施计划**：
   - 第一步做什么？
   - 第二步做什么？
   - 每一步的负责人建议

4️⃣ **风险与应对**：
   - 可能遇到的风险
   - 应对措施

请输出JSON格式：
{
  "problem": "最终确定的问题",
  "solution": "解决方案描述",
  "implementation": "实施步骤",
  "risks": ["风险1", "风险2"],
  "actionItems": [
    {"task": "具体任务", "owner": "建议负责人", "priority": "high/medium/low"}
  ],
  "summary": "总体总结"
}`

    const messageId = generateId()
    const message: DiscussionMessage = {
      id: messageId,
      roleId: decisionMaker.id,
      roleName: decisionMaker.name,
      roleColor: decisionMaker.color,
      content: '',
      timestamp: Date.now(),
      type: 'decision'
    }

    this.session.messages.push(message)
    this.options.onMessage?.(message)

    try {
      let fullContent = ''
      await streamAI({
        model: this.model,
        provider: this.provider,
        systemPrompt: this.buildRoleSystemPrompt(decisionMaker),
        userPrompt: prompt,
        temperature: 0.5,
        maxTokens: 2000,
        onChunk: (chunk) => {
          fullContent += chunk
          this.options.onMessageChunk?.(messageId, chunk)
        }
      })

      message.content = fullContent.trim()

      // 解析最终决策
      const decision = this.parseFinalDecision(fullContent)
      this.options.onFinalDecision?.(decision)
    } catch (error) {
      logger.error('Error in conclusion:', error as Error)
    }
  }

  /**
   * 构建讨论上下文
   */
  private buildDiscussionContext(): string {
    const parts: string[] = []

    // 添加之前的轮次摘要
    if (this.context.previousRoundsSummary.length > 0) {
      parts.push('【之前讨论的进展】')
      parts.push(this.context.previousRoundsSummary.join('\n'))
      parts.push('')
    }

    // 添加本轮已发表的讨论
    if (this.context.roundMessages.length > 0) {
      parts.push('【本轮已发表的讨论】')
      this.context.roundMessages.forEach((m) => {
        parts.push(`${m.roleName}：${m.content.substring(0, 500)}...`)
      })
      parts.push('')
    }

    return parts.join('\n')
  }

  /**
   * 构建角色系统提示词
   */
  private buildRoleSystemPrompt(role: AgentRole): string {
    return `你是${role.name}。

${role.systemPrompt}

【强制规则】
1. 直接给出具体观点，不要铺垫
2. 每个建议都要可操作，不能是抽象概念
3. 如果不同意别人的观点，明确说为什么
4. 禁止说套话，如"需要综合考虑"、"这是一个好问题"等
5. 用第一人称"我"表达，像真人一样自然`
  }

  /**
   * 解析最终决策
   */
  private parseFinalDecision(content: string): FinalDecision {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        return {
          problem: parsed.problem || '',
          solution: parsed.solution || '',
          implementation: parsed.implementation || '',
          risks: parsed.risks || [],
          actionItems: parsed.actionItems || [],
          summary: parsed.summary || ''
        }
      }
    } catch (error) {
      logger.error('Error parsing final decision:', error as Error)
    }

    return {
      problem: '',
      solution: content,
      implementation: '',
      risks: [],
      actionItems: [],
      summary: ''
    }
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
