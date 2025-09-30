import { IBasePosition, IBaseReceipt } from "src/sdks/interfaces/position";
import { IBaseOrderResponse, IBaseOrderResult } from "src/sdks/interfaces/protocol";
import { IBaseOpenOpportunity, IBaseEditOpportunity, IBaseCloseOpportunity, IBaseRealizedResult, IBaseUnrealizedResult, IBaseOrder } from "src/sdks/interfaces/strategy";

export interface ISS1OpenOpportunity extends IBaseOpenOpportunity { }

export interface ISS1EditOpportunity extends IBaseEditOpportunity { }

export interface ISS1CloseOpportunity extends IBaseCloseOpportunity { }

export type ISS1Opportunity = ISS1OpenOpportunity | ISS1EditOpportunity | ISS1CloseOpportunity;

export interface ISS1RealizedResult extends IBaseRealizedResult { }

export interface ISS1UnrealizedResult extends IBaseUnrealizedResult { }

export interface ISS1Position extends IBasePosition { }

export interface ISS1Receipt extends IBaseReceipt { }

export interface ISS1Order extends IBaseOrder { }

export interface ISS1OrderResult extends IBaseOrderResult { }

export interface ISS1OrderResponse extends IBaseOrderResponse { }

