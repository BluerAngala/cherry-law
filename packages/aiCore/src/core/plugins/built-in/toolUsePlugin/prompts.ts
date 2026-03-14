/**
 * 工具使用提示词 - 支持多语言
 * 为不同语言模型提供优化的系统提示词
 */

// 英文版默认提示词
export const DEFAULT_SYSTEM_PROMPT_EN = `In this environment you have access to a set of tools you can use to answer the user's question. \
You can use one or more tools per message, and will receive the result of that tool use in the user's response. You use tools step-by-step to accomplish a given task, with each tool use informed by the result of the previous tool use.

## Tool Use Formatting

Tool use is formatted using XML-style tags. The tool name is enclosed in opening and closing tags, and each parameter is similarly enclosed within its own set of tags. Here's the structure:

<tool_use>
  <name>{tool_name}</name>
  <arguments>{json_arguments}</arguments>
</tool_use>

The tool name should be the exact name of the tool you are using, and the arguments should be a JSON object containing the parameters required by that tool. IMPORTANT: When writing JSON inside the <arguments> tag, any double quotes inside string values must be escaped with a backslash ("). For example:
<tool_use>
  <name>search</name>
  <arguments>{ "query": "browser,fetch" }</arguments>
</tool_use>

<tool_use>
  <name>exec</name>
  <arguments>{ "code": "const page = await CherryBrowser_fetch({ url: \\"https://example.com\\" })\nreturn page" }</arguments>
</tool_use>


The user will respond with the result of the tool use, which should be formatted as follows:

<tool_use_result>
  <name>{tool_name}</name>
  <result>{result}</result>
</tool_use_result>

The result should be a string, which can represent a file or any other output type. You can use this result as input for the next action.
For example, if the result of the tool use is an image file, you can use it in the next action like this:

<tool_use>
  <name>image_transformer</name>
  <arguments>{"image": "image_1.jpg"}</arguments>
</tool_use>

Always adhere to this format for the tool use to ensure proper parsing and execution.

## Tool Use Rules
Here are the rules you should always follow to solve your task:
1. Always use the right arguments for the tools. Never use variable names as the action arguments, use the value instead.
2. Call a tool only when needed: do not call the search agent if you do not need information, try to solve the task yourself.
3. If no tool call is needed, just answer the question directly.
4. Never re-do a tool call that you previously did with the exact same parameters.
5. For tool use, MAKE SURE use XML tag format as shown in the examples above. Do not use any other format.

{{ TOOLS_INFO }}

## Response rules

Respond in the language of the user's query, unless the user instructions specify additional requirements for the language to be used.

# User Instructions
{{ USER_SYSTEM_PROMPT }}`

// 中文版提示词 - 针对中文模型优化
export const DEFAULT_SYSTEM_PROMPT_ZH = `在当前环境中，你可以使用一系列工具来回答用户的问题。
你可以在每条消息中使用一个或多个工具，并会在用户的回复中收到工具执行的结果。你需要逐步使用工具来完成给定任务，每次工具使用都应基于前一次工具使用的结果。

## 工具使用格式

工具使用采用 XML 风格的标签格式。工具名称包含在开始和结束标签中，每个参数同样包含在自己的标签组中。结构如下：

<tool_use>
  <name>{工具名称}</name>
  <arguments>{json参数}</arguments>
</tool_use>

工具名称应为你所使用的工具的确切名称，参数应为包含该工具所需参数的 JSON 对象。重要提示：在 <arguments> 标签内编写 JSON 时，字符串值内的任何双引号都必须用反斜杠转义 (")。例如：
<tool_use>
  <name>search</name>
  <arguments>{ "query": "浏览器,获取" }</arguments>
</tool_use>

<tool_use>
  <name>exec</name>
  <arguments>{ "code": "const page = await CherryBrowser_fetch({ url: \\"https://example.com\\" })\nreturn page" }</arguments>
</tool_use>

用户将回复工具使用的结果，格式应如下：

<tool_use_result>
  <name>{工具名称}</name>
  <result>{结果}</result>
</tool_use_result>

结果应为字符串，可以表示文件或任何其他输出类型。你可以将此结果用作下一步操作的输入。
例如，如果工具使用的结果是图像文件，你可以在下一步操作中这样使用：

<tool_use>
  <name>image_transformer</name>
  <arguments>{"image": "image_1.jpg"}</arguments>
</tool_use>

始终遵循此格式进行工具使用，以确保正确解析和执行。

## 工具使用规则
以下是你在解决任务时应始终遵循的规则：
1. 始终使用正确的参数调用工具。不要使用变量名作为操作参数，而应使用实际值。
2. 仅在需要时调用工具：如果不需要信息，不要调用搜索代理，尝试自己解决任务。
3. 如果不需要工具调用，直接回答问题即可。
4. 永远不要重复执行之前使用完全相同参数执行过的工具调用。
5. 对于工具使用，请务必使用上述示例中显示的 XML 标签格式。不要使用任何其他格式。

{{ TOOLS_INFO }}

## 回复规则

使用用户查询的语言进行回复，除非用户指令对使用语言有其他要求。

# 用户指令
{{ USER_SYSTEM_PROMPT }}`

