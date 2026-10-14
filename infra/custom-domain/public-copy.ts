// Display text only. Network identity, admission and raw evidence stay unchanged.
export function publicCopy(value: string | undefined): string {
    return (value ?? '').replace(/\ban experimental network\b/gi, 'a devnet')
        .replace(/\bexperimental devnet\b/gi, 'devnet')
        .replace(/\bexperimental network\b/gi, 'devnet')
        .replace(/\bexperimental\b/gi, 'development')
        .replace(/\ban devnet\b/gi, 'a devnet')
        .replace(/\bdevnet testnet\b/gi, 'devnet')
        .replace(/\bTestnet\b/g, 'Devnet')
        .replace(/\btestnet\b/g, 'devnet');
}
