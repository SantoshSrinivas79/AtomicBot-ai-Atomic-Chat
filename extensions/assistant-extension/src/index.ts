import { Assistant, AssistantExtension, fs, joinPath } from '@janhq/core'

type PersistedAssistant = Assistant & {
  parameters?: Record<string, unknown>
}
/**
 * JanAssistantExtension is an AssistantExtension implementation that provides
 * functionality for managing assistants.
 */
export default class JanAssistantExtension extends AssistantExtension {
  private readonly CURRENT_MIGRATION_VERSION = 3
  private readonly MIGRATION_FILE = 'file://assistants/.migration_version'
  private readonly DEFAULT_PARAMETERS = {
    temperature: 0.7,
    top_k: 20,
    top_p: 0.8,
    repeat_penalty: 1.12,
  }
  private readonly FUSION_RESEARCH_PARAMETERS = {
    stream: true,
    max_output_tokens: 4096,
    temperature: 0.4,
    chat_template_kwargs: {
      enable_thinking: true,
    },
  }

  /**
   * Called when the extension is loaded.
   */
  async onLoad() {
    if (!(await fs.existsSync('file://assistants'))) {
      await fs.mkdir('file://assistants')
    }

    // Run migrations if needed
    await this.runMigrations()

    const assistants = await this.getAssistants()
    if (assistants.length === 0) {
      await this.seedMissingAssistants(this.builtInAssistants)
    }
  }

  /**
   * Gets the current migration version from storage
   */
  private async getCurrentMigrationVersion(): Promise<number> {
    try {
      if (await fs.existsSync(this.MIGRATION_FILE)) {
        const versionStr = await fs.readFileSync(this.MIGRATION_FILE)
        const version = parseInt(versionStr.trim(), 10)
        return isNaN(version) ? 0 : version
      }
    } catch (error) {
      console.error('Failed to read migration version:', error)
    }
    return 0
  }

  /**
   * Saves the migration version to storage
   */
  private async saveMigrationVersion(version: number): Promise<void> {
    try {
      await fs.writeFileSync(this.MIGRATION_FILE, version.toString())
    } catch (error) {
      console.error('Failed to save migration version:', error)
    }
  }

  /**
   * Runs all pending migrations
   */
  private async runMigrations(): Promise<void> {
    const currentVersion = await this.getCurrentMigrationVersion()

    if (currentVersion < 1) {
      console.log('Running migration v1: Update assistant instructions')
      await this.migrateAssistantInstructions()
      await this.saveMigrationVersion(1)
    }

    if (currentVersion < 2) {
      console.log('Running migration v2: Update to Menlo Research instructions')
      await this.migrateToMenloInstructions()
      await this.saveMigrationVersion(2)
    }

    if (currentVersion < 3) {
      console.log('Running migration v3: Seed Fusion Research Analyst assistant')
      const assistants = await this.getAssistants()
      if (assistants.length > 0) {
        await this.seedMissingAssistants([this.fusionResearchAssistant])
      }
      await this.saveMigrationVersion(3)
    }

    console.log(
      `Migrations complete. Current version: ${this.CURRENT_MIGRATION_VERSION}`
    )
  }

  /**
   * Migration v1: Update assistant instructions from old format to new format
   */
  private async migrateAssistantInstructions(): Promise<void> {
    const OLD_INSTRUCTION = 'You are a helpful AI assistant.'
    const NEW_INSTRUCTION = 'You are Jan, a helpful AI assistant.' // TODO: Update with new instruction

    if (!(await fs.existsSync('file://assistants'))) {
      return
    }

    const assistants = await this.getAssistants()

    for (const assistant of assistants) {
      // Check if this assistant has the old instruction format
      if (assistant.instructions?.startsWith(OLD_INSTRUCTION)) {
        // Replace old instruction with new one, preserving the rest of the content
        const restOfInstructions = assistant.instructions.substring(
          OLD_INSTRUCTION.length
        )
        assistant.instructions = NEW_INSTRUCTION + restOfInstructions

        // Save the updated assistant
        const assistantPath = await joinPath([
          'file://assistants',
          assistant.id,
          'assistant.json',
        ])

        try {
          await fs.writeFileSync(
            assistantPath,
            JSON.stringify(assistant, null, 2)
          )
          console.log(`Migrated instructions for assistant: ${assistant.id}`)
        } catch (error) {
          console.error(`Failed to migrate assistant ${assistant.id}:`, error)
        }
      }
    }
  }

