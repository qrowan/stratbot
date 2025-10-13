import { IBaseInternalPosition, IBasePosition, IBaseReceipt } from "src/sdks/interfaces/position";
import { IBaseOrderResponse, IBaseOrderResult } from "src/sdks/interfaces/protocol";
import { IBaseOpenOpportunity, IBaseEditOpportunity, IBaseCloseOpportunity, IBaseRealizedResult, IBaseUnrealizedResult, IBaseOrder } from "src/sdks/interfaces/strategy";
import { IShadowInternalPosition, IShadowOrderRequest, IShadowOrderResult, IShadowSuccessOrderResult } from "src/protocols/shadow/shadow.interfaces";
import { ILighterInternalPosition, ILighterOrderParams, ILighterOrderResult, ILighterSuccessOrderResult } from "src/protocols/lighter/lighter.interfaces";


export interface IStrat1OpportunityBaseInfo {
  direction: "long_shadow_short_lighter" | "short_shadow_long_lighter";
  symbol: string;
}
export interface IStrat1OpenOpportunity extends IBaseOpenOpportunity, IStrat1OpportunityBaseInfo {
  orders: IStrat1Order[];
  multiplier: number;
}

export interface IStrat1EditOpportunity extends IBaseEditOpportunity, IStrat1OpportunityBaseInfo {
  orders: IStrat1Order[];
  multiplier: number;
}

export interface IStrat1CloseOpportunity extends IBaseCloseOpportunity, IStrat1OpportunityBaseInfo {
  orders: IStrat1Order[];
  multiplier: number;
}

export type IStrat1Opportunity = IStrat1OpenOpportunity | IStrat1EditOpportunity | IStrat1CloseOpportunity;

export interface IStrat1RealizedResult extends IBaseRealizedResult { }

export interface IStrat1UnrealizedResult extends IBaseUnrealizedResult { }

export interface IStrat1Position extends IBasePosition { }

export interface IStrat1Receipt extends IBaseReceipt { }

export interface IShadowOrder extends IBaseOrder {
  request: IShadowOrderRequest;
}

export interface ILighterOrder extends IBaseOrder {
  request: ILighterOrderParams;
}

export type IStrat1Order = IShadowOrder | ILighterOrder;

export type IStrat1OrderResult = IShadowOrderResult | ILighterOrderResult

export type ISuccessStrat1OrderResult = IShadowSuccessOrderResult | ILighterSuccessOrderResult

export interface IStrat1OrderResponse extends IBaseOrderResponse { }

export type LighterConvertedMarketData = Record<string, Record<number, {
  buy: {
    amountIn: number;
    amountOut: number;
  };
  sell: {
    amountIn: number;
    amountOut: number;
  }
}>>

export type IStrat1InternalPosition = IShadowInternalPosition | ILighterInternalPosition
