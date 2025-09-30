import { IProtocol, OrderState } from "src/sdks/interfaces/protocol";
import { ISP1InternalPosition, ISP1MarketData, ISP1OrderData, ISP1OrderParams, ISP1OrderResult } from "./sp1.interfaces";

export class SP1 implements IProtocol {
  public readonly name = 'SP1';
  private readonly rpcUrl: string;
  private readonly privateKey: string;

  constructor(
    RPC_URL: string,
    privateKey: string,
  ) {
    this.rpcUrl = RPC_URL;
    this.privateKey = privateKey;
  }

  async createOrder(params: ISP1OrderParams): Promise<ISP1OrderData> {
    const id = crypto.randomUUID();
    return {
      id: id,
      instrument: params.instrument,
    }
  }

  async cancelOrder(
    orderData: ISP1OrderData
  ): Promise<void> {
    return;
  }

  async getOrderResult(
    orderData: ISP1OrderData
  ): Promise<ISP1OrderResult> {
    return {
      id: orderData.id,
      status: OrderState.FILLED,
      result: {
        instrument: '',
      },
    }
  }

  async getMarketData(): Promise<ISP1MarketData> {
    return {
      isAvailable: true,
    }
  }

  async getPosition(id: string): Promise<ISP1InternalPosition> {
    throw new Error('Not implemented');
  }
}