import { Injectable, OnApplicationShutdown, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IProtocol, isSuccessOrderResult, OrderState } from 'src/sdks/interfaces/protocol';
import { IBaseStrategy, OpportunityType } from 'src/sdks/interfaces/strategy';
import { Shadow } from 'src/protocols/shadow/shadow';
import dotenv from 'dotenv';
import { IShadowSuccessOrderResult, IShadowInternalPosition, IShadowMarketData } from 'src/protocols/shadow/shadow.interfaces';
import { delay, saveDataToFile, loadDataFromFile } from 'src/utils/utils';
import { IStrat1Opportunity, IStrat1OrderResponse, IStrat1OrderResult, IStrat1Position, IStrat1Receipt, IStrat1Order, IStrat1RealizedResult, IStrat1UnrealizedResult } from './strat1.interface';
import { Lighter } from 'src/protocols/lighter/lighter';
import { ILighterMarketData, ILighterConfig, ILighterOrderBookOrders } from 'src/protocols/lighter/lighter.interfaces';
import { tradeConfig } from './tradeConfig';
dotenv.config();

@Injectable()
export class Strat1Service implements IBaseStrategy, OnModuleInit, OnModuleDestroy, OnApplicationShutdown {
  public readonly name = 'Strat1';
  private readonly logger = new Logger(Strat1Service.name);
  public readonly protocolMap: Record<string, IProtocol>;
  private readonly positions: Record<string, IStrat1Position> = {};
  private readonly receipts: Record<string, IStrat1Receipt> = {};
  private readonly dataFilePath = './data/strat1-data.json';

  private shadowName: string;
  private shadow: Shadow;
  private lighterName: string;
  private lighter: Lighter;

  constructor() {
    const url = process.env.KURA_RPC_URL || '';
    const privateKey = process.env.KURA_PRIVATE_KEY || '';
    if (url === '' || privateKey === '') {
      throw new Error('KURA_RPC_URL or KURA_PRIVATE_KEY is not set');
    }
    const publicKey = process.env.KURA_PUBLIC_KEY || '';
    const shadowApiUrl = process.env.KURA_SHADOW_API_URL || '';
    this.logger.log(`KURA_RPC_URL: ${url}`);
    this.shadow = new Shadow(shadowApiUrl, url, privateKey, publicKey);
    this.shadowName = this.shadow.name;

    const lighterConfig: ILighterConfig = {
      baseUrl: process.env.LIGHTER_RPC_URL || '',
      apiKeyPrivateKey: process.env.LIGHTER_PRIVATE_KEY || '',
      publicKey: process.env.LIGHTER_PUBLIC_KEY || '',
      accountIndex: 1,
      apiKeyIndex: 1,
    };
    this.lighter = new Lighter(lighterConfig);
    this.lighterName = this.lighter.name;
    this.protocolMap = {
      [this.shadowName]: this.shadow,
      [this.lighterName]: this.lighter,
    };
  }

