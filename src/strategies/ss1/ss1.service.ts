import { Injectable, OnApplicationShutdown, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IProtocol, isSuccessOrderResult, OrderState } from 'src/sdks/interfaces/protocol';
import { IBaseStrategy, OpportunityType } from 'src/sdks/interfaces/strategy';
import { SP1 } from 'src/protocols/sp1/sp1';
import dotenv from 'dotenv';
import { ISP1SuccessOrderResult, ISP1InternalPosition, ISP1MarketData } from 'src/protocols/sp1/sp1.interfaces';
import { delay, saveDataToFile, loadDataFromFile } from 'src/utils/utils';
import { ISS1Opportunity, ISS1OrderResponse, ISS1OrderResult, ISS1Position, ISS1Receipt, ISS1Order, ISS1RealizedResult, ISS1UnrealizedResult } from './ss1.interface';
dotenv.config();

@Injectable()
export class SS1Service implements IBaseStrategy, OnModuleInit, OnModuleDestroy, OnApplicationShutdown {
  public readonly name = 'SS1';
  private readonly logger = new Logger(SS1Service.name);
  public readonly protocolMap: Record<string, IProtocol>;
  private readonly positions: Record<string, ISS1Position> = {};
  private readonly receipts: Record<string, ISS1Receipt> = {};
  private readonly dataFilePath = './data/ss1-data.json';

  private sp1Name: string;

  constructor(
    private readonly sp1: SP1,
  ) {
    const url = process.env.SAMPLE_PROTOCOL_RPC_URL || '';
    const privateKey = process.env.SAMPLE_PROTOCOL_PRIVATE_KEY || '';
    if (url === '' || privateKey === '') {
      throw new Error('SAMPLE_PROTOCOL_RPC_URL or SAMPLE_PROTOCOL_PRIVATE_KEY is not set');
    }
    const _sp1 = new SP1(url, privateKey);
    this.sp1Name = _sp1.name;
    this.protocolMap = {
      [this.sp1Name]: _sp1,
    };
  }

  async onModuleInit() {
    this.logger.log("SS1Service initialized");
    await this.loadData();
  }

  async onModuleDestroy() {
    await this.saveData();
  }

  async onApplicationShutdown() {
    await this.saveData();
  }

  public async saveData(): Promise<void> {
    try {
      const data = {
        positions: this.positions,
        receipts: this.receipts,
      };
      await saveDataToFile(data, this.dataFilePath);
    } catch (error) {
      this.logger.error('Failed to save strategy data', error.stack, 'saveData');
    }
  }

  private async loadData(): Promise<void> {
    try {
      const defaultData = { positions: {}, receipts: {} };
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

  @Cron(CronExpression.EVERY_SECOND)
  async handleCron() {
    await this.process();
  }

  async findOpportunities(): Promise<ISS1Opportunity[]> {
    const marketData = await this.sp1.getMarketData();
    if (!marketData.isAvailable) {
      return [];
    }

    return [
      {
        description: 'Sample opportunity',
        type: OpportunityType.OPEN,
        orders: [
          {
            protocolName: this.sp1Name,
            request: { instrument: 'BTCUSDT' },
          },
        ],
      },
    ];
  }

  // get realized result from all Receipts
  async getRealizedResult(): Promise<ISS1RealizedResult[]> {
    throw new Error('Not implemented');
  }

  // get unrealized result from all alive positions
  async getUnrealizedResult(): Promise<ISS1UnrealizedResult[]> {
    throw new Error('Not implemented');
  }

  getPosition(id: string): ISS1Position {
    return this.positions[id];
  }

  getPositions(): ISS1Position[] {
    return Object.values(this.positions);
  }

  getReceipt(id: string): ISS1Receipt {
    return this.receipts[id];
  }

  getReceipts(): ISS1Receipt[] {
    return Object.values(this.receipts);
  }

  async getOrderStatus(orderId: string): Promise<{
    status: 'finished';
    result: ISS1OrderResult;
  } | {
    status: 'pending';
    error: string;
  }> {
    return {
      status: 'finished',
      result: {
        id: orderId,
        status: OrderState.FILLED,
        result: "successful!",
      },
    }
  }

  async process(): Promise<ISS1Receipt[]> {
    // find opportunities
    const opportunities = await this.findOpportunities();
    // get first opportunity
    const opportunity = opportunities[0];
    const receipt = await this.execute(opportunity);
    return [receipt];
  }

  async execute(opportunity: ISS1Opportunity): Promise<ISS1Receipt> {
    const newReceiptId = crypto.randomUUID();
    try {
      const internalPositions: ISP1InternalPosition[] = [];
      for (const order of opportunity.orders) {
        const orderResult = await this.orderWithPoll(order);
        if (!isSuccessOrderResult(orderResult)) {
          throw new Error(`Order failed with status: ${JSON.stringify(orderResult.result, null, 2)}`);
        }
        const _internalPositions = await this.buildInternalPositions(orderResult);
        internalPositions.push(..._internalPositions);
      }

      const position: ISS1Position = {
        id: crypto.randomUUID(),
        status: 'opened',
        internalPositions,
      }

      const receipt: ISS1Receipt = {
        id: newReceiptId,
        status: 'success',
        positions: [position],
      }

      this.positions[position.id] = position;
      this.receipts[receipt.id] = receipt;

      return receipt;
    } catch (error) {
      this.logger.error('Execute failed', error.stack, 'execute');
      return {
        id: newReceiptId,
        status: 'failed',
        positions: [],
      }
    }
  }

  async orderWithPoll(order: ISS1Order): Promise<ISS1OrderResult> {
    try {
      const orderResponse = await this.createOrderWithRetries(order);
      const orderResult = await this.poll(
        this.protocolMap[order.protocolName].getOrderResult(orderResponse),
        this.protocolMap[order.protocolName].cancelOrder(orderResponse),
      );
      return orderResult;
    } catch (error) {
      this.logger.error('Order with poll failed', error.stack, 'orderWithPoll');
      throw error;
    }
  }

  async createOrderWithRetries(order: ISS1Order): Promise<ISS1OrderResponse> {
    const maxRetries = 3;
    for (let i = 0; i < maxRetries; i++) {
      try {
        const orderResponse = await this.protocolMap[order.protocolName].createOrder(order.request);
        return orderResponse;
      } catch { }
    }
    throw new Error("Create order failed");
  }

  async poll(
    getOrderResult: Promise<ISS1OrderResult>,
    cancelOrder: Promise<void>,
  ): Promise<ISS1OrderResult> {
    const maxRetries = 3;
    for (let i = 0; i < maxRetries; i++) {
      try {
        const orderResult = await getOrderResult;
        return orderResult;
      } catch {
        await delay(1000);
      }
    }
    for (let i = 0; i < maxRetries; i++) {
      try {
        await cancelOrder;
        const orderResult = await getOrderResult;
        return orderResult;
      } catch {
        await delay(1000);
      }
    }
    throw new Error("Cancel order failed");
  }

  async buildInternalPositions(orderResult: ISP1SuccessOrderResult): Promise<ISP1InternalPosition[]> {
    const positions: ISP1InternalPosition[] = [];
    const position: ISP1InternalPosition = {
      id: orderResult.result.id,
      protocol: this.sp1Name,
      status: 'opened',
      instrument: orderResult.result.instrument,
    }
    positions.push(position);
    return positions;
  }
}