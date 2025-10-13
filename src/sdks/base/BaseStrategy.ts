import { Injectable, OnApplicationShutdown, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { IProtocol, IBaseOrderResult, ISuccessBaseOrderResult, isSuccessOrderResult } from '../interfaces/protocol';
import { IBaseStrategy, IBaseOpportunity, IBaseOrder } from '../interfaces/strategy';
import { IBaseInternalPosition, IBasePosition, IBaseReceipt } from '../interfaces/position';
import { saveDataToFile, loadDataFromFile, delay } from 'src/utils/utils';
import { QueueManager } from '../queue/QueueManager';
import type { ProcessMessage } from '../queue/queue.interfaces';
import { ProcessState } from '../queue/queue.interfaces';

export interface IBaseStrategyData {
  positions: Record<string, IBasePosition>;
  receipts: Record<string, IBaseReceipt>;
}

@Injectable()
export abstract class BaseStrategy implements IBaseStrategy, OnModuleInit, OnModuleDestroy, OnApplicationShutdown {
  public abstract readonly name: string;
  public abstract readonly protocolMap: Record<string, IProtocol>;
  protected readonly logger: Logger;
  protected readonly positions: Record<string, IBasePosition> = {};
  protected readonly receipts: Record<string, IBaseReceipt> = {};
  protected readonly dataFilePath: string;
  protected processQueue?: QueueManager;
  private isProcessingQueue = false;

  constructor(strategyName: string, processQueue?: QueueManager) {
    this.logger = new Logger(strategyName);
    this.dataFilePath = `./data/${strategyName}-data.json`;
    this.processQueue = processQueue;
  }

  async onModuleInit() {
    this.logger.log(`${this.name} initialized`);
    await this.loadData();

    setTimeout(() => {
      if (this.processQueue) {
        this.startProcessingQueue();
      }
    }, 100);
  }

  async onModuleDestroy() {
    this.isProcessingQueue = false;
    await this.saveData();
  }

  async onApplicationShutdown() {
    this.isProcessingQueue = false;
    await this.saveData();
  }

  public async saveData(): Promise<void> {
    try {
      const data: IBaseStrategyData = {
        positions: this.positions,
        receipts: this.receipts,
      };
      await saveDataToFile(data, this.dataFilePath);
    } catch (error) {
      this.logger.error('Failed to save strategy data', error.stack, 'saveData');
    }
  }

  protected async loadData(): Promise<void> {
    try {
      const defaultData: IBaseStrategyData = { positions: {}, receipts: {} };
      const data = await loadDataFromFile(this.dataFilePath, defaultData);

      Object.assign(this.positions, data.positions);
      Object.assign(this.receipts, data.receipts);

      const positionCount = Object.keys(this.positions).length;
      const receiptCount = Object.keys(this.receipts).length;
      this.logger.log(`Loaded ${positionCount} positions and ${receiptCount} receipts from ${this.dataFilePath}`);
    } catch (error) {
      this.logger.error('Failed to load strategy data', error.stack, 'loadData');
    }
  }

  // Position and receipt management
  getPosition(id: string): IBasePosition {
    return this.positions[id];
  }

  getPositions(): IBasePosition[] {
    return Object.values(this.positions);
  }

  getReceipt(id: string): IBaseReceipt {
    return this.receipts[id];
  }

  getReceipts(): IBaseReceipt[] {
    return Object.values(this.receipts);
  }

  getProtocol(protocolName: string): IProtocol {
    if (!this.protocolMap[protocolName]) {
      throw new Error(`Protocol ${protocolName} not found`);
    }
    return this.protocolMap[protocolName];
  }

  // Common order execution logic
  protected async placeOrder(order: IBaseOrder, maxRetries: number = 3): Promise<any> {
    console.log("placeOrder", order);
    let lastError: Error | unknown;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await this.getProtocol(order.protocolName).placeOrder(order.request);
      } catch (error) {
        lastError = error;
        this.logger.warn(`Order attempt ${i + 1} failed`, error.stack);
        await delay(2000);
      }
    }
    throw lastError;
  }

  protected async poll(
    getOrderResult: Promise<IBaseOrderResult>,
    cancelOrder?: Promise<void>,
    maxRetries: number = 3
  ): Promise<IBaseOrderResult> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const orderResult = await getOrderResult;
        return orderResult;
      } catch {
        await delay(1000);
      }
    }

    if (cancelOrder) {
      for (let i = 0; i < maxRetries; i++) {
        try {
          await cancelOrder;
          const orderResult = await getOrderResult;
          return orderResult;
        } catch {
          await delay(1000);
        }
      }
    }
    throw new Error("Poll order failed");
  }

  protected async orderWithPoll(order: IBaseOrder): Promise<IBaseOrderResult> {
    console.dir(order, { depth: null });
    try {
      const orderResponse = await this.placeOrder(order);
      const orderResult = await this.poll(
        this.protocolMap[order.protocolName].getOrderResult(orderResponse),
        this.protocolMap[order.protocolName].cancelOrder(orderResponse)
      );
      return orderResult;
    } catch (error) {
      this.logger.error('Order with poll failed', error.stack, 'orderWithPoll');
      throw error;
    }
  }

  async buildInternalPositions(orderResult: ISuccessBaseOrderResult): Promise<IBaseInternalPosition[]> {
    const positions: IBaseInternalPosition[] = [];
    const position: IBaseInternalPosition = {
      id: orderResult.result.id,
      protocol: orderResult.protocolName,
      status: 'opened',
      instrument: orderResult.result.instrument,
    }
    positions.push(position);
    return positions;
  }

  protected createSuccessReceipt(positions: IBasePosition[]): IBaseReceipt {
    return {
      id: crypto.randomUUID(),
      status: 'success',
      positions,
    };
  }

  protected createFailedReceipt(): IBaseReceipt {
    return {
      id: crypto.randomUUID(),
      status: 'failed',
      positions: [],
    };
  }

  protected storePositionAndReceipt(position: IBasePosition, receipt: IBaseReceipt): void {
    this.positions[position.id] = position;
    this.receipts[receipt.id] = receipt;
  }

  // =============== SQS 큐 관리 메소드들 ===============

  /**
   * 기회를 탐색 한 후 opportunity를 SQS 큐에 추가
   */
  async run(): Promise<IBaseReceipt[]> {
    const startTime = new Date();
    const opportunities = await this.findOpportunities();
    console.log("time taken to find opportunities...", new Date().getTime() - startTime.getTime());
    console.log("found opportunities...", opportunities.length);
    const receipts: IBaseReceipt[] = [];
    console.log("enqueueing opportunities...", opportunities.length);

    for (const opportunity of opportunities) {
      const processId = await this.enqueueOpportunity(opportunity);
      if (processId) {
        this.logger.log(`Opportunity queued with process ID: ${processId}`);
      }
    }
    console.log("time taken to enqueue opportunities...", new Date().getTime() - startTime.getTime());

    console.log("receipts...", receipts.length);

    return receipts;
  }

  /**
   * opportunity를 SQS 큐에 추가
   */
  protected async enqueueOpportunity(opportunity: IBaseOpportunity): Promise<string | null> {
    if (!this.processQueue) {
      this.logger.warn('Process queue not initialized. Skipping opportunity.');
      return null;
    }

    try {
      const canStart = await this.processQueue.canStartNewProcess();
      if (!canStart) {
        this.logger.warn('Maximum concurrent processes reached. Skipping opportunity.');
        return null;
      }

      const processId = await this.processQueue.enqueueProcess(this.name, opportunity);
      this.logger.log(`Opportunity enqueued with process ID: ${processId}`);
      return processId;
    } catch (error) {
      this.logger.error('Failed to enqueue opportunity', error.stack);
      return null;
    }
  }

  private async startProcessingQueue(): Promise<void> {
    this.isProcessingQueue = true;
    this.logger.log('Started processing queue');

    while (this.isProcessingQueue) {
      try {
        await this.processQueueMessage();
      } catch (error) {
        this.logger.error('Error processing queue', error.stack);
        await delay(1000);
      }
    }
  }

  /**
   * 큐에서 메시지를 하나 처리
   */
  private async processQueueMessage(): Promise<void> {
    if (!this.processQueue) return;

    const queueItem = await this.processQueue.dequeueProcess();
    if (!queueItem) return;

    const { message, receiptHandle } = queueItem;
    this.logger.log(`Processing message ${message.processId} in state ${message.state}, order ${message.currentOrderIndex}/${message.opportunity.orders.length}`);

    try {
      switch (message.state) {
        case ProcessState.PENDING:
          await this.processStartOrder(message, receiptHandle);
          break;
        case ProcessState.PLACING_ORDER:
          await this.processPlaceOrder(message, receiptHandle);
          break;
        case ProcessState.POLLING_ORDER:
          await this.processPollOrder(message, receiptHandle);
          break;
        case ProcessState.ORDER_COMPLETED:
          await this.processOrderCompleted(message, receiptHandle);
          break;
        case ProcessState.ALL_ORDERS_COMPLETED:
          await this.processAllOrdersCompleted(message, receiptHandle);
          break;
        default:
          await this.processQueue.completeProcess(receiptHandle);
      }
    } catch (error) {
      this.logger.error(`Process ${message.processId} failed`, error.stack);
      await this.handleProcessFailure(message, receiptHandle, error.message);
    }
  }

  /**
   * 프로세스 시작 - 첫 번째 주문 실행 시작
   */
  private async processStartOrder(message: ProcessMessage, receiptHandle: string): Promise<void> {
    if (!this.processQueue) return;

    this.logger.log(`Starting process ${message.processId} with ${message.opportunity.orders.length} orders`);

    // 첫 번째 주문 실행으로 상태 변경
    await this.processQueue.updateProcessState(
      receiptHandle,
      message,
      ProcessState.PLACING_ORDER
    );
  }

  /**
   * 주문 실행 단계 처리 - placeOrder 실행
   */
  private async processPlaceOrder(message: ProcessMessage, receiptHandle: string): Promise<void> {
    if (!this.processQueue) return;

    const currentOrder = message.opportunity.orders[message.currentOrderIndex];
    this.logger.log(`Executing order ${message.currentOrderIndex}: ${currentOrder.protocolName}`);

    try {
      // placeOrder 실행
      const orderResponse = await this.placeOrder(currentOrder);

      // 주문 응답 저장하고 폴링 단계로 이동
      const updatedMessage = {
        ...message,
        orderResponses: [...message.orderResponses, orderResponse],
      };

      await this.processQueue.updateProcessState(
        receiptHandle,
        updatedMessage,
        ProcessState.POLLING_ORDER
      );
    } catch (error) {
      if (message.attempts < message.maxRetries) {
        await this.processQueue.updateProcessState(
          receiptHandle,
          message,
          ProcessState.PLACING_ORDER,
          error.message
        );
      } else {
        await this.handleProcessFailure(message, receiptHandle, error.message);
      }
    }
  }

  /**
   * 주문 폴링 단계 처리 - poll 실행
   */
  private async processPollOrder(message: ProcessMessage, receiptHandle: string): Promise<void> {
    if (!this.processQueue) return;

    const currentOrder = message.opportunity.orders[message.currentOrderIndex];
    const orderResponse = message.orderResponses[message.currentOrderIndex];

    this.logger.log(`Polling order ${message.currentOrderIndex}: ${orderResponse.id}`);

    try {
      // poll 실행
      const orderResult = await this.poll(
        this.getProtocol(currentOrder.protocolName).getOrderResult(orderResponse),
        this.getProtocol(currentOrder.protocolName).cancelOrder(orderResponse)
      );

      // 주문 결과 검증 후 internal positions 생성
      if (!isSuccessOrderResult(orderResult)) {
        throw new Error(`Order failed with status: ${orderResult.status}`);
      }

      const newInternalPositions = await this.buildInternalPositions(orderResult);

      const updatedMessage = {
        ...message,
        internalPositions: [...message.internalPositions, ...newInternalPositions],
        attempts: 0, // 다음 주문을 위해 attempts 리셋
      };

      // 현재 주문 완료로 상태 변경
      await this.processQueue.updateProcessState(
        receiptHandle,
        updatedMessage,
        ProcessState.ORDER_COMPLETED
      );
    } catch (error) {
      if (message.attempts < message.maxRetries) {
        await this.processQueue.updateProcessState(
          receiptHandle,
          message,
          ProcessState.POLLING_ORDER,
          error.message
        );
      } else {
        await this.handleProcessFailure(message, receiptHandle, error.message);
      }
    }
  }

  /**
   * 현재 주문 완료 - 다음 주문으로 진행 또는 모든 주문 완료
   */
  private async processOrderCompleted(message: ProcessMessage, receiptHandle: string): Promise<void> {
    if (!this.processQueue) return;

    const nextOrderIndex = message.currentOrderIndex + 1;

    if (nextOrderIndex < message.opportunity.orders.length) {
      // 다음 주문이 있으면 계속 진행
      this.logger.log(`Order ${message.currentOrderIndex} completed, moving to order ${nextOrderIndex}`);

      const updatedMessage = {
        ...message,
        currentOrderIndex: nextOrderIndex,
      };

      await this.processQueue.updateProcessState(
        receiptHandle,
        updatedMessage,
        ProcessState.PLACING_ORDER
      );
    } else {
      // 모든 주문 완료
      this.logger.log(`All orders completed for process ${message.processId}`);

      await this.processQueue.updateProcessState(
        receiptHandle,
        message,
        ProcessState.ALL_ORDERS_COMPLETED
      );
    }
  }

  /**
   * 모든 주문 완료 - 영수증 생성 및 프로세스 완료
   */
  private async processAllOrdersCompleted(message: ProcessMessage, receiptHandle: string): Promise<void> {
    if (!this.processQueue) return;

    this.logger.log(`Creating receipt for process ${message.processId}`);

    try {
      // Position 생성
      const position: IBasePosition = {
        id: crypto.randomUUID(),
        status: 'opened',
        internalPositions: message.internalPositions,
      };

      // 성공 영수증 생성
      const receipt = this.createSuccessReceipt([position]);
      this.storePositionAndReceipt(position, receipt);

      // 프로세스 완료
      await this.processQueue.completeProcess(receiptHandle);
      this.logger.log(`Process ${message.processId} completed successfully`);
    } catch (error) {
      await this.handleProcessFailure(message, receiptHandle, error.message);
    }
  }

  /**
   * 프로세스 실패 처리
   */
  private async handleProcessFailure(
    message: ProcessMessage,
    receiptHandle: string,
    errorMessage: string
  ): Promise<void> {
    if (!this.processQueue) return;

    this.logger.error(`Process ${message.processId} failed permanently: ${errorMessage}`);

    // 실패 영수증 생성
    const failedReceipt = this.createFailedReceipt();
    this.receipts[failedReceipt.id] = failedReceipt;

    await this.processQueue.completeProcess(receiptHandle);
  }

  // =============== 추상 메소드들 ===============

  // Abstract methods that each strategy must implement
  abstract findOpportunities(): Promise<IBaseOpportunity[]>;
  abstract execute(opportunity: IBaseOpportunity): Promise<IBaseReceipt>;
  abstract getRealizedResult(): Promise<any[]>;
  abstract getUnrealizedResult(): Promise<any[]>;
}