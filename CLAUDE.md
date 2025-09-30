# General Trading System - Context & Code Patterns

## Project Overview
This is a NestJS-based general trading system designed for algorithmic trading across multiple protocols. The system implements a modular architecture where trading strategies can be developed and deployed to interact with various trading protocols.

## Key Commands
- `pnpm run start:dev` - Start development server with watch mode
- `pnpm run build` - Build the project
- `pnpm run lint` - Run linting with auto-fix
- `pnpm test` - Run tests

## Architecture Pattern

### Core Components

1. **Protocols** (`src/protocols/`) - Trading protocol integrations
2. **Strategies** (`src/sample-stategy/`) - Trading strategy implementations  
3. **Interfaces** (`src/interfaces/`) - Type definitions and contracts

### Adding New Trading Strategies

When implementing a new trading strategy, follow this pattern:

#### 1. Protocol Integration First
Create protocol modules in `src/protocols/{protocol-name}/`:

```typescript
// Protocol implementation following IProtocol interface
export class NewProtocol implements IProtocol {
  async createOrder(request: IBaseOrderRequest): Promise<IBaseOrderResponse>
  async cancelOrder(orderData: IBaseOrderResponse): Promise<void>
  async getOrderResult(orderData: IBaseOrderResponse): Promise<IBaseOrderResult>
  async getMarketData(): Promise<IBaseMarketData>
  async getPosition(id: string): Promise<IBaseInternalPosition>
}
```

#### 2. Strategy Implementation
Create strategy services in `src/sample-stategy/{strategy-name}/`:

```typescript
@Injectable()
export class NewStrategyService implements BaseStrategy, OnModuleInit, OnModuleDestroy {
  public readonly name = 'NewStrategy';
  public readonly protocolMap: Record<string, IProtocol>;
  
  // Core strategy methods
  async findOpportunities(marketData: IBaseMarketData): Promise<IBaseOpportunity[]>
  async execute(opportunity: IBaseOpportunity): Promise<IBaseReceipt>
  async process(): Promise<IBaseReceipt[]>
}
```

### Data Flow Pattern

1. **Market Data Collection** - Protocols fetch market data
2. **Opportunity Detection** - Strategies analyze data and identify opportunities
3. **Position Building** - Strategies execute orders through protocols
4. **Receipt Management** - Track execution results and positions

### Key Interfaces

#### BaseStrategy Interface
- `findOpportunities()` - Analyze market data and identify trading opportunities
- `execute()` - Execute a trading opportunity by placing orders
- `process()` - Main processing loop (runs on cron schedule)
- Position and receipt management methods

#### IProtocol Interface  
- Order management (create, cancel, get status)
- Market data retrieval
- Position tracking

#### Opportunity Types
- `OPEN` - Open new positions
- `EDIT` - Modify existing positions  
- `CLOSE` - Close positions

### Error Handling Patterns

1. **Retry Logic** - Orders retry up to 3 times with exponential backoff
2. **Polling Mechanism** - Poll order status with timeout and cancellation fallback
3. **Receipt System** - Track success/failure of all executions

### Scheduling Pattern

Strategies use NestJS scheduling decorators:
```typescript
@Cron(CronExpression.EVERY_SECOND)
async handleCron() {
  await this.process();
}
```

### Module Structure

Each strategy should be a separate NestJS module:
```typescript
@Module({
  providers: [NewStrategyService],
  controllers: [NewStrategyController],
})
export class NewStrategyModule {}
```

### Configuration Pattern

Protocols require environment variables for connection:
- RPC URLs
- Private keys/API credentials
- Protocol-specific configuration

### Position Management

- **BasePosition** - High-level position containing multiple internal positions
- **BaseInternalPosition** - Protocol-specific position data
- **BaseReceipt** - Execution record with success/failure status

### File Naming Conventions

- Protocols: `{protocol-name}.ts`, `{protocol-name}.interfaces.ts`
- Strategies: `{strategy-name}.service.ts`, `{strategy-name}.module.ts`, `{strategy-name}.controller.ts`
- Interfaces: Descriptive names in `src/interfaces/`

This architecture allows for easy addition of new trading protocols and strategies while maintaining separation of concerns and type safety.