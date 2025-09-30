import { IBasePosition, IBaseReceipt } from "src/sdks/interfaces/position";
import { IBaseOrderResponse, IBaseOrderResult } from "src/sdks/interfaces/protocol";
import { IBaseOpenOpportunity, IBaseEditOpportunity, IBaseCloseOpportunity, IBaseRealizedResult, IBaseUnrealizedResult, IBaseOrder } from "src/sdks/interfaces/strategy";
import { IShadowOrderRequest } from "src/protocols/shadow/shadow.interfaces";

export interface IStrat1OpenOpportunity extends IBaseOpenOpportunity {
  shadowOrderParams: IShadowOrderRequest;
  orders: IShadowOrder[];
}

export interface IStrat1EditOpportunity extends IBaseEditOpportunity {
  shadowOrderParams: IShadowOrderRequest;
  orders: IShadowOrder[];
}

export interface IStrat1CloseOpportunity extends IBaseCloseOpportunity {
  shadowOrderParams: IShadowOrderRequest;
  orders: IShadowOrder[];
}

export type IStrat1Opportunity = IStrat1OpenOpportunity | IStrat1EditOpportunity | IStrat1CloseOpportunity;

export interface IStrat1RealizedResult extends IBaseRealizedResult { }

export interface IStrat1UnrealizedResult extends IBaseUnrealizedResult { }

export interface IStrat1Position extends IBasePosition { }

export interface IStrat1Receipt extends IBaseReceipt { }

export interface IShadowOrder extends IBaseOrder {
  protocolName: string;
  request: IShadowOrderRequest;
}

export type IStrat1Order = IShadowOrder;

export interface IStrat1OrderResult extends IBaseOrderResult { }

export interface IStrat1OrderResponse extends IBaseOrderResponse { }