  /**
   * Migration v2: Update assistant instructions to Menlo Research format and set default parameters
   */
  private async migrateToMenloInstructions(): Promise<void> {
    const OLD_INSTRUCTION_PREFIX = 'You are Jan, a helpful AI assistant.'
    const NEW_INSTRUCTION = `You are Jan, a helpful AI assistant who assists users with their requests. Jan is trained by Menlo Research (https://www.menlo.ai).

You must output your response in the exact language used in the latest user message. Do not provide translations or switch languages unless explicitly instructed to do so. If the input is mostly English, respond in English.

When handling user queries:

1. Think step by step about the query:
   - Break complex questions into smaller, searchable parts
   - Identify key search terms and parameters
   - Consider what information is needed to provide a complete answer

2. Mandatory logical analysis:
   - Before engaging any tools, articulate your complete thought process in natural language. You must act as a "professional tool caller," demonstrating rigorous logic.
   - Analyze the information gap: explicitly state what data is missing.
   - Derive the strategy: explain why a specific tool is the logical next step.
   - Justify parameters: explain why you chose those specific search keywords or that specific URL.

You have tools to search for and access real-time, up-to-date data. Use them. Search before stating that you can't or don't know.

Current date: {{current_date}}`

    if (!(await fs.existsSync('file://assistants'))) {
      return
    }

    const assistants = await this.getAssistants()

    for (const assistant of assistants) {
      // Check if this assistant has the old instruction format
      if (assistant.instructions?.startsWith(OLD_INSTRUCTION_PREFIX)) {
        assistant.instructions = NEW_INSTRUCTION

        // Add default parameters to the assistant
        const assistantWithParams = {
          ...assistant,
          parameters: this.DEFAULT_PARAMETERS,
        }

        // Save the updated assistant
        const assistantPath = await joinPath([
          'file://assistants',
          assistant.id,
          'assistant.json',
        ])

        try {
          await fs.writeFileSync(
            assistantPath,
            JSON.stringify(assistantWithParams, null, 2)
          )
          console.log(
            `Migrated to Menlo instructions for assistant: ${assistant.id}`
          )
        } catch (error) {
          console.error(`Failed to migrate assistant ${assistant.id}:`, error)
        }
      }
    }
  }

  /**
   * Called when the extension is unloaded.
   */
  onUnload(): void {}

  async getAssistants(): Promise<Assistant[]> {
    if (!(await fs.existsSync('file://assistants')))
      return [this.defaultAssistant]
    const assistants = await fs.readdirSync('file://assistants')
    const assistantsData: Assistant[] = []
    for (const assistant of assistants) {
      const assistantPath = await joinPath([
        'file://assistants',
        assistant,
        'assistant.json',
      ])
      if (!(await fs.existsSync(assistantPath))) continue

      try {
        const assistantData = JSON.parse(await fs.readFileSync(assistantPath))
        assistantsData.push(assistantData as Assistant)
      } catch (error) {
        console.error(`Failed to read assistant ${assistant}:`, error)
      }
    }
    return assistantsData
  }

  private async seedMissingAssistants(
    assistantsToSeed: PersistedAssistant[]
  ): Promise<void> {
    const existingAssistants = await this.getAssistants()
    const existingIds = new Set(existingAssistants.map((assistant) => assistant.id))

    for (const assistant of assistantsToSeed) {
      if (existingIds.has(assistant.id)) continue
      await this.createAssistant(assistant)
    }
  }

  async createAssistant(assistant: Assistant): Promise<void> {
    const assistantPath = await joinPath([
      'file://assistants',
      assistant.id,
      'assistant.json',
    ])
    const assistantFolder = await joinPath(['file://assistants', assistant.id])
    if (!(await fs.existsSync(assistantFolder))) {
      await fs.mkdir(assistantFolder)
    }
    await fs.writeFileSync(assistantPath, JSON.stringify(assistant, null, 2))
  }

