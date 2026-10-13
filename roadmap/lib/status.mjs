export const SOAK_DURATION_MS = 86_400_000;
const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : null;
const identityKeys = ['genesis', 'sourceCommit', 'coreSha256', 'apiBootId', 'validatorBootId', 'deploymentId'];
const engineSteps = ['source', 'toolchain', 'compile', 'upstream-tests', 'program', 'isolated-start', 'transactions', 'restart', 'cold-restore'];
const engineBinaries = ['agave-validator', 'solana-test-validator', 'solana', 'solana-keygen'];
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function summarizeEngineBuild(expected, probe, now = Date.now()) {
  const unavailable = { state: expected ? 'unknown' : 'pending', buildState: 'pending', testState: 'pending', readyForReview: false, cutoverAccepted: false, steps: {}, cargoPackagesStarted: null, lastPackage: null, reportAt: null, startedAt: null, binaries: {}, testSummaries: [] };
  const feed = probe?.ok ? object(probe.data) : null;
  if (!expected || !feed) return unavailable;
  const keys = ['runId', 'upstreamCommit', 'upstreamTree', 'sourceRepositoryCommit', 'sourceManifestSha256', 'workerSha256'];
  if (feed.schemaVersion !== 1 || !keys.every(key => typeof expected[key] === 'string' && feed[key] === expected[key])) return { ...unavailable, state: 'candidate-changed' };
  if (!date(feed.at) || now - Date.parse(feed.at) > 90_000 || Date.parse(feed.at) > now + 10_000 || !date(feed.startedAt) || Date.parse(feed.startedAt) > Date.parse(feed.at) || !date(feed.updatedAt) || Date.parse(feed.updatedAt) > Date.parse(feed.at)) return { ...unavailable, state: 'stale' };
  const steps = Object.fromEntries(engineSteps.map(id => { const step = object(feed.steps?.[id]); const passed = step?.state === 'passed' && !!date(step.startedAt) && !!date(step.completedAt) && Date.parse(step.startedAt) >= Date.parse(feed.startedAt) && Date.parse(step.completedAt) >= Date.parse(step.startedAt) && Date.parse(step.completedAt) <= now + 10_000; return [id, { state: passed ? 'passed' : ['queued','running','failed'].includes(step?.state) ? step.state : 'unknown', startedAt: date(step?.startedAt), completedAt: date(step?.completedAt), durationSeconds: Number.isFinite(step?.durationSeconds) && step.durationSeconds >= 0 ? step.durationSeconds : null }]; }));
  const binaries = Object.fromEntries(engineBinaries.flatMap(name => { const b=object(feed.binaries?.[name]);return b && hash(b.sha256) && count(b.bytes) > 0 && typeof b.version === 'string' && b.version.includes('3.0.14') ? [[name,{sha256:b.sha256,bytes:b.bytes,version:b.version.slice(0,240)}]] : []; }));
  const completeBinaries = Object.keys(binaries).length === engineBinaries.length;
  const testSummaries = Array.isArray(feed.testSummaries) ? feed.testSummaries.filter(x=>typeof x==='string' && /^test result: ok\. \d+ passed; 0 failed;/.test(x)).slice(-16).map(x=>x.slice(0,240)) : [];
  const actualUnitTests = testSummaries.length >= 2 && testSummaries.filter(x=>Number(x.match(/(\d+) passed/)[1]) > 0).length >= 2;
  const isolatedGenesis = typeof feed.isolatedGenesis==='string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(feed.isolatedGenesis) && !['7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon','5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d','EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG','4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY'].includes(feed.isolatedGenesis) ? feed.isolatedGenesis : null;
  const readyForReview = feed.state==='completed' && feed.passed===true && engineSteps.every(id=>steps[id].state==='passed') && completeBinaries && actualUnitTests && isolatedGenesis !== null && feed.tokenProgramSha256==='a794161408080f690dac00832f45b3c3e2b71f1339586667ad1f979cf91d5b68' && !!date(feed.completedAt) && Date.parse(feed.completedAt)>=Date.parse(feed.startedAt) && Date.parse(feed.completedAt)<=now+10_000;
  const phase = engineSteps.includes(feed.phase) ? feed.phase : feed.phase==='review' ? 'review' : null;
  let state=readyForReview?'ready':feed.state==='failed'?'failed':feed.state==='interrupted'?'interrupted':feed.state==='running' && phase ? 'running':feed.state==='completed'?'verification-needed':'unknown';
  if (state==='running' && ['compile','upstream-tests'].includes(phase) && feed.processAlive!==true) state='verification-needed';
  const buildState=steps.compile.state==='passed' && completeBinaries ? 'passed':state==='failed' && ['source','toolchain','compile'].includes(phase)?'failed':state==='interrupted'?'interrupted':phase==='compile' && state==='running'?'running':state==='stale'||state==='unknown'||state==='candidate-changed'?'unknown':'pending';
  const testState=readyForReview?'passed':state==='failed' && !['source','toolchain','compile'].includes(phase)?'failed':state==='interrupted'?'interrupted':state==='running' && engineSteps.indexOf(phase)>2?'running':buildState==='failed'?'blocked':'pending';
  return {state,buildState,testState,readyForReview,cutoverAccepted:false,phase,steps,binaries,testSummaries,isolatedGenesis,reportAt:date(feed.at),startedAt:date(feed.startedAt),lastActivityAt:date(feed.lastActivityAt),cargoPackagesStarted:count(feed.cargoPackagesStarted),lastPackage:typeof feed.lastPackage==='string' && /^[a-zA-Z0-9_-]{1,80}$/.test(feed.lastPackage)?feed.lastPackage:null};
}

