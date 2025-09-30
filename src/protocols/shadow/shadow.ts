import { IProtocol, OrderState } from "src/sdks/interfaces/protocol";
import { Logger } from "@nestjs/common";
import { IShadowInternalPosition, IShadowMarketData, IShadowOrderData, IShadowOrderRequest, IShadowOrderResult, IQuoteResult, IShadowMarketDataRequest } from "./shadow.interfaces";
import { getTokenBySymbol, TOKEN_ADDRESSES, SUPPORTED_TOKENS, UNIVERSAL_ROUTER_ADDRESS } from "./contants";
import { createWalletClient, createPublicClient, http, Hex, Account, PublicClient, WalletClient, parseEventLogs, decodeEventLog, parseUnits, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sonic } from "viem/chains";
import ERC20_ABI from "./abis/ERC20.json";
import { toChecksumAddress } from "src/utils/checksumAddress";
import { validatePrivatePublicKeyPair } from "src/utils/blockchain";

export class Shadow implements IProtocol {
  public readonly name = 'Shadow';
  private readonly logger = new Logger(Shadow.name);
  private readonly rpcUrl: string;
  private readonly privateKey: string;
  private readonly shadowApiUrl: string;
  private readonly chainId = 146;
  private readonly account: Account;
  private readonly publicClient: PublicClient;
  private readonly walletClient: WalletClient;

  constructor(
    RPC_URL: string,
    privateKey: string,
    publicKey: string,
    SHADOW_API_URL: string,
  ) {
    this.rpcUrl = RPC_URL;
    this.shadowApiUrl = SHADOW_API_URL;
    this.privateKey = privateKey;
    validatePrivatePublicKeyPair(this.privateKey, publicKey);
    this.account = privateKeyToAccount(this.privateKey as Hex);
    this.publicClient = createPublicClient({
      chain: sonic,
      transport: http(this.rpcUrl),
    });

    this.walletClient = createWalletClient({
      account: this.account,
      chain: sonic,
      transport: http(this.rpcUrl),
    });
  }

  async createOrder(params: IShadowOrderRequest): Promise<IShadowOrderData> {
    const id = crypto.randomUUID();
    try {
      const txHash = await this.walletClient.sendTransaction({
        account: this.account,
        chain: sonic,
        to: UNIVERSAL_ROUTER_ADDRESS as Hex,
        data: params.callData as Hex,
        value: BigInt(params.value),
      });
      return {
        id: id,
        instrument: params.instrument,
        txHash: txHash,
        params: params,
      }
    } catch (error) {
      this.logger.error('Create order failed', error.stack, 'createOrder');
      throw error;
    }
  }

  async cancelOrder(
    orderData: IShadowOrderData
  ): Promise<void> {
    return;
  }

  async getOrderResult(
    orderData: IShadowOrderData
  ): Promise<IShadowOrderResult> {
    try {
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash: orderData.txHash,
      });

