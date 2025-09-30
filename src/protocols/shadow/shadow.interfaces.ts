import { IBaseMarketData, IBaseMarketDataRequest, IBaseOrderResponse, IBaseOrderRequest, IBaseOrderResult, ISuccessBaseOrderResult } from "src/sdks/interfaces/protocol";
import { IBaseInternalPosition } from "src/sdks/interfaces/position";
import { Hex } from "viem";
import { ChecksumAddress } from "src/utils/checksumAddress";

export interface IShadowOrderRequest extends IBaseOrderRequest {
  tokenIn: ChecksumAddress;
  tokenOut: ChecksumAddress;
  amountIn: number;
  callData: string;
  value: number;
}

export interface IShadowOrderData extends IBaseOrderResponse {
  txHash: Hex;
  params: IShadowOrderRequest;
}

export interface IShadowMarketDataRequest extends IBaseMarketDataRequest {
  symbols: string[]; // tokens to quote
  values: number[]; // values in USD to quote
  roughPriceMap: Record<string, number>; // rough price map of tokens to quote.
}

export interface IShadowMarketData extends IBaseMarketData {
  // token symbol => value => {buy: quote result, sell: quote result}
  quotes: Record<string, Record<number, {
    buy: IQuoteResult;
    sell: IQuoteResult;
  }>>;
}

export interface IQuoteResult {
  amountIn: number;
  amountOut: number;
  callData: string;
  value: number;
  rawData: any;
}


export interface IShadowOrderResult extends IBaseOrderResult { }
export interface IShadowSuccessOrderResult extends ISuccessBaseOrderResult { }
export interface IShadowInternalPosition extends IBaseInternalPosition {
}