export function summarize(checkpoint, probes, now = Date.now()) {
  const unwrap = key => probes[key]?.ok ? object(probes[key].data) : null;
  const runtime = unwrap('runtime'), network = unwrap('network'), monitor = unwrap('monitor'), qa = unwrap('qa'), feed = unwrap('progress');
  const expected = checkpoint.runtime;
  const identityMatches = runtime ? identityKeys.every(key => typeof runtime[key] === 'string' && runtime[key] === expected[key]) : null;
  const freezeMatches = typeof qa?.freezeSha256 === 'string' ? qa.freezeSha256 === checkpoint.freezeSha256 : null;
  const progressFreezeMatches = typeof feed?.freezeSha256 === 'string' ? feed.freezeSha256 === checkpoint.freezeSha256 : null;
  const candidateMatches = item => !!object(item) && item.genesis === expected.genesis && !!object(item.candidate) && Object.entries(checkpoint.candidate).every(([key, value]) => item.candidate[key] === value);
  const runMatches = item => candidateMatches(item) && !!date(checkpoint.soakStartedAt) && !!date(item.startedAt) && Date.parse(item.startedAt) === Date.parse(checkpoint.soakStartedAt);
  const validReport = item => runMatches(item) && !!date(item.at) && Date.parse(item.startedAt) <= Date.parse(item.at) && Date.parse(item.at) <= now + 10_000;
  const progress = object(feed?.progress), result = object(feed?.result);
  const validProgress = validReport(progress), validResult = validReport(result);
  // A terminal result is authoritative over an older journey report. Reader
  // response timestamps are not journey observations or evidence of continuity.
  const report = validResult ? result : validProgress ? progress : null;
  const startedAt = date(report?.startedAt);
  const endsAt = startedAt ? new Date(Date.parse(startedAt) + SOAK_DURATION_MS).toISOString() : null;
  const reportAt = date(report?.at);
  const progressStale = qa?.state === 'starting' && (!reportAt || now - Date.parse(reportAt) > 480_000);
  const measuredJourneys = count(report?.completedJourneys);
  const completedJourneys = measuredJourneys !== null && measuredJourneys <= 288 ? measuredJourneys : null;
  let accepted = qa?.state === 'completed' && qa.soakAccepted === true && validResult && result.passed === true && Number.isSafeInteger(result.durationMs) && result.durationMs >= SOAK_DURATION_MS && Date.parse(result.at) - Date.parse(result.startedAt) >= SOAK_DURATION_MS && now - Date.parse(result.startedAt) >= SOAK_DURATION_MS && completedJourneys === 288 && identityMatches === true && freezeMatches === true && progressFreezeMatches === true;
  const interrupted = qa?.state === 'interrupted' || (validResult && result.passed === false);
  let soakState = 'unknown';
  if (qa) soakState = interrupted ? 'interrupted' : accepted ? 'passed' : qa.state === 'completed' ? 'verification-needed' : qa.state === 'starting' ? startedAt ? progressStale ? 'stale' : 'running' : 'starting' : qa.state === 'blocked' ? 'blocked' : 'waiting';
  if (qa?.state === 'starting' && (identityMatches !== true || freezeMatches !== true || progressFreezeMatches !== true)) soakState = 'unknown';
  if (soakState === 'running' && completedJourneys === null) soakState = 'unknown';
  const mismatchedReport = [progress, result].some(item => item && ('candidate' in item || 'genesis' in item) && (!candidateMatches(item) || date(item.startedAt) && (!date(checkpoint.soakStartedAt) || Date.parse(item.startedAt) !== Date.parse(checkpoint.soakStartedAt))));
  if (identityMatches === false || freezeMatches === false || progressFreezeMatches === false || mismatchedReport) { soakState = 'candidate-changed'; accepted = false; }
  const monitorAt = date(monitor?.lastProbeAt);
  const monitorFresh = !!monitorAt && now - Date.parse(monitorAt) < 90_000 && now >= Date.parse(monitorAt) - 10_000;
  return {
    schemaVersion: 1, fetchedAt: new Date(now).toISOString(), checkpoint,
    sources: Object.fromEntries(Object.entries(probes).map(([key, value]) => [key, { ok: value.ok === true && !!object(value.data), error: value.ok === true && object(value.data) ? null : 'Public status source unavailable', fetchedAt: date(value.fetchedAt) }])),
    network: { state: ['online', 'degraded'].includes(network?.state) ? network.state : 'unknown', genesisMatches: network?.genesisMatches === true, slot: count(network?.slot), finalizedSlot: monitorFresh ? count(monitor?.current?.finalizedSlot) : null, identityMatches, monitorState: monitorFresh ? monitor.current?.healthy === true && monitor.overdue !== true ? 'online' : 'degraded' : 'stale', monitorAt, lastProgressAt: date(monitor?.current?.lastProgressAt) },
    soak: { state: soakState, runnerState: typeof qa?.state === 'string' ? qa.state : 'unknown', freezeMatches, progressFreezeMatches, startedAt, endsAt, reportAt, progressStale, completedJourneys, totalJourneys: 288, observations: count(report?.observations), accepted: !!accepted, activationAt: date(qa?.soakStarted ? qa.at : null), issues: Array.isArray(qa?.issues) ? qa.issues.filter(x => typeof x === 'string').slice(0, 12).map(x => x.slice(0, 200)) : [], elapsedMs: startedAt ? Math.max(0, now - Date.parse(startedAt)) : null },
    engineBuild: summarizeEngineBuild(checkpoint.engineBuild, probes.engineBuild, now),
    // Release approval remains an explicit reviewed checkpoint; the soak alone
    // does not confer release, production token, bridge, or mainnet acceptance.
    releaseAccepted: checkpoint.releaseAccepted === true && accepted === true
  };
}
