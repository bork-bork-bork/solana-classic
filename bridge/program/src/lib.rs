#![allow(unexpected_cfgs)]
pub mod state;

use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::{account_info::{next_account_info, AccountInfo}, clock::Clock,
    entrypoint::ProgramResult, program::{invoke, invoke_signed}, program_error::ProgramError,
    program_option::COption, pubkey::Pubkey, rent::Rent, sysvar::Sysvar};
use solana_loader_v3_interface::state::UpgradeableLoaderState;
use solana_sdk_ids::{bpf_loader_upgradeable, system_program};
use solana_system_interface::instruction as system;
use spl_token_2022::{extension::{BaseStateWithExtensions, ExtensionType, StateWithExtensions},
    instruction as token, state::{Account as TokenAccount, AccountState, Mint}};
use state::*;

#[cfg(not(feature = "no-entrypoint"))]
solana_program::entrypoint!(process_instruction);

fn assert_writable(account: &AccountInfo) -> ProgramResult {
    if !account.is_writable { return Err(ProgramError::InvalidAccountData); } Ok(())
}
fn signer(account: &AccountInfo) -> ProgramResult {
    if !account.is_signer { return Err(ProgramError::MissingRequiredSignature); } Ok(())
}
fn pda(account: &AccountInfo, seeds: &[&[u8]], program: &Pubkey) -> Result<u8, ProgramError> {
    let (expected, bump) = Pubkey::find_program_address(seeds, program);
    if *account.key != expected { return Err(ProgramError::InvalidSeeds); } Ok(bump)
}
fn write<T: BorshSerialize>(account: &AccountInfo, value: &T) -> ProgramResult {
    assert_writable(account)?;
    let bytes = borsh::to_vec(value).map_err(|_| ProgramError::InvalidAccountData)?;
    let mut data = account.try_borrow_mut_data()?;
    if data.len() != bytes.len() { return Err(ProgramError::InvalidAccountData); }
    data.copy_from_slice(&bytes); Ok(())
}
fn config(account: &AccountInfo, program: &Pubkey) -> Result<Config, ProgramError> {
    if account.owner != program { return Err(ProgramError::IllegalOwner); }
    let c = Config::try_from_slice(&account.try_borrow_data()?).map_err(|_| ProgramError::InvalidAccountData)?;
    c.validate()?;pda(account, &[b"config", &c.bridge], program)?;Ok(c)
}

fn vault_floor(account: &AccountInfo, program: &Pubkey) -> Result<u64, ProgramError> {
    let data=account.try_borrow_data()?;
    if account.owner!=program || account.executable || data.len()!=16 || data[..8]!=VAULT_MAGIC {return Err(ProgramError::InvalidAccountData);}
    let floor=u64::from_le_bytes(data[8..16].try_into().map_err(|_|BAD)?);
    if floor<Rent::get()?.minimum_balance(16) {return Err(BAD);}
    Ok(floor)
}

fn upgrade_authority(program:&Pubkey, payer:&AccountInfo, executable:&AccountInfo, program_data:&AccountInfo) -> ProgramResult {
    signer(payer)?;
    if executable.key != program || !executable.executable || *executable.owner != bpf_loader_upgradeable::ID
        || *program_data.owner != bpf_loader_upgradeable::ID { return Err(ProgramError::IllegalOwner); }
    let loader:UpgradeableLoaderState=bincode::deserialize(&executable.try_borrow_data()?).map_err(|_|BAD)?;
    let upgrade:UpgradeableLoaderState=bincode::deserialize(&program_data.try_borrow_data()?).map_err(|_|BAD)?;
    match (loader,upgrade) {
        (UpgradeableLoaderState::Program{programdata_address},UpgradeableLoaderState::ProgramData{upgrade_authority_address:Some(authority),..})
            if programdata_address==*program_data.key && authority==*payer.key => Ok(()),
        _ => Err(ProgramError::MissingRequiredSignature),
    }
}

