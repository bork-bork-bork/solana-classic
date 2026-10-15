"""Exact arithmetic for a bounded restored-bank vote-only interval.

The caller must pin an actual complete finalized snapshot/inspection first.
This pure module makes no network calls, writes or recovery acceptance claim.
"""
IDENTITY = 'B3apqZYKyJvn9cZ5rbGF74sKAjxfsWKcf6K5SgPYFHB7'
VOTE = 'Vote111111111111111111111111111111111111111'
MAX_INTERVAL = 10000

def require(condition, message):
    if not condition:
        raise ValueError(message)

def exact(value):
    require(type(value) is int and 0 <= value < 2**64, 'Exact unsigned integer required')
    return value

def reconcile(start, end, expected_blocks, blocks, before, after):
    require(type(start) is int and type(end) is int and 0 <= start < end and end-start <= MAX_INTERVAL, 'Bounded finalized bank interval required')
    require(isinstance(expected_blocks, list) and 0 < len(expected_blocks) <= MAX_INTERVAL and all(type(slot) is int and start < slot <= end for slot in expected_blocks) and expected_blocks == sorted(set(expected_blocks)), 'Exact complete getBlocks interval required')
    require(set(blocks) == set(expected_blocks), 'Missing or extra finalized block evidence')
    fees = rewards = transactions = 0
    for slot in expected_blocks:
        block = blocks[slot]
        require(isinstance(block, dict) and isinstance(block.get('transactions'), list) and isinstance(block.get('rewards'), list), 'Full finalized transaction/reward evidence required')
        for tx in block['transactions']:
            meta = tx.get('meta'); message = tx.get('transaction', {}).get('message', {})
            require(isinstance(meta, dict) and meta.get('err') is None, 'Successful vote-only metadata required')
            keys = message.get('accountKeys'); instructions = message.get('instructions')
            require(isinstance(keys, list) and keys and all(isinstance(k, str) for k in keys) and keys[0] == IDENTITY and isinstance(instructions, list) and instructions, 'Original identity must be vote fee payer')
            for instruction in instructions:
                index = instruction.get('programIdIndex')
                require(type(index) is int and 0 <= index < len(keys) and keys[index] == VOTE, 'Non-vote transaction in interval')
            require(not meta.get('innerInstructions'), 'Unexpected vote inner instructions')
            fees += exact(meta.get('fee')); transactions += 1
        for reward in block['rewards']:
            require(isinstance(reward, dict) and reward.get('rewardType') == 'Fee' and reward.get('pubkey') == IDENTITY, 'Unexpected account or reward type')
            rewards += exact(reward.get('lamports'))
    require(transactions > 0 and int(after)-int(before) == rewards-fees, 'Exact restored identity fee delta does not reconcile')
    return {'passed': True, 'fromExclusiveSlot': start, 'throughSlot': end, 'blocks': len(expected_blocks), 'transactions': transactions, 'totalFees': str(fees), 'feeRewards': str(rewards), 'netLamportDelta': str(rewards-fees), 'voteFeeMovementReconciled': True, 'allInstructionsAreVotes': True}
