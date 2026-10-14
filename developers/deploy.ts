import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { Keypair, PublicKey, SystemProgram, type TransactionInstruction } from '@solana/web3.js';
import { connectDevnet } from './client';
import { key, createKey, privateJson, directory } from './tools/keys';
import { LOADER, programData, initializeBuffer, writeBuffer, deployBuffer, upgradeBuffer } from './tools/loader';
import { submitInstructions, waitForSignature } from '@solana-classic/chain';
const args = process.argv.slice(2), option = (name: string) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
const resume = option('--resume'), source = option('--file'), live = args.includes('--deploy');
if (!resume && !source)
    throw new Error('Use --file path/to/program.so to review, then add --deploy. Or --resume .data/developers/deployment-....json --deploy.');
const payer = key('payer.json'), { network, connection } = await connectDevnet();
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
let job: any, path: string, bytes: Buffer;
if (resume) {
    path = resolve(resume);
    if (!path.startsWith(directory + '/deployment-'))
        throw new Error('Resume requires this project’s private deployment record');
    job = JSON.parse(readFileSync(path, 'utf8'));
    if (job.genesis !== network.expectedGenesisHash || job.authority !== payer.publicKey.toBase58())
        throw new Error('Deployment authority or genesis changed');
    bytes = readFileSync(job.sourceFile);
    if (hash(bytes) !== job.sha256)
        throw new Error('Compiled program changed; cannot resume this receipt');
}
else {
    bytes = readFileSync(resolve(source!));
    if (bytes.length < 64 || bytes.length > 256000 || !bytes.subarray(0, 4).equals(Buffer.from([127, 69, 76, 70])))
        throw new Error('An SBF ELF file of 64–256,000 bytes is required');
    const name = option('--name') ?? basename(source!).replace(/\.so$/, '');
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,40}$/.test(name))
        throw new Error('Use a simple program name');
    const program = createKey('program-' + name + '.json');
    const existing = await connection.getAccountInfo(program.publicKey, 'finalized');
    const upgrade = args.includes('--upgrade');
    let maxDataLen = bytes.length * 2;
    if (existing) {
        if (!upgrade)
            throw new Error('Program already exists. Use --upgrade for an intentional upgrade, or resume its existing record.');
        const pd = await connection.getAccountInfo(programData(program.publicKey), 'finalized');
        if (!existing.executable || !existing.owner.equals(LOADER) || !pd || !pd.owner.equals(LOADER) || pd.data.readUInt32LE(0) !== 3 || pd.data[12] !== 1 || !pd.data.subarray(13, 45).equals(payer.publicKey.toBuffer()))
            throw new Error('Only this generated devnet authority can upgrade the recorded program');
        maxDataLen = pd.data.length - 45;
        if (bytes.length > maxDataLen)
            throw new Error('Upgrade exceeds deployed program capacity');
    }
    else if (upgrade)
        throw new Error('No existing programme to upgrade');
    const [bufferRent, programRent, dataRent] = await Promise.all([connection.getMinimumBalanceForRentExemption(bytes.length + 37), connection.getMinimumBalanceForRentExemption(36), connection.getMinimumBalanceForRentExemption(maxDataLen + 45)]);
    const maxFees = (Math.ceil(bytes.length / 800) + 3) * 10000;
    const budget = bufferRent + programRent + dataRent + maxFees;
    if (await connection.getBalance(payer.publicKey, 'confirmed') < budget)
        throw new Error('Insufficient tSOC for the temporary rent/fee budget. Run the devnet funding command.');
    console.log(JSON.stringify({ review: { program: program.publicKey.toBase58(), authority: payer.publicKey.toBase58(), bytes: bytes.length, sha256: hash(bytes), upgrade, maxDataLen, estimatedTemporaryBudgetLamports: budget, hasMonetaryValue: false } }, null, 2));
    if (!live)
        process.exit(0);
    const buffer = Keypair.generate(), bufferKey = 'buffer-' + buffer.publicKey.toBase58() + '.json';
    privateJson(bufferKey, { genesis: network.expectedGenesisHash, publicKey: buffer.publicKey.toBase58(), secretKey: [...buffer.secretKey] });
    job = { schemaVersion: 1, genesis: network.expectedGenesisHash, sourceFile: resolve(source!), sha256: hash(bytes), program: program.publicKey.toBase58(), programKey: 'program-' + name + '.json', authority: payer.publicKey.toBase58(), buffer: buffer.publicKey.toBase58(), bufferKey, bufferRent, programRent, maxDataLen, upgrade, offset: 0, phase: 'buffer', pending: null, receipts: [] };
    path = privateJson('deployment-' + buffer.publicKey.toBase58() + '.json', job);
}
if (!live) {
    console.log(JSON.stringify({ record: path, phase: job.phase, offset: job.offset, pending: job.pending }));
    process.exit(0);
}
function save() { writeFileSync(path, JSON.stringify(job) + '\n', { mode: 0o600 }); }
async function send(instructions: TransactionInstruction[], extra: Keypair[], nextPhase: string, nextOffset: number, target: 'confirmed' | 'finalized' = 'confirmed') {
    const signature = await submitInstructions(connection, network.expectedGenesisHash, payer, instructions, extra, progress => { if (progress.signature && !job.pending) {
        job.pending = { signature: progress.signature, nextPhase, nextOffset, target };
        save();
        console.log(JSON.stringify({ record: path, phase: job.phase, signature: progress.signature }));
    } });
    await waitForSignature(connection, signature, target);
    job.receipts.push({ signature, step: job.phase, target });
    job.phase = nextPhase;
    job.offset = nextOffset;
    job.pending = null;
    save();
}
try {
    if (job.pending) {
        await waitForSignature(connection, job.pending.signature, job.pending.target);
        job.receipts.push({ signature: job.pending.signature, step: job.phase, target: job.pending.target });
        job.phase = job.pending.nextPhase;
        job.offset = job.pending.nextOffset;
        job.pending = null;
        save();
    }
    const buffer = new PublicKey(job.buffer), program = new PublicKey(job.program);
    if (job.phase === 'buffer')
        await send([SystemProgram.createAccount({ fromPubkey: payer.publicKey, newAccountPubkey: buffer, lamports: job.bufferRent, space: bytes.length + 37, programId: LOADER }), initializeBuffer(buffer, payer.publicKey)], [key(job.bufferKey)], 'write', 0);
    while (job.phase === 'write' && job.offset < bytes.length) {
        const end = Math.min(job.offset + 800, bytes.length);
        await send([writeBuffer(buffer, payer.publicKey, job.offset, bytes.subarray(job.offset, end))], [], 'write', end);
        await new Promise(r => setTimeout(r, 1100));
    }
    if (job.phase === 'write') {
        const account = await connection.getAccountInfo(buffer, 'confirmed');
        if (!account || !account.owner.equals(LOADER) || account.data.readUInt32LE(0) !== 1 || account.data[4] !== 1 || !account.data.subarray(5, 37).equals(payer.publicKey.toBuffer()) || !account.data.subarray(37).equals(bytes))
            throw new Error('Uploaded buffer or authority does not match the reviewed ELF');
        job.phase = 'deploy';
        save();
    }
    if (job.phase === 'deploy') {
        const instructions = job.upgrade ? [upgradeBuffer(payer.publicKey, program, buffer)] : [SystemProgram.createAccount({ fromPubkey: payer.publicKey, newAccountPubkey: program, lamports: job.programRent, space: 36, programId: LOADER }), deployBuffer(payer.publicKey, program, buffer, job.maxDataLen)];
        await send(instructions, job.upgrade ? [] : [key(job.programKey)], 'complete', bytes.length, 'finalized');
    }
    const [account, pd] = await Promise.all([connection.getAccountInfo(program, 'finalized'), connection.getAccountInfo(programData(program), 'finalized')]);
    if (!account?.executable || !account.owner.equals(LOADER) || account.data.readUInt32LE(0) !== 2 || !account.data.subarray(4, 36).equals(programData(program).toBuffer()) || !pd || !pd.owner.equals(LOADER) || pd.data.readUInt32LE(0) !== 3 || pd.data[12] !== 1 || !pd.data.subarray(13, 45).equals(payer.publicKey.toBuffer()) || hash(pd.data.subarray(45, 45 + bytes.length)) !== job.sha256)
        throw new Error('Finalized program/authority/bytecode verification failed');
    job.verifiedAt = new Date().toISOString();
    save();
    console.log(JSON.stringify({ passed: true, program: job.program, programData: programData(program).toBase58(), authority: job.authority, sha256: job.sha256, bytes: bytes.length, upgrade: job.upgrade, record: path, receipt: job.receipts.at(-1).signature, explorer: network.explorer + '/address/' + job.program, hasMonetaryValue: false }, null, 2));
}
catch (error) {
    console.error('Deployment stopped. Retain generated keys and record. Review/resume the same receipt: ' + path);
    throw error;
}