// Allocate/assign rather than create_account so an unsolicited lamport transfer
// cannot permanently grief an uninitialized PDA. Program-owned receipts cannot
// be allocated again, including when a caller changes the message contents.
fn allocate<'a>(payer: &AccountInfo<'a>, target: &AccountInfo<'a>, system_account: &AccountInfo<'a>,
    owner: &Pubkey, length: usize, seeds: &[&[u8]]) -> ProgramResult {
    signer(payer)?;assert_writable(payer)?;assert_writable(target)?;
    if *system_account.key != system_program::ID || !system_account.executable { return Err(ProgramError::IncorrectProgramId); }
    if *target.owner != system_program::ID || !target.data_is_empty() { return Err(ProgramError::AccountAlreadyInitialized); }
    let rent = Rent::get()?.minimum_balance(length);
    let needed = rent.saturating_sub(target.lamports());
    if needed > 0 { invoke(&system::transfer(payer.key, target.key, needed), &[payer.clone(),target.clone(),system_account.clone()])?; }
    invoke_signed(&system::allocate(target.key, length as u64), &[target.clone(),system_account.clone()], &[seeds])?;
    invoke_signed(&system::assign(target.key, owner), &[target.clone(),system_account.clone()], &[seeds])?;
    Ok(())
}

pub fn quorum(c: &Config, accounts: &[AccountInfo]) -> ProgramResult {
    let mut present = 0u8;
    for account in accounts {
        if account.is_signer {
            if let Some(index) = c.committee.iter().position(|key| *key == account.key.to_bytes()) { present |= 1 << index; }
        }
    }
    if present.count_ones() < c.threshold as u32 { return Err(ProgramError::MissingRequiredSignature); } Ok(())
}

fn validate_mint(mint: &AccountInfo, c: &Config) -> ProgramResult {
    if mint.key.to_bytes() != c.origin_mint || *mint.owner != spl_token_2022::ID { return Err(ProgramError::IncorrectProgramId); }
    let data = mint.try_borrow_data()?;
    let state = StateWithExtensions::<Mint>::unpack(&data)?;
    if !state.base.is_initialized || state.base.decimals != c.origin_decimals
        || state.base.mint_authority != COption::None || state.base.freeze_authority != COption::None
    { return Err(BAD); }
    // Metadata is permitted; transfer fees, hooks, delegates, pausing and other
    // balance/authority-changing extensions require a separate reviewed design.
    for ext in state.get_extension_types()? {
        if ext != ExtensionType::MetadataPointer && ext != ExtensionType::TokenMetadata { return Err(BAD); }
    }
    Ok(())
}
fn token_account(account: &AccountInfo, c: &Config, authority: &Pubkey) -> Result<u64, ProgramError> {
    if *account.owner != spl_token_2022::ID { return Err(ProgramError::IncorrectProgramId); }
    let data = account.try_borrow_data()?;
    let state = StateWithExtensions::<TokenAccount>::unpack(&data)?;
    if state.base.mint.to_bytes() != c.origin_mint || state.base.owner != *authority
        || state.base.state != AccountState::Initialized || state.base.is_native != COption::None
        || state.base.delegate != COption::None || state.base.close_authority != COption::None
        || state.get_extension_types()?.iter().any(|t| *t != ExtensionType::ImmutableOwner)
    { return Err(BAD); } Ok(state.base.amount)
}

pub fn process_instruction(program: &Pubkey, accounts: &[AccountInfo], data: &[u8]) -> ProgramResult {
    let instruction = BridgeInstruction::try_from_slice(data).map_err(|_| ProgramError::InvalidInstructionData)?;
    match instruction {
        BridgeInstruction::Initialize(c) => initialize(program, accounts, c),
        BridgeInstruction::Deposit{origin_amount,nonce,recipient} => deposit(program,accounts,origin_amount,nonce,recipient),
        BridgeInstruction::Claim(event) => claim(program,accounts,event),
        BridgeInstruction::SetPause{new_locks,settlement} => {
            let mut iter=accounts.iter(); let state=next_account_info(&mut iter)?;
            let mut c=config(state,program)?; quorum(&c,iter.as_slice())?;
            c.new_locks_paused=new_locks;c.settlement_paused=settlement;write(state,&c)
        }
        BridgeInstruction::Bootstrap{event,witness} => bootstrap(program,accounts,event,witness),
    }
}

