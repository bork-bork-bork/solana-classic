//! Local in-process SVM tests with synthetic balances/keys. Not two networks,
//! real SOC, source-chain finality, or production security acceptance.
use borsh::BorshDeserialize;
use classic_bridge_program::state::*;
use litesvm::LiteSVM;
use solana_program::{clock::Clock,program_option::COption,program_pack::Pack,pubkey::Pubkey};
use solana_loader_v3_interface::state::UpgradeableLoaderState;
use solana_sdk::{account::Account,instruction::{AccountMeta,Instruction},signature::{Keypair,Signer},transaction::Transaction};
use solana_sdk_ids::{bpf_loader_upgradeable,system_program};
use spl_token_2022::state::{Account as TokenAccount,AccountState,Mint};
use std::path::Path;

fn call(svm:&mut LiteSVM,payer:&Keypair,program:Pubkey,accounts:Vec<AccountMeta>,data:BridgeInstruction,members:&[&Keypair])->bool {
    svm.expire_blockhash();
    let mut signers=vec![payer];for member in members {if member.pubkey()!=payer.pubkey(){signers.push(*member);}}
    let ix=Instruction{program_id:program,accounts,data:borsh::to_vec(&data).unwrap()};
    let tx=Transaction::new_signed_with_payer(&[ix],Some(&payer.pubkey()),&signers,svm.latest_blockhash());
    match svm.send_transaction(tx){Ok(_)=>true,Err(error)=>{eprintln!("Expected/observed runtime rejection: {:?}",error);false}}
}
fn account(svm:&mut LiteSVM,key:Pubkey,owner:Pubkey,data:Vec<u8>,executable:bool){
    svm.set_account(key,Account{lamports:svm.minimum_balance_for_rent_exemption(data.len()),owner,data,executable,..Account::default()}).unwrap();
}
fn install(svm:&mut LiteSVM,program:Pubkey,authority:Pubkey)->Pubkey{
    let elf=std::fs::read(Path::new(env!("CARGO_MANIFEST_DIR")).join("../../.tools/bridge-artifacts/classic_bridge_program.so")).expect("Build the SBF artifact before runtime tests");
    let program_data=Pubkey::find_program_address(&[program.as_ref()],&bpf_loader_upgradeable::ID).0;
    let mut bytes=bincode::serialize(&UpgradeableLoaderState::ProgramData{slot:0,upgrade_authority_address:Some(authority)}).unwrap();
    bytes.resize(UpgradeableLoaderState::size_of_programdata_metadata(),0);bytes.extend_from_slice(&elf);
    account(svm,program_data,bpf_loader_upgradeable::ID,bytes,false);
    account(svm,program,bpf_loader_upgradeable::ID,bincode::serialize(&UpgradeableLoaderState::Program{programdata_address:program_data}).unwrap(),true);
    program_data
}
struct Side{svm:LiteSVM,program:Pubkey,state:Pubkey,vault:Pubkey,escrow:Pubkey,program_data:Pubkey,config:Config}
fn side(mode:u8,program:Pubkey,remote:Pubkey,mint:Pubkey,payer:&Keypair,committee:&[Keypair;5])->Side{
    let mut svm=LiteSVM::new();svm.airdrop(&payer.pubkey(),20_000_000_000).unwrap();
    let token_bytes=std::fs::read(Path::new(env!("CARGO_MANIFEST_DIR")).join("../../.tools/programs/spl_token_2022-v10.0.0.so")).expect("Install the checksum-pinned official Token-2022 v10 program");
    let checksum=solana_program::hash::hash(&token_bytes).to_bytes().iter().map(|b|format!("{b:02x}")).collect::<String>();
    assert_eq!(checksum,"a794161408080f690dac00832f45b3c3e2b71f1339586667ad1f979cf91d5b68");
    svm.add_program(spl_token_2022::ID,&token_bytes).unwrap();
    let mut clock=svm.get_sysvar::<Clock>();clock.slot=20;clock.unix_timestamp=86_400;svm.set_sysvar(&clock);
    let program_data=install(&mut svm,program,payer.pubkey());
    let config=Config{magic:CONFIG_MAGIC,bridge:[1;32],local_chain:[if mode==ESCROW{2}else{3};32],remote_chain:[if mode==ESCROW{3}else{2};32],remote_program:remote.to_bytes(),origin_mint:mint.to_bytes(),committee:committee.each_ref().map(|k|k.pubkey().to_bytes()),origin_decimals:6,native_decimals:9,side:mode,threshold:3,epoch:1,new_locks_paused:true,settlement_paused:true,transfer_limit:2_000_000,daily_limit:4_000_000,day:0,daily_settled:0,outstanding:0};
    let state=Pubkey::find_program_address(&[b"config",&config.bridge],&program).0;
    let vault=Pubkey::find_program_address(&[b"vault",state.as_ref()],&program).0;
    let escrow=Pubkey::find_program_address(&[b"escrow",state.as_ref()],&program).0;
    if mode==ESCROW{
        let mut bytes=vec![0;Mint::LEN];Mint::pack(Mint{mint_authority:COption::None,supply:2_000_000,decimals:6,is_initialized:true,freeze_authority:COption::None},&mut bytes).unwrap();
        account(&mut svm,mint,spl_token_2022::ID,bytes,false);
    }
    for member in committee{svm.airdrop(&member.pubkey(),100_000_000).unwrap();}
    Side{svm,program,state,vault,escrow,program_data,config}
}
fn init_accounts(s:&Side,payer:&Keypair)->Vec<AccountMeta>{vec![
    AccountMeta::new(payer.pubkey(),true),AccountMeta::new(s.state,false),AccountMeta::new(s.vault,false),
    AccountMeta::new(if s.config.side==ESCROW{s.escrow}else{payer.pubkey()},false),
    AccountMeta::new_readonly(if s.config.side==ESCROW{Pubkey::new_from_array(s.config.origin_mint)}else{payer.pubkey()},false),
    AccountMeta::new_readonly(spl_token_2022::ID,false),AccountMeta::new_readonly(system_program::ID,false),
    AccountMeta::new_readonly(s.program,false),AccountMeta::new_readonly(s.program_data,false)]}
