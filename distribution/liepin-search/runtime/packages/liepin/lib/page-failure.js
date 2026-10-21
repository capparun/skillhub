// about:blank is an observation, not proof of a platform restriction. Keep the
// diagnosis separate from operation outcome: an earlier input may have landed.
export class BlankPageError extends Error {
 constructor(message='搜索页已变化为 about:blank；停止当前任务，不自动刷新或重放') {
  super(message);
  this.name='BlankPageError';
  this.code='LIEPIN_UNEXPECTED_BLANK_PAGE';
 }
}

export function connectionFailureEvidence(error) {
 const failure=error instanceof BlankPageError?error:error?.cause;
 return failure instanceof BlankPageError
  ? {code:failure.code,observedUrl:'about:blank',causeConfirmed:false,automaticRetry:false}
  : undefined;
}