// Accounts: payer/upgrade authority, config PDA, vault PDA, escrow token PDA
// (unused on native side), mint (unused on native side), Token-2022, System,
// executable bridge program, upgradeable ProgramData.
fn initialize(program: &Pubkey, accounts: &[AccountInfo], c: Config) -> ProgramResult {
    c.validate()?;
    if c.epoch != 1 || !c.new_locks_paused || !c.settlement_paused
        || c.outstanding != 0 || c.daily_settled != 0 || c.day != 0 { return Err(BAD); }
    let mut iter=accounts.iter();
    let payer=next_account_info(&mut iter)?;let state=next_account_info(&mut iter)?;
    let vault=next_account_info(&mut iter)?;let escrow=next_account_info(&mut iter)?;
    let mint=next_account_info(&mut iter)?;let token_program=next_account_info(&mut iter)?;
    let system_account=next_account_info(&mut iter)?;let executable=next_account_info(&mut iter)?;
    let program_data=next_account_info(&mut iter)?;signer(payer)?;
    upgrade_authority(program,payer,executable,program_data)?;
    let bump=pda(state,&[b"config",&c.bridge],program)?;
    let size=borsh::to_vec(&c).map_err(|_|BAD)?.len();
    allocate(payer,state,system_account,program,size,&[b"config",&c.bridge,&[bump]])?;
    let vault_bump=pda(vault,&[b"vault",state.key.as_ref()],program)?;
    allocate(payer,vault,system_account,program,16,&[b"vault",state.key.as_ref(),&[vault_bump]])?;
    let mut vault_data=vault.try_borrow_mut_data()?;
    vault_data[..8].copy_from_slice(&VAULT_MAGIC);
    vault_data[8..].copy_from_slice(&Rent::get()?.minimum_balance(16).to_le_bytes());
    drop(vault_data);
    if c.side==ESCROW {
        if *token_program.key!=spl_token_2022::ID || !token_program.executable { return Err(ProgramError::IncorrectProgramId); }
        validate_mint(mint,&c)?;
        let bump=pda(escrow,&[b"escrow",state.key.as_ref()],program)?;
        allocate(payer,escrow,system_account,&spl_token_2022::ID,165,&[b"escrow",state.key.as_ref(),&[bump]])?;
        invoke(&token::initialize_account3(&spl_token_2022::ID,escrow.key,mint.key,vault.key)?, &[escrow.clone(),mint.clone(),token_program.clone()])?;
    }
    write(state,&c)
}

// Accounts: depositor, config, vault, event PDA, System, source token account
// (escrow side), escrow token PDA, mint, Token-2022.
fn deposit(program:&Pubkey,accounts:&[AccountInfo],amount:u64,nonce:u64,recipient:[u8;32]) -> ProgramResult {
    let mut iter=accounts.iter();let sender=next_account_info(&mut iter)?;let state=next_account_info(&mut iter)?;
    let vault=next_account_info(&mut iter)?;let receipt=next_account_info(&mut iter)?;let system_account=next_account_info(&mut iter)?;
    signer(sender)?;let mut c=config(state,program)?;let native_amount=c.native_amount(amount)?;
    if recipient==[0;32] || (c.side==ESCROW && c.new_locks_paused) || (c.side==NATIVE && c.settlement_paused) { return Err(BAD); }
    pda(vault,&[b"vault",state.key.as_ref()],program)?;
    vault_floor(vault,program)?;
    let nonce_bytes=nonce.to_le_bytes();let bump=pda(receipt,&[b"event",state.key.as_ref(),sender.key.as_ref(),&nonce_bytes],program)?;
    let clock=Clock::get()?;
    let event=Event{magic:EVENT_MAGIC,bridge:c.bridge,source_chain:c.local_chain,destination_chain:c.remote_chain,
        source_program:program.to_bytes(),destination_program:c.remote_program,source_event:receipt.key.to_bytes(),
        sender:sender.key.to_bytes(),recipient,origin_amount:amount,nonce,slot:clock.slot,epoch:c.epoch,
        direction:if c.side==ESCROW{LOCK}else{RETURN}};
    allocate(sender,receipt,system_account,program,borsh::to_vec(&event).map_err(|_|BAD)?.len(),
        &[b"event",state.key.as_ref(),sender.key.as_ref(),&nonce_bytes,&[bump]])?;
    if c.side==ESCROW {
        let source=next_account_info(&mut iter)?;let escrow=next_account_info(&mut iter)?;
        let mint=next_account_info(&mut iter)?;let token_program=next_account_info(&mut iter)?;
        if *token_program.key!=spl_token_2022::ID || !token_program.executable {return Err(ProgramError::IncorrectProgramId);}
        pda(escrow,&[b"escrow",state.key.as_ref()],program)?;validate_mint(mint,&c)?;
        token_account(source,&c,sender.key)?;let before=token_account(escrow,&c,vault.key)?;
        invoke(&token::transfer_checked(&spl_token_2022::ID,source.key,mint.key,escrow.key,sender.key,&[],amount,c.origin_decimals)?,
            &[source.clone(),mint.clone(),escrow.clone(),sender.clone(),token_program.clone()])?;
        if token_account(escrow,&c,vault.key)?!=before.checked_add(amount).ok_or(ProgramError::ArithmeticOverflow)? {return Err(BAD);}
        c.outstanding=c.outstanding.checked_add(amount).ok_or(ProgramError::ArithmeticOverflow)?;
    } else {
        if *sender.owner!=system_program::ID || !sender.data_is_empty() {return Err(ProgramError::IllegalOwner);}
        c.outstanding=c.outstanding.checked_sub(amount).ok_or(BAD)?;
        invoke(&system::transfer(sender.key,vault.key,native_amount), &[sender.clone(),vault.clone(),system_account.clone()])?;
    }
    write(receipt,&event)?;write(state,&c)?;
    solana_program::msg!("SC_BRIDGE_EVENT {} {}",receipt.key,amount);Ok(())
}