fn initialize(s:&mut Side,payer:&Keypair){let accounts=init_accounts(s,payer);assert!(call(&mut s.svm,payer,s.program,accounts,BridgeInstruction::Initialize(s.config.clone()),&[]));}
fn unpause(s:&mut Side,payer:&Keypair,members:&[&Keypair]) -> bool {
    let mut accounts=vec![AccountMeta::new(s.state,false)];accounts.extend(members.iter().map(|k|AccountMeta::new_readonly(k.pubkey(),true)));
    call(&mut s.svm,payer,s.program,accounts,BridgeInstruction::SetPause{new_locks:false,settlement:false},members)
}
fn token_balance(s:&Side,key:Pubkey)->u64{TokenAccount::unpack(&s.svm.get_account(&key).unwrap().data).unwrap().amount}
fn set_token(s:&mut Side,key:Pubkey,owner:Pubkey,amount:u64){
    let mut data=vec![0;TokenAccount::LEN];TokenAccount::pack(TokenAccount{mint:Pubkey::new_from_array(s.config.origin_mint),owner,amount,delegate:COption::None,state:AccountState::Initialized,is_native:COption::None,delegated_amount:0,close_authority:COption::None},&mut data).unwrap();account(&mut s.svm,key,spl_token_2022::ID,data,false);
}
fn deposit(s:&mut Side,user:&Keypair,recipient:Pubkey,amount:u64,nonce:u64,source_token:Option<Pubkey>)->Option<Event>{
    let receipt=Pubkey::find_program_address(&[b"event",s.state.as_ref(),user.pubkey().as_ref(),&nonce.to_le_bytes()],&s.program).0;
    let mut accounts=vec![AccountMeta::new(user.pubkey(),true),AccountMeta::new(s.state,false),AccountMeta::new(s.vault,false),AccountMeta::new(receipt,false),AccountMeta::new_readonly(system_program::ID,false)];
    if let Some(token)=source_token {accounts.extend([AccountMeta::new(token,false),AccountMeta::new(s.escrow,false),AccountMeta::new_readonly(Pubkey::new_from_array(s.config.origin_mint),false),AccountMeta::new_readonly(spl_token_2022::ID,false)]);}
    if !call(&mut s.svm,user,s.program,accounts,BridgeInstruction::Deposit{origin_amount:amount,nonce,recipient:recipient.to_bytes()},&[]){return None;}
    Some(Event::try_from_slice(&s.svm.get_account(&receipt).unwrap().data).unwrap())
}
fn claim(s:&mut Side,payer:&Keypair,event:Event,members:&[&Keypair],destination:Option<Pubkey>)->bool{
    let receipt=Pubkey::find_program_address(&[b"claim",s.state.as_ref(),&event.source_event],&s.program).0;
    let mut accounts=vec![AccountMeta::new(payer.pubkey(),true),AccountMeta::new(s.state,false),AccountMeta::new(s.vault,false),AccountMeta::new(receipt,false),AccountMeta::new(Pubkey::new_from_array(event.recipient),false),AccountMeta::new_readonly(system_program::ID,false)];
    if let Some(token)=destination{accounts.extend([AccountMeta::new(s.escrow,false),AccountMeta::new(token,false),AccountMeta::new_readonly(Pubkey::new_from_array(s.config.origin_mint),false),AccountMeta::new_readonly(spl_token_2022::ID,false)]);}
    accounts.extend(members.iter().map(|k|AccountMeta::new_readonly(k.pubkey(),true)));
    call(&mut s.svm,payer,s.program,accounts,BridgeInstruction::Claim(event),members)
}

