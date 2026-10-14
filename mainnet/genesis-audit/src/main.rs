//! Read every account from an actual Agave genesis.bin, with exact integer totals.
use solana_genesis_config::GenesisConfig;
use std::path::Path;
fn main() {
    let args: Vec<_> = std::env::args().collect();
    assert_eq!(args.len(), 2, "Pass one private rehearsal ledger directory");
    let path = Path::new(&args[1]);
    assert!(path.starts_with("/data/mainnet-rehearsal-v1"), "Only the isolated worker rehearsal is supported");
    let g = GenesisConfig::load(path).expect("Read actual genesis.bin");
    assert_eq!(format!("{:?}", g.cluster_type), "Development");
    let mut accounts: Vec<_> = g.accounts.iter().map(|(key,a)| serde_json::json!({
        "address":key.to_string(),"lamports":a.lamports.to_string(),
        "owner":a.owner.to_string(),"dataBytes":a.data.len(),"executable":a.executable
    })).collect();
    accounts.sort_by_key(|a| a["address"].as_str().unwrap().to_owned());
    let total: u128 = g.accounts.values().map(|a|u128::from(a.lamports)).sum();
    println!("{}", serde_json::json!({"genesis":g.hash().to_string(),"clusterType":"development",
        "totalLamports":total.to_string(),"accountCount":accounts.len(),"accounts":accounts,
        "inflation":g.inflation,"feeRateGovernor":g.fee_rate_governor,"rent":g.rent,
        "epochSchedule":g.epoch_schedule,"pohConfig":g.poh_config}));
}