// Accounts: rent payer, config, vault, claim PDA (source event domain), recipient,
// System, escrow token PDA, destination token account, mint, Token-2022,
// and unique committee signer accounts. On native side signers follow System.
fn claim(program:&Pubkey,accounts:&[AccountInfo],event:Event) -> ProgramResult {
    let mut iter=accounts.iter();let payer=next_account_info(&mut iter)?;let state=next_account_info(&mut iter)?;
    let vault=next_account_info(&mut iter)?;let consumed=next_account_info(&mut iter)?;
    let recipient=next_account_info(&mut iter)?;let system_account=next_account_info(&mut iter)?;
    let mut c=config(state,program)?;verify_incoming(&c,&event,program.to_bytes(),recipient.key.to_bytes())?;
    if c.settlement_paused {return Err(BAD);}
    let bump=pda(vault,&[b"vault",state.key.as_ref()],program)?;
    let protected_floor=vault_floor(vault,program)?;
    if vault.key==recipient.key {return Err(BAD);}
    let claim_bump=pda(consumed,&[b"claim",state.key.as_ref(),&event.source_event],program)?;
    let token_accounts = if c.side==ESCROW {Some((next_account_info(&mut iter)?,next_account_info(&mut iter)?,next_account_info(&mut iter)?,next_account_info(&mut iter)?))}else{None};
    quorum(&c,iter.as_slice())?;
    c.settle_limit(event.origin_amount,Clock::get()?.unix_timestamp)?;
    allocate(payer,consumed,system_account,program,32,&[b"claim",state.key.as_ref(),&event.source_event,&[claim_bump]])?;
    if let Some((escrow,destination,mint,token_program))=token_accounts {
        if *token_program.key!=spl_token_2022::ID || !token_program.executable {return Err(ProgramError::IncorrectProgramId);}
        pda(escrow,&[b"escrow",state.key.as_ref()],program)?;validate_mint(mint,&c)?;
        token_account(escrow,&c,vault.key)?;token_account(destination,&c,recipient.key)?;
        c.outstanding=c.outstanding.checked_sub(event.origin_amount).ok_or(BAD)?;
        invoke_signed(&token::transfer_checked(&spl_token_2022::ID,escrow.key,mint.key,destination.key,vault.key,&[],event.origin_amount,c.origin_decimals)?,
            &[escrow.clone(),mint.clone(),destination.clone(),vault.clone(),token_program.clone()],
            &[&[b"vault",state.key.as_ref(),&[bump]]])?;
    } else {
        assert_writable(vault)?;assert_writable(recipient)?;
        if *recipient.owner!=system_program::ID || !recipient.data_is_empty() || recipient.executable {return Err(ProgramError::IllegalOwner);}
        let amount=c.native_amount(event.origin_amount)?;
        let remaining=vault.lamports().checked_sub(amount).ok_or(ProgramError::InsufficientFunds)?;
        if remaining<protected_floor {return Err(ProgramError::InsufficientFunds);}
        let recipient_balance=recipient.lamports().checked_add(amount).ok_or(ProgramError::ArithmeticOverflow)?;
        **vault.try_borrow_mut_lamports()?=remaining;**recipient.try_borrow_mut_lamports()?=recipient_balance;
        c.outstanding=c.outstanding.checked_add(event.origin_amount).ok_or(ProgramError::ArithmeticOverflow)?;
    }
    consumed.try_borrow_mut_data()?.copy_from_slice(&event.source_event);write(state,&c)?;
    solana_program::msg!("SC_BRIDGE_CLAIM {} {}",consumed.key,event.origin_amount);Ok(())
}