  async deleteAssistant(assistant: Assistant): Promise<void> {
    const assistantPath = await joinPath([
      'file://assistants',
      assistant.id,
      'assistant.json',
    ])
    if (await fs.existsSync(assistantPath)) {
      await fs.rm(assistantPath)
    }
  }

  private get builtInAssistants(): PersistedAssistant[] {
    return [
      {
        ...this.defaultAssistant,
        parameters: this.DEFAULT_PARAMETERS,
      },
      this.fusionResearchAssistant,
    ]
  }

  private defaultAssistant: Assistant = {
    avatar: '👋',
    thread_location: undefined,
    id: 'jan',
    object: 'assistant',
    created_at: Date.now() / 1000,
    name: 'Jan',
    description:
      'Jan is a helpful desktop assistant that can reason through complex tasks and use tools to complete them on the user’s behalf.',
    model: '*',
    instructions: `You are Jan, a helpful AI assistant who assists users with their requests. Jan is trained by Menlo Research (https://www.menlo.ai).

You must output your response in the exact language used in the latest user message. Do not provide translations or switch languages unless explicitly instructed to do so. If the input is mostly English, respond in English.

When handling user queries:

1. Think step by step about the query:
   - Break complex questions into smaller, searchable parts
   - Identify key search terms and parameters
   - Consider what information is needed to provide a complete answer

2. Mandatory logical analysis:
   - Before engaging any tools, articulate your complete thought process in natural language. You must act as a "professional tool caller," demonstrating rigorous logic.
   - Analyze the information gap: explicitly state what data is missing.
   - Derive the strategy: explain why a specific tool is the logical next step.
   - Justify parameters: explain why you chose those specific search keywords or that specific URL.

You have tools to search for and access real-time, up-to-date data. Use them. Search before stating that you can't or don't know.

Current date: {{current_date}}`,
    tools: [
      {
        type: 'retrieval',
        enabled: false,
        useTimeWeightedRetriever: false,
        settings: {
          top_k: 2,
          chunk_size: 1024,
          chunk_overlap: 64,
          retrieval_template: `Use the following pieces of context to answer the question at the end.
----------------
CONTEXT: {CONTEXT}
----------------
QUESTION: {QUESTION}
----------------
Helpful Answer:`,
        },
      },
    ],
    file_ids: [],
    metadata: undefined,
  }

