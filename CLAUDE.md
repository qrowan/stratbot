# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# General Trading System - Context & Code Patterns

NestJS-based algorithmic trading system for cross-protocol arbitrage with SQS queue processing.

## Key Commands

- `pnpm run start:dev` - Development with watch mode
- `pnpm run build` - Build project
- `pnpm run lint` - Lint with auto-fix
- `pnpm run test` - Run Jest tests
- `pnpm run test:watch` - Watch mode testing
- `pnpm run test:e2e` - End-to-end tests
- `pnpm run start:pm2` - Production with PM2

## Architecture

### Core Components

1. **Protocols** (`src/protocols/`) - Trading integrations (Shadow DEX, Lighter CEX, SP1 template)
2. **Strategies** (`src/strategies/`) - Trading strategies (Strat1 arbitrage, SS1 template)
3. **SDKs** (`src/sdks/`) - BaseStrategy abstract class, interfaces, QueueManager
4. **Utils** (`src/utils/`) - Common utilities

### Data Flow & State Machine

1. **Strategy Lifecycle**: Cron triggers `run()` → `findOpportunities()` → enqueue to SQS
2. **Queue Processing**: PENDING → PLACING_ORDER → POLLING_ORDER → ORDER_COMPLETED → ALL_ORDERS_COMPLETED
3. **Data Persistence**: Positions and receipts stored in `./data/{strategy}-data.json`
4. **Error Handling**: 3x retry with exponential backoff, order cancellation on timeout

### Key Interfaces

- **IProtocol**: `placeOrder`, `cancelOrder`, `getOrderResult`, `getMarketData`, `getPosition`
- **BaseStrategy**: Abstract class with `findOpportunities`, `execute`, `getRealizedResult`, `getUnrealizedResult`
- **OpportunityType**: OPEN, EDIT, CLOSE enum for position management
- **OrderState**: PENDING, LIVE, CANCELED, PARTIAL_FILLED, FILLED

## Environment Configuration

Required variables from `.env.example`:

```bash
# SQS (optional - direct processing if not set)
SQS_END_POINT=http://localhost:4566
AWS_REGION=us-east-1
MAX_CONCURRENT_PROCESSES=3

# Protocol keys
SHADOW_RPC_URL=...
SHADOW_PRIVATE_KEY=0x...
LIGHTER_RPC_URL=https://mainnet.zklighter.elliot.ai
LIGHTER_PRIVATE_KEY=0x...
```

## Adding New Components

### New Protocol

```typescript
// src/protocols/{name}/{name}.ts
export class NewProtocol implements IProtocol {
  public readonly name = 'NewProtocol';

  async placeOrder(request: IBaseOrderRequest): Promise<IBaseOrderResponse>;
  async cancelOrder(orderData: IBaseOrderResponse): Promise<void>;
  async getOrderResult(
    orderData: IBaseOrderResponse,
  ): Promise<IBaseOrderResult>;
  async getMarketData(
    request: IBaseMarketDataRequest,
  ): Promise<IBaseMarketData>;
  async getPosition(id: string): Promise<IBaseInternalPosition>;
}
```

### New Strategy

```typescript
// src/strategies/{name}/{name}.service.ts
@Injectable()
export class NewStrategyService extends BaseStrategy {
  public readonly name = 'NewStrategy';
  public readonly protocolMap: Record<string, IProtocol>;

  constructor() {
    const processQueue = new QueueManager(tradeConfig.processQueueConfig);
    super('NewStrategyService', processQueue);

    this.protocolMap = {
      protocol1: new Protocol1(),
      protocol2: new Protocol2(),
    };
  }

  @Cron(tradeConfig.cron)
  async handleCron() {
    await this.run();
  }

  async findOpportunities(): Promise<IBaseOpportunity[]>;
  async execute(opportunity: IBaseOpportunity): Promise<IBaseReceipt>;
  async getRealizedResult(): Promise<any[]>;
  async getUnrealizedResult(): Promise<any[]>;
}
```

## File Organization

- **Protocols**: `{name}.ts`, `{name}.interfaces.ts`, `constants.ts`
- **Strategies**: `{name}.service.ts`, `{name}.module.ts`, `{name}.controller.ts`, `tradeConfig.ts`
- **Interfaces**: Centralized in `src/sdks/interfaces/`
- **Data Files**: Auto-generated in `./data/` directory

## Testing & Quality

- Jest for unit tests (`test:watch` for development)
- ESLint with auto-fix via `pnpm run lint`
- End-to-end tests in `test/` directory
- PM2 for production deployment

## Current Implementations

**Protocols:**

- **Shadow**: Sei DEX integration with viem + Universal Router
- **Lighter**: CEX with REST API + secure WASM signer
- **SP1**: Template/sample protocol

**Strategies:**

- **Strat1**: Spot arbitrage between Shadow-Lighter with opportunity detection
- **SS1**: Sample strategy template

- Check build successfully after fixing code
