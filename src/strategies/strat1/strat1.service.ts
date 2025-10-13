import { Injectable, OnApplicationShutdown, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IProtocol, isSuccessOrderResult, OrderState } from 'src/sdks/interfaces/protocol';
import { BaseStrategy, OpportunityType } from 'src/sdks/interfaces/strategy';
import { Shadow } from 'src/protocols/shadow/shadow';
import dotenv from 'dotenv';
import { IShadowSuccessOrderResult, IShadowInternalPosition, IShadowMarketData } from 'src/protocols/shadow/shadow.interfaces';
import { delay, saveDataToFile, loadDataFromFile } from 'src/utils/utils';
import { IStrat1Opportunity, IStrat1OrderResponse, IStrat1OrderResult, IStrat1Position, IStrat1Receipt, IStrat1Order, IStrat1RealizedResult, IStrat1UnrealizedResult, LighterConvertedMarketData, IShadowOrder, ILighterOrder, ISuccessStrat1OrderResult, IStrat1InternalPosition } from './strat1.interface';
import { Lighter } from 'src/protocols/lighter/lighter';
import { ILighterMarketData, ILighterConfig, ILighterOrderBookOrders, LighterOrderType, LighterTimeInForce } from 'src/protocols/lighter/lighter.interfaces';
import { tradeConfig } from './tradeConfig';
import { MARKET_ID_MAP } from 'src/protocols/lighter/constants';
import { QueueManager } from 'src/sdks/queue/QueueManager';
dotenv.config();

@Injectable()
export class Strat1Service extends BaseStrategy {
  public name = 'Strat1';
  public readonly protocolMap: Record<string, IProtocol>;

  private shadow: Shadow;
  private lighter: Lighter;

  constructor() {
    const processQueue = new QueueManager(tradeConfig.processQueueConfig);
    super('Strat1', processQueue);
    this.name = 'Strat1';

    this.shadow = new Shadow(tradeConfig.shadowConfig.url, tradeConfig.shadowConfig.privateKey, tradeConfig.shadowConfig.publicKey);

    this.lighter = new Lighter(tradeConfig.lighterConfig);
    this.protocolMap = {
      [this.shadow.name]: this.shadow,
      [this.lighter.name]: this.lighter,
    };
  }


  @Cron(tradeConfig.cron)
  async handleCron() {
    await this.run();
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

    if (!shadowMarketData.isAvailable) {
      this.logger.error('Shadow market data is not available');
      return [];
    }
    if (!lighterMarketData.isAvailable) {
      this.logger.error('Lighter market data is not available');
      return [];
    }

    // Convert Lighter market data to amountIn -> amountOut mapping
    const lighterConvertedData = this.convertLighterMarketData(lighterMarketData);
    saveDataToFile(lighterConvertedData, './data/lighter-converted-data.json');

    const opportunities: IStrat1Opportunity[] = this._getOpportunities(shadowMarketData, lighterConvertedData);
    const filteredOpportunities = this.filterOpportunities(opportunities);
    saveDataToFile(filteredOpportunities, './data/opportunities.json');

    return filteredOpportunities;
  }

  private _getOpportunities(shadowMarketData: IShadowMarketData, lighterConvertedData: LighterConvertedMarketData): IStrat1Opportunity[] {
    const opportunities: IStrat1Opportunity[] = [];
    for (const symbol of tradeConfig.symbols) {
      for (const value of tradeConfig.inputValues) {
        const shadowQuote = shadowMarketData.quotes[symbol][value];
        const lighterQuote = lighterConvertedData[symbol][value];
        const shadowBuyRatio = shadowQuote.buy.amountOut / shadowQuote.buy.amountIn;
        // 0.08 BTC / 100 USDC
        const lighterSellRatio = lighterQuote.sell.amountOut / lighterQuote.sell.amountIn
        // 101 USDC / 0.89 BTC
        const mulitiplier = shadowBuyRatio * lighterSellRatio;

        if (mulitiplier > tradeConfig.minMultiplier) {
          const firstOrder: IShadowOrder = {
            protocolName: this.shadow.name,
            request: {
              tokenInSymbol: "USDC",
              tokenOutSymbol: symbol,
              amountInWei: shadowQuote.buy.amountInWei,
              callData: shadowQuote.buy.callData,
              value: shadowQuote.buy.value,
              instrument: symbol
            },
          };
          const secondOrder: ILighterOrder = {
            protocolName: this.lighter.name,
            request: {
              marketIndex: MARKET_ID_MAP[symbol],
              clientOrderIndex: 0,
              baseAmount: lighterQuote.buy.amountIn.toString(),
              price: Math.floor(1000000 * lighterQuote.buy.amountIn / lighterQuote.buy.amountOut).toString(),
              isAsk: true,
              orderType: LighterOrderType.LIMIT,
              timeInForce: LighterTimeInForce.GOOD_TILL_TIME,
              reduceOnly: false,
              instrument: symbol
            },
          }
          opportunities.push({
            description: `Long SHADOW and short LIGHTER`,
            type: OpportunityType.OPEN,
            direction: "long_shadow_short_lighter",
            symbol: symbol,
            orders: [firstOrder, secondOrder],
            multiplier: mulitiplier,
          });
        } // TODO : add close
      }
    }
    return opportunities;
  }

  private filterOpportunities(opportunities: IStrat1Opportunity[]): IStrat1Opportunity[] {
    return opportunities.sort((a, b) => b.multiplier - a.multiplier).slice(0, tradeConfig.maxOpportunities);
  }

  private convertLighterMarketData(lighterMarketData: ILighterMarketData): LighterConvertedMarketData {
    const result: LighterConvertedMarketData = {};

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

  async execute(opportunity: IStrat1Opportunity): Promise<IStrat1Receipt> {
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

      const receipt = status === 'success'
        ? this.createSuccessReceipt([position])
        : this.createFailedReceipt();

      if (status === 'success') {
        this.storePositionAndReceipt(position, receipt);
      }

      return receipt;
    } catch (error) {
      this.logger.error('Execute failed', error.stack, 'execute');
      return this.createFailedReceipt();
    }
  }
}