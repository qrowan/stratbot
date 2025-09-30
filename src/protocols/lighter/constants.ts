// Market ID mapping based on Lighter protocol
export const MARKET_ID_MAP: Record<string, number> = {
  'ETH': 0,
  'BTC': 1,
  'SONIC': 32,
};

// Default values from Python reference
export const DEFAULT_28_DAY_ORDER_EXPIRY = 28 * 24 * 60 * 60; // 28 days in seconds
export const DEFAULT_10_MIN_AUTH_EXPIRY = 10 * 60; // 10 minutes in seconds
export const NIL_TRIGGER_PRICE = "0";

// Transaction types from Python reference
export const TX_TYPE_CREATE_ORDER = 0;
export const TX_TYPE_CANCEL_ORDER = 1;
export const TX_TYPE_WITHDRAW = 2;
export const TX_TYPE_CHANGE_PUBKEY = 3;

// API endpoints
export const ENDPOINTS = {
  SEND_TX: '/api/v1/sendTx',
  SEND_TX_BATCH: '/api/v1/sendTxBatch',
  NEXT_NONCE: '/api/v1/nextNonce',
  ORDER_BOOK_ORDERS: '/api/v1/orderBookOrders',
  ACCOUNT_ACTIVE_ORDERS: '/api/v1/accountActiveOrders',
  ACCOUNT_INACTIVE_ORDERS: '/api/v1/accountInactiveOrders',
} as const;

// Order type constants from Python reference
export const ORDER_TYPE_LIMIT = 0;
export const ORDER_TYPE_MARKET = 1;
export const ORDER_TIME_IN_FORCE_GOOD_TILL_TIME = 0;
export const ORDER_TIME_IN_FORCE_IMMEDIATE_OR_CANCEL = 1;
export const ORDER_TIME_IN_FORCE_POST_ONLY = 2;

// Response codes
export const CODE_OK = 200;