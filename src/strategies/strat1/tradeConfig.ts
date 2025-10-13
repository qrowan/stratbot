import { CronExpression } from "@nestjs/schedule";
import { IShadowConfig } from "src/protocols/shadow/shadow.interfaces";
import { ILighterConfig } from "src/protocols/lighter/lighter.interfaces";
import { ProcessQueueConfig } from "src/sdks/queue/queue.interfaces";

const validateEnvVar = (name: string, defaultValue?: string): string => {
  const value = process.env[name] || defaultValue;
  if (!value) {
    throw new Error(`${name} is not set. Please set it in your .env file.`);
  }
  return value;
};

const getShadowConfig = (): IShadowConfig => {
  return {
    url: validateEnvVar('SHADOW_RPC_URL'),
    privateKey: validateEnvVar('SHADOW_PRIVATE_KEY'),
    publicKey: validateEnvVar('SHADOW_PUBLIC_KEY'),
  };
};

const getProcessQueueConfig = (): ProcessQueueConfig => {
  const queueUrl = `${validateEnvVar('SQS_END_POINT')}/${validateEnvVar('SQS_ACCOUNT_ID')}/${validateEnvVar('SQS_QUEUE_NAME')}`;
  if (queueUrl !== "http://sqs.ap-northeast-2.localhost.localstack.cloud:4566/000000000000/Strat1") {
    console.log(queueUrl);
    throw new Error('Unexpected SQS_URL');
  }
  return {
    endpoint: validateEnvVar('SQS_END_POINT'),
    queueUrl: queueUrl,
    region: validateEnvVar('AWS_REGION'),
    accessKeyId: validateEnvVar('AWS_ACCESS_KEY_ID'),
    secretAccessKey: validateEnvVar('AWS_SECRET_ACCESS_KEY'),
    maxConcurrentProcesses: parseInt(validateEnvVar('MAX_CONCURRENT_PROCESSES', '3')),
    visibilityTimeout: parseInt(validateEnvVar('SQS_VISIBILITY_TIMEOUT', '300')), // 5 minutes
    messageRetentionPeriod: parseInt(validateEnvVar('SQS_MESSAGE_RETENTION', '86400')), // 24 hours
    accountId: validateEnvVar('SQS_ACCOUNT_ID'),
    queueName: validateEnvVar('SQS_QUEUE_NAME'),
  };
};


const getLighterConfig = (): ILighterConfig => {
  return {
    baseUrl: validateEnvVar('LIGHTER_RPC_URL'),
    privateKey: validateEnvVar('LIGHTER_PRIVATE_KEY'),
    publicKey: validateEnvVar('LIGHTER_PUBLIC_KEY'),
    accountIndex: parseInt(validateEnvVar('LIGHTER_ACCOUNT_INDEX')),
    apiKeyIndex: parseInt(validateEnvVar('LIGHTER_API_KEY_INDEX')),
  };
};

export const tradeConfig = {
  cron: CronExpression.EVERY_MINUTE,
  symbols: ['BTC', 'ETH', 'SEI'],
  inputValues: [0.1, 1],
  roughPriceMap: {
    'USDC': 1,
    'BTC': 112735,
    'ETH': 4556,
    'SEI': 0.2956,
  },
  minMultiplier: 0.5, // TODO: increase to 1.05 for production
  maxOpportunities: 1,

  // Lazy evaluation - only called when accessed
  get shadowConfig() { return getShadowConfig(); },
  get lighterConfig() { return getLighterConfig(); },
  get processQueueConfig() { return getProcessQueueConfig(); },
};