      if (receipt.status === 'success') {
        const sender = receipt.from;
        const tokenOut = orderData.params.tokenOut;

        const transferEvent = receipt.logs
          .filter(log => toChecksumAddress(log.address) === tokenOut)
          .map(log => {
            try {
              const decoded = decodeEventLog({
                abi: ERC20_ABI,
                data: log.data,
                topics: log.topics,
              });
              if (decoded.eventName === 'Transfer' && decoded.args?.[1] === sender) {
                return {
                  from: decoded.args[0],
                  to: decoded.args[1],
                  value: decoded.args[2]
                };
              }
            } catch {
              return null;
            }
            return null;
          })
          .find(event => event !== null);

        if (!transferEvent) {
          this.logger.error('[Unreachable code] Transfer event not found', '', 'getOrderResult');
          throw new Error('[Unreachable code] Transfer event not found');
        }

        const amountOut = transferEvent.value;

        return {
          id: orderData.id,
          status: OrderState.FILLED,
          result: {
            amountOut: amountOut,
            instrument: orderData.instrument,
          },
        }
      } else {
        return {
          id: orderData.id,
          status: OrderState.CANCELED,
          result: {
            instrument: orderData.instrument,
          },
        }
      }
    } catch (error) {
      this.logger.error('Get order result failed', error.stack, 'getOrderResult');
      throw error;
    }
  }

  async getMarketData(request: IShadowMarketDataRequest): Promise<IShadowMarketData> {
    try {
      const buyQuoteResults = await Promise.all(request.symbols.map(async (token) => {
        const quoteAmounts = request.values.map(value => value);
        const result = await this.quote("USDC", token, request.values, quoteAmounts);
        return result;
      }));
      const sellQuoteResults = await Promise.all(request.symbols.map(async (token) => {
        const roughPrice = request.roughPriceMap[token];
        if (!roughPrice) throw new Error(`Rough price not found for token ${token}`);
        const inverseQuoteAmounts = request.values.map(amount => amount / roughPrice);
        const result = await this.quote(token, "USDC", request.values, inverseQuoteAmounts);
        return result;
      }));
      const isAvailable = true;

      let quotes: Record<string, Record<number, { buy: IQuoteResult; sell: IQuoteResult; }>> = {};

      // Initialize the quotes structure for each symbol and value
      request.symbols.forEach(symbol => {
        quotes[symbol] = {};
        request.values.forEach(value => {
          quotes[symbol][value] = { buy: null as any, sell: null as any };
        });
      });

      // Fill in buy results
      buyQuoteResults.forEach((result, index) => {
        const symbol = request.symbols[index];
        request.values.forEach(value => {
          if (result[value]) {
            quotes[symbol][value].buy = result[value];
          }
        });
      });

      // Fill in sell results  
      sellQuoteResults.forEach((result, index) => {
        const symbol = request.symbols[index];
        request.values.forEach(value => {
          if (result[value]) {
            quotes[symbol][value].sell = result[value];
          }
        });
      });
      return {
        isAvailable: isAvailable,
        quotes: quotes,
      };
    } catch (error) {
      this.logger.error('Failed to get market data', error.message);
      return {
        isAvailable: false,
        quotes: {},
      }
    }
  }


  async quote(tokenInSymbol: string, tokenOutSymbol: string, values: number[], qouteAmounts: number[]): Promise<Record<number, IQuoteResult>> {
    if (values.length !== qouteAmounts.length) throw new Error('Quote: Invalid length');
    const tokenIn = getTokenBySymbol(tokenInSymbol);
    try {
      const responses = await Promise.all(qouteAmounts.map(async (amountIn) => {
        // Convert amount to wei (USDC has 6 decimals)
        const amountInWei = parseUnits(amountIn.toString(), tokenIn.decimals).toString();

        // Build URL with parameters like frontend getQuote$
        const url = this.shadowApiUrl + '?' + new URLSearchParams({
          tokenInAddress: TOKEN_ADDRESSES[tokenInSymbol], // Always USDC as input
          tokenOutAddress: TOKEN_ADDRESSES[tokenOutSymbol], // Target token as output
          amount: amountInWei,
          type: "exactIn",
          tokenInChainId: String(this.chainId),
          tokenOutChainId: String(this.chainId),
          protocols: "v2,v3,mixed",
          enableUniversalRouter: "true",
          slippageTolerance: "20",
          deadline: "10800",
        });

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          this.logger.warn(`Quote API error for ${tokenOutSymbol}: ${response.status} ${response.statusText}`);
          throw new Error(`Quote API error: ${response.status}`);
        }

        const result = await response.json();

        // Handle error responses
        if (result.errorCode) {
          this.logger.warn(`Quote API returned error for ${tokenOutSymbol}: ${result.errorCode}`);
          throw new Error(`Quote error: ${result.errorCode}`);
        }

        return result;
      }));

      const amountOut = responses.reduce((acc, response, index) => {
        // Extract quote data from response - adapting to expected API response format
        const token = getTokenBySymbol(tokenOutSymbol);
        const quoteResult: IQuoteResult = {
          amountIn: Number(qouteAmounts[index].toFixed(token.decimals)),
          amountOut: response.quote ? Number(formatUnits(response.quote, token.decimals)) : 0,
          callData: response.methodParameters?.calldata || '',
          value: response.methodParameters?.value
            // hex to bigint
            ? Number(BigInt(response.methodParameters.value))
            : 0,
          rawData: response,
        };

        acc[values[index]] = quoteResult;
        return acc;
      }, {} as Record<number, IQuoteResult>);

      return amountOut;
    } catch (error) {
      this.logger.error(`Failed to fetch market data for token ${tokenOutSymbol}`, error.stack, 'getMarketDataForToken');

      // Return empty data on error
      return qouteAmounts.reduce((acc, qouteAmount) => {
        acc[qouteAmount] = {
          amountIn: qouteAmount,
          amountOut: 0,
          callData: '',
          value: 0,
          rawData: null,
        };
        return acc;
      }, {} as Record<number, IQuoteResult>);
    }
  }

  async getPosition(id: string): Promise<IShadowInternalPosition> {
    throw new Error('Not implemented');
  }
}