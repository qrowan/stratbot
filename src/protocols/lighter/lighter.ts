import { IProtocol, OrderState } from 'src/sdks/interfaces/protocol';
import { Logger } from '@nestjs/common';
import {
  ILighterInternalPosition,
  ILighterMarketData,
  ILighterOrderData,
  ILighterOrderParams,
  ILighterOrderResult,
  ILighterSuccessOrderResult,
  ILighterConfig,
  ILighterTransaction,
  ILighterAuthToken,
  ILighterOrderBookOrders,
  ILighterOrderBookOrdersApiResponse,
  ILighterOrderApiResponse,
  ILighterOrdersApiResponse,
  ILighterOrderApiData,
  ILighterSendTxResponse,
  LighterOrderStatus,
  LighterOrderType,
  LighterTimeInForce,
  ILighterMarketDataRequest,
} from './lighter.interfaces';
import {
  MARKET_ID_MAP,
  DEFAULT_28_DAY_ORDER_EXPIRY,
  DEFAULT_10_MIN_AUTH_EXPIRY,
  NIL_TRIGGER_PRICE,
  TX_TYPE_CREATE_ORDER,
  TX_TYPE_CANCEL_ORDER,
  ORDER_TYPE_LIMIT,
  ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
  CODE_OK,
  ENDPOINTS,
} from './constants';
import { delay } from 'src/utils/utils';
import axios, { AxiosInstance } from 'axios';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { keccak256, toHex, stringToBytes, Hex } from 'viem';

export class Lighter implements IProtocol {
  public readonly name = 'Lighter';
  private readonly logger = new Logger(Lighter.name);
  private readonly config: ILighterConfig;
  private readonly httpClient: AxiosInstance;
  private readonly account: PrivateKeyAccount;
  private authToken: ILighterAuthToken | null = null;

  constructor(config: ILighterConfig) {
    this.config = config;
    this.httpClient = axios.create({
      baseURL: config.baseUrl,
      timeout: 30000,
    });
    
    // Initialize viem account for signing
    this.account = privateKeyToAccount(config.apiKeyPrivateKey as Hex);
    this.logger.log(`Lighter protocol initialized for account: ${this.account.address}`);
  }

  async createOrder(params: ILighterOrderParams): Promise<ILighterOrderData> {
    try {
      // Get next nonce
      const nonce = await this.getNextNonce();
      
      // Create transaction data for signing
      const transaction: ILighterTransaction = {
        market_index: params.marketIndex,
        client_order_index: params.clientOrderIndex,
        base_amount: params.baseAmount,
        price: params.price,
        is_ask: params.isAsk ? 1 : 0,
        order_type: this.mapOrderTypeToNumber(params.orderType),
        time_in_force: this.mapTimeInForceToNumber(params.timeInForce),
        reduce_only: params.reduceOnly ? 1 : 0,
        trigger_price: params.triggerPrice || NIL_TRIGGER_PRICE,
        order_expiry: params.expiredAt || (Math.floor(Date.now() / 1000) + DEFAULT_28_DAY_ORDER_EXPIRY),
        nonce: nonce,
      };

      // Sign the transaction
      const signedTxInfo = await this.signTransaction(transaction);
      
      // Send transaction to Lighter
      const response = await this.httpClient.post<ILighterSendTxResponse>(ENDPOINTS.SEND_TX, {
        tx_type: TX_TYPE_CREATE_ORDER,
        tx_info: signedTxInfo,
        price_protection: true,
      });

      if (response.data.code !== CODE_OK) {
        throw new Error(`Create order failed: ${response.data.message}`);
      }

      return {
        id: response.data.tx_hash || crypto.randomUUID(),
        instrument: params.instrument,
        txHash: response.data.tx_hash || '',
        marketIndex: params.marketIndex,
        clientOrderIndex: params.clientOrderIndex,
        nonce: nonce,
        params: params,
      };
    } catch (error) {
      this.logger.error('Failed to create order', error);
      throw error;
    }
  }

