use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::program_error::ProgramError;
use solana_program::pubkey::Pubkey;

pub const CONFIG_MAGIC: [u8; 8] = *b"SCCFG001";
pub const EVENT_MAGIC: [u8; 8] = *b"SCEVT001";
pub const ESCROW: u8 = 0;
pub const NATIVE: u8 = 1;
pub const LOCK: u8 = 0;
pub const RETURN: u8 = 1;
pub const BAD: ProgramError = ProgramError::InvalidArgument;

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct Config {
    pub magic: [u8; 8],
    pub bridge: [u8; 32],
    pub local_chain: [u8; 32],
    pub remote_chain: [u8; 32],
    pub remote_program: [u8; 32],
    pub origin_mint: [u8; 32],
    pub committee: [[u8; 32]; 5],
    pub origin_decimals: u8,
    pub native_decimals: u8,
    pub side: u8,
    pub threshold: u8,
    pub epoch: u64,
    pub new_locks_paused: bool,
    pub settlement_paused: bool,
    pub transfer_limit: u64,
    pub daily_limit: u64,
    pub day: u64,
    pub daily_settled: u64,
    pub outstanding: u64,
}

impl Config {
    pub fn validate(&self) -> Result<(), ProgramError> {
        if self.magic != CONFIG_MAGIC || self.side > NATIVE || self.threshold != 3
            || self.native_decimals != 9 || self.origin_decimals > 9
            || self.transfer_limit == 0 || self.daily_limit < self.transfer_limit
            || self.bridge == [0; 32] || self.local_chain == [0; 32]
            || self.remote_chain == [0; 32] || self.local_chain == self.remote_chain
            || self.origin_mint == [0; 32] || self.remote_program == [0; 32]
        { return Err(BAD); }
        for (i, key) in self.committee.iter().enumerate() {
            if *key == [0; 32] || self.committee[..i].contains(key) { return Err(BAD); }
        }
        Ok(())
    }
    pub fn native_amount(&self, origin_amount: u64) -> Result<u64, ProgramError> {
        if origin_amount == 0 || origin_amount > self.transfer_limit { return Err(BAD); }
        origin_amount.checked_mul(10u64.pow((self.native_decimals - self.origin_decimals) as u32))
            .ok_or(ProgramError::ArithmeticOverflow)
    }
    pub fn settle_limit(&mut self, amount: u64, timestamp: i64) -> Result<(), ProgramError> {
        if timestamp < 0 { return Err(BAD); }
        let day = timestamp as u64 / 86_400;
        if day < self.day { return Err(BAD); }
        if day > self.day { self.day = day; self.daily_settled = 0; }
        let total = self.daily_settled.checked_add(amount).ok_or(ProgramError::ArithmeticOverflow)?;
        if amount == 0 || amount > self.transfer_limit || total > self.daily_limit { return Err(BAD); }
        self.daily_settled = total;
        Ok(())
    }
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct Event {
    pub magic: [u8; 8],
    pub bridge: [u8; 32],
    pub source_chain: [u8; 32],
    pub destination_chain: [u8; 32],
    pub source_program: [u8; 32],
    pub destination_program: [u8; 32],
    pub source_event: [u8; 32],
    pub sender: [u8; 32],
    pub recipient: [u8; 32],
    pub origin_amount: u64,
    pub nonce: u64,
    pub slot: u64,
    pub epoch: u64,
    pub direction: u8,
}

pub fn verify_incoming(config: &Config, event: &Event, program: [u8; 32], recipient: [u8; 32]) -> Result<(), ProgramError> {
    config.validate()?;
    if event.magic != EVENT_MAGIC || event.bridge != config.bridge
        || event.source_chain != config.remote_chain || event.destination_chain != config.local_chain
        || event.source_program != config.remote_program || event.destination_program != program
        || event.source_event == [0; 32] || event.sender == [0; 32]
        || event.recipient == [0; 32] || event.recipient != recipient
        || event.slot == 0 || event.epoch != config.epoch
        || event.direction != if config.side == NATIVE { LOCK } else { RETURN }
    { return Err(BAD); }
    config.native_amount(event.origin_amount)?;
    let source_program=Pubkey::new_from_array(event.source_program);
    let source_config=Pubkey::find_program_address(&[b"config",&event.bridge],&source_program).0;
    let source_event=Pubkey::find_program_address(&[b"event",source_config.as_ref(),&event.sender,&event.nonce.to_le_bytes()],&source_program).0;
    if source_event.to_bytes()!=event.source_event {return Err(ProgramError::InvalidSeeds);}
    Ok(())
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Debug)]
pub enum BridgeInstruction {
    Initialize(Config),
    Deposit { origin_amount: u64, nonce: u64, recipient: [u8; 32] },
    Claim(Event),
    SetPause { new_locks: bool, settlement: bool },
}

