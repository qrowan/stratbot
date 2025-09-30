import { IBaseInternalPosition } from "./position";

export enum OrderState {
  PENDING = "pending",
  LIVE = "live", // only maker order
  CANCELED = "canceled",
  PARTIAL_FILLED = "partially_filled",
  FILLED = "filled",
}

export const ALIVE_ORDER_STATES = [OrderState.LIVE, OrderState.PENDING, OrderState.PARTIAL_FILLED];

export const isAliveOrderState = (state: OrderState) => ALIVE_ORDER_STATES.includes(state);

export interface IBaseMarketData {
  isAvailable: boolean;
}

export interface IBaseMarketDataRequest {
}


// data about internal position from protocol API

export interface IBaseOrderRequest {
  instrument: string;
}

export interface IBaseOrderResponse {
  instrument: string;
  id: string;
}

export interface IBaseOrderResult {
  id: string;
  status: OrderState;
  result: any;
}
export interface ISuccessBaseOrderResult extends IBaseOrderResult {
  status: OrderState.FILLED;
  result: any;
}

export function isSuccessOrderResult(result: IBaseOrderResult): result is ISuccessBaseOrderResult {
  return result.status === OrderState.FILLED;
}

export interface IProtocol {
  name: string;
  // order
  createOrder(request: IBaseOrderRequest): Promise<IBaseOrderResponse>;
  // cancel order. return cancel success or not.
  cancelOrder(
    orderData: IBaseOrderResponse
  ): Promise<void>;
  // get order success or not + result of order
  getOrderResult(
    orderData: IBaseOrderResponse
  ): Promise<IBaseOrderResult>;
  // market data
  getMarketData(request: IBaseMarketDataRequest): Promise<IBaseMarketData>;
  getPosition(id: string): Promise<IBaseInternalPosition>;
}