  async cancelOrder(orderData: ILighterOrderData): Promise<void> {
    try {
      // Get next nonce
      const nonce = await this.getNextNonce();
      
      // Create cancel transaction data
      const transaction = {
        market_index: orderData.marketIndex,
        order_index: orderData.clientOrderIndex,
        nonce: nonce,
      };

      // Sign the cancel transaction
      const signedTxInfo = await this.signCancelTransaction(transaction);
      
      // Send cancel transaction to Lighter
      const response = await this.httpClient.post<ILighterSendTxResponse>(ENDPOINTS.SEND_TX, {
        tx_type: TX_TYPE_CANCEL_ORDER,
        tx_info: signedTxInfo,
      });

      if (response.data.code !== CODE_OK) {
        throw new Error(`Cancel order failed: ${response.data.message}`);
      }

      this.logger.log(`Order ${orderData.id} cancelled successfully`);
    } catch (error) {
      this.logger.error('Failed to cancel order', error);
      throw error;
    }
  }

  async getOrderResult(orderData: ILighterOrderData): Promise<ILighterOrderResult> {
    try {
      const orderStatus = await this.pollOrderStatus(orderData);
      
      return {
        id: orderData.id,
        status: this.mapLighterStatusToOrderState(orderStatus.lighterStatus),
        result: orderData.params,
        ...orderStatus,
      };
    } catch (error) {
      this.logger.error('Failed to get order result', error);
      return {
        id: orderData.id,
        status: OrderState.CANCELED,
        result: `Failed to get order status: ${error.message}`,
        lighterStatus: LighterOrderStatus.CANCELED,
      };
    }
  }

  async getMarketData(params: ILighterMarketDataRequest): Promise<ILighterMarketData> {
    try {
      // Fetch order book data for each symbol in parallel
      const orderBookPromises = params.symbols.map(symbol => 
        this.fetchOrderBookOrders(symbol)
      );
      
      const orderBookResults = await Promise.all(orderBookPromises);
      
      // Build the market data structure
      const orderBookOrders: Record<string, ILighterOrderBookOrders> = {};
      params.symbols.forEach((symbol, index) => {
        orderBookOrders[symbol] = orderBookResults[index];
      });

      return {
        isAvailable: true,
        orderBookOrders,
      };
    } catch (error) {
      this.logger.error('Failed to get market data', error);
      return {
        isAvailable: false,
        orderBookOrders: {},
      };
    }
  }

  async getPosition(id: string): Promise<ILighterInternalPosition> {
    throw new Error('getPosition not implemented yet');
  }

  // Private helper methods

  private async getNextNonce(): Promise<number> {
    try {
      const response = await this.httpClient.get(ENDPOINTS.NEXT_NONCE, {
        params: {
          account_index: this.config.accountIndex,
          api_key_index: this.config.apiKeyIndex,
        },
      });

      if (response.data.code !== CODE_OK) {
        throw new Error(`Failed to get nonce: ${response.data.message}`);
      }

      return response.data.nonce;
    } catch (error) {
      this.logger.error('Failed to get next nonce', error);
      throw error;
    }
  }

  private async fetchOrderBookOrders(symbol: string): Promise<ILighterOrderBookOrders> {
    const marketId = MARKET_ID_MAP[symbol];
    if (marketId === undefined) {
      throw new Error(`Unknown symbol: ${symbol}`);
    }

    const response = await this.httpClient.get<ILighterOrderBookOrdersApiResponse>(
      ENDPOINTS.ORDER_BOOK_ORDERS,
      {
        params: {
          market_id: marketId,
          limit: 100,
        },
      }
    );

    this.validateOrderBookResponse(response.data);
    
    // Convert API response to internal format
    return {
      code: response.data.code,
      message: response.data.message,
      total_asks: response.data.total_asks,
      asks: response.data.asks.map(this.convertToSimpleOrder),
      total_bids: response.data.total_bids,
      bids: response.data.bids.map(this.convertToSimpleOrder),
    };
  }

  private convertToSimpleOrder = (order: ILighterOrderApiResponse) => ({
    order_index: order.order_index,
    order_id: order.order_id,
    owner_account_index: order.owner_account_index,
    initial_base_amount: order.initial_base_amount,
    remaining_base_amount: order.remaining_base_amount,
    price: order.price,
    order_expiry: order.order_expiry,
  });