#[cfg(test)]
pub mod tests {
    use super::*;
    pub fn config(side: u8) -> Config { Config {
        magic: CONFIG_MAGIC, bridge: [1; 32], local_chain: [2; 32], remote_chain: [3; 32],
        remote_program: [4; 32], origin_mint: [5; 32], committee: [[11;32],[12;32],[13;32],[14;32],[15;32]],
        origin_decimals: 6, native_decimals: 9, side, threshold: 3, epoch: 1,
        new_locks_paused: true, settlement_paused: true, transfer_limit: 1_000_000,
        daily_limit: 3_000_000, day: 0, daily_settled: 0, outstanding: 0,
    }}
    pub fn event(c: &Config) -> Event {
        let program=Pubkey::new_from_array(c.remote_program);
        let source_config=Pubkey::find_program_address(&[b"config",&c.bridge],&program).0;
        let source_event=Pubkey::find_program_address(&[b"event",source_config.as_ref(),&[8;32],&1u64.to_le_bytes()],&program).0;
        Event {
        magic: EVENT_MAGIC, bridge:c.bridge, source_chain:c.remote_chain, destination_chain:c.local_chain,
        source_program:c.remote_program, destination_program:[6;32], source_event:source_event.to_bytes(), sender:[8;32],
        recipient:[9;32], origin_amount:1_000_000, nonce:1, slot:42, epoch:c.epoch,
        direction: if c.side == NATIVE { LOCK } else { RETURN },
    }}
    #[test] fn exact_display_units_and_overflow() {
        let mut c=config(NATIVE); assert_eq!(c.native_amount(1_000_000).unwrap(),1_000_000_000);
        assert_eq!(c.native_amount(1).unwrap(),1_000); assert!(c.native_amount(0).is_err());
        c.transfer_limit=u64::MAX; assert!(c.native_amount(u64::MAX).is_err());
    }
    #[test] fn malicious_domains_and_recipients_fail() {
        let c=config(NATIVE);let e=event(&c);verify_incoming(&c,&e,[6;32],[9;32]).unwrap();
        for field in 0..10 { let mut changed=e.clone();match field {
            0=>changed.source_chain=[90;32],1=>changed.destination_chain=[90;32],
            2=>changed.source_program=[90;32],3=>changed.destination_program=[90;32],
            4=>changed.recipient=[90;32],5=>changed.bridge=[90;32],6=>changed.direction=RETURN,
            7=>changed.epoch+=1,8=>changed.slot=0,_=>changed.origin_amount=0,
        };assert!(verify_incoming(&c,&changed,[6;32],[9;32]).is_err()); }
    }
    #[test] fn limits_do_not_allow_rounding_or_day_rollback() {
        let mut c=config(NATIVE); for _ in 0..3 {c.settle_limit(1_000_000,86_400).unwrap();}
        assert!(c.settle_limit(1,86_400).is_err());c.settle_limit(1,172_800).unwrap();
        assert!(c.settle_limit(1,86_400).is_err());assert!(c.settle_limit(1,-1).is_err());
    }
    #[test] fn committee_and_precision_are_fixed() {
        let mut c=config(NATIVE);c.validate().unwrap(); c.committee[4]=c.committee[0];assert!(c.validate().is_err());
        let mut c=config(NATIVE);c.threshold=2;assert!(c.validate().is_err());
        let mut c=config(NATIVE);c.origin_decimals=10;assert!(c.validate().is_err());
    }
    #[test] fn codec_roundtrip_rejects_trailing_bytes() {
        let c=config(NATIVE);let mut data=borsh::to_vec(&c).unwrap();assert_eq!(Config::try_from_slice(&data).unwrap(),c);
        data.push(0);assert!(Config::try_from_slice(&data).is_err());
    }
}
