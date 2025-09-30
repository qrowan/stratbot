import {
  IBaseMarketData,
  IBaseOrderResponse,
  IBaseOrderRequest,
  IBaseOrderResult,
  ISuccessBaseOrderResult,
  IBaseMarketDataRequest,
} from 'src/sdks/interfaces/protocol';
import { IBaseInternalPosition } from 'src/sdks/interfaces/position';

// Enums based on Python reference
export enum LighterOrderType {
  LIMIT = 0,
  MARKET = 1,
  STOP_LOSS = 2,
  STOP_LOSS_LIMIT = 3,
  TAKE_PROFIT = 4,
  TAKE_PROFIT_LIMIT = 5,
  TWAP = 6,
  TWAP_SUB = 7,
  LIQUIDATION = 8,
}

export enum LighterTimeInForce {
  GOOD_TILL_TIME = 0,
  IMMEDIATE_OR_CANCEL = 1,
  POST_ONLY = 2,
  UNKNOWN = 3,
}

export enum LighterOrderStatus {
  IN_PROGRESS = 'in-progress',
  PENDING = 'pending',
  OPEN = 'open',
  FILLED = 'filled',
  CANCELED = 'canceled',
  CANCELED_POST_ONLY = 'canceled-post-only',
  CANCELED_REDUCE_ONLY = 'canceled-reduce-only',
  CANCELED_POSITION_NOT_ALLOWED = 'canceled-position-not-allowed',
  CANCELED_MARGIN_NOT_ALLOWED = 'canceled-margin-not-allowed',
  CANCELED_TOO_MUCH_SLIPPAGE = 'canceled-too-much-slippage',
  CANCELED_NOT_ENOUGH_LIQUIDITY = 'canceled-not-enough-liquidity',
  CANCELED_SELF_TRADE = 'canceled-self-trade',
  CANCELED_EXPIRED = 'canceled-expired',
  CANCELED_OCO = 'canceled-oco',
  CANCELED_CHILD = 'canceled-child',
  CANCELED_LIQUIDATION = 'canceled-liquidation',
}

// Order creation parameters
export interface ILighterOrderParams extends IBaseOrderRequest {
  marketIndex: number;
  clientOrderIndex: number;
  baseAmount: string; // Use string for precise decimal handling
  price: string; // Use string for precise decimal handling
  isAsk: boolean; // true for sell, false for buy
  orderType: LighterOrderType;
  timeInForce: LighterTimeInForce;
  reduceOnly: boolean;
  triggerPrice?: string;
  expiredAt?: number; // Unix timestamp
}

// Order response data
export interface ILighterOrderData extends IBaseOrderResponse {
  txHash: string;
  marketIndex: number;
  clientOrderIndex: number;
  nonce: number;
  params: ILighterOrderParams;
}

export interface ILighterMarketDataRequest extends IBaseMarketDataRequest {
  symbols: string[];
}

// Market data structure
export interface ILighterMarketData extends IBaseMarketData {
  orderBookOrders: Record<string, ILighterOrderBookOrders>; // symbol -> order book orders
}

// API Response types (matching actual API format)
export interface ILighterOrderBookOrdersApiResponse {
  code: number;
  message?: string;
  total_asks: number;
  asks: ILighterOrderApiResponse[];
  total_bids: number;
  bids: ILighterOrderApiResponse[];
}

export interface ILighterOrderApiResponse {
  order_index: number;
  order_id: string;
  owner_account_index: number;
  initial_base_amount: string;
  remaining_base_amount: string;
  price: string;
  order_expiry: number;
}

// Interface for internal use (keeping API format for consistency)
export interface ILighterOrderBookOrders {
  code: number;
  message?: string;
  total_asks: number;
  asks: ILighterSimpleOrder[];
  total_bids: number;
  bids: ILighterSimpleOrder[];
}

export interface ILighterSimpleOrder {
  order_index: number;
  order_id: string;
  owner_account_index: number;
  initial_base_amount: string;
  remaining_base_amount: string;
  price: string;
  order_expiry: number;
}

// API response for account orders
export interface ILighterOrdersApiResponse {
  code: number;
  message?: string;
  next_cursor?: string;
  orders: ILighterOrderApiData[];
}

export interface ILighterOrderApiData {
  order_index: number;
  client_order_index: number;
  order_id: string;
  client_order_id: string;
  market_index: number;
  owner_account_index: number;
  initial_base_amount: string;
  price: string;
  remaining_base_amount: string;
  filled_base_amount: string;
  filled_quote_amount: string;
  status: string;
  is_ask: number;
  side: string;
  type: string;
  time_in_force: string;
  reduce_only: number;
  timestamp: number;
  block_height: number;
}

// Order result with Lighter-specific status
export interface ILighterOrderResult extends IBaseOrderResult {
  lighterStatus: LighterOrderStatus;
  filledBaseAmount?: string;
  filledQuoteAmount?: string;
  remainingBaseAmount?: string;
}

export interface ILighterSuccessOrderResult extends ISuccessBaseOrderResult {
  lighterStatus: LighterOrderStatus.FILLED;
  filledBaseAmount: string;
  filledQuoteAmount: string;
}

// Position data
export interface ILighterInternalPosition extends IBaseInternalPosition {
  marketIndex: number;
  baseAmount: string;
  quoteAmount: string;
  unrealizedPnl?: string;
  realizedPnl?: string;
}

// Authentication interfaces
export interface ILighterApiKey {
  privateKey: string;
  publicKey: string;
}

export interface ILighterAuthToken {
  token: string;
  expiry: number; // Unix timestamp
}

// Transaction interfaces (matches Python reference sign_create_order parameters)
export interface ILighterTransaction {
  market_index: number;
  client_order_index: number;
  base_amount: string;
  price: string;
  is_ask: number; // 0 or 1
  order_type: number;
  time_in_force: number;
  reduce_only: number; // 0 or 1
  trigger_price: string;
  order_expiry: number;
  nonce: number;
}

// Configuration interface
export interface ILighterConfig {
  baseUrl: string;
  apiKeyPrivateKey: string;
  publicKey: string;
  accountIndex: number;
  apiKeyIndex: number;
}

// API response interfaces
export interface ILighterSendTxResponse {
  code: number;
  message?: string;
  tx_hash?: string;
}