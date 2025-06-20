import { BaseProvider } from './providers/BaseProvider';
import { LocalProvider } from './providers/LocalProvider';
import { PromptBuilder } from './PromptBuilder';
import { ConfigService } from '../config/ConfigService';
import { MemoryMessage } from '../memory/types';
import {
  FunctionRegistry,
  FunctionCall,
} from '../../functions/FunctionRegistry';
import { FunctionContext } from '../../functions/BaseFunction';

import { AIConfig, AIResponse, ChatContext } from '../../types/ai';
import { logger } from '../../utils/logger';
import { Message } from 'discord.js';

export interface AIServiceResponse {
  content: string;
  functionCalls?: FunctionCall[];
  rawContent?: string; // keep the original content with function calls
}

export class AIService {
  private provider: BaseProvider;
  private promptBuilder: PromptBuilder;
  private configService: ConfigService;
  private functionRegistry: FunctionRegistry;

  constructor(configService: ConfigService) {
    this.configService = configService;
    this.functionRegistry = new FunctionRegistry();
    this.promptBuilder = new PromptBuilder(
      configService,
      this.functionRegistry
    );

    const aiConfig = this.configService.getAIConfig();
    this.provider = this.createProvider(aiConfig);

    logger.info(`initialized ai service with ${this.provider.getName()}`);
  }

  private createProvider(config: AIConfig): BaseProvider {
    switch (config.provider) {
      case 'local':
        return new LocalProvider(config);
      default:
        throw new Error(`unsupported ai provider: ${config.provider}`);
    }
  }

  async generateResponse(
    conversationHistory: MemoryMessage[],
    message?: Message
  ): Promise<AIServiceResponse> {
    try {
      const systemPrompt = this.promptBuilder.buildSystemPrompt();
      const messages = this.promptBuilder.buildMessages(conversationHistory);

      const context: ChatContext = {
        systemPrompt,
        messages,
      };

      logger.debug(
        `generating response with ${messages.length} messages in context`
      );
      const response = await this.provider.generateResponse(context);

      if (response.usage) {
        logger.debug(
          `tokens used - prompt: ${response.usage.promptTokens}, completion: ${response.usage.completionTokens}`
        );
      }

      const functionCalls = this.functionRegistry.parseFunctionCalls(
        response.content
      );
      const cleanContent = this.functionRegistry.removeFunctionCalls(
        response.content
      );

      if (functionCalls.length > 0) {
        logger.info(
          `detected ${functionCalls.length} function calls in response`
        );
      }

      return {
        content: cleanContent,
        rawContent: response.content, // keep original with function calls
        functionCalls: functionCalls.length > 0 ? functionCalls : undefined,
      };
    } catch (error) {
      logger.error('failed to generate ai response:', error);
      throw error;
    }
  }

  async executeFunctionCalls(
    functionCalls: FunctionCall[],
    message: Message
  ): Promise<string[]> {
    const results: string[] = [];

    const context: FunctionContext = {
      message,
      channelId: message.channelId,
      guildId: message.guildId,
      authorId: message.author.id,
      authorName: message.author.username,
    };

    for (const call of functionCalls) {
      const result = await this.functionRegistry.executeFunction(
        call.name,
        context,
        call.args
      );

      const resultMessage = result.success
        ? `[FUNCTION: ${call.name} - ${result.message}]`
        : `[FUNCTION: ${call.name} failed - ${result.message}]`;

      results.push(resultMessage);
    }

    return results;
  }

  validateConfiguration(): boolean {
    return this.provider.validateConfig();
  }

  getProviderName(): string {
    return this.provider.getName();
  }

  getFunctionRegistry(): FunctionRegistry {
    return this.functionRegistry;
  }
}
