# General Trading System

NestJS-based algorithmic trading system for cross-protocol arbitrage strategies.

## Features

- **Multi-Protocol Trading**: DEX/CEX integrations (Shadow, Lighter)
- **Arbitrage Strategies**: Automated spot arbitrage (strat1)
- **Queue Processing**: SQS-based distributed execution
- **Production Ready**: PM2 support with error handling

## Quick Start

```bash
# Install
pnpm install
cp .env.example .env

# Setup LocalStack SQS (optional)
docker run --rm -it -p 4566:4566 localstack/localstack
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name strat1

// remove queue
aws --endpoint-url=http://localhost:4566 sqs purge-queue --queue-url http://sqs.ap-northeast-2.localhost.localstack.cloud:4566/000000000000/strat1
# Run
pnpm run start:dev
```

## Environment Variables

```bash
# Protocols
SHADOW_RPC_URL=...
SHADOW_PRIVATE_KEY=0x...
LIGHTER_RPC_URL=https://mainnet.zklighter.elliot.ai
LIGHTER_PRIVATE_KEY=0x...

# SQS (optional)
SQS_END_POINT=http://localhost:4566
AWS_REGION=us-east-1
SQS_QUEUE_NAME=strat1
```

## Commands

```bash
pnpm run start:dev     # Development
pnpm run build         # Build
pnpm run start:pm2     # Production
```

## Architecture

```
src/
├── protocols/         # Trading integrations (Shadow, Lighter)
├── strategies/        # Trading strategies (strat1)
├── sdks/             # Base classes and queue management
└── utils/            # Utilities
```

## How It Works

1. **Market Data**: Fetch prices from multiple protocols
2. **Opportunities**: Find profitable arbitrage trades
3. **Execution**: Place orders sequentially with retry logic
4. **Queue**: Optional SQS processing for scalability
5. **Tracking**: Store positions and receipts in JSON files

## Adding Components

**New Protocol**: Implement `IProtocol` in `src/protocols/{name}/`
**New Strategy**: Extend `BaseStrategy` in `src/strategies/{name}/`
