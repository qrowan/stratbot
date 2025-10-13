import { IProtocol, OrderState } from 'src/sdks/interfaces/protocol';
import { Logger } from '@nestjs/common';
import {
  ILighterInternalPosition,
  ILighterMarketData,
  ILighterOrderData,
  ILighterOrderParams,
  ILighterOrderResult,
  ILighterConfig,
  ILighterOrderBookOrders,
  ILighterOrderBookOrdersApiResponse,
  ILighterOrderApiResponse,
  ILighterOrdersApiResponse,
  ILighterOrderApiData,
  LighterOrderStatus,
  LighterOrderType,
  LighterTimeInForce,
  ILighterMarketDataRequest,
} from './lighter.interfaces';
import {
  MARKET_ID_MAP,
  CODE_OK,
  ENDPOINTS,
  LIGHTER_STATUS_MAP,
  TX_TYPE_CREATE_ORDER,
} from './constants';
import axios, { AxiosInstance } from 'axios';
import { SecureLighterSigner, SecureSignerConfig } from './secure-signer';

export class Lighter implements IProtocol {
  public readonly name = 'Lighter';
  private readonly logger = new Logger(Lighter.name);
  private readonly config: ILighterConfig;
  private readonly httpClient: AxiosInstance;
  private readonly signer: SecureLighterSigner;

  constructor(config: ILighterConfig) {
    this.config = config;
    this.httpClient = axios.create({
      baseURL: config.baseUrl,
      timeout: 30000,
    });

    // Initialize secure WASM signer
    this.signer = new SecureLighterSigner({
      privateKey: config.privateKey,
      accountIndex: config.accountIndex,
      apiKeyIndex: config.apiKeyIndex,
    });

    this.logger.log('Lighter protocol initialized with secure WASM signer');
  }

  async placeOrder(params: ILighterOrderParams): Promise<ILighterOrderData> {
    try {
      // Ensure signer is initialized
      await this.ensureSignerInitialized();

      // Get next nonce
      const nonce = await this.getNextNonce();

      // Create transaction data for signing
      const transaction = {
        marketIndex: params.marketIndex,
        clientOrderIndex: params.clientOrderIndex,
        baseAmount: parseInt(params.baseAmount),
        price: parseInt(params.price),
        isAsk: params.isAsk,
        orderType: this.mapOrderTypeToNumber(params.orderType),
        timeInForce: this.mapTimeInForceToNumber(params.timeInForce),
        reduceOnly: params.reduceOnly,
        triggerPrice: params.triggerPrice || 0,
        orderExpiry: params.expiredAt || this.getDefaultOrderExpiry(),
        nonce: nonce,
      };

      // Sign the transaction with secure WASM signer
      const txInfo = await this.signer.createOrderTransaction(transaction);

      // Send transaction to Lighter using URLSearchParams
      const requestParams = new URLSearchParams();
      requestParams.append('tx_type', TX_TYPE_CREATE_ORDER);
      requestParams.append('tx_info', txInfo);
      requestParams.append('price_protection', 'true');

      const response = await this.httpClient.post(ENDPOINTS.SEND_TX, requestParams, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
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
      throw error;
    }
  }

  async cancelOrder(orderData: ILighterOrderData): Promise<void> {
    try {
      // Ensure signer is initialized
      await this.ensureSignerInitialized();

      // Get next nonce for cancellation
      const nonce = await this.getNextNonce();

      // Create cancel transaction data
      const cancelTransaction = {
        marketIndex: orderData.marketIndex,
        orderIndex: orderData.clientOrderIndex,
        nonce: nonce,
      };

      // Sign the cancel transaction with secure WASM signer
      const txInfo = await this.signer.cancelOrderTransaction(cancelTransaction);

      // Send cancel transaction to Lighter
      const requestParams = new URLSearchParams();
      requestParams.append('tx_type', '15'); // TX_TYPE_CANCEL_ORDER
      requestParams.append('tx_info', txInfo);

      const response = await this.httpClient.post(ENDPOINTS.SEND_TX, requestParams, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      if (response.data.code !== CODE_OK) {
        throw new Error(`Cancel order failed: ${response.data.message}`);
      }

      this.logger.log(`Order ${orderData.id} cancelled successfully. TxHash: ${response.data.tx_hash}`);
    } catch (error) {
      this.logger.error('Failed to cancel order', error);
      throw error;
    }
  }

  async getOrderResult(orderData: ILighterOrderData): Promise<ILighterOrderResult> {
    try {
      const orderStatus = await this.pollOrderStatus(orderData);

      return {
        protocolName: this.name,
        id: orderData.id,
        status: LIGHTER_STATUS_MAP[orderStatus.lighterStatus],
        result: orderData.params,
        ...orderStatus,
      };
    } catch (error) {
      this.logger.error('Failed to get order result', error);
      return {
        protocolName: this.name,
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

  async getPosition(_id: string): Promise<ILighterInternalPosition> {
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

  // Initialize signer when first needed
  private async ensureSignerInitialized(): Promise<void> {
    try {
      await this.signer.initialize();
    } catch (error) {
      this.logger.error('Failed to initialize signer', error);
      throw error;
    }
  }

  private getDefaultOrderExpiry(): number {
    // Default to 28 days from now (in seconds)
    return Math.floor(Date.now() / 1000) + (28 * 24 * 60 * 60);
  }
}