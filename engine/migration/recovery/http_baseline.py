"""Derive the real HTTP comparison input from exact archived application state.

Run only on an already reviewed private archive extraction, before opening its
application database in a service. Output contains public chain identifiers,
never IP records, bootstrap material or keys. It is not recovery acceptance.
"""
from pathlib import Path
import argparse, hashlib, importlib.util, json, sqlite3
spec=importlib.util.spec_from_file_location('recovery_launcher',Path(__file__).with_name('launcher.py'))
core=importlib.util.module_from_spec(spec);spec.loader.exec_module(core)

def build(dataset, app_manifest, bank_inventory, request_id=None):
    core.require(core.sha(app_manifest)==core.APP_SHA and core.sha(bank_inventory)==core.BASELINE_SHA, 'Exact archive-time manifests required')
    app=Path(dataset)/'app'; expected=json.loads(Path(app_manifest).read_text()); bank=json.loads(Path(bank_inventory).read_text())
    core.require(core.app_inventory(app)==expected, 'Full archived DB and immutable-file inventory differs')
    with sqlite3.connect('file:'+str(app/'app.sqlite')+'?mode=ro',uri=True) as db:
        rows=[]
        for document, signature, verified in db.execute('SELECT a.document,g.signature,g.verified_at FROM gallery g JOIN assets a ON a.hash=g.asset_hash WHERE g.genesis=? ORDER BY g.mint',(core.GENESIS,)):
            value=json.loads(document);value.update(issuanceSignature=signature,verifiedAt=verified);rows.append(value)
        canaries=[]
        for archived_request_id,wallet,state,signature in db.execute('SELECT request_id,wallet,state,signature FROM faucet WHERE state=? AND signature IS NOT NULL ORDER BY request_id',('confirmed',)):
            account=bank['accounts'].get(wallet,{})
            if account.get('owner')=='11111111111111111111111111111111' and 0<int(account['lamports'])<=9007199254740991 and (request_id is None or request_id==archived_request_id):
                canaries.append({'requestId':archived_request_id,'wallet':wallet,'state':state,'signature':signature,'lamports':1000000000,'balanceLamports':int(account['lamports']),'archiveDerived':True})
    core.require(len(rows)==617 and len({row['mint'] for row in rows})==617 and canaries, 'Complete617-row gallery and real archived1TEST canary required')
    return {'schemaVersion':1,'scope':'archive-derived HTTP recovery baseline only; not a passed drill','genesis':core.GENESIS,'rawArchiveSha256':core.RAW_SHA,'compressedArchiveSha256':core.ARCHIVE_SHA,'appManifestSha256':core.APP_SHA,'bankInventorySha256':core.BASELINE_SHA,'rows':rows,'canary':canaries[0],'immutableFiles':expected['files']}

def main():
    p=argparse.ArgumentParser();p.add_argument('--dataset',type=Path,required=True);p.add_argument('--app-manifest',type=Path,required=True);p.add_argument('--bank-inventory',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--request-id');a=p.parse_args()
    baseline=build(a.dataset,a.app_manifest,a.bank_inventory,a.request_id)
    with a.output.open('x') as out:out.write(json.dumps(baseline,indent=2)+'\n')
    a.output.chmod(0o600)
    print(json.dumps({'galleryRows':len(baseline['rows']),'immutableFiles':len(baseline['immutableFiles']),'passedDrill':False,'baselineSha256':hashlib.sha256(a.output.read_bytes()).hexdigest()}))
if __name__=='__main__':main()
