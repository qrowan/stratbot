import { Injectable, OnApplicationShutdown, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IProtocol, isSuccessOrderResult, OrderState } from 'src/sdks/interfaces/protocol';
import { BaseStrategy, OpportunityType } from 'src/sdks/interfaces/strategy';
import { SP1 } from 'src/protocols/sp1/sp1';
import dotenv from 'dotenv';
import { ISP1SuccessOrderResult, ISP1InternalPosition, ISP1MarketData } from 'src/protocols/sp1/sp1.interfaces';
import { delay, saveDataToFile, loadDataFromFile } from 'src/utils/utils';
import { ISS1Opportunity, ISS1OrderResponse, ISS1OrderResult, ISS1Position, ISS1Receipt, ISS1Order, ISS1RealizedResult, ISS1UnrealizedResult } from './ss1.interface';
dotenv.config();

@Injectable()
export class SS1Service extends BaseStrategy {
  public readonly name = 'SS1';
  public readonly protocolMap: Record<string, IProtocol>;

  private sp1Name: string;

  constructor(
    private readonly sp1: SP1,
  ) {
    super('SS1Service'); // SQS 큐는 나중에 설정
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


  @Cron(CronExpression.EVERY_SECOND)
  async handleCron() {
    await this.run();
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

  async execute(opportunity: ISS1Opportunity): Promise<ISS1Receipt> {
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

      const receipt = this.createSuccessReceipt([position]);
      this.storePositionAndReceipt(position, receipt);
      return receipt;
    } catch (error) {
      this.logger.error('Execute failed', error.stack, 'execute');
      return this.createFailedReceipt();
    }
  }
}