  private async pollOrderStatus(orderData: ILighterOrderData): Promise<{
    lighterStatus: LighterOrderStatus;
    filledBaseAmount?: string;
    filledQuoteAmount?: string;
    remainingBaseAmount?: string;
  }> {
    try {
      const response = await this.httpClient.get<ILighterOrdersApiResponse>(ENDPOINTS.ACCOUNT_ACTIVE_ORDERS, {
        params: {
          account_index: this.config.accountIndex,
          market_id: orderData.marketIndex,
        },
      });

      this.validateOrdersResponse(response.data);

      if (response.data && response.data.orders) {
        // Find the specific order by client order index
        const order = response.data.orders.find(
          (o) => o.client_order_index === orderData.clientOrderIndex
        );

        if (order) {
          return {
            lighterStatus: this.mapApiStatusToLighterStatus(order.status),
            filledBaseAmount: order.filled_base_amount,
            filledQuoteAmount: order.filled_quote_amount,
            remainingBaseAmount: order.remaining_base_amount,
          };
        }
      }

      // If order not found in active orders, check inactive orders (completed/canceled)
      const inactiveResponse = await this.httpClient.get<ILighterOrdersApiResponse>(ENDPOINTS.ACCOUNT_INACTIVE_ORDERS, {
        params: {
          account_index: this.config.accountIndex,
          market_id: orderData.marketIndex,
          limit: 50,
        },
      });

      this.validateOrdersResponse(inactiveResponse.data);

      if (inactiveResponse.data && inactiveResponse.data.orders) {
        const order = inactiveResponse.data.orders.find(
          (o) => o.client_order_index === orderData.clientOrderIndex
        );

        if (order) {
          return {
            lighterStatus: this.mapApiStatusToLighterStatus(order.status),
            filledBaseAmount: order.filled_base_amount,
            filledQuoteAmount: order.filled_quote_amount,
            remainingBaseAmount: order.remaining_base_amount,
          };
        }
      }

      // Order not found, assume it's still pending
      return {
        lighterStatus: LighterOrderStatus.PENDING,
      };
    } catch (error) {
      this.logger.error('Error polling order status', error);
      throw error;
    }
  }

  private async signTransaction(transaction: ILighterTransaction): Promise<string> {
    // This would typically call the native signer library
    // For now, we'll create a placeholder implementation
    // In a real implementation, this would call the Go signer library
    
    const message = this.buildTransactionMessage(transaction);
    const messageHash = keccak256(stringToBytes(message));
    const signature = await this.account.signMessage({ message });
    
    return JSON.stringify({
      ...transaction,
      sig: signature,
    });
  }

  private async signCancelTransaction(transaction: any): Promise<string> {
    // Similar to signTransaction but for cancel orders
    const message = this.buildCancelTransactionMessage(transaction);
    const messageHash = keccak256(stringToBytes(message));
    const signature = await this.account.signMessage({ message });
    
    return JSON.stringify({
      ...transaction,
      sig: signature,
    });
  }

  private buildTransactionMessage(transaction: ILighterTransaction): string {
    // Build message string for signing based on Lighter protocol
    return `${transaction.market_index}:${transaction.client_order_index}:${transaction.base_amount}:${transaction.price}:${transaction.is_ask}:${transaction.order_type}:${transaction.time_in_force}:${transaction.reduce_only}:${transaction.trigger_price}:${transaction.order_expiry}:${transaction.nonce}`;
  }

  private buildCancelTransactionMessage(transaction: any): string {
    // Build message string for cancel transaction signing
    return `${transaction.market_index}:${transaction.order_index}:${transaction.nonce}`;
  }

  // Validation methods
  private validateOrderBookResponse(data: unknown): asserts data is ILighterOrderBookOrdersApiResponse {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid response: data must be an object');
    }

    const response = data as any;

    if (typeof response.code !== 'number') {
      throw new Error('Invalid response: code must be a number');
    }

