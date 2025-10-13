import { Injectable, Logger } from '@nestjs/common';
import { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand, GetQueueAttributesCommand } from '@aws-sdk/client-sqs';
import type { ProcessMessage, ProcessQueueConfig } from './queue.interfaces';
import { ProcessState } from './queue.interfaces';
import { IBaseOpportunity } from '../interfaces/strategy';

export class QueueManager {
  private readonly logger = new Logger(QueueManager.name);
  private readonly sqsClient: SQSClient;
  private readonly config: ProcessQueueConfig;

  constructor(config: ProcessQueueConfig) {
    this.config = config;
    this.sqsClient = new SQSClient({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }
  /*
  this.sqsClient = new SQSClient({
      region: process.env.AWS_REGION,
      endpoint: process.env.SQS_END_POINT as string,
      ...(isDevelopment() && {
        credentials: {
          accessKeyId: this.configService.get("aws.accessKeyId") as string,
          secretAccessKey: this.configService.get("aws.secretAccessKey") as string,
        },
      }),
    });
  */

  /**
   * 새로운 프로세스를 큐에 추가
   */
  async enqueueProcess(
    strategyName: string,
    opportunity: IBaseOpportunity,
    maxRetries: number = 3
  ): Promise<string> {
    const processId = crypto.randomUUID();
    const message: ProcessMessage = {
      processId,
      strategyName,
      opportunity,
      state: ProcessState.PENDING,
      currentOrderIndex: 0,
      orderResponses: [],
      internalPositions: [],
      attempts: 0,
      maxRetries,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      const command = new SendMessageCommand({
        QueueUrl: this.config.queueUrl,
        MessageBody: JSON.stringify(message),
      });

      await this.sqsClient.send(command);
      this.logger.log(`Process ${processId} enqueued for strategy ${strategyName}`);
      return processId;
    } catch (error) {
      this.logger.error(`Failed to enqueue process: ${error.message}`, error.stack);
      throw error;
    }
  }

  async dequeueProcess(): Promise<{ message: ProcessMessage; receiptHandle: string } | null> {
    try {
      const command = new ReceiveMessageCommand({
        QueueUrl: this.config.queueUrl,
        MaxNumberOfMessages: 1,
        VisibilityTimeout: this.config.visibilityTimeout,
        WaitTimeSeconds: 20, // Long polling
      });

      const response = await this.sqsClient.send(command);

      if (!response.Messages || response.Messages.length === 0) {
        return null;
      }

      const sqsMessage = response.Messages[0];
      const message: ProcessMessage = JSON.parse(sqsMessage.Body!);

      return {
        message,
        receiptHandle: sqsMessage.ReceiptHandle!,
      };
    } catch (error) {
      this.logger.error(`Failed to dequeue process: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * 프로세스 완료 후 큐에서 메시지 삭제
   */
  async completeProcess(receiptHandle: string): Promise<void> {
    try {
      const command = new DeleteMessageCommand({
        QueueUrl: this.config.queueUrl,
        ReceiptHandle: receiptHandle,
      });

      await this.sqsClient.send(command);
      this.logger.log('Process completed and removed from queue');
    } catch (error) {
      this.logger.error(`Failed to complete process: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 프로세스 상태 업데이트 (재큐잉)
   */
  async updateProcessState(
    receiptHandle: string,
    message: ProcessMessage,
    newState: ProcessState,
    errorMessage?: string
  ): Promise<void> {
    try {
      // 기존 메시지 삭제
      await this.completeProcess(receiptHandle);

      // 업데이트된 메시지로 재큐잉
      const updatedMessage: ProcessMessage = {
        ...message,
        state: newState,
        attempts: message.attempts + 1,
        updatedAt: new Date().toISOString(),
        errorMessage,
      };

      const command = new SendMessageCommand({
        QueueUrl: this.config.queueUrl,
        MessageBody: JSON.stringify(updatedMessage),
      });

      await this.sqsClient.send(command);
      this.logger.log(`Process ${message.processId} state updated to ${newState}`);
    } catch (error) {
      this.logger.error(`Failed to update process state: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 현재 처리 중인 프로세스 수 확인
   */
  async getActiveProcessCount(): Promise<number> {
    try {
      const command = new GetQueueAttributesCommand({
        QueueUrl: this.config.queueUrl,
        AttributeNames: ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible'],
      });

      const response = await this.sqsClient.send(command);
      const visible = parseInt(response.Attributes?.ApproximateNumberOfMessages || '0');
      const processing = parseInt(response.Attributes?.ApproximateNumberOfMessagesNotVisible || '0');

      return visible + processing;
    } catch (error) {
      this.logger.error(`Failed to get active process count: ${error.message}`, error.stack);
      return 0;
    }
  }

  /**
   * 최대 동시 프로세스 수 확인
   */
  async canStartNewProcess(): Promise<boolean> {
    const activeCount = await this.getActiveProcessCount();
    return activeCount < this.config.maxConcurrentProcesses;
  }
}