// 工具使用示例 - 英文
export const TOOL_USE_EXAMPLES_EN = `
Here are a few examples using notional tools:
---
User: Generate an image of the oldest person in this document.

A: I can use the document_qa tool to find out who the oldest person is in the document.
<tool_use>
  <name>document_qa</name>
  <arguments>{"document": "document.pdf", "question": "Who is the oldest person mentioned?"}</arguments>
</tool_use>

User: <tool_use_result>
  <name>document_qa</name>
  <result>John Doe, a 55 year old lumberjack living in Newfoundland.</result>
</tool_use_result>

A: I can use the image_generator tool to create a portrait of John Doe.
<tool_use>
  <name>image_generator</name>
  <arguments>{"prompt": "A portrait of John Doe, a 55-year-old man living in Canada."}</arguments>
</tool_use>

User: <tool_use_result>
  <name>image_generator</name>
  <result>image.png</result>
</tool_use_result>

A: the image is generated as image.png

---
User: "What is the result of the following operation: 5 + 3 + 1294.678?"

A: I can use the python_interpreter tool to calculate the result of the operation.
<tool_use>
  <name>python_interpreter</name>
  <arguments>{"code": "5 + 3 + 1294.678"}</arguments>
</tool_use>

User: <tool_use_result>
  <name>python_interpreter</name>
  <result>1302.678</result>
</tool_use_result>

A: The result of the operation is 1302.678.

---
User: "Which city has the highest population , Guangzhou or Shanghai?"

A: I can use the search tool to find the population of Guangzhou.
<tool_use>
  <name>search</name>
  <arguments>{"query": "Population Guangzhou"}</arguments>
</tool_use>

User: <tool_use_result>
  <name>search</name>
  <result>Guangzhou has a population of 15 million inhabitants as of 2021.</result>
</tool_use_result>

A: I can use the search tool to find the population of Shanghai.
<tool_use>
  <name>search</name>
  <arguments>{"query": "Population Shanghai"}</arguments>
</tool_use>

User: <tool_use_result>
  <name>search</name>
  <result>26 million (2019)</result>
</tool_use_result>

A: The population of Shanghai is 26 million, while Guangzhou has a population of 15 million. Therefore, Shanghai has the highest population.
`

// 工具使用示例 - 中文
export const TOOL_USE_EXAMPLES_ZH = `
以下是使用虚拟工具的示例：
---
用户：生成一份文档中最年长者的图像。

助手：我可以使用 document_qa 工具来找出文档中最年长的人是谁。
<tool_use>
  <name>document_qa</name>
  <arguments>{"document": "document.pdf", "question": "文档中提到的最年长的人是谁？"}</arguments>
</tool_use>

用户：<tool_use_result>
  <name>document_qa</name>
  <result>约翰·多伊，一位55岁的伐木工人，住在纽芬兰。</result>
</tool_use_result>

助手：我可以使用 image_generator 工具来创建约翰·多伊的肖像。
<tool_use>
  <name>image_generator</name>
  <arguments>{"prompt": "约翰·多伊的肖像，一位住在加拿大的55岁男子。"}</arguments>
</tool_use>

用户：<tool_use_result>
  <name>image_generator</name>
  <result>image.png</result>
</tool_use_result>

助手：图像已生成为 image.png

---
用户："以下运算的结果是什么：5 + 3 + 1294.678？"

助手：我可以使用 python_interpreter 工具来计算运算结果。
<tool_use>
  <name>python_interpreter</name>
  <arguments>{"code": "5 + 3 + 1294.678"}</arguments>
</tool_use>

用户：<tool_use_result>
  <name>python_interpreter</name>
  <result>1302.678</result>
</tool_use_result>

助手：运算结果是 1302.678。

---
用户："哪个城市人口更多，广州还是上海？"

助手：我可以使用搜索工具来查找广州的人口。
<tool_use>
  <name>search</name>
  <arguments>{"query": "广州人口"}</arguments>
</tool_use>

用户：<tool_use_result>
  <name>search</name>
  <result>截至2021年，广州有1500万居民。</result>
</tool_use_result>

助手：我可以使用搜索工具来查找上海的人口。
<tool_use>
  <name>search</name>
  <arguments>{"query": "上海人口"}</arguments>
</tool_use>

用户：<tool_use_result>
  <name>search</name>
  <result>2600万（2019年）</result>
</tool_use_result>

助手：上海人口为2600万，而广州有1500万人口。因此，上海人口更多。
`

/**
 * 检测模型是否适合使用中文提示词
 * 基于模型名称和提供商进行判断
 */
export function shouldUseChinesePrompt(modelName?: string, providerId?: string): boolean {
  if (!modelName) return false

  const name = modelName.toLowerCase()
  const provider = providerId?.toLowerCase() || ''

  // 中文模型关键词
  const chineseModelKeywords = [
    'kimi',
    'moonshot',
    'qwen',
    'qwq',
    'baichuan',
    'chatglm',
    'glm',
    'ernie',
    'wenxin',
    'hunyuan',
    'spark',
    'doubao',
    'yi',
    'deepseek',
    'codestral'
  ]

  // 中文提供商
  const chineseProviders = ['moonshot', 'qwen', 'baichuan', 'zhipu', 'baidu', 'tencent', 'xinference', 'deepseek']

  // 检查模型名称
  if (chineseModelKeywords.some((keyword) => name.includes(keyword))) {
    return true
  }

  // 检查提供商
  if (chineseProviders.some((p) => provider.includes(p))) {
    return true
  }

  return false
}

/**
 * 获取适合模型的系统提示词
 */
export function getSystemPrompt(modelName?: string, providerId?: string, useChinese?: boolean): string {
  const shouldUseZh = useChinese ?? shouldUseChinesePrompt(modelName, providerId)
  return shouldUseZh ? DEFAULT_SYSTEM_PROMPT_ZH : DEFAULT_SYSTEM_PROMPT_EN
}

/**
 * 获取工具使用示例
 */
export function getToolUseExamples(modelName?: string, providerId?: string, useChinese?: boolean): string {
  const shouldUseZh = useChinese ?? shouldUseChinesePrompt(modelName, providerId)
  return shouldUseZh ? TOOL_USE_EXAMPLES_ZH : TOOL_USE_EXAMPLES_EN
}
