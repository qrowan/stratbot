import { IBaseMarketData, IBaseOrderResponse, IBaseOrderRequest, IBaseOrderResult, ISuccessBaseOrderResult } from "src/sdks/interfaces/protocol";
import { IBaseInternalPosition } from "src/sdks/interfaces/position";

export interface ISP1OrderParams extends IBaseOrderRequest {
}

export interface ISP1OrderData extends IBaseOrderResponse {
}

export interface ISP1MarketData extends IBaseMarketData {
}

export interface ISP1OrderResult extends IBaseOrderResult { }
export interface ISP1SuccessOrderResult extends ISuccessBaseOrderResult { }
export interface ISP1InternalPosition extends IBaseInternalPosition {
}
