import { ConfigService } from '../config/ConfigService';
import { MemoryMessage } from '../memory/types';
import { AIMessage } from '../../types/ai';
import { FunctionRegistry } from '../../functions/FunctionRegistry';

export class PromptBuilder {
  private configService: ConfigService;
  private functionRegistry: FunctionRegistry;

  constructor(
    configService: ConfigService,
    functionRegistry: FunctionRegistry
  ) {
    this.configService = configService;
    this.functionRegistry = functionRegistry;
  }

  buildSystemPrompt(): string {
    const botConfig = this.configService.getBotConfig();
    const template = botConfig.systemPrompt.template;

    let prompt = template;
    prompt = prompt.replace(/{{bot_name}}/g, botConfig.name);
    prompt = prompt.replace(
      /{{persona_description}}/g,
      botConfig.systemPrompt.persona
    );
    prompt = prompt.replace(
      /{{messaging_rules}}/g,
      botConfig.systemPrompt.rules
    );
    prompt = prompt.replace(
      /{{dialogue_examples}}/g,
      botConfig.systemPrompt.examples
    );
    prompt = prompt.replace(
      /{{context_information}}/g,
      botConfig.systemPrompt.context
    );

    const functionPrompt = this.functionRegistry.generatePromptSection();
    if (functionPrompt) {
      prompt += functionPrompt;
    }

    return prompt;
  }

  buildMessages(memoryMessages: MemoryMessage[]): AIMessage[] {
    const botConfig = this.configService.getBotConfig();
    const messages: AIMessage[] = [];

    // prepend example conversation turns if toggled
    if (
      botConfig.conversationPriming?.enabled &&
      botConfig.conversationPriming.exchanges
    ) {
      for (const exchange of botConfig.conversationPriming.exchanges) {
        messages.push({
          role: 'user',
          content: `[${exchange.userName}|${exchange.userId || '123456789'}]: ${exchange.userMessage}`,
          name: exchange.userName,
        });

        messages.push({
          role: 'assistant',
          content: exchange.assistantResponse,
          name: botConfig.name,
        });
      }
    }

    // add actual conversation history
    for (const msg of memoryMessages) {
      const isBot = msg.authorId === msg.botId || msg.isBot;
      const isSystem = msg.isSystem;

      if (isSystem) {
        messages.push({
          role: 'system',
          content: msg.content,
          name: 'System',
        });
      } else if (isBot) {
        messages.push({
          role: 'assistant',
          content: msg.content,
          name: msg.author,
        });
      } else {
        messages.push({
          role: 'user',
          content: `[${msg.author}|${msg.authorId}]: ${msg.content}`,
          name: msg.author,
        });
      }
    }

    return messages;
  }
}