#[test] fn sbf_roundtrip_and_replay_domain_quorum_controls(){
    let payer=Keypair::new();let members=std::array::from_fn(|_|Keypair::new());let origin_program=Pubkey::new_unique();let native_program=Pubkey::new_unique();let mint=Pubkey::new_unique();
    let mut origin=side(ESCROW,origin_program,native_program,mint,&payer,&members);let mut native=side(NATIVE,native_program,origin_program,mint,&payer,&members);
    initialize(&mut origin,&payer);initialize(&mut native,&payer);
    let a=Keypair::new();let b=Keypair::new();origin.svm.airdrop(&a.pubkey(),1_000_000_000).unwrap();native.svm.airdrop(&b.pubkey(),100_000_000).unwrap();
    let source=Pubkey::new_unique();set_token(&mut origin,source,a.pubkey(),2_000_000);
    assert!(deposit(&mut origin,&a,b.pubkey(),1_000_000,1,Some(source)).is_none(),"new bridge must start paused");
    assert!(!unpause(&mut origin,&payer,&[&members[0],&members[1]]));
    assert!(unpause(&mut origin,&payer,&[&members[0],&members[1],&members[2]]));assert!(unpause(&mut native,&payer,&[&members[0],&members[1],&members[2]]));
    let locked=deposit(&mut origin,&a,b.pubkey(),1_000_000,1,Some(source)).unwrap();
    assert_eq!(token_balance(&origin,origin.escrow),1_000_000);assert_eq!(token_balance(&origin,source),1_000_000);
    let claim_pda=Pubkey::find_program_address(&[b"claim",native.state.as_ref(),&locked.source_event],&native.program).0;
    assert!(!claim(&mut native,&payer,locked.clone(),&[&members[0],&members[1],&members[2]],None),"reserve must actually hold the native units");
    assert!(native.svm.get_account(&claim_pda).is_none(),"failed claim must atomically roll back replay marker");
    let fund=solana_system_interface::instruction::transfer(&payer.pubkey(),&native.vault,2_000_000_000);
    let tx=Transaction::new_signed_with_payer(&[fund],Some(&payer.pubkey()),&[&payer],native.svm.latest_blockhash());native.svm.send_transaction(tx).unwrap();
    assert!(!claim(&mut native,&payer,locked.clone(),&[&members[0],&members[1]],None));
    let mut wrong=locked.clone();wrong.destination_chain=[77;32];assert!(!claim(&mut native,&payer,wrong,&[&members[0],&members[1],&members[2]],None));
    let before=native.svm.get_balance(&b.pubkey()).unwrap();assert!(claim(&mut native,&payer,locked.clone(),&[&members[0],&members[1],&members[2]],None));assert_eq!(native.svm.get_balance(&b.pubkey()).unwrap()-before,1_000_000_000);
    assert!(!claim(&mut native,&payer,locked,&[&members[0],&members[1],&members[3]],None));
    let returned=deposit(&mut native,&b,a.pubkey(),400_000,2,None).unwrap();
    assert!(claim(&mut origin,&payer,returned.clone(),&[&members[0],&members[1],&members[2]],Some(source)));
    assert_eq!(token_balance(&origin,origin.escrow),600_000);assert_eq!(token_balance(&origin,source),1_400_000);
    let c=Config::try_from_slice(&native.svm.get_account(&native.state).unwrap().data).unwrap();assert_eq!(c.outstanding,600_000);
    assert!(!claim(&mut origin,&payer,returned,&[&members[0],&members[1],&members[3]],Some(source)));
    assert!(deposit(&mut origin,&a,b.pubkey(),1,1,Some(source)).is_none(),"a source nonce cannot create a second event");
}

#[test] fn sbf_init_authority_and_prefunded_pda(){
    let payer=Keypair::new();let members=std::array::from_fn(|_|Keypair::new());let mut s=side(NATIVE,Pubkey::new_unique(),Pubkey::new_unique(),Pubkey::new_unique(),&payer,&members);
    let attacker=Keypair::new();s.svm.airdrop(&attacker.pubkey(),1_000_000_000).unwrap();let accounts=init_accounts(&s,&attacker);
    assert!(!call(&mut s.svm,&attacker,s.program,accounts,BridgeInstruction::Initialize(s.config.clone()),&[]));assert!(s.svm.get_account(&s.state).is_none());
    s.svm.set_account(s.state,Account{lamports:1,owner:system_program::ID,..Account::default()}).unwrap();initialize(&mut s,&payer);
    assert_eq!(Config::try_from_slice(&s.svm.get_account(&s.state).unwrap().data).unwrap().threshold,3);
}

#[test] fn sbf_mutable_mint_is_rejected_before_escrow_creation(){
    let payer=Keypair::new();let members=std::array::from_fn(|_|Keypair::new());let mut s=side(ESCROW,Pubkey::new_unique(),Pubkey::new_unique(),Pubkey::new_unique(),&payer,&members);
    let mint=Pubkey::new_from_array(s.config.origin_mint);let mut data=s.svm.get_account(&mint).unwrap().data;
    let mut state=Mint::unpack(&data).unwrap();state.mint_authority=COption::Some(payer.pubkey());Mint::pack(state,&mut data).unwrap();account(&mut s.svm,mint,spl_token_2022::ID,data,false);
    let accounts=init_accounts(&s,&payer);assert!(!call(&mut s.svm,&payer,s.program,accounts,BridgeInstruction::Initialize(s.config.clone()),&[]));
    assert!(s.svm.get_account(&s.state).is_none());assert!(s.svm.get_account(&s.escrow).is_none());
}
