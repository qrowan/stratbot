import { IBaseOpportunity } from '../interfaces/strategy';

export enum ProcessState {
  PENDING = 'pending',                    // 프로세스 시작 대기
  PLACING_ORDER = 'executing_order',    // 주문 실행 중 (placeOrder)
  POLLING_ORDER = 'polling_order',        // 주문 결과 폴링 중 (poll)
  ORDER_COMPLETED = 'order_completed',    // 현재 주문 완료, 다음 주문으로 진행
  ALL_ORDERS_COMPLETED = 'all_orders_completed', // 모든 주문 완료
  COMPLETED = 'completed',                // 프로세스 완전 완료
  FAILED = 'failed',                      // 프로세스 실패
}

export interface ProcessMessage {
  processId: string;
  strategyName: string;
  opportunity: IBaseOpportunity;
  state: ProcessState;
  currentOrderIndex: number;              // 현재 처리 중인 order 인덱스
  orderResponses: any[];                  // 완료된 주문들의 응답
  internalPositions: any[];               // 누적된 internal positions
  attempts: number;                       // 현재 order의 시도 횟수
  maxRetries: number;
  createdAt: string;
  updatedAt: string;
  errorMessage?: string;
}

export interface ProcessQueueConfig {
  endpoint: string;
  queueUrl: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  maxConcurrentProcesses: number;
  visibilityTimeout: number; // seconds
  messageRetentionPeriod: number; // seconds
  accountId: string;
  queueName: string;
}