import { IBaseMarketData, IBaseOrderResponse, IBaseOrderRequest, IProtocol } from "./protocol";
import { IBasePosition, IBaseReceipt } from "./position";

export interface IBaseOrder {
  protocolName: string;
  request: IBaseOrderRequest;
}

export enum OpportunityType {
  OPEN = 'open',
  EDIT = 'edit',
  CLOSE = 'close',
}
interface IOpportunityBase {
  description: string;
  orders: IBaseOrder[];
  type: OpportunityType;
}

export interface IBaseOpenOpportunity extends IOpportunityBase {
  type: OpportunityType.OPEN;
}

export interface IBaseEditOpportunity extends IOpportunityBase {
  type: OpportunityType.EDIT;
  id: string;
}

export interface IBaseCloseOpportunity extends IOpportunityBase {
  type: OpportunityType.CLOSE;
  id: string;
}

export type IBaseOpportunity = IBaseOpenOpportunity | IBaseEditOpportunity | IBaseCloseOpportunity;


export interface IBaseExecutionConditionData {
  opportunities: IBaseOpportunity[];
}

export interface IBaseRealizedResult {
}

export interface IBaseUnrealizedResult {
}

export interface IBaseStrategy {
  name: string;
  protocolMap: Record<string, IProtocol>;
  findOpportunities(): Promise<IBaseOpportunity[]>;
  getRealizedResult(): Promise<IBaseRealizedResult[]>;
  getUnrealizedResult(): Promise<IBaseUnrealizedResult[]>;
  getPositions(): IBasePosition[];
  getPosition(id: string): IBasePosition;
  getReceipt(id: string): IBaseReceipt;
  getReceipts(): IBaseReceipt[];
  process(): Promise<IBaseReceipt[]>;
  execute(opportunity: IBaseOpportunity): Promise<IBaseReceipt>;
}