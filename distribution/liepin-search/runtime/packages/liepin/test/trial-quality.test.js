import test from 'node:test';
import assert from 'node:assert/strict';
import {trialQuality} from '../lib/trial-quality.js';
import {evaluationFingerprint} from '../lib/evaluation.js';
test('quality counts linked list observations once and keeps partial details distinct',()=>{
 const task={rounds:[{id:'trial',phase:'trial',status:'completed'}],operations:[],requirements:{criteria:[{id:'skill'}]},
  unlinkedObservations:[{id:'one',roundId:'trial',identityStatus:'linked',link:{candidateKey:'person'}},{id:'two',roundId:'trial',identityStatus:'unresolved'}],
  candidates:[{key:'person',observations:[{stage:'list',roundId:'trial',identityLink:true},{stage:'detail',data:{status:'partial'}}],evaluations:[{findings:[{criterionId:'skill',status:'unknown'}]}]}]};
 const report=trialQuality(task);assert.equal(report.readyForHumanReview,true);
 assert.deepEqual(report.rounds[0],{id:'trial',status:'completed',listObservations:2,identifiedCandidates:1,unresolvedIdentities:1,readableDetails:0,partialDetails:1,missingDetails:1,unknownFindings:2});
 assert.equal(report.decisionRequired,true);
});
test('unconfirmed operations prevent readiness without silently deciding to proceed',()=>{
 const report=trialQuality({rounds:[{id:'trial',phase:'trial',status:'completed'}],operations:[{status:'unknown'}],candidates:[],requirements:{criteria:[]}});
 assert.equal(report.readyForHumanReview,false);assert.equal(report.unresolvedOperations,1);
 assert.equal(Object.hasOwn(report,'decision'),false);
});
test('repeated observations of one identified candidate do not imply missing details',()=>{
 const task={rounds:[{id:'trial',phase:'trial',status:'completed'}],operations:[],requirements:{criteria:[]},
  candidates:[{key:'person',observations:[{stage:'list',roundId:'trial'},{stage:'list',roundId:'trial'},{stage:'detail',data:{status:'readable'}}]}]};
 const round=trialQuality(task).rounds[0];assert.equal(round.listObservations,2);
 assert.equal(round.identifiedCandidates,1);assert.equal(round.missingDetails,0);
});

test('quality counts unresolved criteria and invalidates findings after evidence changes',()=>{
 const candidate={key:'one',observations:[{stage:'list',roundId:'trial',hash:'list-v1'},{stage:'detail',hash:'detail-v1',data:{status:'readable'}}],evaluations:[]};
 const task={rounds:[{id:'trial',phase:'trial',status:'completed'}],operations:[],requirements:{criteria:[{id:'skill'}]},candidates:[candidate],unlinkedObservations:[{id:'unidentified',roundId:'trial',identityStatus:'unresolved'}]};
 candidate.evaluations.push({evidenceFingerprint:evaluationFingerprint(task,candidate),findings:[{criterionId:'skill',status:'supported'}]});
 assert.equal(trialQuality(task).rounds[0].unknownFindings,1);
 candidate.observations.push({stage:'detail',hash:'detail-v2',data:{status:'partial'}});
 assert.equal(trialQuality(task).rounds[0].unknownFindings,2);
 assert.equal(trialQuality(task).rounds[0].readableDetails,0);assert.equal(trialQuality(task).rounds[0].partialDetails,1);
 assert.equal(trialQuality(task).decisionRequired,true);
});
