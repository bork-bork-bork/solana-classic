"""Pure complete-bank account inventory validation and continuity comparison.

No RPC, keys, signing, deployment or migration control-file writing.
Inputs stay private; only a bounded comparison summary should be published.
"""
import base64, hashlib, json, re

GENESIS = '7TAUSfTzQeocodtVee2qsftsCYnJu2eCM1ALdADbHNon'
MAX_ACCOUNTS = 100_000
MAX_DATA = 10_485_760
SYSTEM = '11111111111111111111111111111111'
VOTE = 'Vote111111111111111111111111111111111111111'
STAKE = 'Stake11111111111111111111111111111111111111'
SYSVAR = 'Sysvar1111111111111111111111111111111111111'

def integer(value):
    if type(value) is not int or not 0 <= value < 2**64:
        raise ValueError('Exact unsigned account integer required')
    return value

def address(value):
    if not isinstance(value, str) or not re.fullmatch(r'[1-9A-HJ-NP-Za-km-z]{32,44}', value):
        raise ValueError('Public account address required')
    return value

def inventory(document, genesis):
    if genesis != GENESIS:
        raise ValueError('Only the authorized canonical devnet may be inspected')
    rows = document.get('accounts')
    if not isinstance(rows, list) or not 1 <= len(rows) <= MAX_ACCOUNTS:
        raise ValueError('Bounded full bank account list required')
    accounts = {}
    data_len = executable_count = 0
    for row in rows:
        key = address(row.get('pubkey'))
        if key in accounts:
            raise ValueError('Duplicate inventory address')
        account = row.get('account')
        if not isinstance(account, dict) or type(account.get('executable')) is not bool:
            raise ValueError('Invalid inventory account')
        encoded = account.get('data')
        if not isinstance(encoded, list) or len(encoded) != 2 or encoded[1] != 'base64' or not isinstance(encoded[0], str) or len(encoded[0]) > ((MAX_DATA+2)//3)*4:
            raise ValueError('Bounded canonical base64 account bytes required')
        try:
            data = base64.b64decode(encoded[0], validate=True)
        except Exception as error:
            raise ValueError('Invalid account bytes') from error
        if len(data) > MAX_DATA or base64.b64encode(data).decode() != encoded[0]:
            raise ValueError('Noncanonical account bytes')
        lamports = integer(account.get('lamports'))
        if not lamports:
            raise ValueError('Full bank inventory must contain loadable positive accounts')
        if 'space' in account and integer(account['space']) != len(data):
            raise ValueError('Account space differs from actual bytes')
        item = {'owner': address(account.get('owner')), 'lamports': str(lamports),
                'executable': account['executable'], 'rentEpoch': str(integer(account.get('rentEpoch'))),
                'bytes': len(data), 'dataSHA256': hashlib.sha256(data).hexdigest()}
        accounts[key] = item
        data_len += len(data)
        executable_count += item['executable']
    summary = document.get('summary')
    if summary is not None and (not isinstance(summary, dict) or summary.get('num_accounts') != len(accounts) or summary.get('data_len') != data_len or summary.get('num_executable_accounts') != executable_count):
        raise ValueError('Full bank scan summary differs from emitted account list')
    canonical = dict(sorted(accounts.items()))
    digest = hashlib.sha256(json.dumps(canonical, separators=(',', ':'), sort_keys=True).encode()).hexdigest()
    return {'genesis': genesis, 'accounts': canonical, 'accountCount': len(accounts),
            'dataBytes': data_len, 'executableCount': executable_count,
            'lamports': str(sum(int(a['lamports']) for a in accounts.values())), 'sha256': digest}

def compare(before, after, *, protocol_data=(), fee_collector=None, max_fee_delta=0):
    if before.get('genesis') != GENESIS or after.get('genesis') != GENESIS:
        raise ValueError('Wrong continuity network')
    old, new = before['accounts'], after['accounts']
    if set(old) != set(new):
        raise ValueError('Complete positive account inventory changed')
    allowed = set(protocol_data)
    if len(allowed) > 20 or len(allowed) != len(protocol_data):
        raise ValueError('Explicit bounded protocol data allowlist required')
    for key in allowed:
        address(key)
        if key not in old or old[key]['executable'] or old[key]['owner'] not in [SYSVAR, VOTE, STAKE]:
            raise ValueError('Only named existing consensus/sysvar account data can advance')
    if fee_collector is not None:
        address(fee_collector)
        if fee_collector not in old or old[fee_collector]['owner'] != SYSTEM or old[fee_collector]['executable'] or old[fee_collector]['bytes'] != 0:
            raise ValueError('Fee collector must be a named existing empty system account')
        if type(max_fee_delta) is not int or not 0 <= max_fee_delta <= 1_000_000_000:
            raise ValueError('Bounded fee movement required')
    changes = []
    for key, previous in old.items():
        current = new[key]
        changed = [field for field in previous if previous[field] != current.get(field)]
        remaining = set(changed)
        if key in allowed:
            remaining.discard('dataSHA256')
        if key == fee_collector and abs(int(previous['lamports'])-int(current['lamports'])) <= max_fee_delta:
            remaining.discard('lamports')
        if remaining:
            raise ValueError('Account continuity differs: '+key+' '+','.join(sorted(remaining)))
        if changed:
            changes.append({'address': key, 'fields': changed})
    return {'passed': True, 'accountCount': len(old), 'beforeSHA256': before['sha256'],
            'afterSHA256': after['sha256'], 'protocolChanges': changes,
            'userAndProgrammeAccountsUnchanged': True, 'genesis': GENESIS,
            'canEnableWrites': False}
