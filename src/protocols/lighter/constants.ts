import { OrderState } from "src/sdks/interfaces/protocol";
import { LighterOrderStatus } from "./lighter.interfaces";

// Market ID mapping based on Lighter protocol
export const MARKET_ID_MAP: Record<string, number> = {
  'ETH': 0,
  'BTC': 1,
  'SEI': 32,
};

// API endpoints
export const ENDPOINTS = {
  SEND_TX: '/api/v1/sendTx',
  SEND_TX_BATCH: '/api/v1/sendTxBatch',
  NEXT_NONCE: '/api/v1/nextNonce',
  ORDER_BOOK_ORDERS: '/api/v1/orderBookOrders',
  ACCOUNT_ACTIVE_ORDERS: '/api/v1/accountActiveOrders',
  ACCOUNT_INACTIVE_ORDERS: '/api/v1/accountInactiveOrders',
} as const;

// Response codes
export const CODE_OK = 200;

/**
 * LighterOrderStatus to OrderState mapping
 * */
export const LIGHTER_STATUS_MAP = {
  [LighterOrderStatus.FILLED]: OrderState.FILLED,
  [LighterOrderStatus.OPEN]: OrderState.PENDING,
  [LighterOrderStatus.PENDING]: OrderState.PENDING,
  [LighterOrderStatus.IN_PROGRESS]: OrderState.PENDING,
  [LighterOrderStatus.CANCELED]: OrderState.CANCELED,
  [LighterOrderStatus.CANCELED_POST_ONLY]: OrderState.CANCELED,
  [LighterOrderStatus.CANCELED_REDUCE_ONLY]: OrderState.CANCELED,
  [LighterOrderStatus.CANCELED_POSITION_NOT_ALLOWED]: OrderState.CANCELED,
  [LighterOrderStatus.CANCELED_MARGIN_NOT_ALLOWED]: OrderState.CANCELED,
  [LighterOrderStatus.CANCELED_TOO_MUCH_SLIPPAGE]: OrderState.CANCELED,
  [LighterOrderStatus.CANCELED_NOT_ENOUGH_LIQUIDITY]: OrderState.CANCELED,
  [LighterOrderStatus.CANCELED_SELF_TRADE]: OrderState.CANCELED,
  [LighterOrderStatus.CANCELED_EXPIRED]: OrderState.CANCELED,
  [LighterOrderStatus.CANCELED_OCO]: OrderState.CANCELED,
  [LighterOrderStatus.CANCELED_CHILD]: OrderState.CANCELED,
  [LighterOrderStatus.CANCELED_LIQUIDATION]: OrderState.CANCELED,
}

/**
 * Lighter transaction type
 * */
export const TX_TYPE_CHANGE_PUB_KEY = '8'
export const TX_TYPE_CREATE_SUB_ACCOUNT = '9'
export const TX_TYPE_CREATE_PUBLIC_POOL = '10'
export const TX_TYPE_UPDATE_PUBLIC_POOL = '11'
export const TX_TYPE_TRANSFER = '12'
export const TX_TYPE_WITHDRAW = '13'
export const TX_TYPE_CREATE_ORDER = '14'
export const TX_TYPE_CANCEL_ORDER = '15'
export const TX_TYPE_CANCEL_ALL_ORDERS = '16'
export const TX_TYPE_MODIFY_ORDER = '17'
export const TX_TYPE_MINT_SHARES = '18'
export const TX_TYPE_BURN_SHARES = '19'