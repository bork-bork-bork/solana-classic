import { createKey } from './tools/keys';
const index = process.argv.indexOf('--program'), name = index < 0 ? undefined : process.argv[index + 1];
if (index >= 0 && !name)
    throw new Error('Pass a program name');
if (name && !/^[a-zA-Z][a-zA-Z0-9_-]{0,40}$/.test(name))
    throw new Error('Use a simple program name');
const file = name ? 'program-' + name + '.json' : 'payer.json';
console.log(JSON.stringify({ publicKey: createKey(file).publicKey.toBase58(), privateStorage: '.data/developers/' + file, scope: 'Generated devnet-only key. Never import a real wallet or commit this file.' }, null, 2));
