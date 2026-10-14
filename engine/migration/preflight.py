"""Read-only cutover admission report. No deployment, restart or signing actions."""
import argparse,datetime,hashlib,json,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
URL='https://solanaclassic.net/roadmap/api/status'
def admitted(status,freeze,now):
    soak=status.get('soak',{});network=status.get('network',{});engine=status.get('engineBuild',{})
    started=soak.get('startedAt');end=soak.get('endsAt')
    def stamp(value):
        try:return datetime.datetime.fromisoformat(value.replace('Z','+00:00')).timestamp()
        except (ValueError,TypeError,AttributeError):return float('inf')
    return {
      'freshStatus':-10<=now-stamp(status.get('fetchedAt'))<=60,
      'canonicalRuntimeStillMatches':network.get('state')=='online' and network.get('genesisMatches') is True and network.get('identityMatches') is True and status.get('checkpoint',{}).get('candidate')==freeze['candidate'],
      'originalSoakPassed':soak.get('accepted') is True and soak.get('state')=='passed' and soak.get('completedJourneys')==288 and soak.get('startedAt')=='2026-10-13T16:48:22.762Z' and stamp(end)-stamp(started)>=86400 and stamp(end)<=now and not soak.get('issues'),
      'sourceBuildReady':engine.get('state')=='ready' and engine.get('readyForReview') is True and engine.get('buildState')=='passed' and engine.get('testState')=='passed' and status.get('checkpoint',{}).get('engineBuild',{}).get('runId')=='40de48b7-6963-429b-ae3e-81a610d81b7d',
      'newFullDayFitsFixedDeadline':now+86400<datetime.datetime(2026,10,19,3,0,54,tzinfo=datetime.timezone.utc).timestamp()
    }
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--prepare',action='store_true');args=parser.parse_args()
    freeze=json.loads((ROOT/'evidence/candidate-freeze.json').read_text())
    with urllib.request.urlopen(URL,timeout=20) as response:
        raw=response.read(262145)
        if len(raw)>262144:raise RuntimeError('Public status exceeds bound')
    status=json.loads(raw);now=datetime.datetime.now(datetime.timezone.utc)
    gates=admitted(status,freeze,now.timestamp())
    gates['frozenFilesUnchanged']=all(hashlib.sha256((ROOT/path).read_bytes()).hexdigest()==sha for path,sha in freeze['coreFiles'].items())
    rehearsal=json.loads((ROOT/'evidence/agave-migration-rollback-rehearsal.json').read_text())
    gates['mixedBinaryRollbackRehearsal']=rehearsal.get('passed') is True and rehearsal.get('sourceBuildRunId')=='40de48b7-6963-429b-ae3e-81a610d81b7d' and rehearsal.get('productionNetworkChanged') is False
    package=json.loads((ROOT/'evidence/source-runtime-candidate-package.json').read_text())
    gates['preparedPackageMatches']=all(hashlib.sha256((ROOT/'.tools/source-runtime-candidate'/path).read_bytes()).hexdigest()==sha for path,sha in package['files'].items())
    image_path=ROOT/'evidence/source-runtime-image-probe.json'
    image=json.loads(image_path.read_text()) if image_path.exists() else {}
    gates['runtimeImageVerified']=image.get('passed') is True and image.get('migrationId')==package['migrationId'] and image.get('coreSha256')==package['coreSha256'] and bool(image.get('imageDigest'))
    can_enter=all(gates.values())
    report={'at':now.isoformat(),'scope':'read-only migration admission review; not a cutover or release acceptance','preparationReviewed':all(gates.get(k) for k in ['frozenFilesUnchanged','mixedBinaryRollbackRehearsal','preparedPackageMatches','runtimeImageVerified']), 'canEnterMaintenance':can_enter,'canSwitchNow':False,'gates':gates,'remainingAtMaintenance':['Create and verify a fresh stopped-writer backup and continuity baseline.','Verify canonical ledger, database and immutable assets in the held candidate before opening writes.'],'productionNetworkChanged':False}
    (ROOT/'evidence/agave-migration-preflight.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
    if not args.prepare and not can_enter:raise SystemExit(2)
if __name__=='__main__':main()
