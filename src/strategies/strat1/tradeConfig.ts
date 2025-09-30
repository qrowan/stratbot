import { CronExpression } from "@nestjs/schedule";

export const tradeConfig = {
  cron: CronExpression.EVERY_MINUTE,
  symbols: ['BTC', 'ETH', 'SONIC'],
  inputValues: [10, 100],
  roughPriceMap: {
    'USDC': 1,
    'BTC': 112735,
    'ETH': 4556,
    'SONIC': 0.2956,
  }

}