import { Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import path from 'path';

export interface SecureSignerConfig {
  privateKey: string;
  accountIndex: number;
  apiKeyIndex: number;
}

export class SecureLighterSigner {
  private readonly logger = new Logger(SecureLighterSigner.name);
  private wasmPath: string;
  private wasmExecPath: string;
  private isInitialized = false;
  private go: any;
  private wasmInstance: any;

  // Constants
  static readonly ORDER_TYPE_LIMIT = 0;
  static readonly ORDER_TIME_IN_FORCE_GOOD_TILL_TIME = 1;
  static readonly DEFAULT_28_DAY_ORDER_EXPIRY = -1;

  constructor(private config: SecureSignerConfig) {
    // Use process.cwd() to get current working directory (project root)
    const projectRoot = process.cwd();
    this.wasmPath = path.join(projectRoot, 'src/protocols/lighter/wasm/verified-lighter-signer.wasm');
    this.wasmExecPath = path.join(projectRoot, 'src/protocols/lighter/wasm/wasm_exec.js');
    
    this.logger.debug(`WASM paths: ${this.wasmPath}, ${this.wasmExecPath}`);
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Load the Go WASM runtime with clean environment
      global.process = {
        ...global.process,
        env: {
          // Only essential environment variables
          HOME: '/tmp',
          PATH: '/usr/bin:/bin',
        }
      };

      // Load wasm_exec.js
      const wasmExecCode = await fs.readFile(this.wasmExecPath, 'utf8');
      eval(wasmExecCode);

      // Initialize Go runtime
      this.go = new (global as any).Go();

      // Load WASM binary
      const wasmBytes = await fs.readFile(this.wasmPath);
      const wasmResult = await WebAssembly.instantiate(wasmBytes, this.go.importObject);
      this.wasmInstance = (wasmResult as any).instance || wasmResult;

      // Run WASM
      this.go.run(this.wasmInstance);

      // Initialize client
      const result = (global as any).CreateClient(
        this.config.privateKey,
        this.config.accountIndex,
        this.config.apiKeyIndex,
        1 // chainId
      );

      if (result.error) {
        throw new Error(`Failed to create WASM client: ${result.error}`);
      }

      this.isInitialized = true;
      this.logger.log('Secure WASM signer initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize secure signer', error);
      throw error;
    }
  }

  async createOrderTransaction(params: {
    marketIndex: number;
    clientOrderIndex: number;
    baseAmount: number;
    price: number;
    isAsk: boolean;
    orderType?: number;
    timeInForce?: number;
    reduceOnly?: boolean;
    triggerPrice?: number;
    orderExpiry?: number;
    nonce: number;
  }): Promise<string> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const result = (global as any).SignCreateOrder(
        params.marketIndex,
        params.clientOrderIndex,
        params.baseAmount,
        params.price,
        params.isAsk ? 1 : 0,
        params.orderType || SecureLighterSigner.ORDER_TYPE_LIMIT,
        params.timeInForce || SecureLighterSigner.ORDER_TIME_IN_FORCE_GOOD_TILL_TIME,
        params.reduceOnly ? 1 : 0,
        params.triggerPrice || 0,
        params.orderExpiry || SecureLighterSigner.DEFAULT_28_DAY_ORDER_EXPIRY,
        params.nonce
      );

      if (result.error) {
        throw new Error(`WASM signing failed: ${result.error}`);
      }

      return result.txInfo;
    } catch (error) {
      this.logger.error('Failed to create order transaction', error);
      throw error;
    }
  }

  async cancelOrderTransaction(params: {
    marketIndex: number;
    orderIndex: number;
    nonce: number;
  }): Promise<string> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const result = (global as any).SignCancelOrder(
        params.marketIndex,
        params.orderIndex,
        params.nonce
      );

      if (result.error) {
        throw new Error(`WASM cancel signing failed: ${result.error}`);
      }

      return result.txInfo;
    } catch (error) {
      this.logger.error('Failed to create cancel order transaction', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    this.isInitialized = false;
    this.logger.log('Secure signer closed');
  }
}