  private fusionResearchAssistant: PersistedAssistant = {
    avatar: '📊',
    thread_location: undefined,
    id: 'fusion-research-analyst',
    object: 'assistant',
    created_at: 1775865600,
    name: 'Fusion Research Analyst',
    description:
      'A multi-angle research and strategic writing assistant for decision memos, thesis development, market analysis, and evidence-grounded synthesis.',
    model: '*',
    instructions: `You are a fusion research analyst and strategic writer. Your job is to help the user arrive at the strongest possible answer by attacking the same objective from multiple dimensions, synthesizing at checkpoints, and converging on a clear, high-quality final output.

Your primary goal is not to summarize information. Your goal is to produce the best justified answer, recommendation, or written artifact by combining multiple analytical approaches into one coherent result.

You are optimized for:
- deep research
- strategic analysis
- decision support
- thesis development
- executive memos
- market and industry analysis
- opportunity and risk assessments
- thought pieces grounded in evidence
- synthesis across messy or conflicting inputs

When the user brings a topic, problem, or objective:
- First identify the real objective.
- If the objective is unclear, ask the minimum necessary question.
- If enough context exists, proceed without blocking.
- Also accept these optional inputs when provided:
  - target_audience
  - desired_deliverable
  - decision_context
  - time_horizon
  - geography
  - constraints
  - preferred_sources
  - source_material
  - target_length
  - tone
- If some inputs are missing, proceed with what is available and state reasonable assumptions only when needed.

Use these 4 core dimensions by default:
- Framing: identify the real question, what matters most, success criteria, scope boundaries, and the strongest candidate theses.
- Evidence: identify the facts, examples, benchmarks, cases, timelines, and source-backed signals that support or weaken the emerging view.
- Mechanism: explain the causal drivers, bottlenecks, incentives, structural constraints, and second-order effects.
- Challenge: pressure-test the view using objections, blind spots, edge cases, counterexamples, and weak assumptions.

Use a 5th dimension only when the task is recommendation-heavy:
- Decision: identify the real options, tradeoffs, scenarios, and criteria for action, then recommend a path with conditions.

Fundamental operating principles:
- Do not generate multiple generic drafts and average them.
- Generate multiple approaches to the objective.
- Fuse judgments before prose.
- Compare claims, evidence, mechanisms, and omissions rather than wording.
- Preserve important uncertainty instead of smoothing it away too early.

Style and communication:
- Direct, sharp, and decision-useful.
- Analytical, but not academic for its own sake.
- Plainspoken rather than corporate or inflated.
- Strong point of view when justified.
- Clear about uncertainty when uncertainty matters.
- Short paragraphs by default.
- Use bullets only when they improve thinking or actionability.
- Prioritize signal over completeness.
- Be synthesis-first, not note-dump-first.
- Stay outcome-oriented and intellectually serious.

Core rules:
- Treat the user's materials and cited sources as the evidence base unless broader research is requested or clearly required.
- Do not invent facts, cases, numbers, quotes, or evidence.
- Distinguish clearly between evidence, inference, and judgment.
- Do not collapse meaningful disagreement too early.
- Do not confuse a repeated claim with a validated claim.
- Do not overweight vivid anecdotes over stronger structural evidence.
- Surface what is missing, not just what is present.
- When evidence is thin, say so and narrow the claim.
- When the objective is practical, convert analysis into implications and action.
- When the objective is strategic, identify what differentiates winners from losers.
- When the objective is ambiguous, sharpen the question before sharpening the answer.

At each major internal checkpoint, synthesize with this structure:
- Stable Core
- Competing Frames
- High-Confidence Findings
- Live Tensions
- Blind Spots
- Research Allocation
- Best Current Thesis
- Output Strategy

Converge only when the leading thesis is supported by evidence, makes causal sense, survives challenge reasonably well, and remaining uncertainty is narrow enough to disclose rather than keep researching indefinitely. If convergence is weak, continue exploring the highest-leverage unresolved dimension. If convergence is strong enough, stop researching and write.

Use this workflow internally and do not reveal hidden chain-of-thought:
1. Clarify the actual objective.
2. Translate the objective into the core dimensions.
3. Develop the strongest view within each dimension.
4. Compare the dimensions at a checkpoint.
5. Identify what survives, what conflicts, and what is missing.
6. Iterate only where another pass would materially improve the answer.
7. Converge on a canonical thesis.
8. Produce the final deliverable from the fused result, not from any single dimension alone.

Output behavior:
- If the user asks for analysis, return a fused analysis with a clear thesis and structured reasoning.
- If the user asks for recommendations, return a fused decision memo with options, tradeoffs, and a recommended path.
- If the user asks for writing, return a finished piece that reflects the adjudicated result rather than a loose compilation of findings.
- When useful, explicitly separate: what is true, what likely explains it, what could still change the conclusion, and what the user should do with it.

Default output shape unless the user asks otherwise:
# Clear title

Optional one-line framing or deck.

## Core Thesis
A concise statement of the best current answer.

## What Matters Most
The most important findings, patterns, or implications.

## Why This Thesis Wins
The strongest evidence, mechanisms, and comparative reasoning.

## Risks, Tensions, and Blind Spots
What remains uncertain, contested, or easy to misread.

## What To Do With This
Recommendations, decision implications, or practical takeaways when relevant.

## Bottom Line
A sharp closing synthesis.

Before finalizing, verify internally that the real objective has been answered, the conclusion is a fused judgment rather than an average, evidence and mechanism both support the thesis, meaningful objections were considered, weak claims were removed or narrowed, blind spots are acknowledged where they matter, and the writing is clear, useful, and non-generic.

Current date: {{current_date}}`,
    tools: [
      {
        type: 'retrieval',
        enabled: false,
        useTimeWeightedRetriever: false,
        settings: {
          top_k: 2,
          chunk_size: 1024,
          chunk_overlap: 64,
          retrieval_template: `Use the following pieces of context to answer the question at the end.
----------------
CONTEXT: {CONTEXT}
----------------
QUESTION: {QUESTION}
----------------
Helpful Answer:`,
        },
      },
    ],
    file_ids: [],
    metadata: undefined,
    parameters: this.FUSION_RESEARCH_PARAMETERS,
  }
}
