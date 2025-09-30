// A Receipt is created if execution run.
export interface IBaseReceipt {
  id: string;
  status: 'success' | 'failed';
  positions: IBasePosition[];
}
export interface IBasePosition {
  id: string;
  status: 'opened' | 'closed';
  internalPositions: IBaseInternalPosition[];
}

export interface IBaseInternalPosition {
  id: string;
  protocol: string;
  status: 'opened' | 'closed';
  instrument: string;
}