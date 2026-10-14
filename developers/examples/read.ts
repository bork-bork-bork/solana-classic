import { connectDevnet } from '../client';
const { network, connection } = await connectDevnet();
const slot = await connection.getSlot('finalized');
console.log(JSON.stringify({ network: network.name, genesis: network.expectedGenesisHash, slot, programsVerified: true, hasMonetaryValue: false, mainnet: false }, null, 2));