// Accounts: current upgrade authority/rent payer, config, vault, normal claim
// receipt, immutable bootstrap PDA, System, executable program, ProgramData,
// then committee signers. No native units move. Source finality and complete
// inventory are attestations; this instruction cannot independently prove them.
fn bootstrap(program:&Pubkey,accounts:&[AccountInfo],event:Event,witness:BootstrapWitness) -> ProgramResult {
    let mut iter=accounts.iter();
    let payer=next_account_info(&mut iter)?;let state=next_account_info(&mut iter)?;
    let vault=next_account_info(&mut iter)?;let consumed=next_account_info(&mut iter)?;
    let record=next_account_info(&mut iter)?;let system_account=next_account_info(&mut iter)?;
    let executable=next_account_info(&mut iter)?;let program_data=next_account_info(&mut iter)?;
    let mut c=config(state,program)?;
    if c.side!=NATIVE || !c.new_locks_paused || !c.settlement_paused || c.epoch!=1
        || c.outstanding!=0 || c.day!=0 || c.daily_settled!=0 || c.committee.contains(&payer.key.to_bytes()) {return Err(BAD);}
    upgrade_authority(program,payer,executable,program_data)?;quorum(&c,iter.as_slice())?;
    pda(vault,&[b"vault",state.key.as_ref()],program)?;
    let previous=vault_floor(vault,program)?;
    let minimum=Rent::get()?.minimum_balance(16);
    if previous!=minimum || vault.lamports()!=witness.reserve_native {return Err(BAD);}
    verify_incoming(&c,&event,program.to_bytes(),vault.key.to_bytes())?;
    let protected=witness.protected_floor(&c,event.origin_amount,minimum)?;
    let claim_bump=pda(consumed,&[b"claim",state.key.as_ref(),&event.source_event],program)?;
    let boot_bump=pda(record,&[b"bootstrap",state.key.as_ref()],program)?;
    let value=BootstrapRecord{magic:BOOTSTRAP_MAGIC,witness,source_event:event.source_event,
        origin_amount:event.origin_amount,protected_native:protected};
    allocate(payer,record,system_account,program,borsh::to_vec(&value).map_err(|_|BAD)?.len(),
        &[b"bootstrap",state.key.as_ref(),&[boot_bump]])?;
    allocate(payer,consumed,system_account,program,32,
        &[b"claim",state.key.as_ref(),&event.source_event,&[claim_bump]])?;
    consumed.try_borrow_mut_data()?.copy_from_slice(&event.source_event);
    assert_writable(vault)?;
    vault.try_borrow_mut_data()?[8..16].copy_from_slice(&protected.to_le_bytes());
    c.outstanding=event.origin_amount;
    write(record,&value)?;write(state,&c)?;
    solana_program::msg!("SC_BRIDGE_BOOTSTRAP {} {}",record.key,event.origin_amount);Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn duplicate_signers_cannot_form_quorum() {
        let c=state::tests::config(NATIVE);let key=Pubkey::new_from_array(c.committee[0]);let owner=system_program::ID;
        let mut lamports=1;let mut bytes=[];
        let account=AccountInfo::new(&key,true,false,&mut lamports,&mut bytes,&owner,false);
        assert!(quorum(&c,&[account.clone(),account.clone(),account]).is_err());
    }
    #[test] fn unsigned_committee_member_does_not_count() {
        let c=state::tests::config(NATIVE);let keys=c.committee.map(Pubkey::new_from_array);let owner=system_program::ID;
        let mut l=[1;3];let mut d=[[],[],[]];
        let accounts:Vec<_>=keys[..3].iter().zip(l.iter_mut()).zip(d.iter_mut()).enumerate()
            .map(|(i,((key,l),d))|AccountInfo::new(key,i!=2,false,l,d,&owner,false)).collect();
        assert!(quorum(&c,&accounts).is_err());
    }
}