    if (!Array.isArray(response.asks)) {
      throw new Error('Invalid response: asks must be an array');
    }

    if (!Array.isArray(response.bids)) {
      throw new Error('Invalid response: bids must be an array');
    }

    if (typeof response.total_asks !== 'number') {
      throw new Error('Invalid response: total_asks must be a number');
    }

    if (typeof response.total_bids !== 'number') {
      throw new Error('Invalid response: total_bids must be a number');
    }
  }

  private validateOrdersResponse(data: unknown): asserts data is ILighterOrdersApiResponse {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid orders response: data must be an object');
    }

    const response = data as any;

    if (typeof response.code !== 'number') {
      throw new Error('Invalid orders response: missing or invalid code');
    }

    if (!Array.isArray(response.orders)) {
      throw new Error('Invalid orders response: orders must be an array');
    }

    // Validate each order in the orders array
    response.orders.forEach((order: unknown, index: number) => {
      this.validateOrderApiData(order, `orders[${index}]`);
    });
  }

  private validateOrderApiData(order: unknown, context: string): asserts order is ILighterOrderApiData {
    if (!order || typeof order !== 'object') {
      throw new Error(`Invalid order data at ${context}: must be an object`);
    }

    const o = order as any;
    
    const requiredFields = [
      'order_index', 'client_order_index', 'order_id', 'client_order_id',
      'market_index', 'owner_account_index', 'initial_base_amount', 'price',
      'remaining_base_amount', 'filled_base_amount', 'filled_quote_amount', 
      'status', 'is_ask', 'side', 'type', 'time_in_force', 'reduce_only',
      'timestamp', 'block_height'
    ];

    for (const field of requiredFields) {
      if (o[field] === undefined) {
        throw new Error(`Invalid order data at ${context}: missing field ${field}`);
      }
    }
  }

  // Mapping methods
  private mapOrderTypeToNumber(orderType: LighterOrderType): number {
    return orderType;
  }

  private mapTimeInForceToNumber(timeInForce: LighterTimeInForce): number {
    return timeInForce;
  }

  private mapApiStatusToLighterStatus(status: string): LighterOrderStatus {
    // Map API status strings to LighterOrderStatus enum
    switch (status.toLowerCase()) {
      case 'filled':
        return LighterOrderStatus.FILLED;
      case 'open':
        return LighterOrderStatus.OPEN;
      case 'pending':
        return LighterOrderStatus.PENDING;
      case 'canceled':
        return LighterOrderStatus.CANCELED;
      case 'in-progress':
        return LighterOrderStatus.IN_PROGRESS;
      default:
        this.logger.warn(`Unknown status: ${status}, defaulting to PENDING`);
        return LighterOrderStatus.PENDING;
    }
  }

  private mapLighterStatusToOrderState(status: LighterOrderStatus): OrderState {
    switch (status) {
      case LighterOrderStatus.FILLED:
        return OrderState.FILLED;
      case LighterOrderStatus.OPEN:
      case LighterOrderStatus.PENDING:
      case LighterOrderStatus.IN_PROGRESS:
        return OrderState.PENDING;
      case LighterOrderStatus.CANCELED:
      case LighterOrderStatus.CANCELED_POST_ONLY:
      case LighterOrderStatus.CANCELED_REDUCE_ONLY:
      case LighterOrderStatus.CANCELED_POSITION_NOT_ALLOWED:
      case LighterOrderStatus.CANCELED_MARGIN_NOT_ALLOWED:
      case LighterOrderStatus.CANCELED_TOO_MUCH_SLIPPAGE:
      case LighterOrderStatus.CANCELED_NOT_ENOUGH_LIQUIDITY:
      case LighterOrderStatus.CANCELED_SELF_TRADE:
      case LighterOrderStatus.CANCELED_EXPIRED:
      case LighterOrderStatus.CANCELED_OCO:
      case LighterOrderStatus.CANCELED_CHILD:
      case LighterOrderStatus.CANCELED_LIQUIDATION:
        return OrderState.CANCELED;
      default:
        return OrderState.CANCELED;
    }
  }
}