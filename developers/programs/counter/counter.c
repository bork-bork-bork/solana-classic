#include <solana_sdk.h>

// State: authority public key (32 bytes), exact little-endian counter (8 bytes).
// Instruction 0 initializes a newly allocated zeroed account; 1 increments it.
uint64_t entrypoint(const uint8_t *input) {
    SolAccountInfo accounts[2];
    SolParameters params = {.ka = accounts};
    if (!sol_deserialize(input, &params, 2) || params.ka_num != 2 || params.data_len != 1) return 1;
    SolAccountInfo *state = &accounts[0], *authority = &accounts[1];
    if (!state->is_writable || !authority->is_signer || state->data_len != 40 || !SolPubkey_same(state->owner, params.program_id)) return 2;
    if (params.data[0] == 0) {
        for (int i = 0; i < 40; i++) if (state->data[i] != 0) return 3;
        for (int i = 0; i < 32; i++) state->data[i] = authority->key->x[i];
        sol_log("Classic counter initialized");
        return 0;
    }
    if (params.data[0] != 1) return 4;
    for (int i = 0; i < 32; i++) if (state->data[i] != authority->key->x[i]) return 5;
    bool overflow = true;
    for (int i = 32; i < 40; i++) if (state->data[i] != 255) overflow = false;
    if (overflow) return 6;
    for (int i = 32; i < 40; i++) { state->data[i]++; if (state->data[i] != 0) break; }
    sol_log("Classic counter incremented");
    return 0;
}