  async onModuleInit() {
    this.logger.log("Strat1Service initialized");
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

  @Cron(tradeConfig.cron)
  async handleCron() {
    await this.process();
  }

  async findOpportunities(): Promise<IStrat1Opportunity[]> {
    const [shadowMarketData, lighterMarketData] = await Promise.all([
      this.shadow.getMarketData({
        symbols: tradeConfig.symbols,
        values: tradeConfig.inputValues,
        roughPriceMap: tradeConfig.roughPriceMap,
      }),
      this.lighter.getMarketData({
        symbols: tradeConfig.symbols,
      }),
    ]);
    saveDataToFile(shadowMarketData, './data/shadow-market-data.json');
    saveDataToFile(lighterMarketData, './data/lighter-market-data.json');

    // Convert Lighter market data to amountIn -> amountOut mapping
    const lighterConvertedData = this.convertLighterMarketData(lighterMarketData);
    saveDataToFile(lighterConvertedData, './data/lighter-converted-data.json');

    if (!shadowMarketData.isAvailable) {
      return [];
    }

    return [];
  }

  private convertLighterMarketData(lighterMarketData: ILighterMarketData): Record<string, Record<number, {
    buy: {
      amountIn: number;
      amountOut: number;
    };
    sell: {
      amountIn: number;
      amountOut: number;
    }
  }>> {
    const result: Record<string, Record<number, {
      buy: {
        amountIn: number;
        amountOut: number;
      };
      sell: {
        amountIn: number;
        amountOut: number;
      };
    }>> = {};

    if (!lighterMarketData.isAvailable || !lighterMarketData.orderBookOrders) {
      return result;
    }

    // Process each symbol's order book data
    for (const [symbol, orderBookData] of Object.entries(lighterMarketData.orderBookOrders)) {
      result[symbol] = {};

      // For each input amount, calculate both buy and sell
      for (const value of tradeConfig.inputValues) {
        // Buy: spend USDC to get tokens (using asks)
        const amountOutBuy = this.calculateBuyAmountOut(orderBookData, value);

        // Sell: sell tokens to get USDC (using bids)
        const amountInSell = value / tradeConfig.roughPriceMap[symbol]; // Convert USDC to token amount
        const amountOutSell = this.calculateSellAmountOut(orderBookData, amountInSell);

        result[symbol][value] = {
          buy: {
            amountIn: value, // USDC amount
            amountOut: amountOutBuy, // Token amount received
          },
          sell: {
            amountIn: amountInSell, // Token amount to sell
            amountOut: amountOutSell, // USDC amount received
          },
        };
      }
    }

    return result;
  }

  private calculateBuyAmountOut(orderBookData: ILighterOrderBookOrders, usdcAmount: number): number {
    if (!orderBookData.asks || orderBookData.asks.length === 0) {
      return 0;
    }

    let remainingUSDC = usdcAmount;
    let totalTokenAmount = 0;

    // Sort asks by price (ascending - cheapest first)
    const sortedAsks = [...orderBookData.asks].sort((a, b) => parseFloat(a.price) - parseFloat(b.price));

    for (const ask of sortedAsks) {
      if (remainingUSDC <= 0) break;

      const price = parseFloat(ask.price);
      const availableTokens = parseFloat(ask.remaining_base_amount);
      const maxTokensWCanBuy = remainingUSDC / price;

      // Take the minimum of what's available and what we can afford
      const tokensToBuy = Math.min(availableTokens, maxTokensWCanBuy);
      const costInUSDC = tokensToBuy * price;
      totalTokenAmount += tokensToBuy;
      remainingUSDC -= costInUSDC;
    }

    return totalTokenAmount;
  }

  private calculateSellAmountOut(orderBookData: ILighterOrderBookOrders, tokenAmount: number): number {
    if (!orderBookData.bids || orderBookData.bids.length === 0) {
      return 0;
    }

    let remainingTokens = tokenAmount;
    let totalUSDCAmount = 0;

    // Sort bids by price (descending - highest price first)
    const sortedBids = [...orderBookData.bids].sort((a, b) => parseFloat(b.price) - parseFloat(a.price));

    for (const bid of sortedBids) {
      if (remainingTokens <= 0) break;

      const price = parseFloat(bid.price);
      const availableTokenDemand = parseFloat(bid.remaining_base_amount);

      // Take the minimum of what they want to buy and what we have to sell
      const tokensToSell = Math.min(availableTokenDemand, remainingTokens);
      const usdcReceived = tokensToSell * price;

      totalUSDCAmount += usdcReceived;
      remainingTokens -= tokensToSell;
    }

    return totalUSDCAmount;
  }

  // get realized result from all Receipts
  async getRealizedResult(): Promise<IStrat1RealizedResult[]> {
    throw new Error('Not implemented');
  }

  // get unrealized result from all alive positions
  async getUnrealizedResult(): Promise<IStrat1UnrealizedResult[]> {
    throw new Error('Not implemented');
  }

  getPosition(id: string): IStrat1Position {
    return this.positions[id];
  }

  getPositions(): IStrat1Position[] {
    return Object.values(this.positions);
  }

  getReceipt(id: string): IStrat1Receipt {
    return this.receipts[id];
  }

  getReceipts(): IStrat1Receipt[] {
    return Object.values(this.receipts);
  }

  async getOrderStatus(orderId: string): Promise<{
    status: 'finished';
    result: IStrat1OrderResult;
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

  async process(): Promise<IStrat1Receipt[]> {
    // find opportunities
    const opportunities = await this.findOpportunities();
    const receipts: IStrat1Receipt[] = [];
    for (const opportunity of opportunities) {
      const receipt = await this.execute(opportunity);
      receipts.push(receipt);
    }
    return receipts;
  }

  async execute(opportunity: IStrat1Opportunity): Promise<IStrat1Receipt> {
    const newReceiptId = crypto.randomUUID();
    try {
      const internalPositions: IShadowInternalPosition[] = [];
      let status: 'success' | 'failed' = 'success';
      for (const order of opportunity.orders) {
        const orderResult = await this.orderWithPoll(order);
        if (!isSuccessOrderResult(orderResult)) {
          this.logger.error(`Order failed with status: ${JSON.stringify(orderResult.result, null, 2)}`, '', 'execute');
          status = 'failed';
          break;
        }
        const _internalPositions = await this.buildInternalPositions(orderResult);
        internalPositions.push(..._internalPositions);
      }

      const position: IStrat1Position = {
        id: crypto.randomUUID(),
        status: 'opened',
        internalPositions,
      }

      const receipt: IStrat1Receipt = {
        id: newReceiptId,
        status,
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

  async orderWithPoll(order: IStrat1Order): Promise<IStrat1OrderResult> {
    try {
      const orderResponse = await this.createOrderWithRetries(order);
      const orderResult = await this.poll(
        this.protocolMap[order.protocolName].getOrderResult(orderResponse),
        order.protocolName === this.shadowName
          ? undefined // skip cancel order for shadow
          : this.protocolMap[order.protocolName].cancelOrder(orderResponse),
      );
      return orderResult;
    } catch (error) {
      this.logger.error('Order with poll failed', error.stack, 'orderWithPoll');
      throw error;
    }
  }

  async createOrderWithRetries(order: IStrat1Order): Promise<IStrat1OrderResponse> {
    const maxRetries = 3;
    let lastError: Error | unknown;
    for (let i = 0; i < maxRetries; i++) {
      try {
        const orderResponse = await this.protocolMap[order.protocolName].createOrder(order.request);
        return orderResponse;
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error("Create order failed", { cause: lastError });
  }

  async poll(
    getOrderResult: Promise<IStrat1OrderResult>,
    cancelOrder?: Promise<void>,
  ): Promise<IStrat1OrderResult> {
    const maxRetries = 3;
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
    throw new Error("Cancel order failed");
  }

  async buildInternalPositions(orderResult: IShadowSuccessOrderResult): Promise<IShadowInternalPosition[]> {
    const positions: IShadowInternalPosition[] = [];
    const position: IShadowInternalPosition = {
      id: orderResult.result.id,
      protocol: this.shadowName,
      status: 'opened',
      instrument: orderResult.result.instrument,
    }
    positions.push(position);
    return positions;
  }
}