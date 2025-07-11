import {
  BaseFunction,
  FunctionContext,
  FunctionResult,
  FunctionDefinition,
} from '../BaseFunction';
import { logger } from '../../utils/logger';
import { serviceManager } from '../../services/ServiceManager';

export class SendDMFunction extends BaseFunction {
  definition: FunctionDefinition = {
    name: 'send_dm',
    description: 'send a direct message to a user',
    parameters: [
      {
        name: 'user_id',
        type: 'string',
        required: true,
        description: 'the ID of the user to send the DM to',
      },
      {
        name: 'message',
        type: 'string',
        required: true,
        description: 'the message content to send',
      },
    ],
  };

  async execute(
    context: FunctionContext,
    args: Record<string, any>
  ): Promise<FunctionResult> {
    const validationError = this.validateArgs(args);
    if (validationError) {
      return {
        success: false,
        message: validationError,
      };
    }

    const { user_id, message } = args;

    try {
      const cleanUserId = user_id.replace(/[<@!>]/g, '');

      const user = await context.message.client.users
        .fetch(cleanUserId)
        .catch(() => null);

      if (!user) {
        return {
          success: false,
          message: `user with ID ${cleanUserId} not found`,
        };
      }

      if (context.guildId) {
        const guild = await context.message.client.guilds
          .fetch(context.guildId)
          .catch(() => null);

        if (guild) {
          const member = await guild.members
            .fetch(cleanUserId)
            .catch(() => null);

          if (!member) {
            return {
              success: false,
              message: `user ${user.username} is not in this server`,
            };
          }
        }
      }

      try {
        const sentMessage = await user.send(message);
        logger.info(`sent DM to ${user.username} (${user.id})`);

        // add the sent DM to memory
        const memoryService = serviceManager.getMemoryService();

        // store bot's message in the DM channel
        await memoryService.addMessage({
          id: sentMessage.id,
          channelId: sentMessage.channelId,
          guildId: null, // DMs have no guild
          author: sentMessage.author.username,
          authorId: sentMessage.author.id,
          content: message,
          timestamp: sentMessage.createdAt,
          isBot: true,
          botId: context.message.client.user!.id,
        });

        logger.debug(`saved DM to memory for channel ${sentMessage.channelId}`);

        return {
          success: true,
          message: `sent DM to ${user.username}`,
          data: {
            username: user.username,
            userId: user.id,
            messageLength: message.length,
            dmChannelId: sentMessage.channelId,
          },
        };
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes('Cannot send messages')
        ) {
          return {
            success: false,
            message: `cannot send DM to ${user.username} - they may have DMs disabled`,
          };
        }
        throw error;
      }
    } catch (error) {
      logger.error('error in send_dm function:', error);
      return {
        success: false,
        message: `failed to send DM: ${error instanceof Error ? error.message : 'unknown error'}`,
      };
    }
  